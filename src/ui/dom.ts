import type { Input } from '../input/input';
import type { Assets } from '../gfx/assets';
import { audio } from '../audio/audio';

/** DOM 요소 생성 도우미 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | number | boolean | undefined> = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/* ---------- 아이콘 → 데이터 URL (DOM에서 픽셀 아이콘 사용) ---------- */
let assetsRef: Assets | null = null;
const iconCache = new Map<string, string>();
export function bindAssets(a: Assets): void {
  assetsRef = a;
}
export function spriteURL(sheet: string, anim: string, idx = 0, crop?: [number, number, number, number]): string {
  const key = `${sheet}|${anim}|${idx}|${crop?.join(',') ?? ''}`;
  const c = iconCache.get(key);
  if (c) return c;
  const a = assetsRef;
  if (!a || !a.hasAnim(sheet, anim)) return '';
  const s = a.sheet(sheet);
  const fr = s.frames[a.anim(sheet, anim).frames[idx] ?? 0];
  const [cx, cy, cw, ch] = crop ?? [0, 0, s.frameW, s.frameH];
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  cv.getContext('2d')!.drawImage(a.sheetImg.get(sheet)!, fr.x + cx, fr.y + cy, cw, ch, 0, 0, cw, ch);
  const url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}
export function iconURL(name: string): string {
  return spriteURL('icons', name);
}
export function iconImg(name: string, cls = 'icon', alt = ''): HTMLImageElement {
  return h('img', { class: cls, src: iconURL(name), alt, 'aria-hidden': alt ? undefined : 'true' });
}

/* ---------- 모달 스택 ---------- */
export interface Modal {
  el: HTMLElement;
  handle(input: Input): void;
  onClose?(): void;
  /** true: 아래 씬도 계속 갱신 */
  passthrough?: boolean;
  /** 자동 플레이 봇이 확인으로 넘겨도 되는 창 (대화·안내·결과) */
  botConfirm?: boolean;
}

export class UI {
  readonly root: HTMLElement;
  readonly live: HTMLElement;
  stack: Modal[] = [];
  private openedFrame = new WeakMap<Modal, number>();
  frame = 0;
  constructor(root: HTMLElement, live: HTMLElement) {
    this.root = root;
    this.live = live;
  }
  push(m: Modal): Modal {
    this.stack.push(m);
    this.root.append(m.el);
    this.openedFrame.set(m, this.frame);
    return m;
  }
  pop(m?: Modal): void {
    const t = m ?? this.stack[this.stack.length - 1];
    if (!t) return;
    const i = this.stack.indexOf(t);
    if (i < 0) return;
    this.stack.splice(i, 1);
    t.el.remove();
    t.onClose?.();
    const top = this.top();
    if (top) this.openedFrame.set(top, this.frame);
  }
  top(): Modal | undefined {
    return this.stack[this.stack.length - 1];
  }
  clear(): void {
    while (this.stack.length) this.pop();
  }
  get blocking(): boolean {
    return this.stack.some((m) => !m.passthrough);
  }
  update(input: Input): void {
    this.frame++;
    // 입력 이벤트는 프레임 단위로 소비된다. 이번 프레임에 열린 창은 다음 프레임의 새 입력부터 받으므로
    // 같은 키가 두 번 처리되지 않고, 빠른 연속 입력도 버려지지 않는다.
    const t = this.top();
    if (t && this.openedFrame.get(t) !== this.frame) t.handle(input);
  }
  announce(text: string): void {
    this.live.textContent = '';
    requestAnimationFrame(() => (this.live.textContent = text));
  }
}

/* ---------- 메뉴 ---------- */
export interface MenuItem {
  label: string;
  tag?: string;
  desc?: string;
  disabled?: boolean;
  icon?: string;
  iconSrc?: string;
  sep?: boolean;
  onSelect?: () => void;
  /** 좌우 입력 (설정 값 조절 등) */
  onLeftRight?: (dir: -1 | 1) => void;
}

export class Menu {
  readonly el: HTMLUListElement;
  items: MenuItem[] = [];
  index = 0;
  private buttons: HTMLButtonElement[] = [];
  onCancel: (() => void) | null = null;
  onChange: ((it: MenuItem, i: number) => void) | null = null;

  constructor(items: MenuItem[], label: string, onCancel: (() => void) | null = null) {
    this.el = h('ul', { class: 'menu', role: 'menu', 'aria-label': label });
    this.onCancel = onCancel;
    this.setItems(items);
  }

  setItems(items: MenuItem[], keepIndex = true): void {
    this.items = items;
    this.el.innerHTML = '';
    this.buttons = [];
    items.forEach((it, i) => {
      if (it.sep) {
        this.el.append(h('li', { class: 'sep', role: 'separator' }));
        this.buttons.push(null as unknown as HTMLButtonElement);
        return;
      }
      const b = h('button', { type: 'button', role: 'menuitem', 'aria-disabled': it.disabled ? 'true' : 'false', tabindex: -1 });
      if (it.icon || it.iconSrc) b.append(h('img', { class: 'icon s', src: it.iconSrc ?? iconURL(it.icon!), alt: '', 'aria-hidden': 'true' }));
      b.append(h('span', { class: 'grow', text: it.label }));
      if (it.tag) b.append(h('span', { class: 'tag', text: it.tag }));
      if (it.desc) b.setAttribute('aria-description', it.desc);
      b.addEventListener('mouseenter', () => this.focus(i, false));
      b.addEventListener('click', (e) => {
        e.preventDefault();
        this.focus(i, false);
        this.activate();
      });
      this.el.append(h('li', { role: 'none' }, b));
      this.buttons.push(b);
    });
    if (!keepIndex) this.index = 0;
    this.index = Math.min(this.index, items.length - 1);
    if (this.items[this.index]?.sep) this.move(1, true);
    this.focus(Math.max(0, this.index), false, true);
  }

  focus(i: number, sound = true, silent = false): void {
    if (i < 0 || i >= this.items.length || this.items[i].sep) return;
    if (i !== this.index && sound) audio.sfx('move');
    this.index = i;
    this.buttons.forEach((b, k) => b?.classList.toggle('sel', k === i));
    const b = this.buttons[i];
    if (b && !silent) {
      b.focus({ preventScroll: true });
      b.scrollIntoView({ block: 'nearest' });
    } else if (b) b.scrollIntoView({ block: 'nearest' });
    this.onChange?.(this.items[i], i);
  }
  private move(d: number, silent = false): void {
    const n = this.items.length;
    let i = this.index;
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (!this.items[i].sep) break;
    }
    this.focus(i, !silent);
  }
  activate(): void {
    const it = this.items[this.index];
    if (!it) return;
    if (it.disabled) {
      audio.sfx('error');
      return;
    }
    audio.sfx('select');
    it.onSelect?.();
  }
  handle(input: Input): void {
    // 한 프레임에 여러 번 눌린 방향키도 모두 반영 (느린 프레임에서 입력 유실 방지)
    for (const e of input.events) {
      if (!e.down) continue;
      if (e.action === 'up') this.move(-1);
      else if (e.action === 'down') this.move(1);
      else if (e.action === 'left' || e.action === 'right') {
        const it = this.items[this.index];
        if (it?.onLeftRight) { it.onLeftRight(e.action === 'left' ? -1 : 1); audio.sfx('move'); }
      }
    }
    if (input.pressedFresh('confirm')) this.activate();
    else if (input.pressedFresh('cancel') && this.onCancel) {
      audio.sfx('cancel');
      this.onCancel();
    }
  }
  current(): MenuItem | undefined {
    return this.items[this.index];
  }
}

/** 단순 패널 모달: 메뉴 + 선택적 설명 영역 */
export function panelModal(opts: { title?: string; menu: Menu; cls?: string; style?: string; desc?: HTMLElement; extra?: HTMLElement[]; passthrough?: boolean; dim?: boolean }): Modal {
  const panel = h('section', { class: `panel ${opts.cls ?? ''}`, style: opts.style, role: 'dialog', 'aria-label': opts.title ?? '메뉴' });
  if (opts.title) panel.append(h('h2', { text: opts.title }));
  panel.append(opts.menu.el);
  if (opts.desc) panel.append(opts.desc);
  for (const e of opts.extra ?? []) panel.append(e);
  const wrap = opts.dim ? h('div', { class: 'fullscreen' }, h('div', { class: 'dimmer' }), panel) : panel;
  return { el: wrap, handle: (i) => opts.menu.handle(i), passthrough: opts.passthrough };
}

/** 예/아니요 확인 */
export function confirmModal(ui: UI, text: string, onYes: () => void, onNo: () => void = () => {}): void {
  const m = new Menu([], '확인');
  const modal = panelModal({ title: '확인', menu: m, cls: '', style: 'left:50%;top:50%;transform:translate(-50%,-50%);width:min(calc(var(--u)*240*var(--ui)),90%)', dim: true, extra: [] });
  const p = h('p', { text });
  modal.el.querySelector('section')!.insertBefore(p, m.el);
  m.setItems([
    { label: '예', onSelect: () => { ui.pop(modal); onYes(); } },
    { label: '아니요', onSelect: () => { ui.pop(modal); onNo(); } },
  ]);
  m.onCancel = () => { ui.pop(modal); onNo(); };
  m.index = 1;
  m.focus(1, false);
  ui.push(modal);
  ui.announce(text);
}

/** 화면 하단 짧은 알림 */
export function toast(ui: UI, text: string, ms = 1800): void {
  const el = h('div', { class: 'panel toast', role: 'status', text });
  ui.root.append(el);
  ui.announce(text);
  setTimeout(() => el.remove(), ms);
}

/** 키 표기 치환: {parry} → 현재 키 */
export function fillKeys(s: string, input: Input): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (k === 'move') return input.device === 'pad' ? '스틱/방향패드' : '방향키/WASD';
    try {
      return `[${input.label(k as Parameters<Input['label']>[0])}]`;
    } catch {
      return k;
    }
  });
}
