import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { poly, rampShader, line, tone, lit, Pt, capsule, quadPoints, polyline } from '../core/draw';
import { Design, Pose, RigCtx, torsoShader, rotRect } from './rig';
import { KAEL_POSES, K_BASE, P } from './kael';

/* 세라 — 떠돌이 사냥꾼. 은발 포니테일, 녹색 짧은 망토, 가죽 조끼, 장궁. */

const HL = {
  a: R.hairSera[0], b: R.hairSera[1], c: R.hairSera[2], d: R.hairSera[3], e: R.hairSera[4],
  k: R.skin[0], l: R.skin[1], m: R.skin[2], n: R.skin[3], o: R.skin[4],
  E: R.ink[0],
};
const HEAD = [
  '....abbba...',
  '..abccccba..',
  '.abcddddcba.',
  'abcddeeddcb.',
  'abcdddddccba',
  'abcdcbnbccba',
  'abccbnnnbcb.',
  'abcblnEnnEn.',
  'abcblnEnnEnl',
  '.abcllnnnnm.',
  '..ab.lmnlnm.',
  '...a.kllml..',
  '.....klll...',
];
const HEAD_HURT = HEAD.map((r, i) => (i === 7 ? r.replace(/E/g, 'n') : i === 8 ? r.replace(/E/g, 'l') : r));

function behind(buf: PixelBuffer, c: RigCtx): void {
  const { sB, pose, neck } = c;
  const f = pose.flow ?? 0;
  // 화살통
  rotRect(buf, sB[0] - 2, sB[1] + 5, 4, 12, (-20 * Math.PI) / 180, (_x, _y, u) => tone(R.leather, lit(u * 0.6, 0, 0.8), 0));
  // 화살 깃
  const qx = Math.round(sB[0] + 1), qy = Math.round(sB[1] - 2);
  buf.set(qx, qy, R.bone[3]); buf.set(qx + 1, qy - 1, R.bone[4]); buf.set(qx - 1, qy, R.rust[3]); buf.set(qx, qy - 1, R.rust[2]);
  // 포니테일: 뒤통수에서 흘러내림
  const r0: Pt = [neck[0] - 5, neck[1] - 8];
  const r1: Pt = [neck[0] - 8 - f * 1.2, neck[1] - 3];
  const r2: Pt = [neck[0] - 9 - f * 2.2, neck[1] + 5];
  capsule(buf, r0[0], r0[1], r1[0], r1[1], 1.7, 1.4, rampShader(R.hairSera, -1));
  capsule(buf, r1[0], r1[1], r2[0], r2[1], 1.4, 0.6, rampShader(R.hairSera, -1));
  buf.set(Math.round(r0[0]), Math.round(r0[1]), R.teal[3]); // 머리끈
}

function torso(buf: PixelBuffer, c: RigCtx): void {
  const { sF, sB, hipF, hipB, pose } = c;
  const ch = pose.chest;
  const waistF: Pt = [hipF[0] + 0.5, hipF[1] - 4];
  const waistB: Pt = [hipB[0], hipB[1] - 4];
  poly(buf, [[sB[0] - 1.5, sB[1] - 1], [ch[0] - 1, ch[1] - 1], [sF[0] + 1.5, sF[1] - 1], [waistF[0] + 0.5, waistF[1]], [hipF[0] + 1.5, hipF[1] + 1], [hipB[0] - 1.5, hipB[1] + 1], [waistB[0] - 0.5, waistB[1]]], torsoShader(c, R.green, 6));
  // 가죽 조끼
  poly(buf, [[sB[0] + 0.5, sB[1] + 1], [ch[0] + 1, ch[1] + 2], [sF[0] + 1, sF[1] + 2], [waistF[0] + 1, waistF[1] + 1], [waistB[0] - 0.5, waistB[1] + 1]], torsoShader(c, R.leather, 6, 0, false, 0.1));
  // 화살통 끈 (대각선)
  line(buf, sB[0] + 1, sB[1] + 1, hipF[0] + 1, hipF[1] - 3, R.wood[1]);
  line(buf, sB[0] + 2, sB[1] + 1, hipF[0] + 2, hipF[1] - 3, R.wood[3]);
  const bx = Math.round((sB[0] + hipF[0]) / 2 + 1.5), by = Math.round((sB[1] + hipF[1]) / 2 - 1);
  buf.set(bx, by, R.brass[3]);
  // 허리띠
  const hy = Math.round(pose.hip[1]);
  line(buf, hipB[0] - 2, hy - 1, hipF[0] + 2, hy - 1, R.wood[2]);
}

function pelvis(buf: PixelBuffer, c: RigCtx): void {
  const { hipF, hipB, pose } = c;
  const hy = Math.round(pose.hip[1]);
  const kF = pose.kF;
  const fl: Pt = [hipF[0] + (kF[0] - hipF[0]) * 0.35, hipF[1] + (kF[1] - hipF[1]) * 0.35];
  poly(buf, [[hipB[0] - 2.5, hy], [hipF[0] + 2.5, hy], [fl[0] + 2, fl[1]], [hipB[0] - 2, hy + 4]], (x, y) => tone(R.green, lit(0, -0.1 + (y - hy) * 0.1, 0.9), 0));
}

function mantle(buf: PixelBuffer, c: RigCtx): void {
  const { sF, sB, pose } = c;
  const ch = pose.chest;
  const f = pose.flow ?? 0;
  poly(buf, [[sB[0] - 2, sB[1] - 1], [ch[0] - 1, ch[1] - 2], [ch[0] + 2, ch[1] - 1], [sF[0] + 2.5, sF[1]], [sF[0] + 2.5, sF[1] + 4], [ch[0] + 1, ch[1] + 5], [sB[0] - 3 - f * 0.5, sB[1] + 6]], (x, y) => {
    const v = (y - ch[1]) / 7;
    const u = (x - ch[0]) / 6;
    return tone(R.green, lit(u * 0.6, -0.5 + v * 0.6, 0.7), 0);
  });
  // 브로치
  buf.set(Math.round(ch[0] + 2), Math.round(ch[1] + 1), R.brass[3]);
}

function bow(buf: PixelBuffer, c: RigCtx): void {
  const p = c.pose;
  const a = ((p.wa ?? 0) * Math.PI) / 180;
  const d: Pt = [Math.cos(a), Math.sin(a)];
  const n: Pt = [Math.sin(a), -Math.cos(a)];
  const g = p.hF;
  const drawn = (p.wx ?? 0) > 0.5;
  const L = 15;
  const bend = drawn ? 6 : 4;
  const top: Pt = [g[0] + n[0] * L - d[0] * bend, g[1] + n[1] * L - d[1] * bend];
  const bot: Pt = [g[0] - n[0] * L - d[0] * bend, g[1] - n[1] * L - d[1] * bend];
  const cT: Pt = [g[0] + n[0] * 9 + d[0] * 1.5, g[1] + n[1] * 9 + d[1] * 1.5];
  const cB: Pt = [g[0] - n[0] * 9 + d[0] * 1.5, g[1] - n[1] * 9 + d[1] * 1.5];
  // 시위
  const nock: Pt = drawn ? p.hB : [g[0] - d[0] * (bend + 0.5), g[1] - d[1] * (bend + 0.5)];
  line(buf, top[0], top[1], nock[0], nock[1], R.bone[3]);
  line(buf, bot[0], bot[1], nock[0], nock[1], R.bone[3]);
  // 활 몸체 (2px, 바깥쪽 밝게)
  for (const [ctl, tip] of [[cT, top], [cB, bot]] as [Pt, Pt][]) {
    const pts = quadPoints(g, ctl, tip, 10);
    polyline(buf, pts, (_x, _y, t) => (t > 0.85 ? R.wood[2] : R.wood[3]));
    polyline(buf, pts.map(([x, y]) => [x + d[0] * 0.9, y + d[1] * 0.9] as Pt), (_x, _y, t) => (t > 0.8 ? -1 : R.wood[4]));
  }
  // 손잡이 감개
  buf.set(Math.round(g[0] + n[0]), Math.round(g[1] + n[1]), R.leather[3]);
  buf.set(Math.round(g[0] - n[0]), Math.round(g[1] - n[1]), R.leather[3]);
  // 화살
  if (drawn) {
    const tip: Pt = [g[0] + d[0] * 5, g[1] + d[1] * 5];
    line(buf, nock[0], nock[1], tip[0], tip[1], R.wood[3]);
    buf.set(Math.round(tip[0]), Math.round(tip[1]), R.steel[4]);
    buf.set(Math.round(tip[0] - d[0]), Math.round(tip[1] - d[1]), R.steel[3]);
    buf.set(Math.round(nock[0] - d[0] + n[0]), Math.round(nock[1] - d[1] + n[1]), R.rust[3]);
  }
}

export const SERA: Design = {
  id: 'sera',
  shF: 4, shB: 5, hipHalf: 2.8,
  rUpper: 1.9, rFore: 1.7, rThigh: 2.3, rShin: 1.8,
  skin: R.skin,
  sleeve: R.green,
  glove: R.leather,
  pants: R.earth,
  boots: R.wood,
  bootH: 0.55,
  sleeveLen: 0.4,
  head: { rows: HEAD, legend: HL, anchor: [6, 12] },
  headHurt: { rows: HEAD_HURT, legend: HL, anchor: [6, 12] },
  torso,
  pelvis,
  behind,
  weapon: bow,
  frontExtra: mantle,
};

const K = KAEL_POSES;
const S_BASE: Pose = P(K_BASE, { kF: [43, 59], fF: [46, 68], kB: [35, 59], fB: [32, 68], eF: [45, 41], hF: [47, 46], wa: 0, eB: [35, 41], hB: [36, 47] });
const KNEEL: Partial<Pose> = { hip: [38, 57], chest: [40, 41], kF: [45, 58], fF: [46, 68], kB: [38, 66], fB: [31, 68], toeB: -1 };
const SH = (o: Partial<Pose>) => P(S_BASE, o);
/** 활 당김 자세 (가슴 기준) */
function drawPose(ch: Pt, drawn: number, extra: Partial<Pose> = {}): Partial<Pose> {
  return {
    chest: ch,
    eF: [ch[0] + 7, ch[1] + 3], hF: [ch[0] + 12, ch[1] + 3],
    eB: drawn ? [ch[0] - 3, ch[1] + 3] : [ch[0] + 3, ch[1] + 5],
    hB: drawn ? [ch[0] + 2, ch[1] + 1] : [ch[0] + 8, ch[1] + 4],
    bOver: true, wa: 0, wx: drawn,
    ...extra,
  };
}

export const SERA_POSES = {
  idle: [
    S_BASE,
    SH({ chest: [40, 32], eF: [45, 40], hF: [47, 45], eB: [35, 40], hB: [36, 46], flow: 0.5 }),
    SH({ chest: [40, 32], eF: [45, 40], hF: [47, 45], eB: [35, 40], hB: [36, 46], flow: 1 }),
    SH({ flow: 0.5 }),
  ],
  attack: [
    SH(drawPose([41, 33], 0, { flow: 0.3 })),
    SH(drawPose([40, 33], 1, { flow: 0.5 })),
    SH(drawPose([40, 33], 1, { flow: 0.7, head: [1, -1] })),
    SH(drawPose([39, 33], 0, { hB: [37, 35], eB: [34, 37], flow: 1.2 })),
    SH({ chest: [40, 33], eF: [46, 39], hF: [49, 41], wa: 20, flow: 1 }),
    SH({ flow: 0.5 }),
  ],
  skill: [
    SH({ ...KNEEL, eF: [45, 47], hF: [48, 50], wa: 10 }),
    SH({ ...KNEEL, ...drawPose([40, 41], 0), hip: [38, 57] }),
    SH({ ...KNEEL, ...drawPose([40, 41], 1), hip: [38, 57], flow: 0.5 }),
    SH({ ...KNEEL, ...drawPose([40, 41], 1), hip: [38, 57], flow: 1 }),
    SH({ ...KNEEL, ...drawPose([39, 41], 0, { hB: [36, 42], eB: [33, 45] }), hip: [38, 57], flow: 1.5 }),
    SH({ ...KNEEL, eF: [45, 47], hF: [48, 50], wa: 10, flow: 1 }),
    SH({ flow: 0.5 }),
  ],
  skill2: [
    SH(drawPose([41, 33], 1, { wa: -8, flow: 0.3 })),
    SH(drawPose([40, 33], 0, { wa: -8, hB: [37, 35], eB: [34, 37], flow: 1 })),
    SH(drawPose([41, 33], 1, { wa: 0, flow: 0.8 })),
    SH(drawPose([40, 33], 0, { wa: 0, hB: [37, 35], eB: [34, 37], flow: 1.4 })),
    SH(drawPose([41, 34], 1, { wa: 8, flow: 1 })),
    SH(drawPose([40, 34], 0, { wa: 8, hB: [37, 36], eB: [34, 38], flow: 1.6 })),
    SH({ flow: 0.8 }),
  ],
  support: [
    SH({ eF: [45, 36], hF: [46, 30], wa: -90, eB: [36, 38], hB: [40, 34], bOver: true }),
    SH({ chest: [40, 32], eF: [45, 34], hF: [46, 26], wa: -90, eB: [36, 36], hB: [42, 30], bOver: true, flow: 0.5 }),
    SH({ chest: [40, 32], eF: [45, 34], hF: [46, 26], wa: -90, eB: [36, 36], hB: [42, 30], bOver: true, flow: 1 }),
    SH({ eF: [45, 40], hF: [47, 44], wa: 0, flow: 0.5 }),
    S_BASE,
  ],
  dodge: K.dodge.map((p) => P(p, { eF: [p.chest[0] + 5, p.chest[1] + 8], hF: [p.chest[0] + 7, p.chest[1] + 12], wa: 0 })),
  parry: [
    SH({ hip: [39, 50], chest: [41, 34], eF: [46, 37], hF: [49, 34], wa: -70, eB: [40, 39], hB: [46, 38], bOver: true, kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68] }),
    SH({ hip: [38, 50], chest: [40, 35], eF: [45, 38], hF: [48, 35], wa: -62, eB: [39, 40], hB: [45, 39], bOver: true, kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], flow: -1 }),
    SH({ hip: [38, 50], chest: [40, 35], eF: [45, 38], hF: [48, 35], wa: -62, eB: [39, 40], hB: [45, 39], bOver: true, kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], flow: -0.5 }),
    S_BASE,
  ],
  counter: [
    SH({ hip: [38, 51], chest: [37, 36], kF: [44, 60], fF: [46, 68], kB: [34, 60], fB: [31, 68], eF: [43, 41], hF: [46, 44], wa: 10, eB: [33, 41], hB: [31, 45] }),
    SH({ hip: [37, 49], chest: [35, 34], kF: [46, 53], fF: [53, 55], toeF: 1, kB: [35, 59], fB: [33, 68], eF: [41, 39], hF: [44, 42], wa: 10, eB: [31, 39], hB: [29, 43], flow: 1 }),
    SH({ hip: [37, 49], chest: [35, 34], kF: [48, 50], fF: [55, 49], toeF: 1, kB: [35, 59], fB: [33, 68], eF: [41, 39], hF: [44, 42], wa: 10, eB: [31, 39], hB: [29, 43], flow: 1.5 }),
    SH(drawPose([40, 34], 1, { hip: [39, 50], kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], flow: 1 })),
    SH(drawPose([39, 34], 0, { hip: [39, 50], kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], hB: [36, 36], eB: [33, 38], flow: 2 })),
    SH(drawPose([39, 34], 0, { hip: [39, 50], kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], hB: [36, 36], eB: [33, 38], flow: 1.5 })),
    SH({ eF: [46, 39], hF: [49, 42], wa: 15, flow: 1 }),
    SH({ flow: 0.5 }),
  ],
  jump: K.jump.map((p) => P(p, { eF: [p.chest[0] + 5, p.chest[1] + 7], hF: [p.chest[0] + 8, p.chest[1] + 9], wa: 0 })),
  hurt: [
    SH({ hip: [38, 50], chest: [35, 35], head: [-1, 0], headV: 'hurt', eF: [41, 38], hF: [45, 37], wa: -30, eB: [30, 39], hB: [27, 42], kB: [34, 60], fB: [31, 68], flow: -2 }),
    SH({ hip: [38, 50], chest: [36, 35], head: [0, 0], headV: 'hurt', eF: [42, 39], hF: [46, 40], wa: -15, eB: [31, 40], hB: [28, 44], flow: -1.5 }),
    SH({ chest: [39, 34], eF: [45, 41], hF: [47, 45], wa: 0, flow: -0.5 }),
  ],
  stagger: K.stagger.map((p) => P(p, { eF: [p.chest[0] + 3, p.chest[1] + 7], hF: [p.chest[0] + 5, p.chest[1] + 12], wa: 15 })),
  victory: [
    S_BASE,
    SH({ chest: [40, 32], eF: [45, 32], hF: [47, 26], wa: -90, eB: [35, 39], hB: [38, 43], flow: 1 }),
    SH({ chest: [40, 31], eF: [45, 30], hF: [47, 24], wa: -90, eB: [35, 38], hB: [38, 42], flow: 1.5 }),
    SH({ chest: [40, 31], eF: [45, 30], hF: [47, 24], wa: -90, eB: [35, 38], hB: [38, 42], flow: 0.5 }),
    SH({ eF: [45, 40], hF: [47, 45], wa: 0, eB: [36, 40], hB: [39, 45], flow: 0.5 }),
  ],
  defeat: K.defeat.map((p, i) => P(p, { eF: [p.chest[0] + 4, p.chest[1] + 7], hF: [p.chest[0] + 7, p.chest[1] + 11], wa: i === 0 ? -30 : 30 })),
  aim: [
    SH(drawPose([40, 33], 1)),
    SH(drawPose([40, 33], 1, { flow: 0.5 })),
    SH(drawPose([40, 34], 1, { flow: 1 })),
  ],
} satisfies Record<string, Pose[]>;
