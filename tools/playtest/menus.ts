/**
 * 전투 명령 메뉴를 실제 키 입력으로 조작하는 검증 (봇은 방어·타이밍만 담당).
 * 명령 → 기술 목록 → 대상 선택 → 공격 타이밍, 조사 창, 일시정지 → 설정, UI 배율 1.5를 확인한다.
 * 각 단계마다 기대한 창이 열렸는지 확인한 뒤 다음 키를 보낸다.
 */
import { launch, openGame } from './harness';

const ctx = await launch();
const key = async (k: string, wait = 120) => { await ctx.page.keyboard.press(k); await ctx.page.waitForTimeout(wait); };
const modal = (re: RegExp, desc: string) => ctx.waitFor(desc, (s) => re.test(s.modal ?? ''), 20000);
const checks: string[] = [];
try {
  await openGame(ctx);
  await key('Enter', 300);
  await key('Enter');
  await ctx.ev(`(__eb.settings({ textSpeed: 'instant' }), __eb.bot.enable({ missRate: 0 }), __eb.bot.manual = true)`);
  await ctx.waitFor('거점', (s) => s.map === 'hub' && s.scene === 'field' && !s.busy && s.modals === 0);
  await ctx.ev(`__eb.goto('meadow', 'west')`);
  await ctx.waitFor('초원', (s) => s.map === 'meadow' && !s.busy && s.modals === 0);
  await ctx.ev(`__eb.fight('en_tut2')`);
  await ctx.waitFor('명령 메뉴', (s) => s.battle?.phase === 'select' && /차례/.test(s.modal ?? ''), 60000);
  await ctx.page.waitForTimeout(200);
  await ctx.shot('m01_command');
  checks.push('명령 메뉴');
  // 기술 → 두 번째 기술 → 대상 선택 → 타이밍
  await key('ArrowDown');
  await key('Enter');
  await modal(/^기술$/, '기술 목록');
  await ctx.shot('m02_skills');
  await key('ArrowDown');
  await key('Enter');
  await ctx.waitFor('대상 선택', (s) => s.battle?.phase === 'target', 10000);
  await ctx.shot('m03_target');
  await key('Enter', 60);
  await ctx.waitFor('공격 타이밍', (s) => !!s.battle?.timing, 10000);
  await ctx.page.waitForTimeout(100);
  await ctx.shot('m04_timing');
  checks.push('기술 → 대상 → 타이밍');
  // 조사: 명령 메뉴 마지막 항목
  await ctx.waitFor('다음 명령 메뉴', (s) => s.battle?.phase === 'select' && /차례/.test(s.modal ?? ''), 60000);
  for (let i = 0; i < 5; i++) await key('ArrowDown', 40);
  await key('Enter');
  await ctx.waitFor('조사 대상', (s) => s.battle?.phase === 'target', 10000);
  await key('Enter');
  await modal(/빈 갑주/, '조사 창');
  await ctx.shot('m05_scan');
  checks.push('조사 창');
  await key('Enter');
  await ctx.waitFor('명령 메뉴 복귀', (s) => /차례/.test(s.modal ?? ''), 10000);
  // UI 배율 1.5
  await ctx.ev(`__eb.settings({ uiScale: 1.5 })`);
  await ctx.page.waitForTimeout(150);
  await ctx.shot('m06_command_ui150');
  await key('ArrowDown');
  await key('Enter');
  await modal(/^기술$/, '기술 목록 (1.5배)');
  await ctx.shot('m06_skills_ui150');
  checks.push('UI 배율 1.5');
  await key('Escape');
  await ctx.waitFor('명령 메뉴 복귀', (s) => /차례/.test(s.modal ?? ''), 10000);
  // 일시정지 → 설정
  await key('Escape');
  await modal(/일시정지/, '전투 일시정지');
  await ctx.shot('m07_battle_pause');
  await key('ArrowDown');
  await key('Enter');
  await modal(/^설정$/, '설정 화면');
  await ctx.page.waitForTimeout(150);
  await ctx.shot('m08_settings_ui150');
  checks.push('일시정지 → 설정');
  await ctx.ev(`__eb.settings({ uiScale: 1 })`);
  ctx.log(`확인: ${checks.join(' · ')}`);
} catch (e) {
  console.error(String(e));
  await ctx.shot('m99_error').catch(() => {});
  process.exitCode = 1;
} finally {
  if (ctx.errors.length) { console.error('브라우저 오류:'); ctx.errors.slice(0, 20).forEach((e) => console.error('  ' + e)); process.exitCode = 1; }
  await ctx.close();
}
