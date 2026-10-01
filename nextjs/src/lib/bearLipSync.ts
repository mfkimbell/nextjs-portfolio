/**
 * Real-time speech features for the talking bears, from one AnalyserNode frame.
 *
 * Shared by the live Twilio voice hook (useBearVoiceAgent) and the scene lab's
 * test-talk source (useBearTalkTest), so what you tune in the lab is exactly
 * what plays on the site.
 *
 * No phoneme recognition - the approach the browser lip-sync libraries
 * (wawa-lipsync, lipsync-engine) and the avatar write-ups converge on: three
 * continuous mouth parameters instead of 15 discrete visemes, because a
 * stylized low-poly face can only show ~three shapes anyway and continuous
 * values never "pop". On top of that, prosody for the body: pitch and accent.
 *
 * Calibrated offline against recorded speech (three macOS voices, low/mid/high
 * pitched, isolated words beet/boot/bot/bait/boat/bat/see/sue/saw/... plus
 * running sentences) with a Python replica of this exact chain (see
 * .lipsync-renders/lip2.py - TS and Python agree to 4 decimal places).
 *
 *   open  - NOT raw loudness. Running speech barely dips in RMS between
 *           syllables, so a loudness-driven jaw plateaus half-open. Instead:
 *           60% "syllabic contrast" (fast envelope above its own ~300ms
 *           floor) + 40% level vs a slowly-decaying peak (automatic gain),
 *           scaled by F1 height - share of sub-1kHz energy above 500Hz, ~0 for
 *           ee/oo/m, 0.4-0.65 for ah/aw - and cut on hiss (s/sh/f). Gives
 *           ~3-4 real closures per second of speech, i.e. syllable rate.
 *   wide / round - F2 brightness, log10(E[1.4-3.2kHz] / E[250Hz-1kHz]),
 *           relative to THIS voice's running median. (A power-weighted
 *           spectral centroid, the first thing tried, just tracks pitch.)
 *           Round vowels sit ~1.3-1.7 decades below front ones in every voice
 *           tested, but absolute values shift by a decade between voices -
 *           hence the per-voice median. Shapes fade in over the first ~2.5s of
 *           voiced audio while the median settles.
 *   pitch - F0 by normalized autocorrelation (McLeod NSDF) on a 4x-decimated
 *           window, as semitones above/below this voice's running median.
 *           Head motion tracks F0 more than anything else in speech (Munhall
 *           et al. 2004: head motion explains >63% of F0 variance, vs ~32% for
 *           loudness), so this is what the head lift follows.
 *   onset - fast/slow envelope ratio crossing a threshold = a new syllable
 *           (refractory 160ms). Small beats hang off these.
 *   accent - the PROMINENT syllables only: onset strength combined with a
 *           pitch excursion, top ~quarter of syllables, at most one per 0.7s.
 *           Co-speech nod research: nod strokes land on the prosodically
 *           prominent syllable (within ~5% of the F0 peak), only a minority
 *           of utterances carry one, and nod size scales with prominence -
 *           so nods / torso beats / listener backchannels hang off these,
 *           NOT off every syllable (that reads as a bobble-head).
 */

import type { BearVoiceState } from "@/lib/bearVoiceState";

export type LipSyncFrame = {
  open: number;
  wide: number;
  round: number;
  /** semitones vs this voice's median F0, smoothed; 0 when unvoiced */
  pitch: number;
  onset: boolean;
  onsetStrength: number;
  accent: boolean;
  /** 0..1 prominence of the accent that just fired */
  accentStrength: number;
};

/** Publish one analysed frame into the shared voice state the scene reads. */
export function applyLipSyncFrame(state: BearVoiceState, f: LipSyncFrame) {
  state.mouthOpen = f.open;
  state.mouthWide = f.wide;
  state.mouthRound = f.round;
  state.pitch = f.pitch;
  if (f.onset) {
    state.syllable = (state.syllable ?? 0) + 1;
    state.syllableStrength = f.onsetStrength;
  }
  if (f.accent) {
    state.accent = (state.accent ?? 0) + 1;
    state.accentStrength = f.accentStrength;
  }
}

export function createLipSyncAnalyzer(sampleRate: number, fftSize: number) {
  const binHz = sampleRate / fftSize;
  const bin = (hz: number) => Math.max(1, Math.round(hz / binHz));
  const B = {
    b150: bin(150), b250: bin(250), b500: bin(500), b1000: bin(1000),
    b1400: bin(1400), b3200: bin(3200), b3500: bin(3500), b7500: bin(7500),
  };
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  let last = 0;
  let peak = 0.05;
  let fast = 0;
  let slow = 0;
  let floor = 0;
  let median = -1.5;     // log10 F2 brightness; typical mid-voice starting point
  let voicedTime = 0;
  let lastOnset = 0;
  let lastAccent = -1e9;
  let f0Median: number | null = null;   // in semitones (12*log2 Hz)
  let semis = 0;

  // pitch scratch (4x decimation: 48k -> 12k)
  const DEC = 4;
  const decN = Math.floor(fftSize / DEC);
  const dec = new Float32Array(decN);
  const srd = sampleRate / DEC;
  const tMin = Math.floor(srd / 400);
  const tMax = Math.min(Math.floor(srd / 70), decN - 32);
  const nsdf = new Float32Array(tMax + 2);

  const band = (db: Float32Array, a: number, b: number) => {
    let sum = 1e-12;
    for (let i = a; i < b && i < db.length; i++) {
      const v = db[i];
      if (Number.isFinite(v)) sum += Math.pow(10, v / 10);
    }
    return sum;
  };

  /** McLeod NSDF pitch: first peak within 90% of the global max, parabolic refine. */
  const detectF0 = (samples: Float32Array): number => {
    let mean = 0;
    for (let i = 0; i < decN; i++) {
      let s = 0;
      for (let k = 0; k < DEC; k++) s += samples[i * DEC + k];
      dec[i] = s / DEC;
      mean += dec[i];
    }
    mean /= decN;
    for (let i = 0; i < decN; i++) dec[i] -= mean;
    let gmax = -1;
    for (let t = tMin; t <= tMax; t++) {
      let r = 0, m = 0;
      for (let i = 0; i < decN - t; i++) {
        const a = dec[i], b = dec[i + t];
        r += a * b; m += a * a + b * b;
      }
      const v = m > 1e-9 ? (2 * r) / m : 0;
      nsdf[t] = v;
      if (v > gmax) gmax = v;
    }
    if (gmax < 0.6) return 0;
    const thr = 0.9 * gmax;
    for (let t = tMin + 1; t < tMax; t++) {
      const a = nsdf[t - 1], b = nsdf[t], c = nsdf[t + 1];
      if (b >= thr && b >= a && b >= c) {
        const den = a - 2 * b + c;
        const off = Math.abs(den) > 1e-9 ? (0.5 * (a - c)) / den : 0;
        return srd / (t + off);
      }
    }
    return 0;
  };

  return (rms: number, spectrumDb: Float32Array, samples: Float32Array, now: number): LipSyncFrame => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    fast += (rms - fast) * (1 - Math.exp(-dt / 0.025));
    slow += (rms - slow) * (1 - Math.exp(-dt / 0.18));
    peak = Math.max(rms, peak * Math.exp(-dt * 0.35), 0.035);
    floor = fast < floor ? fast : floor + (fast - floor) * (1 - Math.exp(-dt / 0.3));

    const voiced = rms > 0.012;
    const level = clamp01((rms - 0.012) / Math.max(0.02, peak * 0.8 - 0.012));
    const contrast = clamp01((fast - floor) / Math.max(0.01, peak * 0.8 - floor));

    const lo = band(spectrumDb, B.b150, B.b500);
    const f1 = band(spectrumDb, B.b500, B.b1000);
    const f2 = band(spectrumDb, B.b1400, B.b3200);
    const base = band(spectrumDb, B.b250, B.b1000);
    const hiss = band(spectrumDb, B.b3500, B.b7500);
    const total = band(spectrumDb, B.b150, B.b7500);
    const f1Open = clamp01(f1 / (lo + f1));
    const brightness = Math.log10(f2 / base);
    const sibilant = clamp01((hiss / total - 0.08) / 0.25);

    if (voiced && level > 0.3) {
      voicedTime += dt;
      const rate = voicedTime < 2.5 ? 2.0 : 0.6;
      median += rate * dt * (brightness > median ? 1 : -1);
    }
    const dev = brightness - median;
    const confidence = 0.35 + 0.65 * clamp01(voicedTime / 2.5);

    const drive = 0.4 * level + 0.6 * contrast;
    const open = voiced
      ? clamp01(Math.pow(drive, 0.85) * (0.55 + 0.75 * f1Open) * (1 - 0.6 * sibilant))
      : 0;
    const wide = voiced
      ? clamp01(clamp01((dev + 0.4) / 0.5) * clamp01(1 - 1.8 * f1Open) + sibilant * 0.8) * confidence
      : 0;
    const round = voiced
      ? clamp01((-dev - 0.6) / 0.5) * clamp01(1.3 - 1.3 * f1Open) * confidence
      : 0;

    // pitch, as semitones vs this voice's running median
    const f0 = voiced && samples.length >= fftSize ? detectF0(samples) : 0;
    if (f0 > 0) {
      const st = 12 * Math.log2(f0);
      if (f0Median === null) f0Median = st;
      f0Median += (voicedTime < 2.5 ? 6 : 2) * dt * (st > f0Median ? 1 : -1);
      const target = Math.max(-6, Math.min(8, st - f0Median));
      semis += (target - semis) * (1 - Math.exp(-dt / 0.08));
    } else {
      semis += (0 - semis) * (1 - Math.exp(-dt / 0.25));
    }

    let onset = false;
    let onsetStrength = 0;
    let accent = false;
    let accentStrength = 0;
    if (fast > 0.02 && fast > slow * 1.35 && now - lastOnset > 160) {
      onset = true;
      lastOnset = now;
      onsetStrength = clamp01((fast / Math.max(slow, 1e-4) - 1.35) / 1.2 * 0.6 + (fast / peak) * 0.5);
      const prominence = clamp01(0.55 * onsetStrength + 0.45 * clamp01((semis + 1) / 5));
      if (prominence >= 0.45 && now - lastAccent > 700) {
        accent = true;
        lastAccent = now;
        accentStrength = clamp01((prominence - 0.45) / 0.4);
      }
    }
    return { open, wide, round, pitch: voiced ? semis : 0, onset, onsetStrength, accent, accentStrength };
  };
}
