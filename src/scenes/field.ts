import { Scene, W, H } from '../core/engine';
import { game } from '../game';
import { MAPS, MapDef, Ent } from '../data/maps';
import { COL } from '../gfx/gfx';
import { AnimPlayer } from '../gfx/assets';
import { audio } from '../audio/audio';
import { hash2, clamp } from '../core/util';
import { TILE, solidGrid, entVisible, entCells, mapW, mapH } from '../world/collision';
import { ScriptRunner, hintOnce } from '../world/script';
import { addItem, itemLabel, fullHeal, Dir } from '../state/game';
import { L } from '../locale/ko';
import { LORE, SCRIPTS, objectiveFor } from '../data/story';
import { h, toast } from '../ui/dom';
import { openPause, openRest } from '../ui/menus';
import { RELICS } from '../data/items';
import type { BattleEndInfo } from './battle';

const PROP_SPRITE: Record<string, string> = { o: 'rock', '*': 'bush', P: 'pillar', p: 'pillar_broken', c: 'crystal', f: 'fence', h: 'house', w: 'well', l: 'lamp', t: 'tent', s: 'statue', m: 'mural' };
const DECOR: Record<string, number[]> = { hub: [0, 2], meadow: [0, 2, 3, 1], ruins: [1, 4, 0], glass: [5, 1], plateau: [1, 4], depths: [3, 5], shrine_ember: [5, 1], shrine_glass: [5], shrine_storm: [5, 3] };
const DIRV: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

interface FEnemy {
  e: Extract<Ent, { k: 'enemy' }>;
  x: number;
  y: number;
  hx: number;
  hy: number;
  facing: number;
  state: 'idle' | 'chase' | 'return';
  t: number;
  wx: number;
  wy: number;
  anim: AnimPlayer;
}

export class FieldScene implements Scene {
  readonly name = 'field';
  readonly map: MapDef;
  px: number;
  py: number;
  dir: Dir;
  private moving = false;
  private anim: AnimPlayer;
  private solid!: Uint8Array;
  private layers: HTMLCanvasElement[] = [];
  private camX = 0;
  private camY = 0;
  private t = 0;
  private enemies: FEnemy[] = [];
  private props: { x: number; y: number; sprite: string; anim: string }[] = [];
  script: ScriptRunner | null = null;
  private pendingScript: string | undefined;
  private graceUntil = 0;
  private banner = 0;
  private objEl: HTMLElement | null = null;
  private stepAcc = 0;
  private triggered = new Set<string>();
  private entAnims = new Map<string, AnimPlayer>();

  constructor(mapId: string, pos: [number, number], dir: Dir, script?: string) {
    this.map = MAPS[mapId];
    this.px = pos[0] * TILE + 8;
    this.py = pos[1] * TILE + 12;
    this.dir = dir;
    this.anim = new AnimPlayer(this.leaderSheet(), `idle_${dir}`);
    this.pendingScript = script;
    this.buildLayers();
    this.refresh();
    for (const e of this.map.ents) if (e.k === 'enemy') this.enemies.push({ e, x: e.x * TILE + 8, y: e.y * TILE + 12, hx: e.x * TILE + 8, hy: e.y * TILE + 12, facing: e.flip ? 1 : -1, state: 'idle', t: hash2(e.x, e.y) * 2000, wx: 0, wy: 0, anim: new AnimPlayer(e.sprite, 'idle') });
    this.map.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const sp = ch === 'T' ? this.map.tree : PROP_SPRITE[ch];
      if (sp) this.props.push({ x: x * TILE + 8, y: y * TILE + 15, sprite: sp, anim: 'idle' });
    }));
  }

  private leaderSheet(): string {
    const lead = game.save?.active[0] ?? 'kael';
    return `${lead}_field`;
  }

  enter(): void {
    audio.music(this.map.music);
    this.banner = 2600;
    this.anim.sheet = this.leaderSheet();
    this.objEl = h('div', { class: 'panel objective', role: 'status' });
    game.ui.root.append(this.objEl);
    this.updateObjective();
    const s = this.pendingScript ?? (!this.triggeredEnter ? this.map.enter : undefined);
    this.triggeredEnter = true;
    this.pendingScript = undefined;
    if (s && SCRIPTS[s]) this.run(s);
    game.ui.announce(this.map.name);
  }
  private triggeredEnter = false;
  private prevBusy = true;
  exit(): void {
    this.objEl?.remove();
    this.objEl = null;
  }

  updateObjective(): void {
    if (!this.objEl || !game.save) return;
    this.objEl.textContent = `${L.field.objective}: ${objectiveFor(game.save.flags)}`;
  }

  /** 플래그 변경 후 충돌 격자 갱신 */
  refresh(): void {
    this.solid = solidGrid(this.map, game.save?.flags ?? {});
    this.updateObjective();
  }

  storePosition(): void {
    if (!game.save) return;
    game.save.map = this.map.id;
    game.save.x = Math.floor(this.px / TILE);
    game.save.y = Math.floor((this.py - 4) / TILE);
    game.save.dir = this.dir;
  }

  /* ---------------- 정적 지형 미리 그리기 (듀얼 그리드) ---------------- */
  private buildLayers(): void {
    const m = this.map, w = mapW(m), hh = mapH(m);
    const ts = `tiles_${m.biome}`;
    const img = game.assets.images.get(ts)!;
    const cell = (x: number, y: number) => m.rows[clamp(y, 0, hh - 1)][clamp(x, 0, w - 1)];
    const isPath = (c: string) => c === '=';
    const isWater = (c: string) => c === '~' || c === 'b';
    const isCliff = (c: string) => c === '#';
    const decor = DECOR[m.biome] ?? [0];
    for (let f = 0; f < 2; f++) {
      const cv = document.createElement('canvas');
      cv.width = w * TILE;
      cv.height = hh * TILE;
      const c = cv.getContext('2d')!;
      c.imageSmoothingEnabled = false;
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        const ch = cell(x, y);
        const v = Math.floor(hash2(x, y, 3) * 4) + (ch === ',' ? 4 : 0);
        c.drawImage(img, v * TILE, 0, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
      const layer = (row: number, test: (c: string) => boolean) => {
        for (let vy = 0; vy <= hh; vy++) for (let vx = 0; vx <= w; vx++) {
          const mask = (test(cell(vx - 1, vy - 1)) ? 1 : 0) | (test(cell(vx, vy - 1)) ? 2 : 0) | (test(cell(vx - 1, vy)) ? 4 : 0) | (test(cell(vx, vy)) ? 8 : 0);
          if (!mask) continue;
          c.drawImage(img, mask * TILE, row * TILE, TILE, TILE, vx * TILE - 8, vy * TILE - 8, TILE, TILE);
        }
      };
      layer(1, isPath);
      layer(2 + f, isWater);
      layer(4, isCliff);
      // 장식 오버레이 (바닥 위 드문드문)
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        const ch = cell(x, y);
        if ((ch === '.' || ch === ',') && hash2(x, y, 17) < 0.07) {
          const d = decor[Math.floor(hash2(y, x, 5) * decor.length)];
          c.drawImage(img, d * TILE, 5 * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
        }
      }
      // 다리
      const bridge = game.assets.sheet('bridge');
      const bimg = game.assets.sheetImg.get('bridge')!;
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (cell(x, y) === 'b') c.drawImage(bimg, bridge.frames[0].x, bridge.frames[0].y, 16, 16, x * TILE, y * TILE, 16, 16);
      this.layers.push(cv);
    }
  }

  /* ---------------- 충돌 ---------------- */
  private solidAt(px: number, py: number): boolean {
    const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
    const w = mapW(this.map), hh = mapH(this.map);
    if (x < 0 || y < 0 || x >= w || y >= hh) return true;
    return this.solid[y * w + x] === 1;
  }
  private boxFree(x: number, y: number): boolean {
    // 발 기준 10×6 상자
    return !this.solidAt(x - 5, y - 5) && !this.solidAt(x + 4, y - 5) && !this.solidAt(x - 5, y) && !this.solidAt(x + 4, y);
  }
  private moveBody(o: { x: number; y: number }, dx: number, dy: number): void {
    if (dx && this.boxFree(o.x + dx, o.y)) o.x += dx;
    if (dy && this.boxFree(o.x, o.y + dy)) o.y += dy;
  }

  /* ---------------- 스크립트 ---------------- */
  run(id: string | import('../data/story').Step[], after?: () => void): void {
    if (this.script && !this.script.done) return;
    this.script = new ScriptRunner(id, {
      battle: (group, done) => this.startBattle(group, 'none', null, done),
      removeEnt: (eid) => { game.setFlag(`hide:${eid}`); this.refresh(); },
      onFinish: () => { this.refresh(); after?.(); },
    }).start();
  }
  get busy(): boolean {
    return (!!this.script && !this.script.done) || game.ui.blocking || game.fading;
  }

  startBattle(group: string, adv: 'none' | 'party' | 'enemy', ent: FEnemy | null, done?: (won: boolean) => void): void {
    this.storePosition();
    game.startBattle({
      group, advantage: adv,
      onEnd: (info: BattleEndInfo) => {
        if (info.result === 'victory') {
          if (ent) {
            game.setFlag(`def:${ent.e.id}`);
            this.enemies = this.enemies.filter((x) => x !== ent);
          }
          this.graceUntil = this.t + 1800;
          this.refresh();
          if (ent?.e.post) this.run(ent.e.post, () => done?.(true));
          else done?.(true);
        } else if (info.result === 'rest') {
          const s = game.save!;
          s.stats.defeats++;
          fullHeal(s);
          const r = s.rest ?? { map: 'hub', x: 16, y: 13 };
          game.goField(r.map, [r.x, r.y]);
        } else {
          // 도주·기타: 적을 잠시 밀어낸다
          if (ent) { ent.x = ent.hx; ent.y = ent.hy; ent.state = 'return'; }
          this.graceUntil = this.t + 2500;
        }
      },
    });
  }

  /* ---------------- 갱신 ---------------- */
  update(dt: number): void {
    this.t += dt;
    if (this.banner > 0) this.banner -= dt;
    for (const a of this.entAnims.values()) a.update(dt);
    const input = game.input;
    if (game.debug.panel) return;
    // 대화를 닫은 확인 입력이 같은 프레임에 다시 상호작용으로 쓰이지 않도록 직전 프레임 상태도 본다
    const busyNow = this.busy;
    const busy = busyNow || this.prevBusy;
    this.prevBusy = busyNow;
    // 이동
    let [ax, ay] = busy ? [0, 0] : input.axis();
    if (ax && ay) { ax *= 0.7071; ay *= 0.7071; }
    const run = input.down('run');
    const speed = (run ? 122 : 74) * (dt / 1000);
    this.moving = !!(ax || ay);
    if (this.moving) {
      if (Math.abs(ax) > Math.abs(ay)) this.dir = ax > 0 ? 'right' : 'left';
      else if (ay) this.dir = ay > 0 ? 'down' : 'up';
      const o = { x: this.px, y: this.py };
      this.moveBody(o, ax * speed, ay * speed);
      this.px = o.x;
      this.py = o.y;
      this.stepAcc += dt * (run ? 1.6 : 1);
      if (this.stepAcc > 280) { this.stepAcc = 0; audio.sfx('step'); }
    }
    const want = `${this.moving ? 'walk' : 'idle'}_${this.dir}`;
    if (this.anim.name !== want) { this.anim.play(want, run ? 1.5 : 1); }
    this.anim.rate = run && this.moving ? 1.5 : 1;
    this.anim.update(dt);
    this.updateCamera();
    if (busy) return;

    // 출구
    const cx = Math.floor(this.px / TILE), cy = Math.floor((this.py - 3) / TILE);
    const flags = game.save!.flags;
    for (const e of this.map.ents) {
      if (!entVisible(e, flags)) continue;
      if (e.k === 'exit' && cx >= e.x && cx < e.x + e.w && cy >= e.y && cy < e.y + e.h) {
        audio.sfx('door');
        this.storePosition();
        game.fadeTo(() => game.goField(e.to, e.spawn));
        return;
      }
      if (e.k === 'trigger' && !this.triggered.has(e.id) && cx >= e.x && cx < e.x + e.w && cy >= e.y && cy < e.y + e.h) {
        this.triggered.add(e.id);
        this.run(e.script);
        return;
      }
    }
    // 적
    this.updateEnemies(dt);
    if (this.busy) return;
    // 상호작용
    if (input.pressedFresh('confirm')) this.interact();
    else if (input.pressedFresh('menu')) {
      audio.sfx('select');
      openPause(this);
    }
  }

  private updateCamera(): void {
    const mw = mapW(this.map) * TILE, mh = mapH(this.map) * TILE;
    this.camX = Math.round(clamp(this.px - W / 2, 0, Math.max(0, mw - W)));
    this.camY = Math.round(clamp(this.py - H / 2 - 8, 0, Math.max(0, mh - H)));
    if (mw < W) this.camX = Math.round((mw - W) / 2);
    if (mh < H) this.camY = Math.round((mh - H) / 2);
  }

  private updateEnemies(dt: number): void {
    const flags = game.save!.flags;
    for (const f of this.enemies) {
      f.anim.update(dt);
      if (!entVisible(f.e, flags)) continue;
      const dx = this.px - f.x, dy = this.py - f.y;
      const dist = Math.hypot(dx, dy);
      const r = (f.e.radius ?? 4) * TILE;
      const noticing = r > 0 && !game.debug.noEncounter && this.t > this.graceUntil;
      const homeD = Math.hypot(f.x - f.hx, f.y - f.hy);
      if (f.state === 'idle' && noticing && dist < r + 24) f.state = 'chase';
      if (f.state === 'chase' && (homeD > r + 110 || !noticing)) f.state = 'return';
      if (f.state === 'return' && homeD < 4) f.state = 'idle';
      const sp = (f.e.sprite === 'f_hound' ? 84 : f.e.sprite === 'f_colossus' ? 50 : 64) * (dt / 1000);
      let mx = 0, my = 0;
      if (f.state === 'chase') { mx = (dx / (dist || 1)) * sp; my = (dy / (dist || 1)) * sp; }
      else if (f.state === 'return') { mx = ((f.hx - f.x) / (homeD || 1)) * sp * 0.7; my = ((f.hy - f.y) / (homeD || 1)) * sp * 0.7; }
      else if (r > 0) {
        f.t -= dt;
        if (f.t <= 0) {
          f.t = 1400 + hash2(Math.floor(this.t), f.e.x) * 1800;
          const a = hash2(f.e.y, Math.floor(this.t / 7)) * Math.PI * 2;
          f.wx = Math.cos(a) * 0.4; f.wy = Math.sin(a) * 0.4;
          if (homeD > 20) { f.wx = (f.hx - f.x) / homeD * 0.4; f.wy = (f.hy - f.y) / homeD * 0.4; }
        }
        if (f.t > 800) { mx = f.wx * sp; my = f.wy * sp; }
      }
      if (mx || my) {
        this.moveBody(f, mx, my);
        if (Math.abs(mx) > 0.05) f.facing = mx > 0 ? 1 : -1;
      }
      // 접촉
      const contact = f.e.boss ? Math.abs(dx) < 26 && dy > -30 && dy < 18 : dist < 14;
      if (contact && this.t > this.graceUntil) {
        let adv: 'none' | 'party' | 'enemy' = 'none';
        const behind = Math.sign(dx) !== f.facing && Math.sign(dx) !== 0;
        const [fx, fy] = DIRV[this.dir];
        const facingAway = fx * -dx + fy * -dy < 0;
        if (!f.e.boss) {
          if (f.state !== 'chase' && behind) adv = 'party';
          else if (f.state === 'chase' && facingAway) adv = 'enemy';
        }
        const go = () => this.startBattle(f.e.group, adv, f);
        if (f.e.pre) this.run(f.e.pre, go);
        else go();
        return;
      }
    }
  }

  /** 정면 칸의 엔티티와 상호작용 */
  private interact(): void {
    const [dx, dy] = DIRV[this.dir];
    const cx = Math.floor(this.px / TILE), cy = Math.floor((this.py - 3) / TILE);
    const tx = Math.floor((this.px + dx * 12) / TILE), ty = Math.floor((this.py - 3 + dy * 12) / TILE);
    const flags = game.save!.flags;
    const hit = (e: Ent, x: number, y: number) => {
      if (e.k === 'gate') return x >= e.x - 2 && x <= e.x + 1 && y >= e.y - 1 && y <= e.y + 1;
      return entCells(e, flags).some(([ex, ey]) => ex === x && ey === y) || (e.x === x && e.y === y);
    };
    const e = this.map.ents.find((e) => entVisible(e, flags) && !flags[`hide:${e.id}`] && (hit(e, tx, ty) || hit(e, cx, cy)) && ['npc', 'chest', 'rest', 'read', 'crack', 'gate', 'pedestal', 'thorn'].includes(e.k));
    if (!e) return;
    const s = game.save!;
    switch (e.k) {
      case 'npc': this.run(e.talk); break;
      case 'read': this.run(LORE[e.text].map((t) => ({ say: '', text: t }))); break;
      case 'chest': {
        if (flags[`chest:${e.id}`]) { toast(game.ui, L.field.chestEmpty); break; }
        game.setFlag(`chest:${e.id}`);
        audio.sfx('chest');
        const got = e.loot.map(([it, n]) => { addItem(s, it, n); return itemLabel(it, n); });
        toast(game.ui, L.field.chestGot(got.join(', ')), 2400);
        if (e.loot.some(([it]) => RELICS[it])) hintOnce('relic', () => {});
        break;
      }
      case 'rest': {
        s.rest = { map: this.map.id, x: e.x, y: e.y + 1 };
        if (!flags[`rest:${e.id}`]) { game.setFlag(`rest:${e.id}`); toast(game.ui, L.field.restLit); }
        audio.sfx('heal');
        openRest(this);
        break;
      }
      case 'crack': {
        if (s.roster.includes('orin')) {
          game.setFlag(`crack:${e.id}`);
          audio.sfx('break');
          toast(game.ui, L.field.crackedBreak, 2400);
          this.refresh();
        } else this.run('crack_need');
        break;
      }
      case 'gate': this.run('rootgate'); break;
      case 'pedestal': this.run([{ say: '', text: '봉인이 놓여 있던 받침대. 희미한 온기가 남아 있다.' }]); break;
      case 'thorn': this.run([{ say: '', text: L.field.sealedPath }]); break;
    }
  }

  /* ---------------- 렌더 ---------------- */
  render(): void {
    const g = game.gfx, c = g.ctx;
    g.clear(COL.ink);
    const layer = this.layers[Math.floor(this.t / 520) % 2];
    c.drawImage(layer, -this.camX, -this.camY);
    const flags = game.save!.flags;
    const ox = -this.camX, oy = -this.camY;
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    const vis = (x: number, y: number, m = 80) => x + ox > -m && x + ox < W + m && y + oy > -m && y + oy < H + m + 40;
    for (const p of this.props) if (vis(p.x, p.y)) list.push({ y: p.y, draw: () => g.animFrame(p.sprite, p.anim, 0, p.x + ox, p.y + oy) });
    for (const e of this.map.ents) {
      if (!entVisible(e, flags) || flags[`hide:${e.id}`]) continue;
      const x = e.x * TILE + 8, y = e.y * TILE + 15;
      if (!vis(x, y)) continue;
      const put = (sheet: string, anim: string, yy = y, flip = false) => list.push({ y: yy, draw: () => g.anim(this.entAnim(e.id, sheet, anim), x + ox, yy + oy, { flip }) });
      switch (e.k) {
        case 'npc': put(e.sprite, `idle_${e.dir ?? 'down'}`, y - 2); break;
        case 'chest': put('chest', flags[`chest:${e.id}`] ? 'open' : 'closed'); break;
        case 'rest': put('rest', flags[`rest:${e.id}`] ? 'on' : 'off'); break;
        case 'read': put(e.sprite === 'camp' ? 'camp' : e.sprite, e.sprite === 'camp' ? 'out' : 'idle'); break;
        case 'thorn': if (!flags[e.need]) put('thornwall', 'idle'); break;
        case 'crack': put('crackwall', flags[`crack:${e.id}`] ? 'broken' : 'intact'); break;
        case 'gate': put('rootgate', flags.gate_open ? 'open' : `seal${Math.min(3, game.save!.seals.length)}`); break;
        case 'pedestal': put('pedestal', 'glow'); break;
        case 'prop': put(e.sprite, e.anim ?? 'idle'); break;
      }
    }
    for (const f of this.enemies) {
      if (!entVisible(f.e, flags)) continue;
      if (!vis(f.x, f.y, 120)) continue;
      list.push({ y: f.y, draw: () => {
        g.rect(f.x + ox - 6, f.y + oy - 1, 12, 2, 'rgba(0,0,0,0.35)');
        g.anim(f.anim, f.x + ox, f.y + oy + 1, { flip: f.facing > 0 });
        if (f.state === 'chase') g.text('!', f.x + ox, f.y + oy - (f.e.boss ? 124 : 36), { color: COL.bad, align: 'center', size: 10, bold: true });
      } });
    }
    list.push({ y: this.py, draw: () => {
      g.rect(this.px + ox - 6, this.py + oy - 1, 12, 2, 'rgba(0,0,0,0.35)');
      g.anim(this.anim, this.px + ox, this.py + oy + 1);
    } });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    if (game.debug.showHit) this.drawDebug(ox, oy);
    // 상호작용 안내
    if (!this.busy) this.drawPrompt(ox, oy);
    // 지역 이름
    if (this.banner > 0) {
      const a = Math.min(1, this.banner / 600);
      const tw = g.measure(this.map.name, 12, true) + 30;
      g.panel(W / 2 - tw / 2, 26, tw, 24, false, a);
      g.text(this.map.name, W / 2, 31, { size: 12, bold: true, align: 'center', color: COL.gold, alpha: a });
    }
  }

  private entAnim(id: string, sheet: string, anim: string): AnimPlayer {
    let a = this.entAnims.get(id);
    if (!a) { a = new AnimPlayer(sheet, anim); this.entAnims.set(id, a); }
    if (a.name !== anim || a.sheet !== sheet) a.play(anim, 1, sheet);
    return a;
  }

  private drawPrompt(ox: number, oy: number): void {
    const [dx, dy] = DIRV[this.dir];
    const tx = Math.floor((this.px + dx * 12) / TILE), ty = Math.floor((this.py - 3 + dy * 12) / TILE);
    const flags = game.save!.flags;
    const e = this.map.ents.find((e) => entVisible(e, flags) && ['npc', 'chest', 'rest', 'read', 'crack', 'gate'].includes(e.k) && (e.k === 'gate' ? tx >= e.x - 2 && tx <= e.x + 1 && ty >= e.y - 1 && ty <= e.y + 1 : e.x === tx && e.y === ty));
    if (!e) return;
    const verb = e.k === 'npc' ? L.field.talk : e.k === 'chest' ? L.field.open : e.k === 'rest' ? L.field.rest : L.field.interact;
    const s = `[${game.input.label('confirm')}] ${verb}`;
    const x = e.x * TILE + 8 + ox, y = e.y * TILE + oy - (e.k === 'gate' ? 60 : 22);
    const w = game.gfx.measure(s, 8) + 12;
    game.gfx.rect(x - w / 2, y - 1, w, 12, COL.ink, 0.8);
    game.gfx.outline(x - w / 2, y - 1, w, 12, COL.brass);
    game.gfx.text(s, x, y + 1, { align: 'center', color: COL.gold });
  }

  private drawDebug(ox: number, oy: number): void {
    const w = mapW(this.map), hh = mapH(this.map);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (this.solid[y * w + x]) game.gfx.rect(x * TILE + ox, y * TILE + oy, TILE, TILE, '#ff0044', 0.25);
    game.gfx.outline(this.px + ox - 5, this.py + oy - 5, 10, 6, '#00ff88');
    for (const f of this.enemies) game.gfx.ring(f.x + ox, f.y + oy, (f.e.radius ?? 4) * TILE + 24, '#ffcc00', 0.6);
  }

  /** 디버그/봇: 필드 적과 조우 (조우 전후 대사 포함) */
  fightEnt(id: string): boolean {
    const f = this.enemies.find((x) => x.e.id === id);
    if (!f || !entVisible(f.e, game.save!.flags) || this.busy) return false;
    const go = () => this.startBattle(f.e.group, 'none', f);
    if (f.e.pre) this.run(f.e.pre, go);
    else go();
    return true;
  }
  /** 디버그/봇: 엔티티 옆으로 이동해 바라보고 상호작용 */
  interactEnt(id: string): boolean {
    const e = this.map.ents.find((x) => x.id === id);
    if (!e || this.busy) return false;
    const w = mapW(this.map);
    const baseY = e.k === 'gate' ? e.y + 1 : e.y;
    for (const [dx, dy, dir] of [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']] as [number, number, Dir][]) {
      const x = e.x + dx, y = baseY + dy;
      if (x < 0 || y < 0 || x >= w || y >= mapH(this.map) || this.solid[y * w + x]) continue;
      this.warp(x, y);
      this.dir = dir;
      this.interact();
      return true;
    }
    return false;
  }

  /** 디버그/봇: 순간 이동 */
  warp(tx: number, ty: number): void {
    this.px = tx * TILE + 8;
    this.py = ty * TILE + 12;
    this.updateCamera();
  }
  get enemyList(): FEnemy[] {
    return this.enemies;
  }
}
