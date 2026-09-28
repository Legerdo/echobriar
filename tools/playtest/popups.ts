/** 전투 문구 겹침 확인: 연속 패링 도중과 붕괴 직후 화면을 여러 장 캡처한다 */
import { launch, openGame } from './harness';

const ctx = await launch();
try {
  await openGame(ctx);
  await ctx.page.keyboard.press('Enter');
  await ctx.page.waitForTimeout(300);
  await ctx.page.keyboard.press('Enter');
  await ctx.ev(`(__eb.settings({ textSpeed: 'instant' }), __eb.bot.enable({ missRate: 0, dodgeRate: 0 }))`);
  await ctx.waitFor('거점', (s) => s.map === 'hub' && s.scene === 'field' && !s.busy && s.modals === 0);
  await ctx.ev(`__eb.goto('meadow', 'west')`);
  await ctx.waitFor('초원', (s) => s.map === 'meadow' && !s.busy && s.modals === 0);
  let parryShots = 0, breakShots = 0, readyShots = 0, lastParry = 0;
  for (const id of ['en_m1', 'en_tut2', 'en_m2', 'en_m3']) {
    let wasReady = false;
    await ctx.ev(`__eb.fight(${JSON.stringify(id)})`);
    await ctx.waitFor('전투', (s) => s.scene === 'battle', 30000);
    const t0 = Date.now();
    let wasBroken = false;
    for (;;) {
      const s = await ctx.state();
      if (s.scene === 'field' && !s.busy && s.modals === 0) break;
      const b = s.battle;
      if (b) {
        if (b.stats.perfectParries > lastParry && parryShots < 4) {
          lastParry = b.stats.perfectParries;
          await ctx.page.waitForTimeout(90);
          await ctx.shot(`p_parry_${++parryShots}`);
        }
        const broken = b.enemies.some((e: any) => e.broken && e.alive);
        if (broken && !wasBroken && breakShots < 3) {
          await ctx.page.waitForTimeout(120);
          await ctx.shot(`p_break_${++breakShots}`);
        }
        wasBroken = broken;
        const ready = b.enemies.some((e: any) => e.ready && e.alive);
        if (ready && !wasReady && readyShots < 2) {
          await ctx.page.waitForTimeout(150);
          await ctx.shot(`p_ready_${++readyShots}`);
        }
        wasReady = ready;
      }
      if (Date.now() - t0 > 180000) throw new Error('전투 시간 초과');
      await ctx.page.waitForTimeout(40);
    }
  }
  ctx.log(`패링 ${parryShots}장, 붕괴 가능 ${readyShots}장, 붕괴 ${breakShots}장`);
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
} finally {
  if (ctx.errors.length) { ctx.errors.slice(0, 10).forEach((e) => console.error('  ' + e)); process.exitCode = 1; }
  await ctx.close();
}
