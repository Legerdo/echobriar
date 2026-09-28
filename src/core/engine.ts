/**
 * 엔진 코어: 논리 해상도 480×270을 정수 배율로 표시하고, 고해상도 시계로 루프를 돌린다.
 * 모든 게임 로직 시간은 performance.now() 기반 밀리초.
 */
export const W = 480;
export const H = 270;

export interface Scene {
  readonly name: string;
  enter?(): void;
  exit?(): void;
  /** dt: ms (최대 100ms로 제한) */
  update(dt: number): void;
  render(): void;
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly stage: HTMLElement;
  scale = 1;
  dpr = 1;
  scene: Scene | null = null;
  private last = 0;
  private running = false;
  private frameFn: (dt: number) => void = () => {};
  /** 프레임 수 (디버그용) */
  frames = 0;

  constructor(canvas: HTMLCanvasElement, stage: HTMLElement) {
    this.canvas = canvas;
    this.stage = stage;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D를 사용할 수 없습니다');
    this.ctx = ctx;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const aw = window.innerWidth * this.dpr, ah = window.innerHeight * this.dpr;
    this.scale = Math.max(1, Math.floor(Math.min(aw / W, ah / H)));
    this.canvas.width = W * this.scale;
    this.canvas.height = H * this.scale;
    const cssW = (W * this.scale) / this.dpr, cssH = (H * this.scale) / this.dpr;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.stage.style.width = `${cssW}px`;
    this.stage.style.height = `${cssH}px`;
    document.documentElement.style.setProperty('--u', `${this.scale / this.dpr}px`);
    this.resetTransform();
  }

  resetTransform(): void {
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /** 화면(CSS px) 좌표 → 논리 좌표 */
  toLogical(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * W, ((clientY - r.top) / r.height) * H];
  }

  setScene(s: Scene): void {
    this.scene?.exit?.();
    this.scene = s;
    s.enter?.();
  }

  start(frame: (dt: number) => void): void {
    this.frameFn = frame;
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(100, Math.max(0, now - this.last));
      this.last = now;
      this.frames++;
      this.resetTransform();
      this.frameFn(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/**
 * 일시정지 가능한 게임 시계. 입력 이벤트의 고해상도 타임스탬프를 같은 축으로 변환한다.
 * (프레임 수가 아니라 실제 시간으로 판정 — 프레임 드롭·고주사율과 무관)
 */
export class Clock {
  private base = performance.now();
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  /** 배속 (자동 플레이테스트 가속용, 시계마다 고정) */
  constructor(readonly speed = 1) {}
  now(): number {
    const t = this.pausedAt ?? performance.now();
    return (t - this.base - this.pausedTotal) * this.speed;
  }
  /** performance.now() 축의 실제 시각 → 게임 시각 */
  fromReal(real: number): number {
    return (real - this.base - this.pausedTotal) * this.speed;
  }
  /** 게임 시각 → performance.now() 축 (봇 입력 주입용) */
  toReal(t: number): number {
    return t / this.speed + this.base + this.pausedTotal;
  }
  pause(): void {
    if (this.pausedAt === null) this.pausedAt = performance.now();
  }
  resume(): void {
    if (this.pausedAt !== null) {
      this.pausedTotal += performance.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }
  get paused(): boolean {
    return this.pausedAt !== null;
  }
}
