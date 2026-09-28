import { describe, it, expect } from 'vitest';
import { MAPS } from '../src/data/maps';
import { GROUPS } from '../src/data/enemies';
import { SCRIPTS, LORE } from '../src/data/story';
import { ITEMS, RELICS } from '../src/data/items';
import { WEAPONS } from '../src/data/characters';
import { solidGrid, reachable, entReachable, mapW } from '../src/world/collision';

const ALL: Record<string, number> = { seal_ember: 1, seal_glass: 1, seal_storm: 1, orin_joined: 1, sera_joined: 1, gate_open: 0 };

describe('맵 무결성', () => {
  for (const m of Object.values(MAPS)) {
    it(`${m.id}: 행 폭 일치`, () => {
      const w = mapW(m);
      for (const r of m.rows) expect(r.length).toBe(w);
    });
    it(`${m.id}: 모든 엔티티와 출구에 도달 가능 (전체 진행 플래그)`, () => {
      const flags: Record<string, number> = { ...ALL };
      for (const e of m.ents) if (e.k === 'crack') flags[`crack:${e.id}`] = 1;
      const g = solidGrid(m, flags);
      const [sx, sy] = Object.values(m.spawns)[0];
      expect(g[sy * mapW(m) + sx]).toBe(0);
      const seen = reachable(m, g, sx, sy);
      for (const [name, [x, y]] of Object.entries(m.spawns)) expect(seen[y * mapW(m) + x], `스폰 ${name}`).toBe(1);
      for (const e of m.ents) {
        if (e.k === 'prop') continue;
        expect(entReachable(m, seen, e), `${m.id}/${e.id} (${e.k} @${e.x},${e.y})`).toBe(true);
      }
    });
    it(`${m.id}: 참조 무결성`, () => {
      for (const e of m.ents) {
        if (e.k === 'exit') { expect(MAPS[e.to], e.id).toBeTruthy(); expect(MAPS[e.to].spawns[e.spawn], `${e.to}.${e.spawn}`).toBeTruthy(); }
        if (e.k === 'enemy') { expect(GROUPS[e.group], e.group).toBeTruthy(); if (e.pre) expect(SCRIPTS[e.pre], e.pre).toBeTruthy(); if (e.post) expect(SCRIPTS[e.post], e.post).toBeTruthy(); }
        if (e.k === 'npc') expect(SCRIPTS[e.talk], e.talk).toBeTruthy();
        if (e.k === 'trigger') expect(SCRIPTS[e.script], e.script).toBeTruthy();
        if (e.k === 'read') expect(LORE[e.text], e.text).toBeTruthy();
        if (e.k === 'chest') for (const [it] of e.loot) expect(ITEMS[it] || RELICS[it] || WEAPONS[it], it).toBeTruthy();
      }
      if (m.enter) expect(SCRIPTS[m.enter], m.enter).toBeTruthy();
    });
  }
  it('거점: 봉인 전에는 북쪽·서쪽 출구가 가시덤불로 막힘', () => {
    const m = MAPS.hub;
    const g = solidGrid(m, {});
    const [sx, sy] = m.spawns.start;
    const seen = reachable(m, g, sx, sy);
    const n = m.ents.find((e) => e.id === 'x_n')!;
    const w = m.ents.find((e) => e.id === 'x_w')!;
    const e = m.ents.find((e) => e.id === 'x_e')!;
    expect(entReachable(m, seen, e)).toBe(true);
    expect(entReachable(m, seen, n)).toBe(false);
    expect(entReachable(m, seen, w)).toBe(false);
  });
});
