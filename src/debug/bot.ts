/**
 * 자동 플레이 봇 (검증용). 전투 규칙을 우회하지 않는다:
 * - 방어·공격 타이밍은 실제 입력 경로(Input.inject)에 타임스탬프를 넣어 같은 판정기를 통과한다.
 * - 명령 선택은 일반 플레이어가 고를 수 있는 행동만 고른다.
 */
import { game } from '../game';
import * as B from '../combat/battle';
import { SKILLS, CHARS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { RES, AIM, ReactKind } from '../data/config';
import type { BattleScene, Act } from '../scenes/battle';
import type { Unit, SkillDef } from '../combat/types';

export interface BotOpts {
  /** 방어 입력을 일부러 놓칠 확률 */
  missRate: number;
  /** 일반 공격에 회피를 섞는 비율 (나머지는 패링) */
  dodgeRate: number;
  /** 공격 타이밍 오차 (±ms) */
  jitter: number;
  aim: boolean;
  heal: boolean;
}

export class Bot {
  active = false;
  /** true: 명령은 실제 메뉴로 (플레이테스트가 키 입력으로 조작), 방어·타이밍만 봇 */
  manual = false;
  opts: BotOpts = { missRate: 0.08, dodgeRate: 0.2, jitter: 25, aim: true, heal: true };
  private done = new Set<string>();
  private holdDown = new WeakSet<object>();
  private holdUp = new WeakSet<object>();
  private lastConfirm = 0;
  log: string[] = [];

  enable(o: Partial<BotOpts> = {}): void {
    this.active = true;
    Object.assign(this.opts, o);
  }

  /** 매 프레임: 대화·안내·결과 창을 넘긴다 */
  frame(): void {
    if (!this.active) return;
    const top = game.ui.top();
    if (top?.botConfirm && performance.now() - this.lastConfirm > 90) {
      this.lastConfirm = performance.now();
      game.input.inject('confirm', true);
      game.input.inject('confirm', false);
    }
  }

  /* ---------------- 전투 입력 ---------------- */
  tick(sc: BattleScene): void {
    if (!this.active) return;
    const now = sc.now();
    const r = sc.react;
    if (r) {
      r.plan.hits.forEach((hi, i) => {
        const key = `r${r.start}:${i}`;
        if (this.done.has(key) || r.tracker.results[i] !== null) return;
        const T = r.start + hi.t;
        if (now < T - 45) return;
        this.done.add(key);
        if (Math.random() < this.opts.missRate) return;
        const a: ReactKind = hi.kind === 'ground' ? 'jump' : hi.kind === 'unblockable' ? 'dodge' : Math.random() < this.opts.dodgeRate ? 'dodge' : 'parry';
        const off = a === 'parry' ? 0 : -25;
        game.input.inject(a, true, sc.clock.toReal(T + off));
        game.input.inject(a, false, sc.clock.toReal(T + off + 40));
      });
    }
    const tm = sc.timing;
    if (tm && !tm.auto) {
      if (tm.hold) {
        const hs = tm.hold;
        if (hs.phase === 'wait' && !this.holdDown.has(tm)) {
          this.holdDown.add(tm);
          game.input.inject('confirm', true);
        } else if (hs.phase === 'hold' && !this.holdUp.has(tm) && now >= hs.target - 60) {
          this.holdUp.add(tm);
          game.input.inject('confirm', false, sc.clock.toReal(hs.target + (Math.random() - 0.5) * this.opts.jitter));
        }
      } else {
        tm.beats.forEach((b, i) => {
          const key = `b${b}:${i}`;
          if (this.done.has(key) || tm.tracker.grades[i] !== null || now < b - 45) return;
          this.done.add(key);
          const t = sc.clock.toReal(b + (Math.random() - 0.5) * this.opts.jitter);
          game.input.inject('confirm', true, t);
          game.input.inject('confirm', false, t + 30);
        });
      }
    }
    const aim = sc.aim;
    if (aim && !aim.fired && !aim.cancelled && now - aim.start > 350) {
      const tv = sc.view(aim.t);
      const s = game.assets.sheet(sc.sheetOf(aim.t));
      const def = ENEMIES[aim.t.enemyId!];
      const w = sc.weakOf(tv).find((p) => def.weak[p.id] && !(def.weak[p.id].part && aim.t.parts.includes(def.weak[p.id].part!)));
      if (w) {
        aim.cx = aim.zx + (w.x - s.anchor[0]) * AIM.zoom;
        aim.cy = aim.zy + (w.y - s.anchor[1]) * AIM.zoom;
      }
      sc.fireAim();
    }
  }

  /* ---------------- 명령 선택 ---------------- */
  choose(sc: BattleScene, u: Unit): Act {
    const st = sc.st;
    const foes = B.liveEnemies(st);
    const allies = B.liveAllies(st);
    const dead = B.allies(st).filter((a) => !a.alive);
    const segs = Math.floor(st.resonance / RES.seg);
    const items = game.save!.items;
    const usable = (id: string) => SKILLS[id] && !B.cannotUse(st, u, SKILLS[id]);
    const skill = (s: SkillDef, focus?: Unit, res = 0): Act => {
      const list = B.skillTargets(st, u, s);
      const targets = s.target === 'enemy' || s.target === 'ally' || s.target === 'deadAlly' ? [focus && list.includes(focus) ? focus : list[0]] : list;
      return { k: 'skill', s, targets, res };
    };
    const boss = foes.find((e) => ENEMIES[e.enemyId!].size === 'boss');
    const main = boss ?? foes.find((e) => e.breakReady) ?? [...foes].sort((a, b) => a.hp - b.hp)[0];
    // 구조
    if (dead.length && segs >= 1) return skill(SKILLS.r_rescue, undefined, 1);
    if (dead.length && (items.seed ?? 0) > 0) return { k: 'item', id: 'seed', t: dead[0] };
    if (segs >= 3 && allies.length >= 2) return skill(SKILLS.r_party, undefined, 3);
    if (segs >= 2 && boss) return skill(SKILLS[CHARS[u.charId!].resonance2], boss, 2);
    // 회복
    if (this.opts.heal) {
      const hurt = allies.filter((a) => a.hp < a.maxHp * 0.4).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      if (hurt.length) {
        if (u.charId === 'mira' && usable('m_heal') && u.skills.includes('m_heal')) return skill(SKILLS.m_heal, hurt[0]);
        if (hurt.length >= 2 && (items.dew ?? 0) > 0) return { k: 'item', id: 'dew', t: hurt[0] };
        if ((items.potion ?? 0) > 0 && hurt[0].hp < hurt[0].maxHp * 0.3) return { k: 'item', id: 'potion', t: hurt[0] };
      }
    }
    const mine = u.skills.map((id) => SKILLS[id]).filter((s) => s && !B.cannotUse(st, u, s));
    // 붕괴 발동
    const ready = foes.find((e) => e.breakReady);
    if (ready) {
      const br = mine.filter((s) => s.breaker).sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0];
      if (br) return skill(br, ready);
    }
    // 충전 중 공격 취소 / 약점 노리기
    const aimC = B.aimCost(u);
    if (this.opts.aim && u.ap >= aimC) {
      const charging = foes.find((e) => e.charging && Object.values(ENEMIES[e.enemyId!].weak).some((w) => w.cancelCharge));
      if (charging) return { k: 'aim', t: charging };
      const weakTarget = foes.find((e) => {
        const d = ENEMIES[e.enemyId!];
        if (d.traits?.flicker && !B.hasS(e, 'exposed')) return true;
        return Object.values(d.weak).some((w) => w.part && !e.parts.includes(w.part));
      });
      if (weakTarget && (u.charId === 'sera' || Math.random() < 0.35) && u.ap >= aimC + 1) return { k: 'aim', t: weakTarget };
    }
    // 표식 폭발
    if (u.charId === 'sera' && usable('s_pierce') && main && B.markCount(main) >= 2) return skill(SKILLS.s_pierce, main);
    // 가장 좋은 공격 기술
    const score = (s: SkillDef) => {
      let v = (s.power ?? 0) * (s.target === 'allEnemies' ? Math.min(3, foes.length) * 0.8 : 1) + (s.brk ?? 0) / 60;
      if (s.mark && main && !(main.marks[s.mark] ?? 0)) v += 0.6;
      if (s.consume) v += 0.6;
      if (s.sigils && u.sigils.length < 2) v += 0.3;
      if (s.stance && u.stance === s.stance) v -= 0.5;
      if (s.chargeGain && u.charge < 2) v += 0.8;
      if (s.target === 'ally' || s.target === 'allAllies' || s.target === 'self') v = s.chargeGain ? v : (s.shield && allies.some((a) => a.hp < a.maxHp * 0.6) ? 1.2 : -1);
      return v;
    };
    const best = mine.filter((s) => s.target !== 'deadAlly' && !s.heal).sort((a, b) => score(b) - score(a))[0];
    if (best && score(best) > 0.9 && u.ap >= B.skillCost(u, best) && (u.ap >= 3 || B.skillCost(u, best) <= 2)) return skill(best, main);
    void ITEMS;
    return { k: 'attack', t: main ?? foes[0] };
  }
}

export const bot = new Bot();
