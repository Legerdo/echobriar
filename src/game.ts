/**
 * 게임 전역 컨텍스트: 엔진·자원·입력·UI·설정·저장과 씬 전환.
 */
import { Engine, Scene, W, H } from './core/engine';
import { Assets } from './gfx/assets';
import { Gfx } from './gfx/gfx';
import { Input } from './input/input';
import { UI, bindAssets, toast } from './ui/dom';
import { audio } from './audio/audio';
import { loadSettings, saveSettings, Settings, writeSave, readSave } from './state/save';
import { newGame, SaveData } from './state/game';
import type { Difficulty } from './data/config';
import { L } from './locale/ko';
import { TitleScene } from './scenes/title';
import { FieldScene } from './scenes/field';
import { BattleScene, BattleEndInfo } from './scenes/battle';
import { EndingScene } from './scenes/ending';
import { GROUPS } from './data/enemies';
import { MAPS } from './data/maps';
import type { Bot } from './debug/bot';

export interface BattleRequest {
  group: string;
  advantage: 'none' | 'party' | 'enemy';
  onEnd: (info: BattleEndInfo) => void;
}

export class Game {
  readonly engine: Engine;
  readonly assets = new Assets();
  gfx!: Gfx;
  readonly input: Input;
  readonly ui: UI;
  settings: Settings;
  save: SaveData | null = null;
  field: FieldScene | null = null;
  debug = { invincible: false, showHit: false, showReact: false, noEncounter: false, panel: false, speed: 1 };
  bot: Bot | null = null;
  private fade = 0;
  private fadeDir = 0;
  private fadeThen: (() => void) | null = null;
  private fadeColor = '#07060a';
  timeScale = 1;

  constructor() {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const stage = document.getElementById('stage')!;
    this.engine = new Engine(canvas, stage);
    this.settings = loadSettings();
    this.input = new Input((x, y) => this.engine.toLogical(x, y), this.settings.keys);
    this.ui = new UI(document.getElementById('ui')!, document.getElementById('sr-live')!);
    this.input.onFirstInteract(() => audio.unlock());
  }

  async boot(): Promise<void> {
    const boot = document.getElementById('boot')!;
    await this.assets.load((d, t) => (boot.textContent = `${L.loading} ${Math.round((d / t) * 100)}%`));
    boot.remove();
    this.gfx = new Gfx(this.engine.ctx, this.assets);
    bindAssets(this.assets);
    // CSS 변수 속 url()은 사용하는 스타일시트 기준으로 풀리므로 절대 주소로 넣는다
    const root = document.documentElement.style;
    const abs = (p: string) => `url("${new URL(this.assets.base + p, document.baseURI).href}")`;
    root.setProperty('--frame', abs('images/ui_frame.png'));
    root.setProperty('--frame-hi', abs('images/ui_frame_hi.png'));
    root.setProperty('--cursor', abs('images/ui_cursor.png'));
    this.applySettings();
    this.toTitle(false);
    this.engine.start((dt) => this.frame(dt));
  }

  private frame(dt: number): void {
    this.bot?.frame();
    this.input.beginFrame();
    this.ui.update(this.input);
    audio.update();
    const sc = this.engine.scene;
    if (sc) {
      sc.update(dt * this.timeScale);
      sc.render();
    }
    // 페이드
    if (this.fadeDir !== 0) {
      this.fade += this.fadeDir * dt * 0.0045;
      if (this.fadeDir > 0 && this.fade >= 1) {
        this.fade = 1;
        this.fadeDir = 0;
        const f = this.fadeThen;
        this.fadeThen = null;
        f?.();
        if (this.fadeDir === 0) this.fadeDir = -1;
      } else if (this.fadeDir < 0 && this.fade <= 0) {
        this.fade = 0;
        this.fadeDir = 0;
      }
    }
    if (this.fade > 0) {
      const c = this.engine.ctx;
      c.globalAlpha = Math.min(1, this.fade);
      c.fillStyle = this.fadeColor;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
    if (this.save && this.engine.scene && this.engine.scene.name !== 'title') this.save.playTime += dt;
    this.input.endFrame();
  }

  get fading(): boolean {
    return this.fadeDir !== 0 || this.fade > 0.001;
  }
  /** 화면을 어둡게 한 뒤 then 실행, 다시 밝힘 */
  fadeTo(then: () => void, color = '#07060a'): void {
    this.fadeColor = color;
    this.fadeThen = then;
    this.fadeDir = 1;
  }
  setScene(s: Scene): void {
    this.engine.setScene(s);
  }

  applySettings(): void {
    const s = this.settings;
    this.input.setKeys(s.keys);
    audio.setVolumes(s.volMaster, s.volMusic, s.volSfx);
    document.documentElement.style.setProperty('--ui', String(s.uiScale));
    saveSettings(s);
  }

  flag(k: string): number {
    return this.save?.flags[k] ?? 0;
  }
  setFlag(k: string, v = 1): void {
    if (this.save) this.save.flags[k] = v;
  }

  saveGame(): boolean {
    if (!this.save) return false;
    if (this.field) this.field.storePosition();
    const ok = writeSave(this.save);
    toast(this.ui, ok ? L.field.saved : '저장하지 못했습니다 (저장 공간을 확인하세요)');
    return ok;
  }

  newGame(diff: Difficulty): void {
    this.save = newGame(diff);
    const [x, y] = MAPS.hub.spawns.start;
    this.save.x = x;
    this.save.y = y;
    this.save.rest = { map: 'hub', x: 20, y: 11 };
    this.fadeTo(() => {
      this.ui.clear();
      this.goField('hub', null, 'intro');
    });
  }

  continueGame(): boolean {
    const { data } = readSave();
    if (!data) return false;
    this.save = data;
    this.fadeTo(() => {
      this.ui.clear();
      this.goField(data.map, [data.x, data.y]);
    });
    return true;
  }

  toTitle(fade = true): void {
    const go = () => {
      this.ui.clear();
      this.field = null;
      this.save = null;
      this.setScene(new TitleScene());
    };
    if (fade) this.fadeTo(go);
    else go();
  }

  /** 필드로 이동 (spawn 이름 또는 타일 좌표) */
  goField(map: string, at: string | [number, number] | null, script?: string): void {
    if (!this.save) return;
    const m = MAPS[map] ?? MAPS.hub;
    let pos: [number, number];
    let dir = this.save.dir;
    if (typeof at === 'string') {
      const sp = m.spawns[at] ?? Object.values(m.spawns)[0];
      pos = [sp[0], sp[1]];
      dir = sp[2];
    } else if (at) pos = at;
    else pos = [this.save.x, this.save.y];
    this.save.map = m.id;
    this.save.x = pos[0];
    this.save.y = pos[1];
    this.save.dir = dir;
    if (!this.save.discovered.includes(m.id)) this.save.discovered.push(m.id);
    for (const t of this.ui.root.querySelectorAll('.toast')) t.remove();
    this.field = new FieldScene(m.id, pos, dir, script);
    this.setScene(this.field);
  }

  startBattle(req: BattleRequest): void {
    if (!this.save) return;
    const group = GROUPS[req.group];
    audio.sfx('encounter');
    this.fadeTo(() => {
      for (const t of this.ui.root.querySelectorAll('.toast')) t.remove();
      this.setScene(new BattleScene(group, req.advantage, (info) => {
        this.fadeTo(() => {
          if (this.field) this.setScene(this.field);
          req.onEnd(info);
        });
      }));
    }, '#f4f0e8');
  }

  ending(): void {
    this.fadeTo(() => {
      this.ui.clear();
      this.setScene(new EndingScene());
    });
  }
}

export let game: Game;
export function createGame(): Game {
  game = new Game();
  return game;
}
