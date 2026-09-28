/**
 * 숨김 디버그 기능 (F9 또는 ?debug=1). 일반 플레이에서는 보이지 않는다.
 * window.__eb 는 자동 플레이테스트가 사용하는 훅이다.
 */
import { game } from '../game';
import { h, Menu, Modal, toast } from '../ui/dom';
import { bot } from './bot';
import * as B from '../combat/battle';
import { CHAR_IDS, SKILLS, WEAPONS } from '../data/characters';
import { RELICS } from '../data/items';
import { MAPS } from '../data/maps';
import { deleteSave } from '../state/save';
import { addItem, equipRelic, joinParty, toggleEcho } from '../state/game';
import { BattleScene } from '../scenes/battle';
import { FieldScene } from '../scenes/field';
import { openSkills, openRelics, openEchoes, openWeapons, openParty } from '../ui/menus';
import type { CharId } from '../combat/types';

function battle(): BattleScene | null {
  return game.engine.scene instanceof BattleScene ? game.engine.scene : null;
}
function field(): FieldScene | null {
  return game.engine.scene instanceof FieldScene ? game.engine.scene : null;
}

export function openDebugPanel(): void {
  if (game.debug.panel) return;
  game.debug.panel = true;
  const d = game.debug;
  const menu = new Menu([], '디버그', () => close());
  const on = (b: boolean) => (b ? '켬' : '끔');
  const render = () => menu.setItems([
    { label: '무적', tag: on(d.invincible), onSelect: () => { d.invincible = !d.invincible; render(); } },
    { label: '행동력 +5 (전투)', onSelect: () => { const b = battle(); if (b) for (const a of B.liveAllies(b.st)) a.ap = Math.min(10, a.ap + 5); } },
    { label: '공명 충전', onSelect: () => { const b = battle(); if (b) b.st.resonance = 300; } },
    { label: '기술·유물·무기 전부 해금', onSelect: () => unlockAll() },
    { label: '은화 +1000', onSelect: () => { if (game.save) game.save.money += 1000; } },
    { label: '조우 건너뛰기', tag: on(d.noEncounter), onSelect: () => { d.noEncounter = !d.noEncounter; render(); } },
    { label: '충돌·약점 히트박스 표시', tag: on(d.showHit), onSelect: () => { d.showHit = !d.showHit; render(); } },
    { label: '반응 판정 창 표시', tag: on(d.showReact), onSelect: () => { d.showReact = !d.showReact; render(); } },
    ...['shrine_ember', 'shrine_glass', 'shrine_storm', 'depths'].map((m) => ({ label: `이동: ${MAPS[m].name} (보스 구역)`, onSelect: () => { close(); game.fadeTo(() => game.goField(m, Object.keys(MAPS[m].spawns)[0])); } })),
    { label: '저장 초기화', onSelect: () => { deleteSave(); toast(game.ui, '저장 초기화'); } },
    { label: '닫기', onSelect: () => close() },
  ]);
  const modal: Modal = { el: h('section', { class: 'panel', style: 'right:calc(var(--u)*4);top:calc(var(--u)*4);width:calc(var(--u)*170)', role: 'dialog', 'aria-label': '디버그' }, h('h3', { text: '디버그' }), menu.el), handle: (i) => menu.handle(i) };
  const close = () => { game.ui.pop(modal); game.debug.panel = false; };
  render();
  game.ui.push(modal);
}

function unlockAll(): void {
  const s = game.save;
  if (!s) return;
  for (const c of CHAR_IDS) {
    joinParty(s, c);
    for (const sk of Object.values(SKILLS)) if (sk.char === c && !sk.id.startsWith('r_') && !s.chars[c].learned.includes(sk.id)) s.chars[c].learned.push(sk.id);
  }
  for (const w of Object.keys(WEAPONS)) addItem(s, w);
  for (const r of Object.keys(RELICS)) addItem(s, r);
  s.items.crystal = (s.items.crystal ?? 0) + 5;
  s.items.fragment = (s.items.fragment ?? 0) + 5;
  toast(game.ui, '전부 해금');
}

export function installDebug(): void {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F9') { e.preventDefault(); openDebugPanel(); }
  });
  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
  const api = {
    errors,
    bot,
    state() {
      const s = game.save;
      const b = battle();
      const f = field();
      const top = game.ui.top();
      return {
        scene: game.engine.scene?.name ?? null,
        fading: game.fading,
        modal: top ? top.el.getAttribute('aria-label') ?? top.el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? 'modal' : null,
        modals: game.ui.stack.length,
        map: s?.map ?? null,
        pos: f ? [Math.floor(f.px / 16), Math.floor((f.py - 3) / 16)] : null,
        busy: f ? f.busy : null,
        flags: s ? { ...s.flags } : {},
        seals: s?.seals ?? [],
        bosses: s?.bosses ?? [],
        roster: s?.roster ?? [],
        active: s?.active ?? [],
        levels: s ? Object.fromEntries(s.roster.map((c) => [c, s.chars[c].level])) : {},
        money: s?.money ?? 0,
        stats: s?.stats ?? null,
        echoes: s?.echoesUnlocked ?? [],
        mastery: s?.relicMastery ?? {},
        ending: s?.ending ?? null,
        tutorials: [...game.settings.seenTutorials],
        items: s ? { ...s.items } : {},
        relics: s?.relicsOwned ?? [],
        battle: b ? {
          phase: b.phase, over: b.st.over, group: b.group.id, turns: b.st.turns, resonance: b.st.resonance,
          react: !!b.react, timing: b.timing?.kind ?? null, aim: !!b.aim,
          enemies: B.enemies(b.st).map((e) => ({ id: e.enemyId, hp: e.hp, max: e.maxHp, alive: e.alive, broken: e.brokenTurns > 0, ready: e.breakReady, phase: e.phase, parts: e.parts, charging: e.charging?.attack ?? null })),
          allies: B.allies(b.st).map((a) => ({ id: a.charId, hp: a.hp, max: a.maxHp, ap: a.ap, alive: a.alive })),
          stats: b.st.stats,
        } : null,
      };
    },
    newGame: (d: 'story' | 'normal' | 'expert' = 'normal') => game.newGame(d),
    cont: () => game.continueGame(),
    goto: (map: string, spawn: string) => { game.fadeTo(() => game.goField(map, spawn)); },
    warp: (x: number, y: number) => field()?.warp(x, y),
    fight: (id: string) => field()?.fightEnt(id) ?? false,
    interact: (id: string) => field()?.interactEnt(id) ?? false,
    setFlag: (k: string, v = 1) => game.setFlag(k, v),
    save: () => game.saveGame(),
    closeModals: () => { game.ui.clear(); game.debug.panel = false; },
    settings: (o: Partial<typeof game.settings>) => { Object.assign(game.settings, o); game.applySettings(); },
    debug: (o: Partial<typeof game.debug>) => Object.assign(game.debug, o),
    equipRelic: (c: CharId, slot: number, r: string | null) => game.save && equipRelic(game.save, c, slot, r),
    setActive: (list: CharId[]) => { if (game.save) game.save.active = list; },
    setHp: (v: number) => { if (game.save) for (const c of game.save.roster) game.save.chars[c].hp = v; },
    toggleEcho: (c: CharId, r: string) => (game.save ? toggleEcho(game.save, c, r) : null),
    openMenu: (k: 'skills' | 'relics' | 'echoes' | 'weapons' | 'party') => {
      const back = () => {};
      ({ skills: () => openSkills(back), relics: () => openRelics(back), echoes: () => openEchoes(back), weapons: () => openWeapons(back, false), party: () => openParty(back) })[k]();
    },
    panel: openDebugPanel,
  };
  (window as unknown as { __eb: typeof api }).__eb = api;
  if (new URLSearchParams(location.search).has('debug')) console.info('[에코브라이어] 디버그: F9');
}
