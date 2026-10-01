/*
 * The rocking chair actually ROCKS: the chair rolls forward and back on its
 * runners, the bear rides it, and his body goes with the motion - leaning
 * back into the chair as it tips back, hunching forward over his knees as it
 * tips forward - while his legs stay still instead of doing sit_log's kick.
 *
 * The chair's numbers were measured off public/rocking-chair.glb in Blender
 * (fitting a circle to the bottom edge of each runner), in the GLB's own
 * space (+Y up, the seat faces -Z, the backrest is at +Z):
 *
 *   runner arc radius   0.39      both runners, fit residual < 1 cm
 *   arc centre          (0.035, -0.293, -0.30)   midway between the runners
 *   runner bottom       y = -0.683  (the floor, at rest)
 *   runner heading      the runners are splayed and the whole chair is
 *                       modelled ~8 degrees off its own Z axis, so the
 *                       rocking axis is X turned by that much, not plain X
 *
 * A rocker is a wheel: to rock without sliding or sinking through the floor
 * it has to ROLL, i.e. turn by theta about the arc's centre while that centre
 * travels R * theta along the floor. Checked in Blender at +/-12 degrees -
 * the runners stay on the floor to within ~5 mm and the contact point walks
 * along the arc the way a real chair's does. (Turning about the model's
 * middle instead is what made the old version look like it was swaying.)
 *
 * The motion settings live in src/config/rockingChairBearPose.json under
 * `rock`, tuned on /scene-lab/rocking-chair-bear. Everything is a pure
 * function of the frame clock, so the chair (in its own component) and the
 * bear (in Animal) stay in lock-step without passing refs between them.
 */

import * as THREE from "three";
import type { RockingPosture } from "./rockingPosture";

/* --- chair geometry (GLB space, measured in Blender) ---------------------- */

const ROCKER_CENTRE = new THREE.Vector3(0.035, -0.293, -0.3);
const ROCKER_RADIUS = 0.39;
/** Rocking axis: the chair's own left-right, perpendicular to the runners.
 *  Turning +theta about it tips the chair BACK (top of the backrest to +Z). */
const ROCK_AXIS = new THREE.Vector3(0.99, 0, 0.139).normalize();
/** Along the floor toward the chair's front. */
const ROCK_FWD = new THREE.Vector3(0.139, 0, -0.99).normalize();

/* --- settings -------------------------------------------------------------- */

/** How his body is changed at one end of the swing, degrees, added on top of
 *  the saved posture (so the middle of the swing IS the saved posture). */
export type RockEnd = {
  /** + leans the upper body back into the chair, - sits it forward */
  lean: number;
  /** + curls the back forward over his belly, - straightens it */
  hunch: number;
  /** + nods the head down, - tips it up */
  head: number;
};

export type RockMotion = {
  /** false = sit still (no rock, no sway) */
  enabled: boolean;
  /** How far the chair tips each way, degrees. */
  amount: number;
  /** Seconds for one full back-and-forth. */
  period: number;
  /** Degrees of phase his body leads the chair by - he is the one pushing it,
   *  so he starts to move a moment before the chair follows. */
  lead: number;
  /** His body when the chair is tipped all the way FORWARD. */
  front: RockEnd;
  /** His body when the chair is tipped all the way BACK. */
  back: RockEnd;
};

export const ROCK_MOTION_DEFAULT: RockMotion = {
  enabled: true,
  amount: 9,
  period: 2.8,
  lead: 25,
  front: { lean: -6, hunch: 14, head: -10 },
  back: { lean: 10, hunch: -8, head: 12 },
};

function readEnd(raw: unknown, d: RockEnd): RockEnd {
  const r = (raw ?? {}) as Partial<Record<keyof RockEnd, unknown>>;
  const n = (v: unknown, x: number) => (typeof v === "number" && Number.isFinite(v) ? v : x);
  return { lean: n(r.lean, d.lean), hunch: n(r.hunch, d.hunch), head: n(r.head, d.head) };
}

export function readRockMotion(raw: unknown): RockMotion {
  const r = (raw ?? {}) as Partial<Record<keyof RockMotion, unknown>>;
  const D = ROCK_MOTION_DEFAULT;
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : D.enabled,
    amount: n(r.amount, D.amount),
    period: Math.max(0.3, n(r.period, D.period)),
    lead: n(r.lead, D.lead),
    front: readEnd(r.front, D.front),
    back: readEnd(r.back, D.back),
  };
}

/* --- the motion ------------------------------------------------------------ */

/** Where in the swing we are: `theta` is the chair's tip in radians (+ =
 *  back), `body` runs -1 (his front pose) .. 0 (saved posture) .. +1 (his
 *  back pose), a little ahead of the chair by `lead`. */
export type RockState = { theta: number; body: number };

/** Lab preview: hold the chair (and him) at one end instead of rocking. */
export type RockHold = "rock" | "front" | "back" | "middle";

export function rockState(t: number, m: RockMotion, hold: RockHold = "rock"): RockState {
  if (!m.enabled || hold === "middle") return { theta: 0, body: 0 };
  const a = THREE.MathUtils.degToRad(m.amount);
  if (hold === "front") return { theta: -a, body: -1 };
  if (hold === "back") return { theta: a, body: 1 };
  const ph = (t / m.period) * Math.PI * 2;
  return { theta: a * Math.sin(ph), body: Math.sin(ph + THREE.MathUtils.degToRad(m.lead)) };
}

/** The chair's tip at time t, radians; + = tipped back. */
export function rockAngle(t: number, m: RockMotion): number {
  return rockState(t, m).theta;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/**
 * Put the group holding the chair (and the bear) where a chair rolled by
 * `theta` on its runners would be. The group sits inside the chair's
 * Selectable at identity, so this is all in the GLB's own space.
 */
export function applyChairRock(group: THREE.Object3D, theta: number) {
  _q.setFromAxisAngle(ROCK_AXIS, theta);
  group.quaternion.copy(_q);
  // position = C + roll - R(theta) * C : turn about the arc centre, then
  // roll that centre back along the floor by R * theta
  _v.copy(ROCKER_CENTRE).applyQuaternion(_q);
  group.position.copy(ROCKER_CENTRE).sub(_v).addScaledVector(ROCK_FWD, -ROCKER_RADIUS * theta);
}

/**
 * Blend between the saved posture and the two ends. A plain "front when
 * s < 0, back when s > 0" would jolt at mid-swing whenever the two ends are
 * not mirror images; this curve passes through front at -1, the saved
 * posture at 0 and back at +1 with no kink in between.
 */
function blend(front: number, back: number, s: number) {
  return ((back - front) / 2) * s + ((back + front) / 2) * s * s;
}

/** The bear's posture for this point in the swing (see RockState.body). */
export function rockPosture(base: RockingPosture, body: number, m: RockMotion, out: RockingPosture): RockingPosture {
  out.headYaw = base.headYaw;
  out.headRoll = base.headRoll;
  const s = m.enabled ? Math.max(-1, Math.min(1, body)) : 0;
  out.recline = base.recline + blend(m.front.lean, m.back.lean, s);
  out.hunch = base.hunch + blend(m.front.hunch, m.back.hunch, s);
  out.headPitch = base.headPitch + blend(m.front.head, m.back.head, s);
  return out;
}

/* --- still legs ------------------------------------------------------------ */

/** sit_log swings the legs (the "kick" every log bear does, ~1.5 s cycle).
 *  A man in a rocking chair keeps his feet planted, so these bones are held
 *  at one frame of the clip instead - frame 2, measured in Blender as the
 *  closest to the swing's average, so the legs sit where they always did. */
export const LEG_LOCK_BONES = [
  "thigh_L", "leg_L", "foot_L", "toe_L",
  "thigh_R", "leg_R", "foot_R", "toe_R",
] as const;
export const LEG_LOCK_TIME = 2 / 24;

export type LegLock = { bone: THREE.Object3D; q: THREE.Quaternion }[];

/** Sample each leg bone's rotation out of `clip` at LEG_LOCK_TIME. */
export function makeLegLock(model: THREE.Object3D, clip: THREE.AnimationClip | undefined): LegLock {
  const out: LegLock = [];
  for (const name of LEG_LOCK_BONES) {
    const bone = model.getObjectByName(name);
    if (!bone) continue;
    const q = bone.quaternion.clone();
    const track = clip?.tracks.find((tr) => tr.name === `${name}.quaternion`);
    if (track) {
      const v = new THREE.QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4))
        .evaluate(LEG_LOCK_TIME);
      q.set(v[0], v[1], v[2], v[3]).normalize();
    }
    out.push({ bone, q });
  }
  return out;
}

/** Run after the mixer, before any pose layers: put the legs back. */
export function applyLegLock(lock: LegLock) {
  for (const { bone, q } of lock) bone.quaternion.copy(q);
}
