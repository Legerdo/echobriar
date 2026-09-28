import { PALETTE } from './palette';

/** 팔레트 인덱스 픽셀 버퍼. 모든 좌표는 정수. */
export class PixelBuffer {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;

  constructor(w: number, h: number, data?: Uint8Array) {
    this.w = w;
    this.h = h;
    this.data = data ?? new Uint8Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number): number {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }
  set(x: number, y: number, c: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  }
  /** 불투명한 곳에만 덮어쓰기 */
  setIfOpaque(x: number, y: number, c: number): void {
    if (this.get(x, y) !== 0) this.set(x, y, c);
  }
  clone(): PixelBuffer {
    return new PixelBuffer(this.w, this.h, new Uint8Array(this.data));
  }
  clear(): void {
    this.data.fill(0);
  }
  /** src를 (dx,dy)에 합성 (0은 투명) */
  blit(src: PixelBuffer, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.data[y * src.w + (flipX ? src.w - 1 - x : x)];
        if (c) this.set(dx + x, dy + y, c);
      }
    }
  }
  flipped(): PixelBuffer {
    const out = new PixelBuffer(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) out.data[y * this.w + x] = this.data[y * this.w + (this.w - 1 - x)];
    return out;
  }
  countOpaque(): number {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i]) n++;
    return n;
  }
  /** 불투명 영역 경계 상자 */
  bounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.data[y * this.w + x]) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  toRGBA(): Uint8Array {
    const out = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.data.length; i++) {
      const p = PALETTE[this.data[i]];
      out[i * 4] = p[0];
      out[i * 4 + 1] = p[1];
      out[i * 4 + 2] = p[2];
      out[i * 4 + 3] = p[3];
    }
    return out;
  }
}
