import { Scene, W, H } from '../core/engine';
import { game } from '../game';
import { COL } from '../gfx/gfx';
import { audio } from '../audio/audio';
import { h, Menu, Modal } from '../ui/dom';
import { ENDINGS, CREDITS } from '../data/story';
import { DIFFICULTY } from '../data/config';
import { formatTime } from '../core/util';
import { writeSave } from '../state/save';
import { L } from '../locale/ko';

/** 엔딩 서술 → 승리 화면(기록) → 크레디트 → 타이틀 */
export class EndingScene implements Scene {
  readonly name = 'ending';
  private t = 0;
  private stage: 'story' | 'victory' | 'credits' = 'story';
  private lines: string[];
  private idx = 0;
  private lineT = 0;
  private modal: Modal | null = null;
  readonly kind: string;

  constructor() {
    const s = game.save!;
    this.kind = s.flags.ending_heal ? 'ending_heal' : 'ending_seal';
    this.lines = ENDINGS[this.kind];
    s.ending = this.kind;
    if (!s.bosses.includes('thornknight')) s.bosses.push('thornknight');
    writeSave(s);
  }

  enter(): void {
    audio.music('ending');
    game.ui.announce(this.lines[0]);
  }
  exit(): void {
    if (this.modal) game.ui.pop(this.modal);
  }

  update(dt: number): void {
    this.t += dt;
    this.lineT += dt;
    if (this.stage !== 'story' || game.ui.blocking) return;
    const inp = game.input;
    const adv = inp.pressedFresh('confirm') || inp.mouse.clicked;
    if ((adv && this.lineT > 500) || this.lineT > 6500) {
      this.idx++;
      this.lineT = 0;
      if (this.idx >= this.lines.length) this.showVictory();
      else game.ui.announce(this.lines[this.idx]);
    }
  }

  private showVictory(): void {
    this.stage = 'victory';
    const s = game.save!;
    audio.sfx('victory');
    const menu = new Menu([{ label: '크레디트', onSelect: () => this.showCredits() }], L.victoryTitle);
    const st = s.stats;
    const rows: [string, string][] = [
      ['결말', this.kind === 'ending_heal' ? '뿌리를 치유했다' : '뿌리를 잠재웠다'],
      ['난이도', DIFFICULTY[s.difficulty].label],
      ['플레이 시간', formatTime(s.playTime)],
      ['전투', `${st.battles}회`],
      ['완벽 패링', `${st.perfectParries}회`],
      ['반격', `${st.counters}회`],
      ['붕괴', `${st.breaks}회`],
      ['약점 명중', `${st.weakHits}회`],
      ['패배', `${st.defeats}회`],
      ['해금한 메아리', `${s.echoesUnlocked.length}개`],
    ];
    this.modal = {
      el: h('section', { class: 'panel hi', style: 'left:50%;top:52%;transform:translate(-50%,-50%);width:min(calc(var(--u)*240*var(--ui)),94%)', role: 'dialog', 'aria-label': L.victoryTitle },
        h('h2', { text: `${L.victoryTitle} — 세계뿌리에 평온이 찾아왔다` }),
        h('dl', { class: 'kv' }, ...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])), menu.el),
      handle: (i) => menu.handle(i),
    };
    game.ui.push(this.modal);
  }

  private showCredits(): void {
    if (this.modal) game.ui.pop(this.modal);
    this.stage = 'credits';
    const menu = new Menu([{ label: '타이틀로', onSelect: () => game.toTitle() }], L.credits);
    this.modal = {
      el: h('section', { class: 'panel', style: 'left:50%;top:50%;transform:translate(-50%,-50%);width:min(calc(var(--u)*280*var(--ui)),94%)', role: 'dialog', 'aria-label': L.credits }, h('h2', { text: L.credits }), h('div', { class: 'credits', text: CREDITS.join('\n') }), menu.el),
      handle: (i) => menu.handle(i),
    };
    game.ui.push(this.modal);
  }

  render(): void {
    const g = game.gfx;
    g.clear(COL.ink);
    g.image(this.kind === 'ending_heal' ? 'bg_dawn' : 'bg_title', 0, 0);
    if (this.stage !== 'story') {
      g.rect(0, 0, W, H, COL.ink, 0.35);
      return;
    }
    g.rect(0, H - 92, W, 92, COL.ink, 0.7);
    const line = this.lines[this.idx] ?? '';
    const a = Math.min(1, this.lineT / 600);
    // 줄바꿈
    const words = line.split(' ');
    const rows: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (g.measure(test, 10) > W - 60) { rows.push(cur); cur = w; } else cur = test;
    }
    if (cur) rows.push(cur);
    rows.forEach((r, i) => g.text(r, W / 2, H - 76 + i * 16, { size: 10, align: 'center', alpha: a }));
    g.text(`${this.idx + 1} / ${this.lines.length}   [${game.input.label('confirm')}]`, W - 8, H - 12, { size: 7, align: 'right', color: COL.boneDim });
  }
}
