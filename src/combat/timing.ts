import { DIFFICULTY, Difficulty } from '../data/config';
import type { Grade } from './types';

/**
 * 공격 타이밍 판정 (순수). 박자 시각은 공격 애니메이션의 contact 프레임에서 온다.
 * 실패해도 기술은 약화된 효과로 발동한다 (턴 전체가 사라지지 않음).
 */
export interface TimingWindows {
  perfect: number;
  good: number;
}

export function timingWindows(diff: Difficulty): TimingWindows {
  return { ...DIFFICULTY[diff].timing };
}

export function gradeOffset(dt: number, w: TimingWindows): Grade {
  const a = Math.abs(dt);
  if (a <= w.perfect) return 'perfect';
  if (a <= w.good) return 'good';
  return 'fail';
}

/** 누르고 적정 시점에 놓기 — 누르고 있는 동안이라 조금 더 관대 */
export function gradeHold(release: number, target: number, w: TimingWindows): Grade {
  return gradeOffset(release - target, { perfect: w.perfect * 1.3, good: w.good * 1.2 });
}

export function aggregate(grades: Grade[]): Grade {
  if (!grades.length) return 'good';
  if (grades.every((g) => g === 'perfect')) return 'perfect';
  const fails = grades.filter((g) => g === 'fail').length;
  return fails * 2 <= grades.length ? (fails === 0 ? 'good' : 'good') : 'fail';
}

/** 단일/연속/리듬 입력 추적 */
export class BeatTracker {
  readonly beats: number[];
  readonly w: TimingWindows;
  grades: (Grade | null)[];
  offsets: (number | null)[];
  constructor(beats: number[], w: TimingWindows) {
    this.beats = beats;
    this.w = w;
    this.grades = beats.map(() => null);
    this.offsets = beats.map(() => null);
  }
  /** 입력: 판정된 박자 번호, 없으면 -1 */
  press(t: number): number {
    this.advance(t);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.beats.length; i++) {
      if (this.grades[i] !== null) continue;
      const d = Math.abs(t - this.beats[i]);
      if (d <= this.w.good && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    if (best >= 0) {
      this.grades[best] = gradeOffset(t - this.beats[best], this.w);
      this.offsets[best] = t - this.beats[best];
      return best;
    }
    // 연타 방지: 박자 밖 입력은 다가오는 박자를 실패로 만든다
    const next = this.grades.findIndex((g) => g === null);
    if (next >= 0 && this.beats[next] - t < 450) {
      this.grades[next] = 'fail';
      this.offsets[next] = t - this.beats[next];
      return next;
    }
    return -1;
  }
  advance(now: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.beats.length; i++) {
      if (this.grades[i] === null && now > this.beats[i] + this.w.good) {
        this.grades[i] = 'fail';
        out.push(i);
      }
    }
    return out;
  }
  /** 자동화: 모두 성공 처리 */
  autoAll(): void {
    this.grades = this.grades.map((g) => g ?? 'good');
  }
  done(): boolean {
    return this.grades.every((g) => g !== null);
  }
  result(): Grade {
    return aggregate(this.grades.map((g) => g ?? 'fail'));
  }
}
