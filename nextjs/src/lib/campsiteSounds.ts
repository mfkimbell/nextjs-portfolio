"use client";

/**
 * Small campsite audio surface. Two hooks and one function:
 *
 *   useCampsiteAudioLoop(url, { volume, enabled })
 *     Long-running background loop (fire crackling, banjo). Creates a single
 *     HTMLAudioElement, sets loop=true, and updates volume live as the config
 *     changes. Autoplay only starts after the first user gesture — modern
 *     browsers block silent-page audio, and the title-card click on entry
 *     is the gesture we use to unlock it.
 *
 *   useCampsiteOneShot(url)
 *     Returns a play(volume) callback for short cues (swoosh, click, hover).
 *     Each call clones the underlying <audio> so overlapping triggers stack
 *     instead of cutting each other off.
 */

import { useCallback, useEffect, useRef } from "react";

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

/**
 * Background loop tied to a URL. Reacts live to `volume` and `enabled`
 * changes. Does not restart the loop when the volume knob wiggles — only
 * when the URL itself changes.
 */
export function useCampsiteAudioLoop(
  url: string,
  { volume, enabled }: { volume: number; enabled: boolean }
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = clampVolume(volume);
  }, [volume]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!enabled || clampVolume(volume) <= 0) {
      a.pause();
      return;
    }
    const tryPlay = () => { void a.play().catch(() => {}); };
    tryPlay();
    // If the browser blocked us (no gesture yet), retry on first click.
    const off = onGesture(tryPlay);
    return () => { off(); };
  }, [enabled, volume, url]);
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

  return useCallback((volume: number) => {
    const template = templateRef.current;
    if (!template) return;
    const v = clampVolume(volume);
    if (v <= 0) return;
    const node = template.cloneNode(true) as HTMLAudioElement;
    node.volume = v;
    void node.play().catch(() => {});
  }, []);
}
