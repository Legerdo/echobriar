import { describe, it, expect } from 'vitest';
import { placePopup, popupYAt, PopupBox, POPUP_RISE } from '../src/gfx/popups';

function overlaps(a: PopupBox, b: PopupBox, t: number): boolean {
  const ay = popupYAt(a, t), by = popupYAt(b, t);
  const xo = Math.abs(a.x - b.x) < (a.w + b.w) / 2;
  return xo && ay < by + b.h - 1e-9 && ay + a.h > by + 1e-9;
}

describe('전투 문구 겹침 방지', () => {
  it('서로 다른 위치·크기·간격으로 떠도 사라질 때까지 겹치지 않는다', () => {
    // 결정적 의사 난수로 여러 장면을 만든다 (서로 다른 유닛이 가까이 붙은 경우 포함)
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let scene = 0; scene < 300; scene++) {
      const ps: PopupBox[] = [];
      let t = 0;
      for (let i = 0; i < 7; i++) {
        t += Math.floor(rnd() * 260);
        const big = rnd() < 0.5;
        const x = 300 + Math.floor(rnd() * 3) * 22;
        const w = 20 + Math.floor(rnd() * 90);
        const h = big ? 15 : 11;
        const y0 = 150 + Math.floor(rnd() * 3) * 8;
        const y = placePopup(ps, x, w, h, y0, t)!;
        ps.push({ x, y, w, h, t0: t, life: big ? 1300 : 950 });
      }
      for (let tt = 0; tt < t + 1400; tt += 5) {
        const alive = ps.filter((p) => tt >= p.t0 && tt - p.t0 < p.life);
        for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
          expect(overlaps(alive[i], alive[j], tt), `장면 ${scene}, t=${tt}`).toBe(false);
        }
      }
    }
  });
  it('배너 같은 고정 영역과도 떠오르는 동안 겹치지 않는다', () => {
    const banner = { x: 240, y: 34, w: 200, h: 34 };
    for (const y0 of [60, 66, 72, 80, 90, 120]) {
      const y = placePopup([], 250, 60, 15, y0, 0, [banner], 10)!;
      const p: PopupBox = { x: 250, y, w: 60, h: 15, t0: 0, life: 1300 };
      for (let t = 0; t < 1300; t += 10) {
        const py = popupYAt(p, t);
        expect(py + 15 <= banner.y || py >= banner.y + banner.h, `y0=${y0} t=${t} py=${py}`).toBe(true);
      }
    }
  });
  it('자리가 화면 위 한계를 넘으면 null (호출 측이 오래된 문구를 치움)', () => {
    const stack: PopupBox[] = [];
    let last: number | null = 0;
    for (let i = 0; i < 12 && last !== null; i++) {
      last = placePopup(stack, 100, 40, 11, 120, 0, [], 42);
      if (last !== null) stack.push({ x: 100, y: last, w: 40, h: 11, t0: 0, life: 950 });
    }
    expect(last).toBeNull();
    for (const p of stack) expect(p.y - POPUP_RISE).toBeGreaterThanOrEqual(42);
  });
  it('겹치지 않으면 원하는 위치 그대로, 가로로 떨어져 있으면 올리지 않는다', () => {
    const a: PopupBox = { x: 100, y: 100, w: 30, h: 11, t0: 0, life: 950 };
    expect(placePopup([a], 100, 30, 11, 140, 10)).toBe(140);
    expect(placePopup([a], 300, 30, 11, 100, 10)).toBe(100);
    expect(placePopup([a], 100, 30, 11, 100, 400)).toBe(100 - POPUP_RISE - 11);
  });
});
