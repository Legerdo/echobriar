import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { hash2, line, poly, tone, lit, ellipse, rampShader, Pt } from '../core/draw';
import type { ImageSpec } from '../core/sheet';

/**
 * 지형 타일 생성기 (16×16, 듀얼 그리드).
 * 각 오버레이 지형(길·물·절벽)은 네 모서리 소속 비트(TL=1, TR=2, BL=4, BR=8)에 따른 16가지 마스크 타일을 갖는다.
 * → 내부, 가장자리, 안쪽 모서리, 바깥쪽 모서리, 대각 전환이 모두 포함된다.
 * 경계는 2×2 픽셀 덩어리 단위로만 흔들어 무작위 잡음 대신 읽히는 불규칙성을 만든다.
 */
export const TS = 16;

type GroundStyle = 'grass' | 'moss' | 'slab' | 'earth' | 'glass' | 'flesh' | 'rune';
type PathStyle = 'dirt' | 'flag' | 'gravel' | 'sand' | 'root' | 'carpet';
type WaterStyle = 'water' | 'bog' | 'abyss' | 'glasspool' | 'ember';
type CliffStyle = 'rock' | 'brick' | 'crystal' | 'root';

export interface Biome {
  id: string;
  ground: { ramp: readonly number[]; style: GroundStyle; accent: readonly number[]; flower?: readonly number[] };
  path: { ramp: readonly number[]; style: PathStyle };
  water: { ramp: readonly number[]; style: WaterStyle; edge: readonly number[] };
  cliff: { top: readonly number[]; face: readonly number[]; style: CliffStyle };
}

export const BIOMES: Biome[] = [
  { id: 'hub', ground: { ramp: R.moss, style: 'grass', accent: R.green, flower: R.flower }, path: { ramp: R.stone, style: 'flag' }, water: { ramp: R.tide, style: 'water', edge: R.stone }, cliff: { top: R.moss, face: R.stone, style: 'rock' } },
  { id: 'meadow', ground: { ramp: R.grass, style: 'grass', accent: R.ash, flower: R.ember }, path: { ramp: R.earth, style: 'dirt' }, water: { ramp: R.tide, style: 'water', edge: R.earth }, cliff: { top: R.grass, face: R.earth, style: 'rock' } },
  { id: 'ruins', ground: { ramp: R.stone, style: 'slab', accent: R.moss }, path: { ramp: R.moss, style: 'gravel' }, water: { ramp: R.teal, style: 'bog', edge: R.moss }, cliff: { top: R.stone, face: R.stone, style: 'brick' } },
  { id: 'glass', ground: { ramp: R.teal, style: 'glass', accent: R.glass }, path: { ramp: R.glass, style: 'sand' }, water: { ramp: R.glass, style: 'glasspool', edge: R.teal }, cliff: { top: R.teal, face: R.night, style: 'crystal' } },
  { id: 'plateau', ground: { ramp: R.rock, style: 'earth', accent: R.dusk }, path: { ramp: R.ash, style: 'gravel' }, water: { ramp: R.night, style: 'abyss', edge: R.rock }, cliff: { top: R.rock, face: R.rock, style: 'rock' } },
  { id: 'depths', ground: { ramp: R.root, style: 'flesh', accent: R.thorn }, path: { ramp: R.plum, style: 'root' }, water: { ramp: R.night, style: 'abyss', edge: R.root }, cliff: { top: R.root, face: R.root, style: 'root' } },
  { id: 'shrine_ember', ground: { ramp: R.stone, style: 'rune', accent: R.ember }, path: { ramp: R.rust, style: 'carpet' }, water: { ramp: R.ember, style: 'ember', edge: R.stone }, cliff: { top: R.stone, face: R.stone, style: 'brick' } },
  { id: 'shrine_glass', ground: { ramp: R.teal, style: 'rune', accent: R.glass }, path: { ramp: R.glass, style: 'sand' }, water: { ramp: R.glass, style: 'glasspool', edge: R.teal }, cliff: { top: R.teal, face: R.night, style: 'crystal' } },
  { id: 'shrine_storm', ground: { ramp: R.night, style: 'rune', accent: R.storm }, path: { ramp: R.plum, style: 'carpet' }, water: { ramp: R.night, style: 'abyss', edge: R.stone }, cliff: { top: R.stone, face: R.night, style: 'brick' } },
];

/* ---------- 바닥 ---------- */

function paintGround(b: Biome, v: number, decor: boolean): PixelBuffer {
  const t = new PixelBuffer(TS, TS);
  const g = b.ground;
  const r = g.ramp;
  const seed = v * 31 + b.id.length * 7;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) t.set(x, y, r[2]);
  switch (g.style) {
    case 'grass':
    case 'moss': {
      // 풀잎 다발: 3px 'v'자 클러스터, 결정적 위치
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(hash2(i, v, seed) * 14) + 1, y = Math.floor(hash2(v, i, seed + 3) * 13) + 2;
        t.set(x, y, r[3]); t.set(x - 1, y - 1, r[3]); t.set(x + 1, y - 1, r[3]);
        t.set(x, y + 1, r[1]);
      }
      // 큰 명암 덩어리 (2~3px)
      for (let i = 0; i < 2; i++) {
        const x = Math.floor(hash2(i + 9, v, seed) * 12) + 2, y = Math.floor(hash2(v, i + 9, seed) * 12) + 2;
        t.set(x, y, r[1]); t.set(x + 1, y, r[1]); t.set(x + 1, y + 1, r[1]);
      }
      if (decor) {
        const x = 4 + (v % 3) * 3, y = 5 + (v % 2) * 5;
        if (g.flower) { t.set(x, y, g.flower[3]); t.set(x + 1, y, g.flower[2]); t.set(x, y + 1, g.flower[2]); t.set(x, y - 1, g.flower[3]); t.set(x - 1, y, g.flower[3]); t.set(x, y, R.gold[4]); }
        line(t, x + 5, y + 4, x + 6, y + 1, g.accent[3]); line(t, x + 7, y + 4, x + 7, y, g.accent[3]); line(t, x + 8, y + 4, x + 9, y + 2, g.accent[2]);
      }
      break;
    }
    case 'slab':
    case 'rune': {
      // 판석: 8×8 석판, 위/왼쪽 밝고 아래/오른쪽 어두운 베벨
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const ox = sx * 8 + (sy % 2 ? 0 : 0), oy = sy * 8;
        const shade = hash2(sx + v * 2, sy, seed) > 0.5 ? 0 : 1;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          let c = r[2 + (shade && r.length > 3 ? 0 : 0)];
          if (x === 0 || y === 0) c = r[3];
          if (x === 7 || y === 7) c = r[1];
          t.set(ox + x, oy + y, c);
        }
      }
      // 금 / 이끼
      const cx = Math.floor(hash2(v, 1, seed) * 10) + 3;
      line(t, cx, 2, cx + 2, 5, r[1]); line(t, cx + 2, 5, cx + 1, 7, r[1]);
      if (g.style === 'slab' && decor) { t.set(cx + 3, 8, g.accent[3]); t.set(cx + 4, 8, g.accent[2]); t.set(cx + 3, 9, g.accent[2]); t.set(2, 14, g.accent[3]); t.set(3, 14, g.accent[3]); }
      if (g.style === 'rune' && decor) {
        // 룬 문양
        const rx = 4, ry = 4;
        line(t, rx, ry, rx + 7, ry, g.accent[2]); line(t, rx + 3, ry, rx + 3, ry + 7, g.accent[2]); line(t, rx, ry + 7, rx + 7, ry + 4, g.accent[3]);
        t.set(rx + 3, ry + 3, g.accent[4]);
      }
      break;
    }
    case 'earth': {
      // 갈라진 땅: 다각형 균열선
      const pts: Pt[] = [[0, 5 + (v % 3)], [5, 7], [9, 4 + (v % 2)], [16, 6]];
      for (let i = 0; i < pts.length - 1; i++) line(t, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r[1]);
      line(t, 9, 5, 11, 12, r[1]); line(t, 11, 12, 15, 14, r[1]);
      for (let i = 0; i < 3; i++) { const x = Math.floor(hash2(i, v, seed) * 14) + 1, y = Math.floor(hash2(v, i, seed) * 14) + 1; t.set(x, y, r[3]); t.set(x + 1, y, r[3]); }
      if (decor) { t.set(3, 12, R.bone[3]); t.set(4, 12, R.bone[2]); t.set(4, 11, R.bone[3]); }
      break;
    }
    case 'glass': {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) t.set(x, y, r[1]);
      for (let i = 0; i < 4; i++) { const x = Math.floor(hash2(i, v, seed) * 13) + 1, y = Math.floor(hash2(v, i, seed) * 13) + 1; t.set(x, y, r[2]); t.set(x + 1, y, r[2]); t.set(x, y + 1, r[2]); }
      if (decor) { const x = 6 + (v % 4), y = 7; poly(t, [[x, y + 4], [x + 2, y - 2], [x + 4, y + 4]], (px) => (px < x + 2 ? g.accent[4] : g.accent[2])); t.set(x + 2, y - 2, R.white[0]); }
      else { t.set(3 + v, 11, g.accent[3]); }
      break;
    }
    case 'flesh': {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) t.set(x, y, r[1]);
      // 얽힌 뿌리 결
      const k = v % 4;
      for (let i = 0; i < 16; i++) { const y = Math.round(4 + Math.sin((i + k * 3) * 0.5) * 2); t.set(i, y, r[2]); t.set(i, y + 1, r[3]); }
      for (let i = 0; i < 16; i++) { const y = Math.round(11 + Math.sin((i + k * 5) * 0.4) * 2); t.set(i, y, r[2]); }
      if (decor) { t.set(5, 8, g.accent[3]); t.set(6, 7, g.accent[4]); t.set(12, 13, g.accent[2]); }
      break;
    }
  }
  return t;
}

/* ---------- 마스크 필드 ---------- */

function field(m: number, x: number, y: number, seed: number): number {
  const u = Math.max(0, Math.min(1, (x + 0.5) / TS)), v = Math.max(0, Math.min(1, (y + 0.5) / TS));
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const tl = m & 1 ? 1 : 0, tr = m & 2 ? 1 : 0, bl = m & 4 ? 1 : 0, br = m & 8 ? 1 : 0;
  const f = tl * (1 - su) * (1 - sv) + tr * su * (1 - sv) + bl * (1 - su) * sv + br * su * sv;
  const edgeFall = Math.min(1, Math.min(u, 1 - u, v, 1 - v) * 5);
  const n = (hash2(Math.floor(x / 2) + m * 17, Math.floor(y / 2), seed) - 0.5) * 0.22 * edgeFall;
  return f + n;
}

function inside(m: number, x: number, y: number, seed: number): boolean {
  if (m === 15) return true;
  if (m === 0) return false;
  return field(m, x, y, seed) > 0.5;
}

/** 내부 픽셀에서 가장 가까운 외부까지 거리 (최대 3) */
function edgeDist(m: number, x: number, y: number, seed: number): number {
  for (let d = 1; d <= 3; d++) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]] as Pt[]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= TS || ny >= TS) { if (!inside(m, Math.max(0, Math.min(15, nx)), Math.max(0, Math.min(15, ny)), seed)) return d; continue; }
      if (!inside(m, nx, ny, seed)) return d;
    }
  }
  return 9;
}

function paintPath(b: Biome, m: number): PixelBuffer {
  const t = new PixelBuffer(TS, TS);
  const r = b.path.ramp;
  const seed = 101;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (!inside(m, x, y, seed)) continue;
    const d = edgeDist(m, x, y, seed);
    let c = r[2];
    switch (b.path.style) {
      case 'flag': c = (x % 8 === 0 || y % 6 === 0) ? r[1] : (x % 8 === 1 || y % 6 === 1) ? r[3] : r[2]; break;
      case 'dirt': c = hash2(x >> 1, y >> 1, 5) > 0.82 ? r[3] : r[2]; break;
      case 'gravel': c = hash2(x >> 1, y >> 1, 9) > 0.75 ? r[1] : hash2(x >> 1, y >> 1, 11) > 0.8 ? r[3] : r[2]; break;
      case 'sand': c = hash2(x >> 2, y >> 1, 3) > 0.7 ? r[2] : r[1]; break;
      case 'root': c = ((x + Math.round(Math.sin(y * 0.6) * 2)) % 5 === 0) ? r[1] : r[2]; break;
      case 'carpet': c = (x % 16 === 3 || x % 16 === 12) ? R.gold[2] : r[2]; break;
    }
    if (d === 1) c = r[1];
    t.set(x, y, c);
  }
  return t;
}

function paintWater(b: Biome, m: number, frame: number): PixelBuffer {
  const t = new PixelBuffer(TS, TS);
  const r = b.water.ramp;
  const seed = 202;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (!inside(m, x, y, seed)) continue;
    const d = edgeDist(m, x, y, seed);
    let c: number;
    const deep = d >= 3;
    switch (b.water.style) {
      case 'abyss': c = deep ? r[0] : d === 2 ? r[1] : b.water.edge[1]; break;
      case 'ember': c = deep ? r[2] : d === 2 ? r[1] : b.water.edge[1]; break;
      default: c = deep ? r[1] : d === 2 ? r[2] : b.water.edge[2];
    }
    // 반짝임: 두 프레임에서 위치가 바뀌는 짧은 가로선
    const wave = ((y + frame * 3) % 7 === 0) && ((x + y * 2 + frame * 5) % 9 < 3) && deep;
    if (wave) c = b.water.style === 'abyss' ? R.echo[1] : b.water.style === 'ember' ? R.ember[4] : r[3];
    if (b.water.style === 'bog' && deep && hash2(x >> 1, y >> 1, frame + 40) > 0.93) c = R.moss[2];
    if (d === 1 && (b.water.style === 'water' || b.water.style === 'glasspool') && (x + frame) % 4 === 0) c = r[4];
    t.set(x, y, c);
  }
  return t;
}

function paintCliff(b: Biome, m: number): PixelBuffer {
  const t = new PixelBuffer(TS, TS);
  const top = b.cliff.top, face = b.cliff.face;
  const seed = 303;
  const FACE = 7;
  // 윗면
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (!inside(m, x, y, seed)) continue;
    const below = inside(m, x, Math.min(15, y + 1), seed) || (y === 15 && (m & 12) !== 0);
    const d = edgeDist(m, x, y, seed);
    let c = top[2];
    if (d === 1) c = below ? top[3] : top[4 < top.length ? 3 : 2];
    if (b.cliff.style === 'brick') c = ((y % 4 === 0) || ((x + (Math.floor(y / 4) % 2) * 4) % 8 === 0)) ? top[1] : d === 1 ? top[3] : top[2];
    if (b.cliff.style === 'crystal' && hash2(x >> 1, y >> 1, 1) > 0.88) c = R.glass[3];
    t.set(x, y, c);
  }
  // 남쪽으로 드러난 절벽면 (윗면 경계 바로 아래 FACE px)
  for (let x = 0; x < TS; x++) {
    for (let y = 0; y < TS; y++) {
      if (!inside(m, x, y, seed)) continue;
      if (y < 15 && !inside(m, x, y + 1, seed)) {
        for (let k = 1; k <= FACE && y + k < TS; k++) {
          if (inside(m, x, y + k, seed)) break;
          let c = face[2];
          if (k === 1) c = face[3];
          else if (k === FACE || y + k === TS - 1) c = face[0];
          else if (b.cliff.style === 'brick') c = (k % 3 === 0 || (x + (k > 3 ? 3 : 0)) % 6 === 0) ? face[1] : face[2];
          else if (b.cliff.style === 'root') c = (x + k) % 4 === 0 ? face[1] : face[2];
          else if (b.cliff.style === 'crystal') c = x % 5 === 0 ? R.glass[2] : face[2];
          else c = (x % 5 === 0 || (x + k) % 7 === 0) ? face[1] : face[2];
          t.set(x, y + k, c);
        }
      }
    }
  }
  return t;
}

/* ---------- 장식 오버레이 (필드 위 스탬프) ---------- */
function paintDecor(b: Biome, i: number): PixelBuffer {
  const t = new PixelBuffer(TS, TS);
  const a = b.ground.accent, r = b.ground.ramp;
  switch (i) {
    case 0: // 풀덤불
      for (let k = 0; k < 5; k++) line(t, 5 + k * 1.5, 13, 4 + k * 2, 7 + (k % 2) * 2, k % 2 ? r[3] : r[4 < r.length ? 4 : 3]);
      break;
    case 1: // 작은 돌
      ellipse(t, 8, 11, 3, 2, rampShader(R.stone, 0));
      break;
    case 2: // 꽃무리
      for (const [x, y] of [[5, 9], [9, 7], [11, 11]] as Pt[]) { const f = b.ground.flower ?? a; t.set(x, y, f[3]); t.set(x + 1, y, f[2]); t.set(x, y + 1, f[2]); t.set(x, y + 2, R.green[2]); }
      break;
    case 3: // 가시 덩굴 (오염 흔적)
      line(t, 2, 12, 7, 9, R.thorn[2]); line(t, 7, 9, 13, 11, R.thorn[2]); t.set(5, 9, R.thorn[4]); t.set(10, 9, R.thorn[3]);
      break;
    case 4: // 뼈 조각
      line(t, 5, 10, 10, 12, R.bone[3]); t.set(4, 10, R.bone[4]); t.set(11, 12, R.bone[4]);
      break;
    case 5: // 반짝이는 잔향
      t.set(8, 6, R.echo[4]); t.set(7, 7, R.echo[2]); t.set(9, 7, R.echo[2]); t.set(8, 8, R.echo[3]);
      break;
  }
  return t;
}

/** 타일셋 한 장: 행0 바닥(8), 행1 길(16), 행2~3 물(16×2프레임), 행4 절벽(16), 행5 장식(6) */
export function tilesetImage(b: Biome): ImageSpec {
  const img = new PixelBuffer(TS * 16, TS * 6);
  for (let v = 0; v < 8; v++) img.blit(paintGround(b, v % 4, v >= 4), v * TS, 0);
  for (let m = 0; m < 16; m++) {
    img.blit(paintPath(b, m), m * TS, TS);
    img.blit(paintWater(b, m, 0), m * TS, TS * 2);
    img.blit(paintWater(b, m, 1), m * TS, TS * 3);
    img.blit(paintCliff(b, m), m * TS, TS * 4);
  }
  for (let i = 0; i < 6; i++) img.blit(paintDecor(b, i), i * TS, TS * 5);
  return { id: `tiles_${b.id}`, kind: 'tileset', image: img, meta: { tile: TS, rows: { ground: 0, path: 1, water0: 2, water1: 3, cliff: 4, decor: 5 } } };
}

export function tilesetImages(): ImageSpec[] {
  return BIOMES.map(tilesetImage);
}

export { tone, lit };
