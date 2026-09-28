/** 공용 유틸리티 (순수 함수) */

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** 결정적 난수 (mulberry32) — 전투·테스트 재현용 */
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

export function hash2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 기본값 위에 저장값을 덮어쓴다 (타입이 다른 값은 무시) — 구버전/손상 저장 방어 */
export function mergeDefaults<T>(def: T, src: unknown): T {
  if (src === null || src === undefined) return deepClone(def);
  if (Array.isArray(def)) return (Array.isArray(src) ? deepClone(src) : deepClone(def)) as T;
  if (typeof def === 'object' && def !== null) {
    if (typeof src !== 'object' || Array.isArray(src)) return deepClone(def);
    const out: Record<string, unknown> = {};
    const d = def as Record<string, unknown>;
    const s = src as Record<string, unknown>;
    for (const k of Object.keys(d)) out[k] = mergeDefaults(d[k], s[k]);
    // 기본값에 없는 키(예: 동적 맵)도 보존
    for (const k of Object.keys(s)) if (!(k in d)) out[k] = s[k];
    return out as T;
  }
  return (typeof src === typeof def ? src : def) as T;
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분 ${ss.toString().padStart(2, '0')}초`;
}
