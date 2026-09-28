import { describe, it, expect } from 'vitest';
import { josa, pt, L } from '../src/locale/ko';

describe('한국어 조사', () => {
  it('받침에 따라 이/가, 을/를, 과/와', () => {
    expect(josa('빈 갑주', '이', '가')).toBe('빈 갑주가');
    expect(josa('가시 사냥개', '이', '가')).toBe('가시 사냥개가');
    expect(josa('카엘', '이', '가')).toBe('카엘이');
    expect(pt('연소', '을', '를')).toBe('를');
    expect(pt('돌진 베기', '을', '를')).toBe('를');
    expect(pt('파쇄 일격', '을', '를')).toBe('을');
    expect(pt('패링', '과', '와')).toBe('과');
  });
  it('전투 문구에 기계적 괄호 조사가 남지 않는다', () => {
    expect(L.battle.enemyBroken('빈 갑주')).toBe('빈 갑주가 붕괴했다.');
    expect(L.battle.learned('미라', '연소')).toBe('미라가 「연소」를 익혔다');
    expect(L.battle.ko('세라')).toBe('세라가 쓰러졌다');
  });
});
