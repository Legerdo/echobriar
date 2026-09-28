import { describe, it, expect } from 'vitest';
import { sanitize } from '../src/state/save';
import { newGame, addItem, equipRelic, addMastery } from '../src/state/game';

describe('저장과 불러오기', () => {
  it('직렬화 왕복 후 진행이 보존된다', () => {
    const s = newGame('expert');
    s.map = 'ruins';
    s.x = 10;
    s.y = 14;
    s.flags.sera_joined = 1;
    s.roster.push('sera');
    s.chars.kael.level = 5;
    addItem(s, 'rl_bell');
    equipRelic(s, 'kael', 1, 'rl_bell');
    addMastery(s, 'rl_bell', 12);
    s.weaponLv.w_oath = 2;
    s.money = 321;
    s.playTime = 123456;
    s.seals.push('seal_ember');
    s.bosses.push('warden');
    const back = sanitize(JSON.parse(JSON.stringify(s)))!;
    expect(back.difficulty).toBe('expert');
    expect(back.map).toBe('ruins');
    expect(back.flags.sera_joined).toBe(1);
    expect(back.chars.kael.level).toBe(5);
    expect(back.chars.kael.relics[1]).toBe('rl_bell');
    expect(back.relicMastery.rl_bell).toBe(12);
    expect(back.weaponLv.w_oath).toBe(2);
    expect(back.money).toBe(321);
    expect(back.playTime).toBe(123456);
    expect(back.seals).toEqual(['seal_ember']);
    expect(back.bosses).toEqual(['warden']);
  });
  it('손상·구버전 데이터에도 충돌하지 않는다', () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize('garbage')).toBeNull();
    expect(sanitize({ version: 999 })).toBeNull();
    const s = sanitize({ version: 1, map: '없는맵', roster: ['kael', 'ghost'], active: [], chars: { kael: { level: 'x', learned: ['nope', 'k_rush'], equipped: ['k_rush', 'k_rush'], weapon: 'bad', relics: ['rl_bell'] } }, items: { potion: -3, dew: 2 }, money: 'lots' })!;
    expect(s).not.toBeNull();
    expect(s.map).toBe('hub');
    expect(s.roster).toEqual(['kael']);
    expect(s.active).toEqual(['kael']);
    expect(s.chars.kael.level).toBe(1);
    expect(s.chars.kael.learned).toEqual(['k_rush']);
    expect(s.chars.kael.equipped).toEqual(['k_rush']);
    expect(s.chars.kael.weapon).toBe('w_oath');
    expect(s.chars.kael.relics).toEqual([null, null, null]);
    expect(s.items.potion).toBeUndefined();
    expect(s.items.dew).toBe(2);
    // 타입이 다른 값은 새 게임 기본값으로 대체
    expect(s.money).toBe(newGame('normal').money);
    expect(s.chars.mira).toBeTruthy();
  });
});
