import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { ellipse, poly, line, Pt, rect, tone, lit, rampShader, polyline, quadPoints } from '../core/draw';
import { selectiveOutline } from '../core/post';
import { AnimBuilder, ImageSpec, SheetSpec } from '../core/sheet';

/* UI 프레임(9-슬라이스), 커서, 조준선, 상태·원소·자세·아이템 아이콘. 색만이 아니라 모양으로도 구분한다. */

function frame(hi: boolean): PixelBuffer {
  const S = 24;
  const b = new PixelBuffer(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = R.ui[1];
    if (((x >> 2) + (y >> 2)) % 2 === 0 && x > 3 && y > 3 && x < S - 4 && y < S - 4) c = R.ui[1];
    if (x === 0 || y === 0 || x === S - 1 || y === S - 1) c = R.ink[0];
    else if (x === 1 || y === 1) c = hi ? R.gold[3] : R.brass[2];
    else if (x === S - 2 || y === S - 2) c = hi ? R.gold[2] : R.brass[1];
    else if (x === 2 || y === 2) c = R.ui[3];
    b.set(x, y, c);
  }
  // 모서리 장식 (마름모 리벳)
  for (const [cx, cy] of [[3, 3], [S - 4, 3], [3, S - 4], [S - 4, S - 4]] as Pt[]) {
    b.set(cx, cy, hi ? R.gold[4] : R.brass[4]);
    b.set(cx - 1, cy, R.brass[2]); b.set(cx + 1, cy, R.brass[2]); b.set(cx, cy - 1, R.brass[3]); b.set(cx, cy + 1, R.brass[1]);
  }
  return b;
}

function icon(draw: (b: PixelBuffer) => void, outline = true): PixelBuffer {
  const b = new PixelBuffer(16, 16);
  draw(b);
  if (outline) selectiveOutline(b, { soften: false });
  return b;
}

const ICONS: Record<string, (b: PixelBuffer) => void> = {
  // 상태
  burn: (b) => poly(b, [[4, 13], [12, 13], [11, 7], [9, 9], [8, 3], [6, 8], [5, 6]], (x, y) => (y > 10 ? R.ember[2] : y > 7 ? R.ember[3] : R.ember[4])),
  mark_crack: (b) => { poly(b, [[8, 2], [13, 8], [8, 14], [3, 8]], () => R.ember[2]); line(b, 8, 4, 6, 8, R.ink[0]); line(b, 6, 8, 9, 12, R.ink[0]); },
  mark_track: (b) => { for (let a = 0; a < 32; a++) { const t = (a / 32) * Math.PI * 2; b.set(Math.round(8 + Math.cos(t) * 5), Math.round(8 + Math.sin(t) * 5), R.gold[3]); } line(b, 8, 1, 8, 15, R.gold[4]); line(b, 1, 8, 15, 8, R.gold[4]); },
  mark_echo: (b) => { for (const r of [2, 5]) for (let a = 0; a < 30; a++) { const t = (a / 30) * Math.PI * 2; b.set(Math.round(8 + Math.cos(t) * r), Math.round(8 + Math.sin(t) * r), R.echo[r > 3 ? 3 : 4]); } },
  exposed: (b) => { ellipse(b, 8, 8, 6, 3.5, () => R.bone[4]); ellipse(b, 8, 8, 2.5, 2.5, () => R.blood[2]); b.set(8, 8, R.ink[0]); },
  guard: (b) => poly(b, [[3, 3], [13, 3], [13, 8], [8, 14], [3, 8]], (x, y) => (x < 8 ? R.steel[4] : R.steel[2])),
  shield: (b) => { for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; b.set(Math.round(8 + Math.cos(t) * 6), Math.round(8 + Math.sin(t) * 6), R.echo[a % 2 ? 3 : 4]); } poly(b, [[8, 4], [11, 8], [8, 12], [5, 8]], () => R.echo[2]); },
  slow: (b) => { ellipse(b, 8, 8, 6, 6, () => R.tide[2]); line(b, 8, 8, 8, 4, R.white[0]); line(b, 8, 8, 11, 9, R.white[0]); },
  haste: (b) => { poly(b, [[2, 4], [8, 8], [2, 12]], () => R.storm[4]); poly(b, [[8, 4], [14, 8], [8, 12]], () => R.storm[3]); },
  vulnerable: (b) => { poly(b, [[3, 3], [13, 3], [13, 8], [8, 14], [3, 8]], () => R.rust[2]); line(b, 6, 4, 9, 9, R.ink[0]); line(b, 9, 9, 7, 13, R.ink[0]); },
  daze: (b) => { for (let i = 0; i < 3; i++) { const x = 3 + i * 4, y = 5 + (i % 2) * 3; poly(b, [[x, y - 2], [x + 1, y], [x + 3, y], [x + 1, y + 1], [x + 2, y + 3], [x, y + 2], [x - 2, y + 3], [x - 1, y + 1], [x - 3, y], [x - 1, y]], () => R.gold[4]); } },
  broken: (b) => { poly(b, [[2, 12], [6, 3], [9, 8], [14, 4], [11, 13]], () => R.echo[3]); line(b, 6, 3, 9, 8, R.white[0]); },
  // 원소
  el_fire: (b) => poly(b, [[4, 13], [12, 13], [12, 8], [9, 9], [8, 2], [5, 7], [4, 6]], (x, y) => (y > 10 ? R.ember[2] : R.ember[3 + (y < 6 ? 1 : 0)])),
  el_tide: (b) => { poly(b, [[8, 2], [12, 9], [11, 12], [8, 14], [5, 12], [4, 9]], (x) => (x < 8 ? R.tide[4] : R.tide[2])); b.set(6, 9, R.white[0]); },
  el_storm: (b) => poly(b, [[9, 1], [4, 9], [8, 9], [6, 15], [12, 6], [8, 6], [10, 1]], () => R.storm[4]),
  // 자세
  st_guard: (b) => { poly(b, [[3, 2], [13, 2], [13, 8], [8, 14], [3, 8]], (x) => (x < 8 ? R.blue[4] : R.blue[2])); line(b, 8, 4, 8, 11, R.gold[3]); },
  st_assault: (b) => { line(b, 3, 13, 12, 4, R.steel[4]); line(b, 4, 13, 13, 4, R.steel[2]); line(b, 3, 10, 6, 13, R.brass[3]); poly(b, [[11, 2], [14, 2], [14, 5]], () => R.ember[4]); },
  st_flow: (b) => { polyline(b, quadPoints([2, 12], [8, 0], [14, 10], 10), R.teal[4]); polyline(b, quadPoints([2, 14], [8, 4], [14, 13], 10), R.teal[3]); },
  // 자원·메뉴
  charge: (b) => { rect(b, 5, 3, 6, 11, R.brass[2]); rect(b, 6, 4, 4, 9, R.ember[1]); rect(b, 6, 8, 4, 5, R.ember[4]); rect(b, 7, 1, 2, 2, R.brass[3]); },
  resonance: (b) => { for (const r of [3, 6]) for (let a = 0; a < 36; a++) { const t = (a / 36) * Math.PI * 2; if (a % 3) b.set(Math.round(8 + Math.cos(t) * r), Math.round(8 + Math.sin(t) * r), r > 4 ? R.echo[3] : R.gold[4]); } b.set(8, 8, R.white[0]); },
  weapon: (b) => { line(b, 3, 13, 12, 3, R.steel[4]); line(b, 4, 13, 13, 3, R.steel[2]); line(b, 2, 10, 6, 14, R.brass[3]); },
  relic: (b) => { ellipse(b, 8, 9, 5, 5, rampShader(R.gold, 0, true)); ellipse(b, 8, 9, 2, 2, () => R.echo[3]); line(b, 8, 1, 8, 4, R.brass[2]); },
  echo: (b) => { poly(b, [[8, 1], [13, 8], [8, 15], [3, 8]], (x) => (x < 8 ? R.echo[4] : R.echo[2])); poly(b, [[8, 4], [10, 8], [8, 12], [6, 8]], () => R.white[0]); },
  insight: (b) => { ellipse(b, 8, 8, 6, 4, () => R.plum[3]); ellipse(b, 8, 8, 2.5, 2.5, () => R.gold[4]); b.set(8, 8, R.ink[0]); },
  potion: (b) => { rect(b, 6, 2, 4, 3, R.wood[3]); ellipse(b, 8, 10, 5, 5, (x, y) => (y > 8 ? R.green[3] : R.glass[4])); b.set(6, 8, R.white[0]); },
  dew: (b) => { poly(b, [[8, 2], [12, 10], [8, 14], [4, 10]], (x) => (x < 8 ? R.echo[4] : R.echo[2])); b.set(7, 8, R.white[0]); },
  seed: (b) => { ellipse(b, 8, 9, 4, 5, rampShader(R.gold, 0, true)); line(b, 8, 4, 10, 1, R.green[3]); b.set(11, 1, R.green[4]); },
  leaf: (b) => { poly(b, [[3, 13], [5, 5], [12, 2], [11, 9]], (x, y) => (x + y < 14 ? R.green[4] : R.green[2])); line(b, 3, 13, 10, 4, R.green[1]); },
  coin: (b) => { poly(b, [[8, 2], [13, 8], [8, 14], [3, 8]], (x, y) => (x < 8 ? R.hairSera[3] : R.hairSera[1])); line(b, 8, 4, 8, 12, R.green[3]); },
  fragment: (b) => { poly(b, [[5, 3], [12, 5], [11, 13], [4, 11]], (x) => (x < 8 ? R.storm[4] : R.storm[2])); line(b, 6, 6, 10, 10, R.white[0]); },
  crystal: (b) => { poly(b, [[8, 1], [12, 6], [10, 15], [6, 15], [4, 6]], (x) => (x < 8 ? R.plum[4] : R.plum[2])); b.set(7, 4, R.white[0]); },
  sap: (b) => { poly(b, [[8, 2], [12, 10], [8, 14], [4, 10]], (x) => (x < 8 ? R.gold[4] : R.gold[2])); },
  seal_ember: (b) => { ellipse(b, 8, 8, 6, 6, rampShader(R.ember, 0, true, 0.2)); poly(b, [[8, 4], [10, 8], [8, 12], [6, 8]], () => R.gold[4]); },
  seal_glass: (b) => { ellipse(b, 8, 8, 6, 6, rampShader(R.glass, 0, true, 0.2)); poly(b, [[8, 4], [10, 8], [8, 12], [6, 8]], () => R.white[0]); },
  seal_storm: (b) => { ellipse(b, 8, 8, 6, 6, rampShader(R.storm, 0, true, 0.2)); poly(b, [[9, 3], [6, 9], [9, 9], [7, 13], [11, 7], [8, 7]], () => R.gold[4]); },
  // 공격 예고 (모양으로 구분: 일반=검, 지면=물결, 회피 전용=가시 달린 원)
  tell_normal: (b) => { line(b, 3, 13, 13, 3, R.white[0]); line(b, 4, 13, 14, 3, R.steel[3]); },
  tell_ground: (b) => { polyline(b, [[1, 11], [4, 8], [7, 11], [10, 8], [13, 11], [15, 9]], R.gold[4]); line(b, 1, 14, 15, 14, R.earth[4]); },
  tell_unblock: (b) => { ellipse(b, 8, 8, 5, 5, () => R.blood[2]); for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; line(b, 8 + Math.cos(t) * 5, 8 + Math.sin(t) * 5, 8 + Math.cos(t) * 7.5, 8 + Math.sin(t) * 7.5, R.blood[3]); } line(b, 8, 5, 8, 9, R.white[0]); b.set(8, 11, R.white[0]); },
  // 타이밍 유형
  tm_tap: (b) => { ellipse(b, 8, 8, 5, 5, () => R.gold[2]); ellipse(b, 8, 8, 2, 2, () => R.gold[4]); },
  tm_multi: (b) => { for (const x of [3, 8, 13]) ellipse(b, x, 8, 2, 2, () => R.gold[4]); },
  tm_hold: (b) => { rect(b, 2, 6, 12, 4, R.ui[3]); rect(b, 2, 6, 9, 4, R.gold[3]); line(b, 11, 4, 11, 11, R.white[0]); },
  tm_rhythm: (b) => { for (let i = 0; i < 4; i++) rect(b, 2 + i * 3, 12 - i * 2, 2, 2 + i * 2, R.gold[3 + (i % 2)]); },
  star: (b) => poly(b, [[8, 1], [10, 6], [15, 6], [11, 9], [13, 15], [8, 11], [3, 15], [5, 9], [1, 6], [6, 6]], (x) => (x < 8 ? R.gold[4] : R.gold[3])),
  heart: (b) => { ellipse(b, 5, 6, 3, 3, () => R.blood[2]); ellipse(b, 11, 6, 3, 3, () => R.blood[2]); poly(b, [[2, 7], [14, 7], [8, 14]], () => R.blood[2]); b.set(5, 5, R.blood[3]); },
  key: (b) => { ellipse(b, 5, 6, 3, 3, () => R.gold[3]); line(b, 7, 8, 13, 14, R.gold[3]); line(b, 11, 12, 13, 10, R.gold[3]); b.set(5, 6, R.ink[0]); },
  book: (b) => { rect(b, 3, 3, 10, 11, R.rust[2]); line(b, 5, 3, 5, 13, R.rust[1]); rect(b, 7, 6, 4, 1, R.gold[3]); },
};

export function uiImages(): ImageSpec[] {
  const cursor = new PixelBuffer(8, 8);
  poly(cursor, [[0, 0], [7, 4], [0, 8]], (x) => (x < 3 ? R.gold[4] : R.gold[3]));
  selectiveOutline(cursor, { soften: false });
  const ret = new PixelBuffer(32, 32);
  for (let a = 0; a < 80; a++) { const t = (a / 80) * Math.PI * 2; if (a % 10 < 7) ret.set(Math.round(16 + Math.cos(t) * 11), Math.round(16 + Math.sin(t) * 11), R.gold[4]); }
  for (const [x0, y0, x1, y1] of [[16, 1, 16, 8], [16, 24, 16, 31], [1, 16, 8, 16], [24, 16, 31, 16]]) line(ret, x0, y0, x1, y1, R.white[0]);
  ret.set(16, 16, R.blood[3]);
  selectiveOutline(ret, { soften: false });
  // 로고 문양 (세계뿌리 + 가시 고리)
  const logo = new PixelBuffer(64, 64);
  for (const [a, c, bb, r] of [[[32, 62], [30, 36], [32, 8], 4], [[32, 24], [18, 14], [8, 6], 2], [[32, 24], [46, 14], [56, 6], 2], [[32, 50], [16, 56], [4, 62], 2], [[32, 50], [48, 56], [60, 62], 2]] as [Pt, Pt, Pt, number][]) {
    quadPoints(a, c, bb, 20).forEach(([x, y], i) => ellipse(logo, x, y, r * (1 - i / 30), r * (1 - i / 30), (px, py, nx, ny, nz) => tone(R.brass, lit(nx, ny, nz) + 0.2, 0, true)));
  }
  for (let k = 0; k < 90; k++) { const t = (k / 90) * Math.PI * 2; logo.set(Math.round(32 + Math.cos(t) * 22), Math.round(32 + Math.sin(t) * 22), k % 6 === 0 ? R.thorn[4] : R.thorn[2]); }
  ellipse(logo, 32, 32, 3, 3, () => R.echo[4]);
  selectiveOutline(logo, { soften: false });
  return [
    { id: 'ui_frame', kind: 'ui', image: frame(false), meta: { slice: 6 } },
    { id: 'ui_frame_hi', kind: 'ui', image: frame(true), meta: { slice: 6 } },
    { id: 'ui_cursor', kind: 'ui', image: cursor },
    { id: 'ui_reticle', kind: 'ui', image: ret },
    { id: 'ui_logo', kind: 'ui', image: logo },
  ];
}

export function iconSheet(): SheetSpec {
  const anims = Object.entries(ICONS).map(([name, draw]) => {
    const ab = new AnimBuilder(name, false);
    ab.add(icon(draw), 1000);
    return ab.build();
  });
  return { id: 'icons', kind: 'icon', frameW: 16, frameH: 16, anchor: [8, 8], anims, required: Object.keys(ICONS) };
}

/** 타임라인 초상: 전투 시트의 대기 프레임에서 머리 부분을 잘라 만든다 */
export function portraitSheet(sources: { id: string; sheet: SheetSpec; at: [number, number] }[]): SheetSpec {
  const anims = sources.map(({ id, sheet, at }) => {
    const src = sheet.anims.find((a) => a.name === 'idle')!.frames[0];
    const out = new PixelBuffer(16, 16);
    const x0 = Math.round(at[0] - 8), y0 = Math.round(at[1] - 8);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) out.set(x, y, src.get(x0 + x, y0 + y));
    const ab = new AnimBuilder(id, false);
    ab.add(out, 1000);
    return ab.build();
  });
  return { id: 'portraits', kind: 'portrait', frameW: 16, frameH: 16, anchor: [8, 8], anims };
}
