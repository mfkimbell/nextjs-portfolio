/**
 * The campfire bears' dance (public/wildpoly/bear_dance.glb), retargeted in
 * Blender (blender/bear_dance.blend) onto the shared bear rig from:
 *
 * Attribution: motion from "Default dance" by photon (that one larry)
 * (https://sketchfab.com/Professor_E12), CC-BY-4.0.
 * https://sketchfab.com/3d-models/default-dance-04c233a6eec14039bf5b30fad562d3c7
 * (source file kept out of the site at blender/refs/default_dance.glb) One shared clock so Smokey and Maple move
 * in step: whoever starts it (the voice agent's dance tool, or the lab's
 * preview button) stamps `startedAt`, and every dancing bear reads it.
 */
export const BEAR_DANCE_URL = "/wildpoly/bear_dance.glb";
export const BEAR_DANCE_EVENT = "bears:dance";

let clipPromise: Promise<import("three").AnimationClip | null> | null = null;
/**
 * Loads the dance clip once, on demand (it isn't needed to show the scene, so
 * it stays off the loading path).
 */
export function loadBearDanceClip(): Promise<import("three").AnimationClip | null> {
  if (!clipPromise) {
    clipPromise = import("three-stdlib")
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(BEAR_DANCE_URL))
      .then((g) => g.animations[0] ?? null)
      .catch((error) => { console.warn("[dance] could not load the dance clip", error); clipPromise = null; return null; });
  }
  return clipPromise;
}

export const bearDance = {
  /** performance.now() when the current dance began; -1 = not dancing */
  startedAt: -1,
};

export function startBearDance(): void {
  bearDance.startedAt = performance.now();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BEAR_DANCE_EVENT));
}

export function stopBearDance(): void {
  bearDance.startedAt = -1;
}

/**
 * Where the dance is right now.
 *  - `real`: seconds since it was asked for (wall clock), `end`: when it's over
 *  - `t`: seconds into the clip (looping), `w`: how far the bears are into it
 *    (0 sitting, 1 fully dancing), eased in and out so they get up and sit down
 * The bears first toss their prop up (for `lead` seconds), then get up and
 * dance; the prop falls back into their paws as they sit down at the end.
 */
export function bearDanceState(
  clipSeconds: number, loops: number, speed: number, fade: number, lead = 0,
): { t: number; w: number; real: number; end: number; active: boolean } {
  const idle = { t: 0, w: 0, real: 0, end: 0, active: false };
  if (bearDance.startedAt < 0 || clipSeconds <= 0) return idle;
  const sp = Math.max(0.1, speed);
  const f = Math.max(0.05, fade);
  const real = (performance.now() - bearDance.startedAt) / 1000;
  const total = clipSeconds * Math.max(1, Math.round(loops));
  const end = Math.max(0, lead) + (total + f) / sp;
  if (real >= end) { bearDance.startedAt = -1; return idle; }
  const elapsed = (real - Math.max(0, lead)) * sp;
  if (elapsed <= 0) return { t: 0, w: 0, real, end, active: true };
  const ease = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
  const w = Math.min(ease(elapsed / f), ease((total + f - elapsed) / f));
  return { t: Math.min(elapsed, total) % clipSeconds, w, real, end, active: true };
}
