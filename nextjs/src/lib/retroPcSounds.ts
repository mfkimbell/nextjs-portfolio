/*
 * The cabin computer's sounds: a mid-90s beige box, synthesized.
 *
 * Nothing here is a recording. The operating-system jingles of the era are
 * somebody's copyrighted audio, and they are not really what that machine
 * SOUNDED like anyway - the hardware was. So these are built from scratch in
 * Web Audio, modelled on what the parts physically did:
 *
 *   mouse     A ball mouse's microswitch: a short, bright tick on the press
 *             and a slightly quieter, higher one on the release ~70ms later,
 *             over a little low thump from the plastic shell.
 *   key       An IBM-style buckling-spring keyboard: the sharp CLICK is the
 *             spring buckling (which is also the actuation), then a duller
 *             CLACK a fraction of a second later as the keycap bottoms out.
 *             The spring itself rings faintly, a metallic ping.
 *   seek      The hard drive's heads moving between tracks: a run of
 *             precise, tinny clicks at irregular intervals, the "chatter"
 *             you heard every time a program opened.
 *   park      The heads parking on the way out: a lower, hollow clunk.
 *   wake      A CRT coming out of standby: the degauss coil's low
 *             "bwoong" (mains-frequency hum with harmonics, dying away over
 *             about a second), the aperture grille's faint ping, a crackle of
 *             static, and the ~15.7kHz flyback whine settling in quietly.
 *   beep      The PC speaker: a bare two-level square wave from the timer
 *             chip, which is what every error beep of the era was.
 *   chirp     Two quick PC-speaker notes - "done".
 *
 * Levels go through the same cube-law as every other knob on the site
 * (see perceptualGain in campsiteSounds), so 0.2 sounds like 0.2.
 */

import { getSharedAudioContext, perceptualGain } from "@/lib/campsiteSounds";

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const len = Math.floor(ctx.sampleRate * 1.5);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
  noise = b;
  return b;
}

type Voice = { ctx: AudioContext; out: GainNode; t: number };

/** A fresh output bus at the given loudness, or null if audio is not up. */
function voice(volume: number, ctxOverride?: BaseAudioContext): Voice | null {
  const ctx = (ctxOverride as AudioContext | undefined) ?? getSharedAudioContext();
  if (!ctx) return null;
  const g = perceptualGain(volume);
  if (g <= 0) return null;
  const out = ctx.createGain();
  out.gain.value = g;
  out.connect(ctx.destination);
  return { ctx, out, t: ctx.currentTime + 0.005 };
}

/** A burst of filtered noise with a sharp attack and exponential decay. */
function burst(v: Voice, at: number, opts: {
  dur: number; level: number; type: BiquadFilterType; freq: number; q?: number;
}) {
  const { ctx } = v;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = opts.type;
  f.frequency.value = opts.freq;
  f.Q.value = opts.q ?? 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(opts.level, at + 0.0008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  src.connect(f).connect(g).connect(v.out);
  src.start(at, Math.random() * 1.2);
  src.stop(at + opts.dur + 0.02);
}

/** A decaying tone - a ping, a thump, a hum. */
function tone(v: Voice, at: number, opts: {
  freq: number; dur: number; level: number; type?: OscillatorType;
  to?: number; attack?: number; lowpass?: number;
}) {
  const { ctx } = v;
  const o = ctx.createOscillator();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(opts.freq, at);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + opts.dur);
  const g = ctx.createGain();
  const atk = opts.attack ?? 0.001;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(opts.level, at + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  let node: AudioNode = o;
  if (opts.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = opts.lowpass;
    node = o.connect(f);
  }
  node.connect(g).connect(v.out);
  o.start(at);
  o.stop(at + opts.dur + 0.02);
}

const jitter = (x: number, amt = 0.08) => x * (1 + (Math.random() * 2 - 1) * amt);

/* --- the sounds ----------------------------------------------------------- */

export function pcMouseClick(volume: number, ctx?: BaseAudioContext) {
  const v = voice(volume, ctx);
  if (!v) return;
  const tick = (at: number, level: number, pitch: number) => {
    burst(v, at, { dur: 0.007, level, type: "bandpass", freq: jitter(3400 * pitch), q: 1.4 });
    tone(v, at, { freq: jitter(2100 * pitch, 0.04), dur: 0.018, level: level * 0.25 });
    burst(v, at, { dur: 0.014, level: level * 0.45, type: "lowpass", freq: 520 });
  };
  tick(v.t, 0.9, 1);
  tick(v.t + jitter(0.07, 0.15), 0.55, 1.12);
}

export function pcKey(volume: number, ctx?: BaseAudioContext) {
  const v = voice(volume, ctx);
  if (!v) return;
  const p = jitter(1, 0.07);
  // the buckle: sharp click plus the spring's faint metallic ring
  burst(v, v.t, { dur: 0.009, level: 0.8, type: "bandpass", freq: 2700 * p, q: 1.8 });
  tone(v, v.t, { freq: 2350 * p, dur: 0.05, level: 0.08 });
  tone(v, v.t, { freq: 3720 * p, dur: 0.035, level: 0.05 });
  // the bottom-out: a duller clack from the keycap and the steel plate
  const b = v.t + jitter(0.03, 0.2);
  burst(v, b, { dur: 0.03, level: 0.55, type: "lowpass", freq: 1100 * p, q: 0.7 });
  tone(v, b, { freq: 190 * p, dur: 0.04, level: 0.18 });
}

export function pcSeek(volume: number, clicks = 6, ctx?: BaseAudioContext) {
  const v = voice(volume, ctx);
  if (!v) return;
  let at = v.t;
  for (let i = 0; i < clicks; i += 1) {
    const level = 0.35 + Math.random() * 0.45;
    burst(v, at, { dur: 0.004, level, type: "bandpass", freq: jitter(4600, 0.15), q: 2.5 });
    tone(v, at, { freq: jitter(1150, 0.1), dur: 0.012, level: level * 0.18, type: "triangle" });
    at += 0.016 + Math.random() * 0.055;
  }
}

export function pcPark(volume: number, ctx?: BaseAudioContext) {
  const v = voice(volume, ctx);
  if (!v) return;
  pcSeekInto(v, 3);
  const at = v.t + 0.14;
  burst(v, at, { dur: 0.05, level: 0.6, type: "lowpass", freq: 650, q: 1.2 });
  tone(v, at, { freq: 140, dur: 0.09, level: 0.3 });
  tone(v, at, { freq: 420, dur: 0.05, level: 0.08, type: "triangle" });
}

function pcSeekInto(v: Voice, clicks: number) {
  let at = v.t;
  for (let i = 0; i < clicks; i += 1) {
    burst(v, at, { dur: 0.004, level: 0.4, type: "bandpass", freq: jitter(4600, 0.15), q: 2.5 });
    at += 0.02 + Math.random() * 0.04;
  }
}

export function pcWake(volume: number, ctx?: BaseAudioContext) {
  const v = voice(volume, ctx);
  if (!v) return;
  const t = v.t;
  // relay clack as the tube powers up
  burst(v, t, { dur: 0.02, level: 0.5, type: "bandpass", freq: 1800, q: 1 });
  // degauss "bwoong": mains hum with harmonics, dying away, slightly wobbling
  const { ctx: c } = v;
  const hum = c.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.setValueAtTime(60, t);
  hum.frequency.linearRampToValueAtTime(58, t + 1.1);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + 1.1);
  const hg = c.createGain();
  hg.gain.setValueAtTime(0.0001, t);
  hg.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  const wob = c.createOscillator();
  wob.frequency.value = 7;
  const wobG = c.createGain();
  wobG.gain.value = 0.12;
  wob.connect(wobG).connect(hg.gain);
  hum.connect(lp).connect(hg).connect(v.out);
  hum.start(t); hum.stop(t + 1.25);
  wob.start(t); wob.stop(t + 1.25);
  // the aperture grille's ping
  tone(v, t + 0.02, { freq: 2860, dur: 0.7, level: 0.035 });
  tone(v, t + 0.02, { freq: 4130, dur: 0.5, level: 0.02 });
  // static crackle on the glass
  for (let i = 0; i < 16; i += 1) {
    const at = t + 0.05 + Math.random() * 0.7;
    burst(v, at, { dur: 0.003 + Math.random() * 0.006, level: 0.1 + Math.random() * 0.25, type: "highpass", freq: 3000 });
  }
  // flyback whine settling in, very quietly
  tone(v, t + 0.1, { freq: 15625, dur: 1.6, level: 0.012, attack: 0.3 });
}

export function pcBeep(volume: number, ctx?: BaseAudioContext) {
  const v = voice(volume, ctx);
  if (!v) return;
  // a bare square wave, the way the timer chip drove the speaker; a gentle
  // lowpass stands in for the little cone's own roll-off
  tone(v, v.t, { freq: 880, dur: 0.22, level: 0.22, type: "square", attack: 0.002, lowpass: 3500 });
}

export function pcChirp(volume: number, ctx?: BaseAudioContext) {
  const v = voice(volume, ctx);
  if (!v) return;
  tone(v, v.t, { freq: 660, dur: 0.07, level: 0.16, type: "square", attack: 0.002, lowpass: 3500 });
  tone(v, v.t + 0.085, { freq: 990, dur: 0.1, level: 0.16, type: "square", attack: 0.002, lowpass: 3500 });
}

/**
 * A heavy paw landing on the monitor: a soft, low thump through the case,
 * the glass giving a dull tap, and a little crackle of static as the tube
 * takes the hit. Not a hardware sound of the era - it is the one moment on
 * this computer that is not - but built from the same parts so it sits in
 * the same world.
 */
export function pcPawThud(volume: number, ctx?: BaseAudioContext) {
  const v = voice(volume, ctx);
  if (!v) return;
  const t = v.t;
  tone(v, t, { freq: 95, to: 60, dur: 0.28, level: 0.55, attack: 0.004 });
  burst(v, t, { dur: 0.09, level: 0.45, type: "lowpass", freq: 380, q: 0.9 });
  burst(v, t + 0.005, { dur: 0.03, level: 0.22, type: "bandpass", freq: 1400, q: 2 });
  for (let i = 0; i < 7; i += 1) {
    const at = t + 0.02 + Math.random() * 0.25;
    burst(v, at, { dur: 0.003 + Math.random() * 0.004, level: 0.06 + Math.random() * 0.12, type: "highpass", freq: 3000 });
  }
}
