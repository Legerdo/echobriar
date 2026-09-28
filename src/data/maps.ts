import { MapBuilder, Pt } from './mapgen';
import type { TrackId } from '../audio/music';
import type { Dir } from '../state/game';

/** 필드 엔티티. showIf/hideIf 는 진행 플래그 조건 */
interface EntBase { id: string; x: number; y: number; showIf?: string; hideIf?: string }
export type Ent =
  | (EntBase & { k: 'npc'; sprite: string; dir?: Dir; talk: string })
  | (EntBase & { k: 'chest'; loot: [string, number][] })
  | (EntBase & { k: 'rest' })
  | (EntBase & { k: 'read'; sprite: 'sign' | 'mural' | 'statue' | 'camp' | 'pedestal'; text: string })
  | (EntBase & { k: 'exit'; w: number; h: number; to: string; spawn: string })
  | (EntBase & { k: 'enemy'; group: string; sprite: string; radius?: number; pre?: string; post?: string; boss?: boolean; flip?: boolean })
  | (EntBase & { k: 'thorn'; need: string })
  | (EntBase & { k: 'crack' })
  | (EntBase & { k: 'trigger'; w: number; h: number; script: string })
  | (EntBase & { k: 'gate' })
  | (EntBase & { k: 'pedestal'; seal: string })
  | (EntBase & { k: 'prop'; sprite: string; anim?: string; block?: boolean });

export interface MapDef {
  id: string;
  name: string;
  biome: string;
  music: TrackId;
  tree: string;
  rows: string[];
  ents: Ent[];
  spawns: Record<string, [number, number, Dir]>;
  enter?: string;
}

const W = (b: MapBuilder) => b.rows();

/* ============================================================ 푸른 피난처 (거점) */
function hub(): MapDef {
  const b = new MapBuilder(34, 24);
  b.ragged('T', 2, 11);
  // 북·서쪽은 숲으로 막고 길만 뚫는다 (가시덤불 관문)
  b.rect(0, 0, 33, 2, 'T');
  b.rect(0, 0, 2, 23, 'T');
  // 광장과 길
  b.rect(11, 9, 22, 15, '=');
  for (let y = 9; y <= 15; y++) for (let x = 11; x <= 22; x++) b.reserve(x, y);
  b.path([[16, 0], [16, 9]], 2);
  b.path([[22, 12], [33, 12]], 3);
  b.path([[0, 12], [11, 12]], 2);
  b.path([[17, 15], [17, 17]], 2);
  b.blob(6, 18, 3.4, 2.2, '~', 3);
  b.set(6, 7, 'h').set(27, 7, 'h').set(28, 19, 'h');
  b.set(22, 18, 'w').set(12, 8, 'l').set(21, 8, 'l').set(10, 16, 'l').set(23, 16, 'l');
  b.set(8, 12, 's');
  b.reserve(6, 6, 1).reserve(27, 6, 1).reserve(28, 18, 1).reserve(17, 19, 2);
  b.scatter('T', 10, 2, 2, 31, 21, 5);
  b.scatter('*', 8, 2, 2, 31, 21, 9);
  b.sprinkle(0.12, 4);
  return {
    id: 'hub', name: '푸른 피난처', biome: 'hub', music: 'refuge', tree: 'tree_hub', rows: W(b), enter: 'hub_enter',
    spawns: { start: [16, 13, 'down'], east: [31, 12, 'left'], north: [16, 4, 'down'], west: [4, 12, 'right'], gate: [17, 16, 'down'] },
    ents: [
      { k: 'exit', id: 'x_e', x: 33, y: 11, w: 1, h: 3, to: 'meadow', spawn: 'west' },
      { k: 'exit', id: 'x_n', x: 16, y: 0, w: 2, h: 1, to: 'glass', spawn: 'south' },
      { k: 'exit', id: 'x_w', x: 0, y: 12, w: 1, h: 2, to: 'plateau', spawn: 'east' },
      { k: 'thorn', id: 'th_n1', x: 16, y: 2, need: 'seal_ember' },
      { k: 'thorn', id: 'th_n2', x: 17, y: 2, need: 'seal_ember' },
      { k: 'thorn', id: 'th_w1', x: 2, y: 12, need: 'seal_glass' },
      { k: 'thorn', id: 'th_w2', x: 2, y: 13, need: 'seal_glass' },
      { k: 'gate', id: 'rootgate', x: 17, y: 19 },
      { k: 'rest', id: 'rest_hub', x: 20, y: 10 },
      { k: 'npc', id: 'elder', x: 14, y: 11, sprite: 'npc_elder_field', talk: 'elder' },
      { k: 'npc', id: 'merchant', x: 25, y: 14, sprite: 'npc_merchant_field', talk: 'merchant', dir: 'left' },
      { k: 'prop', id: 'tent1', x: 26, y: 15, sprite: 'tent', block: true },
      { k: 'npc', id: 'villager', x: 8, y: 9, sprite: 'npc_villager_field', talk: 'villager' },
      { k: 'npc', id: 'child', x: 11, y: 18, sprite: 'npc_child_field', talk: 'child' },
      { k: 'npc', id: 'guard', x: 30, y: 10, sprite: 'npc_guard_field', talk: 'guard', dir: 'left' },
      { k: 'read', id: 'sign_hub', x: 31, y: 14, sprite: 'sign', text: 'sign_hub' },
      { k: 'read', id: 'statue_hub', x: 8, y: 12, sprite: 'statue', text: 'statue_hub' },
      { k: 'prop', id: 'camp_hub', x: 19, y: 16, sprite: 'camp', anim: 'lit' },
    ],
  };
}

/* ============================================================ 재빛 초원 */
function meadow(): MapDef {
  const b = new MapBuilder(48, 28);
  b.ragged('T', 3, 21);
  // 강
  for (let y = 0; y < 28; y++) {
    const cx = 25 + Math.round(Math.sin(y * 0.35) * 1.5);
    b.rect(cx - 1, y, cx + 1, y, '~');
  }
  b.blob(26, 23, 3, 2, '~', 8);
  b.path([[0, 13], [8, 13], [14, 10], [20, 14]], 2);
  b.path([[21, 14], [29, 14]], 2, 'b');
  for (let x = 20; x <= 30; x++) { if (b.get(x, 14) !== '~' && b.get(x, 14) !== 'b') b.set(x, 14, '='); if (b.get(x, 15) !== '~' && b.get(x, 15) !== 'b') b.set(x, 15, '='); }
  b.path([[30, 14], [34, 14], [38, 10], [47, 10]], 2);
  b.path([[34, 15], [35, 20]], 2);
  b.path([[14, 9], [12, 5]], 1, '=');
  // 북동쪽 비밀 공터 (금 간 벽)
  b.rect(40, 1, 46, 7, '#');
  b.rect(42, 3, 45, 6, '.');
  b.set(43, 7, '.');
  b.reserve(43, 7).reserve(43, 8).reserve(43, 5, 1);
  b.path([[43, 8], [43, 10]], 1);
  // 야영지
  b.rect(33, 19, 40, 23, '.');
  for (let y = 19; y <= 23; y++) for (let x = 33; x <= 40; x++) b.reserve(x, y);
  b.reserve(12, 4, 1).reserve(44, 24, 1).reserve(5, 5, 1).reserve(16, 7, 1);
  b.scatter('T', 38, 2, 2, 45, 26, 31);
  b.scatter('o', 10, 2, 2, 45, 26, 37);
  b.scatter('*', 14, 2, 2, 45, 26, 41);
  b.sprinkle(0.14, 22);
  return {
    id: 'meadow', name: '재빛 초원', biome: 'meadow', music: 'field', tree: 'tree_meadow', rows: W(b), enter: 'meadow_enter',
    spawns: { west: [2, 13, 'right'], east: [45, 10, 'left'] },
    ents: [
      { k: 'exit', id: 'x_w', x: 0, y: 12, w: 1, h: 3, to: 'hub', spawn: 'east' },
      { k: 'exit', id: 'x_e', x: 47, y: 9, w: 1, h: 3, to: 'ruins', spawn: 'west' },
      { k: 'read', id: 'sign_m', x: 4, y: 11, sprite: 'sign', text: 'sign_meadow' },
      { k: 'trigger', id: 'tr_tut1', x: 7, y: 11, w: 1, h: 5, script: 'tut1_pre', hideIf: 'tut1_talk' },
      { k: 'enemy', id: 'en_tut1', x: 11, y: 12, group: 'm_tut1', sprite: 'f_hound', radius: 5, post: 'tut1_post' },
      { k: 'rest', id: 'rest_meadow', x: 16, y: 7 },
      { k: 'chest', id: 'ch_m1', x: 12, y: 4, loot: [['rl_dew', 1], ['potion', 1]] },
      { k: 'read', id: 'mural_m', x: 5, y: 5, sprite: 'mural', text: 'mural_meadow' },
      { k: 'enemy', id: 'en_tut2', x: 19, y: 14, group: 'm_tut2', sprite: 'f_hollow', radius: 3, pre: 'tut2_pre', post: 'tut2_post', flip: true },
      { k: 'npc', id: 'sera_camp', x: 36, y: 21, sprite: 'sera_field', talk: 'sera_join', hideIf: 'sera_joined', dir: 'left' },
      { k: 'prop', id: 'tent_m', x: 38, y: 20, sprite: 'tent', block: true },
      { k: 'prop', id: 'camp_m', x: 35, y: 22, sprite: 'camp', anim: 'out' },
      { k: 'read', id: 'rec_camp', x: 39, y: 22, sprite: 'camp', text: 'record_camp' },
      { k: 'chest', id: 'ch_m2', x: 34, y: 23, loot: [['rl_bell', 1]] },
      { k: 'enemy', id: 'en_m1', x: 36, y: 12, group: 'm1', sprite: 'f_hound', radius: 5 },
      { k: 'enemy', id: 'en_m2', x: 41, y: 15, group: 'm2', sprite: 'f_hollow', radius: 4 },
      { k: 'enemy', id: 'en_m3', x: 30, y: 24, group: 'm3', sprite: 'f_hound', radius: 4 },
      { k: 'chest', id: 'ch_m3', x: 44, y: 24, loot: [['w_short', 1], ['potion', 2]] },
      { k: 'crack', id: 'cr_m', x: 43, y: 7 },
      { k: 'chest', id: 'ch_m4', x: 43, y: 4, loot: [['crystal', 1], ['fragment', 1]] },
    ],
  };
}

/* ============================================================ 잠긴 폐허 */
function ruins(): MapDef {
  const b = new MapBuilder(46, 28);
  b.ragged('#', 2, 5);
  // 내부 벽 (방 나누기)
  b.rect(14, 2, 15, 25, '#');
  b.rect(30, 2, 31, 25, '#');
  b.rect(32, 12, 44, 13, '#');
  b.rect(2, 7, 13, 7, '#');
  // 통로
  b.path([[0, 14], [14, 14], [22, 14], [30, 18], [38, 19]], 2);
  b.path([[22, 14], [22, 6], [30, 6], [37, 6], [37, 0]], 2);
  b.path([[8, 14], [8, 8]], 1);
  // 늪
  b.blob(21, 21, 4, 2.5, '~', 12);
  b.blob(25, 9, 2.4, 1.6, '~', 14);
  // 비밀 방
  b.rect(3, 2, 12, 6, '.');
  b.set(8, 7, '.');
  b.reserve(8, 7).reserve(8, 4, 1);
  b.reserve(18, 13, 1).reserve(40, 21, 2).reserve(28, 4, 1).reserve(43, 23, 1).reserve(17, 5, 1).reserve(36, 3, 1);
  b.scatter('P', 8, 2, 2, 43, 25, 3);
  b.scatter('p', 10, 2, 2, 43, 25, 7);
  b.scatter('o', 6, 2, 2, 43, 25, 9);
  b.sprinkle(0.1, 6);
  return {
    id: 'ruins', name: '잠긴 폐허', biome: 'ruins', music: 'field', tree: 'tree_hub', rows: W(b), enter: 'ruins_enter',
    spawns: { west: [2, 14, 'right'], shrine: [37, 2, 'down'] },
    ents: [
      { k: 'exit', id: 'x_w', x: 0, y: 13, w: 1, h: 3, to: 'meadow', spawn: 'east' },
      { k: 'exit', id: 'x_n', x: 36, y: 0, w: 3, h: 1, to: 'shrine_ember', spawn: 'south', showIf: 'orin_joined' },
      { k: 'trigger', id: 'tr_gate', x: 36, y: 1, w: 3, h: 1, script: 'ember_locked', hideIf: 'orin_joined' },
      { k: 'enemy', id: 'en_r1', x: 10, y: 15, group: 'r1', sprite: 'f_caller', radius: 4, pre: 'r1_pre' },
      { k: 'rest', id: 'rest_ruins', x: 18, y: 12 },
      { k: 'read', id: 'mural_r', x: 17, y: 4, sprite: 'mural', text: 'mural_seals' },
      { k: 'enemy', id: 'en_r2', x: 25, y: 5, group: 'r2', sprite: 'f_hound', radius: 4 },
      { k: 'enemy', id: 'en_r3', x: 26, y: 18, group: 'r3', sprite: 'f_hollow', radius: 4 },
      { k: 'trigger', id: 'tr_orin', x: 34, y: 17, w: 1, h: 4, script: 'orin_pre', hideIf: 'orin_joined' },
      { k: 'enemy', id: 'en_orin', x: 38, y: 19, group: 'r_orin', sprite: 'f_shell', radius: 2, post: 'orin_post', flip: true },
      { k: 'npc', id: 'orin_trapped', x: 41, y: 20, sprite: 'orin_field', talk: 'orin_wait', hideIf: 'orin_joined', dir: 'left' },
      { k: 'chest', id: 'ch_r1', x: 28, y: 4, loot: [['rl_weight', 1]] },
      { k: 'chest', id: 'ch_r2', x: 43, y: 23, loot: [['rl_leaf', 1], ['dew', 1]] },
      { k: 'enemy', id: 'en_r4', x: 38, y: 8, group: 'r4', sprite: 'f_shell', radius: 4 },
      { k: 'crack', id: 'cr_r', x: 8, y: 7 },
      { k: 'chest', id: 'ch_r3', x: 8, y: 3, loot: [['w_rend', 1], ['crystal', 1]] },
      { k: 'read', id: 'rec_r', x: 5, y: 3, sprite: 'sign', text: 'record_ruins' },
      { k: 'prop', id: 'gate_r', x: 37, y: 2, sprite: 'gate', anim: 'open' },
    ],
  };
}

/* ============================================================ 성소 (공통 골격) */
function shrine(id: string, name: string, biome: string, opts: { groups: [string, string][]; boss: string; bossGroup: string; bossSprite: string; seal: string; chests: [number, number, [string, number][]][]; back: [string, string]; pre: string; post: string; record: string }): MapDef {
  const b = new MapBuilder(26, 32);
  b.ragged('#', 2, id.length * 3);
  b.path([[12, 31], [12, 26], [8, 22], [8, 18], [17, 14], [17, 10], [12, 7], [12, 3]], 3, '=');
  // 용암·물길 띠
  for (const y of [24, 16]) {
    b.rect(2, y, 23, y + 1, '~');
    for (let x = 2; x <= 23; x++) for (let k = 0; k < 2; k++) if (b.isReserved(x, y + k)) b.set(x, y + k, 'b');
  }
  b.rect(8, 2, 16, 6, '=');
  for (let y = 2; y <= 6; y++) for (let x = 8; x <= 16; x++) b.reserve(x, y);
  for (const [x, y] of opts.chests.map((c) => [c[0], c[1]] as Pt)) b.reserve(x, y, 1);
  b.reserve(13, 12, 1).reserve(5, 20, 1);
  for (let y = 4; y <= 28; y += 4) { if (!b.isReserved(4, y)) b.set(4, y, 'P'); if (!b.isReserved(21, y)) b.set(21, y, 'P'); }
  b.scatter('p', 6, 3, 3, 22, 29, 17);
  b.sprinkle(0.1, 9);
  const ents: Ent[] = [
    { k: 'exit', id: 'x_s', x: 11, y: 31, w: 3, h: 1, to: opts.back[0], spawn: opts.back[1] },
    { k: 'enemy', id: `en_${id}_1`, x: 9, y: 20, group: opts.groups[0][0], sprite: opts.groups[0][1], radius: 4 },
    { k: 'enemy', id: `en_${id}_2`, x: 16, y: 11, group: opts.groups[1][0], sprite: opts.groups[1][1], radius: 4 },
    { k: 'rest', id: `rest_${id}`, x: 14, y: 8 },
    { k: 'read', id: `rec_${id}`, x: 5, y: 20, sprite: 'sign', text: opts.record },
    { k: 'enemy', id: `boss_${id}`, x: 12, y: 4, group: opts.bossGroup, sprite: opts.bossSprite, radius: 0, boss: true, pre: opts.pre, post: opts.post, hideIf: opts.seal },
    { k: 'pedestal', id: `ped_${id}`, x: 12, y: 3, seal: opts.seal, showIf: opts.seal },
  ];
  opts.chests.forEach(([x, y, loot], i) => ents.push({ k: 'chest', id: `ch_${id}_${i}`, x, y, loot }));
  return { id, name, biome, music: 'shrine', tree: 'pillar', rows: W(b), ents, spawns: { south: [12, 29, 'up'] }, enter: `${id}_enter` };
}

/* ============================================================ 유리숲 */
function glass(): MapDef {
  const b = new MapBuilder(46, 28);
  b.ragged('T', 3, 33);
  b.path([[23, 27], [23, 20], [12, 15], [14, 7], [23, 4], [23, 0]], 2);
  b.path([[23, 20], [34, 14], [40, 21]], 2);
  b.path([[14, 7], [6, 7]], 1);
  b.blob(31, 23, 3.5, 2, '~', 5);
  b.blob(8, 12, 2.5, 3, '~', 6);
  b.blob(33, 6, 3, 2, '~', 7);
  // 비밀: 금 간 벽 너머
  b.rect(2, 2, 8, 5, '#');
  b.rect(3, 3, 6, 4, '.');
  b.set(5, 5, '.').set(5, 6, '.');
  b.reserve(5, 5).reserve(5, 6).reserve(4, 3, 1);
  b.reserve(26, 18, 1).reserve(40, 22, 1).reserve(6, 20, 1).reserve(38, 4, 1).reserve(29, 20, 1);
  b.scatter('T', 30, 2, 2, 43, 25, 51);
  b.scatter('c', 14, 2, 2, 43, 25, 53);
  b.sprinkle(0.12, 44);
  return {
    id: 'glass', name: '유리숲', biome: 'glass', music: 'field', tree: 'tree_glass', rows: W(b), enter: 'glass_enter',
    spawns: { south: [23, 25, 'up'], north: [23, 2, 'down'] },
    ents: [
      { k: 'exit', id: 'x_s', x: 22, y: 27, w: 2, h: 1, to: 'hub', spawn: 'north' },
      { k: 'exit', id: 'x_n', x: 22, y: 0, w: 2, h: 1, to: 'shrine_glass', spawn: 'south' },
      { k: 'enemy', id: 'en_gtut', x: 23, y: 21, group: 'g_tut', sprite: 'f_flame', radius: 3, pre: 'aim_pre' },
      { k: 'rest', id: 'rest_glass', x: 26, y: 18 },
      { k: 'read', id: 'rec_g', x: 29, y: 20, sprite: 'sign', text: 'record_glass' },
      { k: 'enemy', id: 'en_g1', x: 13, y: 14, group: 'g1', sprite: 'f_flame', radius: 4 },
      { k: 'enemy', id: 'en_g2', x: 34, y: 13, group: 'g2', sprite: 'f_shell', radius: 4 },
      { k: 'enemy', id: 'en_g3', x: 16, y: 7, group: 'g3', sprite: 'f_caller', radius: 4 },
      { k: 'chest', id: 'ch_g1', x: 40, y: 22, loot: [['w_abyss', 1], ['potion', 2]] },
      { k: 'chest', id: 'ch_g2', x: 6, y: 20, loot: [['rl_lens', 1]] },
      { k: 'chest', id: 'ch_g3', x: 38, y: 4, loot: [['rl_charm', 1], ['fragment', 1]] },
      { k: 'crack', id: 'cr_g', x: 5, y: 5 },
      { k: 'chest', id: 'ch_g4', x: 4, y: 3, loot: [['insight_leaf', 1], ['crystal', 1]] },
      { k: 'read', id: 'mural_g', x: 20, y: 3, sprite: 'mural', text: 'mural_glass' },
    ],
  };
}

/* ============================================================ 부서진 고원 */
function plateau(): MapDef {
  const b = new MapBuilder(48, 28);
  b.ragged('#', 2, 61);
  b.path([[47, 13], [38, 13], [30, 8], [22, 12], [20, 18], [10, 13], [0, 13]], 2);
  b.path([[30, 8], [22, 3]], 1);
  b.path([[38, 13], [42, 18]], 2);
  b.path([[22, 12], [24, 14]], 1);
  // 심연 틈
  b.blob(14, 5, 5, 2, '~', 3);
  b.blob(34, 20, 3.5, 2, '~', 4);
  b.blob(8, 21, 3, 2.5, '~', 5);
  // 숨겨진 강적 구역
  b.rect(25, 21, 38, 26, '#');
  b.rect(26, 23, 37, 25, '.');
  b.set(30, 21, '.').set(30, 22, '.');
  b.path([[29, 19], [30, 20]], 1);
  b.reserve(30, 21).reserve(30, 22).reserve(33, 24, 1).reserve(36, 24, 1);
  b.reserve(42, 18, 1).reserve(22, 3, 1).reserve(5, 24, 1).reserve(44, 3, 1).reserve(24, 14, 1);
  b.scatter('o', 16, 2, 2, 45, 25, 71);
  b.scatter('T', 12, 2, 2, 45, 25, 73);
  b.sprinkle(0.12, 66);
  return {
    id: 'plateau', name: '부서진 고원', biome: 'plateau', music: 'field', tree: 'tree_plateau', rows: W(b), enter: 'plateau_enter',
    spawns: { east: [45, 13, 'left'], west: [2, 13, 'right'] },
    ents: [
      { k: 'exit', id: 'x_e', x: 47, y: 12, w: 1, h: 3, to: 'hub', spawn: 'west' },
      { k: 'exit', id: 'x_w', x: 0, y: 12, w: 1, h: 3, to: 'shrine_storm', spawn: 'south' },
      { k: 'enemy', id: 'en_p1', x: 37, y: 12, group: 'p1', sprite: 'f_colossus', radius: 4 },
      { k: 'rest', id: 'rest_plateau', x: 42, y: 18 },
      { k: 'enemy', id: 'en_p2', x: 29, y: 9, group: 'p2', sprite: 'f_hound', radius: 5 },
      { k: 'enemy', id: 'en_p3', x: 20, y: 17, group: 'p3', sprite: 'f_colossus', radius: 4 },
      { k: 'enemy', id: 'en_p4', x: 10, y: 12, group: 'p4', sprite: 'f_hollow', radius: 4 },
      { k: 'read', id: 'rec_p', x: 24, y: 14, sprite: 'sign', text: 'record_plateau' },
      { k: 'chest', id: 'ch_p1', x: 22, y: 3, loot: [['rl_quill', 1]] },
      { k: 'chest', id: 'ch_p2', x: 5, y: 24, loot: [['rl_dusk', 1], ['seed', 1]] },
      { k: 'chest', id: 'ch_p3', x: 44, y: 3, loot: [['insight_leaf', 1], ['fragment', 2]] },
      { k: 'crack', id: 'cr_p', x: 30, y: 21 },
      { k: 'enemy', id: 'en_elite', x: 33, y: 24, group: 'p_elite', sprite: 'f_colossus', radius: 2, pre: 'elite_pre' },
      { k: 'chest', id: 'ch_p4', x: 36, y: 24, loot: [['w_siege', 1], ['fragment', 1]] },
    ],
  };
}

/* ============================================================ 세계뿌리 심부 */
function depths(): MapDef {
  const b = new MapBuilder(28, 36);
  b.ragged('#', 2, 81);
  b.path([[13, 0], [13, 8], [8, 14], [9, 20], [18, 24], [14, 29], [14, 33]], 3);
  b.blob(20, 11, 3, 4, '~', 3);
  b.blob(5, 26, 2.5, 3, '~', 4);
  b.rect(9, 29, 19, 34, '=');
  for (let y = 29; y <= 34; y++) for (let x = 9; x <= 19; x++) b.reserve(x, y);
  b.reserve(4, 14, 1).reserve(23, 17, 1).reserve(19, 25, 1);
  b.scatter('T', 10, 2, 2, 25, 27, 91);
  b.scatter('*', 10, 2, 2, 25, 27, 93);
  b.sprinkle(0.1, 88);
  return {
    id: 'depths', name: '세계뿌리 심부', biome: 'depths', music: 'shrine', tree: 'tree_depths', rows: W(b), enter: 'depths_enter',
    spawns: { north: [13, 2, 'down'] },
    ents: [
      { k: 'exit', id: 'x_n', x: 12, y: 0, w: 3, h: 1, to: 'hub', spawn: 'gate' },
      { k: 'enemy', id: 'en_d1', x: 12, y: 9, group: 'd1', sprite: 'f_shell', radius: 4 },
      { k: 'enemy', id: 'en_d2', x: 9, y: 19, group: 'd2', sprite: 'f_colossus', radius: 4 },
      { k: 'chest', id: 'ch_d1', x: 4, y: 14, loot: [['crystal', 1], ['dew', 2]] },
      { k: 'chest', id: 'ch_d2', x: 23, y: 17, loot: [['seed', 2], ['sap', 2]] },
      { k: 'rest', id: 'rest_depths', x: 19, y: 25 },
      { k: 'read', id: 'rec_d', x: 11, y: 26, sprite: 'sign', text: 'record_depths' },
      { k: 'enemy', id: 'boss_final', x: 14, y: 31, group: 'd_boss', sprite: 'thornknight', radius: 0, boss: true, pre: 'final_pre', post: 'final_post' },
    ],
  };
}

export const MAPS: Record<string, MapDef> = {};
for (const m of [
  hub(),
  meadow(),
  ruins(),
  shrine('shrine_ember', '잿불 성소', 'shrine_ember', {
    groups: [['e1', 'f_hollow'], ['e2', 'f_caller']], boss: 'warden', bossGroup: 'e_boss', bossSprite: 'warden', seal: 'seal_ember',
    chests: [[5, 12, [['rl_buckle', 1]]], [21, 20, [['potion', 2], ['fragment', 1]]]], back: ['ruins', 'shrine'], pre: 'warden_pre', post: 'warden_post', record: 'record_ember',
  }),
  glass(),
  shrine('shrine_glass', '유리 성소', 'shrine_glass', {
    groups: [['sg1', 'f_flame'], ['g2', 'f_shell']], boss: 'stag', bossGroup: 'sg_boss', bossSprite: 'stag', seal: 'seal_glass',
    chests: [[5, 12, [['rl_chime', 1]]], [21, 20, [['dew', 1], ['sap', 1]]]], back: ['glass', 'north'], pre: 'stag_pre', post: 'stag_post', record: 'record_sglass',
  }),
  plateau(),
  shrine('shrine_storm', '폭풍 성소', 'shrine_storm', {
    groups: [['ss1', 'f_caller'], ['p4', 'f_hollow']], boss: 'chorister', bossGroup: 'ss_boss', bossSprite: 'chorister', seal: 'seal_storm',
    chests: [[5, 12, [['rl_pulse', 1]]], [21, 20, [['fragment', 2], ['seed', 1]]]], back: ['plateau', 'west'], pre: 'chorister_pre', post: 'chorister_post', record: 'record_storm',
  }),
  depths(),
]) MAPS[m.id] = m;

/** 걸을 수 없는 타일 문자 */
export const BLOCK_TILES = new Set(['~', '#', 'T', 'o', '*', 'P', 'p', 'c', 'f', 'h', 'w', 'l', 't', 's', 'm']);

/** 타일이 막는 칸 (큰 소품은 여러 칸) */
export function blockedCells(m: MapDef): Set<number> {
  const w = m.rows[0].length;
  const out = new Set<number>();
  m.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!BLOCK_TILES.has(ch)) return;
    out.add(y * w + x);
    if (ch === 'h') for (const [dx, dy] of [[-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]]) out.add((y + dy) * w + x + dx);
    if (ch === 't') out.add(y * w + x + 1);
  }));
  return out;
}
