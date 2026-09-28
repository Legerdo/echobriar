/**
 * 전투 규칙 (순수 로직). 렌더링·입력과 분리되어 단위 테스트 가능하다.
 * 연출은 state.events 큐를 읽어 처리한다.
 */
import { AP, BREAK, DIFFICULTY, DMG, MARK, RES, SIGIL_MAX, STANCE, TIMELINE, TIMING_BRK_MULT, TIMING_MULT } from '../data/config';
import { ENEMIES, EnemyAttack, EnemyDef } from '../data/enemies';
import { CHARS, SKILLS } from '../data/characters';
import { ITEMS } from '../data/items';
import { Rng } from '../core/util';
import { L } from '../locale/ko';
import type { BattleOptions, CharId, Element, Grade, MarkType, SkillDef, Stance, Status, StatusApply, StatusId, Unit } from './types';
import type { Sfx } from '../audio/audio';

export type BEvent =
  | { t: 'dmg'; uid: string; n: number; weak?: boolean; big?: boolean; absorbed?: number }
  | { t: 'heal'; uid: string; n: number }
  | { t: 'text'; uid?: string; s: string; color?: string; big?: boolean }
  | { t: 'status'; uid: string; id: StatusId }
  | { t: 'breakReady'; uid: string }
  | { t: 'break'; uid: string }
  | { t: 'ko'; uid: string }
  | { t: 'revive'; uid: string }
  | { t: 'ap'; uid: string; n: number }
  | { t: 'res'; n: number }
  | { t: 'mark'; uid: string; m: MarkType }
  | { t: 'detonate'; uid: string }
  | { t: 'part'; uid: string; part: string }
  | { t: 'summon'; uid: string }
  | { t: 'sfx'; s: Sfx }
  | { t: 'phase'; uid: string; line: string }
  | { t: 'charge'; uid: string; n: number }
  | { t: 'sigil'; uid: string }
  | { t: 'stance'; uid: string; s: Stance };

export interface BattleStats {
  perfectParries: number;
  counters: number;
  breaks: number;
  weakHits: number;
  perfectTimings: number;
  dodges: number;
  jumps: number;
  hitsTaken: number;
}

export interface BattleState {
  opts: BattleOptions;
  rng: Rng;
  units: Unit[];
  resonance: number;
  /** 현재 행동 중인 유닛 */
  current: Unit | null;
  /** 타임라인 현재 시각 */
  time: number;
  turns: number;
  events: BEvent[];
  stats: BattleStats;
  /** `${charId}:${relicId}` → 발동 횟수 */
  relicTriggers: Record<string, number>;
  over: null | 'victory' | 'defeat';
  uidSeq: number;
  /** 이번 적 공격에서 패링으로 얻은 행동력 */
  parryApThisAttack: Record<string, number>;
}

/* ============================================================ 유닛 생성 */

export function blankUnit(p: Partial<Unit> & Pick<Unit, 'uid' | 'side' | 'name' | 'sheet'>): Unit {
  return {
    hp: 1, maxHp: 1, atk: 1, def: 0, agi: 10, foc: 0, statuses: [], next: 0, alive: true,
    ap: 0, stance: 'guard', stancesUsed: [], sigils: [], charge: 0, chargeMax: 5, passives: [], relicPassives: {}, skills: [], weapon: '',
    empower: 0, linkSignal: false, dodgeApUsed: false,
    brk: 0, brkMax: 100, breakReady: false, brokenTurns: 0, breakCount: 0, marks: {}, charging: null, parts: [], sealed: [], rotation: 0,
    cooldowns: {}, phase: 1, summoned: false, sheetOverride: null, flags: {},
    ...p,
  };
}

export function makeEnemy(id: string, lv: number, opts: Pick<BattleOptions, 'difficulty'>, uid: string, summoned = false): Unit {
  const d = ENEMIES[id];
  if (!d) throw new Error(`알 수 없는 적: ${id}`);
  const diff = DIFFICULTY[opts.difficulty];
  const hp = Math.round(d.hp * lv * diff.enemyHp);
  return blankUnit({
    uid, side: 'enemy', name: d.name, sheet: d.sheet, enemyId: id,
    hp, maxHp: hp,
    atk: Math.round(d.atk * (0.55 + 0.45 * lv)),
    def: Math.round(d.def * (0.7 + 0.3 * lv)),
    agi: d.agi,
    foc: 10,
    brkMax: Math.round(d.brk * (0.8 + 0.2 * lv)),
    summoned,
  });
}

export function enemyDef(u: Unit): EnemyDef {
  return ENEMIES[u.enemyId!];
}

export function createBattle(allies: Unit[], enemies: Unit[], opts: BattleOptions): BattleState {
  const st: BattleState = {
    opts, rng: new Rng(opts.seed), units: [...allies, ...enemies], resonance: 0, current: null, time: 0, turns: 0, events: [],
    stats: { perfectParries: 0, counters: 0, breaks: 0, weakHits: 0, perfectTimings: 0, dodges: 0, jumps: 0, hitsTaken: 0 },
    relicTriggers: {}, over: null, uidSeq: 100, parryApThisAttack: {},
  };
  const diff = DIFFICULTY[opts.difficulty];
  for (const a of allies) {
    a.ap = Math.min(AP.max, diff.startAp);
    if (a.alive && hasP(a, 'full_start_ap') && a.hp >= a.maxHp) {
      a.ap = Math.min(AP.max, a.ap + 2);
      trig(st, a, 'full_start_ap');
    }
    a.stancesUsed = [a.stance];
  }
  // 합창자: 구슬 소환
  for (const e of enemies) {
    const orbs = enemyDef(e).traits?.orbs ?? 0;
    for (let i = 0; i < orbs; i++) spawnEnemy(st, 'orb', 1, true, e.uid);
  }
  initTimeline(st);
  return st;
}

export function spawnEnemy(st: BattleState, id: string, lv: number, summoned: boolean, owner?: string): Unit {
  const u = makeEnemy(id, lv, st.opts, `e${st.uidSeq++}`, summoned);
  if (owner) u.flags.owner = 1;
  u.flags.slot = st.units.filter((x) => x.side === 'enemy' && x.enemyId === id && x.alive).length;
  u.next = st.time + delay(u) * 0.6;
  st.units.push(u);
  return u;
}

/* ============================================================ 조회 */

export const allies = (st: BattleState) => st.units.filter((u) => u.side === 'ally');
export const enemies = (st: BattleState) => st.units.filter((u) => u.side === 'enemy');
export const liveAllies = (st: BattleState) => st.units.filter((u) => u.side === 'ally' && u.alive);
export const liveEnemies = (st: BattleState) => st.units.filter((u) => u.side === 'enemy' && u.alive);
export const byUid = (st: BattleState, uid: string) => st.units.find((u) => u.uid === uid);

export function hasS(u: Unit, id: StatusId): boolean {
  return u.statuses.some((s) => s.id === id && s.turns > 0);
}
export function getS(u: Unit, id: StatusId): Status | undefined {
  return u.statuses.find((s) => s.id === id && s.turns > 0);
}
export function hasP(u: Unit, pid: string): boolean {
  return u.passives.includes(pid);
}
/** 유물 패시브 발동 기록 (숙련) */
export function trig(st: BattleState, u: Unit, pid: string): void {
  for (const [relic, p] of Object.entries(u.relicPassives)) {
    if (p === pid) {
      const k = `${u.charId}:${relic}`;
      st.relicTriggers[k] = (st.relicTriggers[k] ?? 0) + 1;
    }
  }
}
export function markCount(u: Unit): number {
  return (Object.values(u.marks) as number[]).filter((n) => n > 0).length;
}

/* ============================================================ 타임라인 */

export function delay(u: Unit): number {
  let d = (TIMELINE.base * (TIMELINE.agiRef * 2)) / (u.agi + TIMELINE.agiRef);
  if (hasS(u, 'haste')) d *= TIMELINE.haste;
  if (hasS(u, 'slow')) d *= TIMELINE.slow;
  return d;
}

function initTimeline(st: BattleState): void {
  for (const u of st.units) {
    u.next = delay(u) * st.rng.range(0.3, 0.8);
    if (st.opts.advantage === 'party') u.next = u.side === 'ally' ? u.next * 0.25 : u.next + 45;
    if (st.opts.advantage === 'enemy') u.next = u.side === 'enemy' ? u.next * 0.25 : u.next + 45;
  }
}

export function nextActor(st: BattleState): Unit | null {
  let best: Unit | null = null;
  for (const u of st.units) {
    if (!u.alive) continue;
    if (!best || u.next < best.next - 1e-6 || (Math.abs(u.next - best.next) < 1e-6 && u.side === 'ally' && best.side === 'enemy')) best = u;
  }
  return best;
}

/** 다음 n번의 행동 순서 미리보기 */
export function previewOrder(st: BattleState, n: number): Unit[] {
  const sim = st.units.filter((u) => u.alive).map((u) => ({ u, next: u.next, d: delay(u) }));
  const out: Unit[] = [];
  for (let i = 0; i < n && sim.length; i++) {
    let b = sim[0];
    for (const s of sim) if (s.next < b.next - 1e-6 || (Math.abs(s.next - b.next) < 1e-6 && s.u.side === 'ally' && b.u.side === 'enemy')) b = s;
    out.push(b.u);
    b.next += b.d;
  }
  return out;
}

export function beginTurn(st: BattleState, u: Unit): void {
  st.current = u;
  st.time = u.next;
  st.turns++;
  u.dodgeApUsed = false;
}

export function endTurn(st: BattleState, u: Unit): void {
  u.next += delay(u);
  // 상태 지속 감소 (행동 주체의 턴 종료 시)
  for (const s of u.statuses) if (s.id !== 'shield') s.turns--;
  u.statuses = u.statuses.filter((s) => s.turns > 0 && !(s.id === 'shield' && s.value <= 0));
  if (u.side === 'enemy') {
    for (const k of Object.keys(u.marks) as MarkType[]) {
      u.marks[k] = (u.marks[k] ?? 0) - 1;
      if ((u.marks[k] ?? 0) <= 0) delete u.marks[k];
    }
    for (const k of Object.keys(u.cooldowns)) if (--u.cooldowns[k] <= 0) delete u.cooldowns[k];
  }
  st.current = null;
  checkEnd(st);
}

/* ============================================================ 자원 */

export function gainAp(st: BattleState, u: Unit, n: number): number {
  if (!u.alive || n <= 0) return 0;
  const before = u.ap;
  u.ap = Math.min(AP.max, u.ap + n);
  const g = u.ap - before;
  if (g > 0) st.events.push({ t: 'ap', uid: u.uid, n: g });
  return g;
}
export function gainRes(st: BattleState, n: number): void {
  const before = st.resonance;
  st.resonance = Math.min(RES.max, st.resonance + n);
  if (Math.floor(st.resonance / RES.seg) > Math.floor(before / RES.seg)) st.events.push({ t: 'res', n: Math.floor(st.resonance / RES.seg) }, { t: 'sfx', s: 'resonance' });
}
export function gainCharge(st: BattleState, u: Unit, n: number): void {
  if (u.charId !== 'orin' || !u.alive) return;
  const before = u.charge;
  u.charge = Math.min(u.chargeMax, u.charge + n);
  if (u.charge > before) st.events.push({ t: 'charge', uid: u.uid, n: u.charge - before });
}
export function addSigils(st: BattleState, u: Unit, els: Element[]): void {
  for (const e of els) {
    u.sigils.push(e);
    while (u.sigils.length > SIGIL_MAX) u.sigils.shift();
  }
  st.events.push({ t: 'sigil', uid: u.uid });
}
export function hasSigils(u: Unit, req: Element[]): boolean {
  const pool = [...u.sigils];
  for (const r of req) {
    const i = pool.indexOf(r);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}
function consumeSigils(u: Unit, req: Element[]): void {
  for (const r of req) {
    const i = u.sigils.indexOf(r);
    if (i >= 0) u.sigils.splice(i, 1);
  }
}
export function setStance(st: BattleState, u: Unit, s: Stance): void {
  if (u.charId !== 'kael') return;
  u.stance = s;
  if (!u.stancesUsed.includes(s)) u.stancesUsed.push(s);
  st.events.push({ t: 'stance', uid: u.uid, s });
}
const NEXT_STANCE: Record<Stance, Stance> = { guard: 'assault', assault: 'flow', flow: 'guard' };

/* ============================================================ 상태 효과 */

export function statusValue(src: Unit | null, id: StatusId): number {
  if (id === 'burn') return src ? Math.round(src.foc * 1.1 + src.atk * 0.4) : 10;
  if (id === 'shield') return src ? Math.round(src.foc * 2 + 20) : 30;
  return 0;
}

export function addStatus(st: BattleState, u: Unit, id: StatusId, turns: number, value = 0): void {
  if (!u.alive) return;
  // 행동 중인 유닛 자신에게 거는 효과는 이번 턴 종료 감소를 한 번 건너뛴다
  const fresh = st.current === u ? 1 : 0;
  const ex = u.statuses.find((s) => s.id === id);
  if (ex) {
    ex.turns = Math.max(ex.turns, turns + fresh);
    ex.value = id === 'shield' ? Math.min(ex.value + value, Math.round(u.maxHp * 0.6)) : Math.max(ex.value, value);
  } else u.statuses.push({ id, turns: turns + fresh, value });
  if (id === 'slow') u.next += TIMELINE.slowPush;
  if (id === 'haste') u.next = Math.max(st.time + 1, u.next - TIMELINE.hastePull);
  st.events.push({ t: 'status', uid: u.uid, id });
}

function applyStatusList(st: BattleState, src: Unit, list: StatusApply[] | undefined, target: Unit, defaultTo: 'target' | 'self' = 'target'): void {
  if (!list) return;
  for (const s of list) {
    if (s.chance !== undefined && !st.rng.chance(s.chance)) continue;
    const to = s.to ?? defaultTo;
    const tgts = to === 'self' ? [src] : to === 'allies' ? st.units.filter((u) => u.side === src.side && u.alive) : [target];
    for (const t of tgts) {
      // 연계: 이미 걸린 상태와 결합하면 공명
      if (t.side === 'enemy' && ((s.id === 'burn' && hasS(t, 'vulnerable')) || (s.id === 'vulnerable' && hasS(t, 'burn')) || (s.id === 'slow' && markCount(t) > 0))) gainRes(st, RES.statusCombo);
      addStatus(st, t, s.id, s.turns, s.value ?? statusValue(src, s.id));
    }
  }
}

/* ============================================================ 피해 계산 */

export interface HitCtx {
  power: number;
  brk: number;
  grade: Grade;
  weak?: boolean;
  weakMult?: number;
  counter?: boolean;
  detonation?: boolean;
  noVariance?: boolean;
  /** 적 공격 */
  enemyAttack?: boolean;
}

function variance(st: BattleState, h: HitCtx): number {
  return h.noVariance ? 1 : st.rng.range(1 - DMG.variance, 1 + DMG.variance);
}

/** 아군 → 적 피해·붕괴 계산 */
export function calcOutgoing(st: BattleState, src: Unit, tgt: Unit, h: HitCtx): { dmg: number; brk: number; flicker: boolean } {
  let m = TIMING_MULT[h.grade];
  let bm = TIMING_BRK_MULT[h.grade];
  if (src.charId === 'kael' && src.stance === 'assault') { m *= STANCE.assaultDmg; bm *= STANCE.assaultBrk; }
  if (src.empower > 0 && !h.detonation) m *= 1 + src.empower;
  if (hasS(src, 'daze') && !h.detonation) m *= DMG.dazeOut;
  if (hasS(tgt, 'exposed')) m *= DMG.exposedAll;
  if (tgt.brokenTurns > 0) m *= BREAK.dmgTaken;
  if ((tgt.marks.track ?? 0) > 0) m *= MARK.trackBonus;
  if (h.weak) m *= (h.weakMult ?? 1) * DMG.weakMult * (hasS(tgt, 'exposed') ? DMG.exposedWeak : 1) * (hasP(src, 'hunter') ? 1.4 : 1);
  if (hasP(src, 'burn_bonus') && hasS(tgt, 'burn')) { m *= 1.25; trig(st, src, 'burn_bonus'); }
  if (hasP(src, 'mark_first') && markCount(tgt) > 0) { m *= 1.2; trig(st, src, 'mark_first'); }
  if (hasS(tgt, 'vulnerable')) bm *= BREAK.vulnerable;
  if ((tgt.marks.crack ?? 0) > 0) bm *= MARK.crackBrkTaken;
  if (hasP(src, 'rend')) bm *= 1.3;
  if (h.weak && hasP(src, 'weak_brk')) { bm *= 1.5; trig(st, src, 'weak_brk'); }
  if (hasP(src, 'low_hp_brk') && src.hp <= src.maxHp * 0.5) { bm *= 1.4; trig(st, src, 'low_hp_brk'); }
  // 유리 불꽃의 일렁임: 완벽 타이밍·약점·반격이 아니면 절반
  const flicker = !!enemyDef(tgt).traits?.flicker && !hasS(tgt, 'exposed') && h.grade !== 'perfect' && !h.weak && !h.counter && !h.detonation;
  if (flicker) m *= DMG.flickerMiss;
  const mitig = DMG.defRef / (DMG.defRef + Math.max(0, tgt.def));
  const dmg = Math.max(1, Math.round(src.atk * h.power * mitig * m * variance(st, h)));
  return { dmg, brk: Math.round(h.brk * bm), flicker };
}

/** 적 → 아군 피해 계산 */
export function calcIncoming(st: BattleState, src: Unit, tgt: Unit, power: number): number {
  let m = DIFFICULTY[st.opts.difficulty].enemyDmg;
  if (hasS(tgt, 'guard')) m *= DMG.guardTaken;
  if (tgt.charId === 'kael') {
    if (tgt.stance === 'guard') m *= STANCE.guardTaken;
    if (tgt.stance === 'assault') m *= STANCE.assaultTaken;
  }
  if (hasS(src, 'daze')) m *= DMG.dazeOut;
  if (src.brokenTurns > 0) m *= 0.5;
  const mitig = DMG.defRef / (DMG.defRef + Math.max(0, tgt.def));
  return Math.max(1, Math.round(src.atk * power * mitig * m * st.rng.range(0.95, 1.05)));
}

function absorb(u: Unit, dmg: number): [number, number] {
  const sh = getS(u, 'shield');
  if (!sh || sh.value <= 0) return [dmg, 0];
  const a = Math.min(sh.value, dmg);
  sh.value -= a;
  if (sh.value <= 0) u.statuses = u.statuses.filter((s) => s !== sh);
  return [dmg - a, a];
}

/** 적에게 피해 적용 (붕괴 게이지 포함) */
export function hitEnemy(st: BattleState, src: Unit, tgt: Unit, h: HitCtx): number {
  if (!tgt.alive) return 0;
  const { dmg, brk, flicker } = calcOutgoing(st, src, tgt, h);
  const [rest, absorbed] = absorb(tgt, dmg);
  tgt.hp = Math.max(0, tgt.hp - rest);
  st.events.push({ t: 'dmg', uid: tgt.uid, n: rest, weak: h.weak, big: h.counter || h.grade === 'perfect', absorbed });
  if (flicker) st.events.push({ t: 'text', uid: tgt.uid, s: L.battle.flicker, color: '#a5def3' });
  addBreak(st, tgt, brk);
  if (src.charId === 'orin' && tgt.brokenTurns > 0 && !h.detonation) gainCharge(st, src, 1);
  if (tgt.hp <= 0) killEnemy(st, tgt);
  return rest;
}

export function addBreak(st: BattleState, tgt: Unit, amount: number): void {
  if (!tgt.alive || tgt.breakReady || tgt.brokenTurns > 0 || amount <= 0) return;
  tgt.brk = Math.min(tgt.brkMax, tgt.brk + amount);
  if (tgt.brk >= tgt.brkMax) {
    tgt.breakReady = true;
    st.events.push({ t: 'breakReady', uid: tgt.uid }, { t: 'text', uid: tgt.uid, s: L.battle.breakReady, color: '#a5def3', big: true });
  }
}

/** 붕괴 발동: 다음 행동 취소 + 지연, 받는 피해 증가, 충전 취소 */
export function triggerBreak(st: BattleState, src: Unit, tgt: Unit): boolean {
  if (!tgt.alive || !tgt.breakReady) return false;
  tgt.breakReady = false;
  tgt.brokenTurns = 1;
  tgt.breakCount++;
  st.stats.breaks++;
  if (tgt.charging) {
    tgt.charging = null;
    st.events.push({ t: 'text', uid: tgt.uid, s: L.battle.chargeCanceled, color: '#ff9838' });
  }
  tgt.next += delay(tgt) * BREAK.delay;
  tgt.brkMax = Math.round(tgt.brkMax * (1 + BREAK.growth));
  // 붕괴로도 갑주가 벗겨진다 (정밀 조준만이 유일한 해법이 아님)
  const armor = enemyDef(tgt).traits?.armorPart;
  if (armor && !tgt.parts.includes(armor)) breakPart(st, tgt, armor);
  // 붕괴 알림은 대상 머리 위(막대·수치와 겹침)가 아니라 화면 상단 배너로 (uid 없음)
  st.events.push({ t: 'break', uid: tgt.uid }, { t: 'text', s: L.battle.enemyBroken(tgt.name), color: '#a5def3', big: true }, { t: 'sfx', s: 'break' });
  gainRes(st, RES.breakTrigger);
  if (hasP(src, 'break_res')) { gainRes(st, 40); trig(st, src, 'break_res'); }
  return true;
}

export function breakPart(st: BattleState, tgt: Unit, part: string): void {
  if (tgt.parts.includes(part)) return;
  const d = enemyDef(tgt);
  if (part === 'bark') {
    tgt.flags.bark = (tgt.flags.bark ?? 0) + 1;
    if (tgt.flags.bark < 2) {
      st.events.push({ t: 'text', uid: tgt.uid, s: '가시 갑피에 금이 갔다', color: '#dc7096' });
      return;
    }
  }
  tgt.parts.push(part);
  if (d.traits?.armorPart === part && d.traits.armorDef !== undefined) tgt.def = Math.round(d.traits.armorDef * (tgt.def / d.def > 1 ? tgt.def / d.def : 1));
  const key = [...tgt.parts].sort().join(',');
  if (d.partSheets?.[key]) tgt.sheetOverride = d.partSheets[key];
  const partName = Object.values(d.weak).find((w) => w.part === part)?.name ?? part;
  st.events.push({ t: 'part', uid: tgt.uid, part }, { t: 'text', uid: tgt.uid, s: L.battle.partBreak(partName), color: '#ff9838', big: true });
  if (part === 'antler') {
    tgt.flags['seal:beam'] = 999;
    tgt.flags['seal:prep:beam'] = 999;
    if (tgt.charging?.attack === 'beam') tgt.charging = null;
  }
}

function killEnemy(st: BattleState, tgt: Unit): void {
  const d = enemyDef(tgt);
  if (d.nextPhase) {
    transformEnemy(st, tgt, d.nextPhase);
    return;
  }
  tgt.alive = false;
  tgt.statuses = [];
  tgt.charging = null;
  st.events.push({ t: 'ko', uid: tgt.uid });
  // 합창자가 쓰러지면 구슬도 흩어진다
  if (d.traits?.orbs) for (const o of liveEnemies(st)) if (o.enemyId === 'orb') { o.alive = false; st.events.push({ t: 'ko', uid: o.uid }); }
  checkEnd(st);
}

export function transformEnemy(st: BattleState, u: Unit, nextId: string): void {
  const prev = enemyDef(u);
  const d = ENEMIES[nextId];
  const diff = DIFFICULTY[st.opts.difficulty];
  u.enemyId = nextId;
  u.name = d.name;
  u.sheet = d.sheet;
  u.maxHp = u.hp = Math.round(d.hp * diff.enemyHp);
  u.atk = d.atk;
  u.def = d.def;
  u.agi = d.agi;
  u.brk = 0;
  u.brkMax = d.brk;
  u.breakReady = false;
  u.brokenTurns = 0;
  u.statuses = [];
  u.marks = {};
  u.charging = null;
  u.parts = [];
  u.sheetOverride = null;
  u.rotation = 0;
  u.phase++;
  u.flags = {};
  u.next = st.time + delay(u) * 0.8;
  st.events.push({ t: 'phase', uid: u.uid, line: prev.phaseLine ?? '' });
  if (u.phase === 3) gainRes(st, RES.seg);
}

/** 아군 피격 */
export function hurtAlly(st: BattleState, src: Unit, tgt: Unit, dmg: number): number {
  if (!tgt.alive) return 0;
  if (st.opts.invincible) dmg = 0;
  const [rest, absorbed] = absorb(tgt, dmg);
  tgt.hp = Math.max(0, tgt.hp - rest);
  st.stats.hitsTaken++;
  st.events.push({ t: 'dmg', uid: tgt.uid, n: rest, absorbed });
  if (tgt.hp <= 0) {
    tgt.alive = false;
    tgt.statuses = [];
    tgt.linkSignal = false;
    st.events.push({ t: 'ko', uid: tgt.uid }, { t: 'text', uid: tgt.uid, s: L.battle.ko(tgt.name), color: '#ff7888' });
    checkEnd(st);
  }
  return rest;
}

export function healUnit(st: BattleState, src: Unit | null, tgt: Unit, n: number, revive = false): number {
  if (!tgt.alive && !revive) return 0;
  const wasCrit = tgt.alive && tgt.hp <= tgt.maxHp * 0.35;
  if (!tgt.alive) {
    tgt.alive = true;
    tgt.hp = 0;
    tgt.next = Math.max(tgt.next, st.time + delay(tgt) * 0.5);
    st.events.push({ t: 'revive', uid: tgt.uid }, { t: 'text', uid: tgt.uid, s: L.battle.revived(tgt.name), color: '#b8e08a' });
  }
  const before = tgt.hp;
  tgt.hp = Math.min(tgt.maxHp, tgt.hp + Math.max(1, Math.round(n)));
  st.events.push({ t: 'heal', uid: tgt.uid, n: tgt.hp - before });
  if (src && wasCrit && hasP(src, 'rescue_shield')) {
    addStatus(st, tgt, 'shield', 3, Math.round(tgt.maxHp * 0.25));
    trig(st, src, 'rescue_shield');
  }
  return tgt.hp - before;
}

export function checkEnd(st: BattleState): void {
  if (st.over) return;
  if (!liveEnemies(st).length) st.over = 'victory';
  else if (!liveAllies(st).length) st.over = 'defeat';
}

/* ============================================================ 턴 시작 */

/** 턴 시작 처리. 적이 붕괴 중이면 true(행동 건너뜀) */
export function turnStart(st: BattleState, u: Unit): { skip: boolean } {
  beginTurn(st, u);
  const burn = getS(u, 'burn');
  if (burn) {
    if (u.side === 'enemy') {
      u.hp = Math.max(0, u.hp - burn.value);
      st.events.push({ t: 'dmg', uid: u.uid, n: burn.value });
      if (u.hp <= 0) { killEnemy(st, u); return { skip: true }; }
    } else {
      const d = st.opts.invincible ? 0 : burn.value;
      u.hp = Math.max(1, u.hp - d);
      st.events.push({ t: 'dmg', uid: u.uid, n: d });
    }
  }
  if (u.side === 'ally') {
    gainAp(st, u, AP.turnGain);
    if (hasP(u, 'regen')) { healUnit(st, null, u, u.maxHp * 0.06); trig(st, u, 'regen'); }
    if (hasP(u, 'ap_haste') && u.ap >= 6) { addStatus(st, u, 'haste', 1); trig(st, u, 'ap_haste'); }
    return { skip: false };
  }
  // 적
  if (u.brokenTurns > 0) {
    u.brokenTurns--;
    if (u.brokenTurns <= 0) {
      u.brk = 0;
      st.events.push({ t: 'text', uid: u.uid, s: L.battle.recover });
    } else st.events.push({ t: 'text', uid: u.uid, s: L.battle.stagger });
    return { skip: true };
  }
  return { skip: false };
}

/* ============================================================ 기술 */

export function skillCost(u: Unit, s: SkillDef): number {
  if (s.ap <= 0) return 0;
  let c = s.ap;
  if (u.charId === 'kael' && u.stance === 'flow' && s.ap > 1) c -= STANCE.flowCostCut;
  return Math.max(1, c);
}

export function skillTargets(st: BattleState, u: Unit, s: SkillDef): Unit[] {
  switch (s.target) {
    case 'enemy': case 'allEnemies': return liveEnemies(st);
    case 'ally': return liveAllies(st).filter((a) => !(s.apGive && a === u));
    case 'allAllies': return liveAllies(st);
    case 'self': return [u];
    case 'deadAlly': return allies(st).filter((a) => !a.alive);
  }
}

/** 사용 불가 사유 (가능하면 null) */
export function cannotUse(st: BattleState, u: Unit, s: SkillDef): string | null {
  if (skillCost(u, s) > u.ap) return L.battle.notEnoughAp;
  if (s.consume && !hasSigils(u, s.consume)) return L.battle.needSigils(s.consume.map((e) => L.element[e]).join(' + '));
  if (s.chargeCost && u.charge < s.chargeCost) return L.battle.needCharge(s.chargeCost);
  if (s.chargeMin && u.charge < s.chargeMin) return L.battle.needCharge(s.chargeMin);
  if (!skillTargets(st, u, s).length) return L.battle.noTarget;
  return null;
}

export interface SkillRun {
  skill: SkillDef;
  user: Unit;
  targets: Unit[];
  chargesUsed: number;
  stanceBefore: Stance;
  grades: Grade[];
  hitCount: number;
}

/** 비용 지불 */
export function beginSkill(st: BattleState, u: Unit, s: SkillDef, targets: Unit[], hitCount: number): SkillRun {
  u.ap -= skillCost(u, s);
  if (s.consume) consumeSigils(u, s.consume);
  let chargesUsed = 0;
  if (s.chargeAll) { chargesUsed = u.charge; u.charge = 0; }
  else if (s.chargeCost) { chargesUsed = s.chargeCost; u.charge -= s.chargeCost; }
  return { skill: s, user: u, targets, chargesUsed, stanceBefore: u.stance, grades: [], hitCount: Math.max(1, hitCount) };
}

function skillPower(run: SkillRun, tgt: Unit): { power: number; brk: number } {
  const { skill: s, user: u } = run;
  let p = s.power ?? 0, b = s.brk ?? 0;
  const c = run.chargesUsed;
  switch (s.special) {
    case 'cannon': p = p * (1 + 0.45 * c) + 0.2 * c; b += 6 * c; break;
    case 'max_output': p *= 1 + 0.3 * c; if (c >= u.chargeMax) p *= 1.5; break;
    case 'three_stances': p *= 1 + 0.35 * u.stancesUsed.length; break;
    case 'volley_marks': p *= 1 + 0.15 * markCount(tgt); break;
    case 'assault_brk': if (u.stance === 'assault') b *= 1.5; break;
  }
  if (hasP(u, 'siege') && c >= 5) p *= 1.25;
  if (hasP(u, 'deep')) {
    if (s.consume) p *= 1.35;
    else if (s.sigils && s.power) p *= 0.8;
  }
  if (u.charId === 'kael' && u.stance === 'flow' && run.hitCount > 1) p *= STANCE.flowMulti;
  return { power: p, brk: b };
}

/** 기술의 한 타격 (대상 하나) */
export function skillHit(st: BattleState, run: SkillRun, tgt: Unit, grade: Grade): number {
  if (!tgt.alive || !run.skill.power) return 0;
  const { power, brk } = skillPower(run, tgt);
  return hitEnemy(st, run.user, tgt, { power: power / run.hitCount, brk: brk / run.hitCount, grade });
}

/** 기술 종료 처리: 자세·인장·상태·표식·지원 */
export function finishSkill(st: BattleState, run: SkillRun, overall: Grade): void {
  const { skill: s, user: u } = run;
  const perfectHits = run.grades.filter((g) => g === 'perfect').length;
  timingRewards(st, u, overall, !!s.timing);
  // 자세
  if (s.special === 'flow_refund' && run.stanceBefore === 'flow') gainAp(st, u, Math.min(2, perfectHits));
  if (s.stance) setStance(st, u, s.stance);
  if (s.special === 'cycle_stance') { setStance(st, u, 'guard'); setStance(st, u, 'flow'); setStance(st, u, 'assault'); }
  if (s.special === 'flow_haste' && run.stanceBefore === 'flow') addStatus(st, u, 'haste', 2);
  if (s.special === 'riposte') u.flags.riposte = 1;
  // 인장
  if (s.sigils) {
    const extra = hasP(u, 'kindle') ? [s.sigils[0]] : [];
    addSigils(st, u, [...s.sigils, ...extra]);
  }
  if (s.special === 'fill_sigils') { u.sigils = ['fire', 'tide', 'storm']; st.events.push({ t: 'sigil', uid: u.uid }); }
  if (hasP(u, 'deep') && s.consume) gainAp(st, u, 1);
  // 충전
  if (s.chargeGain) gainCharge(st, u, s.chargeGain);
  if (s.special === 'refill_charge') gainCharge(st, u, u.chargeMax);
  // 대상별
  for (const t of run.targets) {
    if (t.side === 'enemy') {
      if (!t.alive) continue;
      applyStatusList(st, u, s.status?.filter((x) => (x.to ?? 'target') === 'target'), t);
      if (hasP(u, 'rend') && u.stance === 'assault' && s.power) addStatus(st, t, 'vulnerable', 1);
      if (s.mark) applyMark(st, u, t, s.mark);
      if (s.special === 'mark_all') (['crack', 'track', 'echo'] as MarkType[]).forEach((m) => applyMark(st, u, t, m));
      if (s.detonate) detonate(st, u, t, 1);
      if (u.linkSignal && s.power && markCount(t) > 0) { detonate(st, u, t, 1.5); u.linkSignal = false; }
      if (s.breaker && t.breakReady) triggerBreak(st, u, t);
    } else {
      if (s.heal) healUnit(st, u, t, s.heal * (u.foc * 1.4 + 12));
      if (s.shield) addStatus(st, t, 'shield', 3, Math.round(s.shield * (u.foc * 2 + 20)));
      if (s.apGive) gainAp(st, t, s.apGive);
      if (s.special === 'link') t.linkSignal = true;
      if (s.special === 'rescue') healUnit(st, u, t, t.maxHp * 0.3, true);
    }
  }
  if (s.special === 'rescue') for (const t of allies(st)) if (!t.alive) healUnit(st, u, t, t.maxHp * 0.3, true);
  applyStatusList(st, u, s.status?.filter((x) => x.to === 'self' || x.to === 'allies'), u, 'self');
  if (s.power) u.empower = 0;
  if (s.power && hasS(u, 'daze')) u.statuses = u.statuses.filter((x) => x.id !== 'daze');
}

/** 공격 타이밍 보상 (완벽: 공명, 오린 충전) */
function timingRewards(st: BattleState, u: Unit, g: Grade, hadTiming: boolean): void {
  if (!hadTiming) return;
  if (g === 'perfect') {
    st.stats.perfectTimings++;
    gainRes(st, RES.perfectTiming);
    if (hasP(u, 'timing_res')) { gainRes(st, 12); trig(st, u, 'timing_res'); }
  }
  if (g !== 'fail') gainCharge(st, u, 1);
}

/** 기본 공격: 행동력 생성 */
export function basicAttack(st: BattleState, u: Unit, tgt: Unit, grade: Grade): number {
  const b = CHARS[u.charId!].basic;
  const dmg = hitEnemy(st, u, tgt, { power: b.power, brk: b.brk, grade });
  let ap = AP.basicGain + (grade === 'perfect' ? AP.basicPerfectBonus : 0);
  if (u.charId === 'kael' && u.stance === 'flow') ap += STANCE.flowBasicAp;
  gainAp(st, u, ap);
  gainCharge(st, u, 1 + (hasP(u, 'quick') ? 1 : 0));
  timingRewards(st, u, grade, true);
  if (hasP(u, 'rend') && u.stance === 'assault' && tgt.alive) addStatus(st, tgt, 'vulnerable', 1);
  if (u.linkSignal && tgt.alive && markCount(tgt) > 0) { detonate(st, u, tgt, 1.5); u.linkSignal = false; }
  u.empower = 0;
  if (hasS(u, 'daze')) u.statuses = u.statuses.filter((x) => x.id !== 'daze');
  return dmg;
}

/* ============================================================ 표식 */

export function applyMark(st: BattleState, src: Unit, t: Unit, m: MarkType): void {
  if (!t.alive) return;
  t.marks[m] = MARK.turns + (hasP(src, 'tracker') ? 2 : 0);
  st.events.push({ t: 'mark', uid: t.uid, m });
}

export function detonate(st: BattleState, src: Unit, t: Unit, mult: number): void {
  const ms = (Object.keys(t.marks) as MarkType[]).filter((k) => (t.marks[k] ?? 0) > 0);
  if (!ms.length || !t.alive) return;
  const m = mult * (hasP(src, 'tracker') ? 1.5 : 1);
  st.events.push({ t: 'detonate', uid: t.uid }, { t: 'text', uid: t.uid, s: L.battle.detonate, color: '#f4dc8a', big: true }, { t: 'sfx', s: 'break' });
  const power = MARK.detonatePower * ms.length * m;
  let brk = 0;
  if (ms.includes('crack')) brk += MARK.crackBrk * m;
  const dealt = hitEnemy(st, src, t, { power, brk, grade: 'good', detonation: true });
  if (ms.includes('track')) gainAp(st, src, MARK.trackAp);
  if (ms.includes('echo')) {
    for (const o of liveEnemies(st)) if (o !== t) {
      const n = Math.max(1, Math.round(dealt * MARK.echoSplash));
      o.hp = Math.max(0, o.hp - n);
      st.events.push({ t: 'dmg', uid: o.uid, n });
      addBreak(st, o, 10 * m);
      if (o.hp <= 0) killEnemy(st, o);
    }
  }
  gainRes(st, RES.statusCombo * ms.length);
  t.marks = {};
}

/* ============================================================ 정밀 조준 */

export type AimResult = { kind: 'weak'; id: string } | { kind: 'body' } | { kind: 'miss' };

export function aimCost(u: Unit): number {
  return u.charId === 'sera' ? 1 : 2;
}

export function aimShot(st: BattleState, u: Unit, t: Unit, r: AimResult): void {
  u.ap -= aimCost(u);
  const base = u.charId === 'sera' ? 1.3 : 1.0;
  if (r.kind === 'miss') {
    st.events.push({ t: 'text', uid: t.uid, s: L.battle.miss, color: '#ad9a84' });
    return;
  }
  if (r.kind === 'body') {
    hitEnemy(st, u, t, { power: base * DMG.bodyAimMult, brk: 8, grade: 'good' });
    st.events.push({ t: 'text', uid: t.uid, s: L.battle.bodyHit });
    return;
  }
  const d = enemyDef(t);
  const w = d.weak[r.id];
  st.stats.weakHits++;
  st.events.push({ t: 'text', uid: t.uid, s: `${L.battle.weakHit} — ${w?.name ?? ''}`, color: '#f4dc8a', big: true }, { t: 'sfx', s: 'weak' });
  const phase = t.phase;
  hitEnemy(st, u, t, { power: base * (w?.dmg ?? 1), brk: 12 + (w?.brk ?? 0), grade: 'perfect', weak: true, weakMult: 1 });
  gainRes(st, RES.weakHit);
  // 이 타격으로 쓰러지거나 다음 페이즈로 넘어갔다면 약점 부가 효과는 새 모습에 적용하지 않는다
  if (!t.alive || !w || t.phase !== phase) return;
  if (w.status) applyStatusList(st, u, w.status, t);
  if (w.part) breakPart(st, t, w.part);
  if (w.seal) for (const s of w.seal) t.flags[`seal:${s}`] = w.sealTurns ?? 2;
  if (w.cancelCharge && t.charging) {
    t.charging = null;
    st.events.push({ t: 'text', uid: t.uid, s: L.battle.chargeCanceled, color: '#ff9838', big: true });
  }
  if (u.charId === 'sera' && markCount(t) > 0) detonate(st, u, t, 1.5);
  if (t.enemyId === 'orb' && t.alive) { t.hp = 0; killEnemy(st, t); }
}

/* ============================================================ 공명 */

export function resonanceSkillFor(u: Unit, segs: number): string | null {
  if (segs === 1) return 'r_rescue';
  if (segs === 2) return CHARS[u.charId!].resonance2;
  if (segs === 3) return 'r_party';
  return null;
}

export function spendRes(st: BattleState, segs: number): boolean {
  if (st.resonance < segs * RES.seg) return false;
  st.resonance -= segs * RES.seg;
  return true;
}

/* ============================================================ 반격 */

export function counterAttack(st: BattleState, u: Unit, e: Unit, hits: number): number {
  let power = DMG.counterBase + DMG.counterPerHit * (hits - 1);
  if (u.charId === 'kael' && u.stance === 'guard') power *= STANCE.guardCounter;
  if (u.flags.riposte) { power *= 1.8; u.flags.riposte = 0; }
  if (hasP(u, 'guard_counter') && (hasS(u, 'guard') || (u.charId === 'kael' && u.stance === 'guard'))) { power *= 1.4; trig(st, u, 'guard_counter'); }
  st.stats.counters++;
  const dmg = hitEnemy(st, u, e, { power, brk: DMG.counterBrk + 10 * (hits - 1), grade: 'perfect', counter: true });
  gainRes(st, RES.counter);
  for (const o of liveAllies(st)) if (o.charId === 'orin') gainCharge(st, o, 1);
  if (hasP(u, 'counter_mark') && e.alive) { applyMark(st, u, e, 'track'); trig(st, u, 'counter_mark'); }
  if (hasP(u, 'oath')) setStance(st, u, NEXT_STANCE[u.stance]);
  return dmg;
}

/* ============================================================ 적 행동 */

export type EnemyChoice =
  | { kind: 'attack'; atk: EnemyAttack; targets: Unit[] }
  | { kind: 'prep'; atk: EnemyAttack }
  | { kind: 'wait' };

function sealed(e: Unit, id: string): boolean {
  return (e.flags[`seal:${id}`] ?? 0) > 0;
}

export function chooseEnemyAction(st: BattleState, e: Unit): EnemyChoice {
  const d = enemyDef(e);
  const findAtk = (id: string) => d.attacks.find((a) => a.id === id)!;
  if (e.charging) {
    const a = findAtk(e.charging.attack);
    e.charging = null;
    return { kind: 'attack', atk: a, targets: pickTargets(st, a) };
  }
  const list = d.rotation2 && e.hp / e.maxHp <= d.rotation2.below ? d.rotation2.list : d.rotation;
  for (let tries = 0; tries < list.length + 1; tries++) {
    const id = list[e.rotation % list.length];
    e.rotation++;
    if (sealed(e, id)) continue;
    if (id.startsWith('prep:')) {
      const a = findAtk(id.slice(5));
      if (sealed(e, a.id)) continue;
      e.charging = { attack: a.id, turns: 1 };
      return { kind: 'prep', atk: a };
    }
    const a = findAtk(id);
    // 충전형 공격은 예고 없이 순환에 나오면 건너뛴다
    if (a.charge) continue;
    if (a.summon && liveEnemies(st).filter((x) => x.summoned && x.enemyId === a.summon).length >= 2) continue;
    return { kind: 'attack', atk: a, targets: pickTargets(st, a) };
  }
  return { kind: 'wait' };
}

function pickTargets(st: BattleState, a: EnemyAttack): Unit[] {
  const live = liveAllies(st);
  if (!live.length) return [];
  if (a.target === 'all') return live;
  // 체력이 낮은 동료를 약간 더 노린다
  const w = live.map((u) => 1 + (1 - u.hp / u.maxHp) * 0.8);
  let r = st.rng.next() * w.reduce((x, y) => x + y, 0);
  for (let i = 0; i < live.length; i++) {
    r -= w[i];
    if (r <= 0) return [live[i]];
  }
  return [live[live.length - 1]];
}

/** 공격 외 효과 (소환·보호막 등) */
export function enemySpecial(st: BattleState, e: Unit, a: EnemyAttack): void {
  if (a.summon) {
    const s = spawnEnemy(st, a.summon, 1, true);
    st.events.push({ t: 'summon', uid: s.uid }, { t: 'text', uid: s.uid, s: L.battle.summoned });
  }
  if (a.special === 'orb_shield') {
    const boss = liveEnemies(st).find((x) => enemyDef(x).traits?.orbs);
    if (boss) {
      addStatus(st, boss, 'shield', 99, 45);
      st.events.push({ t: 'text', uid: boss.uid, s: L.battle.orbShield, color: '#f4dc8a' });
    }
  }
  if (a.special === 'reorb') {
    const orbs = liveEnemies(st).filter((x) => x.enemyId === 'orb').length;
    if (orbs < 3) {
      const s = spawnEnemy(st, 'orb', 1, true, e.uid);
      st.events.push({ t: 'summon', uid: s.uid });
    }
  }
  if (a.selfStatus) applyStatusList(st, e, a.selfStatus, e, 'self');
}

/** 적 타격 하나를 한 아군에게 해결 */
export function resolveEnemyHit(
  st: BattleState, e: Unit, tgt: Unit, a: EnemyAttack, power: number, result: 'parry' | 'dodge' | 'jump' | 'hit', guardMiss: boolean,
): number {
  if (!tgt.alive) return 0;
  switch (result) {
    case 'parry': {
      st.stats.perfectParries++;
      let n = AP.parryGain;
      if (tgt.charId === 'kael' && tgt.stance === 'guard') n += 1;
      if (hasP(tgt, 'oath')) n += 1;
      if (hasP(tgt, 'rend')) n = 0;
      const got = st.parryApThisAttack[tgt.uid] ?? 0;
      n = Math.max(0, Math.min(n, AP.parryGainCapPerAttack + (hasP(tgt, 'oath') ? 1 : 0) - got));
      const g = gainAp(st, tgt, n);
      st.parryApThisAttack[tgt.uid] = got + g;
      st.events.push({ t: 'text', uid: tgt.uid, s: g > 0 ? L.battle.parryAp(g) : L.battle.perfectParry, color: '#f4dc8a', big: true }, { t: 'sfx', s: 'parry' });
      gainRes(st, 6);
      if (tgt.charId === 'kael') {
        if (tgt.stance === 'assault') tgt.empower = Math.max(tgt.empower, 0.3);
        if (tgt.stance === 'flow' && !hasS(tgt, 'haste')) addStatus(st, tgt, 'haste', 1);
      }
      if (hasP(tgt, 'parry_empower')) { tgt.empower = Math.max(tgt.empower, 0.3); trig(st, tgt, 'parry_empower'); }
      return 0;
    }
    case 'dodge': {
      st.stats.dodges++;
      st.events.push({ t: 'text', uid: tgt.uid, s: L.battle.dodge, color: '#a5def3' }, { t: 'sfx', s: 'dodge' });
      gainRes(st, RES.dodge);
      if (hasP(tgt, 'dodge_ap') && !tgt.dodgeApUsed) { tgt.dodgeApUsed = true; gainAp(st, tgt, 1); trig(st, tgt, 'dodge_ap'); }
      return 0;
    }
    case 'jump': {
      st.stats.jumps++;
      st.events.push({ t: 'text', uid: tgt.uid, s: L.battle.jump, color: '#a5def3' }, { t: 'sfx', s: 'land' });
      gainRes(st, RES.jump);
      return 0;
    }
    case 'hit': {
      let dmg = calcIncoming(st, e, tgt, power);
      if (guardMiss) dmg = Math.round(dmg * 0.5);
      const d = hurtAlly(st, e, tgt, dmg);
      st.events.push({ t: 'sfx', s: 'hurt' });
      if (a.status && tgt.alive) for (const s of a.status) addStatus(st, tgt, s.id, s.turns, s.value ?? (s.id === 'burn' ? Math.round(e.atk * 0.35) : 0));
      return d;
    }
  }
}

/** 적 공격이 끝난 뒤 (혼미 소모, 패링 보상 초기화) */
export function finishEnemyAttack(st: BattleState, e: Unit): void {
  st.parryApThisAttack = {};
  if (hasS(e, 'daze')) e.statuses = e.statuses.filter((x) => x.id !== 'daze');
  for (const u of liveAllies(st)) u.dodgeApUsed = false;
}

export function allJumpedBonus(st: BattleState, u: Unit): void {
  gainAp(st, u, AP.jumpAllGain);
}

/* ============================================================ 아이템 */

export function useItemInBattle(st: BattleState, user: Unit, itemId: string, tgt: Unit): boolean {
  const it = ITEMS[itemId];
  if (!it?.effect) return false;
  const e = it.effect;
  if (e.heal && tgt.alive) healUnit(st, user, tgt, tgt.maxHp * e.heal);
  else if (e.healAll) for (const a of liveAllies(st)) healUnit(st, user, a, a.maxHp * e.healAll);
  else if (e.revive && !tgt.alive) healUnit(st, user, tgt, tgt.maxHp * e.revive, true);
  else if (e.ap && tgt.alive) gainAp(st, tgt, e.ap);
  else if (e.haste && tgt.alive) addStatus(st, tgt, 'haste', e.haste);
  else return false;
  st.events.push({ t: 'sfx', s: 'heal' });
  return true;
}

export function itemTargets(st: BattleState, itemId: string): Unit[] {
  const e = ITEMS[itemId]?.effect;
  if (!e) return [];
  if (e.revive) return allies(st).filter((a) => !a.alive);
  return liveAllies(st);
}

export { SKILLS };
export type { CharId };
