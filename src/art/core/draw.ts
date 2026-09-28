import { PixelBuffer } from './buffer';

/** 공통 광원: 왼쪽 위 앞쪽 */
const LX = -0.5, LY = -0.68, LZ = 0.54;
const LL = Math.hypot(LX, LY, LZ);
export const LIGHT = { x: LX / LL, y: LY / LL, z: LZ / LL };

export function lit(nx: number, ny: number, nz: number): number {
  return nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z;
}

/**
 * 조명 강도 → 램프 단계. 가장 어두운 단계(0)는 외곽선용으로 예약하고
 * 채움은 1..n-1 단계를 사용한다. shift로 뒤쪽 팔다리 등을 한 단계 어둡게 만든다.
 * spec=false면 최상단(하이라이트) 단계는 쓰지 않는다.
 */
export function tone(ramp: readonly number[], I: number, shift = 0, spec = true): number {
  const n = ramp.length;
  if (n === 1) return ramp[0];
  const top = spec ? n - 1 : n - 2;
  const levels = Math.max(1, top);
  let t = (I + 0.3) / 1.25;
  t = Math.max(0, Math.min(0.999, t));
  let s = 1 + Math.floor(t * levels) + shift;
  s = Math.max(1, Math.min(top, s));
  return ramp[s];
}

export type ShadeFn = (x: number, y: number, nx: number, ny: number, nz: number) => number;

export function rampShader(ramp: readonly number[], shift = 0, spec = true, bias = 0): ShadeFn {
  return (_x, _y, nx, ny, nz) => tone(ramp, lit(nx, ny, nz) + bias, shift, spec);
}

export function rect(buf: PixelBuffer, x: number, y: number, w: number, h: number, c: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) buf.set(x + i, y + j, c);
}

export function ellipse(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number, fn: ShadeFn): void {
  const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
  const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x - cx) / (rx + 0.35);
      const ny = (y - cy) / (ry + 0.35);
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d));
      const c = fn(x, y, nx, ny, nz);
      if (c >= 0) buf.set(x, y, c);
    }
  }
}

/** 두 관절 사이의 가늘어지는 캡슐(팔·다리). 회전된 비트맵이 아니라 매 포즈 새로 래스터화한다. */
export function capsule(
  buf: PixelBuffer,
  ax: number, ay: number, bx: number, by: number,
  ra: number, rb: number,
  fn: ShadeFn,
): void {
  const minX = Math.floor(Math.min(ax - ra, bx - rb) - 1), maxX = Math.ceil(Math.max(ax + ra, bx + rb) + 1);
  const minY = Math.floor(Math.min(ay - ra, by - rb) - 1), maxY = Math.ceil(Math.max(ay + ra, by + rb) + 1);
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t, py = ay + dy * t;
      const r = ra + (rb - ra) * t;
      const vx = x - px, vy = y - py;
      const d = Math.hypot(vx, vy);
      if (d > r + 0.3) continue;
      const k = Math.min(1, d / (r + 0.3));
      const nx = d > 0 ? (vx / d) * k : 0;
      const ny = d > 0 ? (vy / d) * k : 0;
      const nz = Math.sqrt(Math.max(0, 1 - k * k));
      const c = fn(x, y, nx, ny, nz);
      if (c >= 0) buf.set(x, y, c);
    }
  }
}

export type Pt = [number, number];

export function pointInPoly(x: number, y: number, pts: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 다각형 채움. 픽셀 중심 기준 판정. */
export function poly(buf: PixelBuffer, pts: readonly Pt[], fn: (x: number, y: number) => number): void {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++)
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++)
      if (pointInPoly(x + 0.5, y + 0.5, pts)) {
        const c = fn(x, y);
        if (c >= 0) buf.set(x, y, c);
      }
}

/** 브레젠험 직선 */
export function line(buf: PixelBuffer, x0: number, y0: number, x1: number, y1: number, c: number | ((x: number, y: number, t: number) => number)): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const total = Math.max(dx, -dy) || 1;
  let i = 0;
  for (;;) {
    const col = typeof c === 'number' ? c : c(x0, y0, i / total);
    if (col >= 0) buf.set(x0, y0, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    i++;
  }
}

/** 점 목록 반환 (브레젠험) */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const out: Pt[] = [];
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

/**
 * 손으로 찍은 픽셀 맵을 스탬프한다.
 * rows: 문자열 배열, legend: 문자 → 팔레트 인덱스 ('.' 또는 ' '는 투명)
 */
export function stamp(
  buf: PixelBuffer,
  rows: readonly string[],
  legend: Record<string, number>,
  x: number,
  y: number,
  flipX = false,
): void {
  const w = Math.max(...rows.map((r) => r.length));
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      const c = legend[ch];
      if (c === undefined) throw new Error(`픽셀 맵 범례에 없는 문자: '${ch}'`);
      const px = flipX ? x + (w - 1 - i) : x + i;
      buf.set(px, y + j, c);
    }
  });
}

/** 값 사이 선형 보간 후 정수화 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

/** 2차 베지어 점 샘플 */
export function quadPoints(a: Pt, c: Pt, b: Pt, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0];
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1];
    out.push([x, y]);
  }
  return out;
}

/** 폴리라인을 픽셀 연속선으로 */
export function polyline(buf: PixelBuffer, pts: readonly Pt[], c: number | ((x: number, y: number, t: number) => number)): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1);
    const t1 = (i + 1) / (pts.length - 1);
    line(buf, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], typeof c === 'number' ? c : (x, y, t) => c(x, y, t0 + (t1 - t0) * t));
  }
}

/** 결정적 해시 (좌표 기반 변형용, 무작위 노이즈 금지 — 클러스터 배치 결정에만 사용) */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
