import { PixelBuffer } from '../core/buffer';
import { R } from '../core/palette';
import { capsule, poly, rampShader, stamp, tone, lit, line, ellipse, Pt, rect } from '../core/draw';
import { composite, selectiveOutline, cleanupOrphans } from '../core/post';
import { AnimBuilder, SheetSpec } from '../core/sheet';

/**
 * 필드 탐험용 캐릭터 (24×32, 약 3등신). 전투 스프라이트를 축소한 것이 아니라
 * 머리를 크게 잡은 별도 비율과 방향별 머리 맵으로 새로 그린다.
 */
export const FW = 24, FH = 32;
export const F_ANCHOR: [number, number] = [12, 31];

type Dir = 'down' | 'up' | 'side';

const T_DOWN = [
  '...abba...',
  '.abccccba.',
  'abcdeedcba',
  'abcddddcba',
  'abcbccbcba',
  'abmnnnnmba',
  'abnEnnEnba',
  'ablnnnnlba',
  '.alnmmnla.',
  '..kllllk..',
];
const T_SIDE = [
  '...abba...',
  '.abcccba..',
  'abcdeedcb.',
  'abcdddddcb',
  'abccccbccb',
  'abcblmnnb.',
  'abblmnEnn.',
  'abllmnnnnl',
  '.allmnnnm.',
  '..kllll...',
];
const T_UP = [
  '...abba...',
  '.abccccba.',
  'abcdeedcba',
  'abcddddcba',
  'abcdccdcba',
  'abccccccba',
  'abcccccbba',
  '.abbcbbba.',
  '..alllla..',
  '...kllk...',
];

function patch(rows: string[], edits: Record<number, string>): string[] {
  return rows.map((r, i) => edits[i] ?? r);
}

export interface FieldCostume {
  id: string;
  hair: readonly number[];
  skin: readonly number[];
  heads?: Partial<Record<Dir, string[]>>;
  torso: readonly number[];
  accent?: readonly number[];
  sleeves: readonly number[];
  hands?: readonly number[];
  pants: readonly number[];
  boots: readonly number[];
  wide?: number;
  /** 긴 옷자락이 내려오는 y (없으면 0) */
  coat?: number;
  cape?: readonly number[];
  /** 머리 위·뒤 추가 요소 */
  extra?: (buf: PixelBuffer, dir: Dir, flip: boolean, bob: number, phase: number, layer: 'back' | 'front') => void;
  legend?: Record<string, number>;
}

function headLegend(c: FieldCostume): Record<string, number> {
  return {
    a: c.hair[0], b: c.hair[1], c: c.hair[2], d: c.hair[3], e: c.hair[Math.min(4, c.hair.length - 1)],
    k: c.skin[0], l: c.skin[1], m: c.skin[2], n: c.skin[3], o: c.skin[4],
    E: R.ink[0], G: R.brass[2], L: R.glass[3],
    ...(c.legend ?? {}),
  };
}

/** phase: 0 서기, 1 왼발 앞, 2 지나감, 3 오른발 앞, 4 지나감 */
function renderField(c: FieldCostume, dir: Dir, phase: number, idleBob = 0): PixelBuffer {
  const base = new PixelBuffer(FW, FH);
  const part = () => new PixelBuffer(FW, FH);
  const walking = phase > 0;
  const pass = phase === 2 || phase === 4;
  const bob = (pass ? -1 : 0) + idleBob;
  const w = c.wide ?? 0;
  const cx = 12;
  const shoulderY = 13 + bob, waistY = 19 + bob, hipY = 21;
  const legFwd = phase === 1 ? 1 : phase === 3 ? -1 : 0;

  if (c.extra) { const e = part(); c.extra(e, dir, false, bob, phase, 'back'); composite(base, e, { edge: false }); }

  if (dir === 'side') {
    // 뒷다리 / 앞다리
    const swing = legFwd * 3;
    const back = part();
    const bFoot: Pt = [cx - swing, 29], fFoot: Pt = [cx + swing, 29];
    const lift = pass ? 1 : 0;
    capsule(back, cx - 0.5, hipY, bFoot[0] - 0.5, bFoot[1] - 1 - lift, 1.4, 1.2, rampShader(c.pants, -1));
    rect(back, Math.round(bFoot[0] - 1.5), 28 - lift, 3, 2, c.boots[1]);
    back.set(Math.round(bFoot[0] + 1.5), 29 - lift, c.boots[1]);
    composite(base, back, { edge: true });
    // 뒷팔
    const arm = part();
    capsule(arm, cx - 1, shoulderY + 1, cx - 1 - legFwd * 2, waistY + 1, 1.2, 1.1, rampShader(c.sleeves, -1));
    composite(base, arm, { edge: true });
    if (c.cape) { const cp = part(); poly(cp, [[cx - 3.5, shoulderY - 0.5], [cx + 0.5, shoulderY - 0.5], [cx - 1, waistY + 4], [cx - 5 - (walking ? 1 : 0), waistY + 5]], (x, y) => tone(c.cape!, lit(-0.2, -0.1, 0.8), -1)); composite(base, cp, { edge: false }); }
    const t = part();
    poly(t, [[cx - 3 - w * 0.5, shoulderY - 0.5], [cx + 3 + w * 0.5, shoulderY - 0.5], [cx + 3 + w * 0.5, waistY + 1], [cx - 3 - w * 0.5, waistY + 1]], (x, y) => tone(c.torso, lit((x - cx) / 4, -0.3 + (y - shoulderY) * 0.06, 0.8), 0));
    if (c.accent) poly(t, [[cx - 1, shoulderY + 1], [cx + 3 + w * 0.5, shoulderY + 1], [cx + 3 + w * 0.5, waistY - 1], [cx - 1, waistY - 1]], (x, y) => tone(c.accent!, lit((x - cx) / 4, -0.2, 0.8), 0));
    line(t, cx - 3 - w * 0.5, waistY, cx + 3 + w * 0.5, waistY, c.boots[2]);
    composite(base, t, { edge: true });
    const front = part();
    capsule(front, cx + 0.5, hipY, fFoot[0] + 0.5, fFoot[1] - 1, 1.5, 1.3, rampShader(c.pants, 0));
    rect(front, Math.round(fFoot[0] - 1), 28, 3, 2, c.boots[2]);
    front.set(Math.round(fFoot[0] + 2), 29, c.boots[2]);
    composite(base, front, { edge: true });
    if (c.coat) { const co = part(); poly(co, [[cx - 3.5 - w * 0.5, waistY], [cx + 3.5 + w * 0.5, waistY], [cx + 4 + (legFwd > 0 ? 1 : 0), c.coat], [cx - 4.5, c.coat + 1]], (x, y) => tone(c.torso, lit((x - cx) / 5, 0, 0.8), 0)); composite(base, co, { edge: true, edgeSides: 'lower' }); }
    const h = part();
    stamp(h, c.heads?.side ?? T_SIDE, headLegend(c), cx - 5, 3 + bob);
    composite(base, h, { edge: false });
    const fa = part();
    capsule(fa, cx + 1, shoulderY + 1, cx + 1 + legFwd * 2, waistY + 1, 1.3, 1.2, rampShader(c.sleeves, 0));
    ellipse(fa, cx + 1 + legFwd * 2, waistY + 2, 1, 1, rampShader(c.hands ?? c.skin, 0));
    composite(base, fa, { edge: true });
  } else {
    const up = dir === 'up';
    // 다리 (정면/후면): 걷기 중 한쪽 발을 1px 들어 올림
    const lL = part();
    const lLift = walking && phase === 3 ? 1 : 0, rLift = walking && phase === 1 ? 1 : 0;
    capsule(lL, cx - 2, hipY, cx - 2, 28 - lLift, 1.4, 1.3, rampShader(c.pants, 0));
    rect(lL, cx - 4, 28 - lLift, 3, 2, c.boots[2]);
    capsule(lL, cx + 1, hipY, cx + 1, 28 - rLift, 1.4, 1.3, rampShader(c.pants, 0));
    rect(lL, cx, 28 - rLift, 3, 2, c.boots[2]);
    lL.set(cx - 4, 29 - lLift, c.boots[1]); lL.set(cx + 2, 29 - rLift, c.boots[1]);
    composite(base, lL, { edge: true });
    if (c.cape && up) {
      const cp = part();
      poly(cp, [[cx - 5, shoulderY - 1], [cx + 4, shoulderY - 1], [cx + 5, waistY + 5], [cx - 6, waistY + 5]], (x, y) => tone(c.cape!, lit((x - cx) / 6, -0.2, 0.8), 0) + (x === cx && y > waistY ? 0 : 0));
      composite(base, cp, { edge: false });
    }
    const t = part();
    poly(t, [[cx - 4 - w * 0.5, shoulderY - 0.5], [cx + 3 + w * 0.5, shoulderY - 0.5], [cx + 3 + w * 0.5, waistY + 1], [cx - 4 - w * 0.5, waistY + 1]], (x, y) => tone(c.torso, lit((x - cx + 0.5) / 5, -0.3 + (y - shoulderY) * 0.06, 0.8), 0));
    if (c.accent && !up) poly(t, [[cx - 2.5, shoulderY + 1], [cx + 1.5, shoulderY + 1], [cx + 1.5, waistY - 1], [cx - 2.5, waistY - 1]], (x, y) => tone(c.accent!, lit((x - cx + 0.5) / 4, -0.2, 0.8), 0));
    line(t, cx - 4 - w * 0.5, waistY, cx + 3 + w * 0.5, waistY, c.boots[2]);
    if (!up) t.set(cx - 1, waistY, R.brass[3]);
    composite(base, t, { edge: true });
    if (c.cape && up) {
      const cp = part();
      poly(cp, [[cx - 5, shoulderY - 1], [cx + 4, shoulderY - 1], [cx + 5, waistY + 5], [cx - 6, waistY + 5]], (x, y) => tone(c.cape!, lit((x - cx) / 6, -0.2 + (y - shoulderY) * 0.03, 0.8), 0));
      composite(base, cp, { edge: true });
    }
    if (c.coat) { const co = part(); poly(co, [[cx - 4.5 - w * 0.5, waistY], [cx + 3.5 + w * 0.5, waistY], [cx + 4.5, c.coat], [cx - 5.5, c.coat]], (x, y) => { if (!up && x === cx - 1 && y > waistY) return c.torso[1]; return tone(c.torso, lit((x - cx) / 6, 0, 0.8), 0); }); composite(base, co, { edge: true, edgeSides: 'lower' }); }
    // 팔: 걷기 시 반대로 흔들림
    const arms = part();
    const swingL = walking ? (phase === 1 ? -1 : phase === 3 ? 1 : 0) : 0;
    capsule(arms, cx - 5 - w * 0.5, shoulderY + 1, cx - 5 - w * 0.5, waistY + 1 + swingL, 1.2, 1.1, rampShader(c.sleeves, 0));
    capsule(arms, cx + 4 + w * 0.5, shoulderY + 1, cx + 4 + w * 0.5, waistY + 1 - swingL, 1.2, 1.1, rampShader(c.sleeves, 0));
    if (!up) {
      ellipse(arms, cx - 5 - w * 0.5, waistY + 2 + swingL, 1, 1, rampShader(c.hands ?? c.skin, 0));
      ellipse(arms, cx + 4 + w * 0.5, waistY + 2 - swingL, 1, 1, rampShader(c.hands ?? c.skin, 0));
    }
    composite(base, arms, { edge: true });
    const h = part();
    stamp(h, (up ? c.heads?.up : c.heads?.down) ?? (up ? T_UP : T_DOWN), headLegend(c), cx - 5, 3 + bob);
    composite(base, h, { edge: false });
  }
  if (c.extra) { const e = part(); c.extra(e, dir, false, bob, phase, 'front'); composite(base, e, { edge: true }); }
  cleanupOrphans(base);
  selectiveOutline(base);
  return base;
}

export function buildFieldSheet(c: FieldCostume, kind: 'field' | 'npc' = 'field'): SheetSpec {
  const anims = [];
  for (const dir of ['down', 'up', 'side'] as Dir[]) {
    const idle = new AnimBuilder(`idle_${dir}`, true);
    idle.add(renderField(c, dir, 0), 500, { tag: 'idle' }).add(renderField(c, dir, 0, 1), 500, { tag: 'idle' });
    const walk = new AnimBuilder(`walk_${dir}`, true);
    for (const ph of [1, 2, 3, 4]) walk.add(renderField(c, dir, ph), 140, { tag: 'move' });
    anims.push(idle.build(), walk.build());
    if (dir === 'side') {
      const il = new AnimBuilder('idle_left', true);
      idle.frames.forEach((f) => il.add(f.flipped(), 500, { tag: 'idle' }));
      const wl = new AnimBuilder('walk_left', true);
      walk.frames.forEach((f) => wl.add(f.flipped(), 140, { tag: 'move' }));
      anims.push(il.build(), wl.build());
    }
  }
  // side = right
  for (const a of anims) if (a.name.endsWith('_side')) a.name = a.name.replace('_side', '_right');
  return {
    id: `${c.id}_field`,
    kind,
    frameW: FW,
    frameH: FH,
    anchor: F_ANCHOR,
    anims,
    required: ['idle_down', 'idle_up', 'idle_right', 'idle_left', 'walk_down', 'walk_up', 'walk_right', 'walk_left'],
    maxColors: 40,
  };
}

/* ---------------- 의상 정의 ---------------- */

export const FIELD_COSTUMES: FieldCostume[] = [
  {
    id: 'kael', hair: R.hairKael, skin: R.skin, torso: R.blue, accent: R.steel, sleeves: R.blue, hands: R.leather, pants: R.stone, boots: R.leather, cape: R.blue,
    extra: (b, dir, _f, bob, _p, layer) => {
      if (layer !== 'front') return;
      if (dir === 'up') { line(b, 15, 11 + bob, 9, 22 + bob, R.steel[3]); b.set(14, 12 + bob, R.brass[3]); }
      if (dir === 'down') { b.set(8, 20 + bob, R.brass[3]); line(b, 8, 21 + bob, 7, 25 + bob, R.steel[3]); }
      if (dir === 'side') { line(b, 10, 20 + bob, 6, 26 + bob, R.steel[3]); b.set(11, 19 + bob, R.brass[3]); }
    },
  },
  {
    id: 'mira', hair: R.hairMira, skin: R.skin, torso: R.teal, accent: R.bone, sleeves: R.teal, pants: R.plum, boots: R.leather, coat: 26,
    heads: {
      down: patch(T_DOWN, { 7: 'bblnnnnlbb', 8: 'bclnmmnlcb', 9: '.bkllllkb.' }),
      side: patch(T_SIDE, { 8: 'bcllmnnnm.', 9: 'bbkllll...' }),
      up: patch(T_UP, { 8: 'abcccccba.', 9: '.abbbbba..' }),
    },
    extra: (b, dir, _f, bob, _p, layer) => {
      if (layer === 'front') {
        // 모자: 챙 + 뒤로 꺾인 원뿔
        const y0 = 3 + bob;
        poly(b, [[5, y0 + 2], [19, y0 + 2], [18, y0 + 4], [6, y0 + 4]], (x, y) => (y === y0 + 2 ? R.plum[3] : R.plum[2]));
        const tipX = dir === 'side' ? 7 : dir === 'up' ? 13 : 10;
        poly(b, [[8, y0 + 2], [16, y0 + 2], [14, y0 - 2], [tipX + 1, y0 - 5], [tipX - 1, y0 - 5], [9, y0 - 1]], (x, y) => (y === y0 + 1 ? R.brass[3] : tone(R.plum, lit((x - 12) / 4, -0.3, 0.8), 0)));
        // 지팡이
        if (dir !== 'up') { const sx = dir === 'side' ? 16 : 17; line(b, sx, 8 + bob, sx, 27, R.wood[3]); b.set(sx, 7 + bob, R.glass[3]); b.set(sx, 6 + bob, R.glass[4]); b.set(sx + 1, 7 + bob, R.glass[2]); }
      } else if (dir === 'up') { line(b, 17, 8 + bob, 17, 27, R.wood[2]); b.set(17, 7 + bob, R.glass[3]); }
    },
  },
  {
    id: 'sera', hair: R.hairSera, skin: R.skin, torso: R.green, accent: R.leather, sleeves: R.green, hands: R.leather, pants: R.earth, boots: R.wood,
    extra: (b, dir, _f, bob, phase, layer) => {
      const sway = phase === 1 ? -1 : phase === 3 ? 1 : 0;
      if (layer === 'back' && dir !== 'up') {
        // 포니테일
        if (dir === 'side') { capsule(b, 7, 6 + bob, 5 + sway, 12 + bob, 1.4, 0.8, rampShader(R.hairSera, -1)); }
        else { capsule(b, 12, 4 + bob, 12, 3 + bob, 1.2, 1.0, rampShader(R.hairSera, 0)); }
      }
      if (layer === 'front' && dir === 'up') {
        capsule(b, 12, 7 + bob, 12 + sway, 14 + bob, 1.5, 0.8, rampShader(R.hairSera, 0));
        b.set(12, 7 + bob, R.teal[3]);
        // 등의 활
        line(b, 16, 10 + bob, 16, 24 + bob, R.wood[3]); line(b, 17, 11 + bob, 17, 23 + bob, R.bone[3]);
      }
      if (layer === 'front' && dir === 'side') { line(b, 9, 11 + bob, 8, 22 + bob, R.wood[3]); }
      if (layer === 'front' && dir === 'down') { line(b, 15, 13 + bob, 9, 19 + bob, R.wood[2]); }
    },
  },
  {
    id: 'orin', hair: R.hairOrin, skin: R.skinDeep, torso: R.rust, accent: R.leather, sleeves: R.rust, hands: R.steel, pants: R.earth, boots: R.leather, wide: 2,
    heads: {
      down: patch(T_DOWN, { 3: 'abcddddcba', 4: 'aGLGGGGLGa', 5: 'abmnnnnmba', 6: 'abnEnnEnba', 7: 'abcnnnncba', 8: '.acddddca.', 9: '..abccba..' }),
      side: patch(T_SIDE, { 4: 'abGGGGLGGb', 5: 'abcblmnnn.', 6: 'abblmnEnn.', 7: 'abldcccddl', 8: '.abcdddcb.', 9: '..abccb...' }),
      up: patch(T_UP, { 4: 'aGGGGGGGGa' }),
    },
    extra: (b, dir, _f, bob, _p, layer) => {
      // 등에 멘 망치포
      const back = (dir === 'up' && layer === 'front') || (dir !== 'up' && layer === 'back');
      if (!back) return;
      const hx = dir === 'side' ? 6 : 12;
      line(b, hx + 3, 24 + bob, hx - 2, 8 + bob, R.steel[3]);
      poly(b, [[hx - 7, 3 + bob], [hx + 3, 3 + bob], [hx + 3, 9 + bob], [hx - 7, 9 + bob]], (x, y) => (y === 5 + bob ? R.brass[2] : tone(R.steel, lit((x - hx) / 5, -0.3, 0.8) - 0.2, 0)));
      b.set(hx + 3, 6 + bob, R.ink[0]);
    },
  },
];

export const NPC_COSTUMES: FieldCostume[] = [
  {
    id: 'npc_elder', hair: R.hairSera, skin: R.skin, torso: R.bone, accent: R.plum, sleeves: R.bone, pants: R.bone, boots: R.leather, coat: 28,
    extra: (b, dir, _f, bob, _p, layer) => {
      if (layer === 'front' && dir !== 'up') { const sx = dir === 'side' ? 17 : 18; line(b, sx, 9 + bob, sx, 29, R.wood[2]); b.set(sx, 8 + bob, R.moss[3]); b.set(sx - 1, 8 + bob, R.moss[4]); }
    },
  },
  {
    id: 'npc_merchant', hair: R.hairOrin, skin: R.skin, torso: R.earth, accent: R.leather, sleeves: R.bone, pants: R.leather, boots: R.wood, wide: 2,
    extra: (b, _dir, _f, bob, _p, layer) => {
      if (layer !== 'front') return;
      poly(b, [[6, 5 + bob], [18, 5 + bob], [16, 3 + bob], [8, 3 + bob]], (x, y) => tone(R.green, lit((x - 12) / 6, -0.4, 0.8), 0));
      line(b, 5, 6 + bob, 19, 6 + bob, R.green[2]);
    },
  },
  { id: 'npc_villager', hair: R.hairMira, skin: R.skin, torso: R.flower, accent: R.bone, sleeves: R.flower, pants: R.stone, boots: R.leather },
  { id: 'npc_guard', hair: R.hairKael, skin: R.skinDeep, torso: R.steel, accent: R.blue, sleeves: R.steel, hands: R.leather, pants: R.stone, boots: R.leather,
    extra: (b, dir, _f, bob, _p, layer) => { if (layer === 'front' && dir !== 'up') { line(b, 18, 4 + bob, 18, 28, R.wood[2]); b.set(18, 3 + bob, R.steel[4]); b.set(18, 2 + bob, R.steel[3]); } } },
  { id: 'npc_child', hair: R.hairOrin, skin: R.skin, torso: R.ember, accent: R.bone, sleeves: R.ember, pants: R.earth, boots: R.leather },
];

export function fieldSheets(): SheetSpec[] {
  return [...FIELD_COSTUMES.map((c) => buildFieldSheet(c, 'field')), ...NPC_COSTUMES.map((c) => buildFieldSheet(c, 'npc'))];
}
