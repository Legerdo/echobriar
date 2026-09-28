/**
 * 절차 합성 음악 데이터. 멜로디는 음계 도수(0=으뜸음, 7=한 옥타브 위)로 기록한다.
 * '.' = 앞 음 유지, '-' = 쉼표, '|' = 마디 구분(무시). 한 칸 = 8분음표.
 */
export type TrackId = 'refuge' | 'field' | 'shrine' | 'battle' | 'guardian' | 'final' | 'ending';

export interface TrackDef {
  bpm: number;
  /** 으뜸음 MIDI 번호 (베이스 옥타브) */
  root: number;
  scale: number[];
  /** 마디별 화음 근음(음계 도수) */
  chords: number[];
  lead: string;
  leadWave: OscillatorType;
  bass: 'pulse' | 'walk' | 'drone' | 'drive';
  arp: 'none' | 'up' | 'broken' | 'fast';
  drums: 'none' | 'soft' | 'march' | 'battle' | 'boss';
  pad: boolean;
  /** 리드 음량 (0..1) */
  leadVol: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARM = [0, 2, 3, 5, 7, 8, 11];
const PHRYG = [0, 1, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const TRACKS: Record<TrackId, TrackDef> = {
  refuge: {
    bpm: 84, root: 45, scale: MINOR, chords: [0, 5, 2, 6, 0, 5, 3, 4],
    lead: '4 . 7 . 6 4 3 4 | 5 . 4 3 2 . . - | 2 . 4 . 3 2 1 2 | 3 . . . - - 1 . | 4 . 7 . 8 7 6 4 | 5 . 7 . 9 . 8 7 | 7 . 6 4 3 . 2 3 | 0 . . . - - - - |',
    leadWave: 'triangle', bass: 'pulse', arp: 'broken', drums: 'none', pad: true, leadVol: 0.5,
  },
  field: {
    bpm: 108, root: 40, scale: MINOR, chords: [0, 5, 2, 6, 0, 5, 3, 4],
    lead: '0 . 2 4 7 . 4 . | 5 . 4 2 4 . . - | 2 . 4 5 6 . 5 4 | 5 . 4 . 2 . 1 . | 0 . 2 4 7 . 9 . | 8 . 7 5 7 . . 4 | 5 . 4 2 1 . 2 . | 0 . . . - - - - |',
    leadWave: 'square', bass: 'walk', arp: 'up', drums: 'soft', pad: false, leadVol: 0.34,
  },
  shrine: {
    bpm: 70, root: 38, scale: PHRYG, chords: [0, 1, 0, 6, 0, 1, 3, 0],
    lead: '4 . . . 5 . 4 . | 1 . . . - - - - | 3 . 4 . 1 . 0 . | - - - - - - - - | 7 . . . 8 . 7 5 | 4 . . . - - 3 . | 4 . 1 . 3 . 0 . | 0 . . . - - - - |',
    leadWave: 'sine', bass: 'drone', arp: 'broken', drums: 'none', pad: true, leadVol: 0.55,
  },
  battle: {
    bpm: 148, root: 45, scale: HARM, chords: [0, 5, 3, 4, 0, 5, 3, 4],
    lead: '7 . 6 7 4 . 2 4 | 5 . 4 5 3 . 0 . | 3 4 5 . 7 . 5 3 | 4 . 6 . 7 . 8 . | 7 . 6 7 9 . 7 . | 8 . 7 8 5 . 3 . | 3 4 5 3 7 6 5 3 | 4 . . . 6 . . . |',
    leadWave: 'square', bass: 'drive', arp: 'fast', drums: 'battle', pad: false, leadVol: 0.3,
  },
  guardian: {
    bpm: 156, root: 38, scale: HARM, chords: [0, 5, 3, 4, 0, 5, 3, 4],
    lead: '0 . 4 . 7 . 6 . | 5 . 4 . 3 . 4 . | 5 . 3 . 7 . 5 . | 4 . . 6 . . 4 . | 0 . 4 . 7 . 9 . | 8 . 7 . 5 . 7 . | 8 7 5 3 7 5 3 1 | 4 . . . - . 4 . |',
    leadWave: 'sawtooth', bass: 'drive', arp: 'fast', drums: 'boss', pad: true, leadVol: 0.24,
  },
  final: {
    bpm: 164, root: 36, scale: HARM, chords: [0, 5, 3, 4, 0, 2, 5, 4],
    lead: '7 . 7 . 6 . 7 . | 8 . 7 . 5 . 3 . | 5 . 5 . 4 . 5 . | 6 . 4 . 3 . 1 . | 0 . 4 . 7 . 11 . | 10 . 9 . 8 . 7 . | 8 . 9 . 10 . 8 . | 11 . . . 7 . . . |',
    leadWave: 'sawtooth', bass: 'drive', arp: 'fast', drums: 'boss', pad: true, leadVol: 0.24,
  },
  ending: {
    bpm: 78, root: 38, scale: MAJOR, chords: [0, 4, 5, 3, 0, 4, 3, 4],
    lead: '2 . . 4 7 . . . | 6 . 4 . 2 . . - | 3 . . 2 1 . 2 . | 4 . . . - - - - | 2 . . 4 7 . 9 . | 8 . 7 . 6 . 4 . | 5 . 4 . 1 . 2 . | 0 . . . . . - - |',
    leadWave: 'triangle', bass: 'pulse', arp: 'broken', drums: 'none', pad: true, leadVol: 0.5,
  },
};

export type Step = { deg: number | null; hold: boolean };

export function parseLead(s: string): Step[] {
  const out: Step[] = [];
  for (const tok of s.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    if (tok === '.') out.push({ deg: null, hold: true });
    else if (tok === '-') out.push({ deg: null, hold: false });
    else out.push({ deg: parseInt(tok, 10), hold: false });
  }
  return out;
}

/** 음계 도수 → 반음 (옥타브 넘김 포함) */
export function degToSemi(scale: number[], deg: number): number {
  const n = scale.length;
  const o = Math.floor(deg / n);
  const d = ((deg % n) + n) % n;
  return scale[d] + o * 12;
}
