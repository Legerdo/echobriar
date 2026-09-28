import type { SheetSpec, FrameTag } from '../core/sheet';
import { buildPlayerSheet, AnimDef } from './players';
import { KAEL, KAEL_POSES } from './kael';
import { MIRA, MIRA_POSES } from './mira';
import { SERA, SERA_POSES } from './sera';
import { ORIN, ORIN_POSES } from './orin';
import type { Pose, Design } from './rig';
import type { Pt } from '../core/draw';

function dirOf(p: Pose): Pt {
  const a = ((p.wa ?? 0) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}
function along(p: Pose, len: number): Pt {
  const [dx, dy] = dirOf(p);
  return [p.hF[0] + dx * len, p.hF[1] + dy * len];
}

type Tags = Record<number, FrameTag>;
const T = (s: string): Tags => {
  // 'a a t c r r' 형태의 짧은 태그 문자열
  const map: Record<string, FrameTag> = { a: 'anticipation', h: 'hold', t: 'attack', c: 'contact', r: 'recovery', s: 'cast', H: 'hurt', b: 'break', A: 'air', l: 'land' };
  const out: Tags = {};
  s.split(' ').forEach((k, i) => { if (map[k]) out[i] = map[k]; });
  return out;
};

type PoseSet = Record<string, Pose[]>;

function standardDefs(P: PoseSet, t: {
  attack: [number[], string]; skill: [number[], string]; skill2: [number[], string]; counter: [number[], string];
}): Record<string, AnimDef> {
  return {
    idle: { poses: P.idle, ms: 170, loop: true },
    attack: { poses: P.attack, ms: t.attack[0], tags: T(t.attack[1]) },
    skill: { poses: P.skill, ms: t.skill[0], tags: T(t.skill[1]) },
    skill2: { poses: P.skill2, ms: t.skill2[0], tags: T(t.skill2[1]) },
    support: { poses: P.support, ms: [100, 120, 200, 90, 80], tags: T('s s c r r') },
    dodge: { poses: P.dodge, ms: [50, 90, 90, 70, 60] },
    parry: { poses: P.parry, ms: [40, 90, 70, 70], tags: T('- c - -') },
    counter: { poses: P.counter, ms: t.counter[0], tags: T(t.counter[1]) },
    jump: { poses: P.jump, ms: [60, 80, 120, 80, 70, 60], airborne: true, tags: T('- A A A l -') },
    hurt: { poses: P.hurt, ms: [90, 90, 90], tags: T('H H -') },
    stagger: { poses: P.stagger, ms: 180, loop: true, tags: T('b b b b') },
    victory: { poses: P.victory, ms: [100, 90, 300, 200, 400] },
    defeat: { poses: P.defeat, ms: [100, 120, 140, 140, 160, 400] },
    aim: { poses: P.aim, ms: 200, loop: true },
  };
}

export function playerSheets(): SheetSpec[] {
  const kael = buildPlayerSheet('kael_battle', KAEL, standardDefs(KAEL_POSES, {
    attack: [[90, 110, 50, 90, 80, 90, 80], 'a a t c r r r'],
    skill: [[120, 160, 60, 110, 110, 90, 80], 'a h t c r r r'],
    skill2: [[90, 70, 50, 70, 50, 80, 90], 'a c t c t c r'],
    counter: [[70, 50, 70, 70, 60, 90, 80, 80], 'a t c t c r r r'],
  }), (_d: Design, p: Pose) => ({ tip: along(p, 27.4) }));

  const mira = buildPlayerSheet('mira_battle', MIRA, standardDefs(MIRA_POSES, {
    attack: [[90, 120, 60, 100, 90, 90], 'a h t c r r'],
    skill: [[110, 180, 70, 120, 120, 90, 80], 'a h t c r r r'],
    skill2: [[90, 70, 60, 80, 90, 90], 'a c t c r r'],
    counter: [[70, 60, 80, 60, 80, 90, 80, 80], 'a t c t c r r r'],
  }), (_d, p) => ({ tip: along(p, 24) }));

  const sera = buildPlayerSheet('sera_battle', SERA, standardDefs(SERA_POSES, {
    attack: [[80, 110, 90, 90, 90, 80], 'a a h c r r'],
    skill: [[90, 90, 140, 140, 110, 90, 80], 'a a h h c r r'],
    skill2: [[70, 60, 70, 60, 70, 70, 90], 'a c a c a c r'],
    counter: [[60, 50, 90, 70, 80, 80, 80, 80], 'a t c a c r r r'],
  }), (_d, p) => ({ tip: along(p, 5) }));

  const orin = buildPlayerSheet('orin_battle', ORIN, standardDefs(ORIN_POSES, {
    attack: [[110, 150, 60, 110, 90, 90, 80], 'a h t c r r r'],
    skill: [[120, 200, 110, 100, 90, 80], 'a h c r r r'],
    skill2: [[110, 140, 60, 120, 100, 90, 80], 'a h t c r r r'],
    counter: [[80, 60, 70, 70, 70, 100, 90, 80], 'a t c t c r r r'],
  }), (_d, p) => {
    const [dx, dy] = dirOf(p);
    const c = along(p, 17);
    return { tip: c, muzzle: [c[0] - dy * 9, c[1] + dx * 9] as Pt };
  });

  return [kael, mira, sera, orin];
}
