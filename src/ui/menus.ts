import { h, Menu, MenuItem, Modal, iconImg, spriteURL, confirmModal, toast, fillKeys } from './dom';
import { game } from '../game';
import { L, pt } from '../locale/ko';
import { audio } from '../audio/audio';
import { CHARS, SKILLS, WEAPONS, charSkills } from '../data/characters';
import { RELICS, ITEMS, MONEY_NAME } from '../data/items';
import { DIFFICULTY, Difficulty, XP } from '../data/config';
import {
  charStats, insightCap, insightUsed, toggleSkill, learnWithCrystal, equipRelic, toggleEcho, upgradeCost, upgradeWeapon, fullHeal, STAT_KEYS, EQUIP_SLOTS,
} from '../state/game';
import { ACTIONS, DEFAULT_KEYS, findConflict, keyLabel, Action } from '../input/input';
import { CHATS, TUTORIALS, SCRIPTS } from '../data/story';
import { formatTime, deepClone } from '../core/util';
import { hintOnce } from '../world/script';
import { deleteSave } from '../state/save';
import type { FieldScene } from '../scenes/field';
import type { CharId } from '../combat/types';
import type { Input } from '../input/input';

const FULL = 'left:calc(var(--u)*8);top:calc(var(--u)*8);right:calc(var(--u)*8);bottom:calc(var(--u)*8);display:flex;flex-direction:column;';

/** 전체 화면 패널 모달 (탭 전환 지원) */
class ScreenModal implements Modal {
  el: HTMLElement;
  body: HTMLElement;
  menu: Menu;
  onLR: ((d: -1 | 1) => void) | null = null;
  constructor(title: string, private close: () => void, cls = '') {
    this.menu = new Menu([], title, () => this.close());
    this.body = h('div', { class: 'grow', style: 'display:flex;flex-direction:column;min-height:0' });
    this.el = h('div', { class: 'fullscreen' }, h('div', { class: 'dimmer' }), h('section', { class: `panel ${cls}`, style: FULL, role: 'dialog', 'aria-label': title }, h('h2', { text: title }), this.body));
  }
  handle(input: Input): void {
    const it = this.menu.current();
    if (this.onLR && !it?.onLeftRight) {
      if (input.pressed('left')) { this.onLR(-1); audio.sfx('move'); return; }
      if (input.pressed('right')) { this.onLR(1); audio.sfx('move'); return; }
    }
    this.menu.handle(input);
  }
}

function charTabs(roster: CharId[], cur: CharId): HTMLElement {
  return h('div', { class: 'tabs', role: 'tablist', 'aria-label': '동료' }, ...roster.map((c) => h('span', { class: `tab ${c === cur ? 'on' : ''}`, role: 'tab', 'aria-selected': c === cur ? 'true' : 'false' }, h('img', { class: 'icon s', src: spriteURL('portraits', c), alt: '' }), CHARS[c].name)), h('span', { class: 'small dim', text: '  ←/→ 동료 전환' }));
}

function twoCol(left: HTMLElement, right: HTMLElement): HTMLElement {
  return h('div', { class: 'two-col grow', style: 'min-height:0' }, h('div', { class: 'scroll', style: 'min-height:0' }, left), h('div', { class: 'scroll', style: 'min-height:0' }, right));
}

function footer(text: string): HTMLElement {
  return h('div', { class: 'footer-keys', text });
}

/* ============================================================ 일시정지 */

export function openPause(field: FieldScene): void {
  const ui = game.ui;
  const s = game.save!;
  const menu = new Menu([], L.menu.pause, () => close());
  const side = h('div', { class: 'col' });
  const modal: Modal = {
    el: h('div', { class: 'fullscreen' }, h('div', { class: 'dimmer' }),
      h('section', { class: 'panel', style: 'left:calc(var(--u)*8);top:calc(var(--u)*8);bottom:calc(var(--u)*8);width:calc(var(--u)*120*var(--ui))', role: 'dialog', 'aria-label': L.menu.pause }, h('h2', { text: L.menu.pause }), menu.el),
      h('section', { class: 'panel', style: 'left:calc(var(--u)*136*var(--ui));top:calc(var(--u)*8);right:calc(var(--u)*8);bottom:calc(var(--u)*8)', 'aria-label': '요약' }, side)),
    handle: (i) => menu.handle(i),
  };
  const close = () => { ui.pop(modal); field.refresh(); };
  const drawSide = () => {
    side.innerHTML = '';
    for (const c of s.roster) {
      const st = charStats(s, c), ch = s.chars[c];
      side.append(h('div', { class: 'row' },
        h('img', { class: 'icon', src: spriteURL('portraits', c), alt: '' }),
        h('div', { class: 'grow' },
          h('div', {}, h('b', { class: 'gold', text: CHARS[c].name }), ` ${L.menu.level} ${ch.level}  `, h('span', { class: 'small dim', text: s.active.includes(c) ? L.menu.active : L.menu.bench })),
          h('div', { class: 'small', text: `${L.menu.stats.hp} ${Math.min(ch.hp, st.hp)} / ${st.hp}` }))));
    }
    side.append(h('p', { class: 'small', text: `${L.menu.money} ${s.money}   ·   ${L.menu.playTime} ${formatTime(s.playTime)}   ·   ${L.menu.seals} ${s.seals.length}/3` }));
    side.append(h('p', { class: 'small dim', text: `${DIFFICULTY[s.difficulty].label} 난이도` }));
  };
  const sub = (f: (back: () => void) => void) => () => f(() => { drawSide(); });
  menu.setItems([
    { label: L.menu.party, icon: 'star', onSelect: sub(openParty) },
    { label: L.menu.skills, icon: 'book', onSelect: sub(openSkills) },
    { label: L.menu.weapons, icon: 'weapon', onSelect: sub((b) => openWeapons(b, false)) },
    { label: L.menu.relics, icon: 'relic', onSelect: sub(openRelics) },
    { label: L.menu.echoes, icon: 'echo', onSelect: sub(openEchoes) },
    { label: L.menu.items, icon: 'potion', onSelect: sub(openItems) },
    { sep: true, label: '' },
    { label: L.menu.help, icon: 'key', onSelect: () => openHelp() },
    { label: L.menu.settings, icon: 'insight', onSelect: () => openSettings(() => {}) },
    { label: L.menu.toTitle, onSelect: () => confirmModal(ui, L.menu.toTitleConfirm, () => { ui.clear(); game.toTitle(); }) },
    { label: L.menu.resume, onSelect: close },
  ]);
  drawSide();
  ui.push(modal);
}

/* ============================================================ 파티 */

export function openParty(back: () => void): void {
  const s = game.save!;
  let cur: CharId = s.roster[0];
  const m = new ScreenModal(L.menu.party, () => close());
  const close = () => {
    if (s.active.length === 0) { toast(game.ui, L.menu.needThree); return; }
    game.ui.pop(m);
    back();
  };
  const detail = h('div');
  const render = () => {
    m.menu.setItems(s.roster.map((c) => ({
      label: CHARS[c].name, iconSrc: spriteURL('portraits', c),
      tag: s.active.includes(c) ? `${L.menu.active} ${s.active.indexOf(c) + 1}` : L.menu.bench,
      onSelect: () => {
        if (s.active.includes(c)) {
          if (s.active.length <= 1) { audio.sfx('error'); return; }
          s.active = s.active.filter((x) => x !== c);
        } else if (s.active.length < 3) s.active.push(c);
        else { audio.sfx('error'); toast(game.ui, '전투 참가는 최대 3명 — 먼저 한 명을 대기로 돌리세요'); return; }
        render();
      },
    })));
  };
  m.menu.onChange = (_, i) => { cur = s.roster[i]; drawDetail(); };
  const drawDetail = () => {
    const c = s.chars[cur], d = CHARS[cur], st = charStats(s, cur);
    const w = WEAPONS[c.weapon];
    detail.innerHTML = '';
    detail.append(
      h('div', { class: 'row' }, h('img', { class: 'icon', src: spriteURL(d.field, 'idle_down'), alt: '', style: 'width:calc(var(--u)*24*var(--ui));height:calc(var(--u)*32*var(--ui))' }),
        h('div', {}, h('h3', { text: `${d.name} — ${d.title}` }), h('div', { class: 'small', text: `${L.menu.level} ${c.level}   ${L.menu.xp} ${c.xp} / ${XP.need(c.level)}` }))),
      h('dl', { class: 'kv' }, ...STAT_KEYS.flatMap((k) => [h('dt', { text: L.menu.stats[k] }), h('dd', { text: String(st[k]) })])),
      h('h3', { text: `고유 자원 — ${d.resource}` }), h('p', { class: 'desc', text: d.resourceDesc }),
      h('p', { class: 'small', text: `${L.menu.weapons}: ${w?.name ?? '-'}${s.weaponLv[c.weapon] ? ` +${s.weaponLv[c.weapon]}` : ''}` }),
      h('p', { class: 'small', text: `${L.menu.relics}: ${c.relics.map((r) => (r ? RELICS[r].name : '—')).join(' · ')}` }),
      h('p', { class: 'small', text: `${L.menu.echoes}: ${c.echoes.map((r) => RELICS[r].name).join(' · ') || '—'}  (${L.menu.insight} ${insightUsed(s, cur)}/${insightCap(s)})` }),
    );
  };
  m.body.append(twoCol(h('div', {}, h('p', { class: 'small dim', text: '확인: 전투 참가 ↔ 대기 전환 (최대 3명). 목록 순서가 전투 배치 순서입니다.' }), m.menu.el), detail), footer('확인: 참가/대기 · 취소: 닫기'));
  render();
  drawDetail();
  game.ui.push(m);
}

/* ============================================================ 기술 */

export function openSkills(back: () => void, start?: CharId): void {
  const s = game.save!;
  let ci = Math.max(0, s.roster.indexOf(start ?? s.roster[0]));
  const m = new ScreenModal(L.menu.skills, () => { game.ui.pop(m); back(); });
  const head = h('div');
  const desc = h('div');
  const render = () => {
    const cur = s.roster[ci], c = s.chars[cur];
    head.innerHTML = '';
    head.append(charTabs(s.roster, cur), h('div', { class: 'small', text: `장착 ${c.equipped.length} / ${EQUIP_SLOTS}   ·   잔향 결정 ${s.items.crystal ?? 0}개` }));
    const list = charSkills(cur);
    m.menu.setItems(list.map((sk) => {
      const learned = c.learned.includes(sk.id), eq = c.equipped.includes(sk.id);
      return {
        label: sk.name, icon: sk.timing ? `tm_${sk.timing.type}` : 'book',
        tag: learned ? `${eq ? '[장착 중] ' : ''}행동력 ${sk.ap}` : sk.learn.level ? L.menu.lvReq(sk.learn.level) : L.menu.crystalReq,
        disabled: !learned && !(sk.learn.crystal && (s.items.crystal ?? 0) > 0),
        onSelect: () => {
          if (!learned) {
            confirmModal(game.ui, `「${sk.name}」${pt(sk.name, '을', '를')} 잔향 결정 1개로 배울까요?`, () => {
              if (learnWithCrystal(s, cur, sk.id)) { audio.sfx('unlock'); toast(game.ui, L.battle.learned(CHARS[cur].name, sk.name)); }
              render();
            });
            return;
          }
          const r = toggleSkill(s, cur, sk.id);
          if (r === 'full') { audio.sfx('error'); toast(game.ui, L.menu.slotsFull); }
          render();
        },
      };
    }));
  };
  m.menu.onChange = (_, i) => {
    const sk = charSkills(s.roster[ci])[i];
    if (!sk) return;
    desc.innerHTML = '';
    const tm = sk.timing ? { tap: L.battle.timingTap, multi: L.battle.timingMulti, hold: L.battle.timingHold, rhythm: L.battle.timingRhythm }[sk.timing.type] : '타이밍 입력 없음';
    desc.append(h('h3', { text: sk.name }), h('p', { class: 'small gold', text: `${sk.role} · 행동력 ${sk.ap}${sk.breaker ? ' · 붕괴 가능' : ''}` }), h('p', { class: 'desc', text: sk.desc }), h('p', { class: 'small echo', text: `공격 타이밍: ${tm}` }));
  };
  m.onLR = (d) => { ci = (ci + d + s.roster.length) % s.roster.length; m.menu.index = 0; render(); };
  m.body.append(head, twoCol(m.menu.el, desc), footer('확인: 장착/해제 · 잠긴 기술: 잔향 결정으로 해금 · ←/→: 동료'));
  render();
  game.ui.push(m);
}

/* ============================================================ 무기 */

export function openWeapons(back: () => void, atRest: boolean): void {
  const s = game.save!;
  let ci = 0;
  const m = new ScreenModal(atRest ? L.menu.restUpgrade : L.menu.weapons, () => { game.ui.pop(m); back(); });
  const head = h('div');
  const desc = h('div');
  const render = () => {
    const cur = s.roster[ci], c = s.chars[cur];
    head.innerHTML = '';
    head.append(charTabs(s.roster, cur), h('div', { class: 'small', text: `뿌리 파편 ${s.items.fragment ?? 0}개 · ${MONEY_NAME} ${s.money}` }));
    const ws = Object.values(WEAPONS).filter((w) => w.char === cur);
    m.menu.setItems(ws.map((w) => {
      const owned = s.weaponsOwned.includes(w.id);
      const lv = s.weaponLv[w.id] ?? 0;
      return {
        label: owned ? `${w.name}${lv ? ` +${lv}` : ''}` : '??? (미발견)', icon: 'weapon', disabled: !owned,
        tag: c.weapon === w.id ? L.menu.equipped : '',
        onSelect: () => {
          if (atRest) {
            const cost = upgradeCost(s, w.id);
            if (!cost) { toast(game.ui, L.menu.upgradeMax); return; }
            confirmModal(game.ui, `${w.name} 강화 — ${L.menu.upgradeCost(cost.frag, cost.money)}`, () => {
              if (upgradeWeapon(s, w.id)) { audio.sfx('unlock'); toast(game.ui, `${w.name} +${s.weaponLv[w.id]}`); } else { audio.sfx('error'); toast(game.ui, L.menu.cantAfford); }
              render();
            });
            return;
          }
          c.weapon = w.id;
          render();
        },
      };
    }));
  };
  m.menu.onChange = (_, i) => {
    const w = Object.values(WEAPONS).filter((x) => x.char === s.roster[ci])[i];
    desc.innerHTML = '';
    if (!w) return;
    const owned = s.weaponsOwned.includes(w.id);
    const cost = upgradeCost(s, w.id);
    desc.append(h('h3', { text: owned ? w.name : '???' }), h('p', { class: 'desc', text: owned ? w.desc : '어딘가에서 찾을 수 있다.' }),
      h('p', { class: 'small', text: owned ? `공격력 +${w.atk + (s.weaponLv[w.id] ?? 0) * 3}  ·  강화 ${s.weaponLv[w.id] ?? 0}/3${cost ? `  ·  다음: ${L.menu.upgradeCost(cost.frag, cost.money)}` : ''}` : '' }));
  };
  m.onLR = (d) => { ci = (ci + d + s.roster.length) % s.roster.length; m.menu.index = 0; render(); };
  m.body.append(head, twoCol(m.menu.el, desc), footer(atRest ? '확인: 강화 · ←/→: 동료' : '확인: 장착 · 강화는 휴식 지점에서 · ←/→: 동료'));
  render();
  game.ui.push(m);
}

/* ============================================================ 유물 */

export function openRelics(back: () => void): void {
  const s = game.save!;
  let ci = 0;
  let slot: number | null = null;
  const m = new ScreenModal(L.menu.relics, () => {
    if (slot !== null) { slot = null; render(); return; }
    game.ui.pop(m);
    back();
  });
  const head = h('div');
  const desc = h('div');
  const owner = (r: string): CharId | null => (Object.keys(s.chars) as CharId[]).find((c) => s.chars[c].relics.includes(r)) ?? null;
  const relicDesc = (id: string) => {
    const r = RELICS[id];
    desc.innerHTML = '';
    if (!r) return;
    const mas = s.relicMastery[id] ?? 0;
    const done = s.echoesUnlocked.includes(id);
    desc.append(h('h3', { text: r.name }), h('p', { class: 'small dim', text: r.lore }),
      h('p', { class: 'small', text: `능력치: ${Object.entries(r.stats).map(([k, v]) => `${L.menu.stats[k]} +${v}`).join(', ')}` }),
      h('p', { class: 'desc', html: `<b>고유 효과</b> — ${r.passiveDesc}` }),
      h('p', { class: 'small', text: `${L.menu.mastery} ${done ? r.mastery : mas} / ${r.mastery}` }), h('div', { class: `bar ${done ? 'echo' : ''}` }, h('i', { style: `width:${Math.round(((done ? r.mastery : mas) / r.mastery) * 100)}%` })),
      h('p', { class: `small ${done ? 'echo' : 'dim'}`, text: done ? L.menu.mastered : '장착한 채 전투에서 승리하고, 효과가 발동할수록 숙련이 빨리 오른다.' }));
  };
  const render = () => {
    const cur = s.roster[ci], c = s.chars[cur];
    head.innerHTML = '';
    head.append(charTabs(s.roster, cur));
    if (slot === null) {
      m.menu.setItems([0, 1, 2].map((i) => ({
        label: `슬롯 ${i + 1}: ${c.relics[i] ? RELICS[c.relics[i]!].name : '(비어 있음)'}`, icon: 'relic',
        onSelect: () => { slot = i; m.menu.index = 0; render(); },
      })));
      m.menu.onChange = (_, i) => (c.relics[i] ? relicDesc(c.relics[i]!) : (desc.innerHTML = '<p class="dim small">슬롯을 골라 유물을 장착하세요.</p>'));
    } else {
      const items: MenuItem[] = [{ label: '(비우기)', onSelect: () => { equipRelic(s, cur, slot!, null); slot = null; render(); } }];
      for (const r of s.relicsOwned) {
        const o = owner(r);
        items.push({
          label: RELICS[r].name, icon: s.echoesUnlocked.includes(r) ? 'echo' : 'relic', tag: o ? CHARS[o].name : '',
          onSelect: () => { equipRelic(s, cur, slot!, r); slot = null; audio.sfx('select'); render(); },
        });
      }
      m.menu.setItems(items);
      m.menu.onChange = (_, i) => (i > 0 ? relicDesc(s.relicsOwned[i - 1]) : (desc.innerHTML = ''));
    }
    m.menu.focus(m.menu.index, false);
  };
  m.onLR = (d) => { ci = (ci + d + s.roster.length) % s.roster.length; slot = null; m.menu.index = 0; render(); };
  m.body.append(head, twoCol(m.menu.el, desc), footer('확인: 슬롯 선택 → 유물 장착 · 다른 동료가 쓰던 유물은 옮겨진다 · ←/→: 동료'));
  render();
  game.ui.push(m);
}

/* ============================================================ 메아리 */

export function openEchoes(back: () => void): void {
  const s = game.save!;
  let ci = 0;
  const m = new ScreenModal(L.menu.echoes, () => { game.ui.pop(m); back(); });
  const head = h('div');
  const desc = h('div');
  const render = () => {
    const cur = s.roster[ci], c = s.chars[cur];
    head.innerHTML = '';
    head.append(charTabs(s.roster, cur), h('div', { class: 'small echo', text: `${L.menu.insight} ${insightUsed(s, cur)} / ${insightCap(s)}` }));
    const list = s.relicsOwned;
    if (!list.length) { m.menu.setItems([{ label: '아직 유물이 없다', disabled: true }]); return; }
    m.menu.setItems(list.map((r) => {
      const un = s.echoesUnlocked.includes(r);
      const on = c.echoes.includes(r);
      return {
        label: RELICS[r].name, icon: un ? 'echo' : 'relic', disabled: !un,
        tag: un ? `${on ? '● ' : ''}통찰 ${RELICS[r].insight}` : `숙련 ${s.relicMastery[r] ?? 0}/${RELICS[r].mastery}`,
        onSelect: () => {
          const res = toggleEcho(s, cur, r);
          if (res === 'nocap') { audio.sfx('error'); toast(game.ui, '통찰력이 부족하다'); }
          render();
        },
      };
    }));
  };
  m.menu.onChange = (_, i) => {
    const r = RELICS[s.relicsOwned[i]];
    desc.innerHTML = '';
    if (!r) return;
    desc.append(h('h3', { text: `메아리 — ${r.name}` }), h('p', { class: 'desc', text: r.passiveDesc }), h('p', { class: 'small dim', text: '메아리는 유물을 벗어도 효과만 따로 장착한다. 통찰력 한도 안에서 여러 개를 쓸 수 있고, 수호자를 쓰러뜨리거나 통찰의 잎을 얻으면 한도가 는다.' }));
  };
  m.onLR = (d) => { ci = (ci + d + s.roster.length) % s.roster.length; m.menu.index = 0; render(); };
  m.body.append(head, twoCol(m.menu.el, desc), footer('확인: 메아리 장착/해제 · ←/→: 동료'));
  render();
  game.ui.push(m);
}

/* ============================================================ 소지품 */

export function openItems(back: () => void): void {
  const s = game.save!;
  const m = new ScreenModal(L.menu.items, () => { game.ui.pop(m); back(); });
  const desc = h('div');
  const render = () => {
    const ids = Object.keys(s.items).filter((k) => (s.items[k] ?? 0) > 0 && ITEMS[k]);
    if (!ids.length) { m.menu.setItems([{ label: '비어 있다', disabled: true }]); return; }
    m.menu.setItems(ids.map((id) => {
      const it = ITEMS[id];
      return {
        label: it.name, icon: it.icon, tag: `×${s.items[id]}`, disabled: !it.field,
        onSelect: () => useFieldItem(id, render),
      };
    }));
    m.menu.onChange = (_, i) => { const it = ITEMS[ids[i]]; desc.innerHTML = ''; desc.append(h('h3', { text: it.name }), h('p', { class: 'desc', text: it.desc })); };
    m.menu.focus(m.menu.index, false);
  };
  m.body.append(twoCol(m.menu.el, desc), footer(`확인: 사용 (필드에서 쓸 수 있는 것만) · ${MONEY_NAME} ${s.money}`));
  render();
  game.ui.push(m);
}

function useFieldItem(id: string, after: () => void): void {
  const s = game.save!;
  const it = ITEMS[id];
  const menu = new Menu([], '대상');
  const modal: Modal = { el: h('section', { class: 'panel hi', style: 'left:50%;top:50%;transform:translate(-50%,-50%);width:calc(var(--u)*160*var(--ui))', role: 'dialog', 'aria-label': '대상 선택' }, h('h3', { text: `${it.name} — 대상` }), menu.el), handle: (i) => menu.handle(i) };
  const apply = (c: CharId | null) => {
    const e = it.effect!;
    const targets = c ? [c] : s.roster;
    for (const t of targets) {
      const mx = charStats(s, t).hp;
      if (e.heal) s.chars[t].hp = Math.min(mx, s.chars[t].hp + Math.round(mx * e.heal));
      if (e.healAll) s.chars[t].hp = Math.min(mx, s.chars[t].hp + Math.round(mx * e.healAll));
      if (e.revive) s.chars[t].hp = Math.max(s.chars[t].hp, Math.round(mx * e.revive));
    }
    s.items[id]--;
    audio.sfx('heal');
    game.ui.pop(modal);
    after();
  };
  if (it.effect?.healAll) { apply(null); return; }
  menu.setItems(s.roster.map((c) => ({ label: CHARS[c].name, tag: `${s.chars[c].hp}/${charStats(s, c).hp}`, onSelect: () => apply(c) })));
  menu.onCancel = () => game.ui.pop(modal);
  game.ui.push(modal);
}

/* ============================================================ 휴식 지점 */

export function openRest(field: FieldScene): void {
  const s = game.save!;
  const menu = new Menu([], L.menu.restMenu, () => close());
  const modal: Modal = {
    el: h('section', { class: 'panel hi', style: 'left:calc(var(--u)*8);top:calc(var(--u)*30);width:calc(var(--u)*150*var(--ui))', role: 'dialog', 'aria-label': L.menu.restMenu }, h('h2', { text: L.menu.restMenu }), menu.el),
    handle: (i) => menu.handle(i),
  };
  const close = () => { game.ui.pop(modal); field.refresh(); };
  fullHeal(s);
  menu.setItems([
    { label: L.menu.restHeal, icon: 'heart', onSelect: () => { fullHeal(s); audio.sfx('heal'); toast(game.ui, L.menu.healed); } },
    { label: L.menu.restSave, icon: 'book', onSelect: () => game.saveGame() },
    { label: L.menu.restSwap, icon: 'star', onSelect: () => openParty(() => {}) },
    { label: L.menu.skills, icon: 'book', onSelect: () => openSkills(() => {}) },
    { label: L.menu.weapons, icon: 'weapon', onSelect: () => openWeapons(() => {}, false) },
    { label: L.menu.restUpgrade, icon: 'fragment', onSelect: () => openWeapons(() => {}, true) },
    { label: L.menu.relics, icon: 'relic', onSelect: () => openRelics(() => {}) },
    { label: L.menu.echoes, icon: 'echo', onSelect: () => openEchoes(() => {}) },
    { label: L.menu.restTalk, icon: 'heart', onSelect: () => { game.ui.pop(modal); companionTalk(field); } },
    { label: L.menu.restTutorial, icon: 'key', onSelect: () => openTutorialList() },
    { label: L.menu.restLeave, onSelect: close },
  ]);
  toast(game.ui, L.menu.healed);
  game.ui.push(modal);
}

function companionTalk(field: FieldScene): void {
  const f = game.save!.flags;
  const pool = CHATS.filter((c) => (!c.need || f[c.need]) && (!c.not || !f[c.not]));
  const chat = pool[pool.length - 1] ?? CHATS[0];
  const roster = game.save!.roster;
  field.run(chat.lines.filter(([who]) => roster.includes(who as CharId)).map(([say, text]) => ({ say, text })));
}

/* ============================================================ 상점 */

export function openShop(done: () => void): void {
  const s = game.save!;
  const stock = ['potion', 'dew', 'seed', 'sap', 'leaf_haste'];
  const m = new ScreenModal(L.menu.shop, () => { game.ui.pop(m); done(); });
  const info = h('div');
  const render = () => {
    m.menu.setItems(stock.map((id) => {
      const it = ITEMS[id];
      return {
        label: it.name, icon: it.icon, tag: `${it.price} ${MONEY_NAME} · ${L.menu.owned} ${s.items[id] ?? 0}`, disabled: s.money < (it.price ?? 0),
        onSelect: () => { s.money -= it.price!; s.items[id] = (s.items[id] ?? 0) + 1; audio.sfx('chest'); render(); },
      };
    }));
    m.menu.onChange = (_, i) => { const it = ITEMS[stock[i]]; info.innerHTML = ''; info.append(h('h3', { text: it.name }), h('p', { class: 'desc', text: it.desc }), h('p', { class: 'small gold', text: `${L.menu.money} ${s.money}` })); };
    m.menu.focus(m.menu.index, false);
  };
  m.body.append(twoCol(m.menu.el, info), footer('확인: 구입 · 취소: 나가기'));
  render();
  game.ui.push(m);
}

/* ============================================================ 설정 */

export function openSettings(back: () => void, fromTitle = false): void {
  const st = game.settings;
  const m = new ScreenModal(L.settings.title, () => { game.applySettings(); game.ui.pop(m); back(); });
  const desc = h('p', { class: 'desc' });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const step = (v: number, d: number) => Math.max(0, Math.min(1, Math.round((v + d * 0.1) * 10) / 10));
  const speeds: typeof st.textSpeed[] = ['slow', 'normal', 'fast', 'instant'];
  const diffs: Difficulty[] = ['story', 'normal', 'expert'];
  const render = () => {
    const items: MenuItem[] = [];
    if (game.save) {
      const d = game.save.difficulty;
      items.push({ label: L.settings.difficulty, tag: `◀ ${DIFFICULTY[d].label} ▶`, desc: DIFFICULTY[d].desc, onLeftRight: (k) => { game.save!.difficulty = diffs[(diffs.indexOf(d) + k + 3) % 3]; render(); }, onSelect: () => { game.save!.difficulty = diffs[(diffs.indexOf(d) + 1) % 3]; render(); } });
    }
    const vol = (label: string, key: 'volMaster' | 'volMusic' | 'volSfx') => items.push({ label, tag: `◀ ${pct(st[key])} ▶`, onLeftRight: (k) => { st[key] = step(st[key], k); game.applySettings(); render(); } });
    vol(L.settings.master, 'volMaster');
    vol(L.settings.music, 'volMusic');
    vol(L.settings.sfx, 'volSfx');
    items.push(
      { label: L.settings.shake, tag: `◀ ${pct(st.shake)} ▶`, onLeftRight: (k) => { st.shake = step(st.shake, k * 2.5); render(); } },
      { label: L.settings.flash, tag: `◀ ${pct(st.flash)} ▶`, onLeftRight: (k) => { st.flash = step(st.flash, k * 2.5); render(); } },
      { label: L.settings.textSpeed, tag: `◀ ${L.settings.speeds[st.textSpeed]} ▶`, onLeftRight: (k) => { st.textSpeed = speeds[(speeds.indexOf(st.textSpeed) + k + 4) % 4]; render(); } },
      { label: L.settings.uiScale, tag: `◀ ${st.uiScale}× ▶`, onLeftRight: (k) => { const v = [1, 1.25, 1.5]; st.uiScale = v[(v.indexOf(st.uiScale) + k + 3) % 3]; game.applySettings(); render(); } },
      { label: L.settings.reactAssist, tag: st.reactionAssist ? L.settings.on : L.settings.off, desc: L.settings.reactAssistDesc, onSelect: () => { st.reactionAssist = !st.reactionAssist; render(); }, onLeftRight: () => { st.reactionAssist = !st.reactionAssist; render(); } },
      { label: L.settings.autoTiming, tag: st.autoTiming ? L.settings.on : L.settings.off, desc: L.settings.autoTimingDesc, onSelect: () => { st.autoTiming = !st.autoTiming; render(); }, onLeftRight: () => { st.autoTiming = !st.autoTiming; render(); } },
      { label: L.settings.tutorials, tag: st.tutorials ? L.settings.on : L.settings.off, onSelect: () => { st.tutorials = !st.tutorials; render(); }, onLeftRight: () => { st.tutorials = !st.tutorials; render(); } },
      { label: L.settings.keys, icon: 'key', onSelect: () => openKeys() },
    );
    if (fromTitle) items.push({ label: L.settings.resetSave, onSelect: () => confirmModal(game.ui, '저장 데이터를 모두 지울까요? 되돌릴 수 없습니다.', () => { deleteSave(); toast(game.ui, '저장을 초기화했습니다'); }) });
    items.push({ label: L.back, onSelect: () => { game.applySettings(); game.ui.pop(m); back(); } });
    m.menu.setItems(items);
    game.applySettings();
  };
  m.menu.onChange = (it) => (desc.textContent = it.desc ?? '◀ ▶ 로 값을 바꿀 수 있습니다.');
  m.body.append(h('div', { class: 'scroll grow', style: 'min-height:0' }, m.menu.el), desc, footer('↑↓: 선택 · ←→: 값 변경 · 확인: 전환 · 취소: 닫기'));
  render();
  game.ui.push(m);
}

function openKeys(): void {
  const st = game.settings;
  const m = new ScreenModal(L.settings.keys, () => { game.applySettings(); game.ui.pop(m); });
  const status = h('p', { class: 'small echo', role: 'status' });
  const render = () => {
    m.menu.setItems([
      ...ACTIONS.map((a): MenuItem => ({
        label: L.settings.actions[a], tag: st.keys[a].map(keyLabel).join(' / '),
        onSelect: () => {
          status.textContent = L.settings.pressKey;
          game.input.captureNext((code) => {
            if (code === 'Escape') { status.textContent = ''; return; }
            const conflict = findConflict(st.keys, a, code);
            if (conflict) {
              // 서로 바꾸기
              st.keys[conflict] = st.keys[conflict].map((k) => (k === code ? st.keys[a][0] : k)).filter(Boolean);
              status.textContent = L.settings.conflict(L.settings.actions[conflict]);
            } else status.textContent = '';
            st.keys[a] = [code, ...st.keys[a].filter((k) => k !== code)].slice(0, 2);
            game.applySettings();
            render();
          });
        },
      })),
      { sep: true, label: '' },
      { label: L.settings.resetKeys, onSelect: () => { st.keys = deepClone(DEFAULT_KEYS); game.applySettings(); render(); } },
      { label: L.back, onSelect: () => { game.applySettings(); game.ui.pop(m); } },
    ]);
  };
  m.body.append(h('div', { class: 'scroll grow', style: 'min-height:0' }, m.menu.el), status, footer('확인: 새 키 지정 (첫 번째 키가 바뀌고 기존 키는 보조로 남음) · 게임패드 배치는 고정'));
  render();
  game.ui.push(m);
}

/* ============================================================ 도움말 */

export function openHelp(): void {
  const m = new ScreenModal(L.menu.help, () => game.ui.pop(m));
  const body = h('div', { class: 'col' },
    h('h3', { text: '조작' }),
    h('dl', { class: 'kv' }, ...L.controls.flatMap(([a, k]) => [h('dt', { text: a }), h('dd', { text: k })])),
    h('h3', { text: '전투의 핵심' }),
    h('p', { class: 'desc', text: '행동력(AP)은 동료마다 따로 쌓인다. 기본 공격과 완벽 패링이 행동력을 만들고, 기술이 행동력을 쓴다.\n적 턴에는 직접 방어한다: 회피(넓고 안전, 보상 적음) · 패링(좁고 위험, 행동력과 반격) · 점프(지면 공격 전용).\n공격 타이밍·반격·약점·붕괴가 파티 공명을 채운다.' }),
  );
  m.menu.setItems([{ label: '튜토리얼 다시 보기', icon: 'key', onSelect: () => openTutorialList() }, { label: L.close, onSelect: () => game.ui.pop(m) }]);
  m.body.append(h('div', { class: 'scroll grow', style: 'min-height:0' }, body), m.menu.el);
  game.ui.push(m);
}

export function openTutorialList(): void {
  const m = new ScreenModal(L.menu.restTutorial, () => game.ui.pop(m));
  const desc = h('p', { class: 'desc' });
  const ids = Object.keys(TUTORIALS);
  m.menu.setItems(ids.map((id) => ({ label: TUTORIALS[id].title, onSelect: () => hintOnce(id, () => {}, true) })));
  m.menu.onChange = (_, i) => (desc.textContent = fillKeys(TUTORIALS[ids[i]].body, game.input));
  m.body.append(twoCol(m.menu.el, desc));
  m.menu.focus(0, false);
  game.ui.push(m);
}

export { SCRIPTS };
