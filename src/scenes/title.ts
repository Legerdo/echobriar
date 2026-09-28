import { Scene, W, H } from '../core/engine';
import { game } from '../game';
import { COL } from '../gfx/gfx';
import { audio } from '../audio/audio';
import { h, Menu, Modal, confirmModal, toast } from '../ui/dom';
import { L } from '../locale/ko';
import { hasSave, readSave } from '../state/save';
import { DIFFICULTY, Difficulty } from '../data/config';
import { CREDITS } from '../data/story';
import { openSettings } from '../ui/menus';
import { MAPS } from '../data/maps';
import { formatTime } from '../core/util';

export class TitleScene implements Scene {
  readonly name = 'title';
  private t = 0;
  private modal: Modal | null = null;

  enter(): void {
    audio.music('refuge');
    this.openMain();
  }
  exit(): void {
    if (this.modal) game.ui.pop(this.modal);
  }

  private openMain(): void {
    const { data, corrupt } = readSave();
    const exists = hasSave();
    const menu = new Menu([], L.gameTitle);
    const info = data ? `${MAPS[data.map]?.name ?? ''} · ${formatTime(data.playTime)} · 봉인 ${data.seals.length}/3` : exists && corrupt ? '손상됨' : L.title.noSave;
    menu.setItems([
      { label: L.title.newGame, onSelect: () => (exists ? confirmModal(game.ui, L.confirmNew, () => this.pickDifficulty()) : this.pickDifficulty()) },
      { label: L.title.cont, tag: info, disabled: !data, onSelect: () => { if (!game.continueGame()) toast(game.ui, L.title.corrupt, 3000); } },
      { label: L.title.settings, onSelect: () => { this.close(); openSettings(() => this.openMain(), true); } },
      { label: L.title.credits, onSelect: () => this.credits() },
    ]);
    if (data) menu.focus(1, false);
    if (exists && !data) toast(game.ui, L.title.corrupt, 3200);
    this.show({ el: h('section', { class: 'panel title-menu', role: 'dialog', 'aria-label': `${L.gameTitle}: ${L.gameSub}` }, menu.el), handle: (i) => menu.handle(i) });
  }

  private show(m: Modal): void {
    this.close();
    this.modal = m;
    game.ui.push(m);
  }
  private close(): void {
    if (this.modal) game.ui.pop(this.modal);
    this.modal = null;
  }

  private pickDifficulty(): void {
    const desc = h('p', { class: 'desc' });
    const ids: Difficulty[] = ['story', 'normal', 'expert'];
    const menu = new Menu(ids.map((d) => ({ label: DIFFICULTY[d].label, desc: DIFFICULTY[d].desc, onSelect: () => { this.close(); game.newGame(d); } })), L.diff.pick, () => this.openMain());
    menu.onChange = (it) => (desc.textContent = it.desc ?? '');
    menu.focus(1, false);
    this.show({
      el: h('section', { class: 'panel title-menu', style: 'width:calc(var(--u)*220*var(--ui))', role: 'dialog', 'aria-label': L.diff.pick }, h('h3', { text: L.diff.pick }), menu.el, desc, h('p', { class: 'small dim', text: L.diff.change })),
      handle: (i) => menu.handle(i),
    });
  }

  private credits(): void {
    const menu = new Menu([{ label: L.back, onSelect: () => this.openMain() }], L.credits, () => this.openMain());
    this.show({
      el: h('div', { class: 'fullscreen' }, h('div', { class: 'dimmer' }), h('section', { class: 'panel', style: 'left:50%;top:50%;transform:translate(-50%,-50%);width:min(calc(var(--u)*300*var(--ui)),94%)', role: 'dialog', 'aria-label': L.credits }, h('h2', { text: L.credits }), h('div', { class: 'credits', text: CREDITS.join('\n') }), menu.el)),
      handle: (i) => menu.handle(i),
    });
  }

  update(dt: number): void {
    this.t += dt;
  }

  render(): void {
    const g = game.gfx;
    g.clear(COL.ink);
    g.image('bg_title', 0, 0);
    const bob = Math.round(Math.sin(this.t / 900) * 2);
    g.image('ui_logo', W / 2 - 32, 22 + bob);
    g.text(L.gameTitle, W / 2, 92, { size: 26, bold: true, align: 'center', color: COL.gold, shadow: COL.brass });
    g.text(L.gameSub, W / 2, 124, { size: 11, align: 'center', color: COL.echo });
    g.text('v1.0', W - 6, H - 12, { size: 7, align: 'right', color: COL.boneDim });
  }
}
