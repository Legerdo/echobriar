/**
 * 브라우저 플레이테스트 공용 도구: vite preview 서버 + 설치된 Chrome(playwright-core).
 * 스크린샷은 960×540 (정수 배율 2)로 저장한다.
 */
import { spawn, ChildProcess } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, Browser, Page } from 'playwright-core';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = join(ROOT, 'tools', 'playtest', 'out');
/** 다른 로컬 서버(기본 4173 등)와 겹치지 않는 전용 포트 */
const PORT = Number(process.env.EB_PORT ?? 4391);
export const URL_BASE = `http://localhost:${PORT}/`;

const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => p && existsSync(p));

export interface Ctx {
  server: ChildProcess;
  browser: Browser;
  page: Page;
  errors: string[];
  log: (s: string) => void;
  shot: (name: string) => Promise<void>;
  state: () => Promise<any>;
  ev: <T>(fn: string) => Promise<T>;
  waitFor: (desc: string, fn: (s: any) => boolean, ms?: number) => Promise<any>;
  close: () => Promise<void>;
}

async function waitHttp(url: string, ms = 30000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const html = await r.text();
        if (!html.includes('에코브라이어')) throw new Error(`${url} 에서 다른 앱이 응답합니다 — EB_PORT로 다른 포트를 지정하세요`);
        return;
      }
    } catch (e) {
      if (String(e).includes('다른 앱')) throw e;
      /* 재시도 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('미리보기 서버가 응답하지 않습니다');
}

export async function launch(): Promise<Ctx> {
  if (!CHROME) throw new Error('Chrome/Edge 실행 파일을 찾지 못했습니다 (CHROME_PATH 지정 가능)');
  mkdirSync(OUT, { recursive: true });
  const server = spawn(`npx vite preview --port ${PORT} --strictPort`, { cwd: ROOT, shell: true, stdio: 'ignore' });
  await waitHttp(URL_BASE);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[page] ${e.message}`));
  const t0 = Date.now();
  const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${s}`);
  const ctx: Ctx = {
    server, browser, page, errors, log,
    shot: async (name) => { await page.screenshot({ path: join(OUT, `${name}.png`) }); log(`스크린샷 ${name}.png`); },
    state: () => page.evaluate(() => (window as any).__eb?.state()),
    ev: (fn) => page.evaluate(fn) as Promise<any>,
    waitFor: async (desc, fn, ms = 120000) => {
      const start = Date.now();
      let last: any = null;
      while (Date.now() - start < ms) {
        last = await ctx.state().catch(() => null);
        if (last && fn(last)) return last;
        await page.waitForTimeout(120);
      }
      throw new Error(`시간 초과: ${desc}\n마지막 상태: ${JSON.stringify(last && { scene: last.scene, map: last.map, modal: last.modal, busy: last.busy, battle: last.battle && { phase: last.battle.phase, over: last.battle.over, enemies: last.battle.enemies, allies: last.battle.allies } })}`);
    },
    close: async () => {
      await browser.close().catch(() => {});
      if (process.platform === 'win32' && server.pid) spawn(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: 'ignore' });
      else server.kill();
    },
  };
  return ctx;
}

export async function openGame(ctx: Ctx, query = '?debug=1'): Promise<void> {
  await ctx.page.goto(URL_BASE + query);
  await ctx.waitFor('타이틀 화면', (s) => s.scene === 'title' && !s.fading, 30000);
}
