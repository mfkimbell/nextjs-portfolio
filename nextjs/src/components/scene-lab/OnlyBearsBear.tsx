"use client";

/*
 * The OnlyBears gag.
 *
 * Click OnlyBears on the cabin laptop and, instead of a window opening, a paw
 * comes down over the top edge of the screen, shoves the lid, and it slams
 * shut on you. The camera pulls back off the closed laptop to show the old
 * bear standing behind the desk; he leans in, pats the lid twice and gives
 * you a look. Any click (or Back / Escape) and he lets go and sinks out of
 * sight behind the desk; the lid opens again once he has gone.
 *
 * THE MOTION IS A BAKED CLIP, authored in Blender against the real laptop,
 * table and cameras (blender/onlybears_close.blend), exported as
 * /wildpoly/onlybears_close.glb and played here on the bear's own skeleton.
 * Earlier versions posed him procedurally from keyposes made for the old CRT
 * and could only be checked by maths; they buried him under the laptop, hung
 * his beard across the screen and put his paw on the far side of the lid.
 * In Blender every beat was rendered from the site's own two cameras:
 *
 *   - in the close-up only his paw and forearm are ever in shot - no face,
 *     at any frame of the close (checked by casting rays across the frame)
 *   - he stands behind the table, feet on the floor, body clear of the lid
 *   - the paw rides the lid's top edge for the shove and lets go at 40% shut;
 *     the lid slams the rest of the way on its own
 *   - his wrist is exactly on its target through the shove and the pats
 *
 * The clip's bone values match the original rig to float precision (checked
 * against sit_log on the untouched bones), so it plays on the cloned skeleton
 * directly. On top of it, at runtime: the head turning to find the camera at
 * the end, blinks, the mouth kept shut, breathing, and the key light.
 *
 * Mounted under the computer's Selectable, so every number here is in the
 * COMPUTER'S local frame and he follows it wherever the lab moves it.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useOldBearLook, type OldBearLook } from "@/components/scene-lab/oldBear";

/** The baked routine (Blender: blender/onlybears_close.blend). */
export const ONLY_BEARS_CLIP_URL = "/wildpoly/onlybears_close.glb";

/*
 * The timeline, in seconds of clip time (at speed 1). These are the beats the
 * clip was baked to - change them only by re-baking it.
 *
 *   0.60  paw comes down over the top edge, fingers over the front of the screen
 *   1.10  a held beat, paw on the lid
 *   1.30  shoves: slow off the mark, accelerating; lets go at 40% shut
 *   1.72  SHUT - thud, a few degrees of bounce
 *   1.85  camera pulls back (pcRevealSettle) to show him behind the desk
 *   2.75  leans in, two pats on the closed lid
 *   3.20  looks at you
 *   3.45  shakes his head no (runtime, not baked)
 *   4.20  holds a beat, then onDone (the site takes you back to the campfire);
 *         a click before that sends him away instead
 *   4.20-5.20  lets go and sinks behind the desk
 *
 * The run-up is played faster than baked (INTRO_RATE) and starts at
 * reachStart, so the OnlyBears page is only up for ~0.6 s before it shuts.
 */
export const OB_T = {
  reachStart: 0.6,
  reachEnd: 1.1,
  closeStart: 1.3,
  closeEnd: 1.72,
  reveal: 1.85,
  patStart: 2.75,
  lookBack: 3.2,
  shakeStart: 3.45,
  shakeEnd: 4.15,
  hold: 4.2,
  exitEnd: 5.2,
};

/*
 * Where he stands, in the computer's frame, at the size of the rocking-chair
 * bear (the same character): straight out of the Blender scene.
 */
const BEAR_POSITION: [number, number, number] = [-0.1, -0.87, -0.7459];
const BEAR_SCALE = 2.547;

export type OnlyBearsState = {
  /** "in" = playing forwards / holding, "out" = leaving. */
  mode: "off" | "in" | "out";
  /** Clip time, seconds. */
  t: number;
  /** The camera should be pulled back to show the bear. */
  reveal: boolean;
  /** Seconds since he started to leave. */
  exitT: number;
};

export function makeOnlyBearsState(): OnlyBearsState {
  return { mode: "off", t: 0, reveal: false, exitT: 0 };
}

function lidCloseAt(t: number): number {
  if (t <= OB_T.closeStart) return 0;
  if (t < OB_T.closeEnd) return Math.pow((t - OB_T.closeStart) / (OB_T.closeEnd - OB_T.closeStart), 2.4);
  // the thunk: bounces a few degrees back open and settles
  const e = t - OB_T.closeEnd;
  return 1 - 0.07 * Math.max(0, Math.exp(-e * 9) * Math.sin(e * 26));
}

/**
 * How shut the lid is, 0 open .. 1 shut. The same curve the clip was baked
 * against, read off the same clip time, so the lid and his paw cannot
 * disagree - including when you send him away early and the clip runs on
 * through the shove.
 */
export function onlyBearsLidClose(s: OnlyBearsState): number {
  return s.mode === "off" ? 0 : lidCloseAt(s.t);
}

/** The gag's lab knobs (config keys `onlyBears*`). */
export type OnlyBearsTune = {
  /** Playback speed of the whole routine; 0.5 = twice as slow. */
  speed: number;
  /** Multiplies the bear's size. */
  scale: number;
  /** Nudge where he stands, in the computer's own units. */
  x: number;
  y: number;
  z: number;
  /** How far his head turns to look at you at the end, 0..1. */
  look: number;
  /** Breathing while he holds - chest only. */
  breath: number;
  /** The "no" head shake after the pats, 0 = none, 1 = full. */
  shake: number;
  /** Key light on him while the gag plays (0 = off). */
  keyLight: number;
  /** How far past him the key light carries, as a multiple of its distance
   *  to his head (1.2 = stops just behind him, 6 = lights the whole yard). */
  keyReach?: number;
};

export const ONLY_BEARS_TUNE_DEFAULTS: OnlyBearsTune = {
  speed: 1, scale: 1, x: 0, y: 0, z: 0, look: 0.85, breath: 0.3, shake: 1, keyLight: 2.5,
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/* Face axes of this rig's head bone, the same ones the talking bears use. */
const FACE_FWD_LOCAL = new THREE.Vector3(0, 0.848, 0.531).normalize();
const FACE_RIGHT_LOCAL = new THREE.Vector3(1, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** Where the key light sits relative to his head, in the computer's frame:
 *  out in front of the laptop, up, and off to his left. */
const KEY_OFFSET = new THREE.Vector3(0.9, 1.1, 2.6);
/** Clip seconds per real second before the slam: the reach, the held beat
 *  and the shove. From the slam on it plays as baked. */
const INTRO_RATE = { reach: 2, beat: 3, shove: 1.5 };
const introRate = (t: number) =>
  t < OB_T.reachEnd ? INTRO_RATE.reach : t < OB_T.closeStart ? INTRO_RATE.beat : t < OB_T.closeEnd ? INTRO_RATE.shove : 1;
/** How long he holds the end pose, after the head shake, before onDone. */
const DONE_PAUSE = 0.45;

export default function OnlyBearsBear({
  url,
  stateRef,
  onPawLand,
  onGone,
  onDone,
  tune = ONLY_BEARS_TUNE_DEFAULTS,
  look,
}: {
  url: string;
  tune?: OnlyBearsTune;
  /** The old bear's coat, glasses and beard (see oldBear.ts). */
  look?: OldBearLook;
  stateRef: React.MutableRefObject<OnlyBearsState>;
  /** The lid has slammed shut. */
  onPawLand?: () => void;
  /** Fully gone - the parent can unmount this. */
  onGone?: () => void;
  /** Played through to the end (pats, head shake, a beat): time to leave. */
  onDone?: () => void;
}) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const clipGltf = useGLTF(ONLY_BEARS_CLIP_URL) as unknown as { animations: THREE.AnimationClip[] };
  const model = useMemo(() => skeletonClone(gltf.scene) as THREE.Group, [gltf.scene]);
  useOldBearLook(look ? model : null, look ?? ({} as OldBearLook));
  const tuneRef = useRef(tune);
  tuneRef.current = tune;
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const rootRef = useRef<THREE.Group>(null);
  const frameRef = useRef<THREE.Group>(null);
  const keyRef = useRef<THREE.SpotLight>(null);
  const keyTargetRef = useRef<THREE.Object3D>(null);
  const keyLit = useRef(0);

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
    const clip = clipGltf.animations[0];
    const mixer = new THREE.AnimationMixer(model);
    const action = clip ? mixer.clipAction(clip) : null;
    if (action) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime(0);
    } else {
      console.warn("[scene] OnlyBears: the baked clip is missing - he will not move");
    }
    /*
     * The bones the runtime adjusts on top of the clip. Their clean clip pose
     * is put back before the mixer runs each frame: the mixer only WRITES a
     * bone when its keyed value changes, and these are constant for long
     * stretches (the jaw for the whole clip, everything during the hold).
     * Without the restore each frame's mouth seal, breath and head turn were
     * applied on top of the last frame's, and his face wound itself up.
     */
    const tweaked = ["jaw", "lip_lower", "chest", "head"].filter((n) => bones[n]);
    const clean = Object.fromEntries(tweaked.map((n) => [n, bones[n].quaternion.clone()])) as Record<string, THREE.Quaternion>;
    return { bones, face: face as THREE.Mesh | null, mixer, tweaked, clean };
  }, [model, clipGltf.animations]);

  /*
   * Any click once the camera has pulled back sends him away. Listened for
   * on the canvas itself so it works wherever you click.
   */
  useEffect(() => {
    const el = (get().events.connected as HTMLElement | undefined) ?? gl.domElement;
    const onClick = () => {
      const s = stateRef.current;
      if (s.mode === "in" && s.t >= OB_T.reveal) { s.mode = "out"; s.exitT = 0; }
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
    heldFor: 0,
    done: false,
    blinkAt: 2.5,
    blink: 0,
  }), []);

  useFrame((_, delta) => {
    const s = stateRef.current;
    const tu = tuneRef.current;
    const dt = Math.min(delta, 1 / 20) * Math.max(0.05, tu.speed);
    if (s.mode === "in") {
      // nothing happens before the paw arrives, so start there
      if (s.t < OB_T.reachStart) s.t = OB_T.reachStart;
      s.t = Math.min(OB_T.hold, s.t + dt * introRate(s.t));
    } else if (s.mode === "out") {
      // Sent away early: the clip runs on (quickly) to the hold, then into
      // the exit, so the lid finishes shutting and his paw stays on it.
      s.exitT += dt;
      s.t += dt * (s.t < OB_T.hold ? 3 : 1);
      if (s.t >= OB_T.exitEnd) { s.mode = "off"; s.t = 0; onGone?.(); }
    }
    // the camera stays on the screen for the slam, then pulls back for the rest
    s.reveal = (s.mode === "in" && s.t >= OB_T.reveal) || s.mode === "out";
    const t = s.t;

    // the slam - once per visit
    if (s.mode === "in" && !tmp.landed && t >= OB_T.closeEnd) { tmp.landed = true; onPawLand?.(); }
    if (s.mode === "off") { tmp.landed = false; tmp.heldFor = 0; tmp.done = false; }
    // played through: hold the end pose a moment, then hand back
    if (s.mode === "in" && t >= OB_T.hold) {
      tmp.heldFor += dt;
      if (!tmp.done && tmp.heldFor >= DONE_PAUSE) { tmp.done = true; onDone?.(); }
    }

    const root = rootRef.current;
    if (!root) return;
    root.visible = s.mode !== "off";
    root.position.set(BEAR_POSITION[0] + tu.x, BEAR_POSITION[1] + tu.y, BEAR_POSITION[2] + tu.z);
    root.scale.setScalar(BEAR_SCALE * Math.max(0.05, tu.scale));

    // the baked routine, from its clean pose (see `clean` above)
    for (const n of rig.tweaked) rig.bones[n].quaternion.copy(rig.clean[n]);
    rig.mixer.setTime(Math.min(t, OB_T.exitEnd));
    for (const n of rig.tweaked) rig.clean[n].copy(rig.bones[n].quaternion);

    // mouth kept shut: the talking bears' rest seal, on top of the clip
    if (rig.bones.jaw) rig.bones.jaw.quaternion.multiply(tmp.q.setFromAxisAngle(FACE_RIGHT_LOCAL, -0.015));
    if (rig.bones.lip_lower) rig.bones.lip_lower.quaternion.multiply(tmp.q.setFromAxisAngle(FACE_RIGHT_LOCAL, -0.10));

    // breathing while he holds - chest only, a leaf bone, so nothing swings
    const chest = rig.bones.chest;
    if (chest) {
      const breath = Math.sin(performance.now() / 1000 * 1.4) * 0.05 * tu.breath * smooth(OB_T.lookBack, OB_T.lookBack + 0.6, t);
      chest.quaternion.multiply(tmp.q.setFromAxisAngle(FACE_RIGHT_LOCAL, breath));
    }

    // head: turns to find you once he has patted it
    const head = rig.bones.head;
    if (head?.parent) {
      const lookW = smooth(OB_T.lookBack, OB_T.lookBack + 0.45, t) * (1 - smooth(OB_T.hold, OB_T.hold + 0.3, t)) * clamp01(tu.look);
      if (lookW > 0.001) {
        root.updateWorldMatrix(true, true);
        head.getWorldPosition(tmp.headPos);
        head.getWorldQuaternion(tmp.headWQ);
        tmp.fwd.copy(FACE_FWD_LOCAL).applyQuaternion(tmp.headWQ).normalize();
        tmp.toCam.copy(camera.position).sub(tmp.headPos).normalize();
        tmp.q.setFromUnitVectors(tmp.fwd, tmp.toCam);
        // no more than ~45 degrees, and only part of the way - a glance, not a snap
        const ang = 2 * Math.acos(Math.min(1, Math.abs(tmp.q.w)));
        const lim = Math.min(1, 0.8 / Math.max(ang, 1e-4));
        tmp.q2.identity().slerp(tmp.q, lookW * lim);
        head.parent.getWorldQuaternion(tmp.parentQ);
        const local = head.quaternion.clone();
        head.quaternion.copy(tmp.parentQ).invert().multiply(tmp.q2).multiply(tmp.parentQ).multiply(local);
      }

      // "no": two side-to-side shakes about the world's up axis, on top of
      // the look. Only on the way in - a fast-forwarded exit would make it
      // frantic. Starts and ends at zero, eased in and out.
      const shakeLen = OB_T.shakeEnd - OB_T.shakeStart;
      const u = (t - OB_T.shakeStart) / shakeLen;
      if (s.mode === "in" && u > 0 && u < 1 && tu.shake > 0.001) {
        const env = Math.sin(Math.PI * u);
        const yaw = Math.sin(2 * Math.PI * 2 * u) * 0.32 * env * tu.shake;
        root.updateWorldMatrix(true, false);
        head.parent.getWorldQuaternion(tmp.parentQ);
        tmp.q2.setFromAxisAngle(WORLD_UP, yaw);
        const local = head.quaternion.clone();
        head.quaternion.copy(tmp.parentQ).invert().multiply(tmp.q2).multiply(tmp.parentQ).multiply(local);
      }
    }

    /*
     * The key light: a warm spot from in front of the laptop and up to his
     * left, aimed at his head wherever it is. Fades up while he is there and
     * down again once he has gone.
     */
    const key = keyRef.current, keyTarget = keyTargetRef.current, frame = frameRef.current;
    if (key && keyTarget && frame) {
      keyLit.current += ((s.mode !== "off" ? 1 : 0) - keyLit.current) * (1 - Math.exp(-dt * 3));
      let falloff = 1;
      if (head) {
        root.updateWorldMatrix(true, true);
        head.getWorldPosition(tmp.headPos);
        frame.updateWorldMatrix(true, false);
        frame.worldToLocal(keyTarget.position.copy(tmp.headPos));
        key.position.copy(keyTarget.position).add(KEY_OFFSET);
        key.target = keyTarget;
        /*
         * Reach: the spot used to carry forever (distance 0), so its cone ran
         * on past him and lit up the yard behind. Cut it off a little past his
         * head instead, and lift the intensity by the falloff at his head so
         * he stays exactly as bright as before.
         */
        const reach = Math.max(1.05, tu.keyReach ?? 1.6);
        key.updateWorldMatrix(true, false);
        const toHead = key.getWorldPosition(new THREE.Vector3()).distanceTo(tmp.headPos);
        key.distance = toHead * reach;
        const r4 = Math.pow(1 / reach, 4);
        falloff = Math.max(0.05, (1 - r4) * (1 - r4));
      }
      key.intensity = (Math.max(0, tu.keyLight ?? 2.5) * keyLit.current) / falloff;
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
    <group ref={frameRef}>
      <object3D ref={keyTargetRef} />
      <spotLight ref={keyRef} userData={{ gagKeep: true }} color="#ffe6c8" intensity={0} angle={0.55} penumbra={0.65} decay={0} distance={0} />
      <group ref={rootRef} name="onlybears_bear" position={BEAR_POSITION} scale={BEAR_SCALE * tune.scale} visible={false}>
        <primitive object={model} />
      </group>
    </group>
  );
}

useGLTF.preload(ONLY_BEARS_CLIP_URL);
