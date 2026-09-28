import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { ellipse, poly, line, tone, lit, Pt, hash2, quadPoints, polyline, rect, Rng, rampShader, capsule } from '../core/draw';
import type { ImageSpec } from '../core/sheet';

/* 전투 배경 (480×270). 하늘 띠 → 원경 실루엣 → 중경 → 원근 바닥 → 전경 순으로 쌓는다. */
export const BG_W = 480, BG_H = 270;
export const HORIZON = 168;

function bands(img: PixelBuffer, cols: number[], y0: number, y1: number): void {
  const n = cols.length;
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0);
    const f = t * n;
    let i = Math.min(n - 1, Math.floor(f));
    // 경계 한 줄만 체크무늬로 섞는다 (과도한 디더링 금지)
    const frac = f - i;
    for (let x = 0; x < BG_W; x++) {
      let c = cols[i];
      if (i < n - 1 && frac > 0.9 && (x + y) % 2 === 0) c = cols[i + 1];
      img.set(x, y, c);
    }
  }
}

function ridge(img: PixelBuffer, baseY: number, amp: number, freq: number, seed: number, fill: (x: number, y: number, top: number) => number, jag = 0): number[] {
  const tops: number[] = [];
  for (let x = 0; x < BG_W; x++) {
    const h = Math.sin(x * freq + seed) * amp * 0.6 + Math.sin(x * freq * 2.3 + seed * 2) * amp * 0.3 + Math.sin(x * freq * 5.1 + seed) * amp * 0.1;
    const top = Math.round(baseY - Math.abs(h) - (jag ? (hash2(x >> 2, 0, seed) > 0.8 ? jag : 0) : 0));
    tops.push(top);
    for (let y = top; y < HORIZON + 4; y++) img.set(x, y, fill(x, y, top));
  }
  return tops;
}

function clouds(img: PixelBuffer, rng: Rng, n: number, ramp: readonly number[], yMax: number): void {
  for (let i = 0; i < n; i++) {
    const cx = rng.int(0, BG_W), cy = rng.int(12, yMax), w = rng.int(20, 50);
    for (let k = 0; k < 4; k++) ellipse(img, cx + k * w * 0.3 - w * 0.4, cy - (k % 2) * 3, w * 0.28, 5 + (k % 2) * 2, (x, y, nx, ny) => (ny < -0.3 ? ramp[3] : ramp[2]));
  }
}

function ground(img: PixelBuffer, ramp: readonly number[], accent: readonly number[], style: string, seed: number): void {
  for (let y = HORIZON; y < BG_H; y++) {
    const t = (y - HORIZON) / (BG_H - HORIZON);
    for (let x = 0; x < BG_W; x++) {
      let c = t < 0.12 ? ramp[1] : t < 0.4 ? ramp[2] : ramp[2];
      // 원근 줄무늬: 아래로 갈수록 간격이 넓어짐
      const row = Math.floor(Math.sqrt(t) * 22);
      const rowPrev = Math.floor(Math.sqrt(Math.max(0, (y - 1 - HORIZON) / (BG_H - HORIZON))) * 22);
      if (row !== rowPrev) c = ramp[1];
      // 무대 중앙은 밝게
      const dx = (x - 240) / 260, dy = (y - 212) / 55;
      if (dx * dx + dy * dy < 1 && c !== ramp[1]) c = ramp[3];
      img.set(x, y, c);
    }
  }
  const rng = new Rng(seed);
  // 질감 클러스터 (원근에 따라 크기 변화)
  for (let i = 0; i < 260; i++) {
    const y = rng.int(HORIZON + 3, BG_H - 2), x = rng.int(0, BG_W - 1);
    const s = 1 + Math.floor((y - HORIZON) / 40);
    const c = rng.next() > 0.5 ? ramp[1] : ramp[4] ?? ramp[3];
    if (style === 'grass') { for (let k = 0; k < s + 1; k++) { img.set(x + k * 2, y, c); img.set(x + k * 2 + 1, y - 1 - (k % 2), accent[3]); } }
    else if (style === 'stone') { rect(img, x, y, 2 * s + 1, s, c); }
    else if (style === 'crack') { line(img, x, y, x + 4 * s, y + (rng.next() > 0.5 ? s : -s), ramp[1]); }
    else if (style === 'crystal') { img.set(x, y, accent[4]); img.set(x, y - 1, accent[3]); }
    else if (style === 'root') { polyline(img, quadPoints([x, y], [x + 6 * s, y - 2 * s], [x + 12 * s, y], 5), ramp[1]); }
    else img.set(x, y, c);
  }
}

function fgGrass(img: PixelBuffer, ramp: readonly number[], seed: number): void {
  const rng = new Rng(seed);
  for (let i = 0; i < 70; i++) {
    const x = rng.next() > 0.5 ? rng.int(0, 90) : rng.int(390, 479);
    const h = rng.int(8, 22);
    line(img, x, BG_H - 1, x + rng.int(-4, 4), BG_H - 1 - h, rng.next() > 0.5 ? ramp[0] : ramp[1]);
  }
}

function bgMeadow(): PixelBuffer {
  const img = new PixelBuffer(BG_W, BG_H);
  bands(img, [R.dusk[1], R.dusk[2], R.dusk[3], R.dusk[4], R.ash[4]], 0, HORIZON);
  const rng = new Rng(11);
  clouds(img, rng, 8, R.ash, 90);
  // 먼 산
  ridge(img, 128, 22, 0.012, 1, (x, y, top) => (y === top ? R.dusk[2] : R.dusk[1]));
  // 재빛 언덕
  ridge(img, 150, 12, 0.02, 3, (x, y, top) => (y <= top + 1 ? R.grass[2] : R.grass[1]));
  // 멀리 서 있는 가시에 감긴 고목
  for (const tx of [70, 360, 430]) {
    capsule(img, tx, 160, tx + 2, 118, 2.5, 1.5, rampShader(R.ash, -1));
    ellipse(img, tx + 2, 116, 14, 9, (x, y, nx, ny, nz) => tone(R.grass, lit(nx, ny, nz) - 0.3, 0));
    line(img, tx - 6, 150, tx + 8, 128, R.thorn[1]);
  }
  ground(img, R.grass, R.ash, 'grass', 5);
  fgGrass(img, R.grass, 9);
  return img;
}

function bgRuins(): PixelBuffer {
  const img = new PixelBuffer(BG_W, BG_H);
  bands(img, [R.night[2], R.night[3], R.teal[1], R.teal[2]], 0, HORIZON);
  const rng = new Rng(21);
  clouds(img, rng, 6, R.night, 70);
  ridge(img, 140, 10, 0.03, 2, (x, y, top) => (y === top ? R.stone[2] : R.stone[1]), 6);
  // 무너진 기둥과 아치
  for (const [x, h, broken] of [[40, 90, false], [110, 70, true], [340, 96, false], [420, 60, true]] as [number, number, boolean][]) {
    rect(img, x, HORIZON - h, 18, h, R.stone[1]);
    for (let y = HORIZON - h; y < HORIZON; y++) { img.set(x, y, R.stone[2]); img.set(x + 1, y, R.stone[2]); if (y % 12 === 0) line(img, x, y, x + 17, y, R.stone[0]); }
    if (!broken) rect(img, x - 3, HORIZON - h - 6, 24, 6, R.stone[2]);
    else poly(img, [[x, HORIZON - h], [x + 8, HORIZON - h - 8], [x + 18, HORIZON - h - 2], [x + 18, HORIZON - h]], () => R.stone[1]);
    for (let k = 0; k < 4; k++) img.set(x + 3 + k * 3, HORIZON - h + 20 + k * 7, R.moss[2]);
  }
  // 물에 잠긴 바닥: 윗부분 수면
  ground(img, R.stone, R.moss, 'stone', 7);
  for (let y = HORIZON; y < HORIZON + 22; y++) for (let x = 0; x < BG_W; x++) if (((x >> 3) + (y >> 1)) % 5 !== 0) img.set(x, y, y % 3 === 0 ? R.teal[2] : R.teal[1]);
  fgGrass(img, R.moss, 12);
  return img;
}

function bgGlass(): PixelBuffer {
  const img = new PixelBuffer(BG_W, BG_H);
  bands(img, [R.night[0], R.night[1], R.teal[0], R.teal[1]], 0, HORIZON);
  const rng = new Rng(31);
  for (let i = 0; i < 60; i++) img.set(rng.int(0, 479), rng.int(0, 110), rng.next() > 0.7 ? R.echo[3] : R.echo[1]);
  // 거대한 유리 나무들
  for (const [x, h, w] of [[30, 130, 12], [120, 100, 8], [300, 140, 14], [400, 110, 10], [455, 90, 7]] as number[][]) {
    poly(img, [[x - w, HORIZON], [x - w * 0.4, HORIZON - h], [x, HORIZON - h - 10], [x + w * 0.4, HORIZON - h], [x + w, HORIZON]], (px) => (px < x - w * 0.3 ? R.glass[2] : px < x ? R.glass[1] : R.teal[1]));
    line(img, x - w * 0.4, HORIZON - h, x - 2, HORIZON - 10, R.glass[3]);
  }
  ground(img, R.teal, R.glass, 'crystal', 3);
  return img;
}

function bgPlateau(): PixelBuffer {
  const img = new PixelBuffer(BG_W, BG_H);
  bands(img, [R.dusk[0], R.dusk[1], R.dusk[2], R.rock[3]], 0, HORIZON);
  const rng = new Rng(41);
  clouds(img, rng, 10, R.dusk, 80);
  // 떠 있는 부서진 바위섬
  for (const [x, y, w] of [[90, 70, 30], [300, 50, 40], [410, 90, 22]] as number[][]) {
    poly(img, [[x - w, y], [x + w, y - 3], [x + w * 0.6, y + 8], [x, y + w * 0.7], [x - w * 0.5, y + 10]], (px, py) => (py < y + 1 ? R.rock[3] : R.rock[1]));
  }
  ridge(img, 150, 26, 0.016, 5, (x, y, top) => (y <= top + 1 ? R.rock[2] : R.rock[1]), 4);
  ground(img, R.rock, R.dusk, 'crack', 8);
  return img;
}

function bgDepths(): PixelBuffer {
  const img = new PixelBuffer(BG_W, BG_H);
  bands(img, [R.ink[0], R.root[0], R.root[1], R.plum[1]], 0, HORIZON);
  // 거대한 뿌리 아치
  for (const [a, c, b, r] of [[[0, 170], [120, 20], [240, 0], 16], [[480, 170], [360, 30], [230, 0], 14], [[60, 170], [140, 90], [200, 170], 7], [[300, 170], [380, 80], [470, 170], 8]] as [Pt, Pt, Pt, number][]) {
    quadPoints(a, c, b, 40).forEach(([x, y], i) => ellipse(img, x, y, r, r, (px, py, nx, ny, nz) => tone(R.root, lit(nx, ny, nz) - 0.25, 0)));
  }
  const rng = new Rng(51);
  for (let i = 0; i < 40; i++) { const x = rng.int(0, 479), y = rng.int(20, 160); img.set(x, y, R.echo[3]); img.set(x, y + 1, R.echo[1]); }
  ground(img, R.root, R.thorn, 'root', 4);
  return img;
}

function bgShrine(floor: readonly number[], glow: readonly number[], wall: readonly number[], seed: number): PixelBuffer {
  const img = new PixelBuffer(BG_W, BG_H);
  bands(img, [R.ink[0], wall[0], wall[1]], 0, HORIZON);
  // 기둥 회랑
  for (let i = 0; i < 7; i++) {
    const x = 20 + i * 72;
    rect(img, x, 30, 22, HORIZON - 30, wall[1]);
    for (let y = 30; y < HORIZON; y++) { img.set(x, y, wall[2]); img.set(x + 1, y, wall[2]); img.set(x + 21, y, wall[0]); }
    rect(img, x - 4, 24, 30, 7, wall[2]);
    // 벽감의 빛
    ellipse(img, x + 11, 70, 4, 6, (px, py, nx, ny, nz) => tone(glow, lit(nx, ny, nz) + 0.3, 0, true));
  }
  // 천장 아치
  for (let i = 0; i < 6; i++) polyline(img, quadPoints([31 + i * 72, 26], [67 + i * 72, 2], [103 + i * 72, 26], 10), wall[2]);
  ground(img, floor, glow, 'stone', seed);
  // 바닥 룬 원
  for (let a = 0; a < 200; a++) { const t = (a / 200) * Math.PI * 2; img.set(Math.round(240 + Math.cos(t) * 150), Math.round(214 + Math.sin(t) * 30), a % 5 === 0 ? glow[4] : glow[2]); }
  return img;
}

function bgTitle(dawn: boolean): PixelBuffer {
  const img = new PixelBuffer(BG_W, BG_H);
  bands(img, dawn ? [R.dusk[2], R.dusk[3], R.dusk[4], R.gold[3], R.gold[4]] : [R.night[0], R.night[1], R.night[2], R.plum[1], R.dusk[1]], 0, 200);
  const rng = new Rng(dawn ? 71 : 61);
  if (!dawn) for (let i = 0; i < 90; i++) img.set(rng.int(0, 479), rng.int(0, 140), rng.next() > 0.85 ? R.echo[4] : R.echo[1]);
  else clouds(img, rng, 9, R.dusk, 110);
  ridge(img, 190, 18, 0.015, 7, (x, y, top) => (dawn ? R.moss[1] : R.night[1]));
  for (let y = 200; y < BG_H; y++) for (let x = 0; x < BG_W; x++) img.set(x, y, dawn ? R.moss[1] : R.ink[1]);
  // 세계뿌리 실루엣: 땅에서 하늘로 뻗는 거대한 뿌리 나무
  const trunk = dawn ? R.wood : R.root;
  const main: [Pt, Pt, Pt, number][] = [
    [[240, 270], [236, 170], [242, 70], 20], [[240, 120], [180, 70], [120, 40], 8], [[242, 110], [310, 60], [380, 36], 9],
    [[240, 90], [220, 40], [200, 10], 6], [[244, 85], [270, 40], [300, 12], 6], [[236, 230], [150, 250], [60, 262], 10], [[244, 230], [330, 248], [440, 262], 10],
  ];
  for (const [a, c, b, r] of main) quadPoints(a, c, b, 40).forEach(([x, y], i) => ellipse(img, x, y, r * (1 - i / 60), r * (1 - i / 60), (px, py, nx, ny, nz) => tone(trunk, lit(nx, ny, nz) - (dawn ? 0 : 0.2), 0)));
  // 잔향가시 (밤) 또는 새싹 (새벽)
  for (let i = 0; i < 24; i++) {
    const x = rng.int(170, 310), y = rng.int(60, 230);
    if (!dawn) { img.set(x, y, R.thorn[3]); img.set(x + 1, y - 1, R.thorn[4]); }
    else { img.set(x, y, R.green[4]); img.set(x + 1, y, R.green[3]); }
  }
  // 심장의 빛
  ellipse(img, 240, 150, 7, 9, (px, py, nx, ny, nz) => tone(dawn ? R.gold : R.echo, lit(nx, ny, nz) + 0.4, 0, true));
  return img;
}

export function backgroundImages(): ImageSpec[] {
  return [
    { id: 'bg_meadow', kind: 'bg', image: bgMeadow() },
    { id: 'bg_ruins', kind: 'bg', image: bgRuins() },
    { id: 'bg_glass', kind: 'bg', image: bgGlass() },
    { id: 'bg_plateau', kind: 'bg', image: bgPlateau() },
    { id: 'bg_depths', kind: 'bg', image: bgDepths() },
    { id: 'bg_shrine_ember', kind: 'bg', image: bgShrine(R.stone, R.ember, R.stone, 13) },
    { id: 'bg_shrine_glass', kind: 'bg', image: bgShrine(R.teal, R.glass, R.night, 14) },
    { id: 'bg_shrine_storm', kind: 'bg', image: bgShrine(R.night, R.storm, R.plum, 15) },
    { id: 'bg_title', kind: 'bg', image: bgTitle(false) },
    { id: 'bg_dawn', kind: 'bg', image: bgTitle(true) },
  ];
}
