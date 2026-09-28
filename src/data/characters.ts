import type { CharDef, CharId, SkillDef, WeaponDef } from '../combat/types';

export const CHAR_IDS: CharId[] = ['kael', 'mira', 'sera', 'orin'];

export const CHARS: Record<CharId, CharDef> = {
  kael: {
    id: 'kael', name: '카엘', title: '피난처의 검사', resource: '자세',
    resourceDesc: '수호·공세·흐름 세 자세를 오간다. 기술이 자세를 바꾸고, 현재 자세에 따라 효과가 달라진다. 완벽 패링은 현재 자세의 보너스를 준다.',
    sheet: 'kael_battle', field: 'kael_field',
    base: { hp: 150, atk: 20, def: 12, agi: 13, foc: 8 },
    growth: { hp: 14, atk: 2.4, def: 1.4, agi: 0.6, foc: 0.8 },
    basic: { name: '베기', power: 1.0, brk: 8, fx: 'fx_slash', sfx: 'slash' },
    aimFx: 'fx_slash', resonance2: 'r_kael',
  },
  mira: {
    id: 'mira', name: '미라', title: '원소 인장술사', resource: '원소 인장',
    resourceDesc: '화염·조류·폭풍 마법을 쓰면 인장이 남는다(최대 3). 융합 기술은 정해진 인장 조합을 소비해 강력한 효과를 낸다.',
    sheet: 'mira_battle', field: 'mira_field',
    base: { hp: 115, atk: 22, def: 7, agi: 12, foc: 16 },
    growth: { hp: 10, atk: 2.6, def: 0.8, agi: 0.5, foc: 1.6 },
    basic: { name: '지팡이 타격', power: 0.85, brk: 6, fx: 'fx_hit', sfx: 'hit' },
    aimFx: 'fx_bolt', resonance2: 'r_mira',
  },
  sera: {
    id: 'sera', name: '세라', title: '잿빛 정찰수', resource: '표식',
    resourceDesc: '적에게 균열·추적·메아리 표식을 남긴다. 표식은 폭발시켜야 진가가 나온다. 정밀 조준으로 약점을 맞히면 표식이 폭발한다.',
    sheet: 'sera_battle', field: 'sera_field',
    base: { hp: 120, atk: 21, def: 8, agi: 16, foc: 12 },
    growth: { hp: 11, atk: 2.5, def: 0.9, agi: 0.8, foc: 1.1 },
    basic: { name: '화살', power: 0.95, brk: 5, fx: 'fx_hit', sfx: 'shot' },
    aimFx: 'fx_arrow', resonance2: 'r_sera',
  },
  orin: {
    id: 'orin', name: '오린', title: '폐허의 기술공', resource: '충전',
    resourceDesc: '기본 공격, 공격 타이밍 성공, 동료의 반격, 붕괴한 적 공격으로 충전을 얻는다. 충전을 소비해 포격·보호막·지원을 쓴다. 상한이 있어 쓸지 모을지 골라야 한다.',
    sheet: 'orin_battle', field: 'orin_field',
    base: { hp: 170, atk: 19, def: 14, agi: 9, foc: 10 },
    growth: { hp: 16, atk: 2.3, def: 1.6, agi: 0.4, foc: 0.9 },
    basic: { name: '망치질', power: 1.0, brk: 10, fx: 'fx_hit', sfx: 'heavy' },
    aimFx: 'fx_shot', resonance2: 'r_orin',
  },
};

const S = (d: SkillDef) => d;

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(
  [
    /* ---------------- 카엘 ---------------- */
    S({ id: 'k_guard', char: 'kael', name: '수호의 맹세', role: '준비', ap: 1, target: 'self', anim: 'support', timing: null, stance: 'guard', status: [{ id: 'guard', turns: 1, to: 'self' }], sfx: 'shield', learn: {},
      desc: '수호 자세로 전환하고 1턴 동안 수호를 얻는다.\n수호 자세: 받는 피해 감소, 빗나간 패링 피해 절반, 반격 강화. 완벽 패링 시 행동력 +1 추가.' }),
    S({ id: 'k_rush', char: 'kael', name: '돌진 베기', role: '주력', ap: 2, target: 'enemy', anim: 'attack', timing: { type: 'tap' }, power: 1.35, brk: 14, stance: 'assault', fx: 'fx_slash', sfx: 'slash', learn: {},
      desc: '파고들어 벤 뒤 공세 자세로 전환한다.\n공세 자세: 피해·붕괴 피해 증가, 받는 피해 소폭 증가. 완벽 패링 시 다음 공격 강화.' }),
    S({ id: 'k_flow', char: 'kael', name: '흐르는 칼날', role: '주력', ap: 3, target: 'enemy', anim: 'skill2', timing: { type: 'multi' }, power: 1.8, brk: 18, stance: 'flow', special: 'flow_refund', fx: 'fx_slash', sfx: 'slash', learn: {},
      desc: '3연속 베기 후 흐름 자세로 전환한다. 이미 흐름 자세였다면 완벽 타격마다 행동력 +1 (최대 2).\n흐름 자세: 기술 비용 -1, 연속 공격 강화, 완벽 패링 시 가속.' }),
    S({ id: 'k_shatter', char: 'kael', name: '파쇄 일격', role: '붕괴', ap: 5, target: 'enemy', anim: 'skill', timing: { type: 'hold' }, power: 2.2, brk: 45, breaker: true, special: 'assault_brk', fx: 'fx_slash', sfx: 'heavy', learn: {},
      desc: '힘을 모아 내려친다. 붕괴 가능 기술.\n공세 자세라면 붕괴 피해 +50%.' }),
    S({ id: 'k_riposte', char: 'kael', name: '응수 태세', role: '방어', ap: 2, target: 'self', anim: 'support', timing: null, stance: 'guard', status: [{ id: 'guard', turns: 2, to: 'self' }], special: 'riposte', sfx: 'shield', learn: { level: 3 },
      desc: '수호 자세로 전환하고 2턴 동안 수호. 다음 반격의 피해가 80% 증가한다.' }),
    S({ id: 'k_sweep', char: 'kael', name: '잔향 가르기', role: '주력', ap: 4, target: 'allEnemies', anim: 'attack', timing: { type: 'tap' }, power: 1.1, brk: 12, special: 'flow_haste', fx: 'fx_slash', sfx: 'slash', learn: { crystal: true },
      desc: '모든 적을 한 번에 베어 가른다. 흐름 자세라면 자신에게 가속(2턴).' }),
    S({ id: 'k_pommel', char: 'kael', name: '칼자루 치기', role: '준비', ap: 2, target: 'enemy', anim: 'attack', timing: { type: 'tap' }, power: 0.7, brk: 22, status: [{ id: 'daze', turns: 2, to: 'target' }], fx: 'fx_hit', sfx: 'hit', learn: { level: 5 },
      desc: '칼자루로 쳐 혼미를 건다. 혼미한 적의 다음 공격은 약해진다.' }),
    S({ id: 'k_resolve', char: 'kael', name: '삼세 결의', role: '결전', ap: 7, target: 'enemy', anim: 'skill2', timing: { type: 'rhythm', beats: 5, interval: 190 }, power: 3.0, brk: 30, special: 'three_stances', fx: 'fx_slash', sfx: 'slash', learn: { crystal: true },
      desc: '다섯 박자 연속 베기. 이번 전투에서 사용한 자세 종류마다 위력 +35%.' }),

    /* ---------------- 미라 ---------------- */
    S({ id: 'm_fire', char: 'mira', name: '불씨', role: '생성', ap: 1, target: 'enemy', anim: 'attack', timing: { type: 'tap' }, power: 0.9, brk: 6, sigils: ['fire'], fx: 'fx_fire', sfx: 'fire', learn: {},
      desc: '작은 불꽃을 날린다. 화염 인장을 남긴다.' }),
    S({ id: 'm_tide', char: 'mira', name: '물살', role: '생성', ap: 1, target: 'enemy', anim: 'attack', timing: { type: 'tap' }, power: 0.8, brk: 6, sigils: ['tide'], status: [{ id: 'slow', turns: 1, chance: 0.5, to: 'target' }], fx: 'fx_tide', sfx: 'tide', learn: {},
      desc: '물살로 친다. 조류 인장을 남기고 50% 확률로 둔화.' }),
    S({ id: 'm_storm', char: 'mira', name: '뇌정', role: '생성', ap: 1, target: 'enemy', anim: 'attack', timing: { type: 'tap' }, power: 0.85, brk: 12, sigils: ['storm'], fx: 'fx_storm', sfx: 'storm', learn: {},
      desc: '작은 번개를 떨군다. 폭풍 인장을 남긴다. 붕괴 피해가 조금 높다.' }),
    S({ id: 'm_steam', char: 'mira', name: '증기 폭발', role: '붕괴', ap: 3, target: 'enemy', anim: 'skill', timing: { type: 'hold' }, consume: ['fire', 'tide'], power: 1.8, brk: 50, breaker: true, status: [{ id: 'vulnerable', turns: 2, to: 'target' }], fx: 'fx_break', sfx: 'break', learn: {},
      desc: '화염 + 조류 인장 소비. 증기 폭발로 큰 붕괴 피해를 주고 취약(붕괴 피해 증가)을 건다. 붕괴 가능 기술.' }),
    S({ id: 'm_heal', char: 'mira', name: '치유의 조류', role: '지원', ap: 3, target: 'ally', anim: 'support', timing: null, heal: 2.2, sigils: ['tide'], fx: 'fx_heal', sfx: 'heal', learn: {},
      desc: '동료 하나를 회복하고 조류 인장을 남긴다.' }),
    S({ id: 'm_blaze', char: 'mira', name: '연소', role: '주력', ap: 3, target: 'enemy', anim: 'skill', timing: { type: 'hold' }, consume: ['fire', 'fire'], power: 1.5, brk: 10, status: [{ id: 'burn', turns: 3, to: 'target' }], fx: 'fx_fire', sfx: 'fire', learn: { level: 2 },
      desc: '화염 + 화염 인장 소비. 강한 화상(3턴)을 건다.' }),
    S({ id: 'm_chain', char: 'mira', name: '연쇄 뇌류', role: '주력', ap: 3, target: 'allEnemies', anim: 'skill2', timing: { type: 'multi' }, consume: ['tide', 'storm'], power: 1.3, brk: 14, fx: 'fx_storm', sfx: 'storm', learn: { level: 3 },
      desc: '조류 + 폭풍 인장 소비. 젖은 몸을 타고 번개가 모든 적에게 연쇄한다.' }),
    S({ id: 'm_bloom', char: 'mira', name: '삼원 개화', role: '결전', ap: 6, target: 'allEnemies', anim: 'skill', timing: { type: 'hold' }, consume: ['fire', 'tide', 'storm'], power: 2.6, brk: 40, breaker: true,
      status: [{ id: 'burn', turns: 2, to: 'target' }, { id: 'slow', turns: 1, to: 'target' }, { id: 'vulnerable', turns: 2, to: 'target' }], fx: 'fx_resonance', sfx: 'resonance', learn: { crystal: true },
      desc: '세 원소 인장을 모두 소비하는 필살기. 모든 적에게 큰 피해와 화상·둔화·취약. 붕괴 가능 기술.' }),

    /* ---------------- 세라 ---------------- */
    S({ id: 's_crack', char: 'sera', name: '균열 표식', role: '준비', ap: 1, target: 'enemy', anim: 'attack', timing: { type: 'tap' }, power: 0.7, brk: 10, mark: 'crack', fx: 'fx_mark_crack', sfx: 'mark', learn: {},
      desc: '균열 표식을 남긴다. 표식이 있는 동안 받는 붕괴 피해 증가, 폭발 시 큰 붕괴 피해.' }),
    S({ id: 's_track', char: 'sera', name: '추적 표식', role: '준비', ap: 1, target: 'enemy', anim: 'attack', timing: { type: 'tap' }, power: 0.7, brk: 6, mark: 'track', fx: 'fx_mark_track', sfx: 'mark', learn: {},
      desc: '추적 표식을 남긴다. 표식이 있는 동안 파티의 공격 피해 증가, 폭발 시 세라의 행동력 +2.' }),
    S({ id: 's_pierce', char: 'sera', name: '관통 사격', role: '주력', ap: 3, target: 'enemy', anim: 'skill', timing: { type: 'hold' }, power: 1.7, brk: 16, detonate: true, fx: 'fx_hit', sfx: 'shot', learn: {},
      desc: '끝까지 당겨 쏜다. 대상의 모든 표식을 폭발시킨다.' }),
    S({ id: 's_expose', char: 'sera', name: '약점 투시', role: '준비', ap: 2, target: 'enemy', anim: 'support', timing: null, status: [{ id: 'exposed', turns: 3, to: 'target' }], sfx: 'mark', learn: {},
      desc: '대상에게 노출(3턴)을 건다. 노출된 적은 약점 피해를 훨씬 크게 받고 모든 피해를 조금 더 받는다.' }),
    S({ id: 's_echo', char: 'sera', name: '메아리 표식', role: '준비', ap: 2, target: 'enemy', anim: 'attack', timing: { type: 'tap' }, power: 0.8, brk: 8, mark: 'echo', fx: 'fx_mark_echo', sfx: 'mark', learn: { level: 2 },
      desc: '메아리 표식을 남긴다. 폭발 시 피해의 일부가 다른 모든 적에게 퍼진다.' }),
    S({ id: 's_volley', char: 'sera', name: '연발', role: '주력', ap: 3, target: 'enemy', anim: 'skill2', timing: { type: 'rhythm', beats: 4, interval: 180 }, power: 1.9, brk: 16, special: 'volley_marks', fx: 'fx_hit', sfx: 'shot', learn: { level: 3 },
      desc: '네 박자 연사. 대상의 표식 하나마다 위력 +15%.' }),
    S({ id: 's_signal', char: 'sera', name: '연계 신호', role: '지원', ap: 2, target: 'ally', anim: 'support', timing: null, apGive: 1, special: 'link', sfx: 'mark', learn: { crystal: true },
      desc: '동료에게 행동력 +1. 그 동료의 다음 공격이 표식을 폭발시키고 폭발 피해 +50%.' }),
    S({ id: 's_burst', char: 'sera', name: '폭쇄 화살', role: '붕괴', ap: 6, target: 'allEnemies', anim: 'skill', timing: { type: 'hold' }, power: 1.4, brk: 34, breaker: true, detonate: true, fx: 'fx_break', sfx: 'break', learn: { crystal: true },
      desc: '화살비로 모든 적의 표식을 폭발시킨다. 붕괴 가능 기술.' }),

    /* ---------------- 오린 ---------------- */
    S({ id: 'o_load', char: 'orin', name: '장전', role: '생성', ap: 1, target: 'self', anim: 'support', timing: null, chargeGain: 2, status: [{ id: 'guard', turns: 1, to: 'self' }], sfx: 'charge', learn: {},
      desc: '충전 +2, 1턴 동안 수호.' }),
    S({ id: 'o_cannon', char: 'orin', name: '포격', role: '주력', ap: 2, target: 'enemy', anim: 'skill', timing: { type: 'hold' }, chargeAll: true, chargeMin: 1, power: 0.8, brk: 8, special: 'cannon', fx: 'fx_muzzle', sfx: 'shot', learn: {},
      desc: '충전을 모두 소비해 포격한다. 소비한 충전마다 위력 +45%, 붕괴 피해 +6.' }),
    S({ id: 'o_barrier', char: 'orin', name: '방호막 전개', role: '방어', ap: 2, target: 'allAllies', anim: 'support', timing: null, chargeCost: 2, shield: 1.6, fx: 'fx_shield', sfx: 'shield', learn: {},
      desc: '충전 2 소비. 파티 전원에게 보호막(피해 흡수).' }),
    S({ id: 'o_smash', char: 'orin', name: '파쇄 망치', role: '붕괴', ap: 4, target: 'enemy', anim: 'skill2', timing: { type: 'tap' }, chargeCost: 1, power: 1.9, brk: 48, breaker: true, fx: 'fx_break', sfx: 'heavy', learn: {},
      desc: '충전 1 소비. 포망치를 내리쳐 큰 붕괴 피해. 붕괴 가능 기술.' }),
    S({ id: 'o_supply', char: 'orin', name: '보급 신호', role: '지원', ap: 1, target: 'ally', anim: 'support', timing: null, chargeCost: 2, apGive: 2, sfx: 'charge', learn: { level: 2 },
      desc: '충전 2 소비. 다른 동료에게 행동력 +2 (비상 지원).' }),
    S({ id: 'o_shock', char: 'orin', name: '충격탄', role: '준비', ap: 2, target: 'enemy', anim: 'attack', timing: { type: 'tap' }, power: 0.9, brk: 14, chargeGain: 1, status: [{ id: 'slow', turns: 2, to: 'target' }, { id: 'daze', turns: 1, to: 'target' }], fx: 'fx_hit', sfx: 'shot', learn: { level: 3 },
      desc: '충전 +1. 둔화(2턴)와 혼미를 건다.' }),
    S({ id: 'o_vent', char: 'orin', name: '과열 방출', role: '주력', ap: 3, target: 'allEnemies', anim: 'skill', timing: { type: 'hold' }, chargeCost: 3, power: 1.4, brk: 16, status: [{ id: 'burn', turns: 2, to: 'target' }], fx: 'fx_fire', sfx: 'fire', learn: { crystal: true },
      desc: '충전 3 소비. 과열된 증기로 모든 적에게 피해와 화상.' }),
    S({ id: 'o_max', char: 'orin', name: '최대 출력', role: '결전', ap: 5, target: 'enemy', anim: 'skill', timing: { type: 'hold' }, chargeAll: true, chargeMin: 4, power: 2.4, brk: 40, breaker: true, special: 'max_output', fx: 'fx_muzzle', sfx: 'break', learn: { crystal: true },
      desc: '충전 4 이상 필요, 모두 소비. 충전마다 위력 +30%, 충전이 가득 찼다면 추가로 1.5배. 붕괴 가능 기술.' }),

    /* ---------------- 공명 기술 ---------------- */
    S({ id: 'r_rescue', char: 'kael', name: '구조의 메아리', role: '지원', ap: 0, target: 'allAllies', anim: 'support', timing: null, heal: 0, revive: true, fx: 'fx_heal', sfx: 'resonance', special: 'rescue', learn: {},
      desc: '공명 1칸. 모든 동료의 체력을 30% 회복하고 쓰러진 동료를 일으킨다.' }),
    S({ id: 'r_kael', char: 'kael', name: '세 자세의 검무', role: '결전', ap: 0, target: 'enemy', anim: 'skill2', timing: { type: 'multi' }, power: 3.6, brk: 60, breaker: true, special: 'cycle_stance', fx: 'fx_counter', sfx: 'counter', learn: {},
      desc: '공명 2칸. 세 자세를 모두 거치는 검무. 막대한 피해와 붕괴 피해. 붕괴 가능.' }),
    S({ id: 'r_mira', char: 'mira', name: '원소 폭주', role: '결전', ap: 0, target: 'allEnemies', anim: 'skill', timing: { type: 'hold' }, power: 2.8, brk: 45, breaker: true, special: 'fill_sigils', fx: 'fx_resonance', sfx: 'resonance', learn: {},
      desc: '공명 2칸. 모든 적에게 큰 피해를 주고 세 원소 인장을 가득 채운다. 붕괴 가능.' }),
    S({ id: 'r_sera', char: 'sera', name: '천 개의 메아리', role: '결전', ap: 0, target: 'allEnemies', anim: 'skill', timing: { type: 'hold' }, power: 2.4, brk: 40, breaker: true, detonate: true, special: 'mark_all', fx: 'fx_resonance', sfx: 'resonance', learn: {},
      desc: '공명 2칸. 모든 적에게 세 표식을 새긴 뒤 한꺼번에 폭발시킨다. 붕괴 가능.' }),
    S({ id: 'r_orin', char: 'orin', name: '과부하 포격', role: '결전', ap: 0, target: 'enemy', anim: 'skill', timing: { type: 'hold' }, power: 3.4, brk: 55, breaker: true, special: 'refill_charge', fx: 'fx_muzzle', sfx: 'break', learn: {},
      desc: '공명 2칸. 충전과 무관한 과부하 포격. 이후 충전이 가득 찬다. 붕괴 가능.' }),
    S({ id: 'r_party', char: 'kael', name: '뿌리 합주', role: '결전', ap: 0, target: 'allEnemies', anim: 'skill2', timing: { type: 'rhythm', beats: 3, interval: 260 }, power: 2.0, brk: 40, breaker: true, special: 'party_link', fx: 'fx_resonance', sfx: 'resonance', learn: {},
      desc: '공명 3칸. 전투 중인 세 동료가 함께 모든 적을 몰아친다. 세 박자에 맞춰 입력.' }),
  ].map((s) => [s.id, s]),
);

export const RES_SKILLS = { rescue: 'r_rescue', party: 'r_party' };

export function charSkills(c: CharId): SkillDef[] {
  return Object.values(SKILLS).filter((s) => s.char === c && !s.id.startsWith('r_'));
}

export const WEAPONS: Record<string, WeaponDef> = {
  w_oath: { id: 'w_oath', char: 'kael', name: '서약의 장검', atk: 0, passive: 'oath', desc: '패링 중심. 완벽 패링 시 행동력 +1 추가, 반격 후 다음 자세로 자동 전환한다.' },
  w_rend: { id: 'w_rend', char: 'kael', name: '균열 대검', atk: 4, passive: 'rend', desc: '붕괴 중심. 붕괴 피해 +30%, 공세 자세 공격이 취약을 건다. 대신 패링으로 행동력을 얻지 못한다.' },
  w_ember: { id: 'w_ember', char: 'mira', name: '잔불 지팡이', atk: 0, passive: 'kindle', desc: '생성 중심. 생성 기술이 같은 인장을 하나 더 남긴다.' },
  w_abyss: { id: 'w_abyss', char: 'mira', name: '심연 지팡이', atk: 3, passive: 'deep', desc: '소비 중심. 융합 기술 위력 +35%, 사용 시 행동력 1 반환. 생성 기술 위력 -20%.' },
  w_long: { id: 'w_long', char: 'sera', name: '사냥꾼의 장궁', atk: 2, passive: 'hunter', desc: '약점 중심. 약점 명중 피해 +40%, 정밀 조준 제한 시간 +2초.' },
  w_short: { id: 'w_short', char: 'sera', name: '추적자의 단궁', atk: 0, passive: 'tracker', desc: '표식 중심. 표식 폭발 피해 +50%, 표식 지속 +2턴.' },
  w_light: { id: 'w_light', char: 'orin', name: '경량 포망치', atk: 0, passive: 'quick', desc: '빠른 충전. 충전 상한 5, 기본 공격 충전 +1 추가.' },
  w_siege: { id: 'w_siege', char: 'orin', name: '공성 포망치', atk: 4, passive: 'siege', desc: '높은 최대 충전. 충전 상한 8, 충전 5 이상 소비 시 위력 +25%.' },
};

export const START_WEAPON: Record<CharId, string> = { kael: 'w_oath', mira: 'w_ember', sera: 'w_long', orin: 'w_light' };

export function chargeMaxFor(weapon: string): number {
  return weapon === 'w_siege' ? 8 : 5;
}
