import { describe, it, expect } from 'vitest';
import * as B from '../src/combat/battle';
import { ReactionTracker, windowsFor, validDefense } from '../src/combat/reaction';
import { BeatTracker, gradeOffset, gradeHold, timingWindows, aggregate } from '../src/combat/timing';
import { planAttack } from '../src/combat/hits';
import { AP, BREAK, TIMELINE, DIFFICULTY } from '../src/data/config';
import { SKILLS } from '../src/data/characters';
import { ENEMIES } from '../src/data/enemies';
import { newGame, buildAllyUnit, addMastery, applyBattleMastery, equipRelic, toggleEcho, insightCap, insightUsed, grantXp, addItem } from '../src/state/game';
import type { Unit, BattleOptions } from '../src/combat/types';
import type { ManifestAnim } from '../src/art/core/sheet';

const OPTS: BattleOptions = { difficulty: 'normal', seed: 7, advantage: 'none', reactionAssist: false, autoTiming: false };

function setup(chars: ('kael' | 'mira' | 'sera' | 'orin')[] = ['kael', 'mira', 'orin'], foes = ['hollow']) {
  const s = newGame('normal');
  s.roster = ['kael', 'mira', 'sera', 'orin'];
  const allies = chars.map((c, i) => buildAllyUnit(s, c, i));
  const enemies = foes.map((id, i) => B.makeEnemy(id, 1, OPTS, `e${i}`));
  const st = B.createBattle(allies, enemies, OPTS);
  return { st, allies, enemies, save: s };
}

describe('행동력(AP)', () => {
  it('시작값·상한·턴 회복', () => {
    const { st, allies } = setup();
    const k = allies[0];
    expect(k.ap).toBe(DIFFICULTY.normal.startAp);
    B.gainAp(st, k, 50);
    expect(k.ap).toBe(AP.max);
    k.ap = 2;
    B.turnStart(st, k);
    expect(k.ap).toBe(3);
  });
  it('기본 공격은 행동력을 만들고, 완벽이면 보너스', () => {
    const { st, allies, enemies } = setup();
    const m = allies[1];
    m.ap = 0;
    B.basicAttack(st, m, enemies[0], 'good');
    expect(m.ap).toBe(AP.basicGain);
    B.basicAttack(st, m, enemies[0], 'perfect');
    expect(m.ap).toBe(AP.basicGain * 2 + AP.basicPerfectBonus);
  });
  it('비용 부족이면 사용 불가, 사용 시 차감', () => {
    const { st, allies, enemies } = setup();
    const k = allies[0];
    k.ap = 1;
    expect(B.cannotUse(st, k, SKILLS.k_rush)).not.toBeNull();
    k.ap = 5;
    expect(B.cannotUse(st, k, SKILLS.k_rush)).toBeNull();
    B.beginSkill(st, k, SKILLS.k_rush, [enemies[0]], 1);
    expect(k.ap).toBe(3);
  });
  it('한 공격에서 패링으로 얻는 행동력에 상한 (무한 루프 방지)', () => {
    const { st, allies, enemies } = setup(['mira']);
    const m = allies[0];
    m.ap = 0;
    const a = ENEMIES.hollow.attacks[0];
    for (let i = 0; i < 6; i++) B.resolveEnemyHit(st, enemies[0], m, a, 1, 'parry', false);
    expect(m.ap).toBe(AP.parryGainCapPerAttack);
    B.finishEnemyAttack(st, enemies[0]);
    B.resolveEnemyHit(st, enemies[0], m, a, 1, 'parry', false);
    expect(m.ap).toBe(AP.parryGainCapPerAttack + 1);
  });
});

describe('공격 타이밍', () => {
  const w = timingWindows('normal');
  it('완벽·성공·실패', () => {
    expect(gradeOffset(10, w)).toBe('perfect');
    expect(gradeOffset(-(w.perfect + 5), w)).toBe('good');
    expect(gradeOffset(w.good + 1, w)).toBe('fail');
    expect(gradeHold(1000, 1000, w)).toBe('perfect');
    expect(gradeHold(1400, 1000, w)).toBe('fail');
  });
  it('연속 입력: 박자마다 개별 판정, 연타는 실패', () => {
    const bt = new BeatTracker([1000, 1200, 1400], w);
    expect(bt.press(1005)).toBe(0);
    expect(bt.grades[0]).toBe('perfect');
    expect(bt.press(1030)).toBe(1); // 박자 밖 연타 → 다음 박자 실패
    expect(bt.grades[1]).toBe('fail');
    bt.advance(2000);
    expect(bt.grades[2]).toBe('fail');
    expect(bt.result()).toBe('fail');
    expect(aggregate(['perfect', 'perfect'])).toBe('perfect');
  });
  it('실패해도 기술은 약화된 효과로 발동한다', () => {
    const { st, allies, enemies } = setup();
    const e = enemies[0];
    const before = e.hp;
    const run = B.beginSkill(st, allies[0], SKILLS.k_rush, [e], 1);
    B.skillHit(st, run, e, 'fail');
    expect(e.hp).toBeLessThan(before);
  });
});

describe('회피·패링·점프', () => {
  const hits = [{ t: 500, kind: 'normal' as const, power: 1, seg: 0, windup: 0 }];
  it('회피는 넓고 패링은 좁다', () => {
    const w = windowsFor('normal', false);
    expect(w.dodge[0]).toBeGreaterThan(w.parry[0]);
    expect(w.dodge[1]).toBeGreaterThan(w.parry[1]);
    const late = w.parry[1] + 10;
    const p = new ReactionTracker(hits, w, 0);
    expect(p.press('parry', 500 + late)).toBe(-1);
    const d = new ReactionTracker(hits, w, 0);
    expect(d.press('dodge', 500 + late)).toBe(0);
    expect(d.results[0]).toBe('dodge');
  });
  it('헛누름은 잠시 잠겨 연타를 막는다', () => {
    const w = windowsFor('normal', false);
    const t = new ReactionTracker(hits, w, 0);
    expect(t.press('parry', 200)).toBe(-1);
    expect(t.press('parry', 500)).toBe(-2);
  });
  it('점프는 지면 공격만, 패링 불가 공격은 회피만', () => {
    expect(validDefense('ground', 'jump')).toBe(true);
    expect(validDefense('ground', 'dodge')).toBe(false);
    expect(validDefense('ground', 'parry')).toBe(false);
    expect(validDefense('normal', 'jump')).toBe(false);
    expect(validDefense('unblockable', 'parry')).toBe(false);
    expect(validDefense('unblockable', 'dodge')).toBe(true);
    const w = windowsFor('normal', false);
    const g = new ReactionTracker([{ t: 300, kind: 'ground', power: 1, seg: 0, windup: 0 }], w, 0);
    expect(g.press('dodge', 300)).toBe(-1);
    const g2 = new ReactionTracker([{ t: 300, kind: 'ground', power: 1, seg: 0, windup: 0 }], w, 0);
    expect(g2.press('jump', 300)).toBe(0);
  });
  it('판정은 프레임이 아니라 입력 시각으로 — 늦게 처리돼도 결과 동일', () => {
    const w = windowsFor('normal', false);
    const t = new ReactionTracker(hits, w, 0);
    // 프레임이 멈췄다가 700ms에 입력이 처리되어도 타임스탬프 505는 성공
    expect(t.press('parry', 505)).toBe(0);
  });
  it('연속 공격 완전 패링 → 반격 조건 1회, 하나라도 회피하면 없음', () => {
    const w = windowsFor('normal', false);
    const multi = [0, 1, 2].map((i) => ({ t: 400 + i * 300, kind: 'normal' as const, power: 0.5, seg: i, windup: 0 }));
    const a = new ReactionTracker(multi, w, 0);
    for (let i = 0; i < 3; i++) a.press('parry', 400 + i * 300);
    expect(a.allParried()).toBe(true);
    const b = new ReactionTracker(multi, w, 0);
    b.press('parry', 400); b.press('dodge', 700); b.press('parry', 1000);
    expect(b.allParried()).toBe(false);
    const { st, allies, enemies } = setup();
    B.counterAttack(st, allies[0], enemies[0], 3);
    expect(st.stats.counters).toBe(1);
  });
  it('회피 성공은 피해 없음, 피격은 피해', () => {
    const { st, allies, enemies } = setup(['mira']);
    const m = allies[0];
    const hp = m.hp;
    const a = ENEMIES.hollow.attacks[0];
    B.resolveEnemyHit(st, enemies[0], m, a, 1, 'dodge', false);
    expect(m.hp).toBe(hp);
    B.resolveEnemyHit(st, enemies[0], m, a, 1, 'hit', false);
    expect(m.hp).toBeLessThan(hp);
  });
  it('공격 계획의 타격 시각은 애니메이션 contact 프레임에서 파생', () => {
    const anim: ManifestAnim = { frames: [0, 1, 2, 3], durations: [100, 100, 50, 100], loop: false, tags: ['anticipation', 'hold', 'contact', 'recovery'], attach: [], weak: [], airborne: false };
    const plan = planAttack({ id: 'x', name: 'x', kind: 'normal', power: 1, target: 'one', segs: [{ anim: 'a' }, { anim: 'a', gap: 200, hold: 300 }] }, { a: anim }, false);
    expect(plan.hits.map((h) => h.t)).toEqual([200, 350 + 200 + 200 + 300]);
  });
});

describe('붕괴', () => {
  it('게이지가 차면 붕괴 가능, 붕괴 기술로 발동', () => {
    const { st, allies, enemies } = setup();
    const e = enemies[0];
    B.addBreak(st, e, e.brkMax);
    expect(e.breakReady).toBe(true);
    const next = e.next;
    const max = e.brkMax;
    e.charging = { attack: 'cleave', turns: 1 };
    expect(B.triggerBreak(st, allies[0], e)).toBe(true);
    expect(e.brokenTurns).toBe(1);
    expect(e.charging).toBeNull();
    expect(e.next).toBeGreaterThan(next);
    expect(e.brkMax).toBe(Math.round(max * (1 + BREAK.growth)));
    // 붕괴 중에는 게이지가 쌓이지 않고, 다음 턴을 건너뛴 뒤 회복
    B.addBreak(st, e, 999);
    expect(e.breakReady).toBe(false);
    expect(B.turnStart(st, e).skip).toBe(true);
    expect(e.brokenTurns).toBe(0);
    expect(e.brk).toBe(0);
  });
  it('붕괴 상태의 적은 더 큰 피해를 받는다', () => {
    const { st, allies, enemies } = setup();
    const e = enemies[0];
    const a = B.calcOutgoing(st, allies[0], e, { power: 1, brk: 0, grade: 'good', noVariance: true }).dmg;
    e.brokenTurns = 1;
    const b = B.calcOutgoing(st, allies[0], e, { power: 1, brk: 0, grade: 'good', noVariance: true }).dmg;
    expect(b).toBeGreaterThan(a);
  });
  it('붕괴가 갑주를 벗긴다 (정밀 조준만이 해법이 아님)', () => {
    const { st, allies, enemies } = setup(['kael'], ['shellbeast']);
    const e = enemies[0];
    const def = e.def;
    B.addBreak(st, e, e.brkMax);
    B.triggerBreak(st, allies[0], e);
    expect(e.parts).toContain('shell');
    expect(e.def).toBeLessThan(def);
    expect(e.sheetOverride).toBe('shellbeast_broken');
  });
});

describe('타임라인과 상태', () => {
  it('둔화는 뒤로, 가속은 앞으로', () => {
    const { st, enemies, allies } = setup();
    const e = enemies[0];
    const n = e.next;
    const d = B.delay(e);
    B.addStatus(st, e, 'slow', 2);
    expect(e.next).toBe(n + TIMELINE.slowPush);
    expect(B.delay(e)).toBeCloseTo(d * TIMELINE.slow);
    const k = allies[0];
    k.next = 200;
    st.time = 0;
    B.addStatus(st, k, 'haste', 2);
    expect(k.next).toBe(200 - TIMELINE.hastePull);
  });
  it('상태는 턴 종료마다 줄고 만료된다', () => {
    const { st, enemies } = setup();
    const e = enemies[0];
    B.addStatus(st, e, 'daze', 2);
    B.beginTurn(st, e); B.endTurn(st, e);
    expect(B.hasS(e, 'daze')).toBe(true);
    B.beginTurn(st, e); B.endTurn(st, e);
    expect(B.hasS(e, 'daze')).toBe(false);
  });
  it('보호막은 고정량 흡수', () => {
    const { st, allies, enemies } = setup(['orin']);
    const o = allies[0];
    B.addStatus(st, o, 'shield', 3, 30);
    const hp = o.hp;
    B.hurtAlly(st, enemies[0], o, 20);
    expect(o.hp).toBe(hp);
    B.hurtAlly(st, enemies[0], o, 20);
    expect(o.hp).toBe(hp - 10);
  });
  it('화상은 턴 시작 피해', () => {
    const { st, enemies } = setup();
    const e = enemies[0];
    B.addStatus(st, e, 'burn', 2, 15);
    const hp = e.hp;
    B.turnStart(st, e);
    expect(e.hp).toBe(hp - 15);
  });
});

describe('고유 자원', () => {
  it('카엘: 기술이 자세를 바꾸고 흐름 자세는 비용 -1', () => {
    const { st, allies, enemies } = setup();
    const k = allies[0];
    k.ap = 10;
    const run = B.beginSkill(st, k, SKILLS.k_flow, [enemies[0]], 3);
    B.finishSkill(st, run, 'good');
    expect(k.stance).toBe('flow');
    expect(B.skillCost(k, SKILLS.k_shatter)).toBe(SKILLS.k_shatter.ap - 1);
    expect(k.stancesUsed).toContain('flow');
  });
  it('미라: 인장 생성·상한·조합 소비', () => {
    const { st, allies, enemies } = setup();
    const m = allies[1];
    m.ap = 10;
    B.finishSkill(st, B.beginSkill(st, m, SKILLS.m_fire, [enemies[0]], 1), 'good');
    // 잔불 지팡이: 같은 인장 하나 더
    expect(m.sigils).toEqual(['fire', 'fire']);
    expect(B.cannotUse(st, m, SKILLS.m_steam)).not.toBeNull();
    B.finishSkill(st, B.beginSkill(st, m, SKILLS.m_tide, [enemies[0]], 1), 'good');
    expect(m.sigils.length).toBe(3);
    expect(B.cannotUse(st, m, SKILLS.m_steam)).toBeNull();
    B.beginSkill(st, m, SKILLS.m_steam, [enemies[0]], 1);
    expect(m.sigils).toEqual(['tide']);
  });
  it('오린: 충전 획득·상한·전부 소비', () => {
    const { st, allies, enemies } = setup();
    const o = allies[2];
    o.charge = 0;
    for (let i = 0; i < 9; i++) B.basicAttack(st, o, enemies[0], 'good');
    expect(o.charge).toBe(o.chargeMax);
    o.ap = 10;
    const run = B.beginSkill(st, o, SKILLS.o_cannon, [enemies[0]], 1);
    expect(o.charge).toBe(0);
    expect(run.chargesUsed).toBe(o.chargeMax);
  });
  it('세라: 표식을 남기고 폭발시켜 행동력·붕괴를 얻는다', () => {
    const { st, allies, enemies } = setup(['sera']);
    const s = allies[0];
    const e = enemies[0];
    s.ap = 10;
    B.finishSkill(st, B.beginSkill(st, s, SKILLS.s_track, [e], 1), 'good');
    B.finishSkill(st, B.beginSkill(st, s, SKILLS.s_crack, [e], 1), 'good');
    expect(B.markCount(e)).toBe(2);
    const ap = s.ap, brk = e.brk;
    B.detonate(st, s, e, 1);
    expect(B.markCount(e)).toBe(0);
    expect(s.ap).toBe(ap + 2);
    expect(e.brk).toBeGreaterThan(brk);
  });
  it('정밀 조준 약점 명중: 부위 파괴·공명', () => {
    const { st, allies, enemies } = setup(['sera'], ['shellbeast']);
    const s = allies[0], e = enemies[0];
    s.ap = 5;
    B.aimShot(st, s, e, { kind: 'weak', id: 'seam' });
    expect(e.parts).toContain('shell');
    expect(st.resonance).toBeGreaterThan(0);
    expect(st.stats.weakHits).toBe(1);
    expect(s.ap).toBe(4);
  });
});

describe('유물 숙련·메아리·통찰력', () => {
  it('숙련이 차면 메아리 해금, 유물을 벗어도 장착 가능', () => {
    const s = newGame('normal');
    addItem(s, 'rl_bell');
    equipRelic(s, 'kael', 0, 'rl_bell');
    let unlocked: string[] = [];
    for (let i = 0; i < 5 && !unlocked.length; i++) unlocked = applyBattleMastery(s, { 'kael:rl_bell': 1 });
    expect(unlocked).toEqual(['rl_bell']);
    equipRelic(s, 'kael', 0, null);
    expect(toggleEcho(s, 'kael', 'rl_bell')).toBe('on');
    const u = buildAllyUnit(s, 'kael', 0);
    expect(u.passives).toContain('parry_empower');
  });
  it('통찰력 한도를 넘는 메아리는 장착 불가', () => {
    const s = newGame('normal');
    for (const r of ['rl_thorn', 'rl_seal', 'rl_pulse']) { addItem(s, r); addMastery(s, r, 999); }
    expect(insightCap(s)).toBe(2);
    expect(toggleEcho(s, 'kael', 'rl_thorn')).toBe('on');
    expect(toggleEcho(s, 'kael', 'rl_seal')).toBe('nocap');
    expect(insightUsed(s, 'kael')).toBe(2);
    s.bosses.push('warden');
    expect(toggleEcho(s, 'kael', 'rl_seal')).toBe('nocap');
    s.bosses.push('stag');
    expect(toggleEcho(s, 'kael', 'rl_seal')).toBe('on');
  });
  it('레벨업 시 기술 습득', () => {
    const s = newGame('normal');
    const ups = grantXp(s, 'mira', 500);
    expect(ups.length).toBeGreaterThan(0);
    expect(s.chars.mira.learned).toContain('m_blaze');
  });
});

describe('적 행동', () => {
  it('충전 공격은 예고 턴 다음에 발동, 붕괴로 취소', () => {
    const { st, allies } = setup(['kael'], []);
    const w = B.spawnEnemy(st, 'warden', 1, false);
    w.rotation = ENEMIES.warden.rotation.indexOf('prep:ember_rush');
    expect(B.chooseEnemyAction(st, w).kind).toBe('prep');
    expect(w.charging?.attack).toBe('ember_rush');
    B.addBreak(st, w, w.brkMax);
    B.triggerBreak(st, allies[0], w);
    expect(w.charging).toBeNull();
  });
  it('최종 보스는 세 페이즈를 거친다', () => {
    const { st, allies } = setup(['kael'], ['thornknight']);
    const b = B.enemies(st)[0];
    for (const id of ['nest', 'frenzy']) {
      B.hitEnemy(st, allies[0], b, { power: 9999, brk: 0, grade: 'good' });
      expect(b.enemyId).toBe(id);
      expect(b.alive).toBe(true);
    }
    B.hitEnemy(st, allies[0], b, { power: 9999, brk: 0, grade: 'good' });
    expect(b.alive).toBe(false);
    expect(st.over).toBe('victory');
  });
  it('승리 후에는 추가 판정이 없다', () => {
    const { st, allies, enemies } = setup(['kael'], ['hound']);
    B.hitEnemy(st, allies[0], enemies[0], { power: 9999, brk: 0, grade: 'good' });
    expect(st.over).toBe('victory');
    const hp = enemies[0].hp;
    B.hitEnemy(st, allies[0], enemies[0], { power: 10, brk: 0, grade: 'good' });
    expect(enemies[0].hp).toBe(hp);
  });
});

describe('타임라인 미리보기', () => {
  it('가장 빠른 유닛부터, 중복 포함 n개', () => {
    const { st } = setup();
    const p = B.previewOrder(st, 8);
    expect(p.length).toBe(8);
    const first = B.nextActor(st)!;
    expect(p[0]).toBe(first);
  });
});

export type { Unit };
