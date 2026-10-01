"use client";

/*
 * The OnlyBears gag.
 *
 * Click OnlyBears on the cabin computer and, instead of a window, a bear
 * who has been standing behind the monitor the whole time rises up, reaches
 * over the top of it and slowly lays a huge paw across the screen. The camera
 * then pulls back and you see him: leaning over the computer, paw on the
 * glass, looking straight at you. Any click (or Back / Escape) and he takes
 * the paw back and sinks out of sight again.
 *
 * The pose was built in Blender against the real props - the computer, table,
 * chair and cabin at their saved lab transforms - with IK on the arms, then
 * exported as glTF-local bone rotations to src/config/onlyBearsPose.json:
 *
 *   tucked  standing behind the monitor, arms in, leaning a little
 *   raised  right arm up above the monitor, paw forward
 *   over    arm across the top, paw starting down the glass, left paw on desk
 *   cover   leaning in over the monitor, paw flat over the whole screen
 *
 * Those rotations were checked against sit_log's own frame-1 values (0.00
 * degrees apart), so what the site plays is what was posed in Blender. At
 * runtime this only interpolates between them, adds the head turning to find
 * the camera, blinks, and keeps the mouth shut.
 *
 * Mounted as a child of the computer's Selectable, so every number here is in
 * the COMPUTER'S local frame and he follows it wherever the lab moves it.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import poseRaw from "@/config/onlyBearsPose.json";
import { useOldBearLook, type OldBearLook } from "@/components/scene-lab/oldBear";

type Quat = [number, number, number, number];
type PoseFile = {
  holdFrame: number;
  root: { position: [number, number, number]; rotationY: number; scale: number; hiddenDrop: number };
  handScale: Record<string, number>;
  keys: Record<"tucked" | "raised" | "over" | "cover", Record<string, Quat>>;
};
const POSE = poseRaw as unknown as PoseFile;
const KEY_ORDER = ["tucked", "raised", "over", "cover"] as const;
const POSED_BONES = Object.keys(POSE.keys.cover);

/*
 * The timeline, in seconds from the click. The paw's last leg - over the top
 * and down the glass - is deliberately the slowest part.
 */
export const OB_T = {
  riseEnd: 1.1,      // up from behind the monitor, arms tucked
  raisedEnd: 2.0,    // right arm comes up above the monitor
  overEnd: 3.0,      // over the top
  coverEnd: 4.6,     // ...and slowly down across the screen
  reveal: 5.3,       // camera starts pulling back
  lookIn: 5.0,       // head turns to find you
};
const T_MAX = OB_T.reveal + 0.5;

/** The gag's live state, shared with the camera and the desktop. */
export type OnlyBearsState = {
  /** "in" = playing forwards / holding, "out" = taking the paw back. */
  mode: "off" | "in" | "out";
  t: number;
  /** The camera should be pulled back to show the bear. */
  reveal: boolean;
};

export function makeOnlyBearsState(): OnlyBearsState {
  return { mode: "off", t: 0, reveal: false };
}

/** The gag's lab knobs (config keys `onlyBears*`). */
export type OnlyBearsTune = {
  /** Playback speed of the whole routine; 0.5 = twice as slow. */
  speed: number;
  /** How big the paw grows on the way over (1 = normal paw). */
  pawScale: number;
  /** Multiplies the bear's size. */
  scale: number;
  /** Nudge where he stands, in the computer's own units (x right, y up,
   *  z towards the viewer). */
  x: number;
  y: number;
  z: number;
  /** Extra forward lean at the cover pose, degrees (negative = more upright). */
  lean: number;
  /** How far his head turns to look at you, 0..1. */
  look: number;
  /** Breathing while he holds the pose - chest only, arms stay put. */
  breath: number;
};

export const ONLY_BEARS_TUNE_DEFAULTS: OnlyBearsTune = {
  speed: 1, pawScale: 1.6, scale: 1, x: 0, y: 0, z: 0, lean: 0, look: 0.85, breath: 0.3,
};

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/* Face axes of this rig's head bone, the same ones the talking bears use. */
const FACE_FWD_LOCAL = new THREE.Vector3(0, 0.848, 0.531).normalize();
const FACE_RIGHT_LOCAL = new THREE.Vector3(1, 0, 0);

export default function OnlyBearsBear({
  url,
  stateRef,
  onPawLand,
  onGone,
  tune = ONLY_BEARS_TUNE_DEFAULTS,
  look,
}: {
  url: string;
  /** Lab knobs for the routine. */
  tune?: OnlyBearsTune;
  /** The old bear's coat, glasses and beard (see oldBear.ts). */
  look?: OldBearLook;
  stateRef: React.MutableRefObject<OnlyBearsState>;
  /** The paw has come to rest on the glass. */
  onPawLand?: () => void;
  /** Fully retracted - the parent can unmount this. */
  onGone?: () => void;
}) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] };
  const model = useMemo(() => skeletonClone(gltf.scene) as THREE.Group, [gltf.scene]);
  useOldBearLook(look ? model : null, look ?? ({} as OldBearLook));
  const tuneRef = useRef(tune);
  tuneRef.current = tune;
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const rootRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  /*
   * Bones, the clip pose and the keyposes as THREE quaternions. sit_log is
   * evaluated ONCE at the authored frame and never advanced - every bone the
   * gag moves is then written absolutely each frame, and the rest keep the
   * clip's pose.
   */
  const rig = useMemo(() => {
    const bones: Record<string, THREE.Bone> = {};
    let face: THREE.Mesh | null = null;
    model.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone) bones[o.name] = b;
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        if (m.morphTargetDictionary && "eyeBlink" in m.morphTargetDictionary) face = m;
      }
      // the stray helper sphere some exports of this rig carry
      if (o.name.startsWith("Icosphere")) o.visible = false;
    });
    const clip = gltf.animations.find((a) => a.name === "sit_log") ?? gltf.animations[0];
    if (clip) {
      const mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(clip);
      action.play();
      mixer.setTime(POSE.holdFrame / 24);
      // Left running but never advanced again. Stopping the action would hand
      // the bones back their bind pose (the mixer restores original state
      // when a binding's last action deactivates).
    }
    const keys = KEY_ORDER.map((k) => {
      const out: Record<string, THREE.Quaternion> = {};
      for (const [name, q] of Object.entries(POSE.keys[k])) out[name] = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
      return out;
    });
    const headRest = bones.head ? bones.head.quaternion.clone() : null;
    const jawRest = bones.jaw ? bones.jaw.quaternion.clone() : null;
    const lipRest = bones.lip_lower ? bones.lip_lower.quaternion.clone() : null;
    const handRest = bones.hand_R ? bones.hand_R.scale.clone() : new THREE.Vector3(1, 1, 1);
    return { bones, face: face as THREE.Mesh | null, keys, headRest, jawRest, lipRest, handRest };
  }, [model, gltf.animations]);

  // Mouth closed: the same rest seal the talking bears use.
  useEffect(() => {
    const q = new THREE.Quaternion();
    if (rig.bones.jaw && rig.jawRest) {
      rig.bones.jaw.quaternion.copy(rig.jawRest).multiply(q.setFromAxisAngle(FACE_RIGHT_LOCAL, -0.015));
    }
    if (rig.bones.lip_lower && rig.lipRest) {
      rig.bones.lip_lower.quaternion.copy(rig.lipRest).multiply(q.setFromAxisAngle(FACE_RIGHT_LOCAL, -0.10));
    }
    const f = rig.face;
    if (f?.morphTargetInfluences && f.morphTargetDictionary) {
      for (const k of ["jawOpen", "mouthWide", "mouthRound"]) {
        const i = f.morphTargetDictionary[k];
        if (i !== undefined) f.morphTargetInfluences[i] = 0;
      }
    }
  }, [rig]);

  /*
   * Any click once he is looking at you sends him away. Listened for on the
   * canvas itself so it works wherever you click - he fills most of the view.
   */
  useEffect(() => {
    const el = (get().events.connected as HTMLElement | undefined) ?? gl.domElement;
    const onClick = () => {
      const s = stateRef.current;
      if (s.mode === "in" && s.t >= OB_T.reveal) { s.mode = "out"; s.reveal = false; }
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [get, gl, stateRef]);

  const tmp = useMemo(() => ({
    q: new THREE.Quaternion(),
    q2: new THREE.Quaternion(),
    parentQ: new THREE.Quaternion(),
    headWQ: new THREE.Quaternion(),
    headPos: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    toCam: new THREE.Vector3(),
    landed: false,
    chestRest: null as THREE.Quaternion | null,
    blinkAt: 2.5,
    blink: 0,
  }), []);

  useFrame((_, delta) => {
    const s = stateRef.current;
    const tu = tuneRef.current;
    const dt = Math.min(delta, 1 / 20) * Math.max(0.05, tu.speed);
    if (s.mode === "in") s.t = Math.min(T_MAX, s.t + dt);
    else if (s.mode === "out") {
      // taking it back is quicker than giving it
      s.t = Math.max(0, s.t - dt * 1.7);
      if (s.t <= 0) { s.mode = "off"; onGone?.(); }
    }
    s.reveal = s.mode === "in" && s.t >= OB_T.reveal;
    const t = s.t;

    // the paw landing - once per visit
    if (s.mode === "in" && !tmp.landed && t >= OB_T.coverEnd) { tmp.landed = true; onPawLand?.(); }
    if (s.mode !== "in") tmp.landed = false;

    const root = rootRef.current;
    if (!root) return;
    root.visible = s.mode !== "off";

    // rise from behind the monitor
    const rise = smooth(0, OB_T.riseEnd, t);
    const [px, py, pz] = POSE.root.position;
    root.position.set(px + tu.x, py + tu.y - POSE.root.hiddenDrop * (1 - rise), pz + tu.z);
    root.scale.setScalar(POSE.root.scale * Math.max(0.05, tu.scale));

    // which pair of keyposes, and how far between them
    const segs: Array<[number, number, number]> = [
      [0, OB_T.riseEnd, 0],
      [OB_T.riseEnd, OB_T.raisedEnd, 0],
      [OB_T.raisedEnd, OB_T.overEnd, 1],
      [OB_T.overEnd, OB_T.coverEnd, 2],
    ];
    let a = 3, u = 1;
    for (const [t0, t1, from] of segs) {
      if (t < t1) { a = from; u = t0 === 0 ? 0 : smooth(t0, t1, t); break; }
    }
    const A = rig.keys[a];
    const B = rig.keys[Math.min(3, a + 1)];
    for (const name of POSED_BONES) {
      const b = rig.bones[name];
      if (!b || !A[name] || !B[name]) continue;
      b.quaternion.slerpQuaternions(A[name], B[name], a === 3 ? 0 : u);
    }
    // the paw grows to its full size on the way over, out of sight above
    const grow = smooth(OB_T.riseEnd, OB_T.overEnd, t);
    const hs = 1 + (tu.pawScale - 1) * grow;
    rig.bones.hand_R?.scale.copy(rig.handRest).multiplyScalar(hs);

    /*
     * Extra lean, from the lab. Applied to `center` about the bear's own
     * right-hand axis in WORLD terms (the Blender lean was made the same way),
     * and only as he leans in - it grows over the "over -> cover" leg.
     */
    const center = rig.bones.center;
    if (center?.parent && Math.abs(tu.lean) > 0.01) {
      const w = smooth(OB_T.raisedEnd, OB_T.coverEnd, t);
      root.updateWorldMatrix(true, false);
      root.getWorldQuaternion(tmp.headWQ);
      tmp.fwd.set(1, 0, 0).applyQuaternion(tmp.headWQ).normalize();
      tmp.q.setFromAxisAngle(tmp.fwd, THREE.MathUtils.degToRad(tu.lean) * w);
      center.parent.updateWorldMatrix(true, false);
      center.parent.getWorldQuaternion(tmp.parentQ);
      const local = center.quaternion.clone();
      center.quaternion.copy(tmp.parentQ).invert().multiply(tmp.q).multiply(tmp.parentQ).multiply(local);
    }

    /*
     * Breathing. On the CHEST only - a leaf bone in this rig, so it swells
     * the ribcage and nothing hangs off it. It used to rock `center`, which
     * carries the shoulders, and his arms bobbed up and down with every
     * breath while the paw was meant to be resting on the glass.
     */
    const chest = rig.bones.chest;
    if (chest) {
      if (!tmp.chestRest) tmp.chestRest = chest.quaternion.clone();
      const breath = Math.sin(performance.now() / 1000 * 1.4) * 0.05 * tu.breath
        * smooth(OB_T.coverEnd, OB_T.coverEnd + 0.6, t);
      chest.quaternion.copy(tmp.chestRest).multiply(tmp.q2.setFromAxisAngle(FACE_RIGHT_LOCAL, breath));
    }

    // head: turns to find the camera once the paw is down
    const head = rig.bones.head;
    if (head && rig.headRest) {
      head.quaternion.copy(rig.headRest);
      const look = smooth(OB_T.lookIn, OB_T.lookIn + 1.0, t) * Math.min(1, Math.max(0, tu.look));
      if (look > 0.001 && head.parent) {
        head.updateWorldMatrix(true, false);
        head.getWorldPosition(tmp.headPos);
        head.getWorldQuaternion(tmp.headWQ);
        tmp.fwd.copy(FACE_FWD_LOCAL).applyQuaternion(tmp.headWQ).normalize();
        tmp.toCam.copy(camera.position).sub(tmp.headPos).normalize();
        tmp.q.setFromUnitVectors(tmp.fwd, tmp.toCam);
        // no more than ~45 degrees, and only part of the way - a glance, not a snap
        const ang = 2 * Math.acos(Math.min(1, Math.abs(tmp.q.w)));
        const lim = Math.min(1, 0.8 / Math.max(ang, 1e-4));
        tmp.q2.identity().slerp(tmp.q, look * lim);
        head.parent.getWorldQuaternion(tmp.parentQ);
        // world delta -> head local: local' = P^-1 * D * P * local
        const local = head.quaternion.clone();
        head.quaternion.copy(tmp.parentQ).invert().multiply(tmp.q2).multiply(tmp.parentQ).multiply(local);
      }
    }

    // The screen lights the paw from underneath as it comes down over the
    // glass - otherwise, lit from the cabin behind it, the paw that fills the
    // close-up is a flat black shape.
    if (glowRef.current) {
      glowRef.current.intensity = 0.9 * smooth(OB_T.overEnd - 0.4, OB_T.coverEnd, t) * (s.mode === "off" ? 0 : 1);
    }

    // blinks, every few seconds
    const f = rig.face;
    const bi = f?.morphTargetDictionary?.eyeBlink;
    if (f?.morphTargetInfluences && bi !== undefined) {
      const now = performance.now() / 1000;
      if (now > tmp.blinkAt) { tmp.blink = 1; tmp.blinkAt = now + 2.2 + Math.random() * 3.5; }
      tmp.blink = Math.max(0, tmp.blink - dt * 7);
      const v = tmp.blink > 0.5 ? (1 - tmp.blink) * 2 : tmp.blink * 2;
      f.morphTargetInfluences[bi] = Math.min(1, v * 1.6);
    }
  });

  return (
    <>
    {/* in the computer's own frame, just out in front of the screen */}
    <pointLight ref={glowRef} position={[-0.1, 0.95, 1.2]} color="#a9dcff" intensity={0} distance={0.6} decay={2} />
    <group
      ref={rootRef}
      name="onlybears_bear"
      position={POSE.root.position}
      rotation={[0, POSE.root.rotationY, 0]}
      scale={POSE.root.scale * tune.scale}
      visible={false}
    >
      <primitive object={model} />
    </group>
    </>
  );
}
