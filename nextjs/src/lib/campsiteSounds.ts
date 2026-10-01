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
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioContext) sharedAudioContext = new Ctor();
  if (sharedAudioContext.state === "suspended" && gestureUnlocked) {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
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
export function useCampsiteAudioLoop(
  url: string,
  {
    volume,
    enabled,
    liveMultiplier,
    fadeMs = DEFAULT_LOOP_FADE_MS,
    panRef,
    timeRef,
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
  }
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);
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
    a.preload = "auto";
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
          source.connect(panner);
          panner.connect(ctx.destination);
          pannerRef.current = panner;
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
    };
  }, [url, panRef]);

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
    const tryPlay = () => {
      const a = audioRef.current;
      if (!a) return;
      void a.play().catch(() => {
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
        const step = fadeMs > 0 ? dt / (fadeMs / 1000) : 1;
        gainRef.current += (target - gainRef.current) * Math.min(1, step);
        if (Math.abs(target - gainRef.current) < 0.004) gainRef.current = target;

        if (gainRef.current > 0 && !playingRef.current) {
          playingRef.current = true;
          tryPlay();
        }
        if (timeRef) timeRef.current = Number.isFinite(a.currentTime) ? a.currentTime : 0;
        // clamped: a liveMultiplier may boost past 1 (the banjo up close),
        // and an <audio> element throws on any volume outside 0..1
        const live = liveMultiplier && Number.isFinite(liveMultiplier.current) ? liveMultiplier.current : 1;
        a.volume = Math.max(0, Math.min(1, perceptualGain(volume) * live * gainRef.current));
        if (gainRef.current <= 0 && target === 0 && playingRef.current) {
          a.pause();
          playingRef.current = false;
        }
        if (pannerRef.current && panRef) {
          const p = panRef.current;
          pannerRef.current.pan.value = Number.isFinite(p) ? Math.max(-1, Math.min(1, p)) : 0;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      offGesture?.();
    };
  }, [url, volume, enabled, liveMultiplier, fadeMs, panRef, timeRef]);

}

/**
 * Fire-and-forget short cues. Clones the source node so overlapping calls
 * stack. Returns a stable callback so it plays nicely as a useEffect dep.
 */
export function useCampsiteOneShot(url: string) {
  const templateRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    installGestureUnlock();
    const a = new Audio(url);
    a.preload = "auto";
    templateRef.current = a;
    return () => { templateRef.current = null; };
  }, [url]);

  return useCallback((volume: number, rate = 1) => {
    const template = templateRef.current;
    if (!template) return;
    const v = perceptualGain(volume);
    if (v <= 0) return;
    const node = template.cloneNode(true) as HTMLAudioElement;
    node.volume = v;
    if (Number.isFinite(rate) && rate > 0) node.playbackRate = rate;
    void node.play().catch(() => {});
  }, []);
}
