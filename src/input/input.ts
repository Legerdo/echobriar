/**
 * 입력: 키보드(재설정 가능)·마우스·게임패드.
 * 모든 입력은 고해상도 타임스탬프(performance.now 축)와 함께 큐에 쌓이고,
 * 전투 반응 판정은 프레임 시각이 아니라 이 타임스탬프로 계산한다.
 */
export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu' | 'parry' | 'dodge' | 'jump' | 'run';

export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'parry', 'dodge', 'jump', 'run'];

export type KeyMap = Record<Action, string[]>;

export const DEFAULT_KEYS: KeyMap = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'KeyZ'],
  cancel: ['KeyX', 'Backspace', 'Escape'],
  menu: ['Escape', 'Tab'],
  parry: ['Space'],
  dodge: ['ShiftLeft', 'ShiftRight'],
  jump: ['KeyC'],
  run: ['ShiftLeft', 'ShiftRight'],
};

/** 같은 상황에서 함께 쓰이는 입력 묶음 — 묶음 안에서는 키가 겹치면 안 된다 */
export const CONFLICT_GROUPS: Action[][] = [
  ['up', 'down', 'left', 'right', 'confirm', 'parry', 'dodge', 'jump'],
  ['up', 'down', 'left', 'right', 'confirm', 'run', 'menu'],
  ['up', 'down', 'left', 'right', 'confirm', 'cancel'],
];

/** 게임패드 표준 배치 (고정) */
const PAD: Record<Action, number[]> = {
  up: [12], down: [13], left: [14], right: [15],
  confirm: [0], cancel: [1], menu: [9], parry: [5], dodge: [4], jump: [2], run: [6, 1],
};
const PAD_LABEL: Record<Action, string> = {
  up: '↑', down: '↓', left: '←', right: '→', confirm: 'A', cancel: 'B', menu: 'Start', parry: 'RB', dodge: 'LB', jump: 'X', run: 'LT',
};

export interface InputEvent {
  action: Action;
  down: boolean;
  repeat: boolean;
  /** performance.now() 축 ms */
  t: number;
}

const REPEATABLE = new Set<Action>(['up', 'down', 'left', 'right']);

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const m: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt',
  };
  return m[code] ?? code;
}

export class Input {
  keys: KeyMap;
  private codeToActions = new Map<string, Action[]>();
  private queue: InputEvent[] = [];
  /** 이번 프레임 이벤트 */
  events: InputEvent[] = [];
  private held = new Set<Action>();
  private heldKeys = new Set<string>();
  private padHeld = new Set<Action>();
  device: 'kb' | 'pad' = 'kb';
  mouse = { x: 0, y: 0, moved: false, clicked: false, down: false, clickT: 0, active: false };
  private capture: ((code: string) => void) | null = null;
  private firstInteract: (() => void)[] = [];
  private toLogical: (x: number, y: number) => [number, number];
  private padAxes = { x: 0, y: 0 };
  /** 봇/테스트용: 가상 입력 주입 */
  inject(action: Action, down: boolean, t = performance.now()): void {
    this.queue.push({ action, down, repeat: false, t });
    if (down) this.held.add(action);
    else this.held.delete(action);
  }

  constructor(toLogical: (x: number, y: number) => [number, number], keys: KeyMap = DEFAULT_KEYS) {
    this.toLogical = toLogical;
    this.keys = keys;
    this.rebuild();
    window.addEventListener('keydown', (e) => this.onKey(e, true), { capture: true });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { capture: true });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.heldKeys.clear();
    });
    const canvas = document.getElementById('stage')!;
    window.addEventListener('mousemove', (e) => {
      const [x, y] = this.toLogical(e.clientX, e.clientY);
      this.mouse.x = x;
      this.mouse.y = y;
      this.mouse.moved = true;
      this.mouse.active = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouse.down = true;
      this.mouse.clickT = e.timeStamp || performance.now();
      this.fireFirst();
    });
    window.addEventListener('mouseup', () => (this.mouse.down = false));
    canvas.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.mouse.clicked = true;
    });
    window.addEventListener('pointerdown', () => this.fireFirst(), { once: false });
  }

  setKeys(keys: KeyMap): void {
    this.keys = keys;
    this.rebuild();
  }
  private rebuild(): void {
    this.codeToActions.clear();
    for (const a of ACTIONS) for (const c of this.keys[a] ?? []) {
      const list = this.codeToActions.get(c) ?? [];
      list.push(a);
      this.codeToActions.set(c, list);
    }
  }
  onFirstInteract(fn: () => void): void {
    this.firstInteract.push(fn);
  }
  private fireFirst(): void {
    if (!this.firstInteract.length) return;
    const l = this.firstInteract;
    this.firstInteract = [];
    l.forEach((f) => f());
  }
  /** 다음 키 입력 하나를 가로챈다 (키 재설정) */
  captureNext(cb: (code: string) => void): void {
    this.capture = cb;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    this.fireFirst();
    if (this.capture && down) {
      e.preventDefault();
      e.stopPropagation();
      const cb = this.capture;
      this.capture = null;
      cb(e.code);
      return;
    }
    // 디버그 키 등은 통과
    if (e.code === 'F9' || e.code === 'F12' || e.code === 'F5' || e.ctrlKey || e.metaKey) return;
    const acts = this.codeToActions.get(e.code);
    if (!acts) return;
    e.preventDefault();
    this.device = 'kb';
    const t = e.timeStamp || performance.now();
    if (down) {
      const repeat = e.repeat || this.heldKeys.has(e.code);
      this.heldKeys.add(e.code);
      for (const a of acts) {
        if (repeat && !REPEATABLE.has(a)) continue;
        this.held.add(a);
        this.queue.push({ action: a, down: true, repeat, t });
      }
    } else {
      this.heldKeys.delete(e.code);
      for (const a of acts) {
        // 같은 동작의 다른 키가 아직 눌려 있으면 유지
        if ((this.keys[a] ?? []).some((c) => this.heldKeys.has(c))) continue;
        this.held.delete(a);
        this.queue.push({ action: a, down: false, repeat: false, t });
      }
    }
  }

  private pollPad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const p = pads.find((x) => x && x.connected);
    if (!p) return;
    const now = performance.now();
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    this.padAxes.x = Math.abs(ax) > 0.35 ? ax : 0;
    this.padAxes.y = Math.abs(ay) > 0.35 ? ay : 0;
    for (const a of ACTIONS) {
      let on = PAD[a].some((i) => p.buttons[i]?.pressed);
      if (a === 'left' && ax < -0.5) on = true;
      if (a === 'right' && ax > 0.5) on = true;
      if (a === 'up' && ay < -0.5) on = true;
      if (a === 'down' && ay > 0.5) on = true;
      const was = this.padHeld.has(a);
      if (on && !was) {
        this.padHeld.add(a);
        this.held.add(a);
        this.device = 'pad';
        this.fireFirst();
        this.queue.push({ action: a, down: true, repeat: false, t: now });
      } else if (!on && was) {
        this.padHeld.delete(a);
        if (!(this.keys[a] ?? []).some((c) => this.heldKeys.has(c))) this.held.delete(a);
        this.queue.push({ action: a, down: false, repeat: false, t: now });
      }
    }
  }

  /** 프레임 시작: 큐 → 이번 프레임 이벤트 */
  beginFrame(): void {
    this.pollPad();
    this.events = this.queue;
    this.queue = [];
  }
  endFrame(): void {
    this.mouse.clicked = false;
    this.mouse.moved = false;
  }
  /** 이번 프레임에 눌림 (방향키는 반복 포함) */
  pressed(a: Action): boolean {
    return this.events.some((e) => e.action === a && e.down);
  }
  /** 반복 입력 제외 */
  pressedFresh(a: Action): boolean {
    return this.events.some((e) => e.action === a && e.down && !e.repeat);
  }
  released(a: Action): boolean {
    return this.events.some((e) => e.action === a && !e.down);
  }
  down(a: Action): boolean {
    return this.held.has(a);
  }
  /** 이번 프레임의 해당 동작 누름 시각 목록 */
  pressTimes(a: Action): number[] {
    return this.events.filter((e) => e.action === a && e.down && !e.repeat).map((e) => e.t);
  }
  releaseTimes(a: Action): number[] {
    return this.events.filter((e) => e.action === a && !e.down).map((e) => e.t);
  }
  /** 이동 벡터 (-1..1) */
  axis(): [number, number] {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    let y = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0);
    if (this.padAxes.x || this.padAxes.y) {
      x = this.padAxes.x;
      y = this.padAxes.y;
    }
    return [x, y];
  }
  clearHeld(): void {
    this.held.clear();
    this.heldKeys.clear();
  }
  /** 현재 장치 기준 안내 표기 */
  label(a: Action): string {
    if (this.device === 'pad') return PAD_LABEL[a];
    const k = this.keys[a];
    return k && k.length ? keyLabel(k[0]) : '—';
  }
}

/** 재설정 시 충돌 검사: 같은 묶음 안의 다른 동작이 이미 쓰는 키 */
export function findConflict(keys: KeyMap, action: Action, code: string): Action | null {
  for (const g of CONFLICT_GROUPS) {
    if (!g.includes(action)) continue;
    for (const other of g) if (other !== action && keys[other]?.includes(code)) return other;
  }
  return null;
}
