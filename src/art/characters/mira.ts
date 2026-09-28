import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { poly, ellipse, rampShader, line, tone, lit, Pt } from '../core/draw';
import { Design, Pose, RigCtx, rod, torsoShader } from './rig';
import { KAEL_POSES, K_BASE, P } from './kael';

/* 미라 — 원소 인장 연구자. 챙 넓은 뾰족 모자, 청록 긴 코트, 수정 지팡이. */

const HL = {
  a: R.hairMira[0], b: R.hairMira[1], c: R.hairMira[2], d: R.hairMira[3], e: R.hairMira[4],
  k: R.skin[0], l: R.skin[1], m: R.skin[2], n: R.skin[3], o: R.skin[4],
  E: R.ink[0],
};
const HEAD = [
  '....abbba...',
  '..abcccccba.',
  '.abccdddccba',
  'abcdddeddccb',
  'abcddcccdcbb',
  'abccbnnnbccb',
  'abcbmnnnnbcb',
  'abcbmnEnnEb.',
  'abcblnEnnEnl',
  'abcbllnnnnm.',
  'abcb.lmnlnm.',
  '.ab..kllml..',
  '.a...klll...',
];
const HEAD_HURT = HEAD.map((r, i) => (i === 7 ? r.replace(/E/g, 'n') : i === 8 ? r.replace(/E/g, 'l') : r));

function hat(buf: PixelBuffer, c: RigCtx): void {
  const [nx, ny] = c.neck;
  const top = Math.round(ny - 12);
  const cx = Math.round(nx + 0.5);
  const f = c.pose.flow ?? 0;
  // 원뿔 (뒤로 꺾인 끝)
  const cone: Pt[] = [
    [cx - 5, top + 3], [cx + 5, top + 3], [cx + 3, top - 2], [cx + 0, top - 6],
    [cx - 4 - f * 0.5, top - 10], [cx - 8 - f, top - 9], [cx - 5 - f * 0.5, top - 7], [cx - 3, top - 3],
  ];
  poly(buf, cone, (x, y) => {
    const u = (x - cx) / 5;
    let I = lit(u * 0.7, -0.4 + (y - top) * 0.05, 0.7);
    if (y === top + 1 || y === top + 2) return R.brass[y === top + 1 ? 3 : 2];
    return tone(R.plum, I, 0);
  });
  // 챙: 가장자리가 살짝 처짐
  const brim: Pt[] = [
    [cx - 10, top + 5], [cx - 6, top + 3], [cx + 7, top + 3], [cx + 11, top + 5],
    [cx + 10, top + 6], [cx + 3, top + 5], [cx - 4, top + 5], [cx - 9, top + 6],
  ];
  poly(buf, brim, (x, y) => (y <= top + 3 ? R.plum[3] : y === top + 4 ? R.plum[2] : R.plum[1]));
  // 모자 장식 깃털 (조류색)
  buf.set(cx - 5, top + 1, R.tide[3]);
  buf.set(cx - 6, top, R.tide[4]);
  buf.set(cx - 7, top, R.tide[3]);
}

function torso(buf: PixelBuffer, c: RigCtx): void {
  const { sF, sB, hipF, hipB, pose } = c;
  const ch = pose.chest;
  const waistF: Pt = [hipF[0] + 0.5, hipF[1] - 4];
  const waistB: Pt = [hipB[0], hipB[1] - 4];
  poly(buf, [[sB[0] - 1.5, sB[1] - 1], [ch[0] - 1, ch[1] - 1], [sF[0] + 1.5, sF[1] - 1], [waistF[0] + 0.5, waistF[1]], [hipF[0] + 1.5, hipF[1] + 1], [hipB[0] - 1.5, hipB[1] + 1], [waistB[0] - 0.5, waistB[1]]], torsoShader(c, R.teal, 6));
  // 크림색 안감 셔츠 (앞섶 V자)
  poly(buf, [[ch[0] + 0, ch[1]], [ch[0] + 4, ch[1]], [ch[0] + 2.5, ch[1] + 6]], (x, y) => (y < ch[1] + 2 ? R.bone[4] : R.bone[3]));
  // 자주색 허리띠
  const wy = Math.round(waistB[1] + 1);
  line(buf, waistB[0] - 1, wy, waistF[0] + 1, wy + (waistF[1] - waistB[1]), R.plum[3]);
  line(buf, waistB[0] - 1, wy + 1, waistF[0] + 1, wy + 1 + (waistF[1] - waistB[1]), R.plum[2]);
  // 황동 단추
  buf.set(Math.round(ch[0] + 3), Math.round(ch[1] + 8), R.brass[3]);
  buf.set(Math.round(ch[0] + 3), Math.round(ch[1] + 11), R.brass[3]);
}

/** 긴 코트 자락: 다리 앞을 덮고, 두 다리 사이가 갈라진다 */
function coat(buf: PixelBuffer, c: RigCtx): void {
  const { hipF, hipB, pose } = c;
  const hy = pose.hip[1];
  const f = pose.flow ?? 0;
  const kF = pose.kF, kB = pose.kB;
  const mid: Pt = [(kF[0] + kB[0]) / 2, (kF[1] + kB[1]) / 2 + 1];
  const pts: Pt[] = [
    [hipB[0] - 2.5, hy - 2], [hipF[0] + 2.5, hy - 2],
    [kF[0] + 3.5, kF[1] + 3], [kF[0] + 1, kF[1] + 5],
    [mid[0], mid[1] - 2],
    [kB[0] - 1, kB[1] + 5], [kB[0] - 4 - f, kB[1] + 6], [hipB[0] - 4 - f * 0.5, hy + 5],
  ];
  poly(buf, pts, (x, y) => {
    const v = (y - hy) / 14;
    const u = (x - pose.hip[0]) / 6;
    let I = lit(u * 0.5, -0.1 + v * 0.3, 0.8);
    // 앞섶 트임선
    if (Math.abs(x - Math.round(pose.hip[0] + 2 + (y - hy) * 0.15)) < 0.5 && y > hy) I -= 0.6;
    return tone(R.teal, I, 0);
  });
  // 밑단 장식선 (황동)
  line(buf, kF[0] + 3, kF[1] + 3, kF[0] + 1, kF[1] + 5, R.brass[2]);
}

function staff(buf: PixelBuffer, c: RigCtx): void {
  const p = c.pose;
  const a = ((p.wa ?? -90) * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const [hx, hy] = p.hF;
  const x0 = hx - dx * 11, y0 = hy - dy * 11;
  const x1 = hx + dx * 20, y1 = hy + dy * 20;
  rod(buf, x0, y0, x1, y1, R.wood, 2);
  // 황동 고리 + 수정
  const tx = Math.round(x1 + dx * 1), ty = Math.round(y1 + dy * 1);
  buf.set(tx, ty, R.brass[3]);
  buf.set(tx - 1, ty, R.brass[2]);
  buf.set(tx + 1, ty, R.brass[2]);
  const gx = x1 + dx * 4, gy = y1 + dy * 4;
  const glow = p.wx ?? 0;
  const ramp = glow > 0.5 ? R.echo : R.glass;
  ellipse(buf, gx, gy, 2.2, 2.8, rampShader(ramp, 0, true, 0.2));
  buf.set(Math.round(gx - 1), Math.round(gy - 1), ramp[4]);
  // 초승달 받침
  line(buf, x1 - 3 * -dy - dx, y1 - 3 * dx - dy, x1 + 3 * -dy - dx, y1 + 3 * dx - dy, R.brass[2]);
}

export const MIRA: Design = {
  id: 'mira',
  shF: 4, shB: 5, hipHalf: 2.8,
  rUpper: 1.9, rFore: 1.8, rThigh: 2.3, rShin: 1.8,
  skin: R.skin,
  sleeve: R.teal,
  glove: R.skin,
  pants: R.plum,
  boots: R.leather,
  bootH: 0.5,
  sleeveLen: 0.8,
  head: { rows: HEAD, legend: HL, anchor: [6, 12] },
  headHurt: { rows: HEAD_HURT, legend: HL, anchor: [6, 12] },
  torso,
  overLegs: coat,
  weapon: staff,
  afterHead: hat,
};

const K = KAEL_POSES;
const M_BASE: Pose = P(K_BASE, { kF: [43, 59], fF: [45, 68], kB: [36, 59], fB: [33, 68], eF: [45, 41], hF: [47, 44], wa: -92, eB: [35, 41], hB: [36, 47] });
const STEP: Partial<Pose> = { hip: [40, 49], kF: [46, 59], fF: [49, 68], kB: [36, 59], fB: [32, 68] };

export const MIRA_POSES = {
  idle: [
    M_BASE,
    P(M_BASE, { chest: [40, 32], eF: [45, 40], hF: [47, 43], eB: [35, 40], hB: [36, 46], flow: 0.5 }),
    P(M_BASE, { chest: [40, 32], eF: [45, 40], hF: [47, 43], eB: [35, 40], hB: [36, 46], flow: 1, wx: 1 }),
    P(M_BASE, { flow: 0.5 }),
  ],
  attack: [
    P(M_BASE, { chest: [39, 33], eF: [43, 38], hF: [44, 33], wa: -120, eB: [35, 40], hB: [38, 43] }),
    P(M_BASE, { chest: [38, 33], head: [0, -1], eF: [42, 37], hF: [43, 31], wa: -128, eB: [35, 40], hB: [38, 43], wx: 1, flow: 0.5 }),
    P(M_BASE, { ...STEP, chest: [42, 34], eF: [48, 37], hF: [52, 36], wa: -30, eB: [36, 41], hB: [35, 46], flow: 1, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [43, 34], head: [2, -1], eF: [50, 37], hF: [55, 36], wa: -15, eB: [36, 41], hB: [34, 45], flow: 1.5, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [42, 34], eF: [48, 40], hF: [51, 42], wa: -50, flow: 1 }),
    P(M_BASE, { flow: 0.5 }),
  ],
  skill: [
    P(M_BASE, { chest: [40, 33], eF: [44, 32], hF: [45, 26], wa: -95, eB: [40, 38], hB: [45, 37], bOver: true }),
    P(M_BASE, { chest: [40, 32], eF: [44, 30], hF: [45, 24], wa: -95, eB: [40, 37], hB: [46, 36], bOver: true, wx: 1, flow: 0.5 }),
    P(M_BASE, { ...STEP, chest: [42, 33], eF: [47, 35], hF: [51, 32], wa: -60, eB: [41, 38], hB: [47, 38], bOver: true, wx: 1, flow: 1 }),
    P(M_BASE, { ...STEP, chest: [43, 34], head: [2, -1], eF: [49, 36], hF: [54, 34], wa: -40, eB: [42, 38], hB: [48, 39], bOver: true, wx: 1, flow: 2 }),
    P(M_BASE, { ...STEP, chest: [43, 34], head: [2, -1], eF: [49, 36], hF: [54, 34], wa: -40, eB: [42, 38], hB: [48, 39], bOver: true, wx: 1, flow: 1.5 }),
    P(M_BASE, { ...STEP, chest: [41, 34], eF: [47, 40], hF: [50, 42], wa: -70, flow: 1 }),
    P(M_BASE, { flow: 0.5 }),
  ],
  skill2: [
    P(M_BASE, { chest: [39, 34], eF: [42, 43], hF: [40, 47], wa: 150, eB: [35, 41], hB: [37, 45] }),
    P(M_BASE, { ...STEP, chest: [42, 34], eF: [47, 41], hF: [51, 43], wa: 8, flow: 1, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [42, 33], eF: [48, 36], hF: [52, 32], wa: -50, flow: 1.5, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [42, 33], head: [2, -2], eF: [47, 33], hF: [50, 27], wa: -85, flow: 2, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [41, 33], eF: [46, 37], hF: [49, 38], wa: -80, flow: 1 }),
    P(M_BASE, { flow: 0.5 }),
  ],
  support: [
    P(M_BASE, { eF: [45, 39], hF: [47, 37], wa: -90, eB: [39, 40], hB: [45, 38], bOver: true }),
    P(M_BASE, { chest: [40, 32], head: [1, 0], eF: [45, 38], hF: [47, 36], wa: -90, eB: [39, 39], hB: [45, 37], bOver: true, wx: 1, flow: 0.5 }),
    P(M_BASE, { chest: [40, 32], head: [1, 0], eF: [45, 38], hF: [47, 36], wa: -90, eB: [39, 39], hB: [45, 37], bOver: true, wx: 1, flow: 1 }),
    P(M_BASE, { eF: [45, 40], hF: [47, 42], wa: -92, flow: 0.5 }),
    M_BASE,
  ],
  dodge: K.dodge.map((p, i) => P(p, { eF: [p.chest[0] + 5, p.chest[1] + 7], hF: [p.chest[0] + 7, p.chest[1] + 10], wa: -100 + i * 3, eB: [p.chest[0] - 5, p.chest[1] + 8], hB: [p.chest[0] - 6, p.chest[1] + 13] })),
  parry: [
    P(M_BASE, { hip: [39, 50], chest: [41, 34], eF: [46, 38], hF: [49, 35], wa: -62, eB: [40, 39], hB: [46, 39], bOver: true, kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68] }),
    P(M_BASE, { hip: [38, 50], chest: [40, 35], eF: [45, 38], hF: [48, 36], wa: -55, eB: [39, 40], hB: [45, 40], bOver: true, kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], wx: 1, flow: -1 }),
    P(M_BASE, { hip: [38, 50], chest: [40, 35], eF: [45, 38], hF: [48, 36], wa: -55, eB: [39, 40], hB: [45, 40], bOver: true, kF: [45, 60], fF: [48, 68], kB: [34, 60], fB: [30, 68], flow: -0.5 }),
    M_BASE,
  ],
  counter: [
    P(M_BASE, { hip: [39, 52], chest: [38, 37], kF: [46, 61], fF: [47, 68], kB: [34, 61], fB: [31, 68], eF: [41, 43], hF: [38, 47], wa: 160, eB: [34, 43], hB: [31, 47] }),
    P(M_BASE, { ...STEP, chest: [43, 35], eF: [47, 39], hF: [52, 40], wa: 0, flow: 1, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [44, 34], head: [2, -1], eF: [50, 36], hF: [55, 35], wa: -20, eB: [42, 38], hB: [48, 37], bOver: true, flow: 2, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [43, 33], eF: [47, 31], hF: [50, 25], wa: -80, eB: [42, 37], hB: [47, 34], bOver: true, flow: 2, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [44, 35], head: [2, -1], eF: [49, 38], hF: [54, 39], wa: -5, eB: [42, 39], hB: [48, 40], bOver: true, flow: 2.5, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [44, 35], head: [2, -1], eF: [49, 38], hF: [54, 39], wa: -5, eB: [42, 39], hB: [48, 40], bOver: true, flow: 2, wx: 1 }),
    P(M_BASE, { ...STEP, chest: [41, 34], eF: [46, 40], hF: [49, 43], wa: -70, flow: 1 }),
    P(M_BASE, { flow: 0.5 }),
  ],
  jump: K.jump.map((p, i) => P(p, { eF: [p.chest[0] + 5, p.chest[1] + 7], hF: [p.chest[0] + 7, p.chest[1] + (i === 2 ? 6 : 10)], wa: -100, flow: p.flow })),
  hurt: [
    P(M_BASE, { hip: [38, 50], chest: [35, 35], head: [-1, 0], headV: 'hurt', eF: [41, 37], hF: [44, 34], wa: -115, eB: [30, 39], hB: [27, 42], kB: [34, 60], fB: [31, 68], flow: -2 }),
    P(M_BASE, { hip: [38, 50], chest: [36, 35], headV: 'hurt', head: [0, 0], eF: [42, 38], hF: [45, 36], wa: -105, eB: [31, 40], hB: [28, 44], flow: -1.5 }),
    P(M_BASE, { chest: [39, 34], eF: [45, 41], hF: [47, 44], wa: -95, flow: -0.5 }),
  ],
  stagger: K.stagger.map((p) => P(p, { eF: [p.chest[0] + 3, p.chest[1] + 7], hF: [p.chest[0] + 5, p.chest[1] + 12], wa: 70, kF: [43, 61], fF: [45, 68] })),
  victory: [
    M_BASE,
    P(M_BASE, { chest: [40, 32], eF: [45, 32], hF: [47, 26], wa: -95, eB: [34, 38], hB: [32, 34], flow: 1, wx: 1 }),
    P(M_BASE, { chest: [40, 31], eF: [45, 30], hF: [47, 23], wa: -95, eB: [34, 37], hB: [31, 32], flow: 1.5, wx: 1 }),
    P(M_BASE, { chest: [40, 31], eF: [45, 30], hF: [47, 23], wa: -95, eB: [34, 37], hB: [31, 32], flow: 0.5, wx: 1 }),
    P(M_BASE, { eF: [45, 40], hF: [47, 43], wa: -92, eB: [36, 40], hB: [40, 44], flow: 0.5 }),
  ],
  defeat: K.defeat.map((p, i) => P(p, { kF: [p.kF[0] - 1, p.kF[1]], eF: [p.chest[0] + 4, p.chest[1] + 7], hF: [p.chest[0] + 6, p.chest[1] + 10], wa: i === 0 ? -110 : -70 + i * 6 })),
  aim: [
    P(M_BASE, { chest: [41, 34], eF: [48, 37], hF: [52, 36], wa: -12, eB: [36, 40], hB: [39, 44] }),
    P(M_BASE, { chest: [41, 33], eF: [48, 36], hF: [52, 35], wa: -12, eB: [36, 39], hB: [39, 43], flow: 0.5, wx: 1 }),
    P(M_BASE, { chest: [41, 34], eF: [48, 37], hF: [52, 36], wa: -12, eB: [36, 40], hB: [39, 44], flow: 1 }),
  ],
} satisfies Record<string, Pose[]>;
