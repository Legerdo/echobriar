/**
 * 브라우저 로컬 저장. 손상·구버전 데이터가 게임 전체를 멈추지 않도록 검증·보정한다.
 */
import { DEFAULT_KEYS, KeyMap, ACTIONS } from '../input/input';
import { mergeDefaults } from '../core/util';
import { newGame, SaveData, SAVE_VERSION } from './game';
import { CHAR_IDS, SKILLS, WEAPONS } from '../data/characters';
import { MAPS } from '../data/maps';
import type { Difficulty } from '../data/config';

const SAVE_KEY = 'echobriar.save.v1';
const BACKUP_KEY = 'echobriar.save.v1.bak';
const SETTINGS_KEY = 'echobriar.settings.v1';

export interface Settings {
  shake: number;
  flash: number;
  textSpeed: 'slow' | 'normal' | 'fast' | 'instant';
  uiScale: number;
  reactionAssist: boolean;
  autoTiming: boolean;
  tutorials: boolean;
  volMaster: number;
  volMusic: number;
  volSfx: number;
  keys: KeyMap;
  seenTutorials: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  shake: 1, flash: 1, textSpeed: 'normal', uiScale: 1, reactionAssist: false, autoTiming: false, tutorials: true,
  volMaster: 0.8, volMusic: 0.6, volSfx: 0.8, keys: DEFAULT_KEYS, seenTutorials: [],
};

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  const raw = storage()?.getItem(SETTINGS_KEY);
  if (!raw) return mergeDefaults(DEFAULT_SETTINGS, null);
  try {
    const s = mergeDefaults(DEFAULT_SETTINGS, JSON.parse(raw));
    // 키 배열 검증
    for (const a of ACTIONS) if (!Array.isArray(s.keys[a]) || !s.keys[a].every((k) => typeof k === 'string')) s.keys[a] = [...DEFAULT_KEYS[a]];
    s.uiScale = [1, 1.25, 1.5].includes(s.uiScale) ? s.uiScale : 1;
    for (const k of ['shake', 'flash', 'volMaster', 'volMusic', 'volSfx'] as const) s[k] = Math.max(0, Math.min(1, Number(s[k]) || 0));
    return s;
  } catch {
    return mergeDefaults(DEFAULT_SETTINGS, null);
  }
}

export function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 저장 공간 부족 등은 무시 */
  }
}

export function hasSave(): boolean {
  return !!storage()?.getItem(SAVE_KEY);
}

export function writeSave(s: SaveData): boolean {
  const st = storage();
  if (!st) return false;
  try {
    s.savedAt = Date.now();
    const prev = st.getItem(SAVE_KEY);
    if (prev) st.setItem(BACKUP_KEY, prev);
    st.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave(): void {
  storage()?.removeItem(SAVE_KEY);
  storage()?.removeItem(BACKUP_KEY);
}

/** 저장 데이터를 기본값과 병합하고 참조 무결성을 보정. 복구 불가면 null */
export function sanitize(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SaveData>;
  const diff: Difficulty = r.difficulty === 'story' || r.difficulty === 'expert' ? r.difficulty : 'normal';
  const s = mergeDefaults(newGame(diff), raw);
  if (typeof s.version !== 'number' || s.version > SAVE_VERSION) return null;
  s.version = SAVE_VERSION;
  if (!MAPS[s.map]) { s.map = 'hub'; s.x = 0; s.y = 0; }
  if (s.rest && !MAPS[s.rest.map]) s.rest = null;
  s.roster = s.roster.filter((c) => CHAR_IDS.includes(c));
  if (!s.roster.includes('kael')) s.roster.unshift('kael');
  s.active = s.active.filter((c, i, a) => s.roster.includes(c) && a.indexOf(c) === i).slice(0, 3);
  if (!s.active.length) s.active = s.roster.slice(0, 3);
  for (const c of CHAR_IDS) {
    const ch = s.chars[c];
    ch.level = Math.max(1, Math.min(15, Math.floor(Number(ch.level) || 1)));
    ch.learned = ch.learned.filter((k) => SKILLS[k]?.char === c);
    ch.equipped = ch.equipped.filter((k, i, a) => ch.learned.includes(k) && a.indexOf(k) === i).slice(0, 6);
    if (!WEAPONS[ch.weapon] || WEAPONS[ch.weapon].char !== c) ch.weapon = Object.values(WEAPONS).find((w) => w.char === c)!.id;
    ch.relics = [0, 1, 2].map((i) => (typeof ch.relics[i] === 'string' && s.relicsOwned.includes(ch.relics[i] as string) ? ch.relics[i] : null));
    ch.echoes = ch.echoes.filter((e) => s.echoesUnlocked.includes(e));
    if (!(ch.hp > 0)) ch.hp = 1;
  }
  for (const [k, v] of Object.entries(s.items)) if (!(typeof v === 'number' && v >= 0)) delete s.items[k];
  if (!(s.money >= 0)) s.money = 0;
  if (!(s.playTime >= 0)) s.playTime = 0;
  return s;
}

export function readSave(): { data: SaveData | null; corrupt: boolean } {
  const st = storage();
  if (!st) return { data: null, corrupt: false };
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    const raw = st.getItem(key);
    if (!raw) continue;
    try {
      const s = sanitize(JSON.parse(raw));
      if (s) return { data: s, corrupt: key === BACKUP_KEY };
    } catch {
      /* 다음 후보 */
    }
  }
  return { data: null, corrupt: !!st.getItem(SAVE_KEY) };
}
