"use client";

/**
 * Small campsite audio surface. Two hooks and one function:
 *
 *   useCampsiteAudioLoop(url, { volume, enabled, liveMultiplier?, fadeMs? })
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
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
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
  }
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
    return () => {
      a.pause();
      a.src = "";
      audioRef.current = null;
    };
  }, [url]);

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
        a.volume = clampVolume(volume) * (liveMultiplier ? liveMultiplier.current : 1) * gainRef.current;
        if (gainRef.current <= 0 && target === 0 && playingRef.current) {
          a.pause();
          playingRef.current = false;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      offGesture?.();
    };
  }, [url, volume, enabled, liveMultiplier, fadeMs]);
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
    const v = clampVolume(volume);
    if (v <= 0) return;
    const node = template.cloneNode(true) as HTMLAudioElement;
    node.volume = v;
    if (Number.isFinite(rate) && rate > 0) node.playbackRate = rate;
    void node.play().catch(() => {});
  }, []);
}
