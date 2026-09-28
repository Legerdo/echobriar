import { blockedCells, Ent, MapDef } from '../data/maps';

export const TILE = 16;

export function mapW(m: MapDef): number {
  return m.rows[0].length;
}
export function mapH(m: MapDef): number {
  return m.rows.length;
}

export function entVisible(e: Ent, flags: Record<string, number>): boolean {
  if (e.showIf && !flags[e.showIf]) return false;
  if (e.hideIf && flags[e.hideIf]) return false;
  if (e.k === 'enemy' && flags[`def:${e.id}`]) return false;
  return true;
}

/** 엔티티가 막는 칸 */
export function entCells(e: Ent, flags: Record<string, number>): [number, number][] {
  if (!entVisible(e, flags)) return [];
  switch (e.k) {
    case 'npc': case 'chest': case 'rest': case 'read': case 'pedestal': return [[e.x, e.y]];
    case 'thorn': return flags[e.need] ? [] : [[e.x, e.y]];
    case 'crack': return flags[`crack:${e.id}`] ? [] : [[e.x, e.y]];
    case 'gate': return flags.gate_open ? [[e.x - 2, e.y], [e.x + 1, e.y]] : [[e.x - 2, e.y - 1], [e.x - 1, e.y - 1], [e.x, e.y - 1], [e.x + 1, e.y - 1], [e.x - 2, e.y], [e.x - 1, e.y], [e.x, e.y], [e.x + 1, e.y]];
    case 'prop': return e.block ? (e.sprite === 'tent' ? [[e.x - 1, e.y], [e.x, e.y]] : [[e.x, e.y]]) : [];
    default: return [];
  }
}

/** 걸을 수 있는 칸 격자 (true = 막힘) */
export function solidGrid(m: MapDef, flags: Record<string, number>): Uint8Array {
  const w = mapW(m), h = mapH(m);
  const g = new Uint8Array(w * h);
  for (const i of blockedCells(m)) if (i >= 0 && i < g.length) g[i] = 1;
  for (const e of m.ents) for (const [x, y] of entCells(e, flags)) if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = 1;
  return g;
}

/** 시작 칸에서 도달 가능한 칸 */
export function reachable(m: MapDef, g: Uint8Array, sx: number, sy: number): Uint8Array {
  const w = mapW(m), h = mapH(m);
  const seen = new Uint8Array(w * h);
  const q: number[] = [sy * w + sx];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (seen[j] || g[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

/** 엔티티에 닿을 수 있는지 (자기 칸 또는 인접 칸 도달) */
export function entReachable(m: MapDef, seen: Uint8Array, e: Ent): boolean {
  const w = mapW(m), h = mapH(m);
  const cells: [number, number][] = [];
  if (e.k === 'exit' || e.k === 'trigger') {
    for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) cells.push([x, y]);
  } else cells.push([e.x, e.y]);
  if (e.k === 'gate') cells.push([e.x, e.y + 1], [e.x - 1, e.y + 1], [e.x, e.y - 2], [e.x - 1, e.y - 2]);
  for (const [x, y] of cells) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (seen[ny * w + nx]) return true;
  }
  return false;
}
