import type { ManifestAnim } from '../art/core/sheet';
import type { EnemyAttack } from '../data/enemies';
import type { HitKind } from './types';

/**
 * 적 공격 계획: 애니메이션 프레임 배열과 판정 타임라인을 같은 데이터에서 파생한다.
 * 각 contact 프레임의 시작 시각 = 해당 타격의 접촉 시각.
 */
export interface PlayFrame {
  anim: string;
  idx: number;
  start: number;
  dur: number;
  tag: string | null;
}
export interface HitInfo {
  t: number;
  kind: HitKind;
  power: number;
  seg: number;
  /** 준비 동작 시작 시각 (접근 고리 표시용) */
  windup: number;
}
export interface AttackPlan {
  frames: PlayFrame[];
  hits: HitInfo[];
  total: number;
}

export function planAttack(atk: EnemyAttack, anims: Record<string, ManifestAnim>, expert: boolean, speed = 1): AttackPlan {
  const segs = expert && atk.expertSegs ? [...atk.segs, ...atk.expertSegs] : atk.segs;
  const frames: PlayFrame[] = [];
  const hits: HitInfo[] = [];
  let t = 0;
  segs.forEach((seg, si) => {
    const a = anims[seg.anim];
    if (!a) throw new Error(`공격 애니메이션 없음: ${seg.anim}`);
    const rate = (seg.rate ?? 1) * speed;
    if (seg.gap && frames.length) {
      const last = frames[frames.length - 1];
      frames.push({ ...last, start: t, dur: seg.gap });
      t += seg.gap;
    } else if (seg.gap) t += seg.gap;
    const firstContact = a.tags.indexOf('contact');
    // 지연 정지 프레임: 'hold' 태그, 없으면 첫 contact 직전 프레임
    let holdIdx = a.tags.indexOf('hold');
    if (holdIdx < 0 && firstContact > 0) holdIdx = firstContact - 1;
    const segStart = t;
    for (let i = 0; i < a.frames.length; i++) {
      let dur = a.durations[i] / rate;
      if (i === holdIdx && seg.hold) dur += seg.hold;
      if (a.tags[i] === 'contact') {
        const power = seg.power ?? atk.power;
        if (power > 0) hits.push({ t, kind: seg.kind ?? atk.kind, power, seg: si, windup: segStart });
      }
      frames.push({ anim: seg.anim, idx: i, start: t, dur, tag: a.tags[i] });
      t += dur;
    }
  });
  return { frames, hits, total: t };
}

/** 계획의 시각 t에 보여줄 프레임 */
export function frameOfPlan(plan: AttackPlan, t: number): PlayFrame {
  const fr = plan.frames;
  if (t <= 0) return fr[0];
  for (let i = 0; i < fr.length; i++) if (t < fr[i].start + fr[i].dur) return fr[i];
  return fr[fr.length - 1];
}
