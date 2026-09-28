import { h, Menu, Modal, spriteURL, fillKeys, UI } from './dom';
import type { Input } from '../input/input';
import { SPEAKERS, TUTORIALS } from '../data/story';
import { audio } from '../audio/audio';
import type { Settings } from '../state/save';

const SPEED: Record<Settings['textSpeed'], number> = { slow: 28, normal: 55, fast: 120, instant: 100000 };

function portraitFor(speaker: string): string {
  const sp = SPEAKERS[speaker];
  if (!sp) return '';
  if (sp.portrait) return spriteURL('portraits', sp.portrait);
  if (sp.sprite) return spriteURL(sp.sprite, 'idle_down', 0, [4, 2, 16, 16]);
  return '';
}

/** 대화 상자 (타자 효과, 초상화, 선택지) */
export class DialogBox implements Modal {
  el: HTMLElement;
  botConfirm = true;
  private who: HTMLElement;
  private text: HTMLElement;
  private img: HTMLImageElement;
  private next: HTMLElement;
  private full = '';
  private shown = 0;
  private last = performance.now();
  private cb: (() => void) | null = null;
  private menu: Menu | null = null;
  private speed: number;

  constructor(speed: Settings['textSpeed']) {
    this.speed = SPEED[speed];
    this.img = h('img', { class: 'portrait', alt: '' });
    this.who = h('div', { class: 'who' });
    this.text = h('div', { class: 'text', 'aria-live': 'polite' });
    this.next = h('div', { class: 'next', text: '▼', 'aria-hidden': 'true' });
    this.el = h('section', { class: 'panel dialog', role: 'dialog', 'aria-label': '대화' }, this.img, h('div', { class: 'grow' }, this.who, this.text), this.next);
  }

  say(speaker: string, text: string, cb: () => void): void {
    const sp = SPEAKERS[speaker] ?? { name: speaker };
    const src = portraitFor(speaker);
    this.img.style.display = src ? '' : 'none';
    if (src) this.img.src = src;
    this.who.textContent = sp.name;
    this.who.style.display = sp.name ? '' : 'none';
    this.el.classList.toggle('narration', !sp.name);
    this.full = text;
    this.shown = 0;
    this.last = performance.now();
    this.cb = cb;
    this.text.textContent = '';
    this.next.style.visibility = 'hidden';
    this.menu?.el.remove();
    this.menu = null;
    this.el.setAttribute('aria-label', sp.name ? `${sp.name}: ${text}` : text);
  }

  choose(options: string[], cb: (i: number) => void): void {
    this.shown = this.full.length;
    this.text.textContent = this.full;
    this.cb = null;
    this.menu = new Menu(options.map((o, i) => ({ label: o, onSelect: () => { this.menu?.el.remove(); this.menu = null; cb(i); } })), '선택');
    this.el.querySelector('.grow')!.append(this.menu.el);
    this.next.style.visibility = 'hidden';
  }

  handle(input: Input): void {
    if (this.menu) {
      this.menu.handle(input);
      return;
    }
    const now = performance.now();
    if (this.shown < this.full.length) {
      this.shown = Math.min(this.full.length, this.shown + ((now - this.last) / 1000) * this.speed);
      this.text.textContent = this.full.slice(0, Math.floor(this.shown));
      if (this.shown >= this.full.length) this.next.style.visibility = 'visible';
    }
    this.last = now;
    const adv = input.pressedFresh('confirm') || input.pressedFresh('cancel') || input.mouse.clicked;
    if (!adv) return;
    if (this.shown < this.full.length) {
      this.shown = this.full.length;
      this.text.textContent = this.full;
      this.next.style.visibility = 'visible';
      return;
    }
    audio.sfx('move');
    const cb = this.cb;
    this.cb = null;
    cb?.();
  }
}

/** 튜토리얼 안내 카드 (확인 시 닫힘) */
export function showHint(ui: UI, input: Input, id: string, onClose: () => void): void {
  const t = TUTORIALS[id];
  if (!t) { onClose(); return; }
  const menu = new Menu([{ label: '확인', onSelect: () => close() }], '안내', () => close());
  const body = h('p', { class: 'desc', text: fillKeys(t.body, input) });
  const el = h('section', { class: 'panel hi hint', role: 'dialog', 'aria-label': t.title }, h('h2', { text: t.title }), body, menu.el);
  const modal: Modal = { el, handle: (i) => menu.handle(i), botConfirm: true };
  function close(): void {
    ui.pop(modal);
    onClose();
  }
  ui.push(modal);
  ui.announce(`${t.title}. ${body.textContent}`);
  audio.sfx('unlock');
}
