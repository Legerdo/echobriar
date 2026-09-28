import type { Manifest, ManifestAnim, ManifestSheet, FrameTag, WeakPoint } from '../art/core/sheet';

export type { ManifestAnim, ManifestSheet, WeakPoint, FrameTag };

/** 생성된 아트(public/generated) 로더. 매니페스트가 프레임·태그·약점·부착점을 제공한다. */
export class Assets {
  manifest!: Manifest;
  readonly sheetImg = new Map<string, HTMLImageElement>();
  readonly images = new Map<string, HTMLImageElement>();
  private tints = new Map<string, HTMLCanvasElement>();
  readonly base: string;

  constructor(base = 'generated/') {
    this.base = base;
  }

  async load(onProgress?: (done: number, total: number) => void): Promise<void> {
    const res = await fetch(`${this.base}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('아트 매니페스트를 불러오지 못했습니다');
    this.manifest = (await res.json()) as Manifest;
    const jobs: [string, string, Map<string, HTMLImageElement>][] = [];
    for (const s of Object.values(this.manifest.sheets)) jobs.push([s.id, s.file, this.sheetImg]);
    for (const i of Object.values(this.manifest.images)) jobs.push([i.id, i.file, this.images]);
    let done = 0;
    await Promise.all(
      jobs.map(
        ([id, file, map]) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              map.set(id, img);
              onProgress?.(++done, jobs.length);
              resolve();
            };
            img.onerror = () => reject(new Error(`이미지 로드 실패: ${file}`));
            img.src = `${this.base}${file}`;
          }),
      ),
    );
  }

  sheet(id: string): ManifestSheet {
    const s = this.manifest.sheets[id];
    if (!s) throw new Error(`알 수 없는 스프라이트: ${id}`);
    return s;
  }
  has(id: string): boolean {
    return !!this.manifest.sheets[id];
  }
  anim(id: string, name: string): ManifestAnim {
    const s = this.sheet(id);
    return s.anims[name] ?? s.anims.idle ?? Object.values(s.anims)[0];
  }
  hasAnim(id: string, name: string): boolean {
    return !!this.manifest.sheets[id]?.anims[name];
  }

  private tops = new Map<string, number>();
  /** 대기 첫 프레임의 가장 위쪽 불투명 행 (머리 위 표시 위치 계산) */
  topRow(id: string): number {
    const c = this.tops.get(id);
    if (c !== undefined) return c;
    const s = this.sheet(id);
    const fr = this.anim(id, 'idle').frames[0];
    let top = 0;
    outer: for (let y = 0; y < s.frameH; y++) for (let x = 0; x < s.frameW; x++) if (this.opaqueAt(id, fr, x, y)) { top = y; break outer; }
    this.tops.set(id, top);
    return top;
  }
  private alphaCache = new Map<string, ImageData>();
  /** 프레임 좌표 (x,y)의 불투명 여부 — 정밀 조준 명중 판정 */
  opaqueAt(id: string, frame: number, x: number, y: number): boolean {
    const s = this.sheet(id);
    if (x < 0 || y < 0 || x >= s.frameW || y >= s.frameH) return false;
    let d = this.alphaCache.get(id);
    if (!d) {
      const img = this.sheetImg.get(id)!;
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x2 = c.getContext('2d', { willReadFrequently: true })!;
      x2.drawImage(img, 0, 0);
      d = x2.getImageData(0, 0, img.width, img.height);
      this.alphaCache.set(id, d);
    }
    const f = s.frames[frame];
    return d.data[((f.y + Math.floor(y)) * d.width + f.x + Math.floor(x)) * 4 + 3] > 0;
  }

  /** 단색 실루엣(피격 섬광·붕괴 강조용). 색마다 캐시. */
  tinted(id: string, color: string): HTMLCanvasElement {
    const key = `${id}|${color}`;
    let c = this.tints.get(key);
    if (c) return c;
    const img = this.sheetImg.get(id)!;
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    this.tints.set(key, c);
    return c;
  }
}

/* ---------- 애니메이션 시간 계산 (순수) ---------- */

export function animLength(a: ManifestAnim): number {
  let t = 0;
  for (const d of a.durations) t += d;
  return t;
}

/** 경과 시간 t(ms)에 해당하는 애니메이션 내부 프레임 번호 */
export function frameAt(a: ManifestAnim, t: number, rate = 1): number {
  const total = animLength(a);
  let tt = t * rate;
  if (a.loop) tt = ((tt % total) + total) % total;
  else if (tt >= total) return a.frames.length - 1;
  for (let i = 0; i < a.durations.length; i++) {
    if (tt < a.durations[i]) return i;
    tt -= a.durations[i];
  }
  return a.frames.length - 1;
}

/** n번째 tag 프레임의 시작 시각 (ms, rate 반영). 없으면 -1 */
export function tagTimes(a: ManifestAnim, tag: FrameTag, rate = 1): number[] {
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < a.frames.length; i++) {
    if (a.tags[i] === tag) out.push(t / rate);
    t += a.durations[i];
  }
  return out;
}

export function frameStart(a: ManifestAnim, idx: number, rate = 1): number {
  let t = 0;
  for (let i = 0; i < idx && i < a.durations.length; i++) t += a.durations[i];
  return t / rate;
}

/** 재생 중인 애니메이션 상태 */
export class AnimPlayer {
  sheet: string;
  name: string;
  t = 0;
  rate = 1;
  /** 특정 프레임에서 정지 (공격 준비 유지 등) */
  holdFrame: number | null = null;
  constructor(sheet: string, name: string) {
    this.sheet = sheet;
    this.name = name;
  }
  play(name: string, rate = 1, sheet?: string): void {
    if (sheet) this.sheet = sheet;
    this.name = name;
    this.t = 0;
    this.rate = rate;
    this.holdFrame = null;
  }
  update(dt: number): void {
    this.t += dt;
  }
  index(assets: Assets): number {
    const a = assets.anim(this.sheet, this.name);
    if (this.holdFrame !== null) return Math.min(this.holdFrame, a.frames.length - 1);
    return frameAt(a, this.t, this.rate);
  }
  done(assets: Assets): boolean {
    const a = assets.anim(this.sheet, this.name);
    return !a.loop && this.holdFrame === null && this.t * this.rate >= animLength(a);
  }
  /** 시트 전체 기준 프레임 번호 */
  globalFrame(assets: Assets): number {
    return assets.anim(this.sheet, this.name).frames[this.index(assets)];
  }
  weak(assets: Assets): WeakPoint[] {
    const a = assets.anim(this.sheet, this.name);
    return a.weak[this.index(assets)] ?? a.weak[0] ?? assets.anim(this.sheet, 'idle').weak[0] ?? [];
  }
  attach(assets: Assets, key: string): [number, number] | null {
    const a = assets.anim(this.sheet, this.name);
    return a.attach[this.index(assets)]?.[key] ?? assets.anim(this.sheet, 'idle').attach[0]?.[key] ?? null;
  }
}
