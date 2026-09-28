import { DIFFICULTY, Difficulty, REACT, REACTION_ASSIST_MULT, ReactKind } from '../data/config';
import type { HitInfo } from './hits';
import type { HitKind } from './types';

/**
 * 적 턴 능동 방어 판정 (순수 로직, 게임 시간 ms 기준).
 * - 회피: 넓은 판정, 일반·패링 불가 공격 회피, 지면 공격에는 무효
 * - 패링: 좁은 판정, 일반 공격만. 헛누르면 잠시 잠김(연타 방지)
 * - 점프: 지면 공격 전용
 */
export type ReactResult = 'parry' | 'dodge' | 'jump' | 'hit';

export type Windows = Record<ReactKind, [number, number]>;

export function windowsFor(diff: Difficulty, assist: boolean): Windows {
  const w = DIFFICULTY[diff].react;
  const m = assist ? REACTION_ASSIST_MULT : 1;
  const f = (p: [number, number]): [number, number] => [Math.round(p[0] * m), Math.round(p[1] * m)];
  return { dodge: f(w.dodge), parry: f(w.parry), jump: f(w.jump) };
}

/** 이 공격 유형에 유효한 방어 */
export function validDefense(kind: HitKind, r: ReactKind): boolean {
  if (kind === 'ground') return r === 'jump';
  if (kind === 'unblockable') return r === 'dodge';
  return r === 'dodge' || r === 'parry';
}

export interface PressLog {
  type: ReactKind;
  t: number;
  outcome: 'success' | 'whiff' | 'locked';
  hit: number;
}

export class ReactionTracker {
  readonly hits: HitInfo[];
  readonly w: Windows;
  /** 공격 시작 시각 (게임 시간) — 타격 시각 = start + hit.t */
  readonly start: number;
  results: (ReactResult | null)[];
  presses: PressLog[] = [];
  private lockUntil: Record<ReactKind, number> = { dodge: -Infinity, parry: -Infinity, jump: -Infinity };

  constructor(hits: HitInfo[], w: Windows, start: number) {
    this.hits = hits;
    this.w = w;
    this.start = start;
    this.results = hits.map(() => null);
  }

  hitTime(i: number): number {
    return this.start + this.hits[i].t;
  }
  /** 해당 타격의 판정이 끝나는 시각 (가장 늦은 허용 폭) */
  closeTime(i: number): number {
    const k = this.hits[i].kind;
    const late = k === 'ground' ? this.w.jump[1] : Math.max(this.w.dodge[1], k === 'normal' ? this.w.parry[1] : 0);
    return this.hitTime(i) + late;
  }

  /** 시각 t까지 판정 폭이 닫힌 타격은 피격 처리. 새로 확정된 타격 번호 반환 */
  advance(now: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.hits.length; i++) {
      if (this.results[i] === null && now > this.closeTime(i)) {
        this.results[i] = 'hit';
        out.push(i);
      }
    }
    return out;
  }

  /** 방어 입력. 성공하면 해당 타격 번호, 헛누름이면 -1, 잠김이면 -2 */
  press(type: ReactKind, t: number): number {
    // 입력 이전에 닫힌 타격 먼저 확정 (프레임 타이밍과 무관하게 일관된 결과)
    this.advance(t);
    if (t < this.lockUntil[type]) {
      this.presses.push({ type, t, outcome: 'locked', hit: -2 });
      return -2;
    }
    const [early, late] = this.w[type];
    for (let i = 0; i < this.hits.length; i++) {
      if (this.results[i] !== null) continue;
      if (!validDefense(this.hits[i].kind, type)) continue;
      const T = this.hitTime(i);
      if (t >= T - early && t <= T + late) {
        this.results[i] = type;
        this.presses.push({ type, t, outcome: 'success', hit: i });
        return i;
      }
    }
    this.lockUntil[type] = t + REACT.lockout[type];
    this.presses.push({ type, t, outcome: 'whiff', hit: -1 });
    return -1;
  }

  /** 단계 전환 직전 입력(버퍼): 판정 폭 안에 들 때만 반영, 헛누름으로 잠그지 않는다 */
  pressBuffered(type: ReactKind, t: number): number {
    const [early, late] = this.w[type];
    for (let i = 0; i < this.hits.length; i++) {
      if (this.results[i] !== null || !validDefense(this.hits[i].kind, type)) continue;
      const T = this.hitTime(i);
      if (t >= T - early && t <= T + late) {
        this.results[i] = type;
        this.presses.push({ type, t, outcome: 'success', hit: i });
        return i;
      }
    }
    return -1;
  }

  done(): boolean {
    return this.results.every((r) => r !== null);
  }
  /** 모든 타격을 패링했는가 (반격 조건) */
  allParried(): boolean {
    return this.hits.length > 0 && this.results.every((r) => r === 'parry');
  }
  allJumped(): boolean {
    return this.hits.length > 0 && this.results.every((r) => r === 'jump');
  }
  /** 다음 미판정 타격 */
  nextPending(): number {
    return this.results.findIndex((r) => r === null);
  }
}
