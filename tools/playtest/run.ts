/**
 * 전체 진행 플레이테스트 (실제 브라우저).
 * 긴 이동은 디버그 이동(goto/warp)으로 줄이지만, 전투는 실제 규칙과 입력 판정을 거친다
 * (봇이 타임스탬프가 찍힌 입력을 같은 입력 경로로 넣는다 — 자동 승리 없음).
 *
 * 사용: npm run build && npx tsx tools/playtest/run.ts [--speed=2] [--diff=normal]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openGame, OUT, Ctx } from './harness';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const SPEED = Number(arg('speed', '2'));
const DIFF = arg('diff', 'normal');
const MISS = Number(arg('miss', '0.08'));
const BOT = `__eb.bot.enable({ missRate: ${MISS}, heal: true })`;

interface StepResult { name: string; ok: boolean; ms: number; note?: string }
const results: StepResult[] = [];
const shots = new Set<string>();

let ctx: Ctx;

async function step(name: string, fn: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now();
  ctx.log(`▶ ${name}`);
  try {
    const note = (await fn()) ?? undefined;
    results.push({ name, ok: true, ms: Date.now() - t0, note });
    ctx.log(`✔ ${name}${note ? ` — ${note}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, note: String(e).slice(0, 800) });
    ctx.log(`✘ ${name}: ${String(e).slice(0, 800)}`);
    await ctx.shot(`fail_${results.length}`).catch(() => {});
    throw e;
  }
}

async function shotOnce(name: string): Promise<void> {
  if (shots.has(name)) return;
  shots.add(name);
  await ctx.shot(name);
}

const idle = (s: any) => s.scene === 'field' && !s.busy && s.modals === 0 && !s.fading;

async function settle(): Promise<any> {
  return ctx.waitFor('필드 대기', idle, 60000);
}

async function goto(map: string, spawn: string): Promise<void> {
  await ctx.ev(`__eb.goto(${JSON.stringify(map)}, ${JSON.stringify(spawn)})`);
  await ctx.waitFor(`${map} 도착`, (s) => s.map === map && idle(s), 60000);
}

async function interact(id: string, closeAfter = false): Promise<void> {
  const ok = await ctx.ev<boolean>(`__eb.interact(${JSON.stringify(id)})`);
  if (!ok) throw new Error(`상호작용 실패: ${id}`);
  await ctx.page.waitForTimeout(250);
  if (closeAfter) await ctx.ev(`__eb.closeModals()`);
  await settle();
}

/** 전투 1회. 패배 시 휴식 지점 복귀 후 다시 시도 (최대 tries) */
async function fight(id: string, opts: { tries?: number; shotPrefix?: string } = {}): Promise<string> {
  const tries = opts.tries ?? 3;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const s0 = await ctx.state();
    const map = s0.map;
    const ok = await ctx.ev<boolean>(`__eb.fight(${JSON.stringify(id)})`);
    if (!ok) throw new Error(`전투 시작 실패: ${id}`);
    await ctx.waitFor(`${id} 전투 진입`, (s) => s.scene === 'battle', 60000);
    const t0 = Date.now();
    let last: any = null;
    let lastBattle: any = null;
    let prevPhase = 1;
    let sig = '', sigAt = Date.now();
    for (;;) {
      last = await ctx.state();
      const b = last.battle;
      if (b) lastBattle = b;
      if (last.scene === 'field' && idle(last)) break;
      const nsig = JSON.stringify([last.scene, last.modal, b?.phase, b?.turns, b?.react, b?.timing, b?.aim]);
      if (nsig !== sig) { sig = nsig; sigAt = Date.now(); }
      else if (Date.now() - sigAt > 25000) throw new Error(`진행 멈춤 ${id}: ${nsig} ${JSON.stringify(b?.enemies)}`);
      if (b) {
        if (b.react) await shotOnce('v04_battle_react');
        if (b.phase === 'aim') await shotOnce('v05_aim');
        if (b.phase === 'counter') await shotOnce('v06_counter');
        if (b.enemies.some((e: any) => e.broken && e.alive)) await shotOnce('v07_break');
        if (b.group.endsWith('_boss') && b.phase === 'enemy' && b.react) await shotOnce(`v08_guardian_${b.group}`);
        const ph = Math.max(...b.enemies.map((e: any) => e.phase));
        if (ph > prevPhase) { prevPhase = ph; await ctx.page.waitForTimeout(250); await shotOnce(`v09_final_phase${ph}`); }
        if (b.over === 'defeat' && last.modal === '패배') {
          await shotOnce('v11_defeat');
          ctx.log(`  패배 (${id}, 시도 ${attempt}) — 휴식 지점으로`);
          await ctx.page.keyboard.press('ArrowDown');
          await ctx.page.keyboard.press('Enter');
          await settle();
          break;
        }
        if (b.over === 'victory' && last.modal === '승리') await shotOnce('v12_battle_result');
      }
      if (Date.now() - t0 > 420000) throw new Error(`전투 시간 초과 ${id}: ${JSON.stringify(b)}`);
      await ctx.page.waitForTimeout(100);
    }
    await settle();
    const after = await ctx.state();
    if (after.flags[`def:${id}`]) return `${id} 승리 (행동 ${lastBattle?.turns ?? '?'}회, 시도 ${attempt}, Lv ${Object.values(after.levels).join('/')})`;
    if (after.map !== map) throw new Error(`${id}: 패배 후 ${after.map}로 돌아감 (재도전 경로 없음)`);
  }
  throw new Error(`${id}: ${tries}회 시도 모두 실패`);
}

async function main(): Promise<void> {
  ctx = await launch();
  try {
    await step('1. 타이틀에서 새 게임 시작', async () => {
      await openGame(ctx);
      await ctx.page.waitForTimeout(400);
      await shotOnce('v00_title');
      await ctx.ev(`(__eb.settings({ textSpeed: 'instant' }), __eb.debug({ speed: ${SPEED} }), ${BOT})`);
      await ctx.page.keyboard.press('Enter');
      await ctx.page.waitForTimeout(300);
      if (DIFF === 'story') await ctx.page.keyboard.press('ArrowUp');
      if (DIFF === 'expert') await ctx.page.keyboard.press('ArrowDown');
      await ctx.page.keyboard.press('Enter');
      const s = await ctx.waitFor('거점', (s) => s.map === 'hub' && idle(s) && s.flags.intro === 1, 60000);
      await shotOnce('v01_hub');
      return `난이도 ${DIFF}, 동료 ${s.roster.join(',')}`;
    });

    await step('2. 한국어 튜토리얼 + 첫 일반 전투 승리', async () => {
      await goto('meadow', 'west');
      await shotOnce('v02_field_meadow');
      await ctx.ev(`__eb.warp(7, 13)`);
      await ctx.waitFor('튜토리얼 대화 처리', (s) => s.flags.tut1_talk === 1 && idle(s), 30000);
      const r = await fight('en_tut1');
      const s = await ctx.state();
      if (!s.tutorials.includes('basics') || !s.tutorials.includes('dodge')) throw new Error(`튜토리얼 미표시: ${s.tutorials}`);
      return `${r} / 본 안내: ${s.tutorials.join(',')}`;
    });

    await step('초원: 패링 튜토리얼 전투, 세라 합류, 유물 획득', async () => {
      await fight('en_tut2');
      await interact('ch_m1');
      await interact('sera_camp');
      await interact('ch_m2');
      const s = await ctx.state();
      if (!s.roster.includes('sera')) throw new Error('세라 미합류');
      if (!s.relics.includes('rl_dew') || !s.relics.includes('rl_bell')) throw new Error(`유물 미획득 ${s.relics}`);
      await ctx.ev(`(__eb.equipRelic('kael', 0, 'rl_bell'), __eb.equipRelic('mira', 0, 'rl_dew'))`);
      return `동료 ${s.roster.join(',')} · 유물 ${s.relics.join(',')}`;
    });

    await step('4. 저장 후 재실행과 이어하기', async () => {
      await interact('rest_meadow', true);
      await ctx.ev(`__eb.save()`);
      const before = await ctx.state();
      await ctx.page.reload();
      await ctx.waitFor('타이틀', (s) => s.scene === 'title' && !s.fading, 30000);
      await ctx.page.waitForTimeout(300);
      await ctx.page.keyboard.press('Enter'); // 저장이 있으면 '이어하기'에 초점
      const s = await ctx.waitFor('이어하기', (s) => s.scene === 'field' && idle(s), 30000);
      await ctx.ev(`(__eb.settings({ textSpeed: 'instant' }), __eb.debug({ speed: ${SPEED} }), ${BOT})`);
      if (s.map !== before.map || !s.flags.sera_joined || !s.relics.includes('rl_bell')) throw new Error('불러온 진행이 다름');
      return `맵 ${s.map}, 플래그·유물·레벨 ${JSON.stringify(s.levels)} 유지`;
    });

    await step('11. 패배 화면 (의도적 패배 → 휴식 지점 복귀)', async () => {
      await ctx.ev(`(__eb.bot.enable({ missRate: 1, heal: false }), __eb.setHp(8))`);
      await ctx.ev(`__eb.fight('en_m3')`);
      await ctx.waitFor('패배 창', (s) => s.battle?.over === 'defeat' && s.modal === '패배', 240000);
      await ctx.page.waitForTimeout(300);
      await shotOnce('v11_defeat');
      await ctx.page.keyboard.press('ArrowDown');
      await ctx.page.keyboard.press('Enter');
      const s = await ctx.waitFor('휴식 지점 복귀', (s) => idle(s), 60000);
      await ctx.ev(BOT);
      return `복귀 위치 ${s.map} ${s.pos}, 패배 ${s.stats.defeats}회`;
    });

    await step('초원 나머지 전투', async () => {
      const notes = [await fight('en_m1'), await fight('en_m2'), await fight('en_m3')];
      await interact('ch_m3');
      return notes.join(' | ');
    });

    await step('잠긴 폐허: 상태 전투, 오린 구출(붕괴 튜토리얼)', async () => {
      await goto('ruins', 'west');
      await shotOnce('v03_ruins');
      const a = await fight('en_r1');
      await interact('rest_ruins', true);
      const b = await fight('en_r2');
      const c = await fight('en_r3');
      await ctx.ev(`__eb.warp(34, 18)`);
      await ctx.waitFor('오린 대사', (s) => idle(s), 30000);
      const d = await fight('en_orin');
      const s = await ctx.state();
      if (!s.roster.includes('orin')) throw new Error('오린 미합류');
      await interact('ch_r1');
      await interact('ch_r2');
      await interact('cr_r');
      await interact('ch_r3');
      return [a, b, c, d].join(' | ');
    });

    await step('5. 유물 숙련과 메아리 해금', async () => {
      const s = await ctx.state();
      if (!s.echoes.length) {
        await fight('en_r4');
      }
      const s2 = await ctx.state();
      if (!s2.echoes.length) throw new Error(`메아리 미해금: 숙련 ${JSON.stringify(s2.mastery)}`);
      await ctx.ev(`__eb.openMenu('relics')`);
      await ctx.page.waitForTimeout(300);
      await shotOnce('v10_relics');
      await ctx.ev(`__eb.closeModals()`);
      await ctx.ev(`__eb.openMenu('echoes')`);
      await ctx.page.waitForTimeout(300);
      await shotOnce('v10_echoes');
      await ctx.ev(`__eb.closeModals()`);
      await ctx.ev(`__eb.openMenu('skills')`);
      await ctx.page.waitForTimeout(300);
      await shotOnce('v10_skills');
      await ctx.ev(`__eb.closeModals()`);
      await ctx.ev(`__eb.toggleEcho('kael', ${JSON.stringify(s2.echoes[0])})`);
      return `메아리 ${s2.echoes.join(',')} · 숙련 ${JSON.stringify(s2.mastery)}`;
    });

    await step('7. 첫 수호자 (잿불 성소)', async () => {
      await goto('shrine_ember', 'south');
      await shotOnce('v03_shrine_ember');
      const a = await fight('en_shrine_ember_1');
      const b = await fight('en_shrine_ember_2');
      await interact('ch_shrine_ember_0');
      await interact('rest_shrine_ember', true);
      const c = await fight('boss_shrine_ember');
      const s = await ctx.state();
      if (!s.seals.includes('seal_ember')) throw new Error('잿불 봉인 없음');
      return [a, b, c].join(' | ');
    });

    await step('6. 정밀 조준 약점 명중 (유리숲)', async () => {
      await goto('hub', 'north');
      await goto('glass', 'south');
      const a = await fight('en_gtut');
      const s = await ctx.state();
      if (!(s.stats.weakHits > 0)) throw new Error('약점 명중 없음');
      const b = await fight('en_g1');
      const c = await fight('en_g2');
      await interact('ch_g1');
      await interact('ch_g2');
      return `${a} | ${b} | ${c} · 누적 약점 명중 ${s.stats.weakHits}`;
    });

    await step('두 번째 수호자 (유리 성소)', async () => {
      await goto('shrine_glass', 'south');
      const a = await fight('en_shrine_glass_1');
      const b = await fight('en_shrine_glass_2');
      await interact('rest_shrine_glass', true);
      const c = await fight('boss_shrine_glass');
      const s = await ctx.state();
      if (!s.seals.includes('seal_glass')) throw new Error('유리 봉인 없음');
      return [a, b, c].join(' | ');
    });

    await step('부서진 고원 + 숨겨진 강적', async () => {
      await goto('hub', 'west');
      await goto('plateau', 'east');
      const notes = [];
      for (const id of ['en_p1', 'en_p2', 'en_p3', 'en_p4']) notes.push(await fight(id));
      await interact('cr_p');
      notes.push(await fight('en_elite'));
      await interact('ch_p4');
      return notes.join(' | ');
    });

    await step('세 번째 수호자 (폭풍 성소)', async () => {
      await goto('shrine_storm', 'south');
      const a = await fight('en_shrine_storm_1');
      const b = await fight('en_shrine_storm_2');
      await interact('rest_shrine_storm', true);
      const c = await fight('boss_shrine_storm');
      const s = await ctx.state();
      if (!s.seals.includes('seal_storm')) throw new Error('폭풍 봉인 없음');
      return [a, b, c].join(' | ');
    });

    await step('8. 세 봉인 획득 후 최종 구역 개방', async () => {
      await goto('hub', 'west');
      await interact('rootgate');
      const s = await ctx.waitFor('심부 도착', (s) => s.map === 'depths' && idle(s), 60000);
      if (!s.flags.gate_open) throw new Error('뿌리문 미개방');
      await shotOnce('v03_depths');
      return `봉인 ${s.seals.join(',')}`;
    });

    await step('9. 최종 보스 승리 (3페이즈)', async () => {
      const a = await fight('en_d1');
      const b = await fight('en_d2');
      await interact('rest_depths', true);
      await ctx.ev(`__eb.fight('boss_final')`);
      await ctx.waitFor('최종전 진입', (s) => s.scene === 'battle', 60000);
      let prev = 1;
      let turns = 0, retries = 0;
      for (;;) {
        const s = await ctx.state();
        if (s.scene === 'ending') break;
        const bt = s.battle;
        if (bt?.over === 'defeat' && s.modal === '패배' && retries < 3) {
          retries++;
          ctx.log(`  최종전 패배 — 재시도 ${retries}`);
          await ctx.page.keyboard.press('Enter');
          await ctx.page.waitForTimeout(1500);
          prev = 1;
          continue;
        }
        if (bt) {
          turns = bt.turns;
          const ph = Math.max(...bt.enemies.map((e: any) => e.phase));
          if (ph > prev) { prev = ph; await ctx.page.waitForTimeout(300); await shotOnce(`v09_final_phase${ph}`); }
          if (bt.react) await shotOnce('v08_final_react');
          if (bt.over === 'defeat' && retries >= 3) throw new Error('최종 보스에게 3회 패배');
        }
        await ctx.page.waitForTimeout(120);
      }
      if (prev < 3) throw new Error(`페이즈 ${prev}까지만 확인됨`);
      return `${a} | ${b} | 최종전 행동 ${turns}회, 재시도 ${retries}회, 3페이즈 모두 통과`;
    });

    await step('10. 엔딩과 승리 화면', async () => {
      await ctx.page.waitForTimeout(1500);
      await shotOnce('v13_ending');
      await ctx.waitFor('승리 화면', (s) => s.modal === '승리', 90000);
      await ctx.page.waitForTimeout(400);
      await shotOnce('v14_victory');
      const s = await ctx.state();
      await ctx.page.keyboard.press('Enter');
      await ctx.waitFor('크레디트', (s) => s.modal === '크레디트', 20000);
      await shotOnce('v15_credits');
      await ctx.page.keyboard.press('Enter');
      await ctx.waitFor('타이틀 복귀', (s) => s.scene === 'title', 30000);
      return `결말 ${s.ending} · 통계 ${JSON.stringify(s.stats)} · 레벨 ${JSON.stringify(s.levels)}`;
    });
  } catch {
    /* 이미 기록됨 */
  } finally {
    const errs = ctx.errors;
    writeFileSync(join(OUT, 'report.json'), JSON.stringify({ speed: SPEED, difficulty: DIFF, results, errors: errs, shots: [...shots] }, null, 2));
    console.log('\n===== 플레이테스트 결과 =====');
    for (const r of results) console.log(`${r.ok ? '통과' : '실패'}  ${r.name}  (${(r.ms / 1000).toFixed(1)}s)${r.note ? `\n      ${r.note}` : ''}`);
    console.log(`브라우저 오류 ${errs.length}건${errs.length ? ':\n  ' + errs.slice(0, 15).join('\n  ') : ''}`);
    if (results.some((r) => !r.ok) || errs.length) process.exitCode = 1;
    await ctx.close();
  }
}

await main();
