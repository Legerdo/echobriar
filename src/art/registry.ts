import type { ImageSpec, SheetSpec } from './core/sheet';
import { playerSheets } from './characters/index';
import { fieldSheets } from './characters/field';
import { houndSheet, flameSheet, sproutSheet, colossusSheet, shellSheet } from './enemies/beasts';
import { hollowSheet, callerSheet, wardenSheet, thornKnightSheet } from './enemies/humanoids';
import { stagSheet, choristerSheet, orbSheet, nestSheet } from './enemies/bosses';
import { tilesetImages } from './world/tiles';
import { propSheets } from './world/props';
import { backgroundImages } from './world/backgrounds';
import { effectSheets } from './world/effects';
import { uiImages, iconSheet, portraitSheet } from './world/ui';

export function enemySheets(): SheetSpec[] {
  return [
    houndSheet(), hollowSheet(), callerSheet(), flameSheet(), colossusSheet(), shellSheet(false), shellSheet(true), sproutSheet(),
    wardenSheet(), stagSheet('full'), stagSheet('broken'), stagSheet('open'), stagSheet('bare'), choristerSheet(), orbSheet(),
    thornKnightSheet(), nestSheet(false), nestSheet(true),
  ];
}

function idleAttach(s: SheetSpec, key: string): [number, number] | undefined {
  return s.anims.find((a) => a.name === 'idle')?.meta[0]?.attach?.[key];
}

/** 생성할 모든 아트 자산 목록 */
export function buildAll(): { sheets: SheetSpec[]; images: ImageSpec[] } {
  const players = playerSheets();
  const enemies = enemySheets();
  const byId = (id: string) => [...players, ...enemies].find((s) => s.id === id)!;
  const off = (s: SheetSpec, key: string, dx: number, dy: number): [number, number] => {
    const a = idleAttach(s, key) ?? [s.frameW / 2, s.frameH / 2];
    return [a[0] + dx, a[1] + dy];
  };
  const portraits = portraitSheet([
    ...players.map((s) => ({ id: s.id.replace('_battle', ''), sheet: s, at: off(s, 'head', 0, 1) })),
    { id: 'hound', sheet: byId('hound'), at: [16, 18] },
    { id: 'hollow', sheet: byId('hollow'), at: off(byId('hollow'), 'chest', 0, -15) },
    { id: 'caller', sheet: byId('caller'), at: off(byId('caller'), 'chest', 0, -14) },
    { id: 'glassflame', sheet: byId('glassflame'), at: [20, 17] },
    { id: 'colossus', sheet: byId('colossus'), at: [27, 32] },
    { id: 'shellbeast', sheet: byId('shellbeast'), at: [22, 45] },
    { id: 'sprout', sheet: byId('sprout'), at: [16, 19] },
    { id: 'warden', sheet: byId('warden'), at: off(byId('warden'), 'chest', 0, -30) },
    { id: 'stag', sheet: byId('stag'), at: off(byId('stag'), 'head', 4, -2) },
    { id: 'chorister', sheet: byId('chorister'), at: off(byId('chorister'), 'core', -2, -17) },
    { id: 'orb', sheet: byId('orb'), at: [12, 12] },
    { id: 'thornknight', sheet: byId('thornknight'), at: off(byId('thornknight'), 'chest', 0, -30) },
    { id: 'nest', sheet: byId('nest'), at: off(byId('nest'), 'head', 0, 0) },
    { id: 'frenzy', sheet: byId('frenzy'), at: off(byId('frenzy'), 'head', 0, 0) },
  ]);
  const sheets: SheetSpec[] = [...players, ...fieldSheets(), ...enemies, ...propSheets(), ...effectSheets(), iconSheet(), portraits];
  const images: ImageSpec[] = [...tilesetImages(), ...backgroundImages(), ...uiImages()];
  return { sheets, images };
}
