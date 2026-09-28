import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ENEMIES, GROUPS } from '../src/data/enemies';
import { SKILLS, CHARS, CHAR_IDS, WEAPONS, charSkills } from '../src/data/characters';
import { RELICS, ITEMS } from '../src/data/items';
import { planAttack } from '../src/combat/hits';
import { SCRIPTS, TUTORIALS } from '../src/data/story';
import type { Manifest } from '../src/art/core/sheet';

const MF = join(__dirname, '..', 'public', 'generated', 'manifest.json');
const manifest: Manifest | null = existsSync(MF) ? JSON.parse(readFileSync(MF, 'utf8')) : null;

describe('콘텐츠 수량', () => {
  it('캐릭터 4명, 각 기술 8개 이상·무기 2개 이상, 유물 12개 이상, 적 아키타입 6개 이상', () => {
    expect(CHAR_IDS.length).toBe(4);
    for (const c of CHAR_IDS) {
      expect(charSkills(c).length).toBeGreaterThanOrEqual(8);
      expect(Object.values(WEAPONS).filter((w) => w.char === c).length).toBeGreaterThanOrEqual(2);
    }
    expect(Object.keys(RELICS).length).toBeGreaterThanOrEqual(12);
    const archetypes = new Set(Object.values(ENEMIES).filter((e) => e.size !== 'boss' && !['sprout', 'orb'].includes(e.id)).map((e) => e.sheet));
    expect(archetypes.size).toBeGreaterThanOrEqual(6);
  });
  it('모든 적은 공격 2개 이상 (소환체 제외)', () => {
    for (const e of Object.values(ENEMIES)) if (!['sprout', 'orb'].includes(e.id)) expect(e.attacks.length, e.id).toBeGreaterThanOrEqual(2);
  });
});

describe.skipIf(!manifest)('아트 ↔ 전투 데이터 일치', () => {
  it('적 공격의 모든 구간 애니메이션이 존재하고, 피해 공격은 타격이 있다 (보통·숙련)', () => {
    for (const e of Object.values(ENEMIES)) {
      const sheet = manifest!.sheets[e.sheet];
      expect(sheet, e.sheet).toBeTruthy();
      for (const a of e.attacks) for (const expert of [false, true]) {
        const plan = planAttack(a, sheet.anims, expert);
        if (a.power > 0) expect(plan.hits.length, `${e.id}.${a.id}`).toBeGreaterThan(0);
        for (let i = 1; i < plan.hits.length; i++) expect(plan.hits[i].t, `${e.id}.${a.id} 타격 순서`).toBeGreaterThan(plan.hits[i - 1].t);
      }
      for (const alt of Object.values(e.partSheets ?? {})) expect(manifest!.sheets[alt], alt).toBeTruthy();
    }
  });
  it('약점 데이터와 스프라이트 약점 좌표가 대응한다', () => {
    for (const e of Object.values(ENEMIES)) {
      const ids = new Set<string>();
      for (const sid of [e.sheet, ...Object.values(e.partSheets ?? {})]) for (const an of Object.values(manifest!.sheets[sid].anims)) for (const w of an.weak) for (const p of w ?? []) ids.add(p.id);
      for (const id of ids) expect(e.weak[id], `${e.id}: 스프라이트 약점 '${id}'에 효과 없음`).toBeTruthy();
    }
  });
  it('기술 애니메이션이 있고 타이밍 기술은 contact 프레임을 가진다', () => {
    for (const s of Object.values(SKILLS)) {
      const sheet = manifest!.sheets[CHARS[s.char].sheet];
      const an = sheet.anims[s.anim];
      expect(an, `${s.id}.${s.anim}`).toBeTruthy();
      if (s.timing && s.timing.type !== 'rhythm') expect(an.tags.includes('contact'), s.id).toBe(true);
      if (s.timing?.type === 'hold') expect(an.tags.includes('hold') || an.tags.includes('anticipation'), s.id).toBe(true);
    }
  });
  it('전투 그룹 배경·보스 시트가 존재', () => {
    for (const g of Object.values(GROUPS)) {
      expect(manifest!.images[g.bg], g.bg).toBeTruthy();
      for (const id of g.enemies) expect(ENEMIES[id], id).toBeTruthy();
      for (const [it] of g.loot ?? []) expect(ITEMS[it] || RELICS[it], it).toBeTruthy();
    }
  });
});

describe('스크립트', () => {
  it('안내 단계와 참조가 유효하다', () => {
    const walk = (steps: unknown[]): void => {
      for (const s of steps as Record<string, unknown>[]) {
        if ('hint' in s) expect(TUTORIALS[s.hint as string], String(s.hint)).toBeTruthy();
        if ('give' in s) expect(ITEMS[(s.give as string[])[0]] || RELICS[(s.give as string[])[0]]).toBeTruthy();
        if ('if' in s) { walk(s.then as unknown[]); walk((s.else as unknown[]) ?? []); }
        if ('choice' in s) for (const [, sub] of s.choice as [string, unknown[]][]) walk(sub);
      }
    };
    for (const steps of Object.values(SCRIPTS)) walk(steps);
  });
});
