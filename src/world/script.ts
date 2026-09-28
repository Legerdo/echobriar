import { SCRIPTS, Step } from '../data/story';
import { game } from '../game';
import { DialogBox, showHint } from '../ui/dialog';
import { toast } from '../ui/dom';
import { audio } from '../audio/audio';
import { addItem, fullHeal, itemLabel, joinParty } from '../state/game';
import { L } from '../locale/ko';
import { openShop } from '../ui/menus';

export interface ScriptHost {
  battle(group: string, done: (won: boolean) => void): void;
  removeEnt(id: string): void;
  onFinish?(): void;
}

/** 튜토리얼 안내 (한 번만, 설정에서 끌 수 있음) */
export function hintOnce(id: string, done: () => void, force = false): void {
  const s = game.settings;
  if (!force && (s.seenTutorials.includes(id) || !s.tutorials)) { done(); return; }
  if (!s.seenTutorials.includes(id)) s.seenTutorials.push(id);
  game.applySettings();
  showHint(game.ui, game.input, id, done);
}

/** 컷신 실행기: 단계를 순서대로 실행하며 대화·전투·보상 등을 처리 */
export class ScriptRunner {
  private q: Step[];
  private dialog: DialogBox | null = null;
  done = false;
  constructor(steps: Step[] | string, private host: ScriptHost, private onDone: () => void = () => {}) {
    this.q = typeof steps === 'string' ? [...(SCRIPTS[steps] ?? [])] : [...steps];
  }
  start(): this {
    this.next();
    return this;
  }
  private closeDialog(): void {
    if (this.dialog) {
      game.ui.pop(this.dialog);
      this.dialog = null;
    }
  }
  private openDialog(): DialogBox {
    if (!this.dialog) {
      this.dialog = new DialogBox(game.settings.textSpeed);
      game.ui.push(this.dialog);
    }
    return this.dialog;
  }
  private finish(): void {
    this.closeDialog();
    this.done = true;
    this.onDone();
    this.host.onFinish?.();
  }
  next(): void {
    const s = this.q.shift();
    if (!s) { this.finish(); return; }
    const save = game.save!;
    const go = () => this.next();
    if ('say' in s) { this.openDialog().say(s.say, s.text, go); return; }
    if ('choice' in s) {
      const d = this.openDialog();
      d.choose(s.choice.map((c) => c[0]), (i) => { this.q.unshift(...s.choice[i][1]); go(); });
      return;
    }
    // 대화가 아닌 단계는 상자를 닫고 진행
    if (!('if' in s) && !('flag' in s)) this.closeDialog();
    if ('if' in s) { this.q.unshift(...(game.flag(s.if) ? s.then : s.else ?? [])); go(); return; }
    if ('flag' in s) { game.setFlag(s.flag, s.v ?? 1); go(); return; }
    if ('join' in s) { joinParty(save, s.join); audio.sfx('levelup'); toast(game.ui, `${L.menu.party} 합류`); go(); return; }
    if ('give' in s) { addItem(save, s.give[0], s.give[1]); audio.sfx('chest'); toast(game.ui, L.field.chestGot(itemLabel(s.give[0], s.give[1]))); go(); return; }
    if ('heal' in s) { fullHeal(save); go(); return; }
    if ('sfx' in s) { audio.sfx(s.sfx); go(); return; }
    if ('music' in s) { audio.music(s.music); go(); return; }
    if ('wait' in s) { setTimeout(go, s.wait); return; }
    if ('fade' in s) { go(); return; }
    if ('hint' in s) { hintOnce(s.hint, go); return; }
    if ('shop' in s) { openShop(go); return; }
    if ('battle' in s) { this.host.battle(s.battle, () => go()); return; }
    if ('removeEnt' in s) { this.host.removeEnt(s.removeEnt); go(); return; }
    if ('seal' in s) {
      addItem(save, s.seal, 1);
      game.setFlag(s.seal);
      if (!save.seals.includes(s.seal)) save.seals.push(s.seal);
      audio.sfx('seal');
      toast(game.ui, L.field.chestGot(itemLabel(s.seal)), 2600);
      setTimeout(go, 900);
      return;
    }
    if ('goto' in s) { this.finish(); game.fadeTo(() => game.goField(s.goto[0], s.goto[1])); return; }
    if ('ending' in s) { this.finish(); game.ending(); return; }
    go();
  }
}
