import { PixelBuffer } from '../core/buffer';
import { capsule, ellipse, poly, rampShader, stamp, tone, lit, line, Pt, lerp } from '../core/draw';
import { composite, selectiveOutline, cleanupOrphans } from '../core/post';
import { R, darker } from '../core/palette';

/**
 * 전투용 인간형 포즈 블루프린트.
 * 모든 좌표는 오른쪽을 바라보는 80×72 프레임 기준. 매 프레임 관절 위치로 팔다리를 새로 래스터화한다.
 */
export interface Pose {
  hip: Pt;
  chest: Pt;
  /** 머리 목 연결점 (chest 기준 오프셋) */
  head?: Pt;
  headV?: 'n' | 'hurt' | 'shout';
  eF: Pt; hF: Pt;
  eB: Pt; hB: Pt;
  kF: Pt; fF: Pt;
  kB: Pt; fB: Pt;
  /** 발끝 방향: 1 앞, -1 뒤, 0 발끝 세움 */
  toeF?: number;
  toeB?: number;
  /** 무기 각도(도). 0 = 오른쪽, -90 = 위 */
  wa?: number;
  /** 무기 보조 값 (활 당김, 지팡이 발광 등) */
  wx?: number;
  /** 무기를 몸 뒤에 그림 */
  wBehind?: boolean;
  /** 망토·머리카락 흔들림 */
  flow?: number;
  /** 보정 픽셀 [x, y, 팔레트 인덱스] */
  corr?: [number, number, number][];
  /** 주먹/손 모양 */
  handF?: 'grip' | 'open';
  /** 뒷팔을 몸통 앞에 그림 (활시위 당기기, 양손 파지 등) */
  bOver?: boolean;
}

export interface RigCtx {
  pose: Pose;
  sF: Pt; sB: Pt; hipF: Pt; hipB: Pt;
  up: Pt; fwd: Pt;
  neck: Pt;
}

export interface HeadMap {
  rows: string[];
  legend: Record<string, number>;
  /** 맵 안의 목 연결점 */
  anchor: Pt;
}

export interface Design {
  id: string;
  shF: number; shB: number;
  hipHalf: number;
  rUpper: number; rFore: number; rThigh: number; rShin: number;
  skin: readonly number[];
  sleeve: readonly number[];
  glove: readonly number[];
  pants: readonly number[];
  boots: readonly number[];
  bootH: number;
  head: HeadMap;
  headHurt?: HeadMap;
  /** 소매가 팔뚝 어디까지 덮는지 (0~1) */
  sleeveLen?: number;
  torso(buf: PixelBuffer, c: RigCtx): void;
  pelvis?(buf: PixelBuffer, c: RigCtx): void;
  behind?(buf: PixelBuffer, c: RigCtx): void;
  overLegs?(buf: PixelBuffer, c: RigCtx): void;
  weapon?(buf: PixelBuffer, c: RigCtx): void;
  frontExtra?(buf: PixelBuffer, c: RigCtx): void;
  afterHead?(buf: PixelBuffer, c: RigCtx): void;
  /** 대형 인간형(보스)용 손·발·어깨 배율 */
  scale?: number;
}

/** 긴 무기 궤적이 잘리지 않도록 넓은 프레임을 사용한다. 포즈 좌표는 72px 높이 기준으로 작성하고 OY만큼 내려 배치한다. */
export const FRAME_W = 96;
export const FRAME_H = 80;
export const POSE_OY = 8;
export const ANCHOR: Pt = [40, 79];

function norm(x: number, y: number): Pt {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

export function ctxFor(d: Design, p: Pose): RigCtx {
  const up = norm(p.chest[0] - p.hip[0], p.chest[1] - p.hip[1]);
  const fwd: Pt = [-up[1], up[0]];
  const S = d.scale ?? 1;
  const sF: Pt = [p.chest[0] + fwd[0] * d.shF - up[0] * 2 * S, p.chest[1] + fwd[1] * d.shF - up[1] * 2 * S];
  const sB: Pt = [p.chest[0] - fwd[0] * d.shB - up[0] * 1.5 * S, p.chest[1] - fwd[1] * d.shB - up[1] * 1.5 * S];
  const hipF: Pt = [p.hip[0] + fwd[0] * d.hipHalf * 0.7, p.hip[1] + fwd[1] * d.hipHalf * 0.7];
  const hipB: Pt = [p.hip[0] - fwd[0] * d.hipHalf, p.hip[1] - fwd[1] * d.hipHalf];
  const ho = p.head ?? [1, -1];
  const neck: Pt = [p.chest[0] + ho[0], p.chest[1] + ho[1]];
  return { pose: p, sF, sB, hipF, hipB, up, fwd, neck };
}

/** 팔 하나: 상완(소매) + 전완(소매/장갑) + 손 */
function drawArm(buf: PixelBuffer, d: Design, s: Pt, e: Pt, h: Pt, shift: number): void {
  const sleeveLen = d.sleeveLen ?? 0.45;
  capsule(buf, s[0], s[1], e[0], e[1], d.rUpper, d.rUpper * 0.9, rampShader(d.sleeve, shift));
  const m: Pt = [lerp(e[0], h[0], sleeveLen), lerp(e[1], h[1], sleeveLen)];
  capsule(buf, m[0], m[1], h[0], h[1], d.rFore * 0.95, d.rFore * 0.85, rampShader(d.glove, shift));
  capsule(buf, e[0], e[1], m[0], m[1], d.rFore, d.rFore * 0.95, rampShader(d.sleeve, shift));
  const hr = 1.5 * (d.scale ?? 1);
  ellipse(buf, h[0], h[1], hr, hr, rampShader(d.glove, shift));
}

function drawLeg(buf: PixelBuffer, d: Design, hipJ: Pt, k: Pt, f: Pt, toe: number, shift: number): void {
  const S = d.scale ?? 1;
  capsule(buf, hipJ[0], hipJ[1], k[0], k[1], d.rThigh, d.rThigh * 0.85, rampShader(d.pants, shift));
  // 정강이 윗부분은 바지, 아래는 부츠
  const bootTop: Pt = [lerp(f[0], k[0], d.bootH), lerp(f[1], k[1], d.bootH)];
  capsule(buf, k[0], k[1], bootTop[0], bootTop[1], d.rShin, d.rShin * 0.95, rampShader(d.pants, shift));
  capsule(buf, bootTop[0], bootTop[1], f[0], f[1], d.rShin + 0.35, d.rShin + 0.2, rampShader(d.boots, shift));
  // 발
  const bx = Math.round(f[0]), by = Math.round(f[1]);
  const fn = (x: number, y: number) => {
    const nx = (x - bx) / 5, ny = (y - by - 1) / 2;
    return tone(d.boots, lit(nx * 0.3, ny - 0.3, 0.8), shift);
  };
  if (toe === 0) {
    poly(buf, [[bx - 1.5 * S, by - 1 * S], [bx + 2.5 * S, by - 1 * S], [bx + 2 * S, by + 2], [bx - 1 * S, by + 2]], fn);
  } else {
    const t = toe > 0 ? 1 : -1;
    const heel = bx - 2 * t * S, tip = bx + 4.5 * t * S;
    poly(buf, [[heel, by - 1.5 * S], [bx + 1.5 * t * S, by - 1.5 * S], [tip, by + 0.5], [tip, by + 2], [heel, by + 2]].map(([x, y]) => [x + (t < 0 ? 1 : 0), y] as Pt), fn);
  }
}

function stampHead(buf: PixelBuffer, hm: HeadMap, neck: Pt): void {
  stamp(buf, hm.rows, hm.legend, Math.round(neck[0] - hm.anchor[0]), Math.round(neck[1] - hm.anchor[1]));
}

/** 포즈 하나를 완성된 프레임으로 렌더링 */
export function renderPose(d: Design, p: Pose, opts: { noOutline?: boolean; w?: number; h?: number } = {}): PixelBuffer {
  const c = ctxFor(d, p);
  const W = opts.w ?? FRAME_W, H = opts.h ?? FRAME_H;
  const base = new PixelBuffer(W, H);
  const part = () => new PixelBuffer(W, H);

  // 1. 몸 뒤 요소 (망토, 뒷머리)
  if (d.behind) {
    const b = part();
    d.behind(b, c);
    composite(base, b, { edge: false });
  }
  // 2. 몸 뒤 무기
  if (d.weapon && p.wBehind) {
    const w = part();
    d.weapon(w, c);
    composite(base, w, { edge: true });
  }
  // 3. 뒷팔, 뒷다리 (한 단계 어둡게)
  {
    const b = part();
    drawLeg(b, d, c.hipB, p.kB, p.fB, p.toeB ?? 1, -1);
    composite(base, b, { edge: true });
    if (!p.bOver) {
      const a = part();
      drawArm(a, d, c.sB, p.eB, p.hB, -1);
      composite(base, a, { edge: true });
    }
  }
  // 4. 몸통 + 골반
  {
    const t = part();
    d.torso(t, c);
    composite(base, t, { edge: true });
    if (d.pelvis) {
      const pv = part();
      d.pelvis(pv, c);
      composite(base, pv, { edge: false });
    }
  }
  // 5. 앞다리
  {
    const l = part();
    drawLeg(l, d, c.hipF, p.kF, p.fF, p.toeF ?? 1, 0);
    composite(base, l, { edge: true });
  }
  if (d.overLegs) {
    const o = part();
    d.overLegs(o, c);
    composite(base, o, { edge: true, edgeSides: 'lower' });
  }
  // 6. 머리
  {
    const h = part();
    stampHead(h, p.headV === 'hurt' && d.headHurt ? d.headHurt : d.head, c.neck);
    if (d.afterHead) d.afterHead(h, c);
    composite(base, h, { edge: false });
  }
  if (p.bOver) {
    const a = part();
    drawArm(a, d, c.sB, p.eB, p.hB, -1);
    composite(base, a, { edge: true });
  }
  // 7. 앞팔 + 무기
  if (d.weapon && !p.wBehind) {
    const w = part();
    d.weapon(w, c);
    composite(base, w, { edge: true });
  }
  {
    const a = part();
    drawArm(a, d, c.sF, p.eF, p.hF, 0);
    composite(base, a, { edge: true });
  }
  if (d.frontExtra) {
    const f = part();
    d.frontExtra(f, c);
    composite(base, f, { edge: true });
  }
  // 8. 보정 픽셀
  if (p.corr) for (const [x, y, col] of p.corr) base.set(x, y, col);
  cleanupOrphans(base);
  if (!opts.noOutline) selectiveOutline(base);
  return base;
}

/* ---------- 포즈 보간 ---------- */

const PT_KEYS = ['hip', 'chest', 'eF', 'hF', 'eB', 'hB', 'kF', 'fF', 'kB', 'fB'] as const;

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = { ...a };
  for (const k of PT_KEYS) {
    (out as any)[k] = [Math.round(lerp(a[k][0], b[k][0], t)), Math.round(lerp(a[k][1], b[k][1], t))];
  }
  const ha = a.head ?? [1, -1], hb = b.head ?? [1, -1];
  out.head = [Math.round(lerp(ha[0], hb[0], t)), Math.round(lerp(ha[1], hb[1], t))];
  out.wa = lerp(a.wa ?? 0, b.wa ?? 0, t);
  out.wx = lerp(a.wx ?? 0, b.wx ?? 0, t);
  out.flow = lerp(a.flow ?? 0, b.flow ?? 0, t);
  out.corr = t < 0.5 ? a.corr : b.corr;
  out.headV = t < 0.5 ? a.headV : b.headV;
  out.wBehind = t < 0.5 ? a.wBehind : b.wBehind;
  out.toeF = t < 0.5 ? a.toeF : b.toeF;
  out.toeB = t < 0.5 ? a.toeB : b.toeB;
  out.bOver = t < 0.5 ? a.bOver : b.bOver;
  return out;
}

/** 모든 점을 (dx, dy) 이동 */
export function shiftPose(p: Pose, dx: number, dy: number): Pose {
  const out: Pose = { ...p };
  for (const k of PT_KEYS) (out as any)[k] = [p[k][0] + dx, p[k][1] + dy];
  return out;
}

/** 상체만 이동 (다리는 고정) */
export function shiftUpper(p: Pose, dx: number, dy: number): Pose {
  const out: Pose = { ...p };
  for (const k of ['chest', 'eF', 'hF', 'eB', 'hB'] as const) (out as any)[k] = [p[k][0] + dx, p[k][1] + dy];
  return out;
}

/* ---------- 공용 무기 도우미 ---------- */

/**
 * 2px 두께의 깔끔한 날(검·창 등). 중심선 브레젠험 + 축 정렬 두께.
 * 광원을 향한 쪽은 밝은 날, 반대쪽은 어두운 날.
 */
export function blade(buf: PixelBuffer, x0: number, y0: number, ang: number, len: number, ramp: readonly number[], taper = 3): Pt {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const x1 = x0 + dx * len, y1 = y0 + dy * len;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  // 두께 방향: 수평에 가까우면 위(-y) 쪽, 수직에 가까우면 왼쪽(-x) — 광원 쪽이 밝은 면
  const ox = horiz ? 0 : -1, oy = horiz ? -1 : 0;
  const pts: Pt[] = [];
  {
    let ax = Math.round(x0), ay = Math.round(y0);
    const bx = Math.round(x1), by = Math.round(y1);
    const ddx = Math.abs(bx - ax), ddy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
    let err = ddx + ddy;
    for (;;) {
      pts.push([ax, ay]);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= ddy) { err += ddy; ax += sx; }
      if (e2 <= ddx) { err += ddx; ay += sy; }
    }
  }
  const n = pts.length;
  pts.forEach(([x, y], i) => {
    const nearTip = i >= n - taper;
    buf.set(x, y, i === n - 1 ? ramp[ramp.length - 1] : ramp[ramp.length - 2]);
    if (!nearTip) buf.set(x + ox, y + oy, ramp[ramp.length - 1]);
    if (!nearTip && i % 1 === 0) buf.set(x - ox, y - oy, ramp[2]);
  });
  return [Math.round(x1), Math.round(y1)];
}

/** 굵은 막대 (지팡이 자루, 손잡이) */
export function rod(buf: PixelBuffer, x0: number, y0: number, x1: number, y1: number, ramp: readonly number[], thick = 2): void {
  const dx = x1 - x0, dy = y1 - y0;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const ox = horiz ? 0 : -1, oy = horiz ? -1 : 0;
  line(buf, x0, y0, x1, y1, ramp[2]);
  if (thick >= 2) line(buf, x0 + ox, y0 + oy, x1 + ox, y1 + oy, ramp[3]);
  if (thick >= 3) line(buf, x0 - ox, y0 - oy, x1 - ox, y1 - oy, ramp[1]);
}

/** 회전된 사각형 (망치 머리 등) */
export function rotRect(buf: PixelBuffer, cx: number, cy: number, w: number, h: number, ang: number, fn: (x: number, y: number, u: number, v: number) => number): void {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const hw = w / 2, hh = h / 2;
  const corners: Pt[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([u, v]) => [cx + u * ca - v * sa, cy + u * sa + v * ca]);
  poly(buf, corners, (x, y) => {
    const rx = x + 0.5 - cx, ry = y + 0.5 - cy;
    const u = (rx * ca + ry * sa) / hw;
    const v = (-rx * sa + ry * ca) / hh;
    return fn(x, y, u, v);
  });
}

/** 몸통 다각형의 원통형 셰이딩 */
export function torsoShader(c: RigCtx, ramp: readonly number[], halfW: number, shift = 0, spec = false, bias = 0) {
  const cx = (c.pose.chest[0] + c.pose.hip[0]) / 2;
  const top = c.pose.chest[1], bot = c.pose.hip[1];
  return (x: number, y: number) => {
    const s = Math.max(-1, Math.min(1, ((x - cx) * c.fwd[0] + (y - (top + bot) / 2) * c.fwd[1]) / halfW));
    const v = Math.max(0, Math.min(1, (y - top) / Math.max(1, bot - top)));
    const nx = s * 0.85, ny = -0.35 + v * 0.45;
    const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
    return tone(ramp, lit(nx, ny, nz) + bias, shift, spec);
  };
}

export { darker, R };
