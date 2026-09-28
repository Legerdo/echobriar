import { Assets, AnimPlayer } from './assets';
import { W, H } from '../core/engine';

export const FONT = '"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", "Nanum Gothic", "NanumGothic", system-ui, sans-serif';

/** UI 색 (팔레트에서 발췌) */
export const COL = {
  ink: '#0d0a12',
  ink2: '#1a1522',
  ui1: '#18151e',
  ui2: '#26212d',
  ui3: '#383140',
  ui4: '#51485a',
  bone: '#d9cbb2',
  boneDim: '#ad9a84',
  brass: '#a47028',
  brassHi: '#d6a748',
  gold: '#f4dc8a',
  hp: '#52863a',
  hpHi: '#82b458',
  hpLow: '#dc2f48',
  ap: '#e8b62a',
  apDim: '#5a3a08',
  brk: '#579dce',
  brkFull: '#a5def3',
  echo: '#a5def3',
  echo2: '#579dce',
  thorn: '#dc7096',
  ember: '#ff9838',
  tide: '#3897ce',
  storm: '#b592ef',
  white: '#ffffff',
  bad: '#ff7888',
  good: '#b8e08a',
} as const;

export interface SpriteOpts {
  flip?: boolean;
  scale?: number;
  alpha?: number;
  /** 단색 섬광 (피격·강조) */
  tint?: string | null;
}

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  shadow?: string | false;
  bold?: boolean;
  maxW?: number;
  alpha?: number;
}

/** 캔버스 그리기 도우미 — 모든 좌표는 논리 픽셀 정수 */
export class Gfx {
  constructor(public readonly ctx: CanvasRenderingContext2D, public readonly assets: Assets) {}

  clear(color: string = COL.ink): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, W, H);
  }
  rect(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    const c = this.ctx;
    if (alpha !== 1) c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (alpha !== 1) c.globalAlpha = 1;
  }
  outline(x: number, y: number, w: number, h: number, color: string): void {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    this.rect(x, y, w, 1, color); this.rect(x, y + h - 1, w, 1, color);
    this.rect(x, y, 1, h, color); this.rect(x + w - 1, y, 1, h, color);
  }
  image(id: string, x: number, y: number, alpha = 1, scale = 1): void {
    const img = this.assets.images.get(id);
    if (!img) return;
    if (alpha !== 1) this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, Math.round(x), Math.round(y), img.width * scale, img.height * scale);
    if (alpha !== 1) this.ctx.globalAlpha = 1;
  }
  /** 이미지 일부 */
  imagePart(id: string, sx: number, sy: number, sw: number, sh: number, x: number, y: number): void {
    const img = this.assets.images.get(id);
    if (!img) return;
    this.ctx.drawImage(img, sx, sy, sw, sh, Math.round(x), Math.round(y), sw, sh);
  }

  /** 시트의 전역 프레임 번호를 앵커 기준 (x,y)에 그린다 */
  frame(sheetId: string, frame: number, x: number, y: number, o: SpriteOpts = {}): void {
    const s = this.assets.sheet(sheetId);
    const f = s.frames[frame];
    if (!f) return;
    const img = o.tint ? this.assets.tinted(sheetId, o.tint) : this.assets.sheetImg.get(sheetId);
    if (!img) return;
    const k = Math.max(1, Math.round(o.scale ?? 1));
    const c = this.ctx;
    if (o.alpha !== undefined && o.alpha !== 1) c.globalAlpha = Math.max(0, o.alpha);
    const [ax, ay] = s.anchor;
    const dy = Math.round(y) - ay * k;
    if (o.flip) {
      const dx = Math.round(x) - (s.frameW - 1 - ax) * k;
      c.save();
      c.translate(dx + s.frameW * k, dy);
      c.scale(-1, 1);
      c.drawImage(img, f.x, f.y, s.frameW, s.frameH, 0, 0, s.frameW * k, s.frameH * k);
      c.restore();
    } else {
      c.drawImage(img, f.x, f.y, s.frameW, s.frameH, Math.round(x) - ax * k, dy, s.frameW * k, s.frameH * k);
    }
    if (o.alpha !== undefined && o.alpha !== 1) c.globalAlpha = 1;
  }
  anim(p: AnimPlayer, x: number, y: number, o: SpriteOpts = {}): void {
    this.frame(p.sheet, p.globalFrame(this.assets), x, y, o);
  }
  /** 애니메이션 이름 + 내부 프레임 번호 */
  animFrame(sheetId: string, anim: string, idx: number, x: number, y: number, o: SpriteOpts = {}): void {
    const a = this.assets.anim(sheetId, anim);
    this.frame(sheetId, a.frames[Math.min(idx, a.frames.length - 1)], x, y, o);
  }
  /** 16×16 아이콘을 좌상단 기준으로 */
  icon(name: string, x: number, y: number, o: SpriteOpts = {}): void {
    if (!this.assets.hasAnim('icons', name)) return;
    this.animFrame('icons', name, 0, x + 8 * (o.scale ?? 1), y + 8 * (o.scale ?? 1), o);
  }
  portrait(name: string, x: number, y: number, o: SpriteOpts = {}): void {
    if (!this.assets.hasAnim('portraits', name)) return;
    this.animFrame('portraits', name, 0, x + 8 * (o.scale ?? 1), y + 8 * (o.scale ?? 1), o);
  }

  font(size: number, bold = false): string {
    return `${bold ? '700 ' : ''}${size}px ${FONT}`;
  }
  text(s: string, x: number, y: number, o: TextOpts = {}): void {
    const c = this.ctx;
    c.font = this.font(o.size ?? 8, o.bold);
    c.textAlign = o.align ?? 'left';
    c.textBaseline = o.baseline ?? 'top';
    if (o.alpha !== undefined) c.globalAlpha = o.alpha;
    const shadow = o.shadow === undefined ? COL.ink : o.shadow;
    if (shadow) {
      c.fillStyle = shadow;
      c.fillText(s, Math.round(x) + 0.5, Math.round(y) + 0.75, o.maxW);
    }
    c.fillStyle = o.color ?? COL.bone;
    c.fillText(s, Math.round(x), Math.round(y), o.maxW);
    if (o.alpha !== undefined) c.globalAlpha = 1;
  }
  measure(s: string, size = 8, bold = false): number {
    this.ctx.font = this.font(size, bold);
    return this.ctx.measureText(s).width;
  }
  /** 9-슬라이스 패널 */
  panel(x: number, y: number, w: number, h: number, hi = false, alpha = 1): void {
    const img = this.assets.images.get(hi ? 'ui_frame_hi' : 'ui_frame');
    if (!img) return;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const c = this.ctx, s = 6, S = img.width;
    if (alpha !== 1) c.globalAlpha = alpha;
    const m = S - 2 * s;
    // 모서리
    c.drawImage(img, 0, 0, s, s, x, y, s, s);
    c.drawImage(img, S - s, 0, s, s, x + w - s, y, s, s);
    c.drawImage(img, 0, S - s, s, s, x, y + h - s, s, s);
    c.drawImage(img, S - s, S - s, s, s, x + w - s, y + h - s, s, s);
    // 변
    c.drawImage(img, s, 0, m, s, x + s, y, w - 2 * s, s);
    c.drawImage(img, s, S - s, m, s, x + s, y + h - s, w - 2 * s, s);
    c.drawImage(img, 0, s, s, m, x, y + s, s, h - 2 * s);
    c.drawImage(img, S - s, s, s, m, x + w - s, y + s, s, h - 2 * s);
    // 내부
    c.drawImage(img, s, s, m, m, x + s, y + s, w - 2 * s, h - 2 * s);
    if (alpha !== 1) c.globalAlpha = 1;
  }
  bar(x: number, y: number, w: number, h: number, ratio: number, fg: string, bg: string = COL.ink, border: string | null = COL.ui4): void {
    x = Math.round(x); y = Math.round(y);
    if (border) this.rect(x - 1, y - 1, w + 2, h + 2, border);
    this.rect(x, y, w, h, bg);
    const fw = Math.round(w * Math.max(0, Math.min(1, ratio)));
    if (fw > 0) {
      this.rect(x, y, fw, h, fg);
      if (h >= 3) this.rect(x, y, fw, 1, 'rgba(255,255,255,0.25)');
    }
  }
  /** 픽셀 원 (정수 좌표, 두께 1) */
  ring(cx: number, cy: number, r: number, color: string, alpha = 1): void {
    if (r <= 0) return;
    const c = this.ctx;
    c.globalAlpha = alpha;
    c.fillStyle = color;
    const n = Math.max(12, Math.round(r * 6.3));
    let lx = NaN, ly = NaN;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(t) * r), py = Math.round(cy + Math.sin(t) * r);
      if (px === lx && py === ly) continue;
      c.fillRect(px, py, 1, 1);
      lx = px; ly = py;
    }
    c.globalAlpha = 1;
  }
  /** 픽셀 마름모 (색 외에 모양으로도 구분하기 위한 표식) */
  diamond(cx: number, cy: number, r: number, color: string, fill = true): void {
    for (let dy = -r; dy <= r; dy++) {
      const w = r - Math.abs(dy);
      if (fill) this.rect(cx - w, cy + dy, w * 2 + 1, 1, color);
      else { this.rect(cx - w, cy + dy, 1, 1, color); this.rect(cx + w, cy + dy, 1, 1, color); }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    this.ctx.fillStyle = color;
    for (let i = 0; i < 2000; i++) {
      this.ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
}
