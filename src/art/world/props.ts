import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { ellipse, poly, rampShader, line, tone, lit, Pt, capsule, rect, hash2, quadPoints, polyline } from '../core/draw';
import { composite, selectiveOutline, cleanupOrphans } from '../core/post';
import { AnimBuilder, SheetSpec } from '../core/sheet';

/* 필드 소품 · 필드 적. 모두 코드로 그리며 발 기준(아래 중앙) 앵커를 갖는다. */

type Draw = (b: PixelBuffer, f: number) => void;

function propSheet(id: string, w: number, h: number, anims: Record<string, { n: number; ms: number; draw: Draw; loop?: boolean }>, kind: 'prop' | 'enemy' = 'prop', outline = true): SheetSpec {
  const list = Object.entries(anims).map(([name, a]) => {
    const ab = new AnimBuilder(name, a.loop ?? a.n > 1);
    for (let i = 0; i < a.n; i++) {
      const b = new PixelBuffer(w, h);
      a.draw(b, i);
      cleanupOrphans(b);
      if (outline) selectiveOutline(b);
      ab.add(b, a.ms, { tag: 'idle' });
    }
    return ab.build();
  });
  return { id, kind: kind === 'enemy' ? 'npc' : 'prop', frameW: w, frameH: h, anchor: [Math.floor(w / 2), h - 1], anims: list, required: [list[0].name], maxColors: 48 };
}

const one = (draw: Draw) => ({ idle: { n: 1, ms: 1000, draw } });

/* ---------- 나무 ---------- */
function tree(leaf: readonly number[], trunk: readonly number[], style: 'round' | 'ash' | 'pine' | 'crystal' | 'root'): Draw {
  return (b) => {
    const cx = 16;
    const part = () => new PixelBuffer(b.w, b.h);
    const t = part();
    if (style === 'root') {
      // 얽힌 뿌리 기둥
      for (const [dx, w] of [[-4, 3], [0, 4], [4, 3]] as Pt[]) {
        const pts = quadPoints([cx + dx, 47], [cx + dx * 2, 28], [cx + dx * 0.5, 6], 10);
        pts.forEach(([x, y], i) => ellipse(t, x, y, w - i * 0.15, 1.5, rampShader(trunk, dx > 0 ? -1 : 0)));
      }
      for (let i = 0; i < 5; i++) poly(t, [[cx - 6 + i * 3, 14 + i * 5], [cx - 4 + i * 3, 14 + i * 5], [cx - 9 + i * 4, 10 + i * 5]], () => R.thorn[3]);
      composite(b, t, { edge: false });
      return;
    }
    // 줄기
    capsule(t, cx, 46, cx, 26, 2.6, 1.8, rampShader(trunk, 0));
    line(t, cx - 3, 46, cx - 5, 47, trunk[2]); line(t, cx + 3, 46, cx + 5, 47, trunk[1]);
    if (style === 'ash' || style === 'pine') { line(t, cx, 30, cx - 6, 24, trunk[2]); line(t, cx, 28, cx + 7, 22, trunk[1]); }
    composite(b, t, { edge: false });
    const c = part();
    if (style === 'round' || style === 'ash') {
      const blobs: [number, number, number, number][] = style === 'round'
        ? [[cx, 18, 11, 9], [cx - 7, 23, 7, 6], [cx + 7, 22, 7, 6], [cx - 2, 11, 7, 6]]
        : [[cx - 1, 17, 9, 7], [cx - 8, 22, 5, 4], [cx + 8, 19, 5, 5]];
      for (const [x, y, rx, ry] of blobs) ellipse(c, x, y, rx, ry, (px, py, nx, ny, nz) => {
        const I = lit(nx, ny, nz);
        // 잎 덩어리 안쪽 굴곡: 결정적 클러스터
        const k = hash2(px >> 2, py >> 2, 3) > 0.7 ? -0.25 : 0;
        return tone(leaf, I + k, 0);
      });
      if (style === 'ash') { line(c, cx - 4, 24, cx - 2, 20, R.ash[3]); c.set(cx + 3, 13, R.ember[3]); }
    } else if (style === 'pine') {
      for (let i = 0; i < 4; i++) {
        const y = 8 + i * 7, w = 4 + i * 2.5;
        poly(c, [[cx, y - 5], [cx + w, y + 5], [cx - w, y + 5]], (x, yy) => tone(leaf, lit((x - cx) / w, -0.3, 0.8) + (yy === y + 5 ? -0.3 : 0), 0));
      }
    } else if (style === 'crystal') {
      for (const [x, y, h, w] of [[cx, 6, 26, 4], [cx - 7, 16, 16, 3], [cx + 7, 14, 18, 3], [cx - 3, 20, 12, 2]] as [number, number, number, number][]) {
        poly(c, [[x, y], [x + w, y + h * 0.35], [x + w * 0.6, y + h], [x - w * 0.6, y + h], [x - w, y + h * 0.35]], (px) => (px < x ? leaf[4] : px < x + w * 0.4 ? leaf[3] : leaf[2]));
        c.set(x, y + 1, R.white[0]);
      }
    }
    composite(b, c, { edge: true });
  };
}

/* ---------- 소품 그리기 ---------- */
const rock: Draw = (b) => {
  ellipse(b, 12, 13, 10, 6, rampShader(R.stone, 0));
  ellipse(b, 9, 10, 6, 5, rampShader(R.stone, 0, true));
  line(b, 5, 14, 11, 12, R.stone[1]);
  b.set(15, 8, R.moss[3]); b.set(16, 8, R.moss[2]); b.set(15, 9, R.moss[2]);
};
const crystal: Draw = (b) => {
  for (const [x, y, h, w] of [[8, 4, 19, 3], [4, 12, 11, 2], [12, 10, 13, 2]] as [number, number, number, number][]) {
    poly(b, [[x, y], [x + w, y + 4], [x + w * 0.6, y + h], [x - w * 0.6, y + h], [x - w, y + 4]], (px) => (px < x ? R.glass[4] : R.glass[2]));
  }
  b.set(8, 5, R.white[0]);
};
const bush: Draw = (b) => {
  ellipse(b, 8, 10, 7, 5, (x, y, nx, ny, nz) => tone(R.green, lit(nx, ny, nz) + (hash2(x >> 1, y >> 1, 4) > 0.75 ? -0.3 : 0), 0));
  b.set(5, 7, R.flower[3]); b.set(11, 9, R.flower[2]);
};
const pillar = (broken: boolean): Draw => (b) => {
  const h = b.h;
  rect(b, 3, broken ? 6 : 6, 10, h - 10, R.stone[2]);
  for (let y = 6; y < h - 4; y++) { b.set(3, y, R.stone[3]); b.set(4, y, R.stone[3]); b.set(11, y, R.stone[1]); b.set(12, y, R.stone[1]); if (y % 3 === 0) b.set(8, y, R.stone[1]); }
  rect(b, 1, h - 5, 14, 4, R.stone[2]); line(b, 1, h - 5, 14, h - 5, R.stone[3]);
  if (!broken) { rect(b, 1, 2, 14, 4, R.stone[3]); line(b, 1, 5, 14, 5, R.stone[1]); }
  else { poly(b, [[3, 6], [7, 2], [9, 5], [13, 3], [13, 7], [3, 7]], () => R.stone[2]); b.set(6, 4, R.moss[3]); }
  line(b, 5, h - 12, 8, h - 8, R.stone[1]);
};
const statue: Draw = (b) => {
  rect(b, 3, 32, 18, 7, R.stone[2]); line(b, 3, 32, 20, 32, R.stone[3]);
  poly(b, [[7, 31], [17, 31], [15, 12], [12, 8], [9, 12]], (x, y) => tone(R.stone, lit((x - 12) / 6, -0.2, 0.8), 0));
  ellipse(b, 12, 8, 4, 4.5, rampShader(R.stone, 0));
  line(b, 10, 9, 11, 9, R.stone[1]);
  // 두 손 모아 쥔 뿌리 문양
  line(b, 10, 18, 14, 18, R.stone[1]); line(b, 12, 18, 12, 26, R.echo[1]);
  b.set(12, 18, R.echo[2]);
};
const mural: Draw = (b) => {
  rect(b, 1, 2, 30, 28, R.stone[2]);
  for (let x = 1; x < 31; x++) { b.set(x, 2, R.stone[3]); b.set(x, 29, R.stone[1]); }
  for (let y = 2; y < 30; y++) { b.set(1, y, R.stone[3]); b.set(30, y, R.stone[1]); }
  // 새겨진 세계뿌리와 세 봉인
  polyline(b, quadPoints([16, 26], [15, 18], [16, 8], 6), R.root[3]);
  for (const [a, c2] of [[[16, 22], [8, 26]], [[16, 22], [24, 26]], [[16, 14], [7, 12]], [[16, 14], [25, 11]]] as [Pt, Pt][]) line(b, a[0], a[1], c2[0], c2[1], R.root[2]);
  for (const [x, y, c] of [[8, 8, R.ember[3]], [16, 5, R.glass[3]], [24, 8, R.storm[3]]] as [number, number, number][]) { b.set(x, y, c); b.set(x + 1, y, c); b.set(x, y + 1, c); b.set(x + 1, y + 1, R.gold[3]); }
  line(b, 4, 27, 12, 27, R.stone[1]);
};
const chest = (open: boolean): Draw => (b) => {
  rect(b, 2, 7, 12, 8, R.wood[2]);
  line(b, 2, 7, 13, 7, R.wood[3]); line(b, 2, 14, 13, 14, R.wood[1]);
  for (let y = 7; y < 15; y++) { b.set(2, y, R.brass[2]); b.set(13, y, R.brass[2]); }
  if (!open) {
    poly(b, [[2, 7], [13, 7], [12, 3], [3, 3]], (x, y) => (y === 3 ? R.wood[4] : R.wood[3]));
    line(b, 2, 7, 13, 7, R.brass[3]);
    rect(b, 7, 7, 2, 3, R.brass[3]); b.set(7, 9, R.ink[0]);
  } else {
    poly(b, [[2, 6], [13, 6], [12, 1], [3, 1]], (x, y) => (y < 3 ? R.wood[2] : R.wood[1]));
    rect(b, 4, 7, 8, 2, R.ink[1]);
    b.set(7, 7, R.gold[3]);
  }
};
const rest = (lit_: boolean, f: number): void => void 0;
function restDraw(on: boolean): Draw {
  return (b, f) => {
    // 뿌리로 감싼 등불 기둥
    const cx = 8;
    polyline(b, quadPoints([cx - 4, 31], [cx - 2, 20], [cx - 1, 10], 6), R.root[3]);
    polyline(b, quadPoints([cx + 4, 31], [cx + 2, 20], [cx + 1, 10], 6), R.root[2]);
    polyline(b, quadPoints([cx, 31], [cx + 1, 22], [cx, 12], 6), R.root[3]);
    rect(b, cx - 3, 29, 7, 3, R.stone[2]);
    const g = on ? [R.echo[4], R.echo[3], R.echo[2], R.echo[3]][f % 4] : R.stone[1];
    ellipse(b, cx, 7, 3.5, 4 + (on && f % 2 ? 0.5 : 0), (x, y, nx, ny, nz) => (on ? tone(R.echo, lit(nx, ny, nz) + 0.3, 0, true) : tone(R.stone, lit(nx, ny, nz), 0)));
    b.set(cx - 1, 6, on ? R.white[0] : R.stone[3]);
    if (on) { b.set(cx, 1 - (f % 2), g); b.set(cx + 3, 3 + (f % 3), R.echo[3]); }
  };
}
const sign: Draw = (b) => {
  line(b, 8, 15, 8, 8, R.wood[2]); line(b, 9, 15, 9, 8, R.wood[1]);
  rect(b, 2, 3, 13, 6, R.wood[3]); line(b, 2, 3, 14, 3, R.wood[4]); line(b, 2, 8, 14, 8, R.wood[1]);
  line(b, 4, 5, 11, 5, R.wood[1]); line(b, 4, 6, 9, 6, R.wood[1]);
};
function campDraw(litf: boolean): Draw {
  return (b, f) => {
    for (const [x, y] of [[3, 13], [6, 14], [10, 14], [13, 13]] as Pt[]) ellipse(b, x, y, 2, 1.4, rampShader(R.stone, 0));
    line(b, 4, 12, 12, 10, R.wood[2]); line(b, 4, 10, 12, 12, R.wood[1]);
    if (litf) {
      const h = [7, 9, 8][f % 3];
      poly(b, [[5, 12], [11, 12], [9, 12 - h * 0.6], [8, 12 - h], [7, 12 - h * 0.5]], (x, y) => (y > 10 ? R.ember[2] : y > 7 ? R.ember[3] : R.ember[4]));
      b.set(8, 11, R.gold[4]);
    } else { b.set(7, 11, R.ash[3]); b.set(9, 11, R.ash[2]); b.set(8, 10, R.ember[1]); }
  };
}
const tent: Draw = (b) => {
  poly(b, [[2, 22], [16, 3], [30, 22]], (x, y) => tone(R.bone, lit((x - 16) / 14, -0.2, 0.8) - (x > 16 ? 0.2 : 0), 0));
  poly(b, [[13, 22], [16, 10], [19, 22]], () => R.ink[1]);
  line(b, 16, 3, 16, 1, R.wood[2]);
  // 찢어진 자국
  line(b, 22, 14, 25, 18, R.bone[1]); line(b, 7, 17, 9, 15, R.bone[1]);
};
function gateDraw(open: boolean): Draw {
  return (b) => {
    // 석조 아치
    rect(b, 2, 10, 8, 38, R.stone[2]); rect(b, 38, 10, 8, 38, R.stone[2]);
    poly(b, [[2, 12], [24, 1], [46, 12], [38, 14], [24, 7], [10, 14]], (x, y) => tone(R.stone, lit((x - 24) / 22, -0.5, 0.7), 0));
    for (let y = 12; y < 48; y += 5) { line(b, 2, y, 9, y, R.stone[1]); line(b, 38, y, 45, y, R.stone[1]); }
    b.set(24, 4, R.gold[4]); b.set(23, 5, R.gold[3]); b.set(25, 5, R.gold[3]);
    if (!open) {
      rect(b, 10, 14, 28, 34, R.ink[1]);
      for (let i = 0; i < 7; i++) {
        const x0 = 10 + (i * 4) % 28;
        line(b, x0, 47, 10 + ((i * 11) % 28), 14, R.thorn[2]);
        b.set(10 + ((i * 7) % 26), 20 + i * 3, R.thorn[4]);
      }
    } else {
      rect(b, 10, 14, 28, 34, R.ink[0]);
      for (let y = 16; y < 48; y += 3) b.set(24 + ((y * 5) % 7) - 3, y, R.echo[1]);
    }
  };
}
function pedestalDraw(glow: boolean): Draw {
  return (b, f) => {
    rect(b, 3, 12, 10, 11, R.stone[2]); line(b, 3, 12, 12, 12, R.stone[3]); rect(b, 1, 21, 14, 2, R.stone[1]);
    rect(b, 2, 9, 12, 3, R.stone[3]);
    if (glow) { ellipse(b, 8, 5, 3, 3.5, rampShader(R.gold, 0, true, 0.2)); b.set(7, 4, R.white[0]); if (f % 2) b.set(8, 0, R.gold[4]); }
  };
}
const thornwall: Draw = (b) => {
  for (let i = 0; i < 9; i++) {
    const x0 = 2 + i * 3.5, h = 18 + (i % 3) * 5;
    polyline(b, quadPoints([x0, 31], [x0 + (i % 2 ? 4 : -4), 31 - h * 0.5], [x0 + (i % 2 ? -2 : 2), 31 - h], 6), i % 2 ? R.thorn[2] : R.thorn[1]);
    b.set(Math.round(x0 + 1), 31 - Math.round(h * 0.6), R.thorn[4]);
  }
  for (let i = 0; i < 5; i++) b.set(4 + i * 6, 12 + (i % 2) * 6, R.echo[3]);
};
function crackDraw(broken: boolean): Draw {
  return (b) => {
    if (!broken) {
      rect(b, 0, 2, 16, 22, R.stone[2]);
      for (let y = 2; y < 24; y += 5) line(b, 0, y, 15, y, R.stone[1]);
      for (let y = 2; y < 24; y++) if (y % 10 < 5) b.set(8, y, R.stone[1]); else b.set(3, y, R.stone[1]);
      line(b, 4, 6, 9, 12, R.ink[1]); line(b, 9, 12, 7, 17, R.ink[1]); line(b, 9, 12, 13, 14, R.ink[1]);
      b.set(8, 11, R.echo[2]);
    } else {
      for (const [x, y] of [[3, 20], [8, 22], [12, 19], [6, 17]] as Pt[]) ellipse(b, x, y, 2.5, 1.8, rampShader(R.stone, 0));
    }
  };
}
function rootGateDraw(seals: number, open: boolean): Draw {
  return (b, f) => {
    const cx = 32;
    // 거대한 뿌리 아치
    for (const s of [-1, 1]) {
      const pts = quadPoints([cx + s * 26, 63], [cx + s * 30, 20], [cx + s * 4, 4], 14);
      pts.forEach(([x, y], i) => ellipse(b, x, y, 5 - i * 0.2, 5 - i * 0.2, rampShader(R.root, s > 0 ? -1 : 0)));
    }
    if (!open) {
      poly(b, [[cx - 20, 63], [cx - 20, 22], [cx, 10], [cx + 20, 22], [cx + 20, 63]], (x, y) => tone(R.root, lit((x - cx) / 20, -0.1, 0.8) - 0.2 + ((x + y) % 6 === 0 ? -0.3 : 0), 0));
      // 세 봉인 홈
      const slots: [number, number, readonly number[]][] = [[cx - 10, 30, R.ember], [cx, 22, R.glass], [cx + 10, 30, R.storm]];
      slots.forEach(([x, y, ramp], i) => {
        ellipse(b, x, y, 3.5, 3.5, () => R.ink[0]);
        if (i < seals) { ellipse(b, x, y, 2.5, 2.5, rampShader(ramp, 0, true, 0.3)); b.set(x - 1, y - 1, R.white[0]); }
      });
      line(b, cx, 36, cx, 62, R.ink[1]);
    } else {
      poly(b, [[cx - 20, 63], [cx - 20, 22], [cx, 10], [cx + 20, 22], [cx + 20, 63]], () => R.ink[0]);
      for (let y = 20; y < 63; y += 4) b.set(cx - 6 + ((y * 7 + f * 3) % 13), y, R.echo[2 + (y % 2)]);
    }
  };
}
const house: Draw = (b) => {
  // 푸른 기와 오두막
  rect(b, 6, 24, 36, 23, R.bone[2]);
  for (let y = 24; y < 47; y++) { b.set(6, y, R.bone[3]); b.set(41, y, R.bone[1]); }
  for (let x = 6; x < 42; x += 6) line(b, x, 24, x, 46, R.wood[2]);
  line(b, 6, 35, 41, 35, R.wood[2]);
  poly(b, [[1, 26], [24, 4], [47, 26]], (x, y) => ((y % 4 === 0) ? R.blue[1] : tone(R.blue, lit((x - 24) / 23, -0.4, 0.8), 0)));
  rect(b, 20, 34, 8, 13, R.wood[1]); b.set(26, 40, R.brass[3]);
  rect(b, 10, 28, 6, 5, R.ink[1]); rect(b, 11, 29, 4, 3, R.gold[2]); rect(b, 32, 28, 6, 5, R.ink[1]); rect(b, 33, 29, 4, 3, R.gold[2]);
  rect(b, 34, 6, 4, 10, R.stone[2]);
};
const well: Draw = (b) => {
  ellipse(b, 12, 17, 10, 5, rampShader(R.stone, 0));
  ellipse(b, 12, 16, 7, 3, () => R.tide[1]);
  line(b, 3, 16, 3, 4, R.wood[2]); line(b, 21, 16, 21, 4, R.wood[1]);
  poly(b, [[1, 5], [12, 0], [23, 5], [21, 6], [3, 6]], (x) => (x < 12 ? R.blue[3] : R.blue[2]));
  line(b, 12, 6, 12, 11, R.bone[3]);
};
const lamp: Draw = (b) => {
  line(b, 8, 31, 8, 8, R.steel[2]); line(b, 9, 31, 9, 8, R.steel[1]);
  rect(b, 5, 3, 7, 6, R.brass[2]); rect(b, 6, 4, 5, 4, R.gold[3]); b.set(8, 5, R.gold[4]);
  rect(b, 5, 29, 8, 3, R.stone[2]);
};
const fence: Draw = (b) => {
  line(b, 0, 7, 15, 7, R.wood[3]); line(b, 0, 11, 15, 11, R.wood[2]);
  for (const x of [2, 13]) { line(b, x, 4, x, 15, R.wood[3]); line(b, x + 1, 4, x + 1, 15, R.wood[1]); }
};
const bridge: Draw = (b) => {
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) b.set(x, y, y % 4 === 3 ? R.wood[1] : x === 0 || x === 15 ? R.wood[1] : R.wood[3 - (y % 4 === 0 ? 0 : 1)]);
};

/* ---------- 필드 적 (탐험 중 보이는 실제 적 스프라이트) ---------- */
function fieldHound(b: PixelBuffer, f: number): void {
  const y = f % 2;
  ellipse(b, 12, 11 + y, 7, 3.5, rampShader(R.stone, 0));
  ellipse(b, 5, 8 + y, 3.2, 2.8, rampShader(R.stone, 0));
  poly(b, [[3, 8 + y], [-1, 9 + y], [3, 10 + y]], () => R.stone[2]);
  b.set(4, 7 + y, R.ember[4]);
  for (const x of [7, 9, 15, 17]) line(b, x, 13 + y, x + (f % 2 ? 1 : -1) * (x % 2), 17, x % 4 ? R.stone[1] : R.stone[2]);
  for (let i = 0; i < 3; i++) poly(b, [[9 + i * 3, 8 + y], [11 + i * 3, 8 + y], [12 + i * 3, 4 + y]], () => R.thorn[3]);
  line(b, 19, 10 + y, 22, 6 + y, R.stone[2]); b.set(22, 5 + y, R.thorn[3]);
}
function fieldArmor(b: PixelBuffer, f: number): void {
  const y = f % 2 ? 0 : 1;
  ellipse(b, 8, 5 + y, 4, 4, rampShader(R.steel, 0, true)); line(b, 6, 5 + y, 10, 5 + y, R.echo[4]);
  poly(b, [[3, 9 + y], [13, 9 + y], [12, 19], [4, 19]], (x) => tone(R.steel, lit((x - 8) / 5, -0.2, 0.8) - 0.1, 0, true));
  line(b, 4, 16, 12, 16, R.ink[0]); b.set(8, 16, R.echo[3]);
  rect(b, 4, 20, 3, 6, R.stone[2]); rect(b, 9, 20, 3, 6, R.stone[2]);
  line(b, 14, 8 + y, 14, 24, R.steel[3]); line(b, 13, 12 + y, 15, 12 + y, R.steel[2]);
}
function fieldCaller(b: PixelBuffer, f: number): void {
  const y = f % 2;
  ellipse(b, 8, 6 + y, 4.5, 4.5, rampShader(R.plum, 0)); b.set(7, 7 + y, R.gold[3]); b.set(10, 7 + y, R.gold[3]);
  poly(b, [[3, 10 + y], [13, 10 + y], [15, 25], [1, 25]], (x, yy) => tone(yy > 20 ? R.plum : R.moss, lit((x - 8) / 7, -0.1, 0.8), -1));
  line(b, 14, 4, 14, 22, R.wood[2]); rect(b, 13, 1 + y, 3, 3, R.gold[f % 2 ? 4 : 3]);
}
function fieldFlame(b: PixelBuffer, f: number): void {
  const y = f % 2 ? -1 : 0;
  poly(b, [[3, 13 + y], [2, 8 + y], [5, 4 + y], [7, 7 + y], [8, 0 + y], [10, 6 + y], [12, 3 + y], [14, 8 + y], [13, 13 + y], [8, 16 + y]], () => R.echo[2]);
  poly(b, [[8, 5 + y], [11, 9 + y], [8, 13 + y], [5, 9 + y]], (x) => (x < 8 ? R.glass[4] : R.glass[2]));
  b.set(8, 9 + y, R.white[0]);
}
function fieldColossus(b: PixelBuffer, f: number): void {
  const y = f % 2;
  poly(b, [[4, 14 + y], [12, 5 + y], [22, 4 + y], [29, 12 + y], [28, 26], [6, 26]], (x, yy) => tone(R.wood, lit((x - 16) / 13, (yy - 15) / 12, 0.8), 0));
  poly(b, [[9, 9 + y], [14, 5 + y], [22, 4 + y], [26, 8 + y], [18, 8 + y]], () => R.moss[3]);
  ellipse(b, 5, 22 + y, 4, 4, rampShader(R.stone, 0)); ellipse(b, 27, 22 + y, 4, 4, rampShader(R.stone, -1));
  rect(b, 10, 26, 5, 7, R.wood[2]); rect(b, 18, 26, 5, 7, R.wood[1]);
  b.set(14, 16 + y, R.thorn[4]); b.set(15, 16 + y, R.thorn[3]);
  b.set(9, 11 + y, R.echo[4]);
}
function fieldShell(b: PixelBuffer, f: number): void {
  const y = f % 2;
  ellipse(b, 17, 11 + y, 12, 8, (x, yy, nx, ny, nz) => (yy > 14 + y ? -1 : ((x - 5) % 6 === 0 ? R.ink[1] : tone(R.rock, lit(nx, ny, nz), 0))));
  ellipse(b, 5, 14 + y, 4, 3, rampShader(R.earth, 0)); poly(b, [[3, 12 + y], [-1, 7 + y], [2, 13 + y]], () => R.bone[3]);
  for (const x of [9, 14, 20, 25]) rect(b, x, 15 + y, 2, 5 - y, R.rock[1]);
  for (let i = 0; i < 3; i++) b.set(12 + i * 5, 3 + y, R.thorn[3]);
}

export function propSheets(): SheetSpec[] {
  return [
    propSheet('tree_hub', 32, 48, one(tree(R.teal, R.wood, 'round'))),
    propSheet('tree_meadow', 32, 48, one(tree(R.grass, R.wood, 'ash'))),
    propSheet('tree_glass', 32, 48, one(tree(R.glass, R.night, 'crystal'))),
    propSheet('tree_plateau', 32, 48, one(tree(R.moss, R.rock, 'pine'))),
    propSheet('tree_depths', 32, 48, one(tree(R.root, R.root, 'root'))),
    propSheet('rock', 24, 20, one(rock)),
    propSheet('crystal', 16, 24, one(crystal)),
    propSheet('bush', 16, 16, one(bush)),
    propSheet('pillar', 16, 40, one(pillar(false))),
    propSheet('pillar_broken', 16, 28, one(pillar(true))),
    propSheet('statue', 24, 40, one(statue)),
    propSheet('mural', 32, 32, one(mural)),
    propSheet('chest', 16, 16, { closed: { n: 1, ms: 1000, draw: chest(false) }, open: { n: 1, ms: 1000, draw: chest(true) } }),
    propSheet('rest', 16, 32, { off: { n: 1, ms: 1000, draw: restDraw(false) }, on: { n: 4, ms: 150, draw: restDraw(true), loop: true } }),
    propSheet('sign', 16, 16, one(sign)),
    propSheet('camp', 16, 16, { lit: { n: 3, ms: 120, draw: campDraw(true), loop: true }, out: { n: 1, ms: 1000, draw: campDraw(false) } }),
    propSheet('tent', 32, 24, one(tent)),
    propSheet('gate', 48, 48, { sealed: { n: 1, ms: 1000, draw: gateDraw(false) }, open: { n: 1, ms: 1000, draw: gateDraw(true) } }),
    propSheet('pedestal', 16, 24, { empty: { n: 1, ms: 1000, draw: pedestalDraw(false) }, glow: { n: 2, ms: 300, draw: pedestalDraw(true), loop: true } }),
    propSheet('thornwall', 32, 32, one(thornwall)),
    propSheet('crackwall', 16, 24, { intact: { n: 1, ms: 1000, draw: crackDraw(false) }, broken: { n: 1, ms: 1000, draw: crackDraw(true) } }),
    propSheet('rootgate', 64, 64, {
      seal0: { n: 1, ms: 1000, draw: rootGateDraw(0, false) }, seal1: { n: 1, ms: 1000, draw: rootGateDraw(1, false) },
      seal2: { n: 1, ms: 1000, draw: rootGateDraw(2, false) }, seal3: { n: 1, ms: 1000, draw: rootGateDraw(3, false) },
      open: { n: 4, ms: 160, draw: rootGateDraw(3, true), loop: true },
    }),
    propSheet('house', 48, 48, one(house)),
    propSheet('well', 24, 24, one(well)),
    propSheet('lamp', 16, 32, one(lamp)),
    propSheet('fence', 16, 16, one(fence)),
    propSheet('bridge', 16, 16, one(bridge), 'prop', false),
    propSheet('f_hound', 24, 18, { idle: { n: 2, ms: 260, draw: fieldHound } }, 'enemy'),
    propSheet('f_hollow', 16, 26, { idle: { n: 2, ms: 400, draw: fieldArmor } }, 'enemy'),
    propSheet('f_caller', 16, 26, { idle: { n: 2, ms: 360, draw: fieldCaller } }, 'enemy'),
    propSheet('f_flame', 16, 18, { idle: { n: 2, ms: 220, draw: fieldFlame } }, 'enemy'),
    propSheet('f_colossus', 32, 34, { idle: { n: 2, ms: 420, draw: fieldColossus } }, 'enemy'),
    propSheet('f_shell', 32, 22, { idle: { n: 2, ms: 380, draw: fieldShell } }, 'enemy'),
  ];
}

export { rest };
