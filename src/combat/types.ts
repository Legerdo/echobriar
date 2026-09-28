import type { Sfx } from '../audio/audio';
import type { Difficulty } from '../data/config';

export type CharId = 'kael' | 'mira' | 'sera' | 'orin';
export type Side = 'ally' | 'enemy';
export type StatusId = 'burn' | 'mark' | 'exposed' | 'guard' | 'shield' | 'slow' | 'haste' | 'vulnerable' | 'daze';
export type Stance = 'guard' | 'assault' | 'flow';
export type Element = 'fire' | 'tide' | 'storm';
export type MarkType = 'crack' | 'track' | 'echo';
export type HitKind = 'normal' | 'ground' | 'unblockable';
export type Grade = 'fail' | 'good' | 'perfect';

export interface Status {
  id: StatusId;
  turns: number;
  /** 화상 피해량, 보호막 잔량, 표식 배율 등 */
  value: number;
}

export type TimingSpec =
  | { type: 'tap' }
  | { type: 'multi' }
  | { type: 'hold' }
  | { type: 'rhythm'; beats: number; interval: number };

export interface StatusApply {
  id: StatusId;
  turns: number;
  value?: number;
  chance?: number;
  to?: 'target' | 'self' | 'allies' | 'all';
}

export interface SkillDef {
  id: string;
  char: CharId;
  name: string;
  desc: string;
  ap: number;
  /** 역할 분류 (도움말 표시용) */
  role: '생성' | '준비' | '주력' | '붕괴' | '지원' | '방어' | '결전';
  target: 'enemy' | 'allEnemies' | 'ally' | 'allAllies' | 'self' | 'deadAlly';
  anim: 'attack' | 'skill' | 'skill2' | 'support';
  timing: TimingSpec | null;
  power?: number;
  brk?: number;
  breaker?: boolean;
  fx?: string;
  sfx?: Sfx;
  status?: StatusApply[];
  stance?: Stance;
  /** 이 자세일 때만 붙는 추가 효과 설명은 desc에 */
  sigils?: Element[];
  consume?: Element[];
  mark?: MarkType;
  detonate?: boolean;
  chargeGain?: number;
  chargeCost?: number;
  chargeAll?: boolean;
  chargeMin?: number;
  apGive?: number;
  heal?: number;
  shield?: number;
  revive?: boolean;
  special?: string;
  learn: { level?: number; crystal?: boolean };
}

export interface WeaponDef {
  id: string;
  char: CharId;
  name: string;
  desc: string;
  atk: number;
  passive: string;
}

export interface CharDef {
  id: CharId;
  name: string;
  title: string;
  resource: string;
  resourceDesc: string;
  sheet: string;
  field: string;
  base: { hp: number; atk: number; def: number; agi: number; foc: number };
  growth: { hp: number; atk: number; def: number; agi: number; foc: number };
  basic: { name: string; power: number; brk: number; fx: string; sfx: Sfx };
  aimFx: string;
  resonance2: string;
}

/** 전투 유닛 (아군·적 공통) */
export interface Unit {
  uid: string;
  side: Side;
  name: string;
  sheet: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  agi: number;
  foc: number;
  statuses: Status[];
  next: number;
  alive: boolean;
  /* 아군 */
  charId?: CharId;
  ap: number;
  stance: Stance;
  stancesUsed: Stance[];
  sigils: Element[];
  charge: number;
  chargeMax: number;
  passives: string[];
  /** 유물 id → 패시브 id (숙련 추적) */
  relicPassives: Record<string, string>;
  skills: string[];
  weapon: string;
  /** 다음 공격 강화 (완벽 패링 유물 등) */
  empower: number;
  /** 연계 신호: 다음 아군 공격이 표식을 폭발 */
  linkSignal: boolean;
  dodgeApUsed: boolean;
  /* 적 */
  enemyId?: string;
  brk: number;
  brkMax: number;
  breakReady: boolean;
  brokenTurns: number;
  breakCount: number;
  marks: Partial<Record<MarkType, number>>;
  /** 충전 중인 강공격 */
  charging: { attack: string; turns: number } | null;
  /** 파괴된 부위 */
  parts: string[];
  /** 봉쇄된 공격 (부위 파괴 등) */
  sealed: string[];
  rotation: number;
  cooldowns: Record<string, number>;
  phase: number;
  /** 소환체 여부 */
  summoned: boolean;
  /** 표시 시트 교체 (부위 파괴) */
  sheetOverride: string | null;
  flags: Record<string, number>;
}

export interface BattleOptions {
  difficulty: Difficulty;
  seed: number;
  advantage: 'none' | 'party' | 'enemy';
  reactionAssist: boolean;
  autoTiming: boolean;
  invincible?: boolean;
}
