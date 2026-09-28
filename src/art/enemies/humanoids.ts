import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { poly, ellipse, rampShader, line, tone, lit, Pt, capsule } from '../core/draw';
import { Design, Pose, RigCtx, renderPose, torsoShader, rod, blade, shiftPose } from '../characters/rig';
import { KAEL_POSES, K_BASE, P } from '../characters/kael';
import { buildEnemySheet, Drawn, EFrame, flipDrawn, scalePose, wp } from './common';
import type { SheetSpec, FrameTag } from '../core/sheet';

/* 인간형 적은 플레이어와 같은 포즈 블루프린트 시스템을 사용하되, 체형·재질·실루엣을 완전히 다르게 설계한다. */

/* ============================================================
 * 빈 갑주 — 속이 빈 갑옷. 느리고 지연된 대검 공격, 높은 방어. 약점: 허리 이음새.
 * ============================================================ */
const HELM = {
  rows: [
    '....abba....',
    '..abccccb...',
    '.abcdddccb..',
    '.bcdeeddccb.',
    'abcddddcccb.',
    'abccccccccba',
    'abcccgGGGGba',
    'abcccbbbbbba',
    'abcccccdccb.',
    'abccbcdccb..',
    '.abbbccccb..',
    '..abbbbbba..',
    '...abbbb....',
  ],
  legend: { a: R.steel[0], b: R.steel[1], c: R.steel[2], d: R.steel[3], e: R.steel[4], g: R.echo[2], G: R.echo[4] },
  anchor: [5, 12] as Pt,
};

function armorTorso(buf: PixelBuffer, c: RigCtx): void {
  const { sF, sB, hipF, hipB, pose } = c;
  const ch = pose.chest;
  const waistF: Pt = [hipF[0] + 1.5, hipF[1] - 5];
  const waistB: Pt = [hipB[0] - 1, hipB[1] - 5];
  poly(buf, [[sB[0] - 3, sB[1] - 1], [ch[0] - 1, ch[1] - 2], [sF[0] + 3, sF[1] - 1], [waistF[0] + 1, waistF[1]], [waistB[0] - 1, waistB[1]]], torsoShader(c, R.steel, 8, 0, true, -0.15));
  // 녹 얼룩 (결정적 클러스터)
  buf.set(Math.round(ch[0] - 3), Math.round(ch[1] + 5), R.rust[2]);
  buf.set(Math.round(ch[0] - 2), Math.round(ch[1] + 5), R.rust[3]);
  buf.set(Math.round(ch[0] - 3), Math.round(ch[1] + 6), R.rust[2]);
  line(buf, ch[0] + 1, ch[1] + 1, ch[0] + 1, waistF[1] - 2, R.steel[4]);
  // 허리 이음새 (빈 속에서 잔향빛)
  const gy = Math.round(waistB[1] + 1);
  line(buf, waistB[0], gy, waistF[0], gy, R.ink[0]);
  line(buf, waistB[0] + 2, gy + 1, waistF[0] - 1, gy + 1, R.ink[0]);
  buf.set(Math.round((waistB[0] + waistF[0]) / 2), gy, R.echo[3]);
  buf.set(Math.round((waistB[0] + waistF[0]) / 2) + 1, gy, R.echo[4]);
  // 허리 아래 판갑 치마
  poly(buf, [[hipB[0] - 3, gy + 2], [hipF[0] + 3, gy + 2], [hipF[0] + 4, hipF[1] + 5], [hipB[0] - 4, hipB[1] + 5]], (x, y) => ((y - gy) % 3 === 0 ? R.steel[1] : tone(R.steel, lit((x - pose.hip[0]) / 7, 0, 0.8), 0)));
}

function greatsword(buf: PixelBuffer, c: RigCtx): void {
  const p = c.pose;
  const a = ((p.wa ?? 30) * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const [hx, hy] = p.hF;
  line(buf, hx - dx * 4, hy - dy * 4, hx + dx * 1, hy + dy * 1, R.leather[1]);
  const gx = hx + dx * 2.5, gy = hy + dy * 2.5;
  line(buf, gx + dy * 4, gy - dx * 4, gx - dy * 4, gy + dx * 4, R.steel[2]);
  blade(buf, gx + dx, gy + dy, a, 30, R.steel, 4);
  const b2x = gx + dx - dy * 1.2, b2y = gy + dy + dx * 1.2;
  line(buf, b2x, b2y, b2x + dx * 26, b2y + dy * 26, R.steel[1]);
}

function pauldronBig(buf: PixelBuffer, c: RigCtx): void {
  const { sF } = c;
  ellipse(buf, sF[0] + 0.5, sF[1] - 0.5, 4.2, 3.4, rampShader(R.steel, 0, true, -0.1));
  line(buf, sF[0] - 3, sF[1] + 2, sF[0] + 3, sF[1] + 2, R.rust[2]);
}

const HOLLOW: Design = {
  id: 'hollow', shF: 6, shB: 7, hipHalf: 3.6,
  rUpper: 2.6, rFore: 2.3, rThigh: 3.0, rShin: 2.4,
  skin: R.ink, sleeve: R.stone, glove: R.steel, pants: R.stone, boots: R.steel, bootH: 0.6, sleeveLen: 0.5,
  head: HELM, torso: armorTorso, weapon: greatsword, frontExtra: pauldronBig,
};

type HP = { pose: Pose; tag?: FrameTag };
function humanoidSheet(id: string, d: Design, poses: Record<string, [Pose, number, FrameTag?][]>, weakFn: (p: Pose) => ReturnType<typeof wp>[], s = 1.12, attachFn?: (p: Pose) => Record<string, [number, number]>): SheetSpec {
  const draw = (pose: Pose): Drawn => {
    const sp = scalePose(shiftPose(pose, 0, 8), s, [40, 76], [42, 76]);
    const buf = renderPose(d, sp, { noOutline: true });
    return flipDrawn({ buf, weak: weakFn(sp), attach: { ...(attachFn ? attachFn(sp) : {}), hand: [sp.hF[0], sp.hF[1]], chest: [sp.chest[0], sp.chest[1] + 5] } });
  };
  const anims: Record<string, EFrame<Pose>[]> = {};
  for (const [k, list] of Object.entries(poses)) anims[k] = list.map(([p, ms, tag]) => ({ p, ms, tag }));
  const breakPose = poses.break[0][0];
  return buildEnemySheet<Pose>({ id, kind: 'enemy', w: 96, h: 80, anchor: [54, 79], draw, anims, death: { from: breakPose }, required: ['idle', 'hurt', 'break', 'death', ...Object.keys(poses)] });
}

const H_BASE = P(K_BASE, { kF: [45, 59], fF: [48, 68], kB: [34, 59], fB: [30, 68], eF: [46, 42], hF: [48, 47], wa: 34, eB: [40, 43], hB: [45, 47], bOver: true });
const H_LUNGE: Partial<Pose> = { kF: [50, 60], fF: [53, 68], kB: [36, 60], fB: [28, 68] };

export function hollowSheet(): SheetSpec {
  const HB = (o: Partial<Pose>) => P(H_BASE, o);
  return humanoidSheet('hollow', HOLLOW, {
    idle: [[H_BASE, 220, 'idle'], [HB({ chest: [40, 34], eF: [46, 43], hF: [48, 48], eB: [40, 44], hB: [45, 48] }), 220, 'idle'], [HB({ chest: [40, 34], eF: [46, 43], hF: [48, 48], eB: [40, 44], hB: [45, 48] }), 220, 'idle'], [H_BASE, 220, 'idle']],
    cleave: [
      [HB({ chest: [39, 33], eF: [43, 30], hF: [43, 24], wa: -100, eB: [37, 31], hB: [42, 26] }), 160, 'anticipation'],
      [HB({ chest: [38, 33], head: [0, -1], eF: [42, 28], hF: [41, 21], wa: -112, eB: [36, 29], hB: [40, 23] }), 200, 'hold'],
      [HB({ ...H_LUNGE, hip: [41, 50], chest: [45, 35], eF: [49, 30], hF: [53, 28], wa: -40, eB: [44, 31], hB: [50, 29] }), 60, 'attack'],
      [HB({ ...H_LUNGE, hip: [42, 51], chest: [46, 37], head: [2, -1], eF: [51, 41], hF: [56, 45], wa: 40, eB: [47, 42], hB: [53, 45] }), 90, 'contact'],
      [HB({ ...H_LUNGE, hip: [42, 51], chest: [46, 38], eF: [51, 44], hF: [55, 49], wa: 55, eB: [47, 45], hB: [52, 49] }), 140, 'recovery'],
      [H_BASE, 120, 'recovery'],
    ],
    thrust: [
      [HB({ chest: [38, 34], eF: [40, 40], hF: [38, 40], wa: -4, eB: [35, 41], hB: [34, 41], bOver: false }), 140, 'anticipation'],
      [HB({ chest: [37, 34], eF: [39, 40], hF: [36, 40], wa: -4, eB: [34, 41], hB: [33, 41], bOver: false }), 120, 'anticipation'],
      [HB({ ...H_LUNGE, hip: [42, 50], chest: [45, 35], eF: [51, 38], hF: [56, 39], wa: -2, eB: [46, 40], hB: [51, 40] }), 50, 'attack'],
      [HB({ ...H_LUNGE, hip: [43, 50], chest: [46, 35], head: [2, -1], eF: [53, 38], hF: [59, 39], wa: -2, eB: [48, 40], hB: [54, 40] }), 90, 'contact'],
      [HB({ hip: [40, 49], chest: [42, 34], eF: [47, 41], hF: [50, 45], wa: 20 }), 140, 'recovery'],
    ],
    hurt: [[HB({ chest: [36, 35], head: [-1, 0], eF: [42, 41], hF: [44, 45], wa: 20 }), 100, 'hurt'], [HB({ chest: [38, 34] }), 100, 'hurt']],
    break: [
      [HB({ hip: [39, 56], chest: [42, 42], head: [2, 1], kF: [46, 60], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [46, 50], hF: [49, 54], wa: 42, eB: [42, 50], hB: [47, 54] }), 240, 'break'],
      [HB({ hip: [39, 56], chest: [42, 43], head: [2, 2], kF: [46, 60], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [46, 51], hF: [49, 55], wa: 42, eB: [42, 51], hB: [47, 55] }), 240, 'break'],
    ],
  }, (p) => {
    const gy = p.hip[1] - 4;
    return [wp('joint', p.hip[0] + 1, gy, 2, 5)];
  });
}

/* ============================================================
 * 늪의 호명자 — 굽은 등의 주술사. 저주(회피 전용), 소환, 늪 파도(점프). 약점: 등불.
 * ============================================================ */
const HOOD = {
  rows: [
    '....abbba...',
    '..abcccccb..',
    '.abccdddccb.',
    'abccddddccb.',
    'abcccbbbbcb.',
    'abccbaaaaab.',
    'abccbaGaaGa.',
    'abccbaaaaaa.',
    'abcccbaaaab.',
    '.abcccbbbb..',
    '..abccccb...',
    '...abbbb....',
    '....abb.....',
  ],
  legend: { a: R.plum[0], b: R.plum[1], c: R.plum[2], d: R.plum[3], e: R.plum[4], G: R.gold[3] },
  anchor: [5, 12] as Pt,
};

function callerTorso(buf: PixelBuffer, c: RigCtx): void {
  const { sF, sB, hipF, hipB, pose } = c;
  const ch = pose.chest;
  poly(buf, [[sB[0] - 3, sB[1] - 2], [ch[0] - 2, ch[1] - 3], [sF[0] + 2, sF[1] - 1], [hipF[0] + 2, hipF[1]], [hipB[0] - 3, hipB[1]]], torsoShader(c, R.moss, 8, -1));
  // 늘어진 목걸이 (뼈 부적)
  line(buf, ch[0] - 1, ch[1] + 1, ch[0] + 3, ch[1] + 6, R.bone[2]);
  buf.set(Math.round(ch[0] + 3), Math.round(ch[1] + 7), R.bone[4]);
  // 등의 혹 (굽은 실루엣)
  ellipse(buf, sB[0] - 1, sB[1] + 1, 4, 4.5, rampShader(R.moss, -1));
}

function callerRobe(buf: PixelBuffer, c: RigCtx): void {
  const { hipF, hipB, pose } = c;
  const hy = pose.hip[1];
  const f = pose.flow ?? 0;
  const hem = Math.max(pose.fF[1], pose.fB[1]) + 1;
  const pts: Pt[] = [[hipB[0] - 3, hy - 3], [hipF[0] + 3, hy - 3], [pose.kF[0] + 4, pose.kF[1]], [pose.fF[0] + 4, hem], [pose.fF[0] + 1, hem - 2], [pose.fF[0] - 2, hem + 1], [pose.fB[0] + 2, hem - 1], [pose.fB[0] - 2, hem + 1], [pose.fB[0] - 5 - f, hem - 2], [hipB[0] - 5 - f, hy + 6]];
  poly(buf, pts, (x, y) => {
    const u = (x - pose.hip[0]) / 8, v = (y - hy) / 18;
    let I = lit(u * 0.5, -0.1 + v * 0.2, 0.8);
    if ((x * 3 + y) % 13 === 0 && y > hy + 4) I -= 0.5;
    return tone(y > hem - 4 ? R.plum : R.moss, I, -1);
  });
}

function lanternStaff(buf: PixelBuffer, c: RigCtx): void {
  const p = c.pose;
  const a = ((p.wa ?? -90) * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const [hx, hy] = p.hF;
  const tx = hx + dx * 16, ty = hy + dy * 16;
  rod(buf, hx - dx * 14, hy - dy * 14, tx, ty, R.wood, 2);
  // 갈고리 끝 + 매달린 등불
  line(buf, tx, ty, tx + 3, ty - 1, R.wood[2]);
  line(buf, tx + 3, ty - 1, tx + 4, ty + 2, R.wood[2]);
  const lx = Math.round(tx + 4), ly = Math.round(ty + 5);
  const glow = (p.wx ?? 0) > 0.5;
  poly(buf, [[lx - 2, ly - 2], [lx + 3, ly - 2], [lx + 3, ly + 3], [lx - 2, ly + 3]], (x, y) => ((x === lx - 2 || x === lx + 2 || y === ly - 2 || y === ly + 2) ? R.brass[2] : glow ? R.gold[4] : R.gold[2]));
  buf.set(lx, ly, glow ? R.white[0] : R.gold[3]);
}

const CALLER: Design = {
  id: 'caller', shF: 4, shB: 6, hipHalf: 3,
  rUpper: 1.9, rFore: 1.7, rThigh: 2.3, rShin: 1.9,
  skin: R.ash, sleeve: R.moss, glove: R.ash, pants: R.plum, boots: R.plum, bootH: 0.5, sleeveLen: 0.85,
  head: HOOD, torso: callerTorso, overLegs: callerRobe, weapon: lanternStaff,
};

const C_BASE = P(K_BASE, { hip: [39, 50], chest: [43, 37], head: [2, 0], kF: [43, 59], fF: [45, 68], kB: [36, 59], fB: [33, 68], eF: [48, 44], hF: [50, 42], wa: -92, eB: [38, 44], hB: [40, 49] });

export function callerSheet(): SheetSpec {
  const CB = (o: Partial<Pose>) => P(C_BASE, o);
  return humanoidSheet('caller', CALLER, {
    idle: [[C_BASE, 220, 'idle'], [CB({ chest: [43, 36], flow: 0.5 }), 220, 'idle'], [CB({ chest: [43, 36], flow: 1, wx: 1 }), 220, 'idle'], [CB({ flow: 0.5 }), 220, 'idle']],
    curse: [
      [CB({ chest: [41, 35], eF: [46, 36], hF: [48, 30], wa: -95, eB: [44, 40], hB: [50, 38], bOver: true }), 160, 'anticipation'],
      [CB({ chest: [40, 34], eF: [45, 33], hF: [47, 26], wa: -95, eB: [44, 39], hB: [51, 36], bOver: true, wx: 1, flow: 0.5 }), 200, 'anticipation'],
      [CB({ chest: [44, 36], eF: [50, 36], hF: [54, 33], wa: -60, eB: [46, 40], hB: [53, 39], bOver: true, wx: 1, flow: 1.5 }), 80, 'contact'],
      [CB({ chest: [43, 37], eF: [49, 41], hF: [51, 40], wa: -80, flow: 1 }), 140, 'recovery'],
    ],
    summon: [
      [CB({ chest: [42, 35], eF: [47, 36], hF: [49, 30], wa: -90, wx: 1 }), 160, 'anticipation'],
      [CB({ chest: [44, 39], eF: [49, 44], hF: [51, 46], wa: -88, wx: 1, flow: 1 }), 120, 'contact'],
      [CB({ chest: [44, 39], eF: [49, 44], hF: [51, 46], wa: -88, wx: 1, flow: 1.5 }), 200, 'recovery'],
      [C_BASE, 120, 'recovery'],
    ],
    bog: [
      [CB({ chest: [41, 36], eF: [44, 41], hF: [42, 44], wa: -130, flow: -1 }), 150, 'anticipation'],
      [CB({ chest: [40, 36], eF: [43, 41], hF: [40, 45], wa: -140, flow: -1.5, wx: 1 }), 160, 'anticipation'],
      [CB({ chest: [45, 38], eF: [50, 45], hF: [55, 50], wa: -20, flow: 1.5, wx: 1 }), 80, 'contact'],
      [CB({ chest: [44, 38], eF: [49, 44], hF: [53, 48], wa: -40, flow: 1 }), 140, 'recovery'],
    ],
    hurt: [[CB({ chest: [39, 36], head: [0, 0], eF: [45, 41], hF: [47, 38], wa: -110, flow: -2 }), 100, 'hurt'], [CB({ chest: [41, 36], flow: -1 }), 100, 'hurt']],
    break: [
      [CB({ hip: [39, 55], chest: [44, 44], head: [2, 1], kF: [46, 60], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [48, 52], hF: [50, 56], wa: -80 }), 240, 'break'],
      [CB({ hip: [39, 55], chest: [44, 45], head: [2, 2], kF: [46, 60], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [48, 53], hF: [50, 57], wa: -78 }), 240, 'break'],
    ],
  }, (p) => {
    const a = ((p.wa ?? -90) * Math.PI) / 180;
    const S = 1;
    const tx = p.hF[0] + Math.cos(a) * 16 * S, ty = p.hF[1] + Math.sin(a) * 16 * S;
    return [wp('lantern', tx + 4, ty + 5, 2.5, 5)];
  }, 1.04, (p) => {
    const a = ((p.wa ?? -90) * Math.PI) / 180;
    return { lantern: [Math.round(p.hF[0] + Math.cos(a) * 16 + 4), Math.round(p.hF[1] + Math.sin(a) * 16 + 5)] };
  });
}

/* ============================================================
 * 대형 기사형 보스 (잿불 파수꾼 / 가시 심장 기사) — 2배 체격의 포즈 블루프린트
 * ============================================================ */
interface KnightMat { plate: readonly number[]; trim: readonly number[]; glow: readonly number[]; cloth: readonly number[]; under: readonly number[]; thorny: boolean; weapon: 'halberd' | 'thornblade' }

function knightDesign(m: KnightMat): Design {
  const S = 2;
  const torso = (buf: PixelBuffer, c: RigCtx) => {
    const { sF, sB, hipF, hipB, pose } = c;
    const ch = pose.chest;
    const waistF: Pt = [hipF[0] + 3, hipF[1] - 8];
    const waistB: Pt = [hipB[0] - 2, hipB[1] - 8];
    poly(buf, [[sB[0] - 6, sB[1] - 2], [ch[0] - 2, ch[1] - 4], [sF[0] + 6, sF[1] - 2], [waistF[0] + 2, waistF[1]], [hipF[0] + 5, hipF[1] + 2], [hipB[0] - 5, hipB[1] + 2], [waistB[0] - 2, waistB[1]]], torsoShader(c, m.plate, 16, 0, true, -0.1));
    // 가슴판 능선과 테
    line(buf, ch[0] + 1, ch[1] + 2, ch[0] + 2, waistF[1] - 2, m.plate[4]);
    line(buf, ch[0] + 2, ch[1] + 2, ch[0] + 3, waistF[1] - 2, m.plate[3]);
    line(buf, waistB[0], waistB[1], waistF[0] + 1, waistF[1], m.trim[2]);
    line(buf, waistB[0], waistB[1] + 1, waistF[0] + 1, waistF[1] + 1, m.trim[1]);
    // 심장 (약점) — 가슴 중앙의 균열
    const hx = Math.round(ch[0] + 3), hy = Math.round(ch[1] + 12);
    poly(buf, [[hx - 4, hy - 5], [hx + 3, hy - 4], [hx + 4, hy + 3], [hx - 3, hy + 5]], () => R.ink[0]);
    ellipse(buf, hx, hy, 2.8, 3.2, (x, y, nx, ny, nz) => tone(m.glow, lit(nx, ny, nz) + 0.4, 0, true));
    // 가시 돌기
    if (m.thorny) for (const [dx, dy] of [[-8, 4], [-10, 12], [8, 6], [-6, 18]] as Pt[]) {
      const x = ch[0] + dx, y = ch[1] + dy;
      poly(buf, [[x - 1.5, y], [x + 1.5, y], [x + (dx < 0 ? -4 : 4), y - 4]], () => R.thorn[3]);
    }
    // 허리 아래 판금 치마
    poly(buf, [[hipB[0] - 6, hipB[1] - 4], [hipF[0] + 6, hipF[1] - 4], [hipF[0] + 8, hipF[1] + 10], [pose.hip[0], hipF[1] + 12], [hipB[0] - 8, hipB[1] + 10]], (x, y) => ((y - hipB[1]) % 5 === 0 ? m.plate[1] : tone(m.plate, lit((x - pose.hip[0]) / 12, 0.1, 0.8), 0)));
  };
  const behind = (buf: PixelBuffer, c: RigCtx) => {
    const { sB, pose } = c;
    const f = pose.flow ?? 0;
    const hp = pose.hip;
    poly(buf, [[pose.chest[0] - 2, pose.chest[1]], [sB[0] - 3, sB[1] - 2], [sB[0] - 10 - f * 2, sB[1] + 16], [hp[0] - 22 - f * 4, hp[1] + 26], [hp[0] - 14 - f * 3, hp[1] + 30], [hp[0] - 8 - f * 2, hp[1] + 24], [hp[0] - 2, hp[1] + 6]], (x, y) => {
      let I = lit((x - hp[0]) / 20, -0.1, 0.8);
      if ((x + Math.floor(y / 3)) % 9 === 0 && y > hp[1]) I -= 0.5;
      return tone(m.cloth, I, -1);
    });
    if (m.thorny) for (let i = 0; i < 4; i++) {
      const x = hp[0] - 20 - f * 4 + i * 4, y = hp[1] + 27 + (i % 2) * 2;
      line(buf, x, y, x - 1, y + 4, R.thorn[2]);
    }
  };
  const helm = (buf: PixelBuffer, c: RigCtx) => {
    const [nx, ny] = c.neck;
    const cx = nx + 1, cy = ny - 11;
    ellipse(buf, cx, cy, 9, 10, rampShader(m.plate, 0, true, -0.05));
    // 턱 가리개
    poly(buf, [[cx - 2, cy + 2], [cx + 9, cy + 1], [cx + 8, cy + 9], [cx, cy + 11], [cx - 5, cy + 8]], (x, y) => tone(m.plate, lit((x - cx) / 9, 0.3, 0.8), 0));
    // 눈구멍 (빛)
    line(buf, cx + 1, cy - 1, cx + 9, cy - 1, R.ink[0]);
    line(buf, cx + 1, cy, cx + 9, cy, R.ink[0]);
    line(buf, cx + 3, cy - 1, cx + 7, cy - 1, m.glow[4]);
    line(buf, cx + 4, cy, cx + 6, cy, m.glow[3]);
    line(buf, cx - 2, cy - 9, cx + 6, cy - 9, m.trim[3]);
    if (m.thorny) {
      // 가시 왕관
      for (let i = 0; i < 5; i++) {
        const x = cx - 6 + i * 3.5, y = cy - 8 - (i === 2 ? 2 : 0);
        poly(buf, [[x - 1.5, y + 1], [x + 1.5, y + 1], [x + (i - 2) * 0.8, y - 7 - (i === 2 ? 2 : 0)]], (px) => (px < x ? R.thorn[3] : R.thorn[2]));
      }
    } else {
      // 잿불 깃장식
      const f = c.pose.flow ?? 0;
      poly(buf, [[cx - 2, cy - 9], [cx + 3, cy - 10], [cx - 6 - f, cy - 18], [cx - 14 - f * 2, cy - 14], [cx - 10 - f, cy - 12]], (x, y) => tone(R.ember, lit(-0.3, -0.6, 0.7) + (y < cy - 14 ? 0.3 : 0), 0));
    }
  };
  const pauldron = (buf: PixelBuffer, c: RigCtx) => {
    const { sF } = c;
    ellipse(buf, sF[0] + 1, sF[1] - 1, 8, 6.5, rampShader(m.plate, 0, true, -0.1));
    line(buf, sF[0] - 6, sF[1] + 4, sF[0] + 7, sF[1] + 4, m.trim[2]);
    if (m.thorny) poly(buf, [[sF[0] - 2, sF[1] - 6], [sF[0] + 2, sF[1] - 6], [sF[0] - 1, sF[1] - 13]], () => R.thorn[3]);
  };
  const weapon = (buf: PixelBuffer, c: RigCtx) => {
    const p = c.pose;
    const a = ((p.wa ?? 0) * Math.PI) / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    const [hx, hy] = p.hF;
    if (m.weapon === 'halberd') {
      rod(buf, hx - dx * 22, hy - dy * 22, hx + dx * 34, hy + dy * 34, R.wood, 3);
      const tx = hx + dx * 34, ty = hy + dy * 34;
      blade(buf, tx, ty, a, 12, R.steel, 3);
      // 도끼날 (수직 방향)
      const px = -dy, py = dx;
      poly(buf, [[tx - dx * 2 + px * 1, ty - dy * 2 + py * 1], [tx + dx * 6 + px * 1, ty + dy * 6 + py * 1], [tx + dx * 8 + px * 11, ty + dy * 8 + py * 11], [tx - dx * 6 + px * 12, ty - dy * 6 + py * 12], [tx - dx * 4 + px * 7, ty - dy * 4 + py * 7]], (x, y) => {
        const d = (x - tx) * px + (y - ty) * py;
        return d > 10 ? R.steel[4] : d > 7 ? R.steel[3] : tone(R.steel, lit(0, -0.4, 0.8) - 0.1, 0);
      });
      line(buf, tx - dx * 3, ty - dy * 3, tx + dx * 3, ty + dy * 3, R.brass[3]);
      // 잿불 수술
      buf.set(Math.round(tx - dx * 5 - px * 2), Math.round(ty - dy * 5 - py * 2), R.ember[3]);
    } else {
      line(buf, hx - dx * 6, hy - dy * 6, hx + dx * 3, hy + dy * 3, R.root[2]);
      const gx = hx + dx * 5, gy = hy + dy * 5;
      const px = -dy, py = dx;
      line(buf, gx + px * 7, gy + py * 7, gx - px * 7, gy - py * 7, R.thorn[2]);
      // 가시 대검: 폭 4px, 가장자리 톱니
      for (let i = 0; i < 38; i++) {
        const bx = gx + dx * (i + 1), by = gy + dy * (i + 1);
        const w = i > 33 ? 1 : 2.5;
        for (let k = -w; k <= w; k += 0.5) {
          const x = Math.round(bx + px * k), y = Math.round(by + py * k);
          buf.set(x, y, k < -1 ? R.root[4] : k > 1 ? R.root[1] : R.thorn[i % 6 === 0 ? 4 : 2]);
        }
        if (i % 7 === 3 && i < 38) buf.set(Math.round(bx + px * 4), Math.round(by + py * 4), R.thorn[3]);
      }
    }
  };
  return {
    id: 'knight', scale: S, shF: 11, shB: 13, hipHalf: 7,
    rUpper: 5.0, rFore: 4.4, rThigh: 5.8, rShin: 4.6,
    skin: m.plate, sleeve: m.plate, glove: m.trim, pants: m.under, boots: m.plate, bootH: 0.55, sleeveLen: 0.55,
    head: { rows: ['.'], legend: {}, anchor: [0, 0] },
    torso, behind, afterHead: helm, frontExtra: pauldron, weapon,
  };
}

const WARDEN = knightDesign({ plate: R.steel, trim: R.brass, glow: R.ember, cloth: R.rust, under: R.stone, thorny: false, weapon: 'halberd' });
const THORNKNIGHT = knightDesign({ plate: R.root, trim: R.thorn, glow: R.echo, cloth: R.thorn, under: R.ink, thorny: true, weapon: 'thornblade' });

function bossHumanoidSheet(id: string, d: Design, poses: Record<string, [Pose, number, FrameTag?][]>, weakFn: (p: Pose) => ReturnType<typeof wp>[], extraAttach?: (p: Pose) => Record<string, [number, number]>): SheetSpec {
  const W = 144, H = 120;
  const draw = (pose: Pose): Drawn => {
    const sp = scalePose(shiftPose(pose, 0, 8), 2, [40, 76], [64, 118]);
    const buf = renderPose(d, sp, { noOutline: true, w: W, h: H });
    return flipDrawn({ buf, weak: weakFn(sp), attach: { ...(extraAttach ? extraAttach(sp) : {}), hand: [sp.hF[0], sp.hF[1]], chest: [sp.chest[0], sp.chest[1] + 10] } });
  };
  const anims: Record<string, EFrame<Pose>[]> = {};
  for (const [k, list] of Object.entries(poses)) anims[k] = list.map(([p, ms, tag]) => ({ p, ms, tag }));
  return buildEnemySheet<Pose>({ id, kind: 'boss', w: W, h: H, anchor: [80, 119], draw, anims, death: { from: poses.break[0][0], frames: 8 }, required: ['idle', 'hurt', 'break', 'death'] });
}

const KB = KAEL_POSES;
const W_BASE = P(K_BASE, { kF: [45, 59], fF: [48, 68], kB: [34, 59], fB: [30, 68], eF: [45, 42], hF: [47, 44], wa: -80, eB: [37, 42], hB: [42, 50], bOver: true });
const W_L: Partial<Pose> = { kF: [49, 60], fF: [53, 68], kB: [36, 60], fB: [28, 68] };
const heartWeak = (p: Pose) => [wp('heart', p.chest[0] + 3, p.chest[1] + 12, 3, 6.5)];

function knightPoses(): Record<string, [Pose, number, FrameTag?][]> {
  const B = (o: Partial<Pose>) => P(W_BASE, o);
  return {
    idle: [[W_BASE, 240, 'idle'], [B({ chest: [40, 32], flow: 0.5 }), 240, 'idle'], [B({ chest: [40, 32], flow: 1 }), 240, 'idle'], [B({ flow: 0.5 }), 240, 'idle']],
    sweep: [
      [B({ chest: [38, 34], eF: [41, 40], hF: [37, 42], wa: 175, eB: [34, 41], hB: [31, 43], bOver: false, flow: -1 }), 150, 'anticipation'],
      [B({ chest: [37, 34], eF: [40, 40], hF: [35, 42], wa: 178, eB: [33, 41], hB: [30, 43], bOver: false, flow: -1.5 }), 160, 'anticipation'],
      [B({ ...W_L, hip: [41, 50], chest: [45, 35], eF: [48, 40], hF: [52, 42], wa: -5, eB: [42, 41], hB: [47, 43], flow: 1 }), 60, 'attack'],
      [B({ ...W_L, hip: [42, 50], chest: [46, 36], eF: [51, 41], hF: [56, 42], wa: 10, eB: [45, 42], hB: [50, 43], flow: 2 }), 90, 'contact'],
      [B({ ...W_L, hip: [42, 50], chest: [46, 36], eF: [50, 43], hF: [53, 47], wa: 40, eB: [44, 44], hB: [48, 47], flow: 1.5 }), 130, 'recovery'],
    ],
    overhead: [
      [B({ chest: [39, 33], eF: [43, 29], hF: [43, 23], wa: -100, eB: [37, 30], hB: [41, 26] }), 160, 'anticipation'],
      [B({ chest: [38, 32], head: [0, -1], eF: [42, 27], hF: [41, 20], wa: -110, eB: [36, 28], hB: [40, 23], flow: 0.5 }), 260, 'hold'],
      [B({ ...W_L, hip: [42, 50], chest: [45, 35], eF: [49, 30], hF: [53, 28], wa: -40, eB: [44, 31], hB: [50, 29], flow: 1.5 }), 50, 'attack'],
      [B({ ...W_L, hip: [43, 52], chest: [47, 38], head: [2, 0], eF: [52, 42], hF: [56, 47], wa: 45, eB: [48, 43], hB: [53, 47], flow: 2.5 }), 100, 'contact'],
      [B({ ...W_L, hip: [43, 52], chest: [47, 39], head: [2, 0], eF: [52, 44], hF: [56, 49], wa: 50, eB: [48, 45], hB: [53, 49], flow: 2 }), 160, 'recovery'],
    ],
    stomp: [
      [B({ hip: [39, 47], chest: [40, 31], kF: [47, 52], fF: [50, 58], toeF: 1, eF: [45, 38], hF: [47, 34], wa: -85 }), 170, 'anticipation'],
      [B({ hip: [39, 46], chest: [40, 30], head: [1, -2], kF: [48, 50], fF: [51, 55], toeF: 1, eF: [45, 37], hF: [47, 33], wa: -85, flow: 1 }), 180, 'anticipation'],
      [B({ hip: [40, 52], chest: [42, 36], kF: [48, 60], fF: [51, 68], eF: [47, 42], hF: [49, 40], wa: -80, flow: 1.5 }), 100, 'contact'],
      [B({ hip: [40, 51], chest: [41, 35], kF: [47, 60], fF: [50, 68], flow: 1 }), 150, 'recovery'],
    ],
    lunge: [
      [B({ chest: [37, 35], hip: [38, 51], eF: [40, 42], hF: [38, 43], wa: -6, eB: [34, 42], hB: [34, 44], bOver: false, flow: -1 }), 180, 'anticipation'],
      [B({ ...W_L, hip: [42, 50], chest: [46, 35], eF: [51, 38], hF: [54, 39], wa: -4, eB: [47, 40], hB: [51, 40], flow: 2 }), 60, 'attack'],
      [B({ ...W_L, hip: [43, 50], chest: [47, 35], head: [2, -1], eF: [52, 38], hF: [55, 39], wa: -4, eB: [48, 40], hB: [52, 40], flow: 2.5 }), 90, 'contact'],
      [B({ hip: [40, 50], chest: [43, 35], flow: 1 }), 150, 'recovery'],
    ],
    charge: [
      [B({ chest: [40, 33], eF: [45, 36], hF: [47, 30], wa: -90, eB: [36, 38], hB: [33, 34], bOver: false, flow: 1 }), 200, 'anticipation'],
      [B({ chest: [40, 32], head: [1, -2], eF: [45, 34], hF: [47, 27], wa: -92, eB: [35, 37], hB: [31, 31], bOver: false, flow: 2 }), 200, 'hold'],
      [B({ ...W_L, hip: [42, 51], chest: [46, 37], eF: [51, 40], hF: [56, 44], wa: 30, flow: 3 }), 100, 'contact'],
      [B({ hip: [40, 50], chest: [43, 35], flow: 1 }), 160, 'recovery'],
    ],
    hurt: [[B({ chest: [36, 35], head: [-1, 0], eF: [42, 40], hF: [45, 36], wa: -100, flow: -2 }), 110, 'hurt'], [B({ chest: [38, 34], flow: -1 }), 110, 'hurt']],
    break: [
      [B({ hip: [39, 56], chest: [42, 42], head: [2, 1], kF: [46, 60], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [46, 50], hF: [49, 54], wa: 60, eB: [42, 50], hB: [47, 54], flow: 0.5 }), 260, 'break'],
      [B({ hip: [39, 56], chest: [42, 43], head: [2, 2], kF: [46, 60], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [46, 51], hF: [49, 55], wa: 60, eB: [42, 51], hB: [47, 55], flow: 1 }), 260, 'break'],
    ],
  };
}

export function wardenSheet(): SheetSpec {
  return bossHumanoidSheet('warden', WARDEN, knightPoses(), heartWeak, (p) => {
    const a = ((p.wa ?? 0) * Math.PI) / 180;
    return { tip: [Math.round(p.hF[0] + Math.cos(a) * 40), Math.round(p.hF[1] + Math.sin(a) * 40)] };
  });
}

export function thornKnightSheet(): SheetSpec {
  return bossHumanoidSheet('thornknight', THORNKNIGHT, knightPoses(), heartWeak, (p) => {
    const a = ((p.wa ?? 0) * Math.PI) / 180;
    return { tip: [Math.round(p.hF[0] + Math.cos(a) * 48), Math.round(p.hF[1] + Math.sin(a) * 48)] };
  });
}

export { KB };
