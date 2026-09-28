import { PixelBuffer } from '../core/buffer';
import { AnimBuilder, FrameTag, SheetKind, SheetSpec, WeakPoint } from '../core/sheet';
import { hash2 } from '../core/draw';
import { R, rampOf } from '../core/palette';
import { selectiveOutline, cleanupOrphans } from '../core/post';
import type { Pose } from '../characters/rig';

export interface EFrame<P> {
  p: P;
  ms: number;
  tag?: FrameTag;
}

export interface Drawn {
  buf: PixelBuffer;
  weak?: WeakPoint[];
  attach?: Record<string, [number, number]>;
}

/** 적 시트 빌더. 약점 좌표는 매 프레임 그리기 함수가 함께 반환한다. */
export function buildEnemySheet<P>(opts: {
  id: string;
  kind: SheetKind;
  w: number;
  h: number;
  anchor: [number, number];
  draw: (p: P) => Drawn;
  anims: Record<string, EFrame<P>[]>;
  loops?: string[];
  death?: { from: P; frames?: number };
  required?: string[];
  outline?: boolean;
}): SheetSpec {
  const out = [];
  for (const [name, frames] of Object.entries(opts.anims)) {
    const b = new AnimBuilder(name, (opts.loops ?? ['idle', 'break']).some((l) => name === l || name.startsWith(l + '_')));
    for (const f of frames) {
      const d = opts.draw(f.p);
      finish(d.buf, opts.outline ?? true);
      b.add(d.buf, f.ms, { tag: f.tag, weak: d.weak, attach: d.attach });
    }
    out.push(b.build());
  }
  if (opts.death) {
    const d = opts.draw(opts.death.from);
    finish(d.buf, opts.outline ?? true);
    const b = new AnimBuilder('death', false);
    for (const f of dissolve(d.buf, opts.death.frames ?? 6)) b.add(f, 90, { tag: 'death' });
    out.push(b.build());
  }
  return {
    id: opts.id,
    kind: opts.kind,
    frameW: opts.w,
    frameH: opts.h,
    anchor: opts.anchor,
    anims: out,
    required: opts.required ?? ['idle', 'hurt', 'break', 'death'],
    maxColors: opts.kind === 'boss' ? 72 : 56,
  };
}

export function finish(buf: PixelBuffer, outline = true): void {
  cleanupOrphans(buf);
  if (outline) selectiveOutline(buf);
}

/**
 * 사망 연출: 2×2 픽셀 덩어리 단위로 흩어지며 가장자리가 잔향빛으로 타오른다.
 */
export function dissolve(src: PixelBuffer, n: number): PixelBuffer[] {
  const frames: PixelBuffer[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    const f = new PixelBuffer(src.w, src.h);
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (!c) continue;
        const hv = hash2(x >> 1, y >> 1, 7) * 0.7 + (1 - y / src.h) * 0.3;
        if (hv < t) continue;
        const edge = hv < t + 0.08;
        const lift = Math.round(i * 0.8);
        f.set(x, y - (edge ? lift : 0), edge ? (hv < t + 0.04 ? R.echo[4] : R.echo[3]) : c);
      }
    frames.push(f);
  }
  return frames;
}

/** 휴머노이드 포즈 좌표를 발 기준으로 배율 조정 후 이동 */
export function scalePose(p: Pose, s: number, from: [number, number], to: [number, number]): Pose {
  const keys = ['hip', 'chest', 'eF', 'hF', 'eB', 'hB', 'kF', 'fF', 'kB', 'fB'] as const;
  const out: Pose = { ...p };
  for (const k of keys) (out as any)[k] = [Math.round(to[0] + (p[k][0] - from[0]) * s), Math.round(to[1] + (p[k][1] - from[1]) * s)];
  const h = p.head ?? [1, -1];
  out.head = [Math.round(h[0] * s), Math.round(h[1] * s)];
  return out;
}

/** 좌우 반전 + 약점/부착점 좌표 반전 (적은 왼쪽을 바라본다) */
export function flipDrawn(d: Drawn): Drawn {
  const w = d.buf.w;
  return {
    buf: d.buf.flipped(),
    weak: d.weak?.map((k) => ({ ...k, x: w - 1 - k.x })),
    attach: d.attach ? Object.fromEntries(Object.entries(d.attach).map(([k, v]) => [k, [w - 1 - v[0], v[1]] as [number, number]])) : undefined,
  };
}

export function wp(id: string, x: number, y: number, r: number, hit?: number): WeakPoint {
  return { id, x: Math.round(x), y: Math.round(y), r, hit: hit ?? r + 2.5 };
}

/** 램프 치환 (같은 형태에 다른 재질 — 페이즈 변화 등 내부 용도) */
export function swapRamps(buf: PixelBuffer, map: Partial<Record<string, readonly number[]>>): void {
  for (let i = 0; i < buf.data.length; i++) {
    const c = buf.data[i];
    if (!c) continue;
    const r = rampOf(c);
    const to = map[r];
    if (to) {
      const from = (R as any)[r] as number[];
      const s = from.indexOf(c);
      buf.data[i] = to[Math.min(to.length - 1, Math.round((s * (to.length - 1)) / Math.max(1, from.length - 1)))];
    }
  }
}
