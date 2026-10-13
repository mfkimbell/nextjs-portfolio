/**
 * The bears answering the phone: when someone calls the bears' number from a
 * site whose "Call us" bubble is open (see agent /call-watch), Smokey and
 * Maple toss the banjo and fish stick up, dig smartphones out of their
 * pockets and hold them to their ears for the length of the call, then put
 * them away and catch their things as the caller hangs up.
 *
 * The clip (public/wildpoly/bear_phone.glb) was keyed in Blender
 * (blender/bear_dance.blend, action phone_call): 0 sitting, 0.375 s both
 * paws flick up (the toss), 0.83 s right paw at the side pocket, 1.42 s phone
 * at the ear, 1.67 s settled. The phone mesh rides the right paw's bone in
 * the same file, so its fit comes straight from Blender.
 */
import * as THREE from "three";

export const BEAR_PHONE_URL = "/wildpoly/bear_phone.glb";
export const BEAR_PHONE_EVENT = "bears:phone";
/** clip time at which the paw has reached the pocket - the phone shows from here */
export const PHONE_IN_HAND_AT = 20 / 24;
/** clip time of the toss flick - the prop leaves the paw a touch before it */
export const PHONE_TOSS_AT = 7 / 24;

export const bearPhone = {
  /** performance.now() when the call was picked up; -1 = no call */
  startedAt: -1,
  /** performance.now() when the caller hung up; -1 = still on the line */
  endedAt: -1,
};

export function startBearPhone(): void {
  bearPhone.startedAt = performance.now();
  bearPhone.endedAt = -1;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BEAR_PHONE_EVENT));
}

export function endBearPhone(): void {
  if (bearPhone.startedAt < 0 || bearPhone.endedAt >= 0) return;
  bearPhone.endedAt = performance.now();
}

export type BearPhoneAssets = { clip: THREE.AnimationClip; phone: THREE.Object3D };
let assets: Promise<BearPhoneAssets | null> | null = null;
/** The clip and the phone mesh (its local transform on the paw's bone is kept). */
export function loadBearPhone(): Promise<BearPhoneAssets | null> {
  if (!assets) {
    assets = import("three-stdlib")
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(BEAR_PHONE_URL))
      .then((g) => {
        const clip = g.animations[0];
        const phone = g.scene.getObjectByName("BearPhone");
        if (!clip || !phone) return null;
        phone.removeFromParent();
        return { clip, phone };
      })
      .catch((error) => { console.warn("[phone] could not load the phone clip", error); assets = null; return null; });
  }
  return assets;
}

/**
 * Where the call is right now, for a clip `clipSeconds` long:
 *  - `t`: clip time - plays forward to the end, holds there for the call,
 *    then runs backwards once they hang up
 *  - `real`: seconds since pick-up, `sinceEnd`: seconds since hang-up (or -1)
 *  - `active`: false once the reverse has finished (then the state clears)
 */
export function bearPhoneState(clipSeconds: number): { t: number; real: number; sinceEnd: number; active: boolean } {
  const idle = { t: 0, real: 0, sinceEnd: -1, active: false };
  if (bearPhone.startedAt < 0 || clipSeconds <= 0) return idle;
  const now = performance.now();
  const real = (now - bearPhone.startedAt) / 1000;
  let t = Math.min(clipSeconds, real);
  let sinceEnd = -1;
  if (bearPhone.endedAt >= 0) {
    sinceEnd = (now - bearPhone.endedAt) / 1000;
    // hang up mid-pick-up: reverse from wherever it had got to
    const reachedAt = Math.min(clipSeconds, (bearPhone.endedAt - bearPhone.startedAt) / 1000);
    t = reachedAt - sinceEnd;
    if (t <= 0) { bearPhone.startedAt = -1; bearPhone.endedAt = -1; return idle; }
  }
  return { t, real, sinceEnd, active: true };
}
