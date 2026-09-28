import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { poly, ellipse, rampShader, line, tone, lit, Pt } from '../core/draw';
import { Design, Pose, RigCtx, torsoShader, rotRect, rod } from './rig';
import { KAEL_POSES, K_BASE, P } from './kael';

/* 오린 — 폐허의 옛 수문장이자 기계공. 다부진 체격, 고글, 붉은 수염, 거대한 충전 망치포. */

const HL = {
  a: R.hairOrin[0], b: R.hairOrin[1], c: R.hairOrin[2], d: R.hairOrin[3], e: R.hairOrin[4],
  k: R.skinDeep[0], l: R.skinDeep[1], m: R.skinDeep[2], n: R.skinDeep[3], o: R.skinDeep[4],
  E: R.ink[0], g: R.brass[2], G: R.brass[3], L: R.glass[3], M: R.glass[4],
};
const HEAD = [
  '.....abbba...',
  '...abccccba..',
  '..abcdddccba.',
  '.abcddeddcbb.',
  '.agGGgggGGgb.',
  'abgLMgmgLMga.',
  'abcgggngggn..',
  'abcmlnEnnEnl.',
  'abcmlnnnnnnm.',
  'abcmcddddcn..',
  '.abcdcbcdcc..',
  '..abcdddcb...',
  '...abccb.....',
  '....kllk.....',
];
const HEAD_HURT = HEAD.map((r, i) => (i === 7 ? r.replace(/E/g, 'l') : r));

function torso(buf: PixelBuffer, c: RigCtx): void {
  const { sF, sB, hipF, hipB, pose } = c;
  const ch = pose.chest;
  const waistF: Pt = [hipF[0] + 1.5, hipF[1] - 4];
  const waistB: Pt = [hipB[0] - 1, hipB[1] - 4];
  // 붉은 작업 코트 (넓은 몸통)
  poly(buf, [[sB[0] - 2.5, sB[1] - 1], [ch[0] - 1, ch[1] - 2], [sF[0] + 2.5, sF[1] - 1], [waistF[0] + 1.5, waistF[1]], [hipF[0] + 2.5, hipF[1] + 1], [hipB[0] - 2.5, hipB[1] + 1], [waistB[0] - 1.5, waistB[1]]], torsoShader(c, R.rust, 8));
  // 가죽 앞치마
  poly(buf, [[ch[0] - 1, ch[1] + 3], [ch[0] + 5, ch[1] + 3], [hipF[0] + 3, hipF[1] + 2], [hipB[0] + 1, hipB[1] + 2]], torsoShader(c, R.leather, 6, 0, false, 0.05));
  // 황동 가슴판
  poly(buf, [[ch[0] + 0, ch[1] + 3], [ch[0] + 5, ch[1] + 3], [ch[0] + 4.5, ch[1] + 8], [ch[0] + 0.5, ch[1] + 8]], torsoShader(c, R.brass, 5, 0, true));
  buf.set(Math.round(ch[0] + 2), Math.round(ch[1] + 5), R.ember[3]);
  // 충전 셀 벨트
  const hy = Math.round(pose.hip[1]);
  line(buf, hipB[0] - 2, hy - 2, hipF[0] + 3, hy - 2, R.leather[1]);
  line(buf, hipB[0] - 2, hy - 1, hipF[0] + 3, hy - 1, R.leather[2]);
  for (let i = 0; i < 3; i++) {
    const x = Math.round(hipB[0] + i * 3);
    buf.set(x, hy - 2, R.brass[2]);
    buf.set(x, hy - 1, (pose.wx ?? 0) > 0.5 ? R.ember[4] : R.ember[2]);
  }
}

function pauldron(buf: PixelBuffer, c: RigCtx): void {
  const { sF, pose } = c;
  const ax = pose.eF[0] - sF[0], ay = pose.eF[1] - sF[1];
  const l = Math.hypot(ax, ay) || 1;
  const cx = sF[0] + (ax / l) * 1.5, cy = sF[1] + (ay / l) * 1.5 - 0.5;
  ellipse(buf, cx, cy, 3.8, 3.0, rampShader(R.brass, 0, false, -0.3));
  line(buf, cx - 3, cy + 2, cx + 3, cy + 2, R.brass[1]);
  buf.set(Math.round(cx - 1), Math.round(cy - 1), R.brass[4]);
  buf.set(Math.round(cx + 2), Math.round(cy), R.steel[3]);
}

function hammer(buf: PixelBuffer, c: RigCtx): void {
  const p = c.pose;
  const a = ((p.wa ?? -140) * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const [hx, hy] = p.hF;
  // 자루
  rod(buf, hx - dx * 5, hy - dy * 5, hx + dx * 13, hy + dy * 13, R.steel, 2);
  line(buf, hx - dx * 1, hy - dy * 1, hx + dx * 3, hy + dy * 3, R.leather[2]);
  buf.set(Math.round(hx - dx * 6), Math.round(hy - dy * 6), R.brass[3]);
  // 머리 (자루에 수직, 앞쪽 끝은 포구)
  const cx = hx + dx * 17, cy = hy + dy * 17;
  const charged = (p.wx ?? 0) > 0.5;
  rotRect(buf, cx, cy, 8, 16, a, (_x, _y, u, v) => {
    if (v > 0.84) return Math.abs(u) < 0.45 ? R.ink[0] : R.steel[1]; // 포구
    if (Math.abs(v - 0.3) < 0.1) return u < 0 ? R.brass[2] : R.brass[1];
    if (Math.abs(u) < 0.3 && Math.abs(v + 0.1) < 0.14) return charged ? R.ember[4] : R.ember[1];
    if (v < -0.85) return R.steel[2]; // 타격면
    return tone(R.steel, lit(-u * 0.8, -0.3, 0.6) - 0.35, 0, false);
  });
}

export const ORIN: Design = {
  id: 'orin',
  shF: 6, shB: 7, hipHalf: 3.8,
  rUpper: 2.7, rFore: 2.5, rThigh: 3.0, rShin: 2.5,
  skin: R.skinDeep,
  sleeve: R.rust,
  glove: R.steel,
  pants: R.earth,
  boots: R.leather,
  bootH: 0.5,
  sleeveLen: 0.3,
  head: { rows: HEAD, legend: HL, anchor: [5, 13] },
  headHurt: { rows: HEAD_HURT, legend: HL, anchor: [5, 13] },
  torso,
  weapon: hammer,
  frontExtra: pauldron,
};

const K = KAEL_POSES;
const WIDE: Partial<Pose> = { kF: [46, 59], fF: [49, 68], kB: [34, 59], fB: [30, 68] };
const O_BASE: Pose = P(K_BASE, { ...WIDE, hip: [39, 50], chest: [40, 34], eF: [46, 43], hF: [46, 37], wa: -140, wBehind: true, eB: [33, 42], hB: [34, 48] });
const OL: Partial<Pose> = { kF: [50, 60], fF: [54, 68], kB: [36, 61], fB: [28, 68] };
const OS = (o: Partial<Pose>) => P(O_BASE, { wBehind: false, ...o });

export const ORIN_POSES = {
  idle: [
    O_BASE,
    P(O_BASE, { chest: [40, 33], eF: [46, 42], hF: [46, 36], eB: [33, 41], hB: [34, 47] }),
    P(O_BASE, { chest: [40, 33], eF: [46, 42], hF: [46, 36], eB: [33, 41], hB: [34, 47], wx: 1 }),
    O_BASE,
  ],
  attack: [
    OS({ chest: [39, 34], eF: [43, 34], hF: [44, 28], wa: -110, eB: [37, 36], hB: [43, 31], bOver: true }),
    OS({ chest: [38, 34], head: [0, -1], eF: [42, 32], hF: [42, 25], wa: -104, eB: [36, 34], hB: [41, 28], bOver: true, wx: 1 }),
    OS({ ...OL, hip: [41, 51], chest: [44, 35], eF: [49, 33], hF: [53, 31], wa: -30, eB: [44, 36], hB: [50, 33], bOver: true, wx: 1 }),
    OS({ ...OL, hip: [42, 52], chest: [46, 37], head: [2, -1], eF: [51, 40], hF: [55, 44], wa: 48, eB: [47, 41], hB: [52, 43], bOver: true }),
    OS({ ...OL, hip: [42, 52], chest: [46, 38], head: [2, 0], eF: [51, 42], hF: [55, 46], wa: 55, eB: [47, 43], hB: [52, 45], bOver: true }),
    OS({ hip: [40, 50], chest: [42, 35], eF: [47, 42], hF: [49, 46], wa: 30, eB: [40, 42], hB: [45, 46], bOver: true }),
    O_BASE,
  ],
  skill: [
    OS({ hip: [39, 52], chest: [40, 36], eF: [46, 43], hF: [48, 41], wa: -88, eB: [39, 44], hB: [45, 47], bOver: true, kF: [47, 61], fF: [49, 68], kB: [33, 61], fB: [29, 68] }),
    OS({ hip: [39, 52], chest: [40, 36], eF: [46, 43], hF: [48, 41], wa: -88, eB: [39, 44], hB: [45, 47], bOver: true, kF: [47, 61], fF: [49, 68], kB: [33, 61], fB: [29, 68], wx: 1 }),
    OS({ hip: [38, 52], chest: [37, 36], head: [0, -1], eF: [43, 43], hF: [45, 41], wa: -96, eB: [36, 44], hB: [42, 47], bOver: true, kF: [47, 61], fF: [49, 68], kB: [33, 61], fB: [29, 68], wx: 1 }),
    OS({ hip: [38, 52], chest: [37, 36], eF: [43, 43], hF: [45, 41], wa: -98, eB: [36, 44], hB: [42, 47], bOver: true, kF: [47, 61], fF: [49, 68], kB: [33, 61], fB: [29, 68] }),
    OS({ hip: [39, 51], chest: [39, 35], eF: [45, 43], hF: [47, 41], wa: -92, eB: [38, 44], hB: [44, 47], bOver: true }),
    O_BASE,
  ],
  skill2: [
    OS({ hip: [39, 52], chest: [39, 36], eF: [43, 32], hF: [43, 25], wa: -100, eB: [37, 34], hB: [42, 28], bOver: true, kF: [47, 61], fF: [49, 68], kB: [33, 61], fB: [29, 68] }),
    OS({ hip: [40, 48], chest: [40, 32], head: [1, -2], eF: [43, 28], hF: [43, 20], wa: -98, eB: [37, 30], hB: [42, 23], bOver: true, wx: 1 }),
    OS({ ...OL, hip: [42, 52], chest: [46, 36], eF: [50, 34], hF: [54, 33], wa: 10, eB: [45, 37], hB: [51, 35], bOver: true, wx: 1 }),
    OS({ ...OL, hip: [43, 55], chest: [47, 41], head: [2, 0], eF: [51, 47], hF: [54, 52], wa: 72, eB: [47, 47], hB: [51, 51], bOver: true, kF: [51, 62], fF: [54, 68], kB: [37, 64], fB: [29, 68] }),
    OS({ ...OL, hip: [43, 55], chest: [47, 41], head: [2, 0], eF: [51, 47], hF: [54, 52], wa: 72, eB: [47, 47], hB: [51, 51], bOver: true, kF: [51, 62], fF: [54, 68], kB: [37, 64], fB: [29, 68] }),
    OS({ hip: [40, 51], chest: [42, 37], eF: [47, 44], hF: [50, 48], wa: 50, eB: [40, 44], hB: [45, 48], bOver: true }),
    O_BASE,
  ],
  support: [
    OS({ eF: [46, 42], hF: [49, 45], wa: 86, eB: [41, 42], hB: [47, 44], bOver: true }),
    OS({ chest: [40, 33], eF: [46, 41], hF: [49, 44], wa: 88, eB: [41, 41], hB: [47, 43], bOver: true, wx: 1 }),
    OS({ chest: [40, 33], eF: [46, 41], hF: [49, 44], wa: 88, eB: [41, 41], hB: [47, 43], bOver: true, wx: 1 }),
    OS({ eF: [46, 43], hF: [48, 40], wa: -100 }),
    O_BASE,
  ],
  dodge: K.dodge.map((p) => P(p, { ...{ kF: [p.kF[0] + 1, p.kF[1]], kB: [p.kB[0] - 1, p.kB[1]] }, eF: [p.chest[0] + 6, p.chest[1] + 9], hF: [p.chest[0] + 7, p.chest[1] + 5], wa: -120, eB: [p.chest[0] - 6, p.chest[1] + 8], hB: [p.chest[0] - 6, p.chest[1] + 14] })),
  parry: [
    OS({ hip: [39, 51], chest: [41, 35], eF: [46, 43], hF: [47, 39], wa: -82, eB: [40, 43], hB: [45, 45], bOver: true, kF: [46, 60], fF: [49, 68], kB: [34, 60], fB: [29, 68] }),
    OS({ hip: [38, 51], chest: [40, 36], eF: [45, 44], hF: [46, 40], wa: -76, eB: [39, 44], hB: [44, 46], bOver: true, kF: [46, 60], fF: [49, 68], kB: [34, 60], fB: [29, 68] }),
    OS({ hip: [38, 51], chest: [40, 36], eF: [45, 44], hF: [46, 40], wa: -76, eB: [39, 44], hB: [44, 46], bOver: true, kF: [46, 60], fF: [49, 68], kB: [34, 60], fB: [29, 68] }),
    O_BASE,
  ],
  counter: [
    OS({ hip: [38, 53], chest: [38, 38], eF: [40, 45], hF: [37, 50], wa: 150, eB: [34, 45], hB: [33, 50], kF: [46, 61], fF: [48, 68], kB: [33, 61], fB: [30, 68] }),
    OS({ ...OL, hip: [41, 52], chest: [43, 37], eF: [47, 44], hF: [51, 47], wa: 30, eB: [42, 44], hB: [48, 47], bOver: true }),
    OS({ ...OL, hip: [42, 50], chest: [45, 34], head: [2, -2], eF: [50, 34], hF: [53, 30], wa: -45, eB: [45, 36], hB: [50, 33], bOver: true, wx: 1 }),
    OS({ hip: [42, 49], chest: [44, 33], head: [1, -2], eF: [47, 28], hF: [47, 21], wa: -95, eB: [41, 30], hB: [45, 24], bOver: true, wx: 1, kF: [47, 59], fF: [50, 68], kB: [36, 59], fB: [33, 68], toeB: 0 }),
    OS({ ...OL, hip: [43, 54], chest: [47, 40], head: [2, 0], eF: [51, 46], hF: [54, 51], wa: 70, eB: [47, 46], hB: [51, 50], bOver: true }),
    OS({ ...OL, hip: [43, 54], chest: [47, 40], head: [2, 0], eF: [51, 46], hF: [54, 51], wa: 70, eB: [47, 46], hB: [51, 50], bOver: true }),
    OS({ hip: [40, 51], chest: [42, 37], eF: [47, 44], hF: [50, 48], wa: 50, eB: [40, 44], hB: [45, 48], bOver: true }),
    O_BASE,
  ],
  jump: K.jump.map((p) => P(p, { kF: [p.kF[0] + 1, p.kF[1]], eF: [p.chest[0] + 6, p.chest[1] + 9], hF: [p.chest[0] + 6, p.chest[1] + 4], wa: -135, wBehind: true, eB: [p.chest[0] - 6, p.chest[1] + 8], hB: [p.chest[0] - 7, p.chest[1] + 13] })),
  hurt: [
    OS({ hip: [38, 51], chest: [36, 36], head: [-1, 0], headV: 'hurt', eF: [42, 42], hF: [44, 36], wa: -130, wBehind: true, eB: [30, 41], hB: [27, 44], kB: [33, 60], fB: [30, 68] }),
    OS({ hip: [38, 51], chest: [37, 36], head: [0, 0], headV: 'hurt', eF: [43, 43], hF: [45, 37], wa: -135, wBehind: true, eB: [31, 42], hB: [28, 46] }),
    P(O_BASE, { chest: [39, 35] }),
  ],
  stagger: K.stagger.map((p) => P(p, { ...WIDE, hip: [39, 52], chest: [p.chest[0], p.chest[1] + 1], eF: [p.chest[0] + 4, p.chest[1] + 8], hF: [p.chest[0] + 7, p.chest[1] + 12], wa: 75, eB: [p.chest[0] - 3, p.chest[1] + 8], hB: [p.chest[0] - 2, p.chest[1] + 14] })),
  victory: [
    O_BASE,
    OS({ chest: [40, 33], eF: [45, 32], hF: [46, 26], wa: -92, eB: [34, 40], hB: [31, 36] }),
    OS({ chest: [40, 32], eF: [45, 30], hF: [46, 23], wa: -92, eB: [34, 39], hB: [30, 34], wx: 1 }),
    OS({ chest: [40, 32], eF: [45, 30], hF: [46, 23], wa: -92, eB: [34, 39], hB: [30, 34], wx: 1 }),
    O_BASE,
  ],
  defeat: K.defeat.map((p, i) => P(p, { kF: [p.kF[0] + 1, p.kF[1]], eF: [p.chest[0] + 5, p.chest[1] + 7], hF: [p.chest[0] + 8, p.chest[1] + 10], wa: i === 0 ? -120 : 62, eB: [p.chest[0] - 4, p.chest[1] + 8], hB: [p.chest[0] - 2, p.chest[1] + 13] })),
  aim: [
    OS({ hip: [39, 51], chest: [40, 35], eF: [46, 43], hF: [48, 41], wa: -88, eB: [39, 44], hB: [45, 47], bOver: true }),
    OS({ hip: [39, 51], chest: [40, 34], eF: [46, 42], hF: [48, 40], wa: -88, eB: [39, 43], hB: [45, 46], bOver: true, wx: 1 }),
    OS({ hip: [39, 51], chest: [40, 35], eF: [46, 43], hF: [48, 41], wa: -88, eB: [39, 44], hB: [45, 47], bOver: true }),
  ],
} satisfies Record<string, Pose[]>;
