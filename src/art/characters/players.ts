import { AnimBuilder, FrameTag, SheetSpec } from '../core/sheet';
import { Design, Pose, renderPose, FRAME_W, FRAME_H, ANCHOR, ctxFor, shiftPose, POSE_OY } from './rig';
import type { Pt } from '../core/draw';

export interface AnimDef {
  poses: Pose[];
  ms: number[] | number;
  tags?: Record<number, FrameTag>;
  loop?: boolean;
  airborne?: boolean;
}

/** 모든 플레이어 전투 시트가 가져야 하는 애니메이션 */
export const PLAYER_REQUIRED = [
  'idle', 'attack', 'skill', 'skill2', 'support', 'dodge', 'parry', 'counter', 'jump', 'hurt', 'stagger', 'victory', 'defeat', 'aim',
];

export function buildPlayerSheet(
  id: string,
  d: Design,
  defs: Record<string, AnimDef>,
  attach: (d: Design, p: Pose) => Record<string, Pt>,
): SheetSpec {
  const anims = Object.entries(defs).map(([name, def]) => {
    const b = new AnimBuilder(name, !!def.loop, !!def.airborne);
    def.poses.forEach((p0, i) => {
      const p = shiftPose(p0, 0, POSE_OY);
      const ms = Array.isArray(def.ms) ? def.ms[i] ?? def.ms[def.ms.length - 1] : def.ms;
      const at = attach(d, p);
      const rounded: Record<string, [number, number]> = {};
      for (const [k, v] of Object.entries(at)) rounded[k] = [Math.round(v[0]), Math.round(v[1])];
      rounded.hand = [Math.round(p.hF[0]), Math.round(p.hF[1])];
      const c = ctxFor(d, p);
      rounded.head = [Math.round(c.neck[0]), Math.round(c.neck[1] - 6)];
      rounded.chest = [Math.round(p.chest[0]), Math.round(p.chest[1] + 5)];
      b.add(renderPose(d, p), ms, { tag: def.tags?.[i] ?? (name === 'idle' ? 'idle' : undefined), attach: rounded });
    });
    return b.build();
  });
  return {
    id,
    kind: 'player',
    frameW: FRAME_W,
    frameH: FRAME_H,
    anchor: ANCHOR,
    anims,
    required: PLAYER_REQUIRED,
    maxColors: 40,
  };
}
