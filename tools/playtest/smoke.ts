/** 빠른 스모크 테스트: 타이틀 → 새 게임 → 거점 → 첫 전투 진입 */
import { launch, openGame } from './harness';

const ctx = await launch();
try {
  await openGame(ctx);
  await ctx.shot('s01_title');
  await ctx.page.keyboard.press('Enter');
  await ctx.page.waitForTimeout(300);
  await ctx.shot('s02_difficulty');
  await ctx.page.keyboard.press('Enter');
  await ctx.ev(`(__eb.settings({ textSpeed: 'instant' }), __eb.bot.enable())`);
  await ctx.waitFor('거점 도착', (s) => s.scene === 'field' && s.map === 'hub' && !s.busy && s.modals === 0);
  await ctx.shot('s03_hub');
  await ctx.ev(`__eb.goto('meadow', 'west')`);
  await ctx.waitFor('초원', (s) => s.map === 'meadow' && !s.busy && s.modals === 0);
  await ctx.shot('s04_meadow');
  await ctx.ev(`__eb.fight('en_tut1')`);
  await ctx.waitFor('전투 선택', (s) => s.scene === 'battle' && s.battle?.phase === 'enemy' || s.battle?.phase === 'act');
  await ctx.page.waitForTimeout(400);
  await ctx.shot('s05_battle');
  await ctx.waitFor('전투 종료', (s) => s.scene === 'field' && !s.busy, 180000);
  await ctx.shot('s06_after');
  const st = await ctx.state();
  ctx.log(`레벨 ${JSON.stringify(st.levels)} 통계 ${JSON.stringify(st.stats)}`);
} catch (e) {
  console.error(String(e));
  await ctx.shot('s99_error').catch(() => {});
  process.exitCode = 1;
} finally {
  if (ctx.errors.length) { console.error('브라우저 오류:'); ctx.errors.slice(0, 20).forEach((e) => console.error('  ' + e)); process.exitCode = 1; }
  await ctx.close();
}
