/**
 * 배포된 사이트 확인: 자원 로드 → 타이틀 → 새 게임 → 첫 전투 승리.
 * 사용: npx tsx tools/playtest/live.ts [URL]
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { OUT } from './harness';

const URL = process.argv[2] ?? 'https://legerdo.github.io/echobriar/';
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors: string[] = [];
const failed: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
const state = () => page.evaluate(() => (window as any).__eb?.state());
async function waitFor(desc: string, fn: (s: any) => boolean, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await state().catch(() => null);
    if (s && fn(s)) return s;
    await page.waitForTimeout(150);
  }
  throw new Error(`시간 초과: ${desc}`);
}
try {
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  await waitFor('타이틀', (s) => s.scene === 'title' && !s.fading);
  console.log(`타이틀 도착 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.screenshot({ path: join(OUT, 'live_title.png') });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.evaluate(() => { const eb = (window as any).__eb; eb.settings({ textSpeed: 'instant' }); eb.bot.enable({ missRate: 0.1 }); });
  await waitFor('거점', (s) => s.map === 'hub' && s.scene === 'field' && !s.busy && s.modals === 0);
  await page.evaluate(() => (window as any).__eb.goto('meadow', 'west'));
  await waitFor('초원', (s) => s.map === 'meadow' && !s.busy && s.modals === 0);
  await page.evaluate(() => (window as any).__eb.fight('en_tut1'));
  await waitFor('전투', (s) => s.scene === 'battle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, 'live_battle.png') });
  const s = await waitFor('전투 종료', (s) => s.scene === 'field' && !s.busy && s.modals === 0, 180000);
  console.log(`첫 전투 승리: ${!!s.flags['def:en_tut1']} · 전투 ${s.stats.battles}회`);
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
} finally {
  console.log(`실패한 요청 ${failed.length}건${failed.length ? '\n  ' + failed.join('\n  ') : ''}`);
  console.log(`브라우저 오류 ${errors.length}건${errors.length ? '\n  ' + errors.slice(0, 10).join('\n  ') : ''}`);
  if (failed.length || errors.length) process.exitCode = 1;
  await browser.close();
}
