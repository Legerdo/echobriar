import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { ellipse, poly, line, Pt, rect, tone, lit, polyline, quadPoints, Rng, rampShader } from '../core/draw';
import { selectiveOutline } from '../core/post';
import { AnimBuilder, SheetSpec } from '../core/sheet';

/* 이펙트는 캐릭터 본체와 별도 레이어. 공격 실루엣을 가리지 않도록 짧고 얇게 설계한다. */

function fxSheet(id: string, w: number, h: number, n: number, ms: number, draw: (b: PixelBuffer, i: number, n: number) => void, outline = false, anchor?: [number, number]): SheetSpec {
  const ab = new AnimBuilder('play', false);
  for (let i = 0; i < n; i++) {
    const b = new PixelBuffer(w, h);
    draw(b, i, n);
    if (outline) selectiveOutline(b, { soften: false });
    ab.add(b, ms);
  }
  return { id, kind: 'fx', frameW: w, frameH: h, anchor: anchor ?? [w >> 1, h >> 1], anims: [ab.build()], required: ['play'] };
}

function arc(b: PixelBuffer, cx: number, cy: number, r: number, a0: number, a1: number, thick: number, col: (t: number, k: number) => number): void {
  const steps = Math.ceil(Math.abs(a1 - a0) * r * 1.5);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const a = a0 + (a1 - a0) * t;
    const th = thick * Math.sin(Math.PI * t);
    for (let k = 0; k <= th; k += 0.5) {
      b.set(Math.round(cx + Math.cos(a) * (r - k)), Math.round(cy + Math.sin(a) * (r - k)), col(t, k / Math.max(1, th)));
    }
  }
}

function burst(b: PixelBuffer, cx: number, cy: number, rays: number, len: number, ramp: readonly number[], rot = 0): void {
  for (let i = 0; i < rays; i++) {
    const a = rot + (i * Math.PI * 2) / rays;
    const L = len * (i % 2 ? 0.6 : 1);
    line(b, cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L, ramp[i % 2 ? 3 : 4]);
  }
}

export function effectSheets(): SheetSpec[] {
  const out: SheetSpec[] = [];
  out.push(fxSheet('fx_slash', 56, 56, 4, 45, (b, i) => {
    const sweep = [0.35, 0.8, 1.0, 1.0][i];
    const fade = i === 3;
    arc(b, 28, 30, 22, -2.2, -2.2 + 2.6 * sweep, fade ? 2 : 5, (t, k) => (fade ? R.steel[2] : k < 0.3 ? R.white[0] : t > 0.8 ? R.steel[3] : R.echo[3]));
  }));
  out.push(fxSheet('fx_hit', 24, 24, 4, 40, (b, i) => {
    const r = [4, 8, 10, 11][i];
    burst(b, 12, 12, 8, r, i < 2 ? R.gold : R.ember, i * 0.2);
    if (i < 2) ellipse(b, 12, 12, 2 + i, 2 + i, () => R.white[0]);
  }));
  out.push(fxSheet('fx_parry', 40, 40, 5, 40, (b, i) => {
    const r = [5, 10, 14, 16, 17][i];
    line(b, 20 - r, 20, 20 + r, 20, i < 3 ? R.white[0] : R.gold[3]);
    line(b, 20, 20 - r, 20, 20 + r, i < 3 ? R.white[0] : R.gold[3]);
    line(b, 20 - r * 0.6, 20 - r * 0.6, 20 + r * 0.6, 20 + r * 0.6, R.gold[4]);
    line(b, 20 - r * 0.6, 20 + r * 0.6, 20 + r * 0.6, 20 - r * 0.6, R.gold[4]);
    if (i >= 1) for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; if (a % 2 === 0) b.set(Math.round(20 + Math.cos(t) * (r - 2)), Math.round(20 + Math.sin(t) * (r - 2)), R.gold[i > 3 ? 2 : 4]); }
  }));
  out.push(fxSheet('fx_fire', 40, 40, 6, 60, (b, i) => {
    const rng = new Rng(3);
    const s = [0.4, 0.8, 1, 1, 0.8, 0.5][i];
    for (let k = 0; k < 7; k++) {
      const x = 20 + rng.int(-8, 8) * s, y = 24 + rng.int(-4, 6) * s;
      const h = (8 + rng.int(0, 10)) * s;
      poly(b, [[x - 4 * s, y], [x + 4 * s, y], [x + 1, y - h]], (px, py) => (py > y - h * 0.3 ? R.ember[2] : py > y - h * 0.7 ? R.ember[3] : R.ember[4]));
    }
    if (i > 3) for (let k = 0; k < 5; k++) b.set(20 + rng.int(-12, 12), 10 + rng.int(-4, 8) - i, R.ash[3]);
  }));
  out.push(fxSheet('fx_tide', 40, 40, 6, 60, (b, i) => {
    const s = [0.3, 0.7, 1, 1, 0.9, 0.6][i];
    ellipse(b, 20, 30, 16 * s, 5 * s, (x, y, nx, ny) => (ny < -0.2 ? R.tide[4] : R.tide[2]));
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI * (0.15 + k * 0.14);
      const L = 18 * s;
      polyline(b, quadPoints([20, 28], [20 + Math.cos(a) * L * 0.5, 28 + Math.sin(a) * L * 1.2], [20 + Math.cos(a) * L, 28 + Math.sin(a) * L * 0.5], 6), k % 2 ? R.tide[3] : R.tide[4]);
    }
  }));
  out.push(fxSheet('fx_storm', 32, 64, 5, 50, (b, i) => {
    if (i === 4) { ellipse(b, 16, 58, 8, 3, () => R.storm[2]); return; }
    const rng = new Rng(10 + i);
    let x = 16, y = 0;
    const pts: Pt[] = [[x, y]];
    while (y < 58) { y += rng.int(5, 9); x += rng.int(-5, 5); pts.push([x, Math.min(58, y)]); }
    polyline(b, pts, R.storm[4]);
    polyline(b, pts.map(([px, py]) => [px + 1, py] as Pt), i === 1 ? R.white[0] : R.storm[3]);
    ellipse(b, x, 58, 5 + i, 2, () => R.storm[3]);
  }));
  out.push(fxSheet('fx_arrow', 16, 8, 1, 100, (b) => {
    line(b, 1, 4, 12, 4, R.wood[3]); b.set(13, 4, R.steel[4]); b.set(14, 4, R.steel[3]); b.set(12, 3, R.steel[2]); b.set(12, 5, R.steel[2]);
    b.set(1, 3, R.rust[3]); b.set(2, 3, R.rust[3]); b.set(1, 5, R.rust[3]);
  }));
  out.push(fxSheet('fx_bolt', 16, 16, 2, 70, (b, i) => {
    ellipse(b, 8, 8, 4 + i, 4 + i, (x, y, nx, ny, nz) => tone(R.echo, lit(nx, ny, nz) + 0.4, 0, true));
    b.set(7, 7, R.white[0]);
  }));
  out.push(fxSheet('fx_shot', 16, 16, 2, 70, (b, i) => {
    ellipse(b, 8, 8, 4, 4, (x, y, nx, ny, nz) => tone(R.ember, lit(nx, ny, nz) + 0.2, 0, true));
    line(b, 0, 8, 3 + i, 8, R.gold[3]); b.set(7, 6, R.gold[4]);
  }));
  out.push(fxSheet('fx_muzzle', 32, 32, 3, 40, (b, i) => {
    burst(b, 16, 16, 10, [8, 14, 10][i], R.gold, i * 0.3);
    ellipse(b, 16, 16, [4, 6, 3][i], [4, 6, 3][i], () => (i < 2 ? R.white[0] : R.gold[3]));
  }));
  out.push(fxSheet('fx_wave', 48, 32, 4, 60, (b, i) => {
    // 지면 충격파: 낮게 깔린 흙먼지 + 균열 (점프 대응 신호)
    for (let k = 0; k < 5; k++) {
      const x = 6 + k * 9, h = 6 + ((k + i) % 3) * 4;
      ellipse(b, x, 28 - h * 0.4, 5, h * 0.5, (px, py, nx, ny) => (ny < -0.3 ? R.earth[4] : R.earth[3]));
    }
    line(b, 0, 30, 47, 30, R.ember[3]); line(b, 4, 31, 44, 31, R.ember[2]);
    for (let k = 0; k < 4; k++) b.set(8 + k * 10 + i, 22 - i * 2, R.stone[3]);
  }, true, [24, 31]));
  out.push(fxSheet('fx_break', 64, 64, 7, 55, (b, i) => {
    const rng = new Rng(77);
    const r = 4 + i * 5;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + rng.next() * 0.3;
      const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r;
      const s = 2 + (k % 3);
      poly(b, [[x, y - s], [x + s, y], [x, y + s * 0.6], [x - s * 0.7, y]], (px) => (px < x ? R.echo[4] : R.glass[3]));
    }
    if (i < 3) { burst(b, 32, 32, 12, 10 + i * 6, R.echo); ellipse(b, 32, 32, 6 - i, 6 - i, () => R.white[0]); }
  }));
  out.push(fxSheet('fx_heal', 32, 40, 6, 70, (b, i) => {
    const rng = new Rng(5);
    for (let k = 0; k < 9; k++) {
      const x = rng.int(4, 28), y = 36 - ((rng.int(0, 20) + i * 5) % 34);
      const c = k % 3 === 0 ? R.gold[4] : R.green[4];
      b.set(x, y, c); b.set(x - 1, y, R.green[3]); b.set(x + 1, y, R.green[3]); b.set(x, y - 1, R.green[3]); b.set(x, y + 1, R.green[3]);
    }
  }));
  out.push(fxSheet('fx_shield', 48, 64, 4, 90, (b, i) => {
    for (let a = 0; a < 120; a++) {
      const t = (a / 120) * Math.PI * 2;
      const x = Math.round(24 + Math.cos(t) * 20), y = Math.round(34 + Math.sin(t) * 28);
      if ((a + i * 3) % 6 < 4) b.set(x, y, a % 12 < 6 ? R.echo[4] : R.echo[3]);
    }
    for (let k = 0; k < 4; k++) line(b, 12 + k * 8, 10 + (k % 2) * 4, 12 + k * 8, 58 - (k % 2) * 4, (k + i) % 4 === 0 ? R.echo[2] : 0 as any);
  }));
  out.push(fxSheet('fx_curse', 32, 32, 5, 70, (b, i) => {
    for (let k = 0; k < 3; k++) {
      const pts: Pt[] = [];
      for (let s = 0; s < 14; s++) { const a = s * 0.5 + k * 2.1 + i * 0.6; const r = 3 + s * 0.9; pts.push([16 + Math.cos(a) * r, 16 + Math.sin(a) * r * 0.7]); }
      polyline(b, pts, k === 0 ? R.plum[4] : R.plum[3]);
    }
    b.set(16, 16, R.gold[3]);
  }));
  out.push(fxSheet('fx_beam', 64, 20, 3, 50, (b, i) => {
    for (let x = 0; x < 64; x++) {
      const w = 4 + Math.round(Math.sin(x * 0.4 + i * 2) * 1.5);
      for (let y = 10 - w; y <= 10 + w; y++) b.set(x, y, Math.abs(y - 10) < 2 ? R.white[0] : Math.abs(y - 10) < 4 ? R.echo[4] : R.echo[2]);
    }
  }));
  out.push(fxSheet('fx_dust', 24, 16, 4, 60, (b, i) => {
    for (const s of [-1, 1]) ellipse(b, 12 + s * (3 + i * 3), 12 - i, 3 - i * 0.5, 2 - i * 0.3, () => (i < 2 ? R.earth[4] : R.earth[3]));
  }, false, [12, 15]));
  out.push(fxSheet('fx_counter', 72, 56, 6, 45, (b, i) => {
    const r = 8 + i * 5;
    arc(b, 36, 28, r, -Math.PI * 0.9, Math.PI * 0.3, 4, (t, k) => (k < 0.4 ? R.white[0] : R.gold[4]));
    if (i < 3) burst(b, 36, 28, 10, 6 + i * 6, R.gold, i);
  }));
  out.push(fxSheet('fx_resonance', 96, 96, 8, 60, (b, i) => {
    for (let ring = 0; ring < 3; ring++) {
      const r = 6 + i * 6 - ring * 8;
      if (r <= 0) continue;
      for (let a = 0; a < 160; a++) { const t = (a / 160) * Math.PI * 2; if ((a + ring * 7) % 4 < 3) b.set(Math.round(48 + Math.cos(t) * r), Math.round(48 + Math.sin(t) * r), [R.echo[4], R.gold[4], R.storm[4]][ring]); }
    }
    if (i < 4) burst(b, 48, 48, 16, 12 + i * 8, R.echo, i * 0.2);
  }));
  // 표식 (적 위에 떠 있는 작은 문장)
  const markSheet = (id: string, ramp: readonly number[], shape: 'crack' | 'track' | 'echo') => fxSheet(id, 16, 16, 2, 300, (b, i) => {
    if (shape === 'crack') { poly(b, [[8, 1], [14, 8], [8, 15], [2, 8]], () => ramp[2]); line(b, 8, 3, 6, 8, R.ink[0]); line(b, 6, 8, 9, 13, R.ink[0]); }
    if (shape === 'track') { for (let a = 0; a < 36; a++) { const t = (a / 36) * Math.PI * 2; b.set(Math.round(8 + Math.cos(t) * 6), Math.round(8 + Math.sin(t) * 6), ramp[3]); } line(b, 8, 0, 8, 15, ramp[4]); line(b, 0, 8, 15, 8, ramp[4]); }
    if (shape === 'echo') { for (const r of [2, 5]) for (let a = 0; a < 30; a++) { const t = (a / 30) * Math.PI * 2; b.set(Math.round(8 + Math.cos(t) * r), Math.round(8 + Math.sin(t) * r), ramp[r > 3 ? 3 : 4]); } }
    if (i) b.set(8, 8, R.white[0]);
  }, true);
  out.push(markSheet('fx_mark_crack', R.ember, 'crack'), markSheet('fx_mark_track', R.gold, 'track'), markSheet('fx_mark_echo', R.echo, 'echo'));
  return out;
}

export { rect, rampShader };
