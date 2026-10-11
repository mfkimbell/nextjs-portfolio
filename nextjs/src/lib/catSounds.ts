/*
 * The porch cats' sounds, synthesized in Web Audio like the cabin computer's
 * (lib/retroPcSounds) - no recordings.
 *
 *   purr     A real purr is the larynx muscles twitching about 25 times a
 *            second, on the breath out AND the breath in. So: noise, shaped
 *            into ~25 Hz pulses by a sharpened sawtooth, through a low,
 *            warm band (most of a purr's energy sits under ~1 kHz), over a
 *            faint tonal rumble at the same rate. A breathing cycle rides on
 *            top: a longer, fuller exhale, a quieter, slightly faster inhale,
 *            and a tiny pause. createPurr() returns a handle; call
 *            update(level) every frame and the purr fades with `level`.
 *   scratch  Fingers on fur: a soft burst of bright, band-passed noise. Call
 *            it as the hand moves; the loudness follows the speed.
 *
 * Levels go through perceptualGain like every other sound on the site.
 */

import { getSharedAudioContext, perceptualGain } from "@/lib/campsiteSounds";

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: BaseAudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const len = Math.floor(ctx.sampleRate * 2);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
  noise = b;
  return b;
}

/** A sawtooth sharpened into one short pulse per cycle. */
function pulseCurve() {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;      // saw position, -1..1
    c[i] = Math.pow(Math.max(0, x), 5);   // silent most of the cycle, a burst at the top
  }
  return c;
}

export type Purr = {
  /** level 0..1 (how content the cat is), volume 0..1 (the site's slider). */
  update: (level: number, volume: number) => void;
  stop: () => void;
};

export function createPurr(ctxOverride?: AudioContext): Purr | null {
  const ctx = ctxOverride ?? getSharedAudioContext();
  if (!ctx) return null;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);
  const breath = ctx.createGain();
  breath.gain.value = 0;
  breath.connect(out);

  // the pulse clock
  const clock = ctx.createOscillator();
  clock.type = "sawtooth";
  clock.frequency.value = 25;
  const shaper = ctx.createWaveShaper();
  shaper.curve = pulseCurve();
  clock.connect(shaper);

  // noise, gated by the pulses
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 260;
  band.Q.value = 0.8;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 1100;
  const gate = ctx.createGain();
  gate.gain.value = 0.02;               // a breathy floor between pulses
  shaper.connect(gate.gain);
  src.connect(band).connect(low).connect(gate).connect(breath);

  // a faint rumble at the pulse rate, for body
  const rumble = ctx.createOscillator();
  rumble.type = "sawtooth";
  rumble.frequency.value = 25;
  const rumbleLow = ctx.createBiquadFilter();
  rumbleLow.type = "lowpass";
  rumbleLow.frequency.value = 140;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.35;
  rumble.connect(rumbleLow).connect(rumbleGain).connect(breath);

  const t0 = ctx.currentTime;
  clock.start(t0);
  rumble.start(t0);
  src.start(t0);

  const CYCLE = 2.3;                    // seconds per breath
  let stopped = false;
  return {
    update(level, volume) {
      if (stopped) return;
      const now = ctx.currentTime;
      const l = Math.max(0, Math.min(1, level));
      // the breath: exhale 0..0.58 (full), pause, inhale 0.64..0.96 (softer, faster)
      const ph = ((now - t0) % CYCLE) / CYCLE;
      let b = 0;
      let rate = 25;
      if (ph < 0.58) { const u = ph / 0.58; b = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.6; rate = 24; }
      else if (ph > 0.64 && ph < 0.96) { const u = (ph - 0.64) / 0.32; b = 0.55 * Math.sin(Math.PI * u) ** 0.7; rate = 27.5; }
      breath.gain.setTargetAtTime(b, now, 0.03);
      clock.frequency.setTargetAtTime(rate, now, 0.05);
      rumble.frequency.setTargetAtTime(rate, now, 0.05);
      out.gain.setTargetAtTime(perceptualGain(Math.max(0, Math.min(1, volume))) * 2.2 * l, now, 0.12);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.setTargetAtTime(0, now, 0.08);
      for (const n of [clock, rumble, src]) n.stop(now + 0.5);
      window.setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, 700);
    },
  };
}

/** One soft scratch of fingers through fur. `amount` 0..1 follows the hand's speed. */
export function catScratch(volume: number, amount: number) {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  const g = perceptualGain(Math.max(0, Math.min(1, volume))) * Math.max(0, Math.min(1, amount));
  if (g <= 0.0005) return;
  const t = ctx.currentTime + 0.005;
  const dur = 0.07 + Math.random() * 0.06;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2200 + Math.random() * 1600;
  band.Q.value = 0.9;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(g * 0.9, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(band).connect(hp).connect(env).connect(ctx.destination);
  src.start(t, Math.random() * 1.5, dur + 0.05);
}
