/**
 * 전투 씬: 명시적 상태 머신 + 시계 기반 코루틴.
 * 규칙은 combat/battle.ts(순수 로직), 판정은 combat/reaction.ts·timing.ts가 담당하고
 * 이 파일은 연출·입력·HUD만 처리한다. 모든 시간은 일시정지 가능한 게임 시계(ms) 기준.
 */
import { Scene, W, H, Clock } from '../core/engine';
import { game } from '../game';
import { COL } from '../gfx/gfx';
import { AnimPlayer, frameAt, frameStart, animLength } from '../gfx/assets';
import { audio } from '../audio/audio';
import * as B from '../combat/battle';
import { planAttack, frameOfPlan, AttackPlan } from '../combat/hits';
import { ReactionTracker, windowsFor, validDefense } from '../combat/reaction';
import { BeatTracker, timingWindows, gradeHold, aggregate } from '../combat/timing';
import { DIFFICULTY, RES, ATTACK_TIMING, AIM, XP, REACT, Difficulty, ReactKind } from '../data/config';
import { ENEMIES, EncounterGroup, EnemyAttack } from '../data/enemies';
import { CHARS, SKILLS } from '../data/characters';
import { ITEMS, RELICS, MONEY_NAME } from '../data/items';
import { L } from '../locale/ko';
import { buildAllyUnit, grantXp, applyBattleMastery, addItem, itemLabel } from '../state/game';
import { h, Menu, MenuItem, Modal } from '../ui/dom';
import { placePopup, popupYAt, PopupBox, StaticBox } from '../gfx/popups';
import { hintOnce } from '../world/script';
import { openSettings, openHelp } from '../ui/menus';
import type { Unit, SkillDef, Grade, TimingSpec, HitKind } from '../combat/types';

export interface BattleEndInfo {
  result: 'victory' | 'rest' | 'title';
}

export type Wait = number | (() => boolean);
export type Gen<R = void> = Generator<Wait, R, void>;

export type Act =
  | { k: 'attack'; t: Unit }
  | { k: 'skill'; s: SkillDef; targets: Unit[]; res?: number }
  | { k: 'aim'; t: Unit }
  | { k: 'item'; id: string; t: Unit };

export type Phase = 'intro' | 'select' | 'target' | 'act' | 'enemy' | 'aim' | 'counter' | 'victory' | 'defeat';

export interface View {
  u: Unit;
  x: number;
  y: number;
  hx: number;
  hy: number;
  anim: AnimPlayer;
  animStart: number;
  frameFn: ((now: number) => { anim: string; idx: number }) | null;
  tween: { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number } | null;
  flashUntil: number;
  deadAt: number;
  cat: 'ally' | 'main' | 'summon' | 'orb';
  slot: number;
  appear: number;
}

interface Popup extends PopupBox { uid?: string; text: string; base?: string; count?: number; color: string; big: boolean }
const popupSize = (big: boolean) => (big ? 12 : 8);
/** 글자 높이 + 그림자 + 여백 */
const popupH = (big: boolean) => (big ? 15 : 11);
interface Fx { sheet: string; x: number; y: number; t0: number; flip: boolean }
interface Proj { sheet: string; x0: number; y0: number; x1: number; y1: number; t0: number; dur: number }

export interface ReactState {
  plan: AttackPlan;
  tracker: ReactionTracker;
  attacker: Unit;
  targets: Unit[];
  atk: EnemyAttack;
  start: number;
  since: number;
  fxDone: boolean[];
}

export interface TimingState {
  kind: TimingSpec['type'];
  beats: number[];
  tracker: BeatTracker;
  applied: boolean[];
  onBeat: (i: number, g: Grade) => void;
  auto: boolean;
  at: () => [number, number];
  since: number;
  hold?: { phase: 'wait' | 'hold' | 'done'; pressT: number; target: number; deadline: number; late: boolean; grade: Grade };
}

export interface AimState {
  u: Unit;
  t: Unit;
  cx: number;
  cy: number;
  zx: number;
  zy: number;
  start: number;
  limit: number;
  fired: B.AimResult | null;
  cancelled: boolean;
  point: [number, number] | null;
  since: number;
}

interface TargetSel {
  list: Unit[];
  idx: number;
  all: boolean;
  onPick: (t: Unit[]) => void;
  onCancel: () => void;
  since: number;
}

const ALLY_SLOTS: [number, number][] = [[172, 190], [128, 178], [148, 210]];
const MAIN_SLOTS: Record<string, [number, number][]> = {
  boss: [[372, 208]],
  1: [[370, 200]],
  2: [[344, 190], [416, 206]],
  3: [[330, 202], [396, 178], [432, 208]],
};
const SUMMON_SLOTS: [number, number][] = [[292, 206], [300, 174], [284, 150]];
const ORB_SLOTS: [number, number][] = [[292, 146], [376, 70], [448, 132]];
/** 근접 공격 시 대상 앞 거리 */
const REACH = { small: 46, mid: 56, large: 70, boss: 96 } as const;
/** 적이 아군에게 다가설 때 거리 */
const APPROACH = { small: 34, mid: 54, large: 62, boss: 90 } as const;
const RING_REACT = 450;
const CARD_Y = 214;

export class BattleScene implements Scene {
  readonly name = 'battle';
  readonly clock = new Clock(game.debug.speed);
  readonly st: B.BattleState;
  readonly views = new Map<string, View>();
  phase: Phase = 'intro';
  react: ReactState | null = null;
  timing: TimingState | null = null;
  aim: AimState | null = null;
  tsel: TargetSel | null = null;
  chosen: Act | null = null;
  current: Unit | null = null;
  private co: Gen | null = null;
  private coUntil = 0;
  private coCond: (() => boolean) | null = null;
  private popups: Popup[] = [];
  private fxs: Fx[] = [];
  private projs: Proj[] = [];
  private shakeAmp = 0;
  private flashA = 0;
  private stopUntil = 0;
  private banner: { text: string; sub: string; icon: string | null; until: number; t0: number; w: number; h: number } | null = null;
  private menus: Modal[] = [];
  private pendingPhase: { uid: string; line: string } | null = null;
  private itemSnap: Record<string, number>;
  private ended = false;
  private firstEnemyAttack = true;
  private firstSelect = true;
  private targetMark: Unit[] = [];
  private lastPopupAt = new Map<string, number>();
  readonly diff: Difficulty;

  constructor(readonly group: EncounterGroup, readonly adv: 'none' | 'party' | 'enemy', private onEnd: (i: BattleEndInfo) => void) {
    const s = game.save!;
    this.diff = s.difficulty;
    this.itemSnap = { ...s.items };
    const allies = s.active.map((c, i) => buildAllyUnit(s, c, i));
    const enemies = group.enemies.map((id, i) => B.makeEnemy(id, group.lv, { difficulty: s.difficulty }, `e${i}`));
    this.st = B.createBattle(allies, enemies, {
      difficulty: s.difficulty,
      seed: (Math.random() * 1e9) | 0,
      advantage: adv,
      reactionAssist: game.settings.reactionAssist,
      autoTiming: game.settings.autoTiming,
      invincible: game.debug.invincible,
    });
    for (const u of this.st.units) this.addView(u);
  }

  /* ============================================================ 기본 */

  now(): number {
    return this.clock.now();
  }
  get autoTiming(): boolean {
    return game.settings.autoTiming && DIFFICULTY[this.diff].allowAutoTiming;
  }
  get guideRing(): boolean {
    return DIFFICULTY[this.diff].guideRing || game.settings.reactionAssist;
  }
  sheetOf(u: Unit): string {
    return u.sheetOverride ?? u.sheet;
  }
  view(u: Unit): View {
    let v = this.views.get(u.uid);
    if (!v) v = this.addView(u);
    return v;
  }
  sizeOf(u: Unit): keyof typeof REACH {
    return u.side === 'ally' ? 'mid' : ENEMIES[u.enemyId!].size;
  }

  enter(): void {
    audio.music(this.group.music ?? 'battle');
    this.co = this.loop();
  }
  exit(): void {
    this.closeMenus();
  }

  private addView(u: Unit): View {
    let cat: View['cat'] = 'ally';
    if (u.side === 'enemy') cat = u.enemyId === 'orb' ? 'orb' : u.summoned ? 'summon' : 'main';
    const used = new Set([...this.views.values()].filter((v) => v.cat === cat && v.u.alive).map((v) => v.slot));
    let slot = 0;
    let pos: [number, number];
    if (cat === 'ally') { slot = B.allies(this.st).indexOf(u); pos = ALLY_SLOTS[slot % 3]; }
    else if (cat === 'main') {
      const mains = B.enemies(this.st).filter((e) => !e.summoned && e.enemyId !== 'orb');
      slot = mains.indexOf(u);
      const boss = this.group.boss;
      const list = boss ? MAIN_SLOTS.boss : MAIN_SLOTS[Math.min(3, Math.max(1, this.group.enemies.length))];
      pos = list[slot % list.length];
    } else {
      const list = cat === 'orb' ? ORB_SLOTS : SUMMON_SLOTS;
      while (used.has(slot) && slot < list.length - 1) slot++;
      pos = list[slot];
    }
    const v: View = {
      u, x: pos[0], y: pos[1], hx: pos[0], hy: pos[1], anim: new AnimPlayer(this.sheetOf(u), 'idle'), animStart: this.now() - Math.random() * 600,
      frameFn: null, tween: null, flashUntil: 0, deadAt: 0, cat, slot, appear: this.now(),
    };
    this.views.set(u.uid, v);
    return v;
  }

  play(v: View, name: string, rate = 1): void {
    const sheet = this.sheetOf(v.u);
    if (!game.assets.hasAnim(sheet, name)) name = this.idleName(v.u);
    v.anim.play(name, rate, sheet);
    v.animStart = this.now();
    v.frameFn = null;
  }

  idleName(u: Unit): string {
    if (u.side === 'ally') return u.alive ? 'idle' : 'defeat';
    if (!u.alive) return 'death';
    if (u.brokenTurns > 0) return 'break';
    const heart = u.flags.heart ?? 0;
    if (heart > 0 && game.assets.hasAnim(this.sheetOf(u), `idle_${heart}`)) return `idle_${heart}`;
    return 'idle';
  }

  /** 현재 표시 중인 (애니메이션 이름, 내부 프레임) */
  animIdx(v: View): { anim: string; idx: number } {
    const sheet = this.sheetOf(v.u);
    if (v.anim.sheet !== sheet) {
      v.anim.sheet = sheet;
      if (!game.assets.hasAnim(sheet, v.anim.name)) v.anim.name = this.idleName(v.u);
    }
    if (v.frameFn) return v.frameFn(this.now());
    v.anim.t = this.now() - v.animStart;
    return { anim: v.anim.name, idx: v.anim.index(game.assets) };
  }
  globalFrame(v: View): number {
    const { anim, idx } = this.animIdx(v);
    const a = game.assets.anim(this.sheetOf(v.u), anim);
    return a.frames[Math.min(idx, a.frames.length - 1)];
  }
  weakOf(v: View): import('../gfx/assets').WeakPoint[] {
    const { anim, idx } = this.animIdx(v);
    const a = game.assets.anim(this.sheetOf(v.u), anim);
    return a.weak[idx] ?? a.weak[0] ?? game.assets.anim(this.sheetOf(v.u), 'idle').weak[0] ?? [];
  }
  /** 프레임 좌표 → 전투 좌표 */
  toWorld(v: View, fx: number, fy: number): [number, number] {
    const s = game.assets.sheet(this.sheetOf(v.u));
    return [Math.round(v.x + fx - s.anchor[0]), Math.round(v.y + fy - s.anchor[1])];
  }
  attachPt(v: View, key: string): [number, number] | null {
    const { anim, idx } = this.animIdx(v);
    const a = game.assets.anim(this.sheetOf(v.u), anim);
    const p = a.attach[idx]?.[key] ?? game.assets.anim(this.sheetOf(v.u), 'idle').attach[0]?.[key];
    return p ? this.toWorld(v, p[0], p[1]) : null;
  }
  height(v: View): number {
    const sheet = this.sheetOf(v.u);
    return game.assets.sheet(sheet).anchor[1] - game.assets.topRow(sheet);
  }
  center(v: View): [number, number] {
    return this.attachPt(v, 'chest') ?? this.attachPt(v, 'core') ?? [v.x, Math.round(v.y - this.height(v) * 0.5)];
  }
  headY(v: View): number {
    return Math.round(v.y - this.height(v));
  }

  /* ============================================================ 연출 도우미 */

  popup(u: Unit, text: string, color: string = COL.white, big = false): void {
    const v = this.view(u);
    this.lastPopupAt.set(u.uid, this.now());
    // 일반 적은 머리 위 체력·붕괴 막대와 상태 아이콘을 피해 그 위에서 시작
    const overBars = u.side === 'enemy' && this.sizeOf(u) !== 'boss';
    this.addPopup(v.x, this.headY(v) - (overBars ? 30 : 4) - popupH(big), text, color, big, u.uid);
  }

  /**
   * 모든 떠오르는 문구의 단일 배치 경로. 같은 유닛의 같은 문구는 한 줄로 합치고(×n),
   * 그 밖에는 유닛과 상관없이 화면에 떠 있는 모든 문구와 겹치지 않는 위치를 찾는다.
   */
  private addPopup(x: number, y0: number, text: string, color: string, big: boolean, uid?: string): void {
    const now = this.now();
    // 피해 숫자는 합치지 않는다 (연타의 각 수치가 보여야 함)
    const mergeable = !/^[+\-]?\d+$/.test(text);
    const same = uid && mergeable ? this.popups.find((p) => p.uid === uid && p.base === text && now - p.t0 < 700) : undefined;
    if (same) {
      // 제자리에서 개수만 갱신 (다시 떠오르지 않게 현재 위치에 고정)
      same.count = (same.count ?? 1) + 1;
      same.text = `${text} ×${same.count}`;
      same.w = game.gfx.measure(same.text, popupSize(same.big), true) + 4;
      same.life = now - same.t0 + (same.big ? 1100 : 800);
      return;
    }
    const w = game.gfx.measure(text, popupSize(big), true) + 4;
    const hgt = popupH(big);
    // 행동 순서·보스 체력 막대 아래까지만 쓴다. 자리가 없으면 가장 오래된 겹치는 문구부터 치운다.
    let y = placePopup(this.popups, x, w, hgt, y0, now, this.popupObstacles(), 42);
    for (let guard = 0; y === null && guard < 8; guard++) {
      const old = this.popups.filter((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 2).sort((a, b) => a.t0 - b.t0)[0];
      if (!old) break;
      this.popups = this.popups.filter((p) => p !== old);
      y = placePopup(this.popups, x, w, hgt, y0, now, this.popupObstacles(), 42);
    }
    this.popups.push({ uid, x, y: y ?? y0, w, h: hgt, t0: now, life: big ? 1300 : 950, text, base: text, count: 1, color, big });
  }

  /** 문구가 피해야 할 고정 UI (중앙 배너, 대상 선택 안내) */
  private popupObstacles(): StaticBox[] {
    const out: StaticBox[] = [];
    const b = this.banner;
    if (b && b.until > this.now()) out.push({ x: W / 2, y: 34, w: b.w, h: b.h });
    if (this.tsel) out.push({ x: W / 2, y: 40, w: 300, h: 33 });
    // 일반 적 머리 위 체력·붕괴 막대와 상태 아이콘 (drawEnemyBar 와 같은 위치)
    for (const e of B.liveEnemies(this.st)) {
      if (ENEMIES[e.enemyId!].size === 'boss') continue;
      const barY = Math.max(40, this.headY(this.view(e)) - 9);
      out.push({ x: this.view(e).x, y: barY - 18, w: 50, h: 26 });
    }
    return out;
  }
  fx(sheet: string, x: number, y: number, flip = false): void {
    if (!game.assets.has(sheet)) return;
    this.fxs.push({ sheet, x: Math.round(x), y: Math.round(y), t0: this.now(), flip });
  }
  proj(sheet: string, from: [number, number], to: [number, number], dur = 110): void {
    if (!game.assets.has(sheet)) return;
    this.projs.push({ sheet, x0: from[0], y0: from[1], x1: to[0], y1: to[1], t0: this.now(), dur });
  }
  shake(a: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, a * game.settings.shake);
  }
  flash(a: number): void {
    this.flashA = Math.max(this.flashA, a * game.settings.flash);
  }
  hitstop(ms: number): void {
    this.stopUntil = performance.now() + ms;
  }
  showBanner(text: string, sub = '', icon: string | null = null, ms = 1400): void {
    const w = Math.max(game.gfx.measure(text, 11, true), game.gfx.measure(sub, 8)) + (icon ? 44 : 28);
    this.banner = { text, sub, icon, until: this.now() + ms, t0: this.now(), w, h: sub ? 34 : 22 };
  }
  *moveTo(v: View, x: number, y: number, ms: number): Gen {
    v.tween = { x0: v.x, y0: v.y, x1: x, y1: y, t0: this.now(), dur: ms };
    yield () => v.tween === null;
  }
  *hint(id: string): Gen {
    let done = false;
    hintOnce(id, () => (done = true));
    yield () => done;
  }
  /** 이 상태가 만들어진 뒤 들어온 입력 (performance.now 축 → 게임 시계) */
  presses(a: import('../input/input').Action, since: number): number[] {
    return game.input.events.filter((e) => e.action === a && e.down && !e.repeat && e.t >= since).map((e) => this.clock.fromReal(e.t));
  }
  releases(a: import('../input/input').Action, since: number): number[] {
    return game.input.events.filter((e) => e.action === a && !e.down && e.t >= since).map((e) => this.clock.fromReal(e.t));
  }

  /* ============================================================ 이벤트 처리 */

  drain(): void {
    const evs = this.st.events;
    this.st.events = [];
    for (const e of evs) {
      const u = 'uid' in e && e.uid ? B.byUid(this.st, e.uid) : undefined;
      switch (e.t) {
        case 'dmg': {
          if (!u) break;
          const v = this.view(u);
          if (e.absorbed) this.popup(u, `${L.battle.shieldUp} -${e.absorbed}`, COL.echo);
          if (e.n <= 0 && !e.absorbed) break;
          if (e.n > 0) this.popup(u, String(e.n), u.side === 'ally' ? COL.bad : e.weak ? COL.gold : COL.white, !!e.big || !!e.weak);
          v.flashUntil = this.now() + 90;
          if (u.alive && !v.frameFn && v.anim.name !== 'counter' && e.n > 0) {
            const busy = u.side === 'ally' && ['attack', 'skill', 'skill2', 'support', 'parry', 'dodge', 'jump', 'counter'].includes(v.anim.name) && !v.anim.done(game.assets);
            if (!busy) this.play(v, 'hurt');
          }
          if (u.side === 'enemy') this.shake(e.big ? 3 : 1.5);
          break;
        }
        case 'heal': if (u && e.n > 0) { this.popup(u, `+${e.n}`, COL.good); const [x, y] = this.center(this.view(u)); this.fx('fx_heal', x, y); } break;
        case 'text': if (u) this.popup(u, e.s, e.color ?? COL.bone, !!e.big); else this.showBanner(e.s); break;
        case 'status': if (u) this.popup(u, L.status[e.id], u.side === 'ally' && ['burn', 'slow', 'daze', 'vulnerable', 'exposed'].includes(e.id) ? COL.bad : COL.echo); break;
        case 'breakReady': audio.sfx('weak'); break;
        case 'break': {
          if (!u) break;
          const v = this.view(u);
          const [x, y] = this.center(v);
          // 이미 발동했으므로 '붕괴 가능' 문구는 치운다
          this.popups = this.popups.filter((p) => !(p.uid === u.uid && p.base === L.battle.breakReady));
          this.fx('fx_break', x, y);
          this.play(v, 'break');
          this.flash(0.28);
          this.shake(5);
          this.hitstop(140);
          game.ui.announce(L.battle.enemyBroken(u.name));
          break;
        }
        case 'ko': {
          if (!u) break;
          const v = this.view(u);
          if (u.side === 'enemy') { this.play(v, 'death'); v.deadAt = this.now(); audio.sfx('break'); }
          else { this.play(v, 'defeat'); audio.sfx('hurt'); }
          break;
        }
        case 'revive': if (u) this.play(this.view(u), 'idle'); break;
        case 'ap': if (u && !this.react) this.popup(u, `행동력 +${e.n}`, COL.ap); break;
        case 'res': this.flash(0.25); break;
        case 'mark': if (u) { const v = this.view(u); this.fx(`fx_mark_${e.m}`, v.x, this.headY(v) + 8); this.popup(u, `${L.markName[e.m]} 표식`, COL.gold); } break;
        case 'detonate': if (u) { const [x, y] = this.center(this.view(u)); this.fx('fx_break', x, y); this.shake(3); } break;
        case 'part': if (u) { const [x, y] = this.center(this.view(u)); this.fx('fx_break', x, y); this.flash(0.4); this.shake(4); audio.sfx('break'); } break;
        case 'summon': if (u) { const v = this.view(u); v.appear = this.now(); this.fx('fx_dust', v.x, v.y); } break;
        case 'sfx': audio.sfx(e.s); break;
        case 'phase': this.pendingPhase = { uid: e.uid, line: e.line }; break;
        case 'charge': if (u) this.popup(u, `충전 +${e.n}`, COL.ember); break;
        case 'stance': if (u) this.popup(u, `자세: ${L.stance[e.s]}`, COL.echo); break;
        case 'sigil': break;
      }
    }
  }

  /* ============================================================ 메인 루프 (전투 상태 머신) */

  private *loop(): Gen {
    yield* this.intro();
    while (!this.st.over) {
      const u = B.nextActor(this.st);
      if (!u) break;
      const { skip } = B.turnStart(this.st, u);
      this.current = u;
      this.drain();
      if (this.st.over) break;
      if (skip || !u.alive) {
        if (u.alive) this.play(this.view(u), this.idleName(u));
        yield 520;
      } else if (u.side === 'ally') {
        game.ui.announce(L.battle.turnOf(u.name));
        yield* this.allyTurn(u);
      } else yield* this.enemyTurn(u);
      this.drain();
      if (this.pendingPhase) yield* this.phaseSeq();
      if (u.enemyId === 'nest' && u.alive) u.flags.heart = ((u.flags.heart ?? 0) + 1) % 3;
      B.endTurn(this.st, u);
      this.current = null;
      this.drain();
      yield 160;
    }
    this.closeMenus();
    if (this.st.over === 'victory') yield* this.victorySeq();
    else yield* this.defeatSeq();
  }

  private *intro(): Gen {
    this.phase = 'intro';
    for (const v of this.views.values()) {
      const dx = v.u.side === 'ally' ? -110 : 130;
      v.x = v.hx + dx;
      v.tween = { x0: v.x, y0: v.y, x1: v.hx, y1: v.hy, t0: this.now(), dur: 520 };
    }
    if (this.adv === 'party') { this.showBanner(L.battle.preemptive, '아군이 먼저 움직인다', 'star'); audio.sfx('perfect'); }
    else if (this.adv === 'enemy') { this.showBanner(L.battle.ambushed, '적이 먼저 움직인다', 'tell_unblock'); audio.sfx('tellUnblock'); }
    else if (this.group.boss) {
      const boss = B.enemies(this.st)[0];
      this.showBanner(boss.name, '수호자', 'star', 1800);
      audio.sfx('bossTell');
    }
    yield 720;
    const t = this.group.tutorial;
    if (t === 'break' || t === 'status' || t === 'jump2') yield* this.hint(t);
  }

  private *allyTurn(u: Unit): Gen {
    const v = this.view(u);
    if (this.firstSelect) {
      this.firstSelect = false;
      if (this.group.tutorial === 'basics') yield* this.hint('basics');
      if (this.group.tutorial === 'aim') yield* this.hint('aim');
    }
    if (this.st.resonance >= RES.seg) yield* this.hint('resonance');
    for (;;) {
      this.phase = 'select';
      this.chosen = null;
      if (game.bot?.active && !game.bot.manual) this.chosen = game.bot.choose(this, u);
      else this.openCommand(u);
      yield () => this.chosen !== null;
      this.closeMenus();
      this.phase = 'act';
      const ok = yield* this.exec(u, this.chosen!);
      if (ok) break;
    }
    if (u.alive) this.play(v, 'idle');
  }

  /** 행동 실행. false = 취소(메뉴로 돌아감) */
  private *exec(u: Unit, a: Act): Gen<boolean> {
    switch (a.k) {
      case 'attack':
        if (this.group.tutorial === 'basics') yield* this.hint('timing');
        yield* this.doAttack(u, a.t);
        return true;
      case 'skill':
        if (a.s.timing && this.group.tutorial === 'basics') yield* this.hint('timing');
        yield* this.doSkill(u, a.s, a.targets, a.res ?? 0);
        return true;
      case 'aim':
        return yield* this.doAim(u, a.t);
      case 'item':
        yield* this.doItem(u, a.id, a.t);
        return true;
    }
  }

  private melee(u: Unit): boolean {
    return u.charId === 'kael' || u.charId === 'orin';
  }

  private *approachEnemy(u: Unit, t: Unit): Gen {
    const tv = this.view(t);
    yield* this.moveTo(this.view(u), tv.x - REACH[this.sizeOf(t)], tv.y + 2, 230);
  }
  private *returnHome(u: Unit): Gen {
    const v = this.view(u);
    if (v.x !== v.hx || v.y !== v.hy) yield* this.moveTo(v, v.hx, v.hy, 240);
  }

  /** 명중 연출: 근접은 대상 위, 원거리는 투사체 */
  private hitFx(u: Unit, t: Unit, sheet: string | undefined): void {
    const tv = this.view(t);
    const [cx, cy] = this.center(tv);
    const uv = this.view(u);
    if (u.charId === 'sera' && !(sheet ?? '').startsWith('fx_mark')) {
      this.proj('fx_arrow', this.attachPt(uv, 'tip') ?? this.center(uv), [cx, cy], 90);
      this.fx(sheet && sheet !== 'fx_hit' ? sheet : 'fx_hit', cx, cy);
      return;
    }
    if (sheet === 'fx_muzzle') {
      const m = this.attachPt(uv, 'muzzle') ?? this.center(uv);
      this.fx('fx_muzzle', m[0], m[1]);
      this.proj('fx_shot', m, [cx, cy], 90);
      this.fx('fx_hit', cx, cy);
      return;
    }
    if (u.charId === 'mira' && (!sheet || sheet === 'fx_hit')) {
      this.proj('fx_bolt', this.attachPt(uv, 'tip') ?? this.center(uv), [cx, cy], 100);
    }
    this.fx(sheet ?? 'fx_hit', cx, cy);
  }

  private gradeFeedback(g: Grade, at: [number, number]): void {
    const text = g === 'perfect' ? L.battle.perfect : g === 'good' ? L.battle.good : L.battle.fail;
    const color = g === 'perfect' ? COL.gold : g === 'good' ? COL.echo : COL.boneDim;
    this.addPopup(at[0], at[1] - 18 - popupH(g === 'perfect'), g === 'perfect' ? `★ ${text}` : text, color, g === 'perfect');
    audio.sfx(g === 'perfect' ? 'perfect' : g === 'good' ? 'good' : 'miss');
  }

  /* ---------------- 공격 타이밍 ---------------- */

  *timed(u: Unit, anim: string, spec: TimingSpec, at: () => [number, number], onBeat: (i: number, g: Grade) => void, party?: Unit[]): Gen<Grade[]> {
    if (spec.type === 'hold') return yield* this.holdTimed(u, anim, at, onBeat);
    const v = this.view(u);
    const a = game.assets.anim(this.sheetOf(u), anim);
    const now = this.now();
    let beats: number[];
    const performers = party && party.length ? party : [u];
    if (spec.type === 'rhythm') {
      const first = now + ATTACK_TIMING.rhythmLead;
      beats = Array.from({ length: spec.beats }, (_, i) => first + i * spec.interval);
      performers.forEach((p, k) => {
        const pv = this.view(p);
        const pa = game.assets.anim(this.sheetOf(p), anim);
        const ant = Math.max(0, pa.tags.indexOf('anticipation'));
        const con = Math.max(0, pa.tags.indexOf('contact'));
        pv.frameFn = (t) => {
          let idx = ant;
          for (let i = k; i < beats.length; i += performers.length) if (t >= beats[i] - 40 && t < beats[i] + 120) idx = con;
          return { anim, idx };
        };
      });
    } else {
      const contacts = a.tags.map((t, i) => (t === 'contact' ? i : -1)).filter((i) => i >= 0);
      const use = spec.type === 'tap' ? contacts.slice(0, 1) : contacts;
      if (!use.length) use.push(Math.floor(a.frames.length / 2));
      const offs = use.map((ci) => frameStart(a, ci));
      this.play(v, anim);
      v.animStart = now + Math.max(160, ATTACK_TIMING.ringLead - offs[0]);
      beats = offs.map((o) => v.animStart + o);
    }
    const tm: TimingState = {
      kind: spec.type, beats, tracker: new BeatTracker(beats, timingWindows(this.diff)), applied: beats.map(() => false), onBeat, auto: this.autoTiming, at, since: performance.now(),
    };
    this.timing = tm;
    yield () => tm.applied.every(Boolean);
    this.timing = null;
    if (spec.type === 'rhythm') {
      for (const p of performers) this.view(p).frameFn = null;
      yield 200;
    } else yield () => this.now() >= v.animStart + animLength(a);
    return tm.tracker.grades.map((g) => g ?? 'fail');
  }

  private *holdTimed(u: Unit, anim: string, at: () => [number, number], onBeat: (i: number, g: Grade) => void): Gen<Grade[]> {
    const v = this.view(u);
    const a = game.assets.anim(this.sheetOf(u), anim);
    let holdIdx = a.tags.indexOf('hold');
    if (holdIdx < 0) holdIdx = Math.max(0, a.tags.indexOf('anticipation'));
    let conIdx = a.tags.indexOf('contact');
    if (conIdx < 0) conIdx = a.frames.length - 1;
    const resume = Math.min(holdIdx + 1, conIdx);
    this.play(v, anim);
    v.frameFn = () => ({ anim, idx: 0 });
    const hs: NonNullable<TimingState['hold']> = { phase: 'wait', pressT: 0, target: 0, deadline: this.now() + ATTACK_TIMING.holdStartTimeout, late: false, grade: 'fail' };
    const tm: TimingState = { kind: 'hold', beats: [], tracker: new BeatTracker([], timingWindows(this.diff)), applied: [], onBeat, auto: this.autoTiming, at, since: performance.now(), hold: hs };
    this.timing = tm;
    yield () => hs.phase === 'done';
    this.gradeFeedback(hs.grade, at());
    v.frameFn = null;
    this.play(v, anim);
    v.animStart = this.now() - frameStart(a, resume);
    const contactT = v.animStart + frameStart(a, conIdx);
    yield () => this.now() >= contactT;
    onBeat(0, hs.grade);
    this.timing = null;
    yield () => this.now() >= v.animStart + animLength(a);
    return [hs.grade];
  }

  private updateTiming(): void {
    const tm = this.timing;
    if (!tm) return;
    const now = this.now();
    if (tm.hold) {
      const hs = tm.hold;
      const v = this.current ? this.view(this.current) : null;
      if (hs.phase === 'wait') {
        const p = this.presses('confirm', tm.since)[0];
        if (tm.auto) hs.pressT = now;
        else if (p !== undefined) hs.pressT = p;
        else if (now > hs.deadline) { hs.pressT = now; hs.late = true; }
        if (tm.auto || p !== undefined || hs.late) {
          hs.phase = 'hold';
          hs.target = hs.pressT + ATTACK_TIMING.holdFill * ATTACK_TIMING.holdTarget;
          hs.deadline = hs.pressT + ATTACK_TIMING.holdTimeout;
          audio.sfx('charge');
          if (v && v.frameFn) {
            const anim = v.anim.name;
            const a = game.assets.anim(this.sheetOf(v.u), anim);
            let hi = a.tags.indexOf('hold');
            if (hi < 0) hi = Math.max(0, a.tags.indexOf('anticipation'));
            v.frameFn = () => ({ anim, idx: hi });
          }
        }
      }
      if (hs.phase === 'hold') {
        const r = this.releases('confirm', tm.since).find((t) => t >= hs.pressT);
        if (tm.auto && now >= hs.target) { hs.grade = 'good'; hs.phase = 'done'; }
        else if (hs.late && now >= hs.target) { hs.grade = 'fail'; hs.phase = 'done'; }
        else if (!tm.auto && !hs.late && r !== undefined) { hs.grade = gradeHold(r, hs.target, timingWindows(this.diff)); hs.phase = 'done'; }
        else if (now > hs.deadline) { hs.grade = 'fail'; hs.phase = 'done'; }
      }
      return;
    }
    const tr = tm.tracker;
    if (tm.auto) {
      tm.beats.forEach((b, i) => { if (tr.grades[i] === null && now >= b) tr.grades[i] = 'good'; });
    } else {
      for (const p of this.presses('confirm', tm.since)) {
        const i = tr.press(p);
        if (i >= 0) this.gradeFeedback(tr.grades[i]!, tm.at());
      }
      for (const i of tr.advance(now)) { void i; this.gradeFeedback('fail', tm.at()); }
    }
    tm.beats.forEach((b, i) => {
      if (!tm.applied[i] && tr.grades[i] !== null && now >= b) {
        tm.applied[i] = true;
        tm.onBeat(i, tr.grades[i]!);
        this.drain();
      }
    });
  }

  /* ---------------- 기본 공격 ---------------- */

  private *doAttack(u: Unit, t: Unit): Gen {
    const c = CHARS[u.charId!];
    this.showBanner(c.basic.name, '행동력 생성', 'tm_tap', 900);
    if (this.melee(u)) yield* this.approachEnemy(u, t);
    yield* this.timed(u, 'attack', { type: 'tap' }, () => this.center(this.view(t)), (_, g) => {
      if (!t.alive) return;
      B.basicAttack(this.st, u, t, g);
      this.hitFx(u, t, c.basic.fx);
      audio.sfx(c.basic.sfx);
    });
    this.drain();
    yield* this.returnHome(u);
  }

  /* ---------------- 기술 ---------------- */

  private *doSkill(u: Unit, s: SkillDef, targets: Unit[], resSegs: number): Gen {
    if (resSegs) {
      B.spendRes(this.st, resSegs);
      this.flash(0.35);
      audio.sfx('resonance');
    }
    const a = game.assets.anim(this.sheetOf(u), s.anim);
    const contacts = a.tags.filter((t) => t === 'contact').length || 1;
    const hitCount = !s.timing ? 1 : s.timing.type === 'rhythm' ? s.timing.beats : s.timing.type === 'multi' ? contacts : 1;
    const run = B.beginSkill(this.st, u, s, targets, hitCount);
    this.showBanner(s.name, resSegs ? `공명 ${resSegs}칸` : s.role, s.timing ? `tm_${s.timing.type}` : 'book', 1100);
    this.drain();
    const enemyT = targets.filter((t) => t.side === 'enemy');
    const moved = this.melee(u) && s.anim !== 'support' && !!s.power && enemyT.length > 0;
    if (moved) {
      if (s.target === 'enemy') yield* this.approachEnemy(u, enemyT[0]);
      else {
        const xs = enemyT.map((t) => this.view(t).x);
        yield* this.moveTo(this.view(u), Math.min(...xs) - 60, 196, 240);
      }
    }
    const party = s.special === 'party_link' ? B.liveAllies(this.st) : undefined;
    if (party) for (const p of party) if (p !== u) void p;
    if (!s.timing) {
      const v = this.view(u);
      this.play(v, s.anim);
      const ci = Math.max(0, a.tags.indexOf('contact'));
      const ct = v.animStart + frameStart(a, ci);
      yield () => this.now() >= ct;
      B.finishSkill(this.st, run, 'good');
      if (s.fx) for (const t of targets) { const [x, y] = this.center(this.view(t)); this.fx(s.fx, x, y); }
      if (s.sfx) audio.sfx(s.sfx);
      this.drain();
      yield () => this.now() >= v.animStart + animLength(a);
    } else {
      const focus = enemyT[0] ?? targets[0] ?? u;
      const grades = yield* this.timed(u, s.anim, s.timing, () => this.center(this.view(focus.alive ? focus : (B.liveEnemies(this.st)[0] ?? u))), (i, g) => {
        run.grades.push(g);
        const performer = party ? party[i % party.length] : u;
        for (const t of run.targets) {
          if (t.side !== 'enemy' || !t.alive) continue;
          B.skillHit(this.st, run, t, g);
          this.hitFx(performer, t, s.fx);
        }
        if (s.sfx) audio.sfx(s.sfx);
        if (g === 'perfect') this.shake(2);
      }, party);
      B.finishSkill(this.st, run, aggregate(grades));
      if (s.fx && !s.power) for (const t of targets) { const [x, y] = this.center(this.view(t)); this.fx(s.fx, x, y); }
      this.drain();
    }
    if (moved) yield* this.returnHome(u);
  }

  /* ---------------- 아이템 ---------------- */

  private *doItem(u: Unit, id: string, t: Unit): Gen {
    const v = this.view(u);
    this.showBanner(ITEMS[id].name, '아이템', ITEMS[id].icon, 900);
    this.play(v, 'support');
    const a = game.assets.anim(this.sheetOf(u), 'support');
    const ct = v.animStart + frameStart(a, Math.max(0, a.tags.indexOf('contact')));
    yield () => this.now() >= ct;
    if (B.useItemInBattle(this.st, u, id, t)) {
      const s = game.save!;
      s.items[id] = Math.max(0, (s.items[id] ?? 0) - 1);
    }
    this.drain();
    yield () => this.now() >= v.animStart + animLength(a);
  }

  /* ---------------- 정밀 조준 ---------------- */

  private *doAim(u: Unit, t: Unit): Gen<boolean> {
    const uv = this.view(u), tv = this.view(t);
    this.phase = 'aim';
    this.play(uv, 'aim');
    const hv = this.height(tv);
    const zx = 240, zy = Math.min(262, Math.round(140 + (hv * AIM.zoom) / 2));
    const s = game.assets.sheet(this.sheetOf(t));
    void s;
    const [cx0, cy0] = [zx, Math.round(zy - (hv * AIM.zoom) / 2)];
    this.aim = {
      u, t, cx: cx0, cy: cy0, zx, zy, start: this.now(), limit: AIM.timeLimit + (B.hasP(u, 'hunter') ? 2000 : 0), fired: null, cancelled: false, point: null, since: performance.now(),
    };
    audio.sfx('aimZoom');
    yield () => !!this.aim && (this.aim.fired !== null || this.aim.cancelled);
    const aim = this.aim!;
    this.aim = null;
    if (aim.cancelled) {
      this.play(uv, 'idle');
      return false;
    }
    this.phase = 'act';
    const res = aim.fired!;
    const pt = aim.point ?? this.center(tv);
    const from = this.attachPt(uv, u.charId === 'orin' ? 'muzzle' : 'tip') ?? this.center(uv);
    const fxs = CHARS[u.charId!].aimFx;
    if (fxs === 'fx_slash') this.fx('fx_slash', pt[0], pt[1]);
    else this.proj(fxs, from, pt, 110);
    audio.sfx(u.charId === 'orin' ? 'shot' : u.charId === 'mira' ? 'magic' : 'slash');
    yield 110;
    B.aimShot(this.st, u, t, res);
    if (res.kind !== 'miss') this.fx(res.kind === 'weak' ? 'fx_break' : 'fx_hit', pt[0], pt[1]);
    if (res.kind === 'weak') { this.flash(0.3); this.hitstop(90); }
    this.drain();
    yield 520;
    return true;
  }

  /** 조준점 명중 판정 (실제 스프라이트 픽셀과 약점 좌표 사용) */
  aimResult(a: AimState): B.AimResult {
    const tv = this.view(a.t);
    const sheet = this.sheetOf(a.t);
    const s = game.assets.sheet(sheet);
    const fx = (a.cx - a.zx) / AIM.zoom + s.anchor[0];
    const fy = (a.cy - a.zy) / AIM.zoom + s.anchor[1];
    a.point = this.toWorld(tv, fx, fy);
    for (const w of this.weakOf(tv)) {
      if (Math.hypot(fx - w.x, fy - w.y) <= w.hit) {
        const def = ENEMIES[a.t.enemyId!];
        if (def.weak[w.id] && !(def.weak[w.id].part && a.t.parts.includes(def.weak[w.id].part!))) return { kind: 'weak', id: w.id };
      }
    }
    if (game.assets.opaqueAt(sheet, this.globalFrame(tv), fx, fy)) return { kind: 'body' };
    return { kind: 'miss' };
  }

  fireAim(): void {
    const a = this.aim;
    if (!a || a.fired) return;
    a.fired = this.aimResult(a);
  }

  private updateAim(dt: number): void {
    const a = this.aim;
    if (!a || a.fired || a.cancelled) return;
    const inp = game.input;
    if (inp.mouse.moved) { a.cx = inp.mouse.x; a.cy = inp.mouse.y; }
    const [ax, ay] = inp.axis();
    a.cx = Math.max(0, Math.min(W - 1, a.cx + ax * AIM.cursorSpeed * dt));
    a.cy = Math.max(0, Math.min(H - 1, a.cy + ay * AIM.cursorSpeed * dt));
    if (game.bot?.active) return;
    const fresh = inp.events.some((e) => e.t >= a.since && e.down && !e.repeat && e.action === 'confirm');
    if (fresh || (inp.mouse.clicked && inp.mouse.clickT >= a.since)) this.fireAim();
    else if (inp.events.some((e) => e.t >= a.since && e.down && e.action === 'cancel')) { a.cancelled = true; audio.sfx('cancel'); }
    else if (this.now() - a.start > a.limit) this.fireAim();
  }

  /* ---------------- 적 턴 ---------------- */

  private *enemyTurn(e: Unit): Gen {
    this.phase = 'enemy';
    const v = this.view(e);
    const choice = B.chooseEnemyAction(this.st, e);
    this.drain();
    if (choice.kind === 'wait') {
      this.popup(e, L.battle.sealed, COL.boneDim);
      yield 500;
      return;
    }
    const a = choice.atk;
    if (choice.kind === 'prep') {
      this.showBanner(L.battle.prep(a.name), L.battle.prepWarn, 'tell_unblock', 1600);
      audio.sfx('bossTell');
      game.ui.announce(`${L.battle.prep(a.name)} ${L.battle.prepWarn}`);
      const seg = a.segs[0].anim;
      v.frameFn = () => ({ anim: seg, idx: 0 });
      this.flash(0.2);
      yield 1300;
      v.frameFn = null;
      this.play(v, this.idleName(e));
      return;
    }
    const plan = planAttack(a, game.assets.sheet(this.sheetOf(e)).anims, DIFFICULTY[this.diff].extraPatterns);
    const targets = choice.targets.filter((t) => t.alive);
    if (!plan.hits.length || !targets.length) {
      const seg = a.segs[0].anim;
      this.play(v, seg);
      this.showBanner(a.name, '', null, 900);
      // 대기 복귀가 먼저 일어나도 멈추지 않도록 경과 시간으로 기다린다
      const end = v.animStart + animLength(game.assets.anim(this.sheetOf(e), seg));
      yield () => this.now() >= end;
      B.enemySpecial(this.st, e, a);
      this.drain();
      yield 260;
      return;
    }
    // 예고 (ENEMY_TELEGRAPH)
    const kind = a.kind;
    const kinds = new Set<HitKind>(plan.hits.map((x) => x.kind));
    const icon = kinds.has('ground') ? 'tell_ground' : kinds.has('unblockable') ? 'tell_unblock' : 'tell_normal';
    this.showBanner(a.name, [...kinds].map((k) => L.hitKind[k]).join(' · '), icon, 1100 + plan.total);
    audio.sfx(a.tell ?? (kind === 'ground' ? 'tellGround' : kind === 'unblockable' ? 'tellUnblock' : 'tellNormal'));
    game.ui.announce(`${e.name}: ${a.name} — ${[...kinds].map((k) => L.hitKind[k]).join(', ')}`);
    this.targetMark = targets;
    if (this.firstEnemyAttack) {
      this.firstEnemyAttack = false;
      const t = this.group.tutorial;
      if (t === 'basics') yield* this.hint('dodge');
      if (t === 'parry') yield* this.hint('parry');
      if (t === 'combo') yield* this.hint('combo');
    }
    yield 620;
    if (a.approach && targets.length === 1) {
      const tv = this.view(targets[0]);
      yield* this.moveTo(v, tv.x + APPROACH[this.sizeOf(e)], tv.y + 1, 300);
    }
    // 반응 (ENEMY_REACTION → ENEMY_RESOLUTION)
    const start = this.now() + 60;
    const tracker = new ReactionTracker(plan.hits, windowsFor(this.diff, game.settings.reactionAssist), start);
    const r: ReactState = { plan, tracker, attacker: e, targets, atk: a, start, since: performance.now(), fxDone: plan.hits.map(() => false) };
    // 입력 버퍼: 단계 진입 직전 입력도 타임스탬프로 평가 (판정 폭 밖이면 잠그지 않고 버림)
    for (const ev of game.input.events) {
      if (!ev.down || ev.repeat || performance.now() - ev.t > REACT.bufferMs) continue;
      const type = ev.action === 'parry' || ev.action === 'dodge' || ev.action === 'jump' ? ev.action : null;
      if (type) { const i = tracker.pressBuffered(type, this.clock.fromReal(ev.t)); if (i >= 0) this.resolveHit(r, i, type); }
    }
    v.frameFn = (now) => { const f = frameOfPlan(plan, now - start); return { anim: f.anim, idx: f.idx }; };
    this.react = r;
    yield () => this.now() > start + plan.total && tracker.done();
    v.frameFn = null;
    this.react = null;
    this.play(v, this.idleName(e));
    const allParried = tracker.allParried();
    const allJumped = tracker.allJumped();
    this.targetMark = [];
    this.drain();
    // 반격 (COUNTER) — 한 공격의 모든 타격을 패링했을 때 1회
    if (allParried && e.alive && targets[0].alive && !this.st.over) yield* this.counterSeq(targets[0], e, plan.hits.length);
    if (allJumped) for (const t of targets) if (t.alive) B.allJumpedBonus(this.st, t);
    B.enemySpecial(this.st, e, a);
    B.finishEnemyAttack(this.st, e);
    this.drain();
    if (a.approach && e.alive) yield* this.moveTo(v, v.hx, v.hy, 300);
  }

  private updateReact(): void {
    const r = this.react;
    if (!r) return;
    const now = this.now();
    for (const ev of game.input.events) {
      if (!ev.down || ev.repeat || ev.t < r.since) continue;
      const type = ev.action === 'parry' || ev.action === 'dodge' || ev.action === 'jump' ? (ev.action as ReactKind) : null;
      if (!type) continue;
      const t = this.clock.fromReal(ev.t);
      const res = r.tracker.press(type, t);
      if (res === -2) continue;
      for (const tgt of r.targets) if (tgt.alive) this.play(this.view(tgt), type);
      if (type === 'jump') audio.sfx('jump');
      else if (res < 0) audio.sfx('whiff');
      if (res >= 0) this.resolveHit(r, res, type);
    }
    for (const i of r.tracker.advance(now)) this.resolveHit(r, i, 'hit');
    // 공격 이펙트는 실제 접촉 시각에
    r.plan.hits.forEach((hi, i) => {
      if (r.fxDone[i] || now < r.start + hi.t) return;
      r.fxDone[i] = true;
      if (r.atk.fx) for (const t of r.targets) {
        const tv = this.view(t);
        if (r.atk.fx === 'fx_wave') this.fx('fx_wave', tv.x, tv.y);
        else { const [x, y] = this.center(tv); this.fx(r.atk.fx, x, y); }
      }
      if (hi.kind === 'ground') this.shake(2.5);
    });
  }

  private resolveHit(r: ReactState, i: number, result: 'parry' | 'dodge' | 'jump' | 'hit'): void {
    const hit = r.plan.hits[i];
    const T = r.tracker.hitTime(i);
    for (const tgt of r.targets) {
      if (!tgt.alive) continue;
      const guardMiss = result === 'hit' && tgt.charId === 'kael' && tgt.stance === 'guard' && r.tracker.presses.some((p) => p.type === 'parry' && p.outcome !== 'success' && Math.abs(p.t - T) < 260);
      B.resolveEnemyHit(this.st, r.attacker, tgt, r.atk, hit.power, result, guardMiss);
      const tv = this.view(tgt);
      const [cx, cy] = this.center(tv);
      if (result === 'parry') { this.fx('fx_parry', cx + 14, cy - 4); this.flash(0.12); }
      if (result === 'hit') { this.fx('fx_hit', cx, cy); this.shake(3); if (guardMiss) this.popup(tgt, '수호 — 피해 절반', COL.echo); }
    }
    this.drain();
  }

  private *counterSeq(u: Unit, e: Unit, hits: number): Gen {
    this.phase = 'counter';
    const uv = this.view(u), ev = this.view(e);
    this.showBanner(L.battle.counter, hits > 1 ? `${hits}연속 완전 패링` : '완벽 패링', 'star', 1000);
    audio.sfx('counter');
    const dist = Math.abs(ev.x - uv.x);
    if (dist > 70) yield* this.moveTo(uv, ev.x - REACH[this.sizeOf(e)], ev.y + 1, 150);
    this.play(uv, 'counter');
    const a = game.assets.anim(this.sheetOf(u), 'counter');
    const ci = Math.max(0, a.tags.indexOf('contact'));
    const ct = uv.animStart + frameStart(a, ci);
    yield () => this.now() >= ct;
    B.counterAttack(this.st, u, e, hits);
    const [x, y] = this.center(ev);
    this.fx('fx_counter', x - 6, y);
    this.flash(0.18);
    this.shake(5);
    this.hitstop(110);
    this.drain();
    yield () => this.now() >= uv.animStart + animLength(a);
    yield* this.returnHome(u);
  }

  private *phaseSeq(): Gen {
    const p = this.pendingPhase!;
    this.pendingPhase = null;
    const u = B.byUid(this.st, p.uid);
    if (!u) return;
    const v = this.view(u);
    this.flash(0.5);
    this.shake(7);
    audio.sfx('break');
    audio.sfx('bossTell');
    this.play(v, 'idle');
    v.appear = this.now();
    this.showBanner(L.battle.phase(u.phase), p.line, 'star', 2600);
    game.ui.announce(`${L.battle.phase(u.phase)}. ${p.line}`);
    yield 2400;
  }

  /* ---------------- 승리·패배 ---------------- */

  private *victorySeq(): Gen {
    this.phase = 'victory';
    audio.music(null);
    audio.sfx('victory');
    for (const v of this.views.values()) if (v.u.side === 'ally' && v.u.alive) this.play(v, 'victory');
    this.showBanner(L.battle.victory, '', 'star', 1800);
    yield 1100;
    const lines = this.applyRewards();
    let closed = false;
    this.showResults(lines, () => (closed = true));
    yield () => closed;
    this.finish({ result: 'victory' });
  }

  private *defeatSeq(): Gen {
    this.phase = 'defeat';
    audio.music(null);
    audio.sfx('defeat');
    yield 1300;
    this.showDefeat();
  }

  private finish(info: BattleEndInfo): void {
    if (this.ended) return;
    this.ended = true;
    this.closeMenus();
    this.onEnd(info);
  }

  retry(): void {
    const s = game.save!;
    s.items = { ...this.itemSnap };
    this.ended = true;
    this.closeMenus();
    game.fadeTo(() => game.setScene(new BattleScene(this.group, this.adv, this.onEnd)));
  }

  private applyRewards(): string[] {
    const s = game.save!, st = this.st, lines: string[] = [];
    const dead = B.enemies(st).filter((e) => !e.alive);
    let xp = 0, money = 0;
    for (const e of dead) {
      const d = ENEMIES[e.enemyId!];
      const lv = e.summoned ? 1 : this.group.lv;
      xp += d.xp * lv;
      money += Math.round(d.money * lv);
    }
    xp = Math.round(xp);
    s.money += money;
    lines.push(`${L.battle.xp} +${xp}   ·   ${MONEY_NAME} +${money}`);
    const got: string[] = [];
    for (const e of dead) for (const dr of ENEMIES[e.enemyId!].drops ?? []) if (st.rng.chance(dr.chance)) { addItem(s, dr.item, 1); got.push(itemLabel(dr.item)); }
    for (const [it, n] of this.group.loot ?? []) { addItem(s, it, n); got.push(itemLabel(it, n)); }
    if (got.length) lines.push(`${L.battle.rewards}: ${got.join(', ')}`);
    for (const a of B.allies(st)) s.chars[a.charId!].hp = a.alive ? a.hp : 1;
    for (const c of s.roster) {
      const share = s.active.includes(c) ? 1 : XP.benchShare;
      for (const up of grantXp(s, c, xp * share)) {
        lines.push(L.battle.levelUp(CHARS[c].name, up.level));
        for (const sk of up.learned) lines.push(L.battle.learned(CHARS[c].name, SKILLS[sk].name));
        audio.sfx('levelup');
      }
    }
    const masteryLines: string[] = [];
    const unlocked = applyBattleMastery(s, st.relicTriggers);
    const seen = new Set<string>();
    for (const c of s.active) for (const r of s.chars[c].relics) {
      if (!r || seen.has(r)) continue;
      seen.add(r);
      const def = RELICS[r];
      masteryLines.push(s.echoesUnlocked.includes(r) && !unlocked.includes(r) ? `${def.name} — 숙련 완료` : `${def.name} ${L.battle.mastery} ${Math.min(def.mastery, s.relicMastery[r] ?? 0)}/${def.mastery}`);
    }
    if (masteryLines.length) lines.push(masteryLines.join('   ·   '));
    for (const r of unlocked) { lines.push(`★ ${L.battle.echoUnlocked(RELICS[r].name)}`); audio.sfx('unlock'); }
    s.stats.battles++;
    s.stats.perfectParries += st.stats.perfectParries;
    s.stats.counters += st.stats.counters;
    s.stats.breaks += st.stats.breaks;
    s.stats.weakHits += st.stats.weakHits;
    if (this.group.boss) {
      const id = this.group.enemies[0];
      if (!s.bosses.includes(id)) s.bosses.push(id);
    }
    return lines;
  }

  /* ============================================================ 명령 메뉴 (DOM, 키보드·마우스·보조기기) */

  private pushMenu(m: Modal): void {
    this.menus.push(m);
    game.ui.push(m);
  }
  closeMenus(): void {
    for (const m of this.menus) game.ui.pop(m);
    this.menus = [];
  }
  private choose(a: Act): void {
    this.closeMenus();
    this.chosen = a;
  }
  private panel(title: string, menu: Menu, style: string, extra: HTMLElement[] = [], passthrough = true): Modal {
    const el = h('section', { class: 'panel', style, role: 'dialog', 'aria-label': title }, h('h3', { text: title }), menu.el, ...extra);
    return { el, handle: (i) => menu.handle(i), passthrough };
  }

  private selectTarget(list: Unit[], all: boolean, onPick: (t: Unit[]) => void, onCancel: () => void): void {
    this.closeMenus();
    if (!list.length) { audio.sfx('error'); onCancel(); return; }
    this.phase = 'target';
    const sorted = [...list].sort((a, b) => this.view(a).x - this.view(b).x || this.view(a).y - this.view(b).y);
    this.tsel = { list: sorted, idx: 0, all, onPick, onCancel, since: performance.now() };
    game.ui.announce(`${L.battle.selectTarget}: ${all ? '전체' : sorted[0].name}`);
  }

  private openCommand(u: Unit): void {
    this.closeMenus();
    this.phase = 'select';
    const st = this.st;
    const aimC = B.aimCost(u);
    const segs = Math.floor(st.resonance / RES.seg);
    const items = Object.keys(game.save!.items).filter((k) => (game.save!.items[k] ?? 0) > 0 && ITEMS[k]?.battle);
    const back = () => this.openCommand(u);
    const menu = new Menu([], '명령', () => this.openPause(u));
    menu.setItems([
      { label: L.battle.cmdAttack, icon: 'weapon', tag: '행동력 +1', desc: `${CHARS[u.charId!].basic.name} — 행동력을 만든다`, onSelect: () => this.selectTarget(B.liveEnemies(st), false, ([t]) => this.choose({ k: 'attack', t }), back) },
      { label: L.battle.cmdSkill, icon: 'book', tag: `${u.skills.length}개`, onSelect: () => this.openSkills(u) },
      { label: L.battle.cmdAim, icon: 'star', tag: `행동력 ${aimC}`, disabled: u.ap < aimC, desc: '적을 확대해 약점을 직접 겨냥한다', onSelect: () => this.selectTarget(B.liveEnemies(st), false, ([t]) => this.choose({ k: 'aim', t }), back) },
      { label: L.battle.cmdRes, icon: 'resonance', tag: `${segs}/3칸`, disabled: segs < 1, onSelect: () => this.openRes(u) },
      { label: L.battle.cmdItem, icon: 'potion', tag: items.length ? `${items.length}종` : '없음', disabled: !items.length, onSelect: () => this.openItems(u) },
      { label: L.battle.cmdScan, icon: 'insight', desc: '적의 약점과 공격을 확인한다 (턴 소모 없음)', onSelect: () => this.selectTarget(B.liveEnemies(st), false, ([t]) => this.openScan(t, back), back) },
    ]);
    const info = h('p', { class: 'small dim', text: `행동력 ${u.ap}/10 · 취소: 메뉴` });
    this.pushMenu(this.panel(`${u.name}의 차례`, menu, 'left:calc(var(--u)*4);bottom:calc(var(--u)*58);width:calc(var(--u)*118*var(--ui))', [info]));
  }

  private skillReason(u: Unit, s: SkillDef): string | null {
    return B.cannotUse(this.st, u, s);
  }

  private pickSkillTargets(u: Unit, s: SkillDef, res: number, back: () => void): void {
    const list = B.skillTargets(this.st, u, s);
    const go = (t: Unit[]) => this.choose({ k: 'skill', s, targets: t, res });
    switch (s.target) {
      case 'enemy': case 'ally': case 'deadAlly': this.selectTarget(list, false, go, back); break;
      case 'allEnemies': this.selectTarget(list, true, go, back); break;
      default: go(list);
    }
  }

  private openSkills(u: Unit): void {
    this.closeMenus();
    const desc = h('div', { class: 'desc', style: 'min-height:calc(var(--u)*34)' });
    const res = h('p', { class: 'small echo' });
    const list = u.skills.map((id) => SKILLS[id]).filter(Boolean);
    const menu = new Menu([], L.battle.cmdSkill, () => this.openCommand(u));
    const tmIcon = (s: SkillDef) => (s.timing ? `tm_${s.timing.type}` : s.heal ? 'heart' : s.shield ? 'shield' : 'book');
    menu.setItems(list.map((s) => {
      const why = this.skillReason(u, s);
      return {
        label: s.name, icon: tmIcon(s), tag: `행동력 ${B.skillCost(u, s)}`, disabled: !!why, desc: s.desc,
        onSelect: () => this.pickSkillTargets(u, s, 0, () => this.openSkills(u)),
      };
    }));
    menu.onChange = (_, i) => {
      const s = list[i];
      if (!s) return;
      const why = this.skillReason(u, s);
      const tm = s.timing ? { tap: L.battle.timingTap, multi: L.battle.timingMulti, hold: L.battle.timingHold, rhythm: L.battle.timingRhythm }[s.timing.type] : '타이밍 입력 없음';
      desc.innerHTML = '';
      desc.append(h('b', { text: `${s.role}${s.breaker ? ' · 붕괴 가능' : ''}` }), document.createTextNode(`\n${s.desc}\n`), h('span', { class: 'echo', text: `공격 타이밍: ${tm}` }));
      if (why) desc.append(h('div', { class: 'bad', text: why }));
    };
    const r: string[] = [];
    if (u.charId === 'kael') r.push(`현재 자세: ${L.stance[u.stance]}`);
    if (u.charId === 'mira') r.push(`인장: ${u.sigils.map((e) => L.element[e]).join(' · ') || '없음'}`);
    if (u.charId === 'orin') r.push(`충전 ${u.charge}/${u.chargeMax}`);
    if (u.charId === 'sera') r.push(`표식이 있는 적: ${B.liveEnemies(this.st).filter((e) => B.markCount(e) > 0).length}`);
    r.push(`행동력 ${u.ap}/10`);
    res.textContent = r.join('   ·   ');
    this.pushMenu(this.panel(L.battle.cmdSkill, menu, 'left:calc(var(--u)*4);bottom:calc(var(--u)*58);width:calc(var(--u)*252*var(--ui));max-height:calc(var(--u)*196);display:flex;flex-direction:column', [res, desc]));
    menu.el.classList.add('scroll');
    menu.el.style.maxHeight = 'calc(var(--u)*92*var(--ui))';
    menu.focus(0, false);
  }

  private openRes(u: Unit): void {
    this.closeMenus();
    const segs = Math.floor(this.st.resonance / RES.seg);
    const opts: [number, string][] = [[1, 'r_rescue'], [2, CHARS[u.charId!].resonance2], [3, 'r_party']];
    const desc = h('p', { class: 'desc' });
    const menu = new Menu(opts.map(([n, id]) => {
      const s = SKILLS[id];
      return { label: s.name, icon: 'resonance', tag: `공명 ${n}칸`, disabled: segs < n || !B.skillTargets(this.st, u, s).length, desc: s.desc, onSelect: () => this.pickSkillTargets(u, s, n, () => this.openRes(u)) };
    }), L.battle.cmdRes, () => this.openCommand(u));
    menu.onChange = (it) => (desc.textContent = it.desc ?? '');
    this.pushMenu(this.panel(`${L.battle.cmdRes} ${segs}/3`, menu, 'left:calc(var(--u)*4);bottom:calc(var(--u)*58);width:calc(var(--u)*220*var(--ui))', [desc]));
    menu.focus(0, false);
  }

  private openItems(u: Unit): void {
    this.closeMenus();
    const s = game.save!;
    const ids = Object.keys(s.items).filter((k) => (s.items[k] ?? 0) > 0 && ITEMS[k]?.battle);
    const desc = h('p', { class: 'desc' });
    const menu = new Menu(ids.map((id) => {
      const it = ITEMS[id];
      const tg = B.itemTargets(this.st, id);
      return { label: it.name, icon: it.icon, tag: `×${s.items[id]}`, disabled: !tg.length, desc: it.desc, onSelect: () => this.selectTarget(tg, false, ([t]) => this.choose({ k: 'item', id, t }), () => this.openItems(u)) };
    }), L.battle.cmdItem, () => this.openCommand(u));
    menu.onChange = (it) => (desc.textContent = it.desc ?? '');
    this.pushMenu(this.panel(L.battle.cmdItem, menu, 'left:calc(var(--u)*4);bottom:calc(var(--u)*58);width:calc(var(--u)*200*var(--ui))', [desc]));
    menu.focus(0, false);
  }

  private openScan(t: Unit, back: () => void): void {
    this.closeMenus();
    const d = ENEMIES[t.enemyId!];
    const menu = new Menu([{ label: L.close, onSelect: () => close() }], L.battle.cmdScan, () => close());
    const weak = Object.entries(d.weak).map(([, w]) => h('li', {}, h('b', { class: 'gold', text: w.name }), ` — ${w.desc}${w.part && t.parts.includes(w.part) ? ' (파괴됨)' : ''}`));
    const atks = d.attacks.filter((a) => a.power > 0).map((a) => h('li', {}, h('b', { text: a.name }), ` — ${L.hitKind[a.kind]}${a.charge ? ' · 한 턴 준비 후 발동' : ''}${a.segs.length + (DIFFICULTY[this.diff].extraPatterns ? a.expertSegs?.length ?? 0 : 0) > 1 ? ` · ${a.segs.length}연속 이상` : ''}`));
    const sts = [...t.statuses.map((x) => L.status[x.id]), ...Object.keys(t.marks).map((m) => `${L.markName[m]} 표식`)];
    const body = h('div', { class: 'scroll', style: 'max-height:calc(var(--u)*170)' },
      h('p', { class: 'desc', text: d.desc }),
      h('p', { class: 'small', text: `체력 ${t.hp}/${t.maxHp}   ·   붕괴 ${Math.round(t.brk)}/${t.brkMax}${t.breakReady ? ' (붕괴 가능)' : ''}   ·   방어 ${t.def}` }),
      h('p', { class: 'small', text: `상태: ${sts.join(', ') || '없음'}` }),
      h('h3', { text: '약점 (정밀 조준)' }), h('ul', { class: 'small' }, ...weak),
      h('h3', { text: '공격' }), h('ul', { class: 'small' }, ...atks));
    const modal = this.panel(t.name, menu, 'left:50%;top:50%;transform:translate(-50%,-50%);width:min(calc(var(--u)*300*var(--ui)),94%)', [body], false);
    modal.el.insertBefore(body, menu.el);
    const close = () => { this.closeMenus(); back(); };
    this.pushMenu(modal);
  }

  private openPause(u: Unit): void {
    this.closeMenus();
    const menu = new Menu([
      { label: L.menu.resume, onSelect: () => this.openCommand(u) },
      { label: L.menu.settings, onSelect: () => { this.closeMenus(); openSettings(() => this.openCommand(u)); } },
      { label: L.menu.help, onSelect: () => { this.closeMenus(); openHelp(); this.openCommand(u); } },
    ], L.menu.pause, () => this.openCommand(u));
    this.pushMenu(this.panel(L.menu.pause, menu, 'left:50%;top:40%;transform:translate(-50%,-50%);width:calc(var(--u)*140*var(--ui))', [], false));
  }

  private showResults(lines: string[], done: () => void): void {
    const st = this.st.stats;
    const menu = new Menu([{ label: '계속', onSelect: () => { game.ui.pop(modal); done(); } }], L.battle.victory, () => { game.ui.pop(modal); done(); });
    const body = h('div', { class: 'col' },
      ...lines.map((l) => h('div', { class: l.startsWith('★') ? 'echo' : '', text: l })),
      h('div', { class: 'small dim', text: `완벽 패링 ${st.perfectParries} · 반격 ${st.counters} · 붕괴 ${st.breaks} · 약점 명중 ${st.weakHits} · 완벽 타이밍 ${st.perfectTimings}` }));
    const modal: Modal = {
      el: h('section', { class: 'panel hi', style: 'left:50%;top:46%;transform:translate(-50%,-50%);width:min(calc(var(--u)*300*var(--ui)),94%)', role: 'dialog', 'aria-label': L.battle.victory }, h('h2', { text: L.battle.victory }), body, menu.el),
      handle: (i) => menu.handle(i),
      botConfirm: true,
    };
    game.ui.push(modal);
    game.ui.announce(`${L.battle.victory}. ${lines.join('. ')}`);
  }

  private showDefeat(): void {
    const menu = new Menu([
      { label: L.battle.retry, onSelect: () => { game.ui.pop(modal); this.retry(); } },
      { label: L.battle.toRest, onSelect: () => { game.ui.pop(modal); this.finish({ result: 'rest' }); } },
      { label: L.battle.toTitle, onSelect: () => { game.ui.pop(modal); this.ended = true; game.toTitle(); } },
    ], L.defeat.title);
    const modal: Modal = {
      el: h('div', { class: 'fullscreen' }, h('div', { class: 'dimmer' }), h('section', { class: 'panel', style: 'left:50%;top:50%;transform:translate(-50%,-50%);width:calc(var(--u)*200*var(--ui))', role: 'dialog', 'aria-label': L.defeat.title },
        h('h2', { text: L.defeat.title }), h('p', { class: 'dim', text: L.defeat.line }), menu.el)),
      handle: (i) => menu.handle(i),
    };
    game.ui.push(modal);
    game.ui.announce(`${L.defeat.title}. ${L.defeat.line}`);
  }

  /* ============================================================ 갱신 */

  update(dt: number): void {
    const wantPause = game.ui.blocking || performance.now() < this.stopUntil;
    if (wantPause) this.clock.pause();
    else this.clock.resume();
    this.st.opts.invincible = game.debug.invincible;
    const now = this.now();
    if (!this.clock.paused) {
      game.bot?.tick(this);
      this.updateTarget();
      this.updateAim(dt);
      this.updateTiming();
      this.updateReact();
    }
    // 뷰
    for (const v of this.views.values()) {
      if (v.tween) {
        const k = Math.min(1, (now - v.tween.t0) / v.tween.dur);
        const e = 1 - (1 - k) * (1 - k);
        v.x = v.tween.x0 + (v.tween.x1 - v.tween.x0) * e;
        v.y = v.tween.y0 + (v.tween.y1 - v.tween.y0) * e;
        if (k >= 1) v.tween = null;
      }
      if (v.frameFn) continue;
      v.anim.t = now - v.animStart;
      const idle = this.idleName(v.u);
      const a = game.assets.anim(this.sheetOf(v.u), v.anim.name);
      const idleLike = v.anim.name === 'idle' || v.anim.name.startsWith('idle_') || v.anim.name === 'break';
      if (v.u.alive && ((!a.loop && v.anim.done(game.assets)) || (idleLike && v.anim.name !== idle))) this.play(v, idle);
    }
    this.popups = this.popups.filter((p) => now - p.t0 < p.life);
    this.fxs = this.fxs.filter((f) => now - f.t0 < animLength(game.assets.anim(f.sheet, 'play')));
    this.projs = this.projs.filter((p) => now - p.t0 < p.dur);
    this.shakeAmp *= Math.pow(0.0035, dt / 1000);
    this.flashA *= Math.pow(0.004, dt / 1000);
    if (this.shakeAmp < 0.2) this.shakeAmp = 0;
    if (this.banner && now > this.banner.until) this.banner = null;
    this.stepCo();
  }

  private stepCo(): void {
    for (let guard = 0; guard < 64 && this.co; guard++) {
      if (this.clock.paused) return;
      if (this.coUntil > this.now()) return;
      if (this.coCond && !this.coCond()) return;
      this.coCond = null;
      const r = this.co.next();
      if (r.done) { this.co = null; return; }
      if (typeof r.value === 'number') { this.coUntil = this.now() + r.value; this.coCond = null; }
      else { this.coUntil = 0; this.coCond = r.value; }
    }
  }

  private unitAt(x: number, y: number, list: Unit[]): number {
    let best = -1, bd = Infinity;
    list.forEach((u, i) => {
      const v = this.view(u);
      const top = this.headY(v);
      if (x < v.x - 22 || x > v.x + 22 || y < top - 4 || y > v.y + 4) return;
      const d = Math.abs(x - v.x) + Math.abs(y - (top + v.y) / 2) * 0.5;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  private updateTarget(): void {
    const ts = this.tsel;
    if (!ts || game.ui.blocking) return;
    const inp = game.input;
    const fresh = (a: import('../input/input').Action) => inp.events.some((e) => e.action === a && e.down && e.t >= ts.since && (!e.repeat || a !== 'confirm'));
    ts.list = ts.list.filter((u) => u.alive || ts.list.every((x) => !x.alive));
    if (!ts.list.length) { this.tsel = null; ts.onCancel(); return; }
    const n = ts.list.length;
    if (fresh('right') || fresh('down')) { ts.idx = (ts.idx + 1) % n; audio.sfx('move'); game.ui.announce(ts.list[ts.idx].name); }
    if (fresh('left') || fresh('up')) { ts.idx = (ts.idx - 1 + n) % n; audio.sfx('move'); game.ui.announce(ts.list[ts.idx].name); }
    if (inp.mouse.moved) { const i = this.unitAt(inp.mouse.x, inp.mouse.y, ts.list); if (i >= 0) ts.idx = i; }
    ts.idx = Math.min(ts.idx, n - 1);
    const clickHit = inp.mouse.clicked && inp.mouse.clickT >= ts.since && (ts.all || this.unitAt(inp.mouse.x, inp.mouse.y, ts.list) >= 0);
    if (fresh('confirm') || clickHit) {
      audio.sfx('select');
      this.tsel = null;
      ts.onPick(ts.all ? ts.list : [ts.list[ts.idx]]);
    } else if (fresh('cancel')) {
      audio.sfx('cancel');
      this.tsel = null;
      ts.onCancel();
    }
  }

  /* ============================================================ 렌더 */

  render(): void {
    const g = game.gfx, c = g.ctx;
    const now = this.now();
    g.clear(COL.ink);
    const bg = this.group.bg;
    c.save();
    if (this.shakeAmp > 0) c.translate(Math.round((Math.random() - 0.5) * this.shakeAmp * 2), Math.round((Math.random() - 0.5) * this.shakeAmp * 2));
    g.image(bg, 0, 0);
    // 유닛 (y 정렬, 공격 중인 적은 맨 앞 — 공격 실루엣 우선)
    const attacker = this.react?.attacker;
    const list = [...this.views.values()].filter((v) => v.u.alive || now - v.deadAt < 1200 || v.u.side === 'ally').sort((a, b) => (a.u === attacker ? 1 : b.u === attacker ? -1 : a.y - b.y));
    for (const v of list) this.drawUnit(v, now);
    // 이펙트 (반응 구간에는 흐리게)
    const fxAlpha = this.react ? 0.55 : 1;
    for (const f of this.fxs) {
      const a = game.assets.anim(f.sheet, 'play');
      g.frame(f.sheet, a.frames[frameAt(a, now - f.t0)], f.x, f.y, { flip: f.flip, alpha: fxAlpha });
    }
    for (const p of this.projs) {
      const k = (now - p.t0) / p.dur;
      const a = game.assets.anim(p.sheet, 'play');
      g.frame(p.sheet, a.frames[Math.floor((now - p.t0) / 60) % a.frames.length], p.x0 + (p.x1 - p.x0) * k, p.y0 + (p.y1 - p.y0) * k, { flip: p.x1 < p.x0 });
    }
    this.drawRings(now);
    this.drawMarkers(now);
    for (const p of this.popups) {
      const left = p.life - (now - p.t0);
      g.text(p.text, p.x, popupYAt(p, now), { size: popupSize(p.big), bold: true, align: 'center', color: p.color, alpha: Math.min(1, left / 220) });
    }
    c.restore();
    this.drawHUD(now);
    if (this.aim) this.drawAim(now);
    if (this.banner) this.drawBanner(now);
    if (this.react) this.drawDefensePrompt();
    if (game.debug.showReact) this.drawReactDebug(now);
    if (this.flashA > 0.01) g.rect(0, 0, W, H, '#fff6e0', Math.min(0.85, this.flashA));
  }

  private drawUnit(v: View, now: number): void {
    const g = game.gfx;
    const u = v.u;
    let alpha = 1;
    if (!u.alive && u.side === 'enemy') {
      const dAnim = animLength(game.assets.anim(this.sheetOf(u), 'death'));
      alpha = Math.max(0, 1 - (now - v.deadAt - dAnim) / 300);
      if (alpha <= 0) return;
    }
    if (now - v.appear < 300 && v.cat !== 'ally') alpha *= (now - v.appear) / 300;
    if (u.enemyId !== 'orb' && u.enemyId !== 'glassflame' && u.enemyId !== 'chorister') {
      const w = Math.round(Math.min(46, this.height(v) * 0.7));
      g.rect(v.x - w / 2, v.y - 1, w, 3, '#000000', 0.28 * alpha);
    }
    const frame = this.globalFrame(v);
    const tint = now < v.flashUntil ? '#ffffff' : null;
    g.frame(this.sheetOf(u), frame, v.x, v.y, { alpha, tint });
    if (u.brokenTurns > 0 && u.alive && Math.floor(now / 160) % 2 === 0) g.frame(this.sheetOf(u), frame, v.x, v.y, { alpha: 0.25, tint: COL.brkFull });
    if (game.debug.showHit && u.side === 'enemy' && u.alive) {
      for (const w of this.weakOf(v)) {
        const [x, y] = this.toWorld(v, w.x, w.y);
        g.ring(x, y, w.hit, '#ff3355');
        g.ring(x, y, w.r, '#ffee55');
      }
    }
  }

  private drawRings(now: number): void {
    const g = game.gfx;
    const tm = this.timing;
    if (tm && !tm.hold) {
      const [x, y] = tm.at();
      tm.beats.forEach((b, i) => {
        if (tm.applied[i] || tm.tracker.grades[i] !== null) return;
        const dt = b - now;
        if (dt > ATTACK_TIMING.ringLead || dt < -60) return;
        const r = 5 + Math.max(0, dt / ATTACK_TIMING.ringLead) * 24;
        g.ring(x, y, r, COL.gold, 0.95);
        g.ring(x, y, r + 1, COL.brass, 0.6);
      });
      g.ring(x, y, 5, COL.white, 0.9);
      g.diamond(x, y, 1, COL.white);
      const label = { tap: L.battle.timingTap, multi: L.battle.timingMulti, rhythm: L.battle.timingRhythm, hold: L.battle.timingHold }[tm.kind];
      g.text(`[${game.input.label('confirm')}] ${label}`, x, y + 32, { align: 'center', color: COL.gold });
      if (tm.kind !== 'tap') tm.beats.forEach((_, i) => g.diamond(x - (tm.beats.length - 1) * 5 + i * 10, y + 46, 2, tm.tracker.grades[i] === 'perfect' ? COL.gold : tm.tracker.grades[i] === 'good' ? COL.echo : tm.tracker.grades[i] === 'fail' ? COL.bad : COL.ui4));
    }
    if (tm?.hold) {
      const hs = tm.hold;
      const [x, y] = tm.at();
      const bw = 64, bx = x - bw / 2, by = y + 26;
      const fill = hs.phase === 'hold' ? (now - hs.pressT) / ATTACK_TIMING.holdFill : 0;
      g.bar(bx, by, bw, 6, Math.min(1, fill), fill > ATTACK_TIMING.holdTarget + 0.15 ? COL.bad : COL.ap);
      const tx = Math.round(bx + bw * ATTACK_TIMING.holdTarget);
      g.rect(tx - 1, by - 3, 2, 12, COL.white);
      g.diamond(tx, by - 4, 2, COL.gold);
      const msg = hs.phase === 'wait' ? `[${game.input.label('confirm')}] ${L.battle.holdPrompt}` : fill >= ATTACK_TIMING.holdTarget - 0.05 ? L.battle.released : L.battle.timingHold;
      g.text(msg, x, by + 10, { align: 'center', color: COL.gold });
    }
    const r = this.react;
    if (r && this.guideRing) {
      r.plan.hits.forEach((hi, i) => {
        if (r.tracker.results[i] !== null) return;
        const T = r.start + hi.t;
        const dt = T - now;
        if (dt > RING_REACT || dt < -40) return;
        const col = hi.kind === 'ground' ? COL.gold : hi.kind === 'unblockable' ? COL.bad : COL.white;
        for (const t of r.targets) {
          if (!t.alive) continue;
          const [x, y] = this.center(this.view(t));
          const rr = 7 + Math.max(0, dt / RING_REACT) * 22;
          if (hi.kind === 'ground') { const tv = this.view(t); g.ring(tv.x, tv.y - 2, rr, col, 0.8); }
          else g.ring(x, y, rr, col, 0.85);
        }
      });
    }
  }

  private drawMarkers(now: number): void {
    const g = game.gfx;
    const blink = Math.floor(now / 220) % 2 === 0;
    if (this.phase === 'select' || this.phase === 'target' || this.phase === 'act') {
      const cu = this.current;
      if (cu && cu.side === 'ally') { const v = this.view(cu); g.diamond(v.x, this.headY(v) - 8, 3, COL.gold); }
    }
    for (const t of this.targetMark) {
      if (!t.alive) continue;
      const v = this.view(t);
      if (blink) g.diamond(v.x, this.headY(v) - 9, 3, COL.bad);
      if (this.react) {
        const kinds = new Set(this.react.plan.hits.map((x) => x.kind));
        let i = 0;
        for (const k of kinds) g.icon(k === 'ground' ? 'tell_ground' : k === 'unblockable' ? 'tell_unblock' : 'tell_normal', v.x + 8 + i++ * 16, this.headY(v) - 18);
      }
    }
    const ts = this.tsel;
    if (ts) {
      const sel = ts.all ? ts.list : [ts.list[ts.idx]];
      for (const u of sel) {
        if (!u) continue;
        const v = this.view(u);
        const y = this.headY(v) - 10 + (blink ? 0 : 2);
        g.diamond(v.x, y, 4, COL.gold);
        g.diamond(v.x, y, 2, COL.white);
      }
      const u = sel[0];
      if (u) {
        const label = ts.all ? `전체: ${ts.list.map((x) => x.name).join(', ')}` : `${u.name}  체력 ${u.hp}/${u.maxHp}`;
        const w = Math.min(300, g.measure(label, 8) + 16);
        g.panel(W / 2 - w / 2, 40, w, 20, true);
        g.text(label, W / 2, 45, { align: 'center', maxW: w - 10 });
        const hint = `${L.battle.selectTarget} — [${game.input.label('confirm')}] 결정 · [${game.input.label('cancel')}] 취소 · ←→ 대상 변경`;
        const hw = g.measure(hint, 7) + 10;
        g.rect(W / 2 - hw / 2, 61, hw, 11, COL.ink, 0.8);
        g.text(hint, W / 2, 62, { align: 'center', size: 7, color: COL.bone });
      }
    }
  }

  private drawBanner(now: number): void {
    const g = game.gfx;
    const b = this.banner!;
    if (this.tsel) return;
    const a = Math.min(1, (now - b.t0) / 120, (b.until - now) / 200);
    const w = b.w;
    const x = W / 2 - w / 2, y = 34;
    g.panel(x, y, w, b.h, false, a);
    let tx = W / 2;
    if (b.icon) { g.icon(b.icon, x + 8, y + (b.sub ? 9 : 3), { alpha: a }); tx += 8; }
    g.text(b.text, tx, y + 5, { size: 11, bold: true, align: 'center', color: COL.gold, alpha: a });
    if (b.sub) g.text(b.sub, tx, y + 20, { size: 8, align: 'center', color: COL.bone, alpha: a });
  }

  private drawDefensePrompt(): void {
    const g = game.gfx;
    const r = this.react!;
    const pending = r.plan.hits.filter((_, i) => r.tracker.results[i] === null);
    const kinds = new Set(pending.map((x) => x.kind));
    const parts: [ReactKind, string][] = [['parry', '패링'], ['dodge', '회피'], ['jump', '점프']];
    let x = W / 2 - 118;
    const y = CARD_Y - 13;
    g.rect(x - 4, y - 2, 244, 12, COL.ink, 0.75);
    for (const [k, name] of parts) {
      const ok = [...kinds].some((kk) => validDefense(kk, k));
      const s = `[${game.input.label(k)}] ${name}`;
      g.text(ok ? s : `${s} ✕`, x, y, { color: ok ? COL.gold : COL.ui4, size: 8 });
      x += 80;
    }
  }

  private drawHUD(now: number): void {
    const g = game.gfx;
    // 행동 순서
    const order = B.previewOrder(this.st, 8);
    g.rect(2, 2, 8 * 19 + 4, 22, COL.ink, 0.7);
    order.forEach((u, i) => {
      const x = 4 + i * 19, y = 4;
      const ally = u.side === 'ally';
      g.rect(x, y, 18, 18, ally ? '#1d2c60' : '#3a112d');
      g.portrait(u.charId ?? ENEMIES[u.enemyId!].sheet, x + 1, y + 1);
      g.outline(x, y, 18, 18, i === 0 ? COL.gold : ally ? COL.brass : COL.thorn);
      if (!ally) { g.rect(x + 7, y + 17, 4, 2, COL.thorn); } else { g.rect(x + 1, y + 17, 16, 1, COL.brassHi); }
      if (i === 0) g.outline(x - 1, y - 1, 20, 20, COL.gold);
    });
    // 공명
    const segs = this.st.resonance / RES.seg;
    g.text(L.battle.res, 4, 27, { size: 7, color: COL.echo });
    for (let i = 0; i < 3; i++) {
      const f = Math.max(0, Math.min(1, segs - i));
      g.bar(26 + i * 28, 29, 25, 5, f, f >= 1 ? COL.echo : COL.echo2);
      if (f >= 1) g.diamond(26 + i * 28 + 12, 31, 1, COL.white);
    }
    g.text(`${Math.floor(segs)}/3`, 112, 27, { size: 7, color: COL.echo });
    // 보스 체력
    const boss = B.liveEnemies(this.st).find((e) => ENEMIES[e.enemyId!].size === 'boss');
    if (boss) this.drawBossBar(boss, now);
    // 적 체력
    for (const e of B.liveEnemies(this.st)) if (e !== boss) this.drawEnemyBar(e, now);
    // 아군 카드
    B.allies(this.st).forEach((u, i) => this.drawCard(u, 4 + i * 158, CARD_Y, now));
  }

  private drawStatusIcons(u: Unit, x: number, y: number, max = 6): void {
    const g = game.gfx;
    const icons: string[] = [];
    for (const s of u.statuses) if (s.turns > 0 && s.id !== 'mark') icons.push(s.id === 'burn' ? 'burn' : s.id);
    for (const m of Object.keys(u.marks)) icons.push(`mark_${m}`);
    if (u.linkSignal) icons.push('star');
    icons.slice(0, max).forEach((ic, i) => g.icon(ic, x + i * 15, y));
  }

  private drawBossBar(e: Unit, now: number): void {
    const g = game.gfx;
    const x = 250, y = 2, w = 228;
    g.panel(x, y, w, 36, false, 0.95);
    g.text(e.name, x + 8, y + 4, { bold: true, color: COL.gold });
    if (this.group.enemies[0] === 'thornknight') g.text(L.battle.phase(e.phase), x + w - 8, y + 4, { align: 'right', size: 7, color: COL.thorn });
    g.bar(x + 8, y + 16, w - 16, 5, e.hp / e.maxHp, e.hp / e.maxHp < 0.3 ? COL.hpLow : COL.hp);
    g.bar(x + 8, y + 25, w - 16, 3, e.brokenTurns > 0 ? 1 : e.brk / e.brkMax, e.breakReady || e.brokenTurns > 0 ? COL.brkFull : COL.brk);
    const sh = B.getS(e, 'shield');
    if (sh) g.text(`${L.battle.shieldUp} ${sh.value}`, x + w - 8, y + 4, { align: 'right', size: 7, color: COL.echo });
    let label = '';
    if (e.brokenTurns > 0) label = L.battle.broken;
    else if (e.breakReady) label = `◆ ${L.battle.breakReady}`;
    if (label && Math.floor(now / 300) % 2 === 0) g.text(label, x + w / 2, y + 22, { align: 'center', size: 7, bold: true, color: COL.brkFull });
    this.drawStatusIcons(e, x + 4, y + 38, 8);
    if (e.charging) {
      const a = ENEMIES[e.enemyId!].attacks.find((q) => q.id === e.charging!.attack);
      g.icon('tell_unblock', x + 150, y + 38);
      g.text(L.battle.prep(a?.name ?? ''), x + 168, y + 42, { size: 7, color: Math.floor(now / 250) % 2 ? COL.bad : COL.ember, maxW: 60 });
    }
  }

  private drawEnemyBar(e: Unit, now: number): void {
    const g = game.gfx;
    const v = this.view(e);
    const w = e.enemyId === 'orb' ? 22 : 40;
    const x = Math.round(v.x - w / 2), y = Math.max(40, this.headY(v) - 9);
    g.bar(x, y, w, 3, e.hp / e.maxHp, COL.hp);
    g.bar(x, y + 5, w, 2, e.brokenTurns > 0 ? 1 : e.brk / e.brkMax, e.breakReady || e.brokenTurns > 0 ? COL.brkFull : COL.brk);
    if (e.breakReady && Math.floor(now / 300) % 2 === 0) g.diamond(x + w + 4, y + 3, 2, COL.brkFull);
    if (e.brokenTurns > 0) g.text(L.battle.broken, v.x, y - 10, { align: 'center', size: 7, color: COL.brkFull, bold: true });
    this.drawStatusIcons(e, x - 2, y - 18, 3);
    const sh = B.getS(e, 'shield');
    if (sh) g.text(`◇${sh.value}`, x + w + 2, y - 2, { size: 7, color: COL.echo });
  }

  private drawCard(u: Unit, x: number, y: number, now: number): void {
    const g = game.gfx;
    const w = 154, hgt = 54;
    const cur = this.current === u;
    g.panel(x, y, w, hgt, cur, 0.96);
    g.portrait(u.charId!, x + 5, y + 5, { alpha: u.alive ? 1 : 0.4 });
    g.text(u.name, x + 24, y + 5, { bold: true, color: u.alive ? (cur ? COL.gold : COL.bone) : COL.boneDim });
    if (!u.alive) g.text('전투 불능', x + 60, y + 6, { size: 7, color: COL.bad });
    // 체력
    const hr = u.hp / u.maxHp;
    g.bar(x + 24, y + 18, 70, 4, hr, hr < 0.35 ? COL.hpLow : COL.hp);
    g.text(`${u.hp}/${u.maxHp}`, x + 97, y + 16, { size: 7, color: hr < 0.35 ? COL.bad : COL.bone });
    const sh = B.getS(u, 'shield');
    if (sh) g.text(`◇${sh.value}`, x + 97, y + 7, { size: 7, color: COL.echo });
    // 행동력 (칸 + 숫자: 색만으로 전달하지 않음)
    for (let i = 0; i < 10; i++) {
      const px = x + 24 + i * 6;
      const on = i < u.ap;
      g.rect(px, y + 27, 5, 4, on ? COL.ap : COL.apDim);
      if (on) g.rect(px, y + 27, 5, 1, COL.gold);
    }
    g.text(`행동력 ${u.ap}`, x + 86, y + 25, { size: 7, color: COL.ap });
    // 고유 자원
    const ry = y + 35;
    if (u.charId === 'kael') {
      g.icon(`st_${u.stance}`, x + 22, ry);
      g.text(`${L.stance[u.stance]} 자세`, x + 40, ry + 4, { size: 7, color: COL.echo });
    } else if (u.charId === 'mira') {
      for (let i = 0; i < 3; i++) {
        g.rect(x + 23 + i * 17, ry, 16, 16, COL.ink);
        g.outline(x + 23 + i * 17, ry, 16, 16, COL.ui4);
        const s = u.sigils[i];
        if (s) g.icon(`el_${s}`, x + 23 + i * 17, ry);
      }
      g.text('인장', x + 76, ry + 4, { size: 7, color: COL.boneDim });
    } else if (u.charId === 'orin') {
      for (let i = 0; i < u.chargeMax; i++) {
        const on = i < u.charge;
        g.rect(x + 24 + i * 7, ry + 5, 6, 7, on ? COL.ember : '#471008');
        if (on) g.rect(x + 24 + i * 7, ry + 5, 6, 2, COL.gold);
      }
      g.text(`충전 ${u.charge}/${u.chargeMax}`, x + 26 + u.chargeMax * 7, ry + 4, { size: 7, color: COL.ember });
    } else if (u.charId === 'sera') {
      const marked = B.liveEnemies(this.st).reduce((n, e) => n + B.markCount(e), 0);
      g.icon('mark_track', x + 22, ry);
      g.text(`적 표식 ${marked}${u.linkSignal ? ' · 연계' : ''}`, x + 40, ry + 4, { size: 7, color: COL.gold });
    }
    // 상태 (2×2)
    const icons: string[] = u.statuses.filter((s) => s.turns > 0).map((s) => s.id);
    if (u.empower > 0) icons.push('star');
    if (u.linkSignal) icons.push('mark_echo');
    icons.slice(0, 4).forEach((ic, i) => g.icon(ic, x + 118 + (i % 2) * 17, y + 4 + Math.floor(i / 2) * 17));
    void now;
  }

  private drawAim(now: number): void {
    const g = game.gfx;
    const a = this.aim!;
    const tv = this.view(a.t);
    g.rect(0, 0, W, H, '#07060a', 0.78);
    g.frame(this.sheetOf(a.t), this.globalFrame(tv), a.zx, a.zy, { scale: AIM.zoom });
    const story = this.diff === 'story' || game.settings.reactionAssist;
    if (story || game.debug.showHit) {
      const s = game.assets.sheet(this.sheetOf(a.t));
      for (const w of this.weakOf(tv)) {
        const x = a.zx + (w.x - s.anchor[0]) * AIM.zoom, y = a.zy + (w.y - s.anchor[1]) * AIM.zoom;
        g.ring(x, y, w.hit * AIM.zoom, game.debug.showHit ? '#ff3355' : COL.gold, 0.5);
      }
    }
    const ret = game.assets.images.get('ui_reticle');
    if (ret) g.image('ui_reticle', Math.round(a.cx) - 16, Math.round(a.cy) - 16);
    const left = Math.max(0, a.limit - (now - a.start));
    g.panel(W / 2 - 110, 4, 220, 30, true);
    g.text(`${L.battle.cmdAim} — ${a.t.name}`, W / 2, 8, { align: 'center', bold: true, color: COL.gold });
    g.bar(W / 2 - 96, 22, 192, 4, left / a.limit, left < 1500 ? COL.bad : COL.ap);
    g.text(`${L.battle.aimHint} · 마우스/방향키 이동 · [${game.input.label('confirm')}] 발사 · [${game.input.label('cancel')}] 취소`, W / 2, H - 14, { align: 'center', size: 7, color: COL.bone });
    const pv = this.aimResultPreview(a);
    if (pv) g.text(pv, Math.round(a.cx) + 18, Math.round(a.cy) - 6, { size: 7, color: COL.gold });
  }
  private aimResultPreview(a: AimState): string | null {
    const s = game.assets.sheet(this.sheetOf(a.t));
    const fx = (a.cx - a.zx) / AIM.zoom + s.anchor[0], fy = (a.cy - a.zy) / AIM.zoom + s.anchor[1];
    const w = this.weakOf(this.view(a.t)).find((p) => Math.hypot(fx - p.x, fy - p.y) <= p.hit);
    if (!w) return null;
    const d = ENEMIES[a.t.enemyId!].weak[w.id];
    return d ? d.name : null;
  }

  private drawReactDebug(now: number): void {
    const g = game.gfx;
    const x = 4, y = 42;
    g.rect(x, y, 236, 92, '#000000', 0.78);
    const r = this.react;
    const lines = [
      `상태: ${this.phase}${this.timing ? ` / 타이밍 ${this.timing.kind}` : ''}`,
      r ? `공격: ${r.atk.name} (${r.atk.id}) 타격 ${r.plan.hits.length}` : '공격: -',
      r ? `경과: ${Math.round(now - r.start)}ms / 총 ${Math.round(r.plan.total)}ms` : '',
      r ? `다음 타격: ${(() => { const i = r.tracker.nextPending(); return i < 0 ? '-' : `${Math.round(r.plan.hits[i].t)}ms (${r.plan.hits[i].kind})`; })()}` : '',
      r ? `판정 폭 회피 -${r.tracker.w.dodge[0]}/+${r.tracker.w.dodge[1]} 패링 -${r.tracker.w.parry[0]}/+${r.tracker.w.parry[1]} 점프 -${r.tracker.w.jump[0]}/+${r.tracker.w.jump[1]}` : '',
      r ? `결과: ${r.tracker.results.map((q) => q ?? '…').join(', ')}` : '',
    ];
    lines.forEach((l, i) => g.text(l, x + 4, y + 3 + i * 10, { size: 7, shadow: false, color: '#c8ffd8', maxW: 228 }));
    if (!r) return;
    const bx = x + 4, by = y + 66, bw = 228;
    const span = Math.max(1, r.plan.total + 200);
    const px = (t: number) => bx + ((t - r.start) / span) * bw;
    g.rect(bx, by, bw, 18, '#101820');
    r.plan.hits.forEach((hi) => {
      const T = r.start + hi.t;
      const d = r.tracker.w.dodge, p = r.tracker.w.parry, j = r.tracker.w.jump;
      if (hi.kind === 'ground') g.rect(px(T - j[0]), by + 2, Math.max(1, px(T + j[1]) - px(T - j[0])), 4, '#d6a748', 0.8);
      else g.rect(px(T - d[0]), by + 2, Math.max(1, px(T + d[1]) - px(T - d[0])), 4, '#579dce', 0.8);
      if (hi.kind === 'normal') g.rect(px(T - p[0]), by + 7, Math.max(1, px(T + p[1]) - px(T - p[0])), 4, '#f4dc8a');
      g.rect(px(T), by, 1, 18, '#ffffff');
    });
    for (const p of r.tracker.presses) g.rect(px(p.t), by + 12, 1, 6, p.outcome === 'success' ? '#82ff88' : '#ff5566');
    g.rect(px(now), by, 1, 18, '#ff00ff');
  }
}
