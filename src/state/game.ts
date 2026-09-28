/**
 * 영속 게임 상태 (저장 대상)와 파티 성장 규칙.
 */
import { CHARS, CHAR_IDS, SKILLS, START_WEAPON, WEAPONS, charSkills, chargeMaxFor } from '../data/characters';
import { RELICS, ITEMS } from '../data/items';
import { INSIGHT, MASTERY, WEAPON_UP, XP, Difficulty } from '../data/config';
import { blankUnit } from '../combat/battle';
import type { CharId, Unit } from '../combat/types';

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface CharSave {
  level: number;
  xp: number;
  hp: number;
  learned: string[];
  equipped: string[];
  weapon: string;
  relics: (string | null)[];
  echoes: string[];
}

export interface SaveData {
  version: number;
  difficulty: Difficulty;
  playTime: number;
  map: string;
  x: number;
  y: number;
  dir: Dir;
  rest: { map: string; x: number; y: number } | null;
  roster: CharId[];
  active: CharId[];
  chars: Record<CharId, CharSave>;
  weaponsOwned: string[];
  weaponLv: Record<string, number>;
  relicsOwned: string[];
  relicMastery: Record<string, number>;
  echoesUnlocked: string[];
  insightBonus: number;
  items: Record<string, number>;
  money: number;
  flags: Record<string, number>;
  seals: string[];
  bosses: string[];
  discovered: string[];
  stats: { battles: number; perfectParries: number; counters: number; breaks: number; weakHits: number; defeats: number };
  ending: string | null;
  savedAt: number;
}

export const SAVE_VERSION = 1;

export const EQUIP_SLOTS = 6;
export const RELIC_SLOTS = 3;

function newChar(id: CharId): CharSave {
  const start = charSkills(id).filter((s) => !s.learn.level && !s.learn.crystal).map((s) => s.id);
  return {
    level: 1, xp: 0, hp: CHARS[id].base.hp, learned: start, equipped: start.slice(0, EQUIP_SLOTS), weapon: START_WEAPON[id], relics: [null, null, null], echoes: [],
  };
}

export function newGame(difficulty: Difficulty): SaveData {
  const chars = Object.fromEntries(CHAR_IDS.map((c) => [c, newChar(c)])) as Record<CharId, CharSave>;
  return {
    version: SAVE_VERSION, difficulty, playTime: 0,
    map: 'hub', x: 0, y: 0, dir: 'down', rest: null,
    roster: ['kael', 'mira'], active: ['kael', 'mira'],
    chars,
    weaponsOwned: Object.values(START_WEAPON), weaponLv: {},
    relicsOwned: [], relicMastery: {}, echoesUnlocked: [], insightBonus: 0,
    items: { potion: 3, dew: 1 }, money: 60,
    flags: {}, seals: [], bosses: [], discovered: ['hub'],
    stats: { battles: 0, perfectParries: 0, counters: 0, breaks: 0, weakHits: 0, defeats: 0 },
    ending: null, savedAt: 0,
  };
}

/* ---------- 능력치 ---------- */

export type StatKey = 'hp' | 'atk' | 'def' | 'agi' | 'foc';
export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'agi', 'foc'];

export function charStats(s: SaveData, id: CharId): Record<StatKey, number> {
  const d = CHARS[id], c = s.chars[id];
  const out = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) out[k] = Math.round(d.base[k] + d.growth[k] * (c.level - 1));
  for (const r of c.relics) if (r && RELICS[r]) for (const [k, v] of Object.entries(RELICS[r].stats)) out[k as StatKey] += v as number;
  const w = WEAPONS[c.weapon];
  if (w) out.atk += w.atk + (s.weaponLv[w.id] ?? 0) * WEAPON_UP.atkPerLevel;
  return out;
}

export function insightCap(s: SaveData): number {
  const guardians = s.bosses.filter((b) => b !== 'thornknight').length;
  return Math.min(INSIGHT.max, INSIGHT.base + guardians * INSIGHT.perGuardian + s.insightBonus);
}
export function insightUsed(s: SaveData, id: CharId): number {
  return s.chars[id].echoes.reduce((n, e) => n + (RELICS[e]?.insight ?? 0), 0);
}

/** 이 캐릭터가 가진 패시브 (무기 + 장착 유물 + 메아리, 중복 제거) */
export function charPassives(s: SaveData, id: CharId): { passives: string[]; relicPassives: Record<string, string> } {
  const c = s.chars[id];
  const set = new Set<string>();
  const w = WEAPONS[c.weapon];
  if (w) set.add(w.passive);
  const relicPassives: Record<string, string> = {};
  for (const r of c.relics) if (r && RELICS[r]) { set.add(RELICS[r].passive); relicPassives[r] = RELICS[r].passive; }
  for (const e of c.echoes) if (RELICS[e] && s.echoesUnlocked.includes(e)) set.add(RELICS[e].passive);
  return { passives: [...set], relicPassives };
}

export function buildAllyUnit(s: SaveData, id: CharId, idx: number): Unit {
  const st = charStats(s, id), c = s.chars[id], d = CHARS[id];
  const { passives, relicPassives } = charPassives(s, id);
  const hp = Math.max(1, Math.min(st.hp, c.hp));
  return blankUnit({
    uid: `a${idx}`, side: 'ally', name: d.name, sheet: d.sheet, charId: id,
    hp, maxHp: st.hp, atk: st.atk, def: st.def, agi: st.agi, foc: st.foc,
    passives, relicPassives, skills: c.equipped.filter((x) => SKILLS[x]), weapon: c.weapon,
    stance: 'guard', chargeMax: chargeMaxFor(c.weapon), charge: id === 'orin' ? 1 : 0,
  });
}

/* ---------- 성장 ---------- */

export interface LevelUp {
  char: CharId;
  level: number;
  learned: string[];
}

export function grantXp(s: SaveData, id: CharId, n: number): LevelUp[] {
  const c = s.chars[id];
  const ups: LevelUp[] = [];
  c.xp += Math.round(n);
  while (c.level < XP.maxLevel && c.xp >= XP.need(c.level)) {
    c.xp -= XP.need(c.level);
    c.level++;
    const learned: string[] = [];
    for (const sk of charSkills(id)) {
      if (sk.learn.level && sk.learn.level <= c.level && !c.learned.includes(sk.id)) {
        c.learned.push(sk.id);
        if (c.equipped.length < EQUIP_SLOTS) c.equipped.push(sk.id);
        learned.push(sk.id);
      }
    }
    ups.push({ char: id, level: c.level, learned });
  }
  if (c.level >= XP.maxLevel) c.xp = 0;
  return ups;
}

/** 유물 숙련: 반환값 = 새로 해금된 메아리 */
export function addMastery(s: SaveData, relic: string, n: number): boolean {
  const r = RELICS[relic];
  if (!r || s.echoesUnlocked.includes(relic)) return false;
  s.relicMastery[relic] = Math.min(r.mastery, (s.relicMastery[relic] ?? 0) + n);
  if (s.relicMastery[relic] >= r.mastery) {
    s.echoesUnlocked.push(relic);
    return true;
  }
  return false;
}

/** 전투 종료 후 숙련 처리 */
export function applyBattleMastery(s: SaveData, triggers: Record<string, number>): string[] {
  const unlocked: string[] = [];
  const seen = new Set<string>();
  for (const id of s.active) {
    for (const r of s.chars[id].relics) {
      if (!r || seen.has(r)) continue;
      seen.add(r);
      const t = Math.min(MASTERY.triggerCapPerBattle, (triggers[`${id}:${r}`] ?? 0) * MASTERY.perTrigger);
      if (addMastery(s, r, MASTERY.perBattle + t)) unlocked.push(r);
    }
  }
  return unlocked;
}

export function equipRelic(s: SaveData, id: CharId, slot: number, relic: string | null): void {
  if (relic) for (const c of CHAR_IDS) s.chars[c].relics = s.chars[c].relics.map((r) => (r === relic ? null : r));
  s.chars[id].relics[slot] = relic;
}

export function toggleEcho(s: SaveData, id: CharId, relic: string): 'on' | 'off' | 'nocap' {
  const c = s.chars[id];
  if (c.echoes.includes(relic)) {
    c.echoes = c.echoes.filter((e) => e !== relic);
    return 'off';
  }
  if (insightUsed(s, id) + (RELICS[relic]?.insight ?? 0) > insightCap(s)) return 'nocap';
  c.echoes.push(relic);
  return 'on';
}

export function toggleSkill(s: SaveData, id: CharId, skill: string): 'on' | 'off' | 'full' {
  const c = s.chars[id];
  if (c.equipped.includes(skill)) {
    c.equipped = c.equipped.filter((x) => x !== skill);
    return 'off';
  }
  if (c.equipped.length >= EQUIP_SLOTS) return 'full';
  c.equipped.push(skill);
  return 'on';
}

export function learnWithCrystal(s: SaveData, id: CharId, skill: string): boolean {
  const c = s.chars[id];
  const sk = SKILLS[skill];
  if (!sk?.learn.crystal || c.learned.includes(skill) || (s.items.crystal ?? 0) < 1) return false;
  s.items.crystal--;
  c.learned.push(skill);
  if (c.equipped.length < EQUIP_SLOTS) c.equipped.push(skill);
  return true;
}

export function upgradeCost(s: SaveData, weapon: string): { frag: number; money: number } | null {
  const lv = s.weaponLv[weapon] ?? 0;
  if (lv >= WEAPON_UP.maxLevel) return null;
  return { frag: WEAPON_UP.cost[lv + 1], money: WEAPON_UP.money[lv + 1] };
}
export function upgradeWeapon(s: SaveData, weapon: string): boolean {
  const c = upgradeCost(s, weapon);
  if (!c || (s.items.fragment ?? 0) < c.frag || s.money < c.money) return false;
  s.items.fragment -= c.frag;
  s.money -= c.money;
  s.weaponLv[weapon] = (s.weaponLv[weapon] ?? 0) + 1;
  return true;
}

export function addItem(s: SaveData, id: string, n = 1): void {
  if (id === 'money') { s.money += n; return; }
  if (id === 'insight_leaf') { s.insightBonus += n; }
  if (id.startsWith('w_')) { if (!s.weaponsOwned.includes(id)) s.weaponsOwned.push(id); return; }
  if (id.startsWith('rl_')) { if (!s.relicsOwned.includes(id)) s.relicsOwned.push(id); return; }
  if (!ITEMS[id]) return;
  s.items[id] = (s.items[id] ?? 0) + n;
}

export function itemLabel(id: string, n = 1): string {
  if (id === 'money') return `은화 ${n}`;
  if (WEAPONS[id]) return `무기 「${WEAPONS[id].name}」`;
  if (RELICS[id]) return `유물 「${RELICS[id].name}」`;
  const it = ITEMS[id];
  return it ? (n > 1 ? `${it.name} ×${n}` : it.name) : id;
}

export function fullHeal(s: SaveData): void {
  for (const c of CHAR_IDS) s.chars[c].hp = charStats(s, c).hp;
}

export function joinParty(s: SaveData, id: CharId): void {
  if (s.roster.includes(id)) return;
  s.roster.push(id);
  if (s.active.length < 3) s.active.push(id);
  // 합류 캐릭터는 파티 평균 레벨로 맞춘다
  const avg = Math.round(s.roster.filter((c) => c !== id).reduce((n, c) => n + s.chars[c].level, 0) / Math.max(1, s.roster.length - 1));
  const c = s.chars[id];
  while (c.level < avg) grantXp(s, id, XP.need(c.level) - c.xp);
  s.chars[id].hp = charStats(s, id).hp;
}
