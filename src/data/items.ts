/** 유물·메아리·아이템 데이터 */

export interface RelicDef {
  id: string;
  name: string;
  /** 능력치 보너스 */
  stats: Partial<Record<'hp' | 'atk' | 'def' | 'agi' | 'foc', number>>;
  passive: string;
  passiveDesc: string;
  /** 숙련 필요량 */
  mastery: number;
  /** 메아리 등록 시 통찰력 비용 */
  insight: number;
  lore: string;
}

export const RELICS: Record<string, RelicDef> = Object.fromEntries(
  (
    [
      { id: 'rl_bell', name: '서리 맺힌 방울', stats: { agi: 1 }, passive: 'parry_empower', passiveDesc: '완벽 패링 시 다음 공격 피해 +30%.', mastery: 30, insight: 1, lore: '흔들지 않아도 차갑게 울리는 방울.' },
      { id: 'rl_lens', name: '균열 렌즈', stats: { foc: 2 }, passive: 'weak_brk', passiveDesc: '약점 명중 시 붕괴 피해 +50%.', mastery: 30, insight: 1, lore: '금 간 유리 너머로 급소가 보인다.' },
      { id: 'rl_dew', name: '새벽 이슬 병', stats: { hp: 20 }, passive: 'full_start_ap', passiveDesc: '전투 시작 시 체력이 가득하면 행동력 +2.', mastery: 30, insight: 1, lore: '피난처 우물의 첫 이슬을 담았다.' },
      { id: 'rl_thorn', name: '메아리 가시', stats: { atk: 2 }, passive: 'counter_mark', passiveDesc: '반격이 대상에게 추적 표식을 남긴다.', mastery: 40, insight: 2, lore: '잔향가시를 길들여 만든 장신구.' },
      { id: 'rl_leaf', name: '구원의 잎', stats: { foc: 2 }, passive: 'rescue_shield', passiveDesc: '위기(체력 35% 이하)의 동료를 회복하면 보호막을 준다.', mastery: 30, insight: 1, lore: '마른 적 없는 잎사귀.' },
      { id: 'rl_ember', name: '잿불 심장', stats: { atk: 2 }, passive: 'burn_bonus', passiveDesc: '화상 상태의 적에게 주는 피해 +25%.', mastery: 30, insight: 1, lore: '식지 않는 숯덩이. 손에 쥐면 맥박이 느껴진다.' },
      { id: 'rl_weight', name: '고요한 추', stats: { def: 2 }, passive: 'dodge_ap', passiveDesc: '회피 성공 시 행동력 +1 (적 공격 1회당 1번).', mastery: 30, insight: 1, lore: '흔들림을 멈추게 하는 추.' },
      { id: 'rl_seal', name: '파쇄 인장', stats: { atk: 1, foc: 1 }, passive: 'break_res', passiveDesc: '붕괴를 일으키면 공명 추가 획득.', mastery: 40, insight: 2, lore: '부서진 봉인의 조각.' },
      { id: 'rl_quill', name: '흐름의 깃', stats: { agi: 2 }, passive: 'ap_haste', passiveDesc: '턴 시작 시 행동력이 6 이상이면 가속(1턴).', mastery: 30, insight: 1, lore: '바람이 먼저 지나가는 깃털.' },
      { id: 'rl_buckle', name: '철벽 버클', stats: { def: 3 }, passive: 'guard_counter', passiveDesc: '수호 상태에서 반격 피해 +40%.', mastery: 30, insight: 1, lore: '거상의 갑주에서 떼어낸 버클.' },
      { id: 'rl_pulse', name: '뿌리 맥박', stats: { hp: 30 }, passive: 'regen', passiveDesc: '턴 시작 시 최대 체력의 6% 회복.', mastery: 40, insight: 2, lore: '세계뿌리의 박동이 아직 남아 있다.' },
      { id: 'rl_chime', name: '메아리 종', stats: { foc: 1 }, passive: 'timing_res', passiveDesc: '완벽 공격 타이밍 시 공명 추가 획득.', mastery: 30, insight: 1, lore: '작은 종. 제때 울리면 소리가 겹친다.' },
      { id: 'rl_charm', name: '사냥꾼의 부적', stats: { atk: 2 }, passive: 'mark_first', passiveDesc: '표식이 있는 적에게 주는 피해 +20%.', mastery: 30, insight: 1, lore: '사냥감의 흔적을 기억하는 부적.' },
      { id: 'rl_dusk', name: '노을 조각', stats: { atk: 3 }, passive: 'low_hp_brk', passiveDesc: '자신의 체력이 50% 이하면 붕괴 피해 +40%.', mastery: 30, insight: 1, lore: '해 질 녘의 빛이 굳은 조각.' },
    ] as RelicDef[]
  ).map((r) => [r.id, r]),
);

export type ItemKind = 'consumable' | 'material' | 'key';

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  desc: string;
  price?: number;
  /** 소모품 효과 */
  effect?: { heal?: number; healAll?: number; revive?: number; haste?: number; ap?: number };
  battle?: boolean;
  field?: boolean;
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  (
    [
      { id: 'potion', name: '회복약', icon: 'potion', kind: 'consumable', desc: '동료 하나의 체력을 45% 회복한다.', price: 30, effect: { heal: 0.45 }, battle: true, field: true },
      { id: 'dew', name: '맑은 이슬', icon: 'dew', kind: 'consumable', desc: '모든 동료의 체력을 30% 회복한다.', price: 70, effect: { healAll: 0.3 }, battle: true, field: true },
      { id: 'seed', name: '소생의 씨앗', icon: 'seed', kind: 'consumable', desc: '쓰러진 동료를 체력 40%로 일으킨다.', price: 90, effect: { revive: 0.4 }, battle: true, field: true },
      { id: 'sap', name: '호박 수액', icon: 'sap', kind: 'consumable', desc: '동료 하나에게 행동력 +3.', price: 60, effect: { ap: 3 }, battle: true },
      { id: 'leaf_haste', name: '바람잎', icon: 'leaf', kind: 'consumable', desc: '동료 하나에게 가속(3턴).', price: 45, effect: { haste: 3 }, battle: true },
      { id: 'crystal', name: '잔향 결정', icon: 'crystal', kind: 'material', desc: '기술 해금 재료. 휴식 지점이나 기술 화면에서 새 기술을 배우는 데 쓴다.' },
      { id: 'fragment', name: '뿌리 파편', icon: 'fragment', kind: 'material', desc: '무기 강화 재료. 휴식 지점에서 은화와 함께 사용한다.' },
      { id: 'insight_leaf', name: '통찰의 잎', icon: 'insight', kind: 'material', desc: '파티 전원의 통찰력 한도를 1 늘린다. (획득 즉시 적용)' },
      { id: 'seal_ember', name: '잿불 봉인', icon: 'seal_ember', kind: 'key', desc: '세계 봉인 하나. 뜨거운 맥이 뛴다.' },
      { id: 'seal_glass', name: '유리 봉인', icon: 'seal_glass', kind: 'key', desc: '세계 봉인 하나. 빛을 여러 갈래로 나눈다.' },
      { id: 'seal_storm', name: '폭풍 봉인', icon: 'seal_storm', kind: 'key', desc: '세계 봉인 하나. 손끝이 저릿하다.' },
    ] as ItemDef[]
  ).map((i) => [i.id, i]),
);

export const MONEY_NAME = '은화';
