"use client";

/**
 * Small campsite audio surface. Two hooks and one function:
 *
 *   useCampsiteAudioLoop(url, { volume, enabled, liveMultiplier?, fadeMs?, panRef? })
 *     Long-running background loop (fire crackling, banjo, CRT music).
 *     Creates a single HTMLAudioElement, sets loop=true, and drives its
 *     volume off one continuous requestAnimationFrame loop: base `volume` x
 *     an optional per-frame `liveMultiplier` (e.g. CRT_MUSIC's zoom ramp) x
 *     a fade gain that eases toward 1 while `enabled` and toward 0 while
 *     not, over `fadeMs`. That last part is what makes switching scenes
 *     fade the ambience out/in instead of cutting it - the element is only
 *     actually paused once the fade has reached silence, and only started
 *     once it has something to be heard fading up from. Autoplay only
 *     starts after the first user gesture - modern browsers block
 *     silent-page audio, and the title-card click on entry is the gesture
 *     we use to unlock it.
 *
 *     `panRef` opts a loop into stereo panning: pass a ref the CALLER
 *     updates every frame with a -1 (hard left) .. 1 (hard right) value
 *     (e.g. computed from an emitter's world position relative to the
 *     camera - see CampfireAnimals' banjo pan tracker). Only loops that
 *     pass panRef get routed through Web Audio at all (createMediaElementSource
 *     + a StereoPannerNode) - a loop without it keeps playing exactly as
 *     before, straight out of the <audio> element, so this is zero-risk for
 *     fire crackling / CRT music / anything that doesn't ask for it.
 *
 *   useCampsiteOneShot(url)
 *     Returns a play(volume, rate?) callback for short cues (swoosh, click,
 *     hover, select, back, zoom in/out). Each call clones the underlying
 *     <audio> so overlapping triggers stack instead of cutting each other
 *     off. `rate` sets HTMLMediaElement.playbackRate on that clone, for a
 *     cue that wants to run slower or faster than its file's native speed.
 */

import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

/**
 * True once ANY pointerdown/keydown/touchstart has landed on the page. We
 * keep this at module scope so a loop created before the visitor clicks
 * the title still picks up "gesture happened" once it lands, without
 * every hook wiring its own listeners.
 */
let gestureUnlocked = false;
const gestureListeners = new Set<() => void>();

function installGestureUnlock() {
  if (typeof window === "undefined") return;
  if (gestureUnlocked) return;
  const unlock = () => {
    gestureUnlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
    gestureListeners.forEach((fn) => fn());
    gestureListeners.clear();
    // Same gesture that unlocks <audio> autoplay also has to resume the
    // shared Web Audio context - it's born "suspended" until one lands.
    sharedAudioContext?.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
  // iOS only counts touchEND / click as a gesture that may start audio, and it
  // suspends ("interrupts") the context when the tab is backgrounded, a call
  // comes in, etc. So keep nudging it back on every tap and on return.
  const revive = () => {
    const ctx = sharedAudioContext;
    if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  };
  window.addEventListener("touchend", () => { unlock(); revive(); }, { passive: true });
  window.addEventListener("click", revive);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) revive(); });
}

/**
 * One AudioContext for the whole page, created lazily (constructing it is
 * fine before a gesture; only *resuming* it needs one, handled above and in
 * getAudioContext()). Shared because a page is only allowed a small, finite
 * number of these - every panned loop reuses this one rather than making
 * its own.
 */
let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // iOS mutes Web Audio when the ring/silent switch is on (plain <audio> it
  // lets through). Everything now goes through Web Audio on iOS, so declare
  // this page's sound "playback", like a music app - Safari 17+ supports it.
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch { /* older Safari: nothing to do */ }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioContext) sharedAudioContext = new Ctor();
  if (sharedAudioContext.state === "suspended" && gestureUnlocked) {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * iOS Safari ignores HTMLMediaElement.volume - it is read-only there, always 1.
 * So on iPhone/iPad every volume slider, every fade and every scene-change
 * fade-out did nothing: loops kept playing at full volume until the fade
 * "finished" and they were paused, which is the music left ringing after
 * you'd moved to the next scene. There, all volume goes through a Web Audio
 * GainNode instead, which iOS does honour.
 */
export const IS_IOS = typeof navigator !== "undefined" && (
  /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1)
);

/* ------------------------------------------------------------ sound tuning */

/**
 * Per-sound tuning, keyed by URL, set from the lab config (see
 * components/scene-lab/soundList.ts). Every one-shot and loop made through
 * this file reads it at play time, so call sites stay untouched:
 *  vol   - multiplier on whatever volume the caller asked for (above 1 boosts
 *          through a Web Audio gain, since <audio>.volume stops at 1)
 *  rate  - playback speed (pitch follows)
 *  delay - seconds between the trigger and the sound
 *  start - seconds into the file to start from (skips lead-in silence)
 *  end   - seconds into the file to stop at / loop back from (0 = the end)
 *  pan   - -1 hard left .. 1 hard right
 */
export type SoundTune = { vol: number; rate: number; delay: number; start: number; end: number; pan: number };
const TUNE_DEFAULT: SoundTune = { vol: 1, rate: 1, delay: 0, start: 0, end: 0, pan: 0 };
const soundTunes = new Map<string, SoundTune>();
export function setSoundTune(url: string, t: Partial<SoundTune>) {
  soundTunes.set(url, { ...TUNE_DEFAULT, ...t });
}
export function getSoundTune(url: string): SoundTune {
  return soundTunes.get(url) ?? TUNE_DEFAULT;
}

/** Route an element through gain + pan when the tuning asks for a boost or
 *  a side. Each element can only be connected once; returns the nodes. */
type ElementGraph = { gain: GainNode; pan: StereoPannerNode };
const elementGraphs = new WeakMap<HTMLMediaElement, ElementGraph>();
function graphFor(a: HTMLMediaElement): ElementGraph | null {
  const have = elementGraphs.get(a);
  if (have) return have;
  const ctx = getAudioContext();
  if (!ctx) return null;
  try {
    const src = ctx.createMediaElementSource(a);
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    src.connect(gain);
    gain.connect(pan);
    pan.connect(ctx.destination);
    const g = { gain, pan };
    elementGraphs.set(a, g);
    return g;
  } catch {
    return null;
  }
}

/** The page's one shared AudioContext, for code that synthesizes its own
 *  sounds (lib/retroPcSounds). Null on the server or without Web Audio. */
export function getSharedAudioContext(): AudioContext | null {
  installGestureUnlock();
  return getAudioContext();
}

function onGesture(cb: () => void) {
  if (gestureUnlocked) { cb(); return () => {}; }
  gestureListeners.add(cb);
  return () => gestureListeners.delete(cb);
}

function clampVolume(v: number) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Every volume knob in the lab (master, banjo, fire crackling, clicks,
 * hover, swoosh, ...) is a 0..1 "how loud does this feel" slider, but
 * HTMLMediaElement.volume is LINEAR amplitude, and loudness perception is
 * not linear - amplitude 0.2 only measures about -14dB down, which barely
 * reads as "quiet" against a normalized source file (measured banjo.mp3:
 * peaks at -0dB, so slider .2 x default master .7 = .14 linear = only
 * -17dB, still clearly audible). This is why "everything at .2" still
 * sounded loud - the knobs were multiplying correctly, they just weren't
 * cutting the PERCEIVED level anywhere near as much as the number implied.
 *
 * Cubing the combined slider value before it reaches a.volume/node.volume
 * fixes that: same combined value, ~-51dB down instead of ~-17dB. Safe to
 * apply to an already-multiplied value like `master * bananjoVolume`
 * because (a*b)^3 == a^3*b^3 - cubing the product is identical to cubing
 * each slider and then multiplying them, so every call site that passes in
 * `master * config.xVolume` gets this for free with no other code changes.
 * Deliberately NOT applied to liveMultiplier/gainRef in the loop below -
 * those are structural ramps (fade transitions, the CRT zoom boost that
 * goes above 1), not user-facing loudness preferences, and cubing them
 * alongside the slider value would distort those separately-tuned curves.
 */
export function perceptualGain(v: number) {
  const c = clampVolume(v);
  return c * c * c;
}

/** How long a loop's enabled/disabled transition takes to fade by default -
 *  see `fadeMs` below. Long enough to read as a crossfade between scenes,
 *  short enough that it's not audibly still going by the time you've looked
 *  around the new one. */
const DEFAULT_LOOP_FADE_MS = 900;

/**
 * Background loop tied to a URL. Reacts live to `volume`, `enabled` and
 * `liveMultiplier` changes. Does not restart the underlying <audio> element
 * when any of those wiggle - only when the URL itself changes.
 */
/**
 * "Out in the woods at night": a made-up impulse response for a
 * ConvolverNode. A ground bounce a few ms after the direct sound, a couple of
 * late slaps off the tree line, then a sparse, dark diffuse tail (~1.5 s).
 * Generated once per AudioContext - no file to download.
 */
const outdoorImpulses = new WeakMap<BaseAudioContext, AudioBuffer>();
function outdoorImpulse(ctx: BaseAudioContext): AudioBuffer {
  const have = outdoorImpulses.get(ctx);
  if (have) return have;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * 2.0);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let seed = ch ? 0x9e3779b9 : 0x85ebca6b;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967295) * 2 - 1; };
    const pre = Math.floor(rate * 0.018);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate;
      // sparse at first (open air), denser later; decays to -60 dB in ~1.5 s
      const density = Math.min(1, 0.25 + t * 2.5);
      const n = Math.abs(rnd()) < density ? rnd() : 0;
      // one-pole low-pass: the forest swallows the highs of the tail
      lp += (n - lp) * (0.18 + 0.25 * Math.exp(-t * 3));
      d[i] = lp * Math.exp(-t / 0.22);
    }
    // discrete reflections: the ground, then the trees (a little different per ear)
    const tap = (ms: number, amp: number) => { const i = Math.floor(rate * ms / 1000); if (i < len) d[i] += amp; };
    tap(7 + ch * 0.6, 0.55);
    tap(64 + ch * 9, 0.22);
    tap(118 - ch * 7, 0.14);
    tap(190 + ch * 13, 0.08);
  }
  outdoorImpulses.set(ctx, buf);
  return buf;
}

/**
 * Where a looping emitter sits in the scene, for `spaceRef`: how far it is
 * (1 = the location's own saved camera shot; 2 = twice that far), and the
 * lab knobs for how the space sounds.
 */
export type LoopSpace = {
  /** distance / reference distance */
  far: number;
  /** reverb level at the reference distance (0 = dry) */
  reverb: number;
  /** low-pass cutoff (Hz) at the reference distance; closer = brighter */
  toneHz: number;
  /** 1 = fold the recording to mono (one instrument in one spot), 0 = keep its stereo */
  mono: number;
};

export function useCampsiteAudioLoop(
  url: string,
  {
    volume,
    enabled,
    liveMultiplier,
    fadeMs = DEFAULT_LOOP_FADE_MS,
    panRef,
    timeRef,
    spaceRef,
  }: {
    volume: number;
    enabled: boolean;
    /**
     * Optional per-frame multiplier on top of `volume`, e.g. a camera-flight
     * progress ref that a component inside the R3F canvas writes to every
     * frame (see CrtFocusCamera). Read directly off this hook's own rAF
     * loop, since the ref changes every frame and nothing about that needs
     * - or should cause - a React render.
     */
    liveMultiplier?: MutableRefObject<number>;
    /** Fade time, in ms, for the enabled/disabled transition. 0 snaps
     *  instantly instead of crossfading. */
    fadeMs?: number;
    /** -1 (hard left) .. 1 (hard right), updated every frame by the caller.
     *  Presence alone opts this loop into the Web Audio graph - see the
     *  header comment. */
    panRef?: MutableRefObject<number>;
    /** Optional playback position, updated from the live media element clock. */
    timeRef?: MutableRefObject<number>;
    /** Optional: make the (panned) loop sit IN the scene - mono point
     *  source, air absorption and outdoor reverb that follow the distance.
     *  Only used together with panRef. */
    spaceRef?: MutableRefObject<LoopSpace>;
  }
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);
  const loopGainRef = useRef<GainNode | null>(null);
  const spaceNodesRef = useRef<{ mono: GainNode; bypass: GainNode; airLp: BiquadFilterNode; wet: GainNode; dry: GainNode } | null>(null);
  // 0..1, eased toward `enabled` over fadeMs. A plain ref rather than state:
  // it moves every frame a transition is running, and driving that through
  // React would mean a re-render per frame for no reason - nothing else
  // reads it.
  const gainRef = useRef(enabled ? 1 : 0);
  const playingRef = useRef(false);

  useEffect(() => {
    installGestureUnlock();
    const a = new Audio(url);
    a.loop = true;
    // Don't download until it's actually wanted: every loop used to fetch its
    // whole file at page load (the arcade music and the gramophone song too),
    // several MB a phone had to pull before anything else. play() loads it.
    a.preload = "none";
    audioRef.current = a;

    // Only stand up the Web Audio graph for loops that actually asked to be
    // panned - createMediaElementSource can only be called once per element
    // and, once called, that element's sound ONLY comes out through
    // whatever the graph connects to, so an un-panned loop must never touch
    // this path. a.volume (the fade/gain logic below) still applies as a
    // pre-graph stage either way, so nothing about the existing volume
    // behavior changes for a panned loop.
    if (panRef) {
      const ctx = getAudioContext();
      if (ctx) {
        try {
          const source = ctx.createMediaElementSource(a);
          const panner = ctx.createStereoPanner();
          const gain = ctx.createGain();
          if (spaceRef) {
            /*
             * source -> mono fold -> gain -+-> air low-pass -> pan -> dry -> out
             *                              +-> reverb send -> convolver -> wet -> out
             * The reverb isn't panned: it's the woods all around you.
             */
            const mono = ctx.createGain();
            mono.channelCount = 1;
            mono.channelCountMode = "explicit";
            mono.channelInterpretation = "speakers";
            const stereoBypass = ctx.createGain();
            const airLp = ctx.createBiquadFilter();
            airLp.type = "lowpass";
            airLp.Q.value = 0.5;
            airLp.frequency.value = 4000;
            const dry = ctx.createGain();
            const conv = ctx.createConvolver();
            conv.buffer = outdoorImpulse(ctx);
            const wet = ctx.createGain();
            wet.gain.value = 0;
            const wetTone = ctx.createBiquadFilter();
            wetTone.type = "lowpass";
            wetTone.frequency.value = 2600;
            source.connect(mono);
            mono.connect(gain);
            source.connect(stereoBypass);
            stereoBypass.connect(gain);
            stereoBypass.gain.value = 0;
            gain.connect(airLp);
            airLp.connect(panner);
            panner.connect(dry);
            dry.connect(ctx.destination);
            gain.connect(conv);
            conv.connect(wetTone);
            wetTone.connect(wet);
            wet.connect(ctx.destination);
            spaceNodesRef.current = { mono, bypass: stereoBypass, airLp, wet, dry };
          } else {
            source.connect(gain);
            gain.connect(panner);
            panner.connect(ctx.destination);
          }
          pannerRef.current = panner;
          loopGainRef.current = gain;
        } catch {
          // Web Audio unavailable/blocked for this element - loop still
          // plays, just centered instead of panned.
          pannerRef.current = null;
        }
      }
    }

    return () => {
      a.pause();
      a.src = "";
      audioRef.current = null;
      pannerRef.current = null;
      loopGainRef.current = null;
      spaceNodesRef.current = null;
    };
  }, [url, panRef, spaceRef]);

  // One continuous loop for the life of the hook, owning a.volume and
  // a.play()/a.pause() outright. This used to be three separate effects (set
  // volume, react to liveMultiplier, play/pause on enabled) racing to touch
  // the same element - which is exactly what made an enabled toggle snap
  // instead of fade: the play/pause effect had no notion that a fade was
  // even happening. One loop, one owner.
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let offGesture: (() => void) | null = null;
    let enabledAt: number | null = null;
    const tryPlay = () => {
      const a = audioRef.current;
      if (!a) return;
      void a.play().then(() => console.log("[sounds] loop playing", { url, vol: a.volume, ctx: sharedAudioContext?.state ?? "none" })).catch((err: unknown) => {
        console.warn("[sounds] loop play blocked - will retry on next click", { url, error: String(err), gestureUnlocked });
        // Blocked for lack of a gesture yet - retry once one lands.
        offGesture?.();
        offGesture = onGesture(tryPlay);
      });
    };
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(0.25, (now - last) / 1000);
      last = now;
      const a = audioRef.current;
      if (a) {
        const target = enabled ? 1 : 0;
        // leaving: get out quickly so a scene's music doesn't trail into the next
        const fadeNow = target === 0 ? Math.min(fadeMs, 350) : fadeMs;
        const step = fadeNow > 0 ? dt / (fadeNow / 1000) : 1;
        gainRef.current += (target - gainRef.current) * Math.min(1, step);
        if (Math.abs(target - gainRef.current) < 0.004) gainRef.current = target;

        const tune = getSoundTune(url);
        // the tuned delay: hold off for that long after being switched on
        if (enabled && enabledAt === null) enabledAt = now;
        if (!enabled) enabledAt = null;
        const waiting = enabled && enabledAt !== null && now - enabledAt < tune.delay * 1000;
        if (waiting) gainRef.current = Math.min(gainRef.current, 0);

        if (gainRef.current > 0 && !playingRef.current) {
          playingRef.current = true;
          if (tune.start > 0 && a.currentTime < tune.start) { try { a.currentTime = tune.start; } catch { /* not seekable yet */ } }
          tryPlay();
        }
        a.playbackRate = Math.max(0.05, tune.rate);
        a.preservesPitch = false;
        // loop just the tuned stretch of the file
        if (playingRef.current) {
          if (tune.end > tune.start && a.currentTime >= tune.end) a.currentTime = Math.max(0, tune.start);
          else if (tune.start > 0 && a.currentTime < tune.start - 0.05) a.currentTime = tune.start;
        }
        const needGraph = IS_IOS || tune.vol > 1 || Math.abs(tune.pan) > 0.001;
        const g = needGraph || elementGraphs.has(a) ? (panRef ? null : graphFor(a)) : null;
        if (g) g.pan.pan.value = Math.max(-1, Math.min(1, tune.pan));
        if (timeRef) timeRef.current = Number.isFinite(a.currentTime) ? a.currentTime : 0;
        // clamped: a liveMultiplier may boost past 1 (the banjo up close),
        // and an <audio> element throws on any volume outside 0..1
        const live = liveMultiplier && Number.isFinite(liveMultiplier.current) ? liveMultiplier.current : 1;
        const level = Math.max(0, perceptualGain(volume) * live * gainRef.current);
        const gainNode = g?.gain ?? loopGainRef.current;
        if (gainNode && IS_IOS) {
          // iOS: the element's volume is ignored - the whole level goes on the gain
          gainNode.gain.value = level * Math.max(0, tune.vol);
        } else {
          a.volume = Math.max(0, Math.min(1, level * Math.min(1, Math.max(0, tune.vol))));
          if (gainNode) gainNode.gain.value = Math.max(1, tune.vol);
        }
        if (gainRef.current <= 0 && target === 0 && playingRef.current) {
          a.pause();
          playingRef.current = false;
        }
        if (pannerRef.current && panRef) {
          const p = (Number.isFinite(panRef.current) ? panRef.current : 0) + tune.pan;
          pannerRef.current.pan.value = Math.max(-1, Math.min(1, p));
        }
        const sp = spaceNodesRef.current;
        if (sp && spaceRef) {
          const s = spaceRef.current;
          const far = Math.max(0.15, Number.isFinite(s.far) ? s.far : 1);
          const t = sp.airLp.context.currentTime;
          // air soaks up the highs with distance (brighter up close)
          const hz = Math.max(700, Math.min(16000, (s.toneHz > 0 ? s.toneHz : 4000) / Math.pow(far, 1.1)));
          sp.airLp.frequency.setTargetAtTime(hz, t, 0.08);
          // the woods' reverb stays put while the direct sound falls away, so
          // the further off he is the more of what you hear is the echo
          const liveNow = liveMultiplier && Number.isFinite(liveMultiplier.current) ? liveMultiplier.current : 1;
          const wetLevel = Math.max(0, s.reverb) * Math.min(2.5, Math.pow(far, 0.6) / Math.max(0.35, liveNow));
          sp.wet.gain.setTargetAtTime(wetLevel, t, 0.08);
          const monoOn = (s.mono ?? 1) >= 0.5;
          sp.mono.gain.value = monoOn ? 1 : 0;
          sp.bypass.gain.value = monoOn ? 0 : 1;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      offGesture?.();
    };
  }, [url, volume, enabled, liveMultiplier, fadeMs, panRef, timeRef, spaceRef]);

}

/**
 * Fire-and-forget short cues. Clones the source node so overlapping calls
 * stack. Returns a stable callback so it plays nicely as a useEffect dep.
 */
/** A sound that is playing (or about to): fade it out and stop it. */
export type PlayingSound = { fade: (ms?: number) => void };

/*
 * Short cues are decoded once into memory and played straight from it through
 * Web Audio. Cloning an <audio> element per play - the old way - has to spin
 * up a fresh media decoder every time, and on iPhone that is a noticeable lag
 * (the scene-switch swoosh landed well after the camera had started moving).
 * A buffer starts on the next audio tick. The <audio> path stays as the
 * fallback until the buffer is ready or before the audio is unlocked.
 */
const bufferCache = new Map<string, Promise<AudioBuffer | null>>();
const decoded = new Map<string, AudioBuffer>();
function loadBuffer(url: string) {
  let p = bufferCache.get(url);
  if (!p) {
    p = (async () => {
      try {
        const ctx = getAudioContext();
        if (!ctx) return null;
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        decoded.set(url, buf);
        return buf;
      } catch { return null; }
    })();
    bufferCache.set(url, p);
  }
  return p;
}

export function useCampsiteOneShot(url: string) {
  const templateRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    installGestureUnlock();
    const a = new Audio(url);
    a.preload = "auto";
    templateRef.current = a;
    void loadBuffer(url);
    return () => { templateRef.current = null; };
  }, [url]);

  // The lab's per-sound tuning (getSoundTune) is applied here: speed, delay,
  // a start offset into the file, an end point, boost and pan.
  return useCallback((volume: number, rate = 1): PlayingSound | null => {
    const t = getSoundTune(url);
    const v = perceptualGain(volume);
    if (v <= 0 || t.vol <= 0) return null;
    const r = (Number.isFinite(rate) && rate > 0 ? rate : 1) * Math.max(0.05, t.rate);

    // fast path: decoded buffer on a running context
    const ctx = sharedAudioContext;
    const buf = decoded.get(url);
    if (ctx && buf && ctx.state === "running") {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = r;
      const gain = ctx.createGain();
      gain.gain.value = v * Math.max(0, t.vol);
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, t.pan));
      src.connect(gain); gain.connect(pan); pan.connect(ctx.destination);
      const when = ctx.currentTime + Math.max(0, t.delay);
      const offset = Math.max(0, Math.min(buf.duration - 0.01, t.start));
      if (t.end > t.start) src.start(when, offset, Math.max(0.01, t.end - offset));
      else src.start(when, offset);
      src.onended = () => { try { src.disconnect(); gain.disconnect(); pan.disconnect(); } catch { /* */ } };
      return {
        fade: (ms = 120) => {
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + ms / 1000);
          try { src.stop(now + ms / 1000 + 0.02); } catch { /* not started yet */ }
        },
      };
    }

    // fallback: an <audio> clone
    const template = templateRef.current;
    if (!template) { console.warn("[sounds] one-shot not loaded yet", { url }); return null; }
    const node = template.cloneNode(true) as HTMLAudioElement;
    node.volume = Math.min(1, v * Math.min(1, t.vol));
    node.playbackRate = r;
    node.preservesPitch = false;
    if (IS_IOS || t.vol > 1 || Math.abs(t.pan) > 0.001) {
      const g = graphFor(node);
      if (g) {
        g.gain.gain.value = IS_IOS ? v * Math.max(0, t.vol) : Math.max(1, t.vol);
        g.pan.pan.value = Math.max(-1, Math.min(1, t.pan));
      }
    }
    const go = () => {
      if ((node as AudioWithCancel).__cancelled) return;
      const begin = () => {
        if (t.start > 0) { try { node.currentTime = t.start; } catch { /* not seekable yet */ } }
        void node.play().catch((err: unknown) => console.warn("[sounds] one-shot BLOCKED", { url, error: String(err), gestureUnlocked }));
        if (t.end > t.start) window.setTimeout(() => node.pause(), ((t.end - Math.max(0, t.start)) / r) * 1000);
      };
      if (t.start > 0 && node.readyState < 1) node.addEventListener("loadedmetadata", begin, { once: true });
      else begin();
    };
    if (t.delay > 0) window.setTimeout(go, t.delay * 1000);
    else go();
    return { fade: (ms = 120) => fadeOutAudio(node, ms) };
  }, [url]);
}

type AudioWithCancel = HTMLAudioElement & { __cancelled?: boolean };

/** Fade an <audio> element out over `ms` and pause it. */
export function fadeOutAudio(a: HTMLAudioElement | PlayingSound | null | undefined, ms = 120) {
  if (!a) return;
  if (!(a instanceof HTMLMediaElement)) { a.fade(ms); return; }
  (a as AudioWithCancel).__cancelled = true;   // a delayed cue that hasn't started yet never will
  const g = elementGraphs.get(a);
  const start = g ? g.gain.gain.value : a.volume;
  const t0 = performance.now();
  const step = () => {
    const u = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
    if (g) g.gain.gain.value = Math.max(0, start * (1 - u));
    else a.volume = Math.max(0, start * (1 - u));
    if (u < 1) requestAnimationFrame(step);
    else a.pause();
  };
  requestAnimationFrame(step);
}

/**
 * A glass bottle tipping over and clinking on the ground: a couple of bright,
 * fast-decaying partials for the hit and a quieter second clink for the
 * bounce. Synthesized - there is no glass sample in public/sound.
 */
export function playGlassClink(volume: number, pan = 0) {
  const ctx = getSharedAudioContext();
  if (!ctx || volume <= 0) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const out = ctx.createGain();
  out.gain.value = Math.min(1, volume);
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  out.connect(p); p.connect(ctx.destination);
  const now = ctx.currentTime;
  const hit = (at: number, level: number, base: number) => {
    for (const [mul, amp, decay] of [[1, 1, 0.22], [2.76, 0.55, 0.12], [5.4, 0.3, 0.06]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now + at);
      g.gain.linearRampToValueAtTime(level * amp * 0.35, now + at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + decay * 1.6);
      o.connect(g); g.connect(out);
      o.start(now + at); o.stop(now + at + decay * 1.7);
    }
    // a little noise tick for the knock of glass on dirt
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
    const src = ctx.createBufferSource(); src.buffer = buf;
    const ng = ctx.createGain(); ng.gain.value = level * 0.25;
    src.connect(ng); ng.connect(out); src.start(now + at);
  };
  hit(0, 1, 1850);
  hit(0.13, 0.45, 1910);
  hit(0.21, 0.18, 1880);
}
