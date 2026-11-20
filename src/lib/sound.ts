// All sounds and music are synthesized here at runtime: original tones written for Lumen,
// in four styles loosely inspired by the feel of different consoles. No recorded assets are shipped.
import type { MusicId, SoundStyle } from '../../shared/types';

export type SoundEvent = 'move' | 'select' | 'back' | 'launch' | 'notify' | 'error' | 'open' | 'power' | 'intro' | 'outro';
interface Tone { f: number; at?: number; d: number; type?: OscillatorType; g?: number; to?: number; attack?: number }

// Big Screen start-up and shut-down chimes: the same gentle rising / falling figure in every style.
const INTRO: Tone[] = [
  { f: 196, d: 1.6, g: 0.07, attack: 0.25 }, { f: 392, at: 0.15, d: 0.9, g: 0.1, attack: 0.04 }, { f: 587, at: 0.45, d: 0.9, g: 0.1, attack: 0.04 },
  { f: 784, at: 0.75, d: 1.2, g: 0.11, attack: 0.04 }, { f: 1175, at: 1.05, d: 1.6, g: 0.07, attack: 0.05 }
];
const OUTRO: Tone[] = [
  { f: 784, d: 0.5, g: 0.1, attack: 0.03 }, { f: 587, at: 0.2, d: 0.6, g: 0.1, attack: 0.03 }, { f: 392, at: 0.42, d: 1.1, g: 0.1, attack: 0.03 }, { f: 196, at: 0.42, d: 1.3, g: 0.06, attack: 0.2 }
];

const PACKS: Record<SoundStyle, Record<Exclude<SoundEvent, 'intro' | 'outro'>, Tone[]>> = {
  // Soft glassy bells.
  lumen: {
    move: [{ f: 880, d: 0.05, g: 0.05 }],
    select: [{ f: 880, d: 0.12, g: 0.2 }, { f: 1320, at: 0.05, d: 0.16, g: 0.14 }],
    back: [{ f: 990, d: 0.08, g: 0.16, to: 660 }],
    open: [{ f: 660, d: 0.18, g: 0.14 }, { f: 990, at: 0.06, d: 0.22, g: 0.1 }],
    launch: [{ f: 523, d: 0.5, g: 0.18 }, { f: 784, at: 0.08, d: 0.5, g: 0.14 }, { f: 1047, at: 0.16, d: 0.7, g: 0.12 }],
    notify: [{ f: 1175, d: 0.2, g: 0.14 }, { f: 1568, at: 0.1, d: 0.3, g: 0.1 }],
    error: [{ f: 330, d: 0.18, type: 'triangle', g: 0.2 }, { f: 262, at: 0.12, d: 0.24, type: 'triangle', g: 0.2 }],
    power: [{ f: 392, d: 0.3, g: 0.16 }, { f: 294, at: 0.12, d: 0.4, g: 0.14 }]
  },
  // Short, clicky, techy ticks.
  crisp: {
    move: [{ f: 1500, d: 0.02, type: 'triangle', g: 0.05 }],
    select: [{ f: 1800, d: 0.04, type: 'square', g: 0.07 }, { f: 2400, at: 0.035, d: 0.05, type: 'square', g: 0.06 }],
    back: [{ f: 1400, d: 0.05, type: 'square', g: 0.06, to: 900 }],
    open: [{ f: 600, d: 0.12, type: 'sawtooth', g: 0.06, to: 1800, attack: 0.01 }],
    launch: [{ f: 220, d: 0.4, type: 'sawtooth', g: 0.08, to: 880, attack: 0.02 }, { f: 1760, at: 0.3, d: 0.25, type: 'square', g: 0.05 }],
    notify: [{ f: 2093, d: 0.06, type: 'square', g: 0.06 }, { f: 2637, at: 0.08, d: 0.08, type: 'square', g: 0.05 }],
    error: [{ f: 200, d: 0.15, type: 'square', g: 0.08 }, { f: 160, at: 0.1, d: 0.18, type: 'square', g: 0.08 }],
    power: [{ f: 900, d: 0.3, type: 'sawtooth', g: 0.06, to: 200 }]
  },
  // Playful pops and upward slides.
  bubbly: {
    move: [{ f: 600, d: 0.045, g: 0.07, to: 760 }],
    select: [{ f: 784, d: 0.07, g: 0.2, to: 1175 }, { f: 1568, at: 0.06, d: 0.09, g: 0.12 }],
    back: [{ f: 900, d: 0.08, g: 0.18, to: 500 }],
    open: [{ f: 523, d: 0.06, g: 0.16 }, { f: 659, at: 0.06, d: 0.06, g: 0.16 }, { f: 784, at: 0.12, d: 0.1, g: 0.16 }],
    launch: [523, 659, 784, 1047, 1319].map((f, i) => ({ f, at: i * 0.07, d: 0.16, g: 0.16 })),
    notify: [{ f: 1047, d: 0.08, g: 0.16 }, { f: 1319, at: 0.08, d: 0.12, g: 0.14 }],
    error: [{ f: 400, d: 0.1, type: 'triangle', g: 0.22, to: 300 }, { f: 300, at: 0.11, d: 0.16, type: 'triangle', g: 0.22, to: 220 }],
    power: [{ f: 1047, d: 0.1, g: 0.16 }, { f: 784, at: 0.1, d: 0.1, g: 0.16 }, { f: 523, at: 0.2, d: 0.2, g: 0.16 }]
  },
  // Airy, low and spacious with long tails.
  airy: {
    move: [{ f: 440, d: 0.14, g: 0.04, attack: 0.01 }],
    select: [{ f: 392, d: 0.6, g: 0.12, attack: 0.02 }, { f: 784, at: 0.04, d: 0.7, g: 0.06, attack: 0.02 }],
    back: [{ f: 440, d: 0.4, g: 0.1, to: 330, attack: 0.02 }],
    open: [{ f: 262, d: 0.9, g: 0.1, attack: 0.08 }, { f: 392, at: 0.05, d: 0.9, g: 0.08, attack: 0.08 }],
    launch: [{ f: 131, d: 1.6, g: 0.14, attack: 0.2 }, { f: 196, at: 0.1, d: 1.6, g: 0.1, attack: 0.2 }, { f: 523, at: 0.4, d: 1.4, g: 0.06, attack: 0.1 }],
    notify: [{ f: 659, d: 0.8, g: 0.08, attack: 0.02 }, { f: 988, at: 0.15, d: 0.9, g: 0.06, attack: 0.02 }],
    error: [{ f: 220, d: 0.5, type: 'triangle', g: 0.12, attack: 0.02 }],
    power: [{ f: 330, d: 1.2, g: 0.1, to: 165, attack: 0.05 }]
  }
};

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let fxSend: GainNode | undefined;
function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    // A small echo used by the "airy" style and the music, for space.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    fxSend = ctx.createGain();
    fxSend.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  (window as any).__lumenAudio = { ctx, master };
  return ctx;
}

function tone(t: Tone, start: number, out: AudioNode, volume: number, echo = false) {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = t.type ?? 'sine';
  o.frequency.setValueAtTime(t.f, start);
  if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, start + t.d);
  const peak = (t.g ?? 0.15) * volume;
  const a = t.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + a);
  g.gain.exponentialRampToValueAtTime(0.0001, start + a + t.d);
  o.connect(g).connect(out);
  if (echo && fxSend) g.connect(fxSend);
  o.start(start);
  o.stop(start + a + t.d + 0.05);
}

const cfg = { pack: 'lumen' as 'off' | SoundStyle, volume: 0.5 };
export function configureSounds(pack: 'off' | SoundStyle, volume: number) {
  cfg.pack = pack;
  cfg.volume = volume;
}

let lastMove = 0;
export function playSound(ev: SoundEvent, packOverride?: SoundStyle) {
  const pack = packOverride ?? cfg.pack;
  if (pack === 'off' || cfg.volume <= 0) return;
  const now = performance.now();
  if (ev === 'move' && now - lastMove < 45) return; // held stick repeats shouldn't buzz
  if (ev === 'move') lastMove = now;
  try {
    const c = audio();
    const t0 = c.currentTime + 0.005;
    for (const t of ev === 'intro' ? INTRO : ev === 'outro' ? OUTRO : PACKS[pack][ev]) tone(t, t0 + (t.at ?? 0), master!, cfg.volume, pack === 'airy');
  } catch {
    /* audio unavailable */
  }
}

/* ---------------- Background music ---------------- */
// Calm, generative ambient music. Everything goes through a low-pass filter and a long reverb,
// notes fade in and out slowly, and melodies follow written phrases with plenty of silence
// (no random beeping). Each style has its own key, instruments and pace.

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

let reverb: ConvolverNode | undefined;
function getReverb(c: AudioContext): ConvolverNode {
  if (reverb) return reverb;
  const len = Math.floor(c.sampleRate * 4);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  reverb = c.createConvolver();
  reverb.buffer = buf;
  return reverb;
}

let noiseBuf: AudioBuffer | undefined;
function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // soft brown noise
  return noiseBuf;
}

interface Bus { dry: AudioNode; wet: AudioNode }

/** Slow, warm chord: two slightly detuned voices per note, soft filter, long fade in and out. */
function pad(c: AudioContext, bus: Bus, notes: number[], t: number, dur: number, gain: number, type: OscillatorType = 'triangle', cutoff = 900) {
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff * 0.6, t);
  f.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
  f.frequency.linearRampToValueAtTime(cutoff * 0.6, t + dur + 3);
  const g = c.createGain();
  const fade = Math.min(3, dur * 0.4);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + fade);
  g.gain.setValueAtTime(gain, t + dur - 0.5);
  g.gain.linearRampToValueAtTime(0, t + dur + 3);
  f.connect(g);
  g.connect(bus.dry);
  g.connect(bus.wet);
  for (const n of notes) {
    for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = NOTE(n);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 3.2);
    }
  }
}

/** A single soft note. `decay` long = bell or electric piano, short = marimba-like pluck. */
function note(c: AudioContext, bus: Bus, n: number, t: number, gain: number, decay: number, opts: { attack?: number; bright?: number; wet?: number } = {}) {
  const g = c.createGain();
  const a = opts.attack ?? 0.012;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = opts.bright ?? 1800;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = NOTE(n);
  const o2 = c.createOscillator(); // a quiet octave above gives the note some body
  o2.type = 'sine';
  o2.frequency.value = NOTE(n + 12);
  const g2 = c.createGain();
  g2.gain.value = 0.18;
  o.connect(f);
  o2.connect(g2).connect(f);
  f.connect(g);
  g.connect(bus.dry);
  const w = c.createGain();
  w.gain.value = opts.wet ?? 0.8;
  g.connect(w).connect(bus.wet);
  for (const x of [o, o2]) { x.start(t); x.stop(t + a + decay + 0.1); }
}

function bass(c: AudioContext, bus: Bus, n: number, t: number, dur: number, gain: number) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = NOTE(n);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.25);
  g.gain.setValueAtTime(gain, t + dur * 0.6);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(bus.dry);
  o.start(t);
  o.stop(t + dur + 0.1);
}

/** Gentle wind or tape hiss under the music. Returns a stop function. */
function air(c: AudioContext, bus: Bus, gain: number, freq: number): () => void {
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.6;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.05;
  const lg = c.createGain();
  lg.gain.value = freq * 0.4;
  lfo.connect(lg).connect(f.frequency);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(bus.dry);
  src.start();
  lfo.start();
  return () => { try { src.stop(); lfo.stop(); } catch {} };
}

interface Piece {
  /** seconds per bar */
  bar: number;
  /** master tone: lower = darker and softer */
  tone: number;
  start?(c: AudioContext, bus: Bus): () => void;
  play(c: AudioContext, bus: Bus, i: number, t: number, bar: number): void;
}

// A rest is -1. Phrases are written, then picked in a slow rotation so the tune wanders without repeating exactly.
const rot = <T,>(list: T[], i: number) => list[((i % list.length) + list.length) % list.length];

export type PieceId = Exclude<MusicId, 'shuffle'>;

const PIECES: Record<PieceId, Piece> = {
  // "Drift": warm major-ninth chords and a few glassy bell notes. The default.
  lumen: {
    bar: 8, tone: 2200,
    play(c, bus, i, t, bar) {
      const chords = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 57, 60], [43, 50, 55, 57, 62]];
      const ch = rot(chords, i);
      pad(c, bus, ch, t, bar, 0.035, 'triangle', 800);
      bass(c, bus, ch[0] - 12, t, bar * 0.9, 0.05);
      const phrases = [[76, -1, 79, -1], [-1, 72, -1, 74], [-1, -1, 76, -1], [79, -1, -1, 72], [-1, -1, -1, -1]];
      const ph = rot(phrases, i * 3 + Math.floor(i / 4));
      ph.forEach((n, k) => n > 0 && note(c, bus, n, t + (k * bar) / 4 + 0.5, 0.035, 3.5, { bright: 2400 }));
    }
  },
  // "Late night": slow lo-fi electric piano chords, soft sub bass, a touch of tape hiss.
  crisp: {
    bar: 6.4, tone: 1700,
    start: (c, bus) => air(c, bus, 0.012, 2600),
    play(c, bus, i, t, bar) {
      const chords = [[50, 57, 60, 64, 65], [43, 53, 57, 59, 64], [48, 55, 59, 62, 64], [45, 55, 57, 60, 64]];
      const ch = rot(chords, i);
      const beat = bar / 8;
      // chord played as a soft strum, twice per bar
      for (const at of [0, 4.5]) ch.slice(1).forEach((n, k) => note(c, bus, n, t + at * beat + k * 0.035, 0.03, 2.8, { bright: 1300, wet: 0.5 }));
      bass(c, bus, ch[0] - 12, t, beat * 3.5, 0.07);
      bass(c, bus, ch[0] - 12, t + beat * 4.5, beat * 2.5, 0.055);
      const phrases = [[-1, -1, 72, 69, -1, 67, -1, -1], [-1, -1, -1, -1, 74, 72, 69, -1], [-1, 67, -1, 69, -1, -1, -1, -1], [-1, -1, -1, -1, -1, -1, -1, -1]];
      rot(phrases, i + Math.floor(i / 4)).forEach((n, k) => n > 0 && note(c, bus, n, t + k * beat + beat / 2, 0.028, 1.6, { bright: 1500 }));
    }
  },
  // "Plaza": a light, friendly marimba pattern over a soft pad. Bright but unhurried.
  bubbly: {
    bar: 5.6, tone: 2600,
    play(c, bus, i, t, bar) {
      const chords = [[53, 60, 65, 69], [58, 62, 65, 70], [50, 57, 62, 65], [48, 55, 60, 64]];
      const ch = rot(chords, i);
      const beat = bar / 8;
      pad(c, bus, ch, t, bar, 0.022, 'sine', 1200);
      bass(c, bus, ch[0] - 12, t, beat * 3, 0.05);
      const up = [ch[1], ch[2], ch[3], ch[2] + 12, ch[3], ch[2], ch[1], -1];
      const patterns = [up, [ch[1], -1, ch[3], -1, ch[2] + 12, -1, ch[3], -1], [ch[2], ch[3], -1, ch[1] + 12, -1, ch[3], -1, -1]];
      rot(patterns, Math.floor(i / 2)).forEach((n, k) => n > 0 && note(c, bus, n + 12, t + k * beat, k % 4 === 0 ? 0.04 : 0.028, 0.7, { bright: 2600, wet: 0.45 }));
    }
  },
  // "Deep space": almost no melody. Two slow drifting chords, low drone and wind.
  airy: {
    bar: 14, tone: 1400,
    start: (c, bus) => air(c, bus, 0.03, 500),
    play(c, bus, i, t, bar) {
      const chords = [[38, 45, 50, 57, 64], [36, 43, 52, 55, 62], [41, 48, 52, 57, 64], [38, 45, 52, 54, 61]];
      const ch = rot(chords, i);
      pad(c, bus, ch, t, bar, 0.04, 'sine', 600);
      pad(c, bus, [ch[0] - 12], t, bar, 0.05, 'sine', 200);
      const far = [76, -1, 81, -1, 73, -1];
      const n = rot(far, i);
      if (n > 0) note(c, bus, n, t + bar * 0.45, 0.02, 6, { attack: 0.6, bright: 1600, wet: 1 });
    }
  },
  // "Nebula": two clouds of sound drifting past each other, with a far-off shimmer.
  nebula: {
    bar: 16, tone: 1100,
    start: (c, bus) => air(c, bus, 0.022, 900),
    play(c, bus, i, t, bar) {
      const chords = [[36, 43, 48, 55, 59], [34, 41, 48, 53, 60], [39, 46, 50, 57, 61], [31, 43, 46, 53, 58]];
      const ch = rot(chords, i);
      pad(c, bus, ch, t, bar * 1.2, 0.034, 'sine', 520);
      // the second cloud comes in late and a fifth up, so the two never line up
      pad(c, bus, ch.slice(1).map((n) => n + 7), t + bar * 0.45, bar * 0.9, 0.018, 'triangle', 900);
      const shimmer = [88, -1, 83, -1, 91, -1, -1, 86];
      const n = rot(shimmer, i);
      if (n > 0) note(c, bus, n, t + bar * 0.6, 0.012, 7, { attack: 1.2, bright: 2600, wet: 1 });
    }
  },
  // "Orbit": a slow music-box line turning over a steady drone, like something circling far away.
  orbit: {
    bar: 10, tone: 1900,
    play(c, bus, i, t, bar) {
      const keys = [[45, 52, 57, 60, 64, 67], [43, 50, 55, 59, 62, 67], [41, 48, 53, 57, 60, 65], [40, 47, 52, 56, 59, 64]];
      const k = rot(keys, Math.floor(i / 2));
      pad(c, bus, [k[0], k[1], k[2]], t, bar, 0.026, 'sine', 700);
      bass(c, bus, k[0] - 12, t, bar * 0.8, 0.05);
      const step = bar / 6;
      const shapes = [[3, 4, 5, 4, 3, -1], [5, -1, 4, 3, -1, 4], [3, 5, -1, 4, -1, 5], [4, 3, -1, -1, 5, -1]];
      rot(shapes, i).forEach((x, j) => {
        if (x < 0) return;
        const up = j === 2 && i % 3 === 0 ? 12 : 0;
        note(c, bus, k[x] + 12 + up, t + j * step + 0.25, 0.03, 4.2, { bright: 2800, wet: 0.8 });
      });
    }
  },
  // "Pulsar": one patient blip and its echo, over a deep hum. Almost nothing happens, on purpose.
  pulsar: {
    bar: 12, tone: 1500,
    start: (c, bus) => air(c, bus, 0.016, 320),
    play(c, bus, i, t, bar) {
      const roots = [33, 33, 31, 36];
      const r = rot(roots, Math.floor(i / 2));
      pad(c, bus, [r, r + 7, r + 12], t, bar * 1.1, 0.03, 'sine', 380);
      const line = [72, 79, 75, 70, 77, 72];
      const n = rot(line, i);
      note(c, bus, n, t + 0.4, 0.028, 5.5, { attack: 0.05, bright: 2200, wet: 1 });
      note(c, bus, n + 7, t + bar * 0.5, 0.014, 5, { attack: 0.05, bright: 1800, wet: 1 });
    }
  },
  // "Tides": long swells that rise and fall, with a low sweep underneath.
  tides: {
    bar: 18, tone: 850,
    start: (c, bus) => air(c, bus, 0.03, 420),
    play(c, bus, i, t, bar) {
      const chords = [[38, 45, 50, 57], [36, 43, 50, 55], [33, 40, 47, 52], [41, 48, 52, 59]];
      const ch = rot(chords, i);
      pad(c, bus, ch, t, bar * 1.15, 0.042, 'sine', 460);
      bass(c, bus, ch[0] - 12, t, bar, 0.06);
      // a second swell halfway through, quieter, so the tide never quite stops
      pad(c, bus, ch.map((n) => n + 5), t + bar * 0.55, bar * 0.7, 0.02, 'triangle', 700);
      const far = [69, -1, 64, -1, 71, -1];
      const n = rot(far, i);
      if (n > 0) note(c, bus, n, t + bar * 0.35, 0.016, 8, { attack: 1.5, bright: 1400, wet: 1 });
    }
  },
  // "Driftwood": a few wooden notes falling slowly through a wide room.
  driftwood: {
    bar: 9, tone: 1600,
    play(c, bus, i, t, bar) {
      const scales = [[48, 53, 55, 60, 62, 67], [46, 51, 53, 58, 60, 65], [43, 50, 55, 58, 62, 65]];
      const sc = rot(scales, Math.floor(i / 3));
      pad(c, bus, [sc[0], sc[2], sc[4]], t, bar, 0.02, 'sine', 600);
      bass(c, bus, sc[0] - 12, t + bar * 0.1, bar * 0.6, 0.045);
      const step = bar / 5;
      const falls = [[5, 3, -1, 2, -1], [-1, 4, 2, -1, 1], [2, -1, -1, 4, 3], [-1, -1, 3, -1, -1]];
      rot(falls, i).forEach((x, j) => x >= 0 && note(c, bus, sc[x] + 12, t + j * step + 0.3, 0.026, 2.6, { bright: 1900, wet: 0.7 }));
    }
  }
};

/** The calm set the shuffle rotates through. */
const SHUFFLE: PieceId[] = ['airy', 'nebula', 'orbit', 'pulsar', 'tides', 'driftwood', 'lumen'];

let musicGain: GainNode | undefined;
let timer: number | undefined;
let customEl: HTMLAudioElement | undefined;
let current = '';
let stopExtra: (() => void) | undefined;

/** `fast` is for the moment a game takes over: silence in a blink instead of a slow fade. */
export function stopMusic(fast = false) {
  if (timer) window.clearInterval(timer);
  timer = undefined;
  if (musicGain && ctx) {
    const g = musicGain, extra = stopExtra;
    g.gain.setTargetAtTime(0, ctx.currentTime, fast ? 0.06 : 0.6);
    setTimeout(() => { extra?.(); g.disconnect(); }, fast ? 400 : 3500);
  }
  musicGain = undefined;
  stopExtra = undefined;
  customEl?.pause();
  current = '';
}

let shuffleTimer: number | undefined;
let shuffleLast = '';

export function playMusic(kind: 'off' | MusicId | 'custom', volume: number, file: string) {
  if (kind === 'shuffle') {
    // One piece at a time, swapped every few minutes so a long evening never repeats itself.
    if (current.startsWith('shuffle|')) return setMusicVolume('shuffle', volume);
    const pick = () => {
      const options = SHUFFLE.filter((p) => p !== shuffleLast);
      const id = options[Math.floor(Math.random() * options.length)];
      shuffleLast = id;
      playPiece(id, volume);
      current = `shuffle|${file}`;
    };
    if (shuffleTimer) window.clearInterval(shuffleTimer);
    shuffleTimer = window.setInterval(() => { if (current.startsWith('shuffle|')) pick(); }, 5 * 60 * 1000);
    pick();
    return;
  }
  if (shuffleTimer) { window.clearInterval(shuffleTimer); shuffleTimer = undefined; }
  playPiece(kind, volume, file);
}

function playPiece(kind: 'off' | PieceId | 'custom', volume: number, file = '') {
  const key = `${kind}|${file}`;
  if (kind === 'off') return stopMusic();
  if (key === current) return setMusicVolume(kind, volume);
  stopMusic();
  current = key;
  if (kind === 'custom') {
    if (!file) return;
    customEl ??= new Audio();
    customEl.loop = true;
    if (customEl.src !== file) customEl.src = file;
    customEl.volume = volume;
    customEl.play().catch(() => undefined);
    return;
  }
  const c = audio();
  const piece = PIECES[kind];
  // bus: everything -> low-pass -> music volume; a reverb sits beside it
  const out = c.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(volume, c.currentTime, 2.5); // slow fade in
  out.connect(master!);
  musicGain = out;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = piece.tone;
  lp.Q.value = 0.3;
  lp.connect(out);
  const wet = c.createGain();
  wet.gain.value = 0.55;
  wet.connect(getReverb(c)).connect(lp);
  const bus: Bus = { dry: lp, wet };
  stopExtra = piece.start?.(c, bus);
  let next = c.currentTime + 0.3;
  let i = 0;
  const schedule = () => {
    while (next < c.currentTime + 1.5) {
      piece.play(c, bus, i, next, piece.bar);
      next += piece.bar;
      i++;
    }
  };
  schedule();
  timer = window.setInterval(schedule, 500);
}

function setMusicVolume(kind: string, v: number) {
  if (kind === 'custom' && customEl) customEl.volume = v;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(v, ctx.currentTime, 0.3);
}
