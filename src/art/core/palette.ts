/**
 * 전역 팔레트 (source of truth).
 * 모든 스프라이트는 이 팔레트의 인덱스로만 그려진다. 0은 투명.
 * 램프는 어두운 색 → 밝은 색 순서이며, 그림자는 차갑게, 하이라이트는 따뜻하게 색상 이동을 준다.
 */

export const RAMP_DEFS = {
  ink: ['#0d0a12', '#1a1522', '#2a2334'],
  skin: ['#4f2626', '#8a4a3a', '#c07a58', '#e6b089', '#f6d6b2'],
  skinDeep: ['#3a1c1c', '#643626', '#94573a', '#bf8458', '#dcad80'],
  hairKael: ['#0f0d1c', '#1f2440', '#303d68', '#4a5f96', '#7088c0'],
  hairMira: ['#33101a', '#66201f', '#9c3829', '#c9643a', '#e89a55'],
  hairSera: ['#343a55', '#626c8c', '#9aa5bf', '#cdd6e6', '#f2f5fb'],
  hairOrin: ['#2a0f08', '#551f0f', '#843816', '#b25c26', '#d98a42'],
  steel: ['#1c1f30', '#373e5c', '#626e8f', '#9ca7c0', '#dfe6f0'],
  brass: ['#36200e', '#6a4217', '#a47028', '#d6a748', '#f4dc8a'],
  leather: ['#26140e', '#472719', '#6d3f28', '#96603d', '#bb8458'],
  blue: ['#10173a', '#1d2c60', '#2c4890', '#4870bd', '#76a0e0'],
  teal: ['#0b2428', '#144045', '#1f6468', '#348f8b', '#5fbead'],
  plum: ['#210f2b', '#3b1c49', '#5d3170', '#88509a', '#b67ec4'],
  green: ['#122210', '#203d19', '#345d28', '#52863a', '#82b458'],
  rust: ['#2b110d', '#511f18', '#7d2e21', '#ad482c', '#d8703e'],
  bone: ['#463a33', '#786757', '#ad9a84', '#d9cbb2', '#f3ead9'],
  wood: ['#281810', '#492d1b', '#6e472a', '#96683c', '#bd9058'],
  ember: ['#470e0e', '#971f17', '#dc501d', '#ff9838', '#ffd968'],
  tide: ['#0a1d38', '#113864', '#1c609e', '#3897ce', '#84d4ef'],
  storm: ['#23123e', '#482887', '#764fcd', '#b592ef', '#e8dbff'],
  glass: ['#0f2830', '#1c4c58', '#378790', '#76cdc5', '#d2fff2'],
  thorn: ['#1a0915', '#3a112d', '#681c47', '#a03867', '#dc7096'],
  echo: ['#172a46', '#2b5686', '#579dce', '#a5def3', '#effbff'],
  grass: ['#182216', '#2b3a22', '#465730', '#6a7a44', '#96a268'],
  ash: ['#202024', '#39383e', '#5b5960', '#88858a', '#bbb7b1'],
  stone: ['#1b1a24', '#32303d', '#4e4b5a', '#716e80', '#9b98a6'],
  moss: ['#122016', '#1f3822', '#32582e', '#4d7e3e', '#79a956'],
  earth: ['#2c1d15', '#4d3321', '#745134', '#9e7850', '#c7a676'],
  rock: ['#281513', '#48251f', '#6c3c2d', '#93593f', '#bb8257'],
  root: ['#1c0e18', '#38192a', '#5a2b3e', '#854658', '#b67280'],
  night: ['#0a0c1a', '#131931', '#1e294b', '#2c3e69', '#445e8d'],
  dusk: ['#2a1a2e', '#4b2a3e', '#7a3f48', '#b0604e', '#e09a66'],
  ui: ['#0e0c11', '#18151e', '#26212d', '#383140', '#51485a'],
  flower: ['#1a285c', '#2d4dae', '#5888e6', '#a6c6ff'],
  blood: ['#56091a', '#9c1428', '#dc2f48', '#ff7888'],
  gold: ['#5a3a08', '#a8740e', '#e8b62a', '#ffe680', '#fffbe0'],
  white: ['#ffffff'],
} as const;

export type RampName = keyof typeof RAMP_DEFS;

/** 팔레트 RGBA 테이블. index 0 = 투명 */
export const PALETTE: [number, number, number, number][] = [[0, 0, 0, 0]];
/** 인덱스 → 램프 이름/단계 */
export const INDEX_RAMP: { ramp: RampName; step: number }[] = [{ ramp: 'ink', step: -1 }];

type RampTable = { [K in RampName]: number[] };
export const R = {} as RampTable;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

for (const name of Object.keys(RAMP_DEFS) as RampName[]) {
  const arr: number[] = [];
  RAMP_DEFS[name].forEach((hex, step) => {
    const idx = PALETTE.length;
    const [r, g, b] = hexToRgb(hex);
    PALETTE.push([r, g, b, 255]);
    INDEX_RAMP.push({ ramp: name, step });
    arr.push(idx);
  });
  R[name] = arr;
}

if (PALETTE.length > 256) throw new Error('팔레트가 256색을 초과합니다');

export const TRANSPARENT = 0;

/** 같은 램프 안에서 n단계 어둡게(음수면 밝게) */
export function darker(idx: number, n = 1): number {
  if (idx === 0) return 0;
  const info = INDEX_RAMP[idx];
  const ramp = R[info.ramp];
  const s = Math.max(0, Math.min(ramp.length - 1, info.step - n));
  return ramp[s];
}
export function lighter(idx: number, n = 1): number {
  return darker(idx, -n);
}
/** 해당 색이 속한 램프의 가장 어두운 색 (선택적 외곽선용) */
export function rampDarkest(idx: number): number {
  if (idx === 0) return 0;
  return R[INDEX_RAMP[idx].ramp][0];
}
export function rampOf(idx: number): RampName {
  return INDEX_RAMP[idx].ramp;
}
export function stepOf(idx: number): number {
  return INDEX_RAMP[idx].step;
}

export function paletteHex(idx: number): string {
  const [r, g, b] = PALETTE[idx];
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** 팔레트 RGB → 인덱스 역참조 (검증용) */
export function buildColorLookup(): Map<number, number> {
  const m = new Map<number, number>();
  PALETTE.forEach(([r, g, b], i) => {
    if (i === 0) return;
    m.set((r << 16) | (g << 8) | b, i);
  });
  return m;
}
