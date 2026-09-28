import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { poly, ellipse, rampShader, line, tone, lit, Pt, capsule } from '../core/draw';
import { Design, Pose, RigCtx, blade, torsoShader } from './rig';

/* 카엘 — 피난처의 견습 수호기사. 짧게 뻗친 남색 머리, 강철 흉갑, 남색 망토, 한손 장검. */

const HL = {
  a: R.hairKael[0], b: R.hairKael[1], c: R.hairKael[2], d: R.hairKael[3], e: R.hairKael[4],
  k: R.skin[0], l: R.skin[1], m: R.skin[2], n: R.skin[3], o: R.skin[4],
  E: R.ink[0], W: R.bone[4],
};

const HEAD = [
  '....abbba...',
  '..abccccdba.',
  '.abccdddddcb',
  'abcdddeeddcb',
  'abcdddddcbcb',
  'abccccbcccb.',
  'abcbbnnbnnb.',
  'abblmnEnnEm.',
  'abblmnEnnEnl',
  '.abllmnnnnm.',
  '..alllmnlnm.',
  '...kllmmml..',
  '....klll....',
];
const HEAD_HURT = HEAD.map((r, i) => (i === 7 ? r.replace(/E/g, 'n') : i === 8 ? r.replace(/E/g, 'l') : r));

function torso(buf: PixelBuffer, c: RigCtx): void {
  const { sF, sB, hipF, hipB, pose } = c;
  const ch = pose.chest;
  const waistF: Pt = [hipF[0] + 1, hipF[1] - 4];
  const waistB: Pt = [hipB[0] - 0.5, hipB[1] - 4];
  // 남색 튜닉
  poly(buf, [[sB[0] - 2, sB[1] - 1], [ch[0] - 1, ch[1] - 1], [sF[0] + 2, sF[1] - 1], [waistF[0] + 1, waistF[1]], [hipF[0] + 2, hipF[1] + 1], [hipB[0] - 2, hipB[1] + 1], [waistB[0] - 1, waistB[1]]], torsoShader(c, R.blue, 7));
  // 강철 흉갑 (가슴~허리 위)
  const cuB: Pt = [waistB[0] + 0.5, waistB[1] - 1];
  const cuF: Pt = [waistF[0] + 0.5, waistF[1] - 1];
  poly(buf, [[sB[0] - 1, sB[1]], [ch[0] - 1, ch[1] + 1], [ch[0] + 2, ch[1] + 1], [sF[0] + 2, sF[1] + 1], [cuF[0] + 1, cuF[1]], [cuB[0] - 1, cuB[1]]], torsoShader(c, R.steel, 6, 0, false, -0.32));
  // 흉갑 아래 황동 테
  line(buf, cuB[0] - 1, cuB[1], cuF[0] + 1, cuF[1], R.brass[2]);
  line(buf, cuB[0], cuB[1] - 1, cuF[0], cuF[1] - 1, R.steel[1]);
  // 옷깃
  line(buf, ch[0] - 1, ch[1], ch[0] + 2, ch[1], R.blue[3]);
  // 흉갑 중앙 능선 하이라이트
  line(buf, ch[0] - 1, ch[1] + 3, ch[0] - 1 + (cuB[0] - ch[0]) * 0.2, cuB[1] - 3, R.steel[4]);
}

function pelvis(buf: PixelBuffer, c: RigCtx): void {
  const { hipF, hipB, pose } = c;
  const hy = Math.round(pose.hip[1]);
  // 벨트
  line(buf, hipB[0] - 2, hy - 2, hipF[0] + 2, hy - 2, R.leather[2]);
  line(buf, hipB[0] - 2, hy - 1, hipF[0] + 2, hy - 1, R.leather[1]);
  buf.set(Math.round(pose.hip[0] + 1), hy - 2, R.brass[3]);
  buf.set(Math.round(pose.hip[0] + 2), hy - 2, R.brass[2]);
  buf.set(Math.round(pose.hip[0] + 1), hy - 1, R.brass[2]);
  // 튜닉 앞자락 (허벅지 방향을 따라감)
  const kF = pose.kF, kB = pose.kB;
  const fl: Pt = [hipF[0] + (kF[0] - hipF[0]) * 0.55, hipF[1] + (kF[1] - hipF[1]) * 0.55];
  const bl: Pt = [hipB[0] + (kB[0] - hipB[0]) * 0.5, hipB[1] + (kB[1] - hipB[1]) * 0.5];
  poly(buf, [[hipB[0] - 2.5, hy], [hipF[0] + 2.5, hy], [fl[0] + 2.5, fl[1]], [fl[0] - 1, fl[1] + 1], [pose.hip[0], hy + 3], [bl[0] + 1, bl[1] + 1], [bl[0] - 2.5, bl[1]]], (x, y) => {
    const v = (y - hy) / 6;
    return tone(R.blue, lit(0, -0.2 + v * 0.3, 0.9) - (x === Math.round(pose.hip[0]) ? 0.4 : 0), 0);
  });
}

function cape(buf: PixelBuffer, c: RigCtx): void {
  const { sB, pose } = c;
  const f = pose.flow ?? 0;
  const ch = pose.chest, hp = pose.hip;
  const pts: Pt[] = [
    [ch[0] - 1, ch[1]],
    [sB[0] - 1, sB[1] - 1],
    [sB[0] - 4 - f, sB[1] + 7],
    [hp[0] - 10 - f * 2, hp[1] + 10],
    [hp[0] - 11 - f * 3, hp[1] + 15],
    [hp[0] - 7 - f * 2, hp[1] + 16],
    [hp[0] - 4 - f, hp[1] + 14],
    [hp[0] - 1, hp[1] + 4],
  ];
  poly(buf, pts, (x, y) => {
    const u = (x - (hp[0] - 6)) / 7;
    let I = lit(u * 0.6, -0.2, 0.75);
    // 주름: 결정적 위치의 세로 골
    const fold1 = Math.round(hp[0] - 7 - f * 1.5 + (y - hp[1]) * 0.25);
    if (y > hp[1] + 2 && (x === fold1)) I -= 0.55;
    return tone(R.blue, I, -1);
  });
  // 안감 (황동색 테두리 대신 짙은 붉은 안감을 아래쪽에 살짝)
  line(buf, hp[0] - 11 - f * 3, hp[1] + 15, hp[0] - 7 - f * 2, hp[1] + 16, R.rust[2]);
}

function sword(buf: PixelBuffer, c: RigCtx): void {
  const p = c.pose;
  const a = ((p.wa ?? -60) * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const [hx, hy] = p.hF;
  // 손잡이 + 폼멜
  line(buf, hx - dx * 2, hy - dy * 2, hx + dx * 1, hy + dy * 1, R.leather[2]);
  buf.set(Math.round(hx - dx * 3), Math.round(hy - dy * 3), R.brass[3]);
  // 가드
  const gx = hx + dx * 2.2, gy = hy + dy * 2.2;
  const px = -dy, py = dx;
  line(buf, gx - px * 2.6, gy - py * 2.6, gx + px * 2.6, gy + py * 2.6, R.brass[3]);
  buf.set(Math.round(gx), Math.round(gy), R.brass[4]);
  // 날
  blade(buf, gx + dx * 1.2, gy + dy * 1.2, a, 24, R.steel);
}

function pauldron(buf: PixelBuffer, c: RigCtx): void {
  const { sF, pose } = c;
  const ax = pose.eF[0] - sF[0], ay = pose.eF[1] - sF[1];
  const l = Math.hypot(ax, ay) || 1;
  const cx = sF[0] + (ax / l) * 1.2, cy = sF[1] + (ay / l) * 1.2 - 0.5;
  ellipse(buf, cx, cy, 3.2, 2.6, rampShader(R.steel, 0, true));
  buf.set(Math.round(cx - 1), Math.round(cy - 1), R.steel[4]);
  line(buf, cx - 2, cy + 2, cx + 2, cy + 2, R.brass[2]);
}

export const KAEL: Design = {
  id: 'kael',
  shF: 5, shB: 6, hipHalf: 3.2,
  rUpper: 2.2, rFore: 1.9, rThigh: 2.6, rShin: 2.0,
  skin: R.skin,
  sleeve: R.blue,
  glove: R.leather,
  pants: R.stone,
  boots: R.leather,
  bootH: 0.45,
  sleeveLen: 0.35,
  head: { rows: HEAD, legend: HL, anchor: [5, 12] },
  headHurt: { rows: HEAD_HURT, legend: HL, anchor: [5, 12] },
  torso,
  pelvis,
  behind: cape,
  weapon: sword,
  frontExtra: pauldron,
};

/* ---------------- 포즈 블루프린트 ---------------- */

type PP = Partial<Pose>;
export function P(base: Pose, o: PP): Pose {
  return { ...base, ...o };
}

export const K_BASE: Pose = {
  hip: [39, 49], chest: [40, 33], head: [1, -1],
  kF: [44, 59], fF: [46, 68], kB: [35, 59], fB: [32, 68],
  eF: [47, 41], hF: [50, 45], wa: -62,
  eB: [33, 41], hB: [34, 47],
  flow: 0,
};

const LUNGE: PP = { kF: [49, 60], fF: [52, 68], kB: [36, 60], fB: [28, 68] };
const CROUCH: PP = { hip: [39, 52], kF: [46, 61], fF: [47, 68], kB: [34, 61], fB: [31, 68] };

export const KAEL_POSES = {
  idle: [
    K_BASE,
    P(K_BASE, { chest: [40, 32], eF: [47, 40], hF: [50, 44], eB: [33, 40], hB: [34, 46], flow: 0.5 }),
    P(K_BASE, { chest: [40, 32], eF: [47, 40], hF: [50, 44], eB: [33, 40], hB: [34, 46], flow: 1 }),
    P(K_BASE, { flow: 0.5 }),
  ],
  attack: [
    P(K_BASE, { hip: [38, 49], chest: [37, 34], eF: [41, 37], hF: [38, 31], wa: -150, eB: [35, 42], hB: [38, 46], kF: [44, 59], fF: [47, 68], kB: [34, 59], fB: [31, 68] }),
    P(K_BASE, { hip: [38, 49], chest: [36, 34], head: [0, -1], eF: [40, 36], hF: [36, 29], wa: -160, eB: [35, 42], hB: [38, 46], kF: [44, 59], fF: [47, 68], kB: [34, 59], fB: [31, 68], flow: 0.5 }),
    P(K_BASE, { ...LUNGE, hip: [41, 50], chest: [44, 35], eF: [48, 34], hF: [52, 31], wa: -35, eB: [38, 42], hB: [36, 47], flow: 1.5 }),
    P(K_BASE, { ...LUNGE, hip: [42, 50], chest: [46, 36], head: [2, -1], eF: [51, 39], hF: [56, 41], wa: 8, eB: [39, 43], hB: [35, 47], flow: 2 }),
    P(K_BASE, { ...LUNGE, hip: [42, 50], chest: [46, 37], head: [2, -1], eF: [50, 43], hF: [53, 49], wa: 70, eB: [39, 43], hB: [35, 47], flow: 2 }),
    P(K_BASE, { hip: [40, 49], chest: [43, 35], eF: [48, 42], hF: [51, 46], wa: -20, kF: [46, 59], fF: [48, 68], kB: [35, 59], fB: [31, 68], flow: 1 }),
    P(K_BASE, { flow: 0.5 }),
  ],
  skill: [
    P(K_BASE, { ...CROUCH, hip: [39, 50], chest: [38, 35], eF: [42, 28], hF: [42, 22], wa: -100, eB: [36, 29], hB: [41, 23] }),
    P(K_BASE, { ...CROUCH, hip: [39, 50], chest: [38, 34], eF: [41, 27], hF: [41, 20], wa: -106, eB: [35, 28], hB: [40, 21], flow: 0.5 }),
    P(K_BASE, { hip: [42, 49], chest: [45, 34], kF: [49, 59], fF: [52, 68], kB: [36, 60], fB: [30, 68], eF: [48, 28], hF: [53, 25], wa: -45, eB: [44, 30], hB: [51, 26], flow: 1.5 }),
    P(K_BASE, { hip: [43, 51], chest: [47, 37], head: [2, -1], kF: [50, 60], fF: [54, 68], kB: [37, 61], fB: [29, 68], eF: [52, 40], hF: [57, 45], wa: 35, eB: [48, 41], hB: [55, 45], flow: 2.5 }),
    P(K_BASE, { hip: [43, 52], chest: [47, 39], head: [2, 0], kF: [50, 61], fF: [54, 68], kB: [37, 62], fB: [29, 68], eF: [51, 45], hF: [56, 50], wa: 60, eB: [48, 45], hB: [54, 50], flow: 2.5 }),
    P(K_BASE, { hip: [41, 50], chest: [44, 36], eF: [48, 43], hF: [51, 47], wa: 10, kF: [47, 60], fF: [49, 68], kB: [35, 60], fB: [31, 68], flow: 1.5 }),
    P(K_BASE, { flow: 0.5 }),
  ],
  skill2: [
    P(K_BASE, { chest: [41, 34], eF: [44, 41], hF: [42, 46], wa: 172 }),
    P(K_BASE, { ...LUNGE, hip: [41, 50], chest: [45, 35], eF: [50, 38], hF: [55, 38], wa: -4, flow: 1.5 }),
    P(K_BASE, { ...LUNGE, hip: [41, 50], chest: [45, 34], eF: [50, 35], hF: [53, 30], wa: -80, flow: 1.5 }),
    P(K_BASE, { ...LUNGE, hip: [42, 50], chest: [46, 36], head: [2, -1], eF: [51, 40], hF: [55, 44], wa: 45, flow: 2 }),
    P(K_BASE, { ...LUNGE, hip: [41, 51], chest: [45, 37], eF: [49, 43], hF: [50, 48], wa: 125, flow: 2 }),
    P(K_BASE, { ...LUNGE, hip: [42, 49], chest: [46, 34], head: [2, -2], eF: [50, 33], hF: [54, 28], wa: -62, flow: 2 }),
    P(K_BASE, { flow: 1 }),
  ],
  support: [
    P(K_BASE, { eF: [45, 38], hF: [46, 33], wa: -90, eB: [36, 40], hB: [41, 36] }),
    P(K_BASE, { chest: [40, 32], eF: [45, 37], hF: [46, 31], wa: -90, eB: [36, 39], hB: [41, 35], flow: 0.5 }),
    P(K_BASE, { chest: [40, 32], eF: [45, 37], hF: [46, 31], wa: -90, eB: [36, 39], hB: [41, 35], flow: 1 }),
    P(K_BASE, { eF: [46, 40], hF: [49, 38], wa: -75, flow: 0.5 }),
    K_BASE,
  ],
  dodge: [
    P(K_BASE, { hip: [38, 51], chest: [36, 37], head: [0, -1], kF: [45, 61], fF: [47, 68], kB: [34, 61], fB: [31, 68], eF: [44, 41], hF: [47, 44], wa: -30, eB: [31, 43], hB: [29, 47], flow: -1 }),
    P(K_BASE, { hip: [35, 52], chest: [32, 38], head: [0, -1], kF: [42, 61], fF: [46, 68], kB: [31, 61], fB: [26, 68], eF: [40, 42], hF: [44, 44], wa: -20, eB: [28, 44], hB: [26, 48], flow: -2 }),
    P(K_BASE, { hip: [35, 52], chest: [33, 38], head: [0, -1], kF: [42, 61], fF: [46, 68], kB: [31, 61], fB: [26, 68], eF: [41, 42], hF: [45, 44], wa: -25, eB: [29, 44], hB: [27, 48], flow: -1.5 }),
    P(K_BASE, { hip: [37, 50], chest: [37, 35], kF: [44, 60], fF: [46, 68], kB: [33, 60], fB: [30, 68], eF: [45, 41], hF: [48, 44], wa: -45, flow: -0.5 }),
    K_BASE,
  ],
  parry: [
    P(K_BASE, { hip: [39, 50], chest: [41, 34], kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], eF: [46, 37], hF: [49, 33], wa: -78, eB: [36, 40], hB: [40, 38] }),
    P(K_BASE, { hip: [38, 50], chest: [40, 35], kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], eF: [45, 38], hF: [48, 35], wa: -68, eB: [35, 41], hB: [39, 39], flow: -1 }),
    P(K_BASE, { hip: [38, 50], chest: [40, 35], kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], eF: [45, 38], hF: [48, 35], wa: -68, eB: [35, 41], hB: [39, 39], flow: -0.5 }),
    K_BASE,
  ],
  counter: [
    P(K_BASE, { ...CROUCH, chest: [38, 37], eF: [40, 43], hF: [36, 47], wa: 165, eB: [34, 43], hB: [31, 47] }),
    P(K_BASE, { ...LUNGE, hip: [41, 50], chest: [44, 35], eF: [46, 39], hF: [51, 41], wa: 20, flow: 1.5 }),
    P(K_BASE, { ...LUNGE, hip: [42, 49], chest: [45, 33], head: [2, -2], eF: [49, 31], hF: [53, 26], wa: -70, eB: [40, 38], hB: [37, 43], flow: 2 }),
    P(K_BASE, { hip: [42, 48], chest: [45, 32], head: [2, -2], kF: [47, 58], fF: [50, 68], kB: [37, 58], fB: [34, 68], toeB: 0, eF: [48, 26], hF: [50, 20], wa: -95, eB: [42, 28], hB: [48, 21], flow: 2.5 }),
    P(K_BASE, { ...LUNGE, hip: [43, 51], chest: [47, 38], head: [2, -1], eF: [52, 41], hF: [57, 46], wa: 45, eB: [48, 42], hB: [55, 46], flow: 3 }),
    P(K_BASE, { ...LUNGE, hip: [43, 52], chest: [47, 39], head: [2, 0], eF: [51, 45], hF: [56, 50], wa: 62, eB: [48, 45], hB: [54, 50], flow: 2.5 }),
    P(K_BASE, { hip: [41, 50], chest: [44, 36], eF: [48, 43], hF: [51, 47], wa: 10, kF: [47, 60], fF: [49, 68], kB: [35, 60], fB: [31, 68], flow: 1.5 }),
    P(K_BASE, { flow: 0.5 }),
  ],
  jump: [
    P(K_BASE, { hip: [39, 53], chest: [40, 38], kF: [45, 61], fF: [46, 68], kB: [34, 61], fB: [32, 68], eF: [45, 45], hF: [48, 49], wa: -30, eB: [34, 45], hB: [31, 49] }),
    P(K_BASE, { hip: [39, 40], chest: [40, 24], kF: [42, 50], fF: [43, 59], kB: [36, 50], fB: [35, 59], toeF: 0, toeB: 0, eF: [46, 31], hF: [49, 34], wa: -55, eB: [34, 30], hB: [31, 27], flow: -2 }),
    P(K_BASE, { hip: [39, 34], chest: [40, 18], kF: [45, 39], fF: [43, 46], kB: [37, 40], fB: [35, 47], eF: [46, 25], hF: [50, 27], wa: -40, eB: [34, 25], hB: [31, 22], flow: -2.5 }),
    P(K_BASE, { hip: [39, 38], chest: [40, 22], kF: [43, 48], fF: [45, 57], kB: [36, 48], fB: [34, 57], toeF: 0, toeB: 0, eF: [46, 29], hF: [49, 32], wa: -50, eB: [34, 28], hB: [31, 30], flow: -1 }),
    P(K_BASE, { hip: [39, 53], chest: [40, 38], kF: [45, 61], fF: [46, 68], kB: [34, 61], fB: [32, 68], eF: [45, 45], hF: [48, 49], wa: -30, eB: [34, 45], hB: [31, 49], flow: 1 }),
    K_BASE,
  ],
  hurt: [
    P(K_BASE, { hip: [38, 50], chest: [35, 35], head: [-1, 0], headV: 'hurt', eF: [41, 37], hF: [45, 33], wa: -110, eB: [30, 39], hB: [27, 42], kB: [34, 60], fB: [31, 68], flow: -2 }),
    P(K_BASE, { hip: [38, 50], chest: [36, 35], head: [0, 0], headV: 'hurt', eF: [42, 38], hF: [46, 36], wa: -90, eB: [31, 40], hB: [28, 44], flow: -1.5 }),
    P(K_BASE, { chest: [39, 34], eF: [46, 41], hF: [49, 44], wa: -60, flow: -0.5 }),
  ],
  stagger: [
    P(K_BASE, { hip: [39, 51], chest: [42, 39], head: [2, 0], headV: 'hurt', kF: [44, 61], fF: [46, 68], kB: [34, 61], fB: [32, 68], eF: [45, 45], hF: [46, 51], wa: 48, eB: [37, 46], hB: [38, 52] }),
    P(K_BASE, { hip: [39, 51], chest: [41, 39], head: [2, 1], headV: 'hurt', kF: [44, 61], fF: [46, 68], kB: [34, 61], fB: [32, 68], eF: [44, 45], hF: [45, 51], wa: 46, eB: [36, 46], hB: [37, 52], flow: 0.5 }),
    P(K_BASE, { hip: [38, 51], chest: [40, 39], head: [1, 0], headV: 'hurt', kF: [44, 61], fF: [46, 68], kB: [34, 61], fB: [32, 68], eF: [43, 45], hF: [44, 51], wa: 44, eB: [35, 46], hB: [36, 52], flow: 1 }),
    P(K_BASE, { hip: [39, 51], chest: [41, 39], head: [2, 1], headV: 'hurt', kF: [44, 61], fF: [46, 68], kB: [34, 61], fB: [32, 68], eF: [44, 45], hF: [45, 51], wa: 46, eB: [36, 46], hB: [37, 52], flow: 0.5 }),
  ],
  victory: [
    K_BASE,
    P(K_BASE, { chest: [40, 32], eF: [45, 32], hF: [47, 26], wa: -88, eB: [34, 39], hB: [36, 45], flow: 1 }),
    P(K_BASE, { chest: [40, 32], eF: [45, 30], hF: [47, 23], wa: -90, eB: [34, 39], hB: [36, 45], flow: 1.5 }),
    P(K_BASE, { chest: [40, 32], eF: [45, 30], hF: [47, 23], wa: -90, eB: [34, 39], hB: [36, 45], flow: 0.5 }),
    P(K_BASE, { eF: [46, 39], hF: [44, 34], wa: -152, eB: [34, 41], hB: [37, 46], flow: 0.5 }),
  ],
  defeat: [
    P(K_BASE, { hip: [38, 50], chest: [36, 35], head: [0, 0], headV: 'hurt', eF: [41, 38], hF: [45, 35], wa: -100, eB: [30, 40], hB: [28, 44], flow: -2 }),
    P(K_BASE, { hip: [39, 54], chest: [41, 39], head: [2, 0], headV: 'hurt', kF: [46, 60], fF: [48, 68], kB: [36, 64], fB: [31, 68], toeB: -1, eF: [46, 46], hF: [49, 50], wa: 42, eB: [37, 46], hB: [39, 51], flow: 0 }),
    P(K_BASE, { hip: [39, 56], chest: [41, 41], head: [2, 1], headV: 'hurt', kF: [46, 60], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [46, 48], hF: [49, 52], wa: 42, eB: [37, 48], hB: [40, 53], flow: 0.5 }),
    P(K_BASE, { hip: [39, 57], chest: [42, 43], head: [2, 1], headV: 'hurt', kF: [46, 61], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [46, 50], hF: [49, 54], wa: 40, eB: [38, 50], hB: [41, 56], flow: 1 }),
    P(K_BASE, { hip: [39, 58], chest: [43, 45], head: [2, 2], headV: 'hurt', kF: [46, 62], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [47, 52], hF: [50, 57], wa: 38, eB: [39, 52], hB: [42, 58], flow: 0.5 }),
    P(K_BASE, { hip: [39, 58], chest: [43, 45], head: [2, 2], headV: 'hurt', kF: [46, 62], fF: [48, 68], kB: [36, 66], fB: [30, 68], toeB: -1, eF: [47, 52], hF: [50, 57], wa: 38, eB: [39, 52], hB: [42, 58], flow: 0 }),
  ],
  aim: [
    P(K_BASE, { chest: [41, 34], eF: [48, 37], hF: [53, 36], wa: -2, eB: [35, 40], hB: [39, 43] }),
    P(K_BASE, { chest: [41, 33], eF: [48, 36], hF: [53, 35], wa: -2, eB: [35, 39], hB: [39, 42], flow: 0.5 }),
    P(K_BASE, { chest: [41, 34], eF: [48, 37], hF: [53, 36], wa: -2, eB: [35, 40], hB: [39, 43], flow: 1 }),
  ],
} satisfies Record<string, Pose[]>;
