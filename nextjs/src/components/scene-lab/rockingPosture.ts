/*
 * The rocking-chair bear's posture - how he SITS, in plain degrees, on top of
 * sit_log and the per-bone pose deltas. Authored on /scene-lab/rocking-chair-bear
 * ("Posture" section) and saved with the rest of that pose into
 * src/config/rockingChairBearPose.json under `posture`; the site and the lab
 * both run applyRockingPosture() every frame after the pose deltas.
 */

import * as THREE from "three";

export type RockingPosture = {
  /** Upper body tips back into the chair (+) / sits forward (-), at the hips. */
  recline: number;
  /** Old-man hunch: chest, shoulders and head curl forward. */
  hunch: number;
  /** Head nod down (+) / up (-). */
  headPitch: number;
  /** Head turn. */
  headYaw: number;
  /** Head tilt. */
  headRoll: number;
};

export const ROCKING_POSTURE_DEFAULT: RockingPosture = {
  recline: 0, hunch: 0, headPitch: 0, headYaw: 0, headRoll: 0,
};

/** A posture out of the saved pose JSON, tolerating missing / old files. */
export function readRockingPosture(raw: unknown): RockingPosture {
  const r = (raw ?? {}) as Partial<Record<keyof RockingPosture, unknown>>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { recline: n(r.recline), hunch: n(r.hunch), headPitch: n(r.headPitch), headYaw: n(r.headYaw), headRoll: n(r.headRoll) };
}

export type PostureState = {
  /** The model the bones below were looked up in. When the model object is
   *  swapped (hot reload re-runs the clone, a new GLB), the cached bones
   *  belong to a copy nobody sees any more - so they are looked up again. */
  model: THREE.Object3D | null;
  bones: Record<string, THREE.Object3D | undefined> | null;
  /** Per bone: the pose the mixer left it in, and what this pass wrote. If
   *  the bone still holds exactly what we wrote, the clip does not animate
   *  that channel and we must start from the saved base, or the adjustment
   *  would pile up frame after frame. */
  guard: Map<string, { p: THREE.Vector3; q: THREE.Quaternion; wp: THREE.Vector3 | null; wq: THREE.Quaternion | null }>;
};

const _pv = new THREE.Vector3();
const _pv2 = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _pq2 = new THREE.Quaternion();
const _pm = new THREE.Matrix4();

/** Rotate a bone by a WORLD rotation `qW` about a WORLD pivot point. */
function rotateBoneAbout(bone: THREE.Object3D, pivotW: THREE.Vector3, qW: THREE.Quaternion) {
  const parent = bone.parent;
  if (!parent) return;
  bone.updateWorldMatrix(true, false);
  bone.getWorldPosition(_pv);
  bone.getWorldQuaternion(_pq);
  _pv.sub(pivotW).applyQuaternion(qW).add(pivotW);
  _pq.premultiply(qW);
  parent.updateWorldMatrix(true, false);
  _pm.copy(parent.matrixWorld).invert();
  bone.position.copy(_pv.applyMatrix4(_pm));
  parent.getWorldQuaternion(_pq2);
  bone.quaternion.copy(_pq2.invert().multiply(_pq));
  bone.updateWorldMatrix(false, true);
}

/**
 * How the rocking-chair bear sits (degrees):
 *   recline  the whole upper body tips back into the chair (+) or sits
 *            forward (-), pivoting at the hips - the legs stay where they are
 *   hunch    the old-man curl: chest, shoulders and head roll forward over
 *            the belly, pivoting at the bottom of the chest
 *   head     pitch (nod down +), turn, and tilt, about the head's own joint
 * All about the bear's own right / up / forward axes, so they mean the same
 * thing whichever way the chair faces. Runs after sit_log and the pose lab's
 * deltas, every frame.
 */
export function applyRockingPosture(model: THREE.Object3D, p: RockingPosture, st: PostureState) {
  const deg = THREE.MathUtils.degToRad;
  const recline = deg(p.recline);
  const hunch = deg(p.hunch);
  const hp = deg(p.headPitch);
  const hy = deg(p.headYaw);
  const hr = deg(p.headRoll);
  if (st.model !== model) {
    st.model = model;
    st.bones = null;
    st.guard.clear();
  }
  if (!st.bones) {
    st.bones = {};
    for (const n of ["center", "pelvis", "thigh_L", "thigh_R", "tail_01", "chest", "shoulder_L", "shoulder_R", "head"]) {
      st.bones[n] = model.getObjectByName(n) ?? undefined;
    }
  }
  const B = st.bones;
  const touched = ["center", "pelvis", "thigh_L", "thigh_R", "tail_01", "chest", "shoulder_L", "shoulder_R", "head"];
  // start every frame from the clip's pose (see PostureState.guard)
  for (const n of touched) {
    const b = B[n];
    if (!b) continue;
    let g = st.guard.get(n);
    if (!g) { g = { p: b.position.clone(), q: b.quaternion.clone(), wp: null, wq: null }; st.guard.set(n, g); }
    if (g.wp && b.position.equals(g.wp)) b.position.copy(g.p); else g.p.copy(b.position);
    if (g.wq && b.quaternion.equals(g.wq)) b.quaternion.copy(g.q); else g.q.copy(b.quaternion);
  }
  const any = recline !== 0 || hunch !== 0 || hp !== 0 || hy !== 0 || hr !== 0;
  if (any) {
    model.updateWorldMatrix(true, true);
    model.getWorldQuaternion(_pq);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(_pq).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_pq).normalize();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_pq).normalize();
    const q = new THREE.Quaternion();
    const qi = new THREE.Quaternion();

    // recline: tip `center` back about the hips, then hand the legs back
    // their old orientation so only the body above the seat moves
    const center = B.center;
    if (center && recline !== 0) {
      const pivot = center.getWorldPosition(new THREE.Vector3());
      q.setFromAxisAngle(right, -recline);
      rotateBoneAbout(center, pivot, q);
      qi.copy(q).invert();
      for (const n of ["pelvis", "thigh_L", "thigh_R", "tail_01"]) {
        const b = B[n];
        if (b) rotateBoneAbout(b, b.getWorldPosition(_pv2).clone(), qi);
      }
    }

    // hunch: the upper back curls forward from the bottom of the chest
    const chest = B.chest;
    if (chest && hunch !== 0) {
      const pivot = chest.getWorldPosition(new THREE.Vector3());
      q.setFromAxisAngle(right, hunch);
      for (const n of ["chest", "shoulder_L", "shoulder_R", "head"]) {
        const b = B[n];
        if (b) rotateBoneAbout(b, pivot, q);
      }
    }

    // head: turn, nod, tilt about its own joint
    const head = B.head;
    if (head && (hp !== 0 || hy !== 0 || hr !== 0)) {
      q.setFromAxisAngle(up, hy)
        .multiply(new THREE.Quaternion().setFromAxisAngle(right, hp))
        .multiply(new THREE.Quaternion().setFromAxisAngle(fwd, hr));
      rotateBoneAbout(head, head.getWorldPosition(new THREE.Vector3()), q);
    }
  }
  for (const n of touched) {
    const b = B[n];
    const g = st.guard.get(n);
    if (!b || !g) continue;
    g.wp = (g.wp ?? new THREE.Vector3()).copy(b.position);
    g.wq = (g.wq ?? new THREE.Quaternion()).copy(b.quaternion);
  }
}


export function makePostureState(): PostureState {
  return { model: null, bones: null, guard: new Map() };
}
