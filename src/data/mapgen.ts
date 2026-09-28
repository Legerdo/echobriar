import { hash2 } from '../core/util';

/**
 * 맵 작성 도구. 핵심 경로·방·물길은 좌표로 직접 설계하고,
 * 나무·바위 같은 장식만 결정적 시드로 흩뿌린다 (진행 경로는 예약되어 흔들리지 않음).
 *
 * 타일 문자: '.' 바닥 ',' 장식 바닥 '=' 길 '~' 물 '#' 절벽 'b' 다리
 * 소품 문자(막힘): T 나무 o 바위 * 덤불 P 기둥 p 부서진 기둥 c 수정 f 울타리 h 집 w 우물 l 등불 t 천막 s 석상 m 벽화
 */
export type Pt = [number, number];

export class MapBuilder {
  readonly w: number;
  readonly h: number;
  g: string[][];
  private reserved = new Set<number>();

  constructor(w: number, h: number, fill = '.') {
    this.w = w;
    this.h = h;
    this.g = Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  }
  in(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  set(x: number, y: number, ch: string): this {
    if (this.in(x, y)) this.g[y][x] = ch;
    return this;
  }
  get(x: number, y: number): string {
    return this.in(x, y) ? this.g[y][x] : '#';
  }
  reserve(x: number, y: number, r = 0): this {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.in(x + dx, y + dy)) this.reserved.add((y + dy) * this.w + x + dx);
    return this;
  }
  isReserved(x: number, y: number): boolean {
    return this.reserved.has(y * this.w + x);
  }
  rect(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
    return this;
  }
  /** 가장자리를 불규칙한 두께로 채운다 (최소 1) */
  ragged(ch: string, depth: number, seed: number, keep: Pt[][] = []): this {
    const keepSet = new Set<number>();
    for (const seg of keep) for (const [x, y] of seg) keepSet.add(y * this.w + x);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const d = Math.min(x, y, this.w - 1 - x, this.h - 1 - y);
      const t = 1 + Math.floor(hash2(Math.floor(x / 3), Math.floor(y / 3), seed) * depth);
      if (d < t && !keepSet.has(y * this.w + x)) this.set(x, y, ch);
    }
    return this;
  }
  /** 굵은 꺾은선 (진행 경로 — 예약됨) */
  path(pts: Pt[], width: number, ch = '=', reserve = true): this {
    for (let i = 0; i < pts.length - 1; i++) {
      let [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (let k = 0; k < 500; k++) {
        this.brush(x0, y0, width, ch, reserve);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
    return this;
  }
  private brush(cx: number, cy: number, w: number, ch: string, reserve: boolean): void {
    const a = -Math.floor((w - 1) / 2), b = Math.ceil((w - 1) / 2);
    for (let y = a; y <= b; y++) for (let x = a; x <= b; x++) {
      this.set(cx + x, cy + y, ch);
      if (reserve) this.reserve(cx + x, cy + y);
    }
  }
  /** 가장자리가 흔들리는 타원 */
  blob(cx: number, cy: number, rx: number, ry: number, ch: string, seed: number, noise = 0.25): this {
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      const n = (hash2(x >> 1, y >> 1, seed) - 0.5) * noise * 2;
      if (nx * nx + ny * ny < 1 + n) this.set(x, y, ch);
    }
    return this;
  }
  /** 바닥 위에만 소품을 흩뿌림 — 예약 칸과 그 주변, 길 옆은 피한다 */
  scatter(ch: string, count: number, x0: number, y0: number, x1: number, y1: number, seed: number, on = '.,'): this {
    let placed = 0;
    for (let i = 0; i < count * 30 && placed < count; i++) {
      const x = x0 + Math.floor(hash2(i, seed, 7) * (x1 - x0 + 1));
      const y = y0 + Math.floor(hash2(seed, i, 13) * (y1 - y0 + 1));
      if (!on.includes(this.get(x, y))) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
        if (this.isReserved(x + dx, y + dy)) ok = false;
        const c = this.get(x + dx, y + dy);
        if (c === '=' || c === 'b') ok = false;
      }
      if (!ok) continue;
      this.set(x, y, ch);
      placed++;
    }
    return this;
  }
  /** 장식 바닥(,) 흩뿌리기 */
  sprinkle(density: number, seed: number): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.g[y][x] === '.' && hash2(x, y, seed) < density) this.g[y][x] = ',';
    return this;
  }
  rows(): string[] {
    return this.g.map((r) => r.join(''));
  }
}
