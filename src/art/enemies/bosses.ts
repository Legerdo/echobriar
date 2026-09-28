import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { capsule, ellipse, poly, rampShader, line, tone, lit, Pt, quadPoints, polyline } from '../core/draw';
import { composite, darkenAll } from '../core/post';
import { buildEnemySheet, Drawn, EFrame, wp } from './common';
import type { SheetSpec } from '../core/sheet';

const BW = 128, BH = 112;

/* ============================================================
 * 두 번째 수호자 — 유리사슴 에이렌 (정밀 시험)
 * 약점: 뿔 결정(광선 충전 취소, 파괴 가능), 갑주 고정쇠(갑옷 제거), 가슴 핵
 * ============================================================ */
interface StagP { lunge?: number; rear?: number; headDown?: number; glow?: number; broken?: boolean; armorOff?: boolean; lp?: number; slump?: number }

function drawStag(p: StagP): Drawn {
  const buf = new PixelBuffer(BW, BH);
  const part = () => new PixelBuffer(BW, BH);
  const ox = -(p.lunge ?? 0);
  const rear = p.rear ?? 0;
  const sl = p.slump ?? 0;
  const bx = 76 + ox, by = 60 - rear * 3 + sl * 8;
  const hd = p.headDown ?? 0;
  const hx = 38 + ox + hd * 4, hy = 30 - rear * 8 + hd * 14 + sl * 14;
  const lp = p.lp ?? 0;
  const G = 108;
  const fur = R.bone;
  const furS = rampShader(fur, 0), farS = rampShader(fur, -1);
  // 먼 쪽 다리
  const fl = part();
  const frontFarHoof: Pt = [60 + ox + lp - rear * 4, G - rear * 18];
  capsule(fl, bx - 12, by + 6, bx - 14 - rear * 2, by + 24 - rear * 10, 3.2, 2.4, farS);
  capsule(fl, bx - 14 - rear * 2, by + 24 - rear * 10, frontFarHoof[0], frontFarHoof[1], 2.2, 1.8, farS);
  capsule(fl, bx + 20, by + 4, bx + 24, by + 18, 4, 3, farS);
  capsule(fl, bx + 24, by + 18, bx + 21, by + 32, 2.4, 2, farS);
  capsule(fl, bx + 21, by + 32, bx + 22 - lp, G, 2, 1.8, farS);
  composite(buf, fl, { edge: false });
  // 몸통
  const body = part();
  ellipse(body, bx, by, 24, 12, (x, y, nx, ny, nz) => (ny > 0.6 ? tone(R.bone, lit(nx, ny, nz) - 0.3, -1) : tone(fur, lit(nx, ny, nz), 0)));
  // 등의 수정 돌기
  for (let i = 0; i < 5; i++) {
    const sx = bx - 14 + i * 7, sy = by - 11 + (i % 2);
    poly(body, [[sx - 2, sy + 2], [sx + 2, sy + 2], [sx + 1, sy - 5 - (i % 2) * 2]], (x) => (x <= sx ? R.glass[4] : R.glass[2]));
  }
  // 꼬리
  poly(body, [[bx + 22, by - 6], [bx + 29, by - 9], [bx + 27, by - 3]], () => fur[3]);
  composite(buf, body, { edge: true });
  // 갑주판 (옆구리 + 가슴)
  if (!p.armorOff) {
    const ar = part();
    poly(ar, [[bx - 16, by - 9], [bx + 6, by - 11], [bx + 10, by + 4], [bx - 12, by + 8]], (x, y) => (y === by - 10 || y === by - 9 ? R.brass[3] : tone(R.steel, lit((x - bx) / 20, (y - by) / 12, 0.8) - 0.1, 0, true)));
    poly(ar, [[bx - 26, by - 6], [bx - 16, by - 9], [bx - 12, by + 8], [bx - 24, by + 6]], (x, y) => tone(R.steel, lit(-0.6, 0, 0.8) - 0.05, 0, true));
    // 고정쇠
    for (const [cx, cy] of [[bx - 12, by - 4], [bx + 6, by - 6]] as Pt[]) {
      ellipse(ar, cx, cy, 2.2, 2.2, rampShader(R.brass, 0, true, 0.2));
      ar.set(cx, cy, R.thorn[4]);
    }
    composite(buf, ar, { edge: true });
  }
  // 가슴 핵
  const core = part();
  const cX = bx - 22, cY = by + 1;
  poly(core, [[cX, cY - 5], [cX + 4, cY], [cX, cY + 5], [cX - 3, cY]], (x) => (x < cX ? R.echo[4] : R.echo[2]));
  composite(buf, core, { edge: true });
  // 목과 머리
  const nk = part();
  capsule(nk, bx - 18, by - 6, hx + 5, hy + 6, 7, 5, furS);
  // 갈기 (수정)
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const mx = bx - 16 + (hx + 6 - (bx - 16)) * t, my = by - 10 + (hy + 2 - (by - 10)) * t;
    poly(nk, [[mx - 1, my + 1], [mx + 3, my + 1], [mx + 4, my - 4]], () => R.glass[3]);
  }
  ellipse(nk, hx, hy, 7, 5.5, rampShader(fur, 0));
  poly(nk, [[hx - 3, hy - 3], [hx - 13, hy + 2], [hx - 12, hy + 5], [hx - 2, hy + 4]], (x, y) => tone(fur, lit(-0.2, (y - hy) / 6, 0.8) + 0.1, 0));
  nk.set(hx - 12, hy + 2, R.ink[1]);
  nk.set(hx - 3, hy - 1, R.glass[4]); nk.set(hx - 2, hy - 1, R.echo[3]); nk.set(hx - 3, hy - 2, R.glass[3]);
  poly(nk, [[hx + 3, hy - 4], [hx + 6, hy - 4], [hx + 10, hy - 9]], () => fur[2]);
  composite(buf, nk, { edge: true });
  // 뿔 결정
  const an = part();
  const g = p.glow ?? 0;
  const ramp = g > 0.5 ? R.echo : R.glass;
  const base: Pt = [hx + 1, hy - 5];
  if (!p.broken) {
    const branches: Pt[][] = [
      [base, [hx + 4, hy - 14], [hx + 10, hy - 22], [hx + 16, hy - 28]],
      [[hx + 4, hy - 14], [hx - 2, hy - 20], [hx - 5, hy - 27]],
      [[hx + 10, hy - 22], [hx + 18, hy - 22], [hx + 24, hy - 25]],
      [base, [hx - 4, hy - 11], [hx - 9, hy - 16]],
    ];
    for (const b of branches) {
      for (let i = 0; i < b.length - 1; i++) {
        capsule(an, b[i][0], b[i][1], b[i + 1][0], b[i + 1][1], 1.8 - i * 0.3, 1.4 - i * 0.3, (x, y, nx, ny, nz) => tone(ramp, lit(nx, ny, nz) + 0.2 + g * 0.3, 0, true));
      }
    }
  } else {
    // 부러진 뿔 그루터기
    capsule(an, base[0], base[1], hx + 3, hy - 10, 2.2, 1.6, (x, y, nx, ny, nz) => tone(R.glass, lit(nx, ny, nz), -1));
    poly(an, [[hx + 1, hy - 10], [hx + 5, hy - 10], [hx + 4, hy - 13]], () => R.glass[4]);
  }
  composite(buf, an, { edge: true });
  // 가까운 다리
  const nl = part();
  const frontHoof: Pt = [52 + ox - lp - rear * 6, G - rear * 22];
  capsule(nl, bx - 16, by + 5, bx - 20 - rear * 3, by + 24 - rear * 12, 3.8, 2.8, furS);
  capsule(nl, bx - 20 - rear * 3, by + 24 - rear * 12, frontHoof[0], frontHoof[1], 2.6, 2.0, furS);
  poly(nl, [[frontHoof[0] - 3, frontHoof[1] - 1], [frontHoof[0] + 2, frontHoof[1] - 1], [frontHoof[0] + 2, frontHoof[1] + 1], [frontHoof[0] - 3, frontHoof[1] + 1]], () => R.stone[2]);
  capsule(nl, bx + 14, by + 3, bx + 19, by + 17, 4.6, 3.4, furS);
  capsule(nl, bx + 19, by + 17, bx + 15, by + 32, 2.8, 2.2, furS);
  capsule(nl, bx + 15, by + 32, bx + 15 + lp, G, 2.2, 2.0, furS);
  poly(nl, [[bx + 12 + lp, G - 1], [bx + 17 + lp, G - 1], [bx + 17 + lp, G + 1], [bx + 12 + lp, G + 1]], () => R.stone[2]);
  composite(buf, nl, { edge: true });

  const weak = [wp('core', cX, cY, 2.5, 5.5)];
  if (!p.broken) weak.push(wp('antler', hx + 4, hy - 14, 2.5, 6));
  if (!p.armorOff) weak.push(wp('clasp', bx - 12, by - 4, 2.2, 5.5));
  return { buf, weak, attach: { head: [hx - 6, hy], antler: [hx + 8, hy - 20], core: [cX, cY] } };
}

/** full=온전, broken=뿔 파괴, open=갑옷 고정쇠 파괴, bare=둘 다 파괴 */
export function stagSheet(variant: 'full' | 'broken' | 'open' | 'bare'): SheetSpec {
  const flags: StagP = variant === 'full' ? {} : variant === 'broken' ? { broken: true } : variant === 'open' ? { armorOff: true } : { broken: true, armorOff: true };
  const F = (p: StagP, ms: number, tag?: EFrame<StagP>['tag']): EFrame<StagP> => ({ p: { ...p, ...flags }, ms, tag });
  return buildEnemySheet<StagP>({
    id: variant === 'full' ? 'stag' : `stag_${variant}`, kind: 'boss', w: BW, h: BH, anchor: [70, 111], draw: drawStag,
    anims: {
      idle: [F({}, 220, 'idle'), F({ lp: 0, glow: 0.2 }, 220, 'idle'), F({ rear: 0.1 }, 220, 'idle'), F({}, 220, 'idle')],
      charge: [
        F({ lunge: -4, headDown: 0.6, lp: -2 }, 160, 'anticipation'),
        F({ lunge: -6, headDown: 1, lp: -3 }, 200, 'anticipation'),
        F({ lunge: 10, headDown: 1, lp: 3 }, 60, 'attack'),
        F({ lunge: 18, headDown: 0.8, lp: 4 }, 90, 'contact'),
        F({ lunge: 8, headDown: 0.3, lp: 1 }, 150, 'recovery'),
      ],
      beam: [
        F({ rear: 0.4, glow: 0.8 }, 200, 'anticipation'),
        F({ rear: 0.7, glow: 1 }, 240, 'hold'),
        F({ rear: 0.2, headDown: 0.2, glow: 1 }, 100, 'contact'),
        F({ glow: 0.3 }, 160, 'recovery'),
      ],
      stomp: [
        F({ rear: 0.8 }, 170, 'anticipation'),
        F({ rear: 1 }, 180, 'anticipation'),
        F({ rear: 0, lunge: 4, headDown: 0.3 }, 100, 'contact'),
        F({ lunge: 2 }, 150, 'recovery'),
      ],
      hurt: [F({ lunge: -4, rear: 0.2, headDown: -0.3 }, 110, 'hurt'), F({ lunge: -2 }, 110, 'hurt')],
      break: [F({ slump: 1, headDown: 0.5 }, 260, 'break'), F({ slump: 1.1, headDown: 0.6 }, 260, 'break')],
    },
    death: { from: { slump: 1, headDown: 0.6 }, frames: 8 },
    required: ['idle', 'charge', 'beam', 'stomp', 'hurt', 'break', 'death'],
  });
}

/* ============================================================
 * 세 번째 수호자 — 폭풍 합창자 벨루스 (빌드 시험)
 * 세 개의 합창 구슬(런타임 별도 스프라이트)이 궤도를 돈다. 약점: 가슴의 뇌정 결정.
 * ============================================================ */
interface ChorP { spread?: number; hand?: Pt; bob?: number; glow?: number; ph?: number; t?: number; slump?: number }

function drawChorister(p: ChorP): Drawn {
  const buf = new PixelBuffer(BW, BH);
  const part = () => new PixelBuffer(BW, BH);
  const bob = (p.bob ?? 0) + (p.slump ?? 0) * 10;
  const cx = 66, cy = 46 + bob;
  const ph = p.ph ?? 0;
  const sp = p.spread ?? 0.5;
  const g = p.glow ?? 0;
  // 후광
  const halo = part();
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    halo.set(Math.round(cx + 4 + Math.cos(t) * 13), Math.round(cy - 18 + Math.sin(t) * 13), a % 8 === 0 ? R.gold[4] : R.gold[2]);
  }
  composite(buf, halo, { edge: false });
  // 날개 (먼 쪽, 크고 위로)
  const wing = (side: number, shift: number) => {
    const w = part();
    const rootX = cx + 6 * side + 4, rootY = cy - 4;
    const feathers = 6;
    for (let i = 0; i < feathers; i++) {
      const a = (-100 - side * 20 + (i - feathers / 2) * (14 + sp * 10)) * (Math.PI / 180);
      const L = 30 + (i % 2) * 6 - Math.abs(i - 2.5) * 3 + sp * 8;
      const tip: Pt = [rootX + Math.cos(a) * L * (side > 0 ? 1 : -1) * -1, rootY + Math.sin(a) * L];
      const mid: Pt = [(rootX + tip[0]) / 2 + side * 3, (rootY + tip[1]) / 2 + 2];
      poly(w, [[rootX, rootY], [mid[0] - 3, mid[1]], tip, [mid[0] + 3, mid[1] + 3]], (x, y) => tone(R.storm, lit(side * 0.3, (y - rootY) / 30, 0.7) - 0.35 + (i % 2 ? 0.12 : -0.05), shift, false));
      line(w, rootX, rootY, tip[0], tip[1], R.storm[shift < 0 ? 1 : 2]);
      buf.set(Math.round(tip[0]), Math.round(tip[1]), R.storm[3]);
    }
    return w;
  };
  // 두 날개 모두 몸 뒤에 그린다 (먼 쪽 → 가까운 쪽)
  composite(buf, wing(1, -1), { edge: true });
  composite(buf, wing(-1, 0), { edge: true });
  // 치맛자락 (떠 있는 누더기)
  const robe = part();
  const pts: Pt[] = [[cx - 8, cy + 10], [cx + 9, cy + 10]];
  for (let i = 0; i <= 8; i++) {
    const x = cx + 12 - i * 3.2;
    const y = cy + 44 + Math.sin(i * 1.7 + ph) * 3 + (i % 2) * 4;
    pts.push([x + Math.sin(ph + i) * 1.5, y]);
  }
  poly(robe, pts, (x, y) => {
    let I = lit((x - cx) / 14, (y - cy) / 50, 0.8);
    if ((x + Math.floor(ph)) % 6 === 0) I -= 0.4;
    return tone(y > cy + 30 ? R.storm : R.plum, I, 0);
  });
  composite(buf, robe, { edge: true });
  // 몸통
  const tor = part();
  poly(tor, [[cx - 8, cy - 8], [cx + 8, cy - 8], [cx + 7, cy + 12], [cx - 7, cy + 12]], (x, y) => tone(R.plum, lit((x - cx) / 9, -0.3 + (y - cy) / 30, 0.8), 0));
  // 뇌정 결정 (가슴)
  poly(tor, [[cx - 2, cy - 1], [cx + 1, cy - 5], [cx + 4, cy - 1], [cx + 1, cy + 4]], (x) => (g > 0.5 ? R.storm[4] : x < cx + 1 ? R.storm[4] : R.storm[3]));
  line(tor, cx - 8, cy + 8, cx + 7, cy + 8, R.gold[2]);
  composite(buf, tor, { edge: true });
  // 가면
  const hd = part();
  const hx = cx - 2, hy = cy - 17;
  ellipse(hd, hx + 4, hy, 8, 8, rampShader(R.plum, -1));
  ellipse(hd, hx, hy + 1, 6, 7, rampShader(R.bone, 0, true));
  for (const [dx, dy] of [[-3, -1], [1, -1], [-1, 2]] as Pt[]) {
    line(hd, hx + dx - 1, hy + dy, hx + dx + 1, hy + dy, g > 0.5 ? R.storm[4] : R.storm[3]);
  }
  composite(buf, hd, { edge: true });
  // 팔 (가까운 쪽)
  const arm = part();
  const hand = p.hand ?? [cx - 16, cy + 8];
  const el: Pt = [(cx - 6 + hand[0]) / 2 - 2, (cy - 5 + hand[1]) / 2 + 3];
  capsule(arm, cx - 6, cy - 5, el[0], el[1], 2.5, 2.2, rampShader(R.plum, 0));
  capsule(arm, el[0], el[1], hand[0], hand[1], 2.2, 1.8, rampShader(R.plum, 0));
  ellipse(arm, hand[0], hand[1], 2.2, 2.2, rampShader(g > 0.5 ? R.storm : R.bone, 0, true));
  composite(buf, arm, { edge: true });
  const T = p.t ?? 0;
  const orbs: Record<string, [number, number]> = {};
  for (let i = 0; i < 3; i++) {
    const a = T + (i * Math.PI * 2) / 3;
    orbs[`orb${i}`] = [Math.round(cx + Math.cos(a) * 38), Math.round(cy + 14 + Math.sin(a) * 9)];
  }
  return { buf, weak: [wp('heart', cx + 1, cy - 1, 2.5, 5.5)], attach: { ...orbs, hand: [Math.round(hand[0]), Math.round(hand[1])], core: [cx, cy] } };
}

export function choristerSheet(): SheetSpec {
  const F = (p: ChorP, ms: number, tag?: EFrame<ChorP>['tag']): EFrame<ChorP> => ({ p, ms, tag });
  return buildEnemySheet<ChorP>({
    id: 'chorister', kind: 'boss', w: BW, h: BH, anchor: [66, 111], draw: drawChorister,
    anims: {
      idle: [0, 1, 2, 3].map((i) => F({ bob: i === 1 || i === 2 ? -1 : 0, ph: i * 1.5, t: i * 0.4, spread: 0.5 + (i % 2) * 0.1 }, 200, 'idle')),
      gust: [
        F({ spread: 1, hand: [52, 36], ph: 0, t: 0.2, glow: 0.3 }, 150, 'anticipation'),
        F({ spread: 1.2, hand: [54, 30], ph: 1, t: 0.4, glow: 0.6, bob: -2 }, 160, 'anticipation'),
        F({ spread: 0.1, hand: [40, 46], ph: 2, t: 0.6, glow: 0.4 }, 60, 'attack'),
        F({ spread: 0, hand: [38, 48], ph: 3, t: 0.8, glow: 0.2 }, 90, 'contact'),
        F({ spread: 0.5, ph: 4, t: 1.0 }, 140, 'recovery'),
      ],
      thunder: [
        F({ spread: 0.7, hand: [56, 20], glow: 1, ph: 1, t: 0.3 }, 200, 'anticipation'),
        F({ spread: 0.8, hand: [56, 16], glow: 1, ph: 2, t: 0.5, bob: -2 }, 220, 'hold'),
        F({ spread: 0.4, hand: [40, 44], glow: 1, ph: 3, t: 0.7 }, 100, 'contact'),
        F({ spread: 0.5, ph: 4, t: 0.9 }, 150, 'recovery'),
      ],
      chorus: [
        F({ spread: 1.3, hand: [50, 28], glow: 1, ph: 0, t: 0 }, 220, 'anticipation'),
        F({ spread: 1.5, hand: [50, 24], glow: 1, ph: 1, t: 0.6, bob: -3 }, 260, 'hold'),
        F({ spread: 1.6, hand: [44, 40], glow: 1, ph: 2, t: 1.2, bob: -2 }, 110, 'contact'),
        F({ spread: 0.6, ph: 3, t: 1.8 }, 160, 'recovery'),
      ],
      downdraft: [
        F({ spread: 1.2, hand: [56, 26], bob: -4, ph: 0, t: 0.2 }, 170, 'anticipation'),
        F({ spread: 1.4, hand: [56, 24], bob: -6, ph: 1, t: 0.4 }, 180, 'anticipation'),
        F({ spread: 0, hand: [46, 56], bob: 4, ph: 2, t: 0.6 }, 100, 'contact'),
        F({ spread: 0.5, ph: 3, t: 0.8 }, 150, 'recovery'),
      ],
      hurt: [F({ spread: 0.2, hand: [58, 40], ph: 1, bob: -1, t: 0.2 }, 110, 'hurt'), F({ spread: 0.4, ph: 2, t: 0.3 }, 110, 'hurt')],
      break: [F({ slump: 1, spread: 0.1, hand: [52, 70], ph: 0, t: 0 }, 260, 'break'), F({ slump: 1.1, spread: 0.1, hand: [52, 71], ph: 1, t: 0.2 }, 260, 'break')],
    },
    death: { from: { slump: 0.6, spread: 0.2 }, frames: 8 },
    required: ['idle', 'gust', 'thunder', 'chorus', 'downdraft', 'hurt', 'break', 'death'],
  });
}

/** 합창 구슬 (파괴 가능한 부위) */
export function orbSheet(): SheetSpec {
  const draw = (p: { ph: number; shield?: boolean; crack?: boolean }): Drawn => {
    const b = new PixelBuffer(24, 24);
    const cx = 12, cy = 12;
    ellipse(b, cx, cy, 6, 6, (x, y, nx, ny, nz) => tone(R.storm, lit(nx, ny, nz) + 0.15, 0, true));
    b.set(cx - 2, cy - 2, R.white[0]);
    const a = p.ph;
    for (let i = 0; i < 3; i++) {
      const t = a + (i * Math.PI * 2) / 3;
      b.set(Math.round(cx + Math.cos(t) * 8), Math.round(cy + Math.sin(t) * 8), p.shield ? R.gold[4] : R.storm[3]);
    }
    if (p.shield) for (let k = 0; k < 40; k++) { const t = (k / 40) * Math.PI * 2; if (k % 3) b.set(Math.round(cx + Math.cos(t) * 10), Math.round(cy + Math.sin(t) * 10), R.gold[3]); }
    if (p.crack) { line(b, cx - 3, cy - 4, cx + 1, cy + 2, R.ink[1]); line(b, cx + 1, cy + 2, cx + 4, cy + 1, R.ink[1]); }
    return { buf: b, weak: [wp('orb', cx, cy, 5, 7)] };
  };
  const F = (p: { ph: number; shield?: boolean; crack?: boolean }, ms: number, tag?: EFrame<any>['tag']) => ({ p, ms, tag });
  return buildEnemySheet({
    id: 'orb', kind: 'enemy', w: 24, h: 24, anchor: [12, 23], draw,
    anims: {
      idle: [0, 1, 2, 3].map((i) => F({ ph: i * 0.5 }, 140, 'idle')),
      shield: [0, 1, 2, 3].map((i) => F({ ph: i * 0.5, shield: true }, 140, 'idle')),
      hurt: [F({ ph: 0, crack: true }, 100, 'hurt')],
      break: [F({ ph: 0, crack: true }, 200, 'break')],
    },
    death: { from: { ph: 0, crack: true }, frames: 5 },
    loops: ['idle', 'shield', 'break'],
  });
}

/* ============================================================
 * 최종 보스 2·3페이즈 — 뿌리 둥지 / 잔향 폭주
 * 심장이 줄기의 세 구멍 사이를 옮겨 다닌다 (이동하는 약점).
 * ============================================================ */
interface NestP { nA?: Pt; fA?: Pt; heart?: number; rise?: number; frenzy?: boolean; glow?: number; lash?: number; slump?: number }
export const HEART_POS: Pt[] = [[58, 54], [80, 70], [54, 86]];

function drawNest(p: NestP): Drawn {
  const buf = new PixelBuffer(BW, BH);
  const part = () => new PixelBuffer(BW, BH);
  const fz = !!p.frenzy;
  const rise = p.rise ?? 0;
  const sl = p.slump ?? 0;
  const lash = p.lash ?? 0;
  const barkR = fz ? R.plum : R.root;
  // 잔향 날개 (폭주)
  if (fz) {
    const wg = part();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const a = (-8 - i * 16) * (Math.PI / 180);
        const L = 46 - i * 4 + (p.glow ?? 0) * 6;
        const rx = 68 + side * 6, ry = 40 - rise;
        const tip: Pt = [rx + Math.cos(a) * L * side, ry + Math.sin(a) * L];
        poly(wg, [[rx, ry], [rx + (tip[0] - rx) * 0.5 - 3, ry + (tip[1] - ry) * 0.5 + 3], tip, [rx + (tip[0] - rx) * 0.5 + 3, ry + (tip[1] - ry) * 0.5 + 5]], () => (i % 2 ? R.echo[2] : R.echo[3]));
      }
    }
    composite(buf, wg, { edge: false });
  }
  // 바닥 뿌리
  const gr = part();
  const roots: [Pt, Pt, Pt, number][] = [
    [[64, 104], [30, 100], [6, 108], 5], [[70, 104], [100, 98], [124, 108], 5], [[60, 106], [40, 108], [18, 110], 3.5],
    [[76, 106], [96, 108], [116, 111], 3.5], [[66, 100], [52, 90], [36, 96], 3],
  ];
  for (const [a, c, b, r] of roots) {
    const pts = quadPoints(a, c, b, 12);
    pts.forEach(([x, y], i) => ellipse(gr, x, y, r * (1 - i / 16), r * 0.8 * (1 - i / 16), rampShader(barkR, -1)));
  }
  composite(buf, gr, { edge: true });
  // 먼 쪽 촉수 팔
  const tendril = (from: Pt, to: Pt, r0: number, shift: number) => {
    const t = part();
    const ctl: Pt = [(from[0] + to[0]) / 2 + Math.sin(lash) * 8, Math.min(from[1], to[1]) - 16];
    const pts = quadPoints(from, ctl, to, 18);
    pts.forEach(([x, y], i) => {
      const r = r0 * (1 - i / 22);
      ellipse(t, x, y, r, r, rampShader(barkR, shift));
      if (i % 4 === 2) { const nx = x + r, ny = y - r; line(t, x, y - r, nx + 2, ny - 2, R.thorn[3]); }
    });
    // 발톱
    const [ex, ey] = to;
    for (const d of [-1, 0, 1]) line(t, ex, ey, ex - 5, ey + d * 3 + 2, R.thorn[4]);
    return t;
  };
  const fA = p.fA ?? [96, 60];
  composite(buf, tendril([80, 44 - rise], fA, 5, -1), { edge: true });
  // 줄기
  const tr = part();
  const T: Pt[] = [[50, 106], [52, 70 - rise + sl * 10], [56, 44 - rise + sl * 12], [66, 36 - rise + sl * 14], [80, 40 - rise + sl * 12], [86, 64 - rise + sl * 8], [90, 106]];
  poly(tr, T, (x, y) => {
    let I = lit((x - 70) / 22, (y - 70) / 50, 0.75);
    // 세로로 꼬인 뿌리 능선 (결정적 굴곡)
    const ridge = Math.round(x + Math.sin(y * 0.18) * 2) % 7;
    if (ridge === 0) I -= 0.45;
    else if (ridge === 1) I += 0.15;
    return tone(barkR, I, 0);
  });
  // 심장 구멍 3개: 불규칙한 타원 개구부와 감싸는 덩굴
  const heart = p.heart ?? 0;
  HEART_POS.forEach(([hx, hy], i) => {
    const y = hy - rise + sl * 8;
    ellipse(tr, hx, y, 5.2, 6.2, (x, yy, nx, ny) => (ny < -0.6 && nx > 0.3 ? barkR[1] : R.ink[0]));
    // 가장자리 덩굴 입술
    polyline(tr, quadPoints([hx - 6, y - 3], [hx, y - 9], [hx + 6, y - 3], 8), barkR[3]);
    polyline(tr, quadPoints([hx - 5, y + 5], [hx + 1, y + 8], [hx + 6, y + 3], 8), barkR[1]);
    if (i === heart) {
      ellipse(tr, hx, y, 3.8, 4.4, (x, yy, nx, ny, nz) => tone(fz ? R.echo : R.thorn, lit(nx, ny, nz) + 0.4 + (p.glow ?? 0) * 0.3, 0, true));
      tr.set(hx - 1, y - 2, R.white[0]);
      tr.set(hx - 2, y - 1, fz ? R.echo[4] : R.thorn[4]);
    } else {
      // 닫힌 구멍: 안쪽에서 꿈틀대는 가시 덩굴
      polyline(tr, quadPoints([hx - 4, y + 3], [hx, y - 5], [hx + 4, y + 3], 6), barkR[2]);
      tr.set(hx, y - 1, R.thorn[2]);
    }
    if (fz) { line(tr, hx + 6, y - 6, hx + 10, y - 12, R.echo[4]); line(tr, hx + 10, y - 12, hx + 13, y - 13, R.echo[3]); }
  });
  composite(buf, tr, { edge: true });
  // 융합된 기사 상체: 넓은 가시 견갑, 면갑 투구
  const up = part();
  const kx = 66, ky = 26 - rise + sl * 14;
  poly(up, [[kx - 13, ky + 6], [kx - 6, ky + 3], [kx + 6, ky + 3], [kx + 13, ky + 6], [kx + 9, ky + 20], [kx - 9, ky + 20]], (x, y) => tone(barkR, lit((x - kx) / 12, -0.3 + (y - ky) / 30, 0.8) + 0.1, 0, true));
  for (const s of [-1, 1]) {
    ellipse(up, kx + s * 11, ky + 7, 4.5, 3.5, rampShader(barkR, s > 0 ? -1 : 0, true));
    poly(up, [[kx + s * 10 - 1.5, ky + 4], [kx + s * 10 + 1.5, ky + 4], [kx + s * 14, ky - 4]], () => R.thorn[3]);
  }
  line(up, kx - 1, ky + 8, kx - 1, ky + 18, barkR[4]);
  ellipse(up, kx - 1, ky - 2, 6.5, 7.5, rampShader(barkR, 0, true));
  poly(up, [[kx - 8, ky - 1], [kx + 2, ky - 1], [kx + 1, ky + 5], [kx - 6, ky + 4]], (x, y) => tone(barkR, lit(-0.3, 0.3, 0.8), 0));
  line(up, kx - 7, ky - 2, kx + 1, ky - 2, R.ink[0]);
  line(up, kx - 6, ky - 2, kx - 2, ky - 2, fz ? R.echo[4] : R.thorn[4]);
  for (let i = 0; i < 5; i++) {
    const x = kx - 6 + i * 3;
    poly(up, [[x - 1.5, ky - 8], [x + 1.5, ky - 8], [x + (i - 2), ky - 16 - (i === 2 ? 3 : 0)]], (px) => (px < x ? (fz ? R.echo[4] : R.thorn[3]) : R.thorn[2]));
  }
  composite(buf, up, { edge: true });
  // 가까운 쪽 촉수 팔
  const nA = p.nA ?? [30, 66];
  composite(buf, tendril([56, 46 - rise + sl * 10], nA, 6, 0), { edge: true });
  const [hx, hy] = HEART_POS[heart];
  return { buf, weak: [wp('heart', hx, hy - rise + sl * 8, 3.5, 7)], attach: { claw: [Math.round(nA[0]), Math.round(nA[1])], core: [hx, hy - rise], head: [kx, ky] } };
}

export function nestSheet(frenzy: boolean): SheetSpec {
  const F = (p: NestP, ms: number, tag?: EFrame<NestP>['tag']): EFrame<NestP> => ({ p: { ...p, frenzy }, ms, tag });
  const idleFor = (h: number) => [0, 1, 2, 3].map((i) => F({ heart: h, lash: i * 0.8, rise: i === 1 || i === 2 ? 1 : 0, glow: i % 2 }, 200, 'idle'));
  return buildEnemySheet<NestP>({
    id: frenzy ? 'frenzy' : 'nest', kind: 'boss', w: BW, h: BH, anchor: [70, 111], draw: drawNest,
    anims: {
      idle: idleFor(0), idle_1: idleFor(1), idle_2: idleFor(2),
      lash: [
        F({ nA: [44, 20], fA: [100, 30], lash: 0, rise: 2 }, 160, 'anticipation'),
        F({ nA: [48, 14], fA: [102, 24], lash: 0.5, rise: 3 }, 180, 'anticipation'),
        F({ nA: [16, 70], fA: [90, 60], lash: 1.5 }, 60, 'attack'),
        F({ nA: [8, 84], fA: [88, 64], lash: 2 }, 90, 'contact'),
        F({ nA: [22, 76], lash: 2.5 }, 140, 'recovery'),
      ],
      quake: [
        F({ nA: [40, 18], fA: [100, 20], rise: 4, glow: 1 }, 170, 'anticipation'),
        F({ nA: [42, 14], fA: [102, 16], rise: 6, glow: 1 }, 190, 'anticipation'),
        F({ nA: [24, 104], fA: [100, 104], rise: -2 }, 100, 'contact'),
        F({ nA: [28, 96], fA: [98, 96] }, 150, 'recovery'),
      ],
      spores: [
        F({ nA: [34, 50], glow: 1, rise: 1 }, 180, 'anticipation'),
        F({ nA: [30, 44], glow: 1, rise: 2 }, 200, 'hold'),
        F({ nA: [20, 60], glow: 0.5 }, 100, 'contact'),
        F({ nA: [28, 64] }, 150, 'recovery'),
      ],
      doom: [
        F({ nA: [40, 10], fA: [104, 10], glow: 1, rise: 6 }, 240, 'anticipation'),
        F({ nA: [38, 6], fA: [106, 6], glow: 1, rise: 8 }, 260, 'hold'),
        F({ nA: [12, 80], fA: [110, 80], glow: 1, rise: 0 }, 110, 'contact'),
        F({ nA: [24, 72], fA: [100, 70] }, 160, 'recovery'),
      ],
      hurt: [F({ nA: [36, 58], fA: [100, 56], rise: -1, lash: 1 }, 110, 'hurt'), F({ lash: 0.5 }, 110, 'hurt')],
      break: [F({ nA: [34, 96], fA: [96, 96], slump: 1, heart: 1 }, 260, 'break'), F({ nA: [34, 98], fA: [96, 98], slump: 1.1, heart: 1 }, 260, 'break')],
    },
    death: { from: { slump: 1, heart: 1, nA: [34, 96], fA: [96, 96] }, frames: 10 },
    required: ['idle', 'idle_1', 'idle_2', 'lash', 'quake', 'spores', 'doom', 'hurt', 'break', 'death'],
  });
}

export { darkenAll, polyline };
