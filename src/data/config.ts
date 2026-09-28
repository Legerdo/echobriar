/**
 * 전투 수치·판정 폭의 단일 출처. 코드 곳곳에 매직 넘버를 두지 않는다.
 * 판정 폭은 [접촉 전 허용 ms, 접촉 후 허용 ms].
 */
export type Difficulty = 'story' | 'normal' | 'expert';
export type ReactKind = 'dodge' | 'parry' | 'jump';

export interface DifficultyDef {
  label: string;
  desc: string;
  react: Record<ReactKind, [number, number]>;
  /** 공격 타이밍: 완벽 / 성공 허용 폭 (±ms) */
  timing: { perfect: number; good: number };
  enemyDmg: number;
  enemyHp: number;
  /** 접근 고리(반응 보조 표시) 기본 표시 */
  guideRing: boolean;
  /** 숙련: 적 패턴에 추가 타격 */
  extraPatterns: boolean;
  startAp: number;
  /** 공격 타이밍 자동화 허용 */
  allowAutoTiming: boolean;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  story: {
    label: '이야기',
    desc: '넓은 반응 판정과 낮은 적 피해. 공격 예고 보조가 항상 표시되고 공격 타이밍 자동화를 쓸 수 있습니다.',
    react: { dodge: [240, 120], parry: [130, 70], jump: [240, 130] },
    timing: { perfect: 75, good: 190 },
    enemyDmg: 0.6, enemyHp: 0.85, guideRing: true, extraPatterns: false, startAp: 4, allowAutoTiming: true,
  },
  normal: {
    label: '보통',
    desc: '의도된 기본 균형입니다. 회피는 넉넉하고 패링은 정확해야 합니다.',
    react: { dodge: [170, 80], parry: [85, 45], jump: [180, 90] },
    timing: { perfect: 50, good: 130 },
    enemyDmg: 1, enemyHp: 1, guideRing: true, extraPatterns: false, startAp: 3, allowAutoTiming: true,
  },
  expert: {
    label: '숙련',
    desc: '좁은 판정, 더 긴 연속 공격, 높은 자원 압박. 보조 표시가 줄어듭니다.',
    react: { dodge: [125, 55], parry: [58, 32], jump: [135, 60] },
    timing: { perfect: 38, good: 95 },
    enemyDmg: 1.2, enemyHp: 1.1, guideRing: false, extraPatterns: true, startAp: 2, allowAutoTiming: true,
  },
};

/** 접근성: 반응 타이밍 보조 시 판정 폭 배율 */
export const REACTION_ASSIST_MULT = 1.5;

export const REACT = {
  /** 헛누름 후 같은 방어 입력 재사용 대기 (연타 방지) */
  lockout: { dodge: 420, parry: 360, jump: 480 } as Record<ReactKind, number>,
  /** 입력 버퍼: 반응 단계 진입 직전의 입력을 보존하는 시간 */
  bufferMs: 120,
  /** 수호 자세에서 빗나간 패링 피해 배율 */
  guardMissMult: 0.5,
  /** 회피 성공 시 피해 */
  dodgeDmg: 0,
};

export const AP = {
  max: 10,
  turnGain: 1,
  basicGain: 1,
  basicPerfectBonus: 1,
  parryGain: 1,
  /** 한 번의 적 공격에서 패링으로 얻는 행동력 상한 */
  parryGainCapPerAttack: 2,
  jumpAllGain: 1,
};

export const RES = {
  /** 공명 1칸 = 100 */
  seg: 100,
  max: 300,
  perfectTiming: 20,
  counter: 45,
  weakHit: 35,
  breakTrigger: 70,
  statusCombo: 20,
  dodge: 4,
  jump: 10,
};

export const BREAK = {
  /** 붕괴 상태에서 받는 피해 배율 */
  dmgTaken: 1.5,
  /** 붕괴 시 타임라인 지연 (행동 지연 비율) */
  delay: 0.6,
  /** 붕괴 후 다음 게이지 최대치 증가 (영구 제어 방지) */
  growth: 0.25,
  /** 취약 상태 붕괴 피해 배율 */
  vulnerable: 1.4,
};

export const TIMELINE = {
  base: 100,
  agiRef: 12,
  haste: 0.7,
  slow: 1.4,
  slowPush: 30,
  hastePull: 25,
  preview: 8,
};

export const TIMING_MULT = { fail: 0.6, good: 1, perfect: 1.25 } as const;
export const TIMING_BRK_MULT = { fail: 0.5, good: 1, perfect: 1.35 } as const;

export const DMG = {
  defRef: 50,
  variance: 0.05,
  weakMult: 1.5,
  exposedWeak: 1.5,
  exposedAll: 1.15,
  counterBase: 1.4,
  counterPerHit: 0.25,
  counterBrk: 28,
  guardTaken: 0.7,
  dazeOut: 0.6,
  bodyAimMult: 0.8,
  flickerMiss: 0.5,
  vulnerableBrk: 1.4,
};

export const STANCE = {
  guardTaken: 0.8,
  guardCounter: 1.4,
  assaultDmg: 1.2,
  assaultBrk: 1.3,
  assaultTaken: 1.1,
  flowCostCut: 1,
  flowBasicAp: 1,
  flowMulti: 1.15,
};

export const MARK = {
  turns: 3,
  trackBonus: 1.15,
  crackBrkTaken: 1.25,
  detonatePower: 1.1,
  echoSplash: 0.6,
  trackAp: 2,
  crackBrk: 30,
};

export const SIGIL_MAX = 3;

export const ATTACK_TIMING = {
  holdFill: 1000,
  holdTarget: 0.8,
  holdTimeout: 1800,
  holdStartTimeout: 1600,
  rhythmLead: 520,
  ringLead: 420,
};

export const AIM = {
  timeLimit: 6000,
  zoom: 2,
  cursorSpeed: 0.16,
  apCost: 2,
  seraCost: 1,
};

export const XP = {
  /** 레벨 n→n+1 필요 경험치 */
  need: (lv: number) => 36 + lv * 34,
  maxLevel: 15,
  benchShare: 0.6,
};

export const MASTERY = {
  perBattle: 10,
  perTrigger: 2,
  triggerCapPerBattle: 10,
};

export const INSIGHT = { base: 2, perGuardian: 1, max: 8 };
export const WEAPON_UP = { maxLevel: 3, atkPerLevel: 3, cost: [0, 1, 2, 3] as number[], money: [0, 60, 120, 200] as number[] };
