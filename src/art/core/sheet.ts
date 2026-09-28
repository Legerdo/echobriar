import { PixelBuffer } from './buffer';

export type FrameTag =
  | 'idle' | 'anticipation' | 'attack' | 'contact' | 'recovery'
  | 'hurt' | 'break' | 'death' | 'air' | 'land' | 'cast' | 'move' | 'hold';

/** 정밀 조준 약점 (원형 판정). 좌표는 프레임 기준 픽셀. */
export interface WeakPoint {
  id: string;
  x: number;
  y: number;
  /** 시각적 덩어리 반경 */
  r: number;
  /** 입력 판정 반경 (시각보다 약간 넓게) */
  hit: number;
}

export interface FrameMeta {
  tag?: FrameTag;
  attach?: Record<string, [number, number]>;
  weak?: WeakPoint[];
}

export interface AnimSpec {
  name: string;
  frames: PixelBuffer[];
  durations: number[];
  loop: boolean;
  meta: FrameMeta[];
  /** 지면 앵커를 떠나는 애니메이션 (점프 등) — 발 앵커 검증 제외 */
  airborne?: boolean;
}

export type SheetKind = 'player' | 'field' | 'enemy' | 'boss' | 'fx' | 'prop' | 'portrait' | 'icon' | 'npc';

export interface SheetSpec {
  id: string;
  kind: SheetKind;
  frameW: number;
  frameH: number;
  /** 발 기준 앵커 (프레임 좌표) */
  anchor: [number, number];
  anims: AnimSpec[];
  /** 필수 애니메이션 목록 (검증용) */
  required?: string[];
  /** 이 시트에서 허용되는 램프 (검증용) */
  ramps?: string[];
  /** 핵심 색상 수 상한 (이펙트 제외) */
  maxColors?: number;
}

export interface ImageSpec {
  id: string;
  kind: 'bg' | 'tileset' | 'ui' | 'image';
  image: PixelBuffer;
  meta?: Record<string, unknown>;
}

export class AnimBuilder {
  frames: PixelBuffer[] = [];
  durations: number[] = [];
  meta: FrameMeta[] = [];
  constructor(public name: string, public loop = false, public airborne = false) {}
  add(buf: PixelBuffer, ms: number, meta: FrameMeta = {}): this {
    this.frames.push(buf);
    this.durations.push(ms);
    this.meta.push(meta);
    return this;
  }
  build(): AnimSpec {
    return { name: this.name, frames: this.frames, durations: this.durations, loop: this.loop, meta: this.meta, airborne: this.airborne };
  }
}

/* ---------- 매니페스트 (런타임이 읽는 형식) ---------- */

export interface ManifestFrame { x: number; y: number }
export interface ManifestAnim {
  frames: number[];
  durations: number[];
  loop: boolean;
  tags: (FrameTag | null)[];
  attach: (Record<string, [number, number]> | null)[];
  weak: (WeakPoint[] | null)[];
  airborne: boolean;
}
export interface ManifestSheet {
  id: string;
  kind: SheetKind;
  file: string;
  frameW: number;
  frameH: number;
  anchor: [number, number];
  frames: ManifestFrame[];
  anims: Record<string, ManifestAnim>;
}
export interface ManifestImage {
  id: string;
  kind: string;
  file: string;
  w: number;
  h: number;
  meta?: Record<string, unknown>;
}
export interface Manifest {
  version: number;
  generatedAt: string;
  sheets: Record<string, ManifestSheet>;
  images: Record<string, ManifestImage>;
}
