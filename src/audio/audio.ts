import { TRACKS, TrackId, parseLead, degToSemi, Step } from './music';

/**
 * WebAudio 절차 합성: 음악 7곡과 효과음. 외부 오디오 파일 없음.
 * 브라우저 자동 재생 제한 → 첫 입력 시 unlock().
 */
export type Sfx =
  | 'move' | 'select' | 'cancel' | 'error' | 'slash' | 'heavy' | 'magic' | 'fire' | 'tide' | 'storm' | 'shot' | 'hit' | 'hurt'
  | 'perfect' | 'good' | 'miss' | 'dodge' | 'parry' | 'jump' | 'land' | 'counter' | 'break' | 'weak' | 'heal' | 'shield'
  | 'tellNormal' | 'tellGround' | 'tellUnblock' | 'bossTell' | 'victory' | 'defeat' | 'levelup' | 'chest' | 'step' | 'door'
  | 'resonance' | 'charge' | 'mark' | 'unlock' | 'encounter' | 'whiff' | 'beat' | 'aimZoom' | 'seal';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  vol = { master: 0.8, music: 0.6, sfx: 0.8 };
  private track: TrackId | null = null;
  private wanted: TrackId | null = null;
  private trackGain: GainNode | null = null;
  private lead: Step[] = [];
  private step = 0;
  private nextTime = 0;
  private lastLeadFreq = 0;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    this.applyVolumes();
    if (this.wanted) {
      const w = this.wanted;
      this.wanted = null;
      this.track = null;
      this.music(w);
    }
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }
  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.musicBus.gain.value = this.vol.music * 0.42;
    this.sfxBus.gain.value = this.vol.sfx * 0.7;
  }

  /* ---------- 음악 ---------- */
  music(id: TrackId | null): void {
    if (!this.ctx) {
      this.wanted = id;
      return;
    }
    if (id === this.track) return;
    const t = this.ctx.currentTime;
    if (this.trackGain) {
      const g = this.trackGain;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.5);
      setTimeout(() => g.disconnect(), 700);
    }
    this.track = id;
    this.trackGain = null;
    if (!id) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(1, t + 0.6);
    g.connect(this.musicBus);
    this.trackGain = g;
    this.lead = parseLead(TRACKS[id].lead);
    this.step = 0;
    this.nextTime = t + 0.08;
  }
  get currentTrack(): TrackId | null {
    return this.track;
  }

  /** 매 프레임 호출: 앞으로 0.2초 분량 예약 */
  update(): void {
    if (!this.ctx || !this.track || !this.trackGain) return;
    const def = TRACKS[this.track];
    const s16 = 60 / def.bpm / 4;
    const horizon = this.ctx.currentTime + 0.2;
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < horizon) {
      this.schedule(def, this.step, this.nextTime, s16);
      this.nextTime += s16;
      this.step = (this.step + 1) % (this.lead.length * 2);
    }
  }

  private schedule(def: (typeof TRACKS)[TrackId], i: number, t: number, s16: number): void {
    const out = this.trackGain!;
    const j = i % 16;
    const bar = Math.floor(i / 16) % def.chords.length;
    const cr = def.chords[bar];
    const chordSemi = (k: number) => degToSemi(def.scale, cr + k);
    const R = def.root;
    // 리드 (8분음표 격자)
    if (i % 2 === 0) {
      const li = i / 2;
      const st = this.lead[li];
      if (st && st.deg !== null) {
        let len = 1;
        while (this.lead[(li + len) % this.lead.length]?.hold && len < 8) len++;
        const f = mtof(R + 24 + degToSemi(def.scale, st.deg));
        this.voice(out, f, t, len * s16 * 2 * 0.92, def.leadWave, def.leadVol * 0.22, 0.012, 0.25, true);
        this.lastLeadFreq = f;
      }
    }
    // 베이스
    const bassNote = (semi: number, dur: number, v = 0.3) => this.voice(out, mtof(R + semi), t, dur, 'triangle', v, 0.01, 0.6);
    switch (def.bass) {
      case 'pulse': if (j % 8 === 0) bassNote(chordSemi(0), s16 * 7); break;
      case 'walk': if (j % 4 === 0) bassNote([chordSemi(0), chordSemi(4), chordSemi(0) + 12, chordSemi(4)][j / 4], s16 * 3.5); break;
      case 'drone': if (j === 0) bassNote(chordSemi(0), s16 * 15, 0.26); break;
      case 'drive': if (j % 2 === 0) bassNote(chordSemi(0) + (j % 8 === 6 ? 12 : 0), s16 * 1.6, 0.26); break;
    }
    // 아르페지오
    const arpNote = (k: number, v: number) => this.voice(out, mtof(R + 12 + chordSemi(k)), t, s16 * 1.4, 'square', v, 0.004, 0.5);
    switch (def.arp) {
      case 'up': if (j % 2 === 0) arpNote([0, 2, 4, 7][(j / 2) % 4], 0.045); break;
      case 'broken': if (j % 4 === 0) arpNote([0, 4, 2, 4][(j / 4) % 4] + 7, 0.05); break;
      case 'fast': arpNote([0, 2, 4, 2][j % 4] + 7, 0.03); break;
    }
    // 패드
    if (def.pad && j === 0) {
      for (const k of [0, 2, 4]) this.pad(out, mtof(R + 12 + chordSemi(k)), t, s16 * 16);
    }
    // 타악
    const kick = () => this.kick(out, t);
    const snare = (v = 0.18) => this.noiseHit(out, t, 0.12, v, 'bandpass', 1800);
    const hat = (v = 0.05) => this.noiseHit(out, t, 0.03, v, 'highpass', 7000);
    switch (def.drums) {
      case 'soft': if (j % 8 === 0) kick(); if (j % 4 === 2) hat(0.035); break;
      case 'march': if (j % 8 === 0) kick(); if (j === 4 || j === 12) snare(); if (j % 2 === 0) hat(); break;
      case 'battle': if (j === 0 || j === 6 || j === 8) kick(); if (j === 4 || j === 12) snare(); if (j % 2 === 0) hat(); break;
      case 'boss': if (j === 0 || j === 3 || j === 8 || j === 10) kick(); if (j === 4 || j === 12) snare(0.22); hat(j % 2 ? 0.025 : 0.05); break;
    }
  }

  private voice(out: AudioNode, f: number, t: number, dur: number, type: OscillatorType, vol: number, atk: number, rel: number, vib = false): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = type === 'sawtooth' ? 2400 : type === 'square' ? 3200 : 6000;
    o.type = type;
    o.frequency.value = f;
    if (vib && dur > 0.3) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 5.2;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(dur, 0.5));
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + rel);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, t + Math.max(atk, dur - 0.02));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur + rel * 0.5);
    o.connect(flt);
    flt.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + rel);
  }
  private pad(out: AudioNode, f: number, t: number, dur: number): void {
    const c = this.ctx!;
    const g = c.createGain();
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0, t + dur + 0.3);
    for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.4);
    }
    flt.connect(g);
    g.connect(out);
  }
  private kick(out: AudioNode, t: number, vol = 0.5): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }
  private noiseHit(out: AudioNode, t: number, dur: number, vol: number, ft: BiquadFilterType, freq: number, sweepTo?: number): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = ft;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }
  private blip(f: number, dur: number, type: OscillatorType, vol: number, t0 = 0, slide?: number): void {
    const c = this.ctx!;
    const t = c.currentTime + t0;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private nz(dur: number, vol: number, ft: BiquadFilterType, freq: number, t0 = 0, sweep?: number): void {
    this.noiseHit(this.sfxBus, this.ctx!.currentTime + t0, dur, vol, ft, freq, sweep);
  }

  /* ---------- 효과음 ---------- */
  sfx(name: Sfx): void {
    if (!this.ctx || this.vol.sfx <= 0) return;
    switch (name) {
      case 'move': this.blip(660, 0.05, 'square', 0.08); break;
      case 'select': this.blip(880, 0.06, 'square', 0.1); this.blip(1320, 0.08, 'square', 0.08, 0.05); break;
      case 'cancel': this.blip(520, 0.08, 'square', 0.09, 0, 330); break;
      case 'error': this.blip(180, 0.16, 'square', 0.12); break;
      case 'slash': this.nz(0.14, 0.4, 'bandpass', 2600, 0, 900); this.blip(300, 0.08, 'sawtooth', 0.08, 0, 120); break;
      case 'heavy': this.nz(0.26, 0.55, 'lowpass', 1400, 0, 200); this.kick(this.sfxBus, this.ctx.currentTime, 0.7); break;
      case 'magic': this.blip(520, 0.3, 'sine', 0.18, 0, 1040); this.blip(780, 0.3, 'triangle', 0.1, 0.05, 1560); break;
      case 'fire': this.nz(0.4, 0.45, 'lowpass', 900, 0, 3000); this.blip(160, 0.3, 'sawtooth', 0.12, 0, 80); break;
      case 'tide': this.nz(0.5, 0.35, 'bandpass', 500, 0, 1800); this.blip(300, 0.4, 'sine', 0.14, 0, 180); break;
      case 'storm': this.nz(0.08, 0.6, 'highpass', 3000); this.blip(1800, 0.2, 'sawtooth', 0.12, 0.02, 200); this.nz(0.4, 0.3, 'lowpass', 400, 0.05); break;
      case 'shot': this.nz(0.1, 0.6, 'bandpass', 1200, 0, 300); this.kick(this.sfxBus, this.ctx.currentTime, 0.4); break;
      case 'hit': this.nz(0.09, 0.5, 'lowpass', 2200); this.blip(180, 0.08, 'square', 0.14, 0, 90); break;
      case 'hurt': this.blip(260, 0.18, 'sawtooth', 0.18, 0, 90); this.nz(0.1, 0.3, 'lowpass', 1000); break;
      case 'perfect': this.blip(1318, 0.09, 'square', 0.12); this.blip(1760, 0.14, 'square', 0.12, 0.06); this.blip(2637, 0.2, 'sine', 0.1, 0.1); break;
      case 'good': this.blip(988, 0.08, 'square', 0.11); this.blip(1318, 0.1, 'square', 0.08, 0.05); break;
      case 'miss': this.blip(330, 0.12, 'triangle', 0.12, 0, 220); break;
      case 'whiff': this.nz(0.08, 0.15, 'highpass', 2500); break;
      case 'dodge': this.nz(0.2, 0.35, 'bandpass', 1400, 0, 4000); break;
      case 'parry': this.blip(2093, 0.25, 'square', 0.16); this.blip(3136, 0.3, 'sine', 0.14, 0.01); this.nz(0.06, 0.5, 'highpass', 5000); break;
      case 'jump': this.blip(300, 0.16, 'square', 0.12, 0, 700); break;
      case 'land': this.kick(this.sfxBus, this.ctx.currentTime, 0.35); break;
      case 'counter': this.blip(1568, 0.1, 'square', 0.14); this.nz(0.3, 0.6, 'bandpass', 3000, 0.04, 500); this.kick(this.sfxBus, this.ctx.currentTime + 0.05, 0.8); break;
      case 'break': this.nz(0.7, 0.7, 'lowpass', 3000, 0, 120); this.blip(90, 0.6, 'sawtooth', 0.2, 0, 40); this.blip(1200, 0.4, 'square', 0.08, 0.05, 300); break;
      case 'weak': this.blip(2349, 0.12, 'square', 0.13); this.nz(0.12, 0.45, 'bandpass', 3500); break;
      case 'heal': [0, 4, 7, 12].forEach((s, i) => this.blip(mtof(76 + s), 0.25, 'sine', 0.1, i * 0.06)); break;
      case 'shield': this.blip(440, 0.4, 'triangle', 0.14, 0, 880); this.blip(660, 0.4, 'sine', 0.1, 0.05, 1320); break;
      case 'tellNormal': this.blip(740, 0.07, 'square', 0.12); this.blip(740, 0.07, 'square', 0.1, 0.1); break;
      case 'tellGround': this.blip(110, 0.35, 'sawtooth', 0.22, 0, 70); this.nz(0.35, 0.3, 'lowpass', 300); break;
      case 'tellUnblock': this.blip(1480, 0.28, 'sawtooth', 0.12, 0, 1976); this.blip(1480, 0.28, 'square', 0.06, 0.02, 1976); break;
      case 'bossTell': this.blip(98, 0.8, 'sawtooth', 0.22, 0, 65); this.blip(147, 0.8, 'sawtooth', 0.14); break;
      case 'victory': [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.blip(mtof(72 + s), i === 6 ? 0.6 : 0.14, 'square', 0.12, i * 0.12)); break;
      case 'defeat': [0, -2, -5, -9].forEach((s, i) => this.blip(mtof(64 + s), 0.4, 'triangle', 0.16, i * 0.28)); break;
      case 'levelup': [0, 4, 7, 11, 12].forEach((s, i) => this.blip(mtof(79 + s), 0.12, 'square', 0.1, i * 0.07)); break;
      case 'chest': [0, 7, 12].forEach((s, i) => this.blip(mtof(72 + s), 0.14, 'triangle', 0.14, i * 0.08)); break;
      case 'step': this.nz(0.03, 0.06, 'lowpass', 600); break;
      case 'door': this.nz(0.5, 0.3, 'lowpass', 500, 0, 150); break;
      case 'resonance': [0, 7, 12, 19, 24].forEach((s, i) => this.blip(mtof(64 + s), 0.5, 'sine', 0.12, i * 0.05)); this.nz(0.8, 0.3, 'bandpass', 800, 0, 4000); break;
      case 'charge': this.blip(220, 0.3, 'square', 0.1, 0, 660); break;
      case 'mark': this.blip(1760, 0.08, 'triangle', 0.12); this.blip(1320, 0.1, 'triangle', 0.1, 0.06); break;
      case 'unlock': [0, 5, 9, 12, 17].forEach((s, i) => this.blip(mtof(72 + s), 0.2, 'triangle', 0.12, i * 0.09)); break;
      case 'encounter': this.blip(880, 0.08, 'square', 0.14); this.blip(660, 0.08, 'square', 0.14, 0.08); this.blip(990, 0.25, 'square', 0.14, 0.16); break;
      case 'beat': this.blip(1200, 0.04, 'square', 0.07); break;
      case 'aimZoom': this.blip(400, 0.2, 'sine', 0.1, 0, 1200); break;
      case 'seal': [0, 7, 12, 16, 19, 24].forEach((s, i) => this.blip(mtof(60 + s), 0.7, 'sine', 0.1, i * 0.12)); break;
    }
  }
}

export const audio = new AudioSys();
