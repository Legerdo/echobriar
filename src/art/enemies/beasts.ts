import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { capsule, ellipse, poly, rampShader, line, tone, lit, Pt, polyline, quadPoints } from '../core/draw';
import { composite, darkenAll } from '../core/post';
import { buildEnemySheet, Drawn, EFrame, wp } from './common';
import type { SheetSpec } from '../core/sheet';

/* ============================================================
 * 가시 사냥개 — 빠른 연속 물기. 등에 잔향가시가 돋은 사냥개. (왼쪽을 바라봄)
 * ============================================================ */
interface HoundP { lunge?: number; crouch?: number; jaw?: number; lp?: number; tail?: number; head?: number; recoil?: number; rise?: number; slump?: number; paws?: number }

function drawHound(p: HoundP): Drawn {
  const W = 56, H = 40;
  const buf = new PixelBuffer(W, H);
  const part = () => new PixelBuffer(W, H);
  const bx = 32 - (p.lunge ?? 0) + (p.recoil ?? 0) * 2;
  const by = 24 + (p.crouch ?? 0) * 3 - (p.rise ?? 0) + (p.slump ?? 0) * 4;
  const hx = bx - 16, hy = by - 6 + (p.head ?? 0) + (p.slump ?? 0) * 3;
  const lp = p.lp ?? 0;
  const ground = 37;
  const fur = R.stone, furS = rampShader(R.stone, 0), farS = rampShader(R.stone, -1);
  const paws = p.paws ?? 0; // 앞발 들기 (덮치기)

  // 먼 쪽 다리
  const far = part();
  capsule(far, bx - 6, by + 2, bx - 7 - paws * 3, Math.min(ground, by + 9 - paws * 4), 2.0, 1.6, farS);
  capsule(far, bx - 7 - paws * 3, Math.min(ground, by + 9 - paws * 4), bx - 8 + lp - paws * 5, Math.min(ground, ground - paws * 9), 1.6, 1.4, farS);
  capsule(far, bx + 10, by + 1, bx + 12, by + 7, 2.4, 1.8, farS);
  capsule(far, bx + 12, by + 7, bx + 10, by + 11, 1.6, 1.4, farS);
  capsule(far, bx + 10, by + 11, bx + 10 - lp, ground, 1.4, 1.3, farS);
  composite(buf, far, { edge: false });
  // 꼬리 (가시 끝)
  const t = p.tail ?? 0;
  const tail = part();
  const tp = quadPoints([bx + 10, by - 2], [bx + 16, by - 6 + t], [bx + 21, by - 11 + t * 2], 6);
  tp.forEach(([x, y], i) => capsule(tail, x, y, x, y, 1.8 - i * 0.2, 1.6 - i * 0.2, furS));
  poly(tail, [[bx + 20, by - 11 + t * 2], [bx + 25, by - 15 + t * 2], [bx + 22, by - 9 + t * 2]], () => R.thorn[3]);
  composite(buf, tail, { edge: true });
  // 몸통
  const body = part();
  ellipse(body, bx, by, 11, 6.2, (x, y, nx, ny, nz) => {
    const I = lit(nx, ny, nz);
    if (ny > 0.6) return tone(R.ash, I - 0.1, 0); // 배 털
    return tone(fur, I, 0);
  });
  ellipse(body, bx - 8, by - 1, 6.5, 6.4, (x, y, nx, ny, nz) => tone(fur, lit(nx, ny, nz) + 0.05, 0));
  // 털 결 (짧은 사선 클러스터)
  for (let i = 0; i < 4; i++) {
    const sx = bx - 4 + i * 4, sy = by - 2 + (i % 2);
    line(body, sx, sy, sx + 2, sy + 2, fur[1]);
  }
  composite(buf, body, { edge: true });
  // 등 가시
  const sp = part();
  for (let i = 0; i < 5; i++) {
    const sx = bx - 9 + i * 4, sy = by - 5 - (i === 1 || i === 2 ? 2 : 0);
    const h = 4 + (i % 2 ? 1 : 2);
    poly(sp, [[sx - 1, sy + 1], [sx + 2, sy + 1], [sx + 3, sy - h]], (x, y) => (x <= sx ? R.thorn[3] : R.thorn[2]));
    sp.set(sx + 2, sy - h + 1, R.thorn[4]);
  }
  composite(buf, sp, { edge: true });
  // 가까운 다리
  const near = part();
  capsule(near, bx - 9, by + 2, bx - 10 - paws * 3, Math.min(ground, by + 9 - paws * 4), 2.3, 1.8, furS);
  capsule(near, bx - 10 - paws * 3, Math.min(ground, by + 9 - paws * 4), bx - 11 - lp - paws * 5, Math.min(ground, ground - paws * 8), 1.8, 1.5, furS);
  ellipse(near, bx - 12 - lp - paws * 5, Math.min(ground, ground - paws * 8), 2.2, 1.2, rampShader(R.stone, 0));
  capsule(near, bx + 7, by + 1, bx + 10, by + 7, 2.8, 2.0, furS);
  capsule(near, bx + 10, by + 7, bx + 8, by + 11, 1.8, 1.5, furS);
  capsule(near, bx + 8, by + 11, bx + 7 + lp, ground, 1.5, 1.4, furS);
  ellipse(near, bx + 6 + lp, ground, 2.2, 1.2, rampShader(R.stone, 0));
  composite(buf, near, { edge: true });
  // 머리
  const head = part();
  const jaw = p.jaw ?? 0;
  // 아래턱
  poly(head, [[hx - 2, hy + 2], [hx - 10, hy + 2 + jaw * 3], [hx - 9, hy + 4 + jaw * 3], [hx - 1, hy + 5]], (x, y) => tone(fur, lit(0, 0.3, 0.8), -1));
  if (jaw > 0.3) {
    line(head, hx - 3, hy + 2 + jaw, hx - 9, hy + 2 + jaw * 2, R.blood[1]);
    for (let i = 0; i < 3; i++) head.set(Math.round(hx - 4 - i * 2), Math.round(hy + 2 + jaw * (1 + i * 0.4)), R.bone[4]);
  }
  ellipse(head, hx, hy, 5, 4.2, (x, y, nx, ny, nz) => tone(fur, lit(nx, ny, nz) + 0.1, 0));
  // 주둥이
  poly(head, [[hx - 3, hy - 2], [hx - 10, hy], [hx - 10, hy + 2], [hx - 2, hy + 2]], (x, y) => tone(fur, lit(-0.2, (y - hy) * 0.2, 0.8) + 0.15, 0));
  head.set(hx - 10, hy, R.ink[1]);
  // 귀 (뒤로 젖힘)
  poly(head, [[hx + 1, hy - 3], [hx + 4, hy - 3], [hx + 7, hy - 8]], () => fur[2]);
  poly(head, [[hx + 3, hy - 2], [hx + 5, hy - 3], [hx + 9, hy - 6]], () => fur[1]);
  // 빛나는 눈
  head.set(hx - 3, hy - 1, R.ember[4]);
  head.set(hx - 2, hy - 1, R.ember[3]);
  head.set(hx - 3, hy - 2, R.ember[3]);
  composite(buf, head, { edge: true });
  return { buf, weak: [wp('eye', hx - 3, hy - 1, 1.5, 4.5)], attach: { mouth: [hx - 9, hy + 2], core: [bx, by] } };
}

export function houndSheet(): SheetSpec {
  const F = (p: HoundP, ms: number, tag?: EFrame<HoundP>['tag']): EFrame<HoundP> => ({ p, ms, tag });
  return buildEnemySheet<HoundP>({
    id: 'hound', kind: 'enemy', w: 56, h: 40, anchor: [30, 39], draw: drawHound,
    anims: {
      idle: [F({ tail: 0 }, 140, 'idle'), F({ crouch: 0.2, tail: 1, lp: 0 }, 140, 'idle'), F({ crouch: 0.35, tail: 2 }, 140, 'idle'), F({ crouch: 0.2, tail: 1 }, 140, 'idle')],
      bite: [
        F({ crouch: 1, recoil: 1.5, jaw: 0.2, tail: -1 }, 100, 'anticipation'),
        F({ crouch: 1.2, recoil: 2, jaw: 0.5, tail: -2, head: 1 }, 100, 'anticipation'),
        F({ lunge: 6, crouch: 0.3, jaw: 1, lp: 2, tail: 1 }, 60, 'attack'),
        F({ lunge: 9, crouch: 0.2, jaw: 0.1, lp: 3, head: 1, tail: 2 }, 80, 'contact'),
        F({ lunge: 4, jaw: 0.3, lp: 1, tail: 1 }, 100, 'recovery'),
      ],
      pounce: [
        F({ crouch: 1.6, recoil: 2, jaw: 0.3, tail: -2 }, 120, 'anticipation'),
        F({ lunge: 5, rise: 6, paws: 1, jaw: 0.8, tail: 2 }, 70, 'attack'),
        F({ lunge: 9, rise: 1, paws: 0.4, jaw: 1, head: 2, tail: 3 }, 80, 'contact'),
        F({ lunge: 5, crouch: 0.6, jaw: 0.2 }, 110, 'recovery'),
      ],
      hurt: [F({ recoil: 2.5, head: -2, jaw: 0.6, tail: -2 }, 90, 'hurt'), F({ recoil: 1, head: -1, jaw: 0.3 }, 90, 'hurt')],
      break: [F({ slump: 1, jaw: 0.4, tail: -3 }, 220, 'break'), F({ slump: 1.1, jaw: 0.5, tail: -3, head: 1 }, 220, 'break'), F({ slump: 1, jaw: 0.4, tail: -2 }, 220, 'break')],
    },
    death: { from: { recoil: 2, slump: 0.6, jaw: 0.6 } },
    required: ['idle', 'bite', 'pounce', 'hurt', 'break', 'death'],
  });
}

/* ============================================================
 * 유리 불꽃 — 떠다니는 수정 핵과 차가운 불꽃. 회피형, 약점 핵.
 * ============================================================ */
interface FlameP { bob?: number; ph?: number; orbit?: number; spread?: number; glow?: number; crack?: number; low?: number; tilt?: number }

function drawFlame(p: FlameP): Drawn {
  const W = 40, H = 40;
  const buf = new PixelBuffer(W, H);
  const part = () => new PixelBuffer(W, H);
  const cx = 20 + (p.tilt ?? 0), cy = 19 + (p.bob ?? 0) + (p.low ?? 0) * 6;
  const ph = p.ph ?? 0;
  const g = p.glow ?? 0;
  // 불꽃: 위로 솟는 세 갈래 혀. 위상에 따라 높이·기울기가 바뀐다.
  const lowK = 1 - (p.low ?? 0) * 0.6;
  const flameShape = (scale: number, dy: number): Pt[] => {
    const s = scale, w = Math.sin(ph * 1.7), v = Math.cos(ph * 1.3);
    return [
      [cx - 8 * s, cy + 6 + dy], [cx - 9 * s, cy + 1 + dy], [cx - 7 * s - w, cy - 6 * s * lowK + dy],
      [cx - 4 * s, cy - 2 * s + dy], [cx - 1 * s + v, cy - 15 * s * lowK + dy], [cx + 2 * s, cy - 4 * s + dy],
      [cx + 6 * s + w, cy - 9 * s * lowK + dy], [cx + 8 * s, cy + 0 + dy], [cx + 7 * s, cy + 6 + dy], [cx, cy + 9 + dy],
    ];
  };
  const fl = part();
  poly(fl, flameShape(1, 0), (x, y) => tone(R.echo, lit((x - cx) / 10, (y - cy) / 12, 0.7) - 0.25 + g * 0.3, 0));
  composite(buf, fl, { edge: false });
  const fl2 = part();
  poly(fl2, flameShape(0.62, 1), () => (g > 0.5 ? R.echo[4] : R.echo[3]));
  composite(buf, fl2, { edge: false });
  // 수정 (면 분할 셰이딩)
  const cr = part();
  const top: Pt = [cx, cy - 8], right: Pt = [cx + 5, cy], bot: Pt = [cx, cy + 8], left: Pt = [cx - 5, cy], mid: Pt = [cx - 1, cy - 1];
  poly(cr, [top, mid, left], () => R.glass[4]);
  poly(cr, [top, right, mid], () => R.glass[3]);
  poly(cr, [left, mid, bot], () => R.glass[2]);
  poly(cr, [mid, right, bot], () => R.glass[1]);
  // 핵
  const coreC = g > 0.5 ? R.white[0] : R.echo[4];
  cr.set(cx - 1, cy, coreC); cr.set(cx, cy, coreC); cr.set(cx - 1, cy + 1, coreC); cr.set(cx, cy + 1, R.echo[3]); cr.set(cx - 1, cy - 1, R.echo[3]);
  if (p.crack) { line(cr, cx - 3, cy - 3, cx + 2, cy + 4, R.ink[1]); line(cr, cx + 1, cy - 5, cx - 1, cy - 1, R.ink[1]); }
  composite(buf, cr, { edge: true });
  // 궤도 파편
  const sh = part();
  const orbit = p.orbit ?? 0;
  const spread = p.spread ?? 1;
  const shards: Pt[] = [];
  for (let i = 0; i < 3; i++) {
    const a = orbit + (i * Math.PI * 2) / 3;
    const sx = Math.round(cx + Math.cos(a) * 12 * spread), sy = Math.round(cy + Math.sin(a) * 5 * spread);
    shards.push([sx, sy]);
    poly(sh, [[sx, sy - 3], [sx + 2, sy], [sx, sy + 3], [sx - 2, sy]], (x) => (x < sx ? R.glass[4] : R.glass[2]));
  }
  if (Math.sin(orbit) > 0) composite(buf, sh, { edge: true });
  else { darkenAll(sh, 1); const b2 = new PixelBuffer(W, H); b2.blit(sh, 0, 0); b2.blit(buf, 0, 0); buf.data.set(b2.data); }
  return { buf, weak: [wp('core', cx - 1, cy, 2, 4.5)], attach: { core: [cx, cy], s0: shards[0], s1: shards[1], s2: shards[2] } };
}

export function flameSheet(): SheetSpec {
  const F = (p: FlameP, ms: number, tag?: EFrame<FlameP>['tag']): EFrame<FlameP> => ({ p, ms, tag });
  return buildEnemySheet<FlameP>({
    id: 'glassflame', kind: 'enemy', w: 40, h: 40, anchor: [20, 39], draw: drawFlame,
    anims: {
      idle: [0, 1, 2, 3].map((i) => F({ bob: i === 1 || i === 2 ? -1 : 0, ph: i, orbit: i * 0.5 }, 130, 'idle')),
      volley: [
        F({ ph: 0, orbit: 0.2, spread: 0.6, glow: 0.3 }, 100, 'anticipation'),
        F({ ph: 1, orbit: 0.5, spread: 0.45, glow: 0.7, bob: -1 }, 120, 'anticipation'),
        F({ ph: 2, orbit: 0.9, spread: 1.4, glow: 1, tilt: -1 }, 60, 'attack'),
        F({ ph: 3, orbit: 1.2, spread: 1.7, glow: 0.6, tilt: -2 }, 80, 'contact'),
        F({ ph: 0, orbit: 1.6, spread: 1.1, glow: 0.2 }, 100, 'recovery'),
      ],
      flare: [
        F({ ph: 1, orbit: 0, spread: 0.3, glow: 1, low: -0.3 }, 140, 'anticipation'),
        F({ ph: 2, orbit: 0.4, spread: 0.2, glow: 1, low: -0.5 }, 140, 'anticipation'),
        F({ ph: 3, orbit: 0.8, spread: 1.9, glow: 1 }, 80, 'contact'),
        F({ ph: 0, orbit: 1.2, spread: 1.2, glow: 0.3 }, 120, 'recovery'),
      ],
      hurt: [F({ tilt: 2, crack: 1, ph: 1, spread: 1.3 }, 90, 'hurt'), F({ tilt: 1, ph: 2 }, 90, 'hurt')],
      break: [F({ low: 1, crack: 1, ph: 0, spread: 0.5, orbit: 0 }, 200, 'break'), F({ low: 1.1, crack: 1, ph: 2, spread: 0.5, orbit: 0.4 }, 200, 'break')],
    },
    death: { from: { crack: 1, low: 0.5, spread: 1.5 } },
    required: ['idle', 'volley', 'flare', 'hurt', 'break', 'death'],
  });
}

/* ============================================================
 * 가시 싹 — 호명자가 부르는 소형 소환체
 * ============================================================ */
interface SproutP { open?: number; lean?: number; bob?: number; wilt?: number }
function drawSprout(p: SproutP): Drawn {
  const buf = new PixelBuffer(32, 32);
  const part = () => new PixelBuffer(32, 32);
  const cx = 16 - (p.lean ?? 0), cy = 22 + (p.bob ?? 0) + (p.wilt ?? 0) * 2;
  const lv = part();
  for (const s of [-1, 1]) {
    poly(lv, [[cx, cy + 4], [cx + s * 10, cy + 2 - (p.wilt ?? 0) * -3], [cx + s * 12, cy - 3 + (p.wilt ?? 0) * 5], [cx + s * 6, cy + 1]], (x, y) => tone(R.moss, lit(s * 0.3, -0.4, 0.8), s > 0 ? -1 : 0));
  }
  // 뿌리
  line(lv, cx - 4, 30, cx - 1, cy + 5, R.root[2]); line(lv, cx + 4, 30, cx + 1, cy + 5, R.root[2]);
  composite(buf, lv, { edge: false });
  const b = part();
  ellipse(b, cx, cy, 6.5, 6, rampShader(R.thorn, 0));
  // 가시
  for (const [dx, dy] of [[-6, -2], [6, -1], [-3, 4], [4, 4]] as Pt[]) b.set(cx + dx + Math.sign(dx), cy + dy, R.thorn[4]);
  // 눈
  b.set(cx - 2, cy - 1, R.ember[4]); b.set(cx - 1, cy - 1, R.ember[3]); b.set(cx - 2, cy, R.ember[2]);
  composite(buf, b, { edge: true });
  // 꽃입 (위쪽)
  const fl = part();
  const o = p.open ?? 0;
  poly(fl, [[cx - 4 - o * 2, cy - 5 - o * 3], [cx - 1, cy - 5], [cx - 2, cy - 9 - o * 2]], () => R.thorn[4]);
  poly(fl, [[cx + 1, cy - 5], [cx + 4 + o * 2, cy - 5 - o * 3], [cx + 2, cy - 9 - o * 2]], () => R.thorn[3]);
  if (o > 0.4) { fl.set(cx, cy - 6, R.blood[1]); fl.set(cx - 1, cy - 6, R.blood[2]); }
  composite(buf, fl, { edge: true });
  return { buf, weak: [wp('eye', cx - 2, cy - 1, 1.5, 4)], attach: { mouth: [cx - 1, cy - 7] } };
}

export function sproutSheet(): SheetSpec {
  const F = (p: SproutP, ms: number, tag?: EFrame<SproutP>['tag']): EFrame<SproutP> => ({ p, ms, tag });
  return buildEnemySheet<SproutP>({
    id: 'sprout', kind: 'enemy', w: 32, h: 32, anchor: [16, 31], draw: drawSprout,
    anims: {
      idle: [F({}, 160, 'idle'), F({ bob: -1, open: 0.2 }, 160, 'idle'), F({ bob: -1 }, 160, 'idle'), F({ open: 0.1 }, 160, 'idle')],
      spit: [F({ lean: -2, open: 0.3 }, 120, 'anticipation'), F({ lean: -3, open: 0.6, bob: 1 }, 120, 'anticipation'), F({ lean: 2, open: 1 }, 60, 'attack'), F({ lean: 3, open: 1 }, 80, 'contact'), F({ lean: 1, open: 0.3 }, 100, 'recovery')],
      hurt: [F({ lean: -3, open: 0.8 }, 90, 'hurt'), F({ lean: -1 }, 90, 'hurt')],
      break: [F({ wilt: 1 }, 200, 'break'), F({ wilt: 1.2, bob: 1 }, 200, 'break')],
    },
    death: { from: { wilt: 1 } },
    required: ['idle', 'spit', 'hurt', 'break', 'death'],
  });
}

/* ============================================================
 * 뿌리 거상 — 대형. 지면 강타와 충격파, 가슴의 충전 기관.
 * ============================================================ */
interface ColP { fN?: Pt; eN?: Pt; fF?: Pt; eF?: Pt; lean?: number; crouch?: number; glow?: number; head?: number; step?: number }

function drawColossus(p: ColP): Drawn {
  const W = 88, H = 96;
  const buf = new PixelBuffer(W, H);
  const part = () => new PixelBuffer(W, H);
  const L = p.lean ?? 0, C = p.crouch ?? 0;
  const ox = -L, oy = C * 3;
  const g = p.glow ?? 0;
  const bark = R.wood;
  const barkS = rampShader(bark, 0), barkFar = rampShader(bark, -1);
  const eF = p.eF ?? [66, 58], fF = p.fF ?? [70, 76];
  const eN = p.eN ?? [26, 58], fN = p.fN ?? [22, 78];
  const shN: Pt = [34 + ox, 40 + oy], shF: Pt = [60 + ox, 38 + oy];
  // 먼 팔
  const fa = part();
  capsule(fa, shF[0], shF[1], eF[0], eF[1], 6, 5, barkFar);
  capsule(fa, eF[0], eF[1], fF[0], fF[1], 5, 4.5, barkFar);
  ellipse(fa, fF[0], fF[1], 7, 6, rampShader(R.stone, -1));
  composite(buf, fa, { edge: false });
  // 다리 (뿌리 발)
  const legs = part();
  const st = p.step ?? 0;
  capsule(legs, 52 + ox * 0.5, 70 + oy, 56 + st, 90, 7, 6, barkFar);
  capsule(legs, 38 + ox * 0.5, 70 + oy, 34 - st, 90, 7.5, 6.5, barkS);
  for (const [fx, s] of [[34 - st, 0], [56 + st, -1]] as [number, number][]) {
    polyline(legs, [[fx - 2, 90], [fx - 8, 93], [fx - 11, 94]], R.wood[2 + s]);
    polyline(legs, [[fx + 2, 90], [fx + 7, 93], [fx + 9, 94]], R.wood[2 + s]);
    poly(legs, [[fx - 7, 88], [fx + 7, 88], [fx + 8, 94], [fx - 8, 94]], (x, y) => tone(R.wood, lit((x - fx) / 8, 0.2, 0.8), s));
  }
  composite(buf, legs, { edge: true });
  // 몸통 (웅크린 덩어리)
  const tor = part();
  const T: Pt[] = [[22, 42], [36, 26], [58, 22], [72, 32], [72, 58], [60, 74], [34, 76], [24, 62]].map(([x, y]) => [x + ox, y + oy] as Pt);
  poly(tor, T, (x, y) => {
    const nx = (x - (48 + ox)) / 26, ny = (y - (48 + oy)) / 28;
    let I = lit(nx, ny, Math.sqrt(Math.max(0.1, 1 - nx * nx * 0.6 - ny * ny * 0.6)));
    // 나무껍질 세로 결
    const grain = (x * 7 + Math.floor(y / 5) * 3) % 11 === 0;
    if (grain) I -= 0.45;
    return tone(bark, I, 0);
  });
  // 이끼 덩어리 (윗면)
  poly(tor, [[30 + ox, 34 + oy], [38 + ox, 25 + oy], [56 + ox, 21 + oy], [68 + ox, 28 + oy], [62 + ox, 31 + oy], [50 + ox, 29 + oy], [40 + ox, 33 + oy]], (x, y) => tone(R.moss, lit((x - 48) / 20, -0.6, 0.7), 0));
  // 가슴 균열 + 충전 기관
  const cX = 42 + ox, cY = 52 + oy;
  poly(tor, [[cX - 5, cY - 6], [cX + 4, cY - 5], [cX + 6, cY + 4], [cX - 1, cY + 7], [cX - 6, cY + 2]], () => R.ink[0]);
  const coreR = g > 0.5 ? R.ember : R.thorn;
  ellipse(tor, cX, cY, 3.6, 4, (x, y, nx, ny, nz) => tone(coreR, lit(nx, ny, nz) + 0.3 + g * 0.3, 0, true));
  if (g > 0.5) { tor.set(cX - 1, cY - 1, R.white[0]); tor.set(cX, cY - 1, R.ember[4]); }
  composite(buf, tor, { edge: true });
  // 머리 (움푹 들어간 석판 얼굴)
  const hd = part();
  const hx = 25 + ox, hy = 31 + oy + (p.head ?? 0);
  poly(hd, [[hx - 6, hy - 5], [hx + 5, hy - 6], [hx + 7, hy + 3], [hx + 1, hy + 7], [hx - 6, hy + 4]], (x, y) => tone(R.stone, lit((x - hx) / 7, (y - hy) / 7, 0.7), 0));
  hd.set(hx - 3, hy - 1, R.echo[4]); hd.set(hx - 2, hy - 1, R.echo[3]); hd.set(hx + 2, hy - 1, R.echo[3]);
  line(hd, hx - 4, hy + 3, hx + 2, hy + 4, R.stone[1]);
  composite(buf, hd, { edge: true });
  // 가까운 팔
  const na = part();
  capsule(na, shN[0], shN[1], eN[0], eN[1], 6.5, 5.5, barkS);
  capsule(na, eN[0], eN[1], fN[0], fN[1], 5.5, 5, barkS);
  ellipse(na, fN[0], fN[1], 7.5, 6.5, rampShader(R.stone, 0));
  // 주먹 틈 이끼
  na.set(Math.round(fN[0] + 2), Math.round(fN[1] - 4), R.moss[3]);
  na.set(Math.round(fN[0] + 3), Math.round(fN[1] - 4), R.moss[2]);
  poly(na, [[shN[0] - 4, shN[1] - 4], [shN[0] + 5, shN[1] - 6], [shN[0] + 6, shN[1]], [shN[0] - 5, shN[1] + 2]], (x, y) => tone(R.moss, lit(-0.2, -0.7, 0.6), 0));
  composite(buf, na, { edge: true });
  return { buf, weak: [wp('core', cX, cY, 3.5, 6)], attach: { fist: [Math.round(fN[0]), Math.round(fN[1])], core: [cX, cY] } };
}

export function colossusSheet(): SheetSpec {
  const F = (p: ColP, ms: number, tag?: EFrame<ColP>['tag']): EFrame<ColP> => ({ p, ms, tag });
  return buildEnemySheet<ColP>({
    id: 'colossus', kind: 'enemy', w: 88, h: 96, anchor: [46, 95], draw: drawColossus,
    anims: {
      idle: [F({}, 200, 'idle'), F({ crouch: 0.3, fN: [22, 79], fF: [70, 77] }, 200, 'idle'), F({ crouch: 0.5, fN: [22, 80], fF: [70, 78] }, 200, 'idle'), F({ crouch: 0.3, fN: [22, 79] }, 200, 'idle')],
      slam: [
        F({ lean: -3, eN: [30, 30], fN: [34, 14], eF: [60, 26], fF: [58, 12], head: -1 }, 160, 'anticipation'),
        F({ lean: -4, crouch: -0.5, eN: [30, 28], fN: [36, 11], eF: [60, 24], fF: [58, 9], head: -2, glow: 0.3 }, 180, 'anticipation'),
        F({ lean: 4, eN: [22, 44], fN: [16, 60], eF: [52, 44], fF: [44, 60] }, 60, 'attack'),
        F({ lean: 7, crouch: 1.5, eN: [20, 62], fN: [14, 86], eF: [50, 62], fF: [40, 86], head: 2 }, 100, 'contact'),
        F({ lean: 5, crouch: 1, eN: [22, 62], fN: [16, 84], eF: [52, 62], fF: [42, 84] }, 140, 'recovery'),
        F({ lean: 2, crouch: 0.5 }, 120, 'recovery'),
      ],
      sweep: [
        F({ lean: -2, eN: [44, 62], fN: [62, 80], head: -1 }, 150, 'anticipation'),
        F({ lean: -3, eN: [46, 64], fN: [66, 84], head: -1, step: 1 }, 160, 'anticipation'),
        F({ lean: 3, eN: [24, 70], fN: [16, 86] }, 60, 'attack'),
        F({ lean: 6, crouch: 1, eN: [16, 72], fN: [6, 86], step: -1 }, 100, 'contact'),
        F({ lean: 3, crouch: 0.6, eN: [20, 68], fN: [12, 84] }, 140, 'recovery'),
      ],
      charge: [
        F({ lean: -1, eN: [18, 50], fN: [10, 56], eF: [74, 48], fF: [82, 52], glow: 0.6 }, 200, 'anticipation'),
        F({ lean: -2, crouch: -0.4, eN: [18, 48], fN: [9, 52], eF: [74, 46], fF: [82, 48], glow: 1, head: -2 }, 200, 'anticipation'),
        F({ lean: 3, eN: [22, 54], fN: [12, 60], eF: [70, 52], fF: [78, 58], glow: 1 }, 100, 'contact'),
        F({ lean: 1, crouch: 0.5, glow: 0.4 }, 160, 'recovery'),
      ],
      hurt: [F({ lean: -4, head: -2, fN: [26, 74] }, 100, 'hurt'), F({ lean: -2, head: -1 }, 100, 'hurt')],
      break: [F({ lean: 5, crouch: 2.5, head: 4, eN: [22, 70], fN: [18, 88], eF: [60, 70], fF: [64, 88] }, 240, 'break'), F({ lean: 5, crouch: 2.8, head: 5, eN: [22, 71], fN: [18, 88], eF: [60, 71], fF: [64, 88] }, 240, 'break')],
    },
    death: { from: { lean: 4, crouch: 2, head: 3 } },
    required: ['idle', 'slam', 'sweep', 'charge', 'hurt', 'break', 'death'],
  });
}

/* ============================================================
 * 껍질 짐승 — 판갑 등껍질과 뿔. 껍질 이음새를 맞히면 갑옷이 벗겨진다.
 * ============================================================ */
interface ShellP { lunge?: number; crouch?: number; head?: number; tail?: number; broken?: boolean; lp?: number; curl?: number }

function drawShell(p: ShellP): Drawn {
  const W = 88, H = 72;
  const buf = new PixelBuffer(W, H);
  const part = () => new PixelBuffer(W, H);
  const ox = -(p.lunge ?? 0), oy = (p.crouch ?? 0) * 2;
  const cx = 50 + ox, cy = 42 + oy;
  const lp = p.lp ?? 0;
  const ground = 69;
  // 먼 다리
  const fl = part();
  for (const [x, s] of [[cx - 16, 1], [cx + 14, -1]] as [number, number][]) {
    capsule(fl, x + 3, cy + 10, x + 3 + lp * s, ground - 1, 3.2, 2.8, rampShader(R.rock, -1));
  }
  composite(buf, fl, { edge: false });
  // 꼬리
  const tl = part();
  const ta = p.tail ?? 0;
  const tp = quadPoints([cx + 22, cy + 6], [cx + 30, cy + 10 - ta * 4], [cx + 36 + ta * 2, cy + 20 - ta * 10], 6);
  tp.forEach(([x, y], i) => ellipse(tl, x, y, 3.2 - i * 0.35, 2.6 - i * 0.3, rampShader(R.rock, 0)));
  composite(buf, tl, { edge: true });
  // 배 / 몸통 아랫부분
  const bd = part();
  ellipse(bd, cx - 2, cy + 8, 22, 8, rampShader(R.earth, 0));
  composite(buf, bd, { edge: true });
  // 등껍질
  const sh = part();
  const broken = !!p.broken;
  ellipse(sh, cx, cy, 26, 17 - (p.curl ?? 0) * 2, (x, y, nx, ny, nz) => {
    if (y > cy + 8) return -1 as any;
    const I = lit(nx, ny, nz);
    const band = Math.floor((x - (cx - 26)) / 10.4);
    const seamX = cx - 26 + (band + 1) * 10.4;
    if (!broken && Math.abs(x + 0.5 - seamX) < 0.8 && band < 4) return band === 2 ? R.thorn[3] : R.ink[1];
    if (broken && band >= 1 && band <= 3 && ny < 0.3) {
      // 벗겨진 등: 붉은 속살과 금
      if ((x + y) % 7 === 0) return R.thorn[4];
      return tone(R.root, I, 0);
    }
    return tone(R.rock, I + (band % 2 ? -0.08 : 0.05), 0, true);
  });
  // 등 가시
  if (!broken) for (let i = 0; i < 4; i++) {
    const sx = cx - 15 + i * 10, sy = cy - 16 + (i === 1 || i === 2 ? -1 : 1);
    poly(sh, [[sx - 2, sy + 2], [sx + 2, sy + 2], [sx + 1, sy - 4]], (x) => (x < sx ? R.thorn[3] : R.thorn[2]));
  } else {
    for (let i = 0; i < 3; i++) { const sx = cx - 8 + i * 9; line(sh, sx, cy - 12, sx + 3, cy - 6, R.ink[1]); }
  }
  // 이끼 반점
  poly(sh, [[cx - 20, cy - 6], [cx - 14, cy - 12], [cx - 9, cy - 9], [cx - 14, cy - 5]], (x, y) => tone(R.moss, lit(-0.3, -0.5, 0.7), 0));
  composite(buf, sh, { edge: true });
  // 머리 + 뿔
  const hd = part();
  const hx = cx - 28, hy = cy + 6 + (p.head ?? 0);
  ellipse(hd, hx, hy, 7, 5.5, rampShader(R.earth, 0));
  poly(hd, [[hx - 5, hy - 3], [hx - 14, hy - 12 + (p.head ?? 0) * 0.5], [hx - 11, hy - 4], [hx - 7, hy + 1]], (x, y) => tone(R.bone, lit(-0.3, -0.5, 0.7) + (x < hx - 10 ? 0.2 : 0), 0));
  poly(hd, [[hx - 1, hy - 5], [hx + 5, hy - 5], [hx + 4, hy - 1], [hx - 2, hy - 1]], () => R.rock[2]);
  hd.set(hx - 3, hy - 1, R.ember[4]); hd.set(hx - 2, hy - 1, R.ember[3]);
  line(hd, hx - 6, hy + 3, hx - 1, hy + 4, R.earth[1]);
  composite(buf, hd, { edge: true });
  // 가까운 다리
  const nl = part();
  for (const [x, s] of [[cx - 20, -1], [cx + 10, 1]] as [number, number][]) {
    capsule(nl, x + 2, cy + 9, x + 2 + lp * s, ground - 1, 3.8, 3.2, rampShader(R.rock, 0, false));
    poly(nl, [[x - 2 + lp * s, ground - 2], [x + 6 + lp * s, ground - 2], [x + 6 + lp * s, ground], [x - 3 + lp * s, ground]], () => R.bone[2]);
  }
  composite(buf, nl, { edge: true });
  const weak = broken ? [wp('flesh', cx - 1, cy - 8, 4, 7)] : [wp('seam', Math.round(cx - 26 + 31.2), cy - 4, 2.5, 5.5)];
  return { buf, weak, attach: { horn: [hx - 13, hy - 10], core: [cx, cy] } };
}

export function shellSheet(broken: boolean): SheetSpec {
  const F = (p: ShellP, ms: number, tag?: EFrame<ShellP>['tag']): EFrame<ShellP> => ({ p: { ...p, broken }, ms, tag });
  return buildEnemySheet<ShellP>({
    id: broken ? 'shellbeast_broken' : 'shellbeast', kind: 'enemy', w: 88, h: 72, anchor: [46, 71], draw: drawShell,
    anims: {
      idle: [F({}, 200, 'idle'), F({ crouch: 0.4, tail: 0.2 }, 200, 'idle'), F({ crouch: 0.6, tail: 0.3 }, 200, 'idle'), F({ crouch: 0.3, tail: 0.1 }, 200, 'idle')],
      ram: [
        F({ lunge: -4, crouch: 1, head: 2, lp: -1 }, 150, 'anticipation'),
        F({ lunge: -6, crouch: 1.5, head: 3, lp: -2 }, 180, 'anticipation'),
        F({ lunge: 8, head: 1, lp: 2 }, 60, 'attack'),
        F({ lunge: 14, head: -2, lp: 3 }, 90, 'contact'),
        F({ lunge: 6, lp: 1 }, 140, 'recovery'),
      ],
      tailsweep: [
        F({ lunge: 2, tail: 1, crouch: 0.5 }, 150, 'anticipation'),
        F({ lunge: 3, tail: 1.4, crouch: 0.8 }, 160, 'anticipation'),
        F({ lunge: -1, tail: -0.6, crouch: 0.4 }, 60, 'attack'),
        F({ lunge: 0, tail: -0.9, crouch: 0.2 }, 90, 'contact'),
        F({ lunge: 0, tail: 0 }, 140, 'recovery'),
      ],
      hurt: [F({ lunge: -3, head: -2, crouch: -0.3 }, 100, 'hurt'), F({ lunge: -1, head: -1 }, 100, 'hurt')],
      break: [F({ crouch: 3, head: 4, curl: 1 }, 220, 'break'), F({ crouch: 3.2, head: 4.5, curl: 1 }, 220, 'break')],
    },
    death: { from: { crouch: 3, head: 4 } },
    required: ['idle', 'ram', 'tailsweep', 'hurt', 'break', 'death'],
  });
}
