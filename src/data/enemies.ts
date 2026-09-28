import type { HitKind, StatusApply } from '../combat/types';
import type { Sfx } from '../audio/audio';

/**
 * 적 데이터. 공격은 스프라이트 애니메이션 구간(seg)의 연결로 정의하고,
 * 각 타격 시각은 애니메이션의 contact 프레임에서 파생된다 (combat/hits.ts).
 */
export interface AttackSeg {
  anim: string;
  /** 재생 배율 (1.3 = 30% 빠르게) */
  rate?: number;
  /** 이전 구간 종료 후 정지 (ms) */
  gap?: number;
  /** hold/마지막 anticipation 프레임에서 추가 정지 (지연 공격) */
  hold?: number;
  kind?: HitKind;
  power?: number;
}

export interface EnemyAttack {
  id: string;
  name: string;
  segs: AttackSeg[];
  kind: HitKind;
  power: number;
  target: 'one' | 'all';
  status?: StatusApply[];
  /** 대상 앞으로 이동 후 공격 */
  approach?: boolean;
  tell?: Sfx;
  /** 한 턴 전에 충전을 예고한 뒤 발동 (붕괴로 취소 가능) */
  charge?: boolean;
  summon?: string;
  /** 숙련 난이도에서 추가되는 구간 */
  expertSegs?: AttackSeg[];
  fx?: string;
  /** 자신에게 거는 효과 (타격 없음) */
  selfStatus?: StatusApply[];
  /** 구슬 재소환 등 특수 */
  special?: string;
}

export interface WeakEffect {
  name: string;
  desc: string;
  dmg?: number;
  brk?: number;
  /** 부위 파괴 id */
  part?: string;
  status?: StatusApply[];
  cancelCharge?: boolean;
  seal?: string[];
  sealTurns?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  sheet: string;
  size: 'small' | 'mid' | 'large' | 'boss';
  hp: number;
  atk: number;
  def: number;
  agi: number;
  brk: number;
  xp: number;
  money: number;
  drops?: { item: string; chance: number }[];
  attacks: EnemyAttack[];
  /** 순환 패턴 (공격 id). 'prep:<id>'는 충전 예고 턴 */
  rotation: string[];
  /** 체력 비율 이하에서 교체되는 순환 */
  rotation2?: { below: number; list: string[] };
  weak: Record<string, WeakEffect>;
  traits?: { flicker?: boolean; armorPart?: string; armorDef?: number; orbs?: number };
  desc: string;
  /** 부위 파괴 시 시트 교체 규칙 (정렬된 파괴 부위 목록 → 시트) */
  partSheets?: Record<string, string>;
  bg?: string;
  /** 다음 페이즈 적 id (최종 보스) */
  nextPhase?: string;
  phaseLine?: string;
}

const A = (a: EnemyAttack) => a;

export const ENEMIES: Record<string, EnemyDef> = {
  hound: {
    id: 'hound', name: '가시 사냥개', sheet: 'hound', size: 'small', hp: 80, atk: 16, def: 6, agi: 15, brk: 60, xp: 14, money: 12,
    drops: [{ item: 'potion', chance: 0.2 }],
    attacks: [
      A({ id: 'bite3', name: '연속 물기', kind: 'normal', power: 0.5, target: 'one', approach: true, tell: 'tellNormal',
        segs: [{ anim: 'bite', rate: 1.2 }, { anim: 'bite', rate: 1.45, gap: 140 }, { anim: 'bite', rate: 1.45, gap: 60 }], expertSegs: [{ anim: 'pounce', gap: 220 }] }),
      A({ id: 'pounce', name: '덮치기', kind: 'normal', power: 1.1, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'pounce', hold: 260 }] }),
    ],
    rotation: ['bite3', 'pounce', 'bite3'],
    weak: { eye: { name: '빛나는 눈', desc: '맞히면 혼미', dmg: 1.2, brk: 18, status: [{ id: 'daze', turns: 2 }] } },
    desc: '등에 잔향가시가 돋은 사냥개. 빠른 연속 물기를 한다. 박자가 일정해서 패링을 익히기 좋다.',
  },
  hollow: {
    id: 'hollow', name: '빈 갑주', sheet: 'hollow', size: 'mid', hp: 170, atk: 20, def: 22, agi: 8, brk: 90, xp: 22, money: 18,
    drops: [{ item: 'fragment', chance: 0.25 }],
    attacks: [
      A({ id: 'cleave', name: '지연 내려베기', kind: 'normal', power: 1.35, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'cleave', hold: 480 }] }),
      A({ id: 'thrust2', name: '이중 찌르기', kind: 'normal', power: 0.75, target: 'one', approach: true, tell: 'tellNormal',
        segs: [{ anim: 'thrust' }, { anim: 'thrust', gap: 380, hold: 220 }], expertSegs: [{ anim: 'cleave', gap: 120, rate: 1.2 }] }),
    ],
    rotation: ['cleave', 'thrust2'],
    weak: { joint: { name: '갑옷 이음새', desc: '맞히면 노출, 큰 붕괴 피해', dmg: 1.4, brk: 30, status: [{ id: 'exposed', turns: 2 }] } },
    desc: '속이 빈 채 움직이는 갑옷. 느리고 단단하다. 칼을 치켜든 채 멈추는 지연 공격에 주의. 이음새가 약점.',
  },
  caller: {
    id: 'caller', name: '늪의 호명자', sheet: 'caller', size: 'mid', hp: 130, atk: 18, def: 10, agi: 11, brk: 70, xp: 20, money: 20,
    drops: [{ item: 'dew', chance: 0.15 }],
    attacks: [
      A({ id: 'curse', name: '저주의 호명', kind: 'unblockable', power: 0.65, target: 'one', tell: 'tellUnblock', fx: 'fx_curse', segs: [{ anim: 'curse', hold: 200 }], status: [{ id: 'daze', turns: 2 }] }),
      A({ id: 'bog', name: '늪 물결', kind: 'ground', power: 0.55, target: 'all', tell: 'tellGround', fx: 'fx_wave', segs: [{ anim: 'bog' }], status: [{ id: 'slow', turns: 2 }] }),
      A({ id: 'summon', name: '싹 부르기', kind: 'normal', power: 0, target: 'one', segs: [{ anim: 'summon' }], summon: 'sprout' }),
    ],
    rotation: ['curse', 'summon', 'bog', 'curse'],
    weak: { lantern: { name: '등불', desc: '맞히면 2턴간 저주·소환 봉쇄', dmg: 1.3, brk: 22, seal: ['curse', 'summon'], sealTurns: 2 } },
    desc: '늪에서 이름을 불러 싹을 깨운다. 저주는 패링할 수 없으니 회피한다. 늪 물결은 땅을 타고 오니 점프.',
  },
  sprout: {
    id: 'sprout', name: '가시싹', sheet: 'sprout', size: 'small', hp: 45, atk: 14, def: 4, agi: 12, brk: 25, xp: 5, money: 3,
    attacks: [A({ id: 'spit', name: '씨앗 뱉기', kind: 'normal', power: 0.55, target: 'one', tell: 'tellNormal', fx: 'fx_hit', segs: [{ anim: 'spit' }] })],
    rotation: ['spit'],
    weak: { eye: { name: '눈', desc: '맞히면 큰 피해', dmg: 2.0, brk: 20 } },
    desc: '호명자가 불러낸 작은 싹. 약하지만 쌓이면 귀찮다.',
  },
  glassflame: {
    id: 'glassflame', name: '유리 불꽃', sheet: 'glassflame', size: 'small', hp: 95, atk: 19, def: 8, agi: 18, brk: 55, xp: 18, money: 16,
    drops: [{ item: 'leaf_haste', chance: 0.2 }],
    attacks: [
      A({ id: 'volley', name: '파편 연사', kind: 'normal', power: 0.42, target: 'one', tell: 'tellNormal', fx: 'fx_hit',
        segs: [{ anim: 'volley', rate: 1.15 }, { anim: 'volley', rate: 1.5, gap: 90 }, { anim: 'volley', rate: 1.5, gap: 90 }], expertSegs: [{ anim: 'volley', rate: 1.6, gap: 60 }] }),
      A({ id: 'flare', name: '섬광 폭발', kind: 'unblockable', power: 1.0, target: 'one', tell: 'tellUnblock', fx: 'fx_fire', segs: [{ anim: 'flare', hold: 320 }] }),
    ],
    rotation: ['volley', 'flare', 'volley'],
    weak: { core: { name: '수정 핵', desc: '맞히면 일렁임 해제(노출), 큰 붕괴 피해', dmg: 1.6, brk: 35, status: [{ id: 'exposed', turns: 2 }] } },
    traits: { flicker: true },
    desc: '유리 속에서 타오르는 불꽃. 몸이 일렁여 완벽하지 않은 공격은 절반만 들어간다. 수정 핵을 정밀 조준하면 일렁임이 멈춘다.',
  },
  colossus: {
    id: 'colossus', name: '뿌리 거상', sheet: 'colossus', size: 'large', hp: 330, atk: 24, def: 16, agi: 7, brk: 120, xp: 40, money: 35,
    drops: [{ item: 'fragment', chance: 0.5 }],
    attacks: [
      A({ id: 'slam', name: '대지 강타', kind: 'ground', power: 1.0, target: 'all', tell: 'tellGround', fx: 'fx_wave', segs: [{ anim: 'slam', hold: 320 }] }),
      A({ id: 'sweep', name: '낮은 쓸기', kind: 'ground', power: 0.75, target: 'one', approach: true, tell: 'tellGround', segs: [{ anim: 'sweep' }, { anim: 'sweep', gap: 260, rate: 1.25 }] }),
      A({ id: 'rush', name: '돌진', kind: 'normal', power: 1.4, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'charge', hold: 220 }] }),
    ],
    rotation: ['slam', 'rush', 'sweep'],
    weak: { core: { name: '뿌리 핵', desc: '맞히면 큰 붕괴 피해', dmg: 1.5, brk: 45 } },
    desc: '뿌리가 뭉쳐 일어선 거상. 땅을 울리는 공격은 점프로만 피할 수 있다. 가슴의 핵이 약점.',
  },
  colossus_elite: {
    id: 'colossus_elite', name: '잔향 거상', sheet: 'colossus', size: 'large', hp: 720, atk: 30, def: 20, agi: 9, brk: 180, xp: 140, money: 120,
    drops: [{ item: 'crystal', chance: 1 }],
    attacks: [
      A({ id: 'slam', name: '대지 강타', kind: 'ground', power: 1.0, target: 'all', tell: 'tellGround', fx: 'fx_wave', segs: [{ anim: 'slam', hold: 300 }, { anim: 'slam', gap: 200, rate: 1.2 }] }),
      A({ id: 'sweep', name: '낮은 쓸기', kind: 'ground', power: 0.75, target: 'one', approach: true, tell: 'tellGround', segs: [{ anim: 'sweep' }, { anim: 'sweep', gap: 200, rate: 1.3 }, { anim: 'sweep', gap: 120, rate: 1.3 }] }),
      A({ id: 'rush', name: '연속 돌진', kind: 'normal', power: 1.0, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'charge', hold: 160 }, { anim: 'charge', gap: 300, hold: 400 }] }),
    ],
    rotation: ['slam', 'rush', 'sweep', 'rush'],
    weak: { core: { name: '잔향 핵', desc: '맞히면 큰 붕괴 피해', dmg: 1.5, brk: 50 } },
    desc: '숨겨진 강적. 잔향을 머금어 공격이 더 길다. 쓰러뜨리면 잔향 결정을 준다.',
  },
  shellbeast: {
    id: 'shellbeast', name: '껍질 짐승', sheet: 'shellbeast', size: 'large', hp: 250, atk: 21, def: 40, agi: 9, brk: 100, xp: 34, money: 30,
    drops: [{ item: 'fragment', chance: 0.4 }],
    attacks: [
      A({ id: 'ram', name: '뿔 들이받기', kind: 'normal', power: 1.2, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'ram', hold: 220 }] }),
      A({ id: 'tail', name: '꼬리 휩쓸기', kind: 'ground', power: 0.8, target: 'all', tell: 'tellGround', segs: [{ anim: 'tailsweep' }] }),
    ],
    rotation: ['ram', 'tail'],
    weak: {
      seam: { name: '껍질 이음새', desc: '맞히면 껍질이 깨져 방어력이 크게 떨어진다', dmg: 1.2, brk: 30, part: 'shell' },
      flesh: { name: '드러난 살', desc: '맞히면 큰 피해', dmg: 1.8, brk: 25 },
    },
    traits: { armorPart: 'shell', armorDef: 10 },
    partSheets: { shell: 'shellbeast_broken' },
    desc: '판갑 같은 껍질을 두른 짐승. 껍질이 있는 동안 매우 단단하다. 이음새를 조준하거나 붕괴시키면 껍질이 깨진다.',
  },

  /* ---------------- 수호자 ---------------- */
  warden: {
    id: 'warden', name: '잿불 파수꾼', sheet: 'warden', size: 'boss', hp: 1050, atk: 25, def: 18, agi: 11, brk: 190, xp: 160, money: 150, bg: 'bg_shrine_ember',
    attacks: [
      A({ id: 'sweep2', name: '횡베기 연격', kind: 'normal', power: 0.75, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'sweep' }, { anim: 'sweep', gap: 220, rate: 1.3 }] }),
      A({ id: 'overhead', name: '지연 내려찍기', kind: 'normal', power: 1.5, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'overhead', hold: 620 }] }),
      A({ id: 'stomp', name: '진동 발구름', kind: 'ground', power: 0.85, target: 'all', tell: 'tellGround', fx: 'fx_wave', segs: [{ anim: 'stomp', hold: 200 }], expertSegs: [{ anim: 'stomp', gap: 240, rate: 1.3 }] }),
      A({ id: 'combo', name: '파수의 사연격', kind: 'normal', power: 0.65, target: 'one', approach: true, tell: 'bossTell',
        segs: [{ anim: 'sweep' }, { anim: 'lunge', gap: 380 }, { anim: 'lunge', gap: 70, rate: 1.35 }, { anim: 'overhead', gap: 160, hold: 520, power: 1.2 }] }),
      A({ id: 'ember_rush', name: '잿불 돌격', kind: 'unblockable', power: 1.9, target: 'one', approach: true, tell: 'tellUnblock', charge: true, fx: 'fx_fire', segs: [{ anim: 'charge', hold: 320 }], status: [{ id: 'burn', turns: 2 }] }),
    ],
    rotation: ['sweep2', 'stomp', 'overhead', 'combo', 'prep:ember_rush', 'ember_rush'],
    rotation2: { below: 0.5, list: ['combo', 'stomp', 'prep:ember_rush', 'ember_rush', 'sweep2', 'overhead', 'combo'] },
    weak: { heart: { name: '잿불 심장', desc: '맞히면 큰 붕괴 피해, 충전 취소', dmg: 1.5, brk: 40, cancelCharge: true } },
    desc: '첫 번째 수호자. 방어 시험. 지연 공격·연속 공격·지면 공격·회피 전용 돌격을 섞는다.\n잿불 돌격은 한 턴 전에 예고된다. 그 사이 붕괴시키면 취소된다.',
  },
  stag: {
    id: 'stag', name: '유리뿔 사슴왕', sheet: 'stag', size: 'boss', hp: 1250, atk: 27, def: 34, agi: 12, brk: 210, xp: 220, money: 200, bg: 'bg_shrine_glass',
    attacks: [
      A({ id: 'gore', name: '유리뿔 돌진', kind: 'normal', power: 1.25, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'charge', hold: 240 }], expertSegs: [{ anim: 'charge', gap: 180, rate: 1.3 }] }),
      A({ id: 'beam', name: '굴절 광선', kind: 'unblockable', power: 1.2, target: 'all', tell: 'tellUnblock', charge: true, fx: 'fx_beam', segs: [{ anim: 'beam', hold: 520 }] }),
      A({ id: 'hooves', name: '수정 발굽', kind: 'ground', power: 0.7, target: 'all', tell: 'tellGround', fx: 'fx_wave', segs: [{ anim: 'stomp' }, { anim: 'stomp', gap: 260, rate: 1.3 }] }),
      A({ id: 'gore2', name: '뿔 연타', kind: 'normal', power: 0.7, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'charge', rate: 1.3 }, { anim: 'charge', gap: 300, rate: 1.1, hold: 300 }] }),
    ],
    rotation: ['gore', 'hooves', 'prep:beam', 'beam', 'gore2'],
    rotation2: { below: 0.5, list: ['gore2', 'prep:beam', 'beam', 'hooves', 'gore'] },
    weak: {
      antler: { name: '유리뿔', desc: '파괴하면 굴절 광선 봉쇄', dmg: 1.3, brk: 30, part: 'antler', seal: ['beam', 'prep:beam'], sealTurns: 999 },
      clasp: { name: '갑주 고정쇠', desc: '파괴하면 방어력 대폭 감소', dmg: 1.2, brk: 30, part: 'clasp' },
      core: { name: '수정 핵', desc: '큰 붕괴 피해, 충전 취소', dmg: 1.5, brk: 45, cancelCharge: true },
    },
    traits: { armorPart: 'clasp', armorDef: 14 },
    partSheets: { antler: 'stag_broken', clasp: 'stag_open', 'antler,clasp': 'stag_bare' },
    desc: '두 번째 수호자. 정밀 시험. 갑주가 두껍다. 고정쇠를 부수면 방어가 풀리고, 뿔을 부수면 광선을 못 쓴다.\n정밀 조준 없이도 붕괴로 갑주를 벗길 수 있다.',
  },
  chorister: {
    id: 'chorister', name: '폭풍의 합창자', sheet: 'chorister', size: 'boss', hp: 1150, atk: 28, def: 16, agi: 14, brk: 190, xp: 260, money: 240, bg: 'bg_shrine_storm',
    attacks: [
      A({ id: 'gust', name: '돌풍 연타', kind: 'normal', power: 0.5, target: 'one', tell: 'tellNormal', fx: 'fx_storm', segs: [{ anim: 'gust' }, { anim: 'gust', gap: 110, rate: 1.3 }, { anim: 'gust', gap: 110, rate: 1.3 }], expertSegs: [{ anim: 'gust', gap: 300, hold: 200 }] }),
      A({ id: 'thunder', name: '낙뢰', kind: 'unblockable', power: 1.2, target: 'one', tell: 'tellUnblock', fx: 'fx_storm', segs: [{ anim: 'thunder', hold: 360 }], status: [{ id: 'daze', turns: 2 }] }),
      A({ id: 'downdraft', name: '하강 기류', kind: 'ground', power: 0.85, target: 'all', tell: 'tellGround', fx: 'fx_wave', segs: [{ anim: 'downdraft' }], status: [{ id: 'slow', turns: 1 }] }),
      A({ id: 'chorus', name: '잔향 합창', kind: 'normal', power: 0, target: 'one', tell: 'bossTell', segs: [{ anim: 'chorus' }], special: 'reorb', selfStatus: [{ id: 'haste', turns: 2 }] }),
      A({ id: 'storm_hymn', name: '폭풍 찬가', kind: 'unblockable', power: 0.9, target: 'all', tell: 'tellUnblock', charge: true, fx: 'fx_storm', segs: [{ anim: 'thunder', hold: 420 }], status: [{ id: 'burn', turns: 2 }] }),
    ],
    rotation: ['gust', 'downdraft', 'thunder', 'chorus', 'prep:storm_hymn', 'storm_hymn'],
    weak: { heart: { name: '폭풍 심장', desc: '큰 붕괴 피해, 충전 취소', dmg: 1.5, brk: 40, cancelCharge: true } },
    traits: { orbs: 3 },
    desc: '세 번째 수호자. 빌드 시험. 합창 구슬이 살아 있는 동안 매 턴 보호막을 두른다. 구슬을 부수거나 상태 효과·연계로 보호막을 뚫어라.\n절대 면역은 없다.',
  },
  orb: {
    id: 'orb', name: '합창 구슬', sheet: 'orb', size: 'small', hp: 70, atk: 10, def: 6, agi: 10, brk: 30, xp: 6, money: 0,
    attacks: [A({ id: 'hum', name: '공명음', kind: 'normal', power: 0, target: 'one', segs: [{ anim: 'shield' }], special: 'orb_shield' })],
    rotation: ['hum'],
    weak: { orb: { name: '구슬 중심', desc: '맞히면 즉시 파괴', dmg: 5 } },
    desc: '합창자에게 보호막을 보내는 구슬. 약하다.',
  },
  thornknight: {
    id: 'thornknight', name: '잔향의 기사', sheet: 'thornknight', size: 'boss', hp: 1300, atk: 30, def: 20, agi: 13, brk: 170, xp: 0, money: 0, bg: 'bg_depths',
    attacks: [
      A({ id: 'sweep2', name: '가시 횡베기', kind: 'normal', power: 0.75, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'sweep' }, { anim: 'sweep', gap: 200, rate: 1.35 }] }),
      A({ id: 'overhead', name: '잔향 내려찍기', kind: 'normal', power: 1.5, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'overhead', hold: 560 }] }),
      A({ id: 'lunge3', name: '삼연 찌르기', kind: 'normal', power: 0.6, target: 'one', approach: true, tell: 'tellNormal', segs: [{ anim: 'lunge' }, { anim: 'lunge', gap: 260, rate: 1.25 }, { anim: 'lunge', gap: 90, rate: 1.4 }] }),
      A({ id: 'stomp', name: '가시 발구름', kind: 'ground', power: 0.8, target: 'all', tell: 'tellGround', fx: 'fx_wave', segs: [{ anim: 'stomp' }] }),
    ],
    rotation: ['sweep2', 'lunge3', 'overhead', 'stomp', 'lunge3'],
    weak: { heart: { name: '가시 심장', desc: '큰 붕괴 피해', dmg: 1.5, brk: 40 } },
    desc: '최종 수호자 1페이즈. 세계뿌리를 지키던 첫 수호자가 잔향에 먹혔다. 행동력·패링·붕괴의 기본기를 시험한다.',
    nextPhase: 'nest', phaseLine: '기사의 갑주가 갈라지고, 그 안에서 가시 둥지가 피어난다…',
  },
  nest: {
    id: 'nest', name: '가시 둥지', sheet: 'nest', size: 'boss', hp: 1350, atk: 31, def: 18, agi: 12, brk: 180, xp: 0, money: 0, bg: 'bg_depths',
    attacks: [
      A({ id: 'lash', name: '가시 채찍', kind: 'normal', power: 0.6, target: 'one', tell: 'tellNormal', segs: [{ anim: 'lash' }, { anim: 'lash', gap: 160, rate: 1.3 }, { anim: 'lash', gap: 320, hold: 260 }] }),
      A({ id: 'quake', name: '뿌리 지진', kind: 'ground', power: 0.8, target: 'all', tell: 'tellGround', fx: 'fx_wave', segs: [{ anim: 'quake' }, { anim: 'quake', gap: 220, rate: 1.3 }] }),
      A({ id: 'spores', name: '잔향 포자', kind: 'unblockable', power: 0.5, target: 'all', tell: 'tellUnblock', fx: 'fx_curse', segs: [{ anim: 'spores', hold: 300 }], status: [{ id: 'burn', turns: 2 }, { id: 'daze', turns: 1 }] }),
    ],
    rotation: ['lash', 'spores', 'quake', 'lash'],
    weak: { heart: { name: '떠도는 심장', desc: '둥지 속을 옮겨 다닌다. 두 번 맞히면 가시 갑피 파괴', dmg: 1.6, brk: 40, part: 'bark' } },
    traits: { armorPart: 'bark', armorDef: 8 },
    desc: '최종 수호자 2페이즈. 심장이 매 턴 자리를 옮긴다. 지면 공격과 포자 상태 압박. 심장을 맞혀 가시 갑피를 벗겨라.',
    nextPhase: 'frenzy', phaseLine: '둥지가 찢어지며 뿌리 전체가 광란에 빠진다!',
  },
  frenzy: {
    id: 'frenzy', name: '광란의 뿌리', sheet: 'frenzy', size: 'boss', hp: 1250, atk: 33, def: 14, agi: 14, brk: 160, xp: 600, money: 0, bg: 'bg_depths',
    attacks: [
      A({ id: 'lash5', name: '광란 난무', kind: 'normal', power: 0.5, target: 'one', tell: 'bossTell',
        segs: [{ anim: 'lash' }, { anim: 'lash', gap: 120, rate: 1.4 }, { anim: 'lash', gap: 120, rate: 1.4 }, { anim: 'lash', gap: 420 }, { anim: 'lash', gap: 80, rate: 1.2, hold: 380, power: 0.9 }] }),
      A({ id: 'quake2', name: '대지 붕락', kind: 'ground', power: 0.75, target: 'all', tell: 'tellGround', fx: 'fx_wave', segs: [{ anim: 'quake' }, { anim: 'quake', gap: 200, rate: 1.4 }, { anim: 'quake', gap: 360 }] }),
      A({ id: 'doom', name: '멸절의 가시', kind: 'unblockable', power: 2.2, target: 'all', tell: 'bossTell', charge: true, fx: 'fx_curse', segs: [{ anim: 'doom', hold: 600 }] }),
      A({ id: 'spores', name: '잔향 포자', kind: 'unblockable', power: 0.5, target: 'all', tell: 'tellUnblock', fx: 'fx_curse', segs: [{ anim: 'spores', hold: 260 }], status: [{ id: 'burn', turns: 2 }] }),
    ],
    rotation: ['lash5', 'quake2', 'prep:doom', 'doom', 'spores', 'lash5'],
    weak: { heart: { name: '광란의 심장', desc: '큰 붕괴 피해, 충전 취소', dmg: 1.6, brk: 45, cancelCharge: true } },
    desc: '최종 수호자 3페이즈. 긴 연속 공격과 전멸 위험. 멸절의 가시는 충전 중에 붕괴시켜야 막을 수 있다 — 마지막 붕괴 기회를 놓치지 마라.',
  },
};

export interface EncounterGroup {
  id: string;
  enemies: string[];
  /** 지역 강도 배율 */
  lv: number;
  bg: string;
  music?: 'battle' | 'guardian' | 'final';
  boss?: boolean;
  tutorial?: string;
  noFlee?: boolean;
  /** 확정 보상 */
  loot?: [string, number][];
}

const G = (id: string, enemies: string[], lv: number, bg: string, extra: Partial<EncounterGroup> = {}): EncounterGroup => ({ id, enemies, lv, bg, ...extra });

export const GROUPS: Record<string, EncounterGroup> = Object.fromEntries(
  [
    G('m_tut1', ['hound'], 0.8, 'bg_meadow', { tutorial: 'basics' }),
    G('m_tut2', ['hollow'], 0.85, 'bg_meadow', { tutorial: 'parry' }),
    G('m1', ['hound', 'hound'], 0.95, 'bg_meadow', { tutorial: 'combo' }),
    G('m2', ['hollow', 'hound'], 1.0, 'bg_meadow'),
    G('m3', ['hound', 'hound', 'sprout'], 1.05, 'bg_meadow'),
    G('r_orin', ['shellbeast'], 1.1, 'bg_ruins', { tutorial: 'break' }),
    G('r1', ['caller', 'hollow'], 1.2, 'bg_ruins', { tutorial: 'status' }),
    G('r2', ['hound', 'caller', 'hound'], 1.25, 'bg_ruins'),
    G('r3', ['hollow', 'hollow'], 1.3, 'bg_ruins'),
    G('r4', ['shellbeast', 'sprout'], 1.3, 'bg_ruins'),
    G('e1', ['hollow', 'hound', 'hound'], 1.4, 'bg_shrine_ember'),
    G('e2', ['caller', 'shellbeast'], 1.45, 'bg_shrine_ember'),
    G('e_boss', ['warden'], 1, 'bg_shrine_ember', { boss: true, music: 'guardian', loot: [['rl_ember', 1], ['crystal', 1], ['fragment', 1]] }),
    G('g_tut', ['glassflame'], 1.5, 'bg_glass', { tutorial: 'aim' }),
    G('g1', ['glassflame', 'glassflame'], 1.6, 'bg_glass'),
    G('g2', ['shellbeast', 'glassflame'], 1.65, 'bg_glass'),
    G('g3', ['caller', 'glassflame', 'sprout'], 1.7, 'bg_glass'),
    G('sg1', ['glassflame', 'hollow', 'glassflame'], 1.8, 'bg_shrine_glass'),
    G('sg_boss', ['stag'], 1, 'bg_shrine_glass', { boss: true, music: 'guardian', loot: [['rl_thorn', 1], ['crystal', 1], ['fragment', 1]] }),
    G('p1', ['colossus'], 1.9, 'bg_plateau', { tutorial: 'jump2' }),
    G('p2', ['hound', 'hound', 'hound'], 2.0, 'bg_plateau'),
    G('p3', ['colossus', 'caller'], 2.05, 'bg_plateau'),
    G('p4', ['hollow', 'glassflame', 'hound'], 2.1, 'bg_plateau'),
    G('p_elite', ['colossus_elite'], 1.9, 'bg_plateau', { music: 'guardian' }),
    G('ss1', ['caller', 'glassflame', 'caller'], 2.2, 'bg_shrine_storm'),
    G('ss_boss', ['chorister'], 1, 'bg_shrine_storm', { boss: true, music: 'guardian', loot: [['rl_seal', 1], ['crystal', 1], ['fragment', 2]] }),
    G('d1', ['shellbeast', 'hollow', 'glassflame'], 2.4, 'bg_depths'),
    G('d2', ['colossus', 'hound', 'hound'], 2.45, 'bg_depths'),
    G('d_boss', ['thornknight'], 1, 'bg_depths', { boss: true, music: 'final' }),
  ].map((g) => [g.id, g]),
);
