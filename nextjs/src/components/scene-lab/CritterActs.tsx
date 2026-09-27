"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { EMPTY_OVERRIDE, type CampfireSceneConfig } from "@/components/scene-lab/sceneConfig";
import { tipAt, tipBarrier, type TipTable } from "@/components/scene-lab/tipTables";

/**
 * ============================================================================
 *  Scripted critters
 * ============================================================================
 *
 * One scripted performance is left in this file - the raccoon that fetches a
 * doughnut - but the engine under it is general (legs, clips, gaits, reach
 * chains, carried props) and the condor and moose that used to live here were
 * built on it too. TipOver, at the bottom, is the camp's other half: props that
 * topple under their own weight and knock each other down.
 *
 * A performance is a list of LEGS. Each leg says where the critter ends up,
 * how long it takes to get there, which animation clip plays on the way, and
 * optionally: how high to arc, which way to face on arrival, whether to dip its
 * head, and whether THIS is the leg where it takes the prop. Everything is
 * expressed in location-0 local space - the same frame the campfire props live
 * in - so a path can be written straight from an object's slider values.
 *
 * Why an engine and not three bespoke components: the fiddly parts (advancing
 * legs without drifting, cross-fading clips, keeping a carried prop welded to a
 * bone through a skinned animation, not fighting the mixer for the head bone)
 * are identical in all three, and each is a place to get it subtly wrong once
 * rather than three times.
 */

/** All three models were authored facing -Y in Blender, which the glTF Y-up
 *  conversion turns into +Z - the same forward three.js assumes. So a heading
 *  is just atan2(dx, dz) with no per-model correction. */
export type CritterLeg = {
  /** seconds this leg lasts */
  dur: number;
  /** where the critter ENDS this leg, in location-0 local space */
  to: [number, number, number];
  /** clip to cross-fade to as the leg begins */
  clip?: string;
  /** playback rate for that clip. Prefer `gait` for anything that walks. */
  timeScale?: number;
  /** The clip's NATURAL ground speed, in raw model units per second.
   *
   *  Give this and the engine works timeScale out for itself:
   *
   *      timeScale = (legDistance / legDuration) / (gait * critterScale)
   *
   *  which is the only way to guarantee the feet keep up with the ground. Set
   *  by hand, they do not: the first version walked the moose 12.8 units in
   *  3.2s, which is 4.0 u/s against a clip that travels 0.41 u/s at that scale
   *  - the legs were cycling NINE TIMES too slowly and it skated the whole way
   *  in. Derived, it stays right when the distance, the duration or the scale
   *  changes, and GAIT below records what each clip is actually worth. */
  gait?: number;
  /** heading at the end of the leg. Omit to face the direction of travel. */
  yaw?: number;
  /** extra height at the midpoint, on top of the straight line. Flight arcs. */
  arc?: number;
  ease?: "linear" | "in" | "out" | "inout";
  /** take the prop at the START of this leg */
  grab?: boolean;
  /** pitch the head bone down. This is how a moose "reaches down": none of
   *  these rigs ship a grazing clip, so the neck is driven by hand. */
  dip?: number;
  /** how the dip is shaped across the leg.
   *   "pulse" (default) dips and comes back up within the leg
   *   "in"   ends the leg fully dipped  - the reach
   *   "out"  starts fully dipped and lifts - the leg that carries the prop up
   *  Splitting the reach into in/out legs is what lets `grab` land on the exact
   *  frame the head is at its lowest, instead of somewhere near it. */
  dipShape?: "pulse" | "in" | "out";
  /** fired once as the leg begins. Used to knock the fishing rod over at the
   *  moment the moose actually reaches it. */
  event?: string;
};

export type CarrySpec = {
  url: string;
  /** offset in the ATTACH BONE's frame */
  offset: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

/**
 * Natural ground speed of each locomotion clip, in RAW model units per second.
 *
 * Measured, not guessed: with the clip playing, sample a hoof/paw bone's
 * fore-aft velocity every frame. While a foot is planted it must travel
 * backwards at exactly the body's forward speed, so the plateau in that
 * velocity IS the ground speed. Averaged over all four feet.
 *
 *   moose   walk 0.937   trot 1.293   run 1.787   (cycle 1.75s)
 *   raccoon walk 0.401   trot 0.546   run 0.504   (cycle 1.67s)
 *
 * Re-measure if a clip is ever re-exported.
 */
export const GAIT = {
  raccoonWalk: 0.401,
  raccoonTrot: 0.546,
} as const;



const EASE: Record<string, (u: number) => number> = {
  linear: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  inout: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
};

const V_A = new THREE.Vector3();
const Q_A = new THREE.Quaternion();
const Q_B = new THREE.Quaternion();
const E_A = new THREE.Euler();
const V_T = new THREE.Vector3();
/** Every one of these models faces +Z once the exporter's Y-up conversion is
 *  applied, so this is both the forward axis and the roll axis. */
const FWD = new THREE.Vector3(0, 0, 1);
const M_A = new THREE.Matrix4();
const M_B = new THREE.Matrix4();
/* Dedicated scratch for the carried-prop weld. It runs inside the frame loop
 * alongside the attitude solve, which already owns V_A/Q_A/Q_B/V_T. */
const V_H = new THREE.Vector3();
const Q_H = new THREE.Quaternion();
const S_H = new THREE.Vector3();

/* TipOver scratch. It runs per prop per frame, so nothing here allocates. */
const V_K = new THREE.Vector3();
const V_P = new THREE.Vector3();
const Q_K = new THREE.Quaternion();
const M_K = new THREE.Matrix4();
const M_P = new THREE.Matrix4();
const M_IDENT = new THREE.Matrix4();
const V_U = new THREE.Vector3();
const Q_W = new THREE.Quaternion();

/**
 * Monotone cubic interpolation (Fritsch-Carlson PCHIP).
 *
 * This is what makes the flight smooth. The bird still has to be at each
 * waypoint at the right moment - it cannot arrive at the bag early or late or
 * the grab happens in mid-air - but interpolating those (time -> distance)
 * knots LINEARLY is what produced the old motion: constant speed inside each
 * segment and an instant change at every knot. Measured on the shipped path,
 * the bird hit 0.00 u/s at the snatch and resumed at 10.53 u/s on the next
 * frame.
 *
 * A monotone cubic passes through every knot, so the timing is still exact,
 * but its first derivative is continuous - so speed eases through each waypoint
 * instead of stepping. Monotone matters too: an ordinary spline would overshoot
 * and the bird would briefly fly backwards on the way into the snatch.
 */
function monotoneCubic(xs: number[], ys: number[]) {
  const n = xs.length;
  const h: number[] = [], d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-6));
  }
  const m = new Array(n).fill(0);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i]
         + (t3 - 2 * t2 + t) * h[i] * m[i]
         + (-2 * t3 + 3 * t2) * ys[i + 1]
         + (t3 - t2) * h[i] * m[i + 1];
  };
}

/**
 * Find a bone by the name the EXPORTER wrote, not the name three kept.
 *
 * GLTFLoader puts every node name through PropertyBinding.sanitizeNodeName,
 * which strips `[ ] . : /` (GLTFLoader.js, "const sanitizedName ="). So the
 * condor's talon bone, `toes_01.l` in the file, is `toes_01l` in the loaded
 * scene, and a plain getObjectByName for the file's name finds nothing.
 *
 * That was silent: the weld is guarded on the bone existing, so the bag simply
 * never got attached to anything and vanished the moment the original was
 * hidden. The moose and raccoon were fine only because `mouth` and `head`
 * happen to contain no reserved characters.
 *
 * Checking the GLB's own node table does NOT catch this - the file really does
 * say `toes_01.l`. It has to be looked up the way three will look it up.
 */
function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  const direct = root.getObjectByName(name);
  if (direct) return direct;
  const sanitized = THREE.PropertyBinding.sanitizeNodeName(name);
  const viaSanitized = sanitized !== name ? root.getObjectByName(sanitized) : undefined;
  if (viaSanitized) return viaSanitized;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[CritterActs] bone "${name}" not found (also tried "${sanitized}"). ` +
      `Anything welded to it will not move.`,
    );
  }
  return null;
}

/** Shortest signed turn from a to b, so a heading never takes the long way. */
function turn(a: number, b: number) {
  return ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

export function CritterPerformance({
  url,
  legs,
  from,
  yaw0,
  scale,
  active,
  onDone,
  onGrab,
  onEvent,
  attachBone,
  dipBones,
  carry,
  carryObjectName,
  carryDropWorld = 0,
  smooth = false,
  bank = 0,
  pitch = 0,
  visibleWhenIdle = false,
}: {
  url: string;
  legs: CritterLeg[];
  /** where it starts, location-0 local */
  from: [number, number, number];
  /** heading it starts on */
  yaw0: number;
  scale: number;
  /** false parks the whole thing: nothing renders, nothing ticks */
  active: boolean;
  onDone?: () => void;
  /** fired on the frame the prop is taken, so the scene can hide the original */
  onGrab?: () => void;
  /** fired as a leg carrying `event` begins */
  onEvent?: (name: string) => void;
  /** bone the carried prop welds to (talons, mouth, ...) */
  attachBone?: string;
  /*
   * Bones the reach pitches, shoulders first.
   *
   * A chain, not one bone, because a moose CANNOT reach the ground with its
   * neck. Measured in Blender: cranking neck_01 + head bottoms the muzzle out
   * at 0.61 world against a bag sitting at 0.36, and past ~0.7 rad the head
   * arcs back UP. Spreading a small angle down Spine_03 -> Spine_02 ->
   * Spine_01 -> neck_01 -> head reaches 0.33 at only 0.30 rad each - which is
   * also how the animal really does it: the whole front end goes down.
   */
  dipBones?: string[];
  carry?: CarrySpec;
  /*
   * Name of a REAL object already in the scene to carry off.
   *
   * Preferred over `carry`, which spawns a clone and hides the original. That
   * hand-off has been the source of every "the prop vanished" bug here: two
   * objects, two visibility flags, two transforms, and one frame in which the
   * original must be hidden while the clone is already in exactly the right
   * place, visible and welded. With this there is only ever ONE object - the
   * one that was already sitting there - and nothing hides it at the grab, so
   * there is nothing that CAN vanish.
   */
  carryObjectName?: string;
  /** How far below the attach bone the carried object hangs, in WORLD units. */
  carryDropWorld?: number;
  visibleWhenIdle?: boolean;
  /*
   * Fly the waypoints as ONE curve and take the attitude from the path.
   *
   * For anything with feet this is wrong - a walking animal turns on the spot
   * and its heading is a decision, not a consequence. For a bird it is the only
   * thing that looks right: a condor points where it is going, noses down into
   * a dive, noses up out of it, and banks into a turn. Without this it is a
   * rigid model being slid along a polyline, which is what the first version
   * was, corners and all.
   */
  smooth?: boolean;
  /** radians of roll per rad/s of yaw rate. 0 = wings always level. */
  bank?: number;
  /** 0 = hold the fixed heading it started on, which is how this always looked.
   *  1 = point the nose fully along the flight path. Anything between blends. */
  pitch?: number;
}) {
  const gltf = useGLTF(url) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  /*
   * A fresh SkeletonUtils-style clone is NOT used here on purpose: these
   * performances mount one instance each, and THREE.Object3D.clone does not
   * rebind SkinnedMesh -> Skeleton, so a cloned critter would stand perfectly
   * still. Same reasoning as FloppingFish over in CampfireScene.
   */
  const root = useRef<THREE.Group>(null);
  const carryRef = useRef<THREE.Group>(null);
  /*
   * React has to KNOW the prop is being carried.
   *
   * This used to be `visible={false}` hard-coded in the JSX, flipped to true
   * imperatively on the grab. But the grab also fires onGrab, which the scene
   * uses to hide the ORIGINAL prop - a setState. That re-render re-applied the
   * literal `false` to the clone on the very frame the original disappeared, so
   * the bag vanished instead of being carried off. Imperative visibility and a
   * JSX literal cannot both own the same flag.
   */
  const [carrying, setCarrying] = useState(false);
  const { actions } = useAnimations(gltf.animations || [], gltf.scene);
  const scene = useThree((s) => s.scene);
  /** The real scene object being carried, plus the local matrix it had before
   *  we took it over, so it can be handed back exactly as it was. */
  const hauled = useRef<{
    obj: THREE.Object3D;
    matrix: THREE.Matrix4;
    auto: boolean;
    /** world orientation + world scale the prop had while it sat on the ground */
    quat: THREE.Quaternion;
    worldScale: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
  }, [gltf.scene]);

  /** Resolve a clip name loosely: exporters love to prefix with Rig|Rig|. */
  const resolve = useCallback((want?: string) => {
    if (!want || !actions) return undefined;
    const names = Object.keys(actions);
    return (
      names.find((n) => n === want) ??
      names.find((n) => n.toLowerCase().endsWith("|" + want.toLowerCase())) ??
      names.find((n) => n.toLowerCase().includes(want.toLowerCase()))
    );
  }, [actions]);

  const bones = useMemo(() => {
    const attach = attachBone ? findBone(gltf.scene, attachBone) : null;
    // Bind pose captured once, before any mixer has written these bones, so the
    // reach is always an offset FROM rest instead of compounding every frame.
    const dip = (dipBones ?? [])
      .map((n) => findBone(gltf.scene, n))
      .filter((o): o is THREE.Object3D => !!o)
      .map((o) => ({ obj: o, bind: o.quaternion.clone() }));
    return { attach: attach ?? null, dip };
  }, [gltf.scene, attachBone, dipBones]);

  /** Waypoint i starts where leg i-1 ended. Precomputed so the frame loop
   *  never has to walk the list. */
  const path = useMemo(() => {
    const pts: THREE.Vector3[] = [new THREE.Vector3(...from)];
    for (const l of legs) pts.push(new THREE.Vector3(...l.to));
    const yaws: number[] = [yaw0];
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (l.yaw != null) { yaws.push(l.yaw); continue; }
      const d = pts[i + 1].clone().sub(pts[i]);
      yaws.push(Math.abs(d.x) + Math.abs(d.z) < 1e-6 ? yaws[i] : Math.atan2(d.x, d.z));
    }
    return { pts, yaws };
  }, [from, legs, yaw0]);

  /*
   * The smooth path: a centripetal Catmull-Rom through every waypoint, plus a
   * monotone map from elapsed time to distance along it.
   *
   * Centripetal specifically - the uniform and chordal variants both cusp or
   * loop when control points are unevenly spaced, and these are: the snatch
   * sits 1.4 units from its neighbour while the exit is 13.7 away.
   */
  /*
   * The flight path is a POLYLINE - the same straight segments between the same
   * waypoints the sweep has always used. No spline, no curvature, no detours.
   *
   * What makes it smooth is not the shape of the path, it is the map from time
   * to distance ALONG it. Straight segments with one lerp per leg gave constant
   * speed inside a leg and an instant change at every waypoint: measured, the
   * bird hit 0.00 u/s at the snatch and resumed at 10.53 u/s one frame later.
   * A monotone cubic through the (time, distance) knots hits every waypoint at
   * exactly the same moment as before - so the grab still lands on the bag -
   * while making speed continuous across them.
   */
  const flight = useMemo(() => {
    if (!smooth || path.pts.length < 2) return null;
    const cum = [0];
    for (let i = 0; i < path.pts.length - 1; i++) {
      cum.push(cum[i] + path.pts[i].distanceTo(path.pts[i + 1]));
    }
    const total = cum[cum.length - 1] || 1;
    const distFrac = cum.map((d) => d / total);
    const totalDur = legs.reduce((acc, l) => acc + Math.max(0.016, l.dur), 0);
    const timeFrac = [0];
    let acc = 0;
    for (const l of legs) { acc += Math.max(0.016, l.dur); timeFrac.push(acc / totalDur); }

    /** Straight-line position at arc-length fraction u. */
    const pointAt = (u: number, out: THREE.Vector3) => {
      const d = THREE.MathUtils.clamp(u, 0, 1) * total;
      let i = 0;
      while (i < cum.length - 2 && d > cum[i + 1]) i++;
      const segLen = cum[i + 1] - cum[i];
      out.lerpVectors(path.pts[i], path.pts[i + 1], segLen > 1e-6 ? (d - cum[i]) / segLen : 0);
      return i;
    };
    return { pointAt, s: monotoneCubic(timeFrac, distFrac), totalDur, timeFrac };
  }, [smooth, path.pts, legs]);

  const st = useRef({ leg: -1, t: 0, carrying: false, done: false, action: "",
                      yaw: 0, roll: 0, ts: 1, tsTarget: 1 });


  // Reset whenever the act is armed, so a second click replays it cleanly.
  useEffect(() => {
    if (!active) return;
    st.current = { leg: 0, t: 0, carrying: false, done: false, action: "",
                   yaw: yaw0, roll: 0, ts: 1, tsTarget: 1 };
    setCarrying(false);
    if (hauled.current) {
      hauled.current.obj.matrix.copy(hauled.current.matrix);
      hauled.current.obj.matrixAutoUpdate = hauled.current.auto;
      hauled.current.obj.matrixWorldNeedsUpdate = true;
      hauled.current = null;
    }
    if (carryRef.current) carryRef.current.visible = false;
    if (root.current) {
      root.current.position.set(...from);
      root.current.rotation.set(0, yaw0, 0);
    }
  }, [active, from, yaw0]);

  /*
   * Registered AFTER useAnimations above, and both at the default priority, so
   * this runs after the mixer has written the pose each frame. That ordering is
   * the whole reason the head dip below sticks instead of being overwritten -
   * and why neither of these may be given a priority > 0, which would take over
   * r3f's render loop entirely.
   */
  /** Clip / grab / event bookkeeping for a leg. Shared by both motion paths. */
  const enterLeg = useCallback((i: number, tsOverride?: number) => {
    const s = st.current;
    const leg = legs[i];
    if (!leg) return;
    let ts = tsOverride ?? leg.timeScale ?? 1;
    if (tsOverride == null && leg.gait && leg.gait > 1e-4) {
      const travelled = path.pts[i].distanceTo(path.pts[i + 1]);
      const natural = leg.gait * scale;
      ts = natural > 1e-6 ? (travelled / Math.max(0.016, leg.dur)) / natural : 1;
      ts = Math.min(4, Math.max(0.15, ts));
    }
    const key = resolve(leg.clip);
    if (key && actions?.[key]) {
      if (s.action !== key) {
        const next = actions[key]!;
        const prev = s.action ? actions[s.action] : null;
        next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
        next.timeScale = ts;
        s.ts = ts;
        if (prev && prev !== next) next.crossFadeFrom(prev, 0.28, false);
        s.action = key;
      }
      /*
       * Ramp the playback rate instead of snapping it.
       *
       * Position being continuous is only half of smooth: when a leg boundary
       * changed timeScale from 0.85 to 1.7 in one frame, the wingbeat doubled
       * in speed instantly, which reads as a hitch even though the bird's path
       * never stutters. s.tsTarget is chased in the frame loop.
       */
      s.tsTarget = ts;
    }
    if (leg.grab && !s.carrying) {
      s.carrying = true;
      if (carryObjectName) {
        // Take hold of the object already in the scene. Nothing is hidden and
        // nothing is spawned, so the visitor sees ONE continuous bag: on the
        // ground one frame, in the talons the next.
        const obj = scene.getObjectByName(carryObjectName);
        if (obj) {
          // Snapshot the orientation it is WEARING right now, in world space.
          // Its local matrix is relative to a parent that is itself rotated
          // (the ring, then the prop group), so only the world decomposition
          // describes which way the bag is actually pointing.
          obj.updateWorldMatrix(true, false);
          const quat = new THREE.Quaternion();
          const worldScale = new THREE.Vector3();
          obj.matrixWorld.decompose(new THREE.Vector3(), quat, worldScale);
          hauled.current = {
            obj,
            matrix: obj.matrix.clone(),
            auto: obj.matrixAutoUpdate,
            quat,
            worldScale,
          };
          obj.matrixAutoUpdate = false;
        } else if (process.env.NODE_ENV !== "production") {
          console.warn(`[CritterActs] nothing named "${carryObjectName}" to carry.`);
        }
      } else {
        setCarrying(true);
        if (carryRef.current) carryRef.current.visible = true;
      }
      onGrab?.();
    }
    if (leg.event) onEvent?.(leg.event);
  }, [legs, path.pts, scale, resolve, actions, onGrab, onEvent, carryObjectName, scene]);

  /**
   * Put the carried scene object where the attach bone is.
   *
   * Its matrix is local to ITS OWN parent, which is somewhere else in the tree,
   * so the bone's world matrix has to come back through that parent's inverse.
   * Position from the bone only. Orientation and scale are the ones the prop
   * had while it was resting, captured in world space at the grab, so it does
   * not snap to the world axes (which is what composing with an identity
   * quaternion did) and does not inherit the twist of a toe bone either.
   */
  const haulRealObject = useCallback(() => {
    const h = hauled.current;
    const bone = bones.attach;
    const g = root.current;
    if (!h || !bone || !g || !h.obj.parent) return;
    bone.updateWorldMatrix(true, false);
    h.obj.parent.updateWorldMatrix(true, false);
    // Position comes from the bone; orientation and scale come from the
    // snapshot, so the bag is carried facing exactly the way it was facing on
    // the ground - which is the direction the bird flies off in.
    bone.matrixWorld.decompose(V_H, Q_H, S_H);         // Q_H/S_H discarded
    V_H.y += carryDropWorld;
    M_A.compose(V_H, h.quat, S_H.copy(h.worldScale));
    h.obj.matrix.copy(M_B.copy(h.obj.parent.matrixWorld).invert()).multiply(M_A);
    h.obj.matrixWorldNeedsUpdate = true;
  }, [bones.attach, carryDropWorld]);

  useFrame((_, dt) => {
    const s = st.current;
    const g = root.current;
    if (!active || !g || s.done || s.leg < 0) return;

    // ease the wingbeat / stride rate toward its target rather than stepping it
    if (s.action && actions?.[s.action]) {
      s.ts += (s.tsTarget - s.ts) * Math.min(1, dt * 5);
      actions[s.action]!.timeScale = s.ts;
    }

    /* ------------------------------------------------------------------ *
     *  SMOOTH FLIGHT - one curve, one continuous timing map, attitude
     *  taken from the path. Used by the condor.
     * ------------------------------------------------------------------ */
    if (flight) {
      s.t += dt;
      const p = Math.min(1, s.t / flight.totalDur);

      // which leg are we in? only for clips, grabs and events - the motion
      // does not restart at a leg boundary any more, which is the point.
      let li = 0;
      while (li < legs.length - 1 && p >= flight.timeFrac[li + 1]) li++;
      if (li !== s.leg) { s.leg = li; enterLeg(li); }

      const arc = flight.s(p);
      const seg = flight.pointAt(arc, V_A);
      g.position.copy(V_A);
      // direction of the segment we are on - only needed if pitch or bank are up
      V_T.subVectors(path.pts[seg + 1], path.pts[seg]).normalize();

      /*
       * Attitude. By DEFAULT this holds the heading it launched on - the same
       * fixed attitude the flight has always had - because smoothing the motion
       * is not licence to restyle the shot.
       *
       * `pitch` blends toward pointing the nose along the path, and `bank`
       * adds roll into the turn, for anyone who wants them. Both default to 0,
       * so out of the box nothing about the bird's orientation changed.
       */
      E_A.set(0, yaw0, 0);
      Q_A.setFromEuler(E_A);
      if (pitch > 1e-3) {
        // setFromUnitVectors takes the model's +Z onto the flight direction by
        // the MINIMAL rotation, so there is no Euler order to get wrong and no
        // gimbal flip if the path ever goes vertical.
        Q_B.setFromUnitVectors(FWD, V_T);
        Q_A.slerp(Q_B, Math.min(1, pitch));
      }
      if (bank > 1e-4) {
        const yawNow = Math.atan2(V_T.x, V_T.z);
        const yawRate = dt > 1e-5 ? turn(s.yaw, yawNow) / dt : 0;
        s.yaw = yawNow;
        const wantRoll = THREE.MathUtils.clamp(-yawRate * bank, -1.2, 1.2);
        // low-passed, so a slightly lumpy tangent cannot make the wings twitch
        s.roll += (wantRoll - s.roll) * Math.min(1, dt * 6);
        if (Math.abs(s.roll) > 1e-4) {
          Q_B.setFromAxisAngle(FWD, s.roll);
          Q_A.multiply(Q_B);
        }
      }
      g.quaternion.copy(Q_A);

      if (s.carrying && carryRef.current && bones.attach) {
        bones.attach.updateWorldMatrix(true, false);
        g.updateWorldMatrix(true, false);
        const cg = carryRef.current;
        cg.matrixAutoUpdate = false;
        /*
         * POSITION from the bone, ORIENTATION from the animal.
         *
         * Taking the bone's full matrix meant the prop inherited whatever twist
         * the toe or the jaw happened to have and - worse - made the carry
         * offset meaningless: "y" pointed wherever that bone pointed, not up,
         * so there was no way to tune how far below the foot the bag hangs.
         * A bag hangs from a set of talons under gravity; it does not roll
         * with the toes.
         */
        M_A.copy(g.matrixWorld).invert().multiply(bones.attach.matrixWorld);
        cg.matrix.makeTranslation(M_A.elements[12], M_A.elements[13], M_A.elements[14]);
        cg.visible = true;   // belt and braces: no re-render can take it away
        cg.matrixWorldNeedsUpdate = true;
      }
      haulRealObject();
      if (p >= 1 && !s.done) { s.done = true; onDone?.(); }
      return;
    }

    /* ------------------------------------------------------------------ *
     *  WALKING - straight legs, heading is a decision not a consequence.
     * ------------------------------------------------------------------ */
    if (s.leg >= legs.length) {
      if (!s.done) { s.done = true; onDone?.(); }
      return;
    }
    const leg = legs[s.leg];
    if (s.t === 0) enterLeg(s.leg);

    s.t += dt;
    const dur = Math.max(0.016, leg.dur);
    const raw = Math.min(1, s.t / dur);
    const u = (EASE[leg.ease ?? "inout"] ?? EASE.inout)(raw);

    const a = path.pts[s.leg];
    const b = path.pts[s.leg + 1];
    g.position.lerpVectors(a, b, u);
    if (leg.arc) g.position.y += Math.sin(raw * Math.PI) * leg.arc;

    const y0 = path.yaws[s.leg];
    const y1 = path.yaws[s.leg + 1];
    g.rotation.y = y0 + turn(y0, y1) * u;

    /*
     * The reach, applied on top of whatever the mixer just wrote this frame.
     *
     * `dip` is SIGNED, and the sign is not cosmetic: measured per rig, the
     * moose drops its muzzle on local X- and the raccoon on local X+. Backwards
     * does not look slightly off - it makes the animal LIFT its head away while
     * the prop jumps into its mouth. That is what the first version did.
     */
    if (leg.dip && bones.dip.length) {
      const shape = leg.dipShape ?? "pulse";
      const k = shape === "in" ? Math.sin((raw * Math.PI) / 2)
              : shape === "out" ? Math.cos((raw * Math.PI) / 2)
              : Math.sin(raw * Math.PI);
      Q_A.setFromAxisAngle(V_A.set(1, 0, 0), k * leg.dip);
      for (const b2 of bones.dip) b2.obj.quaternion.copy(b2.bind).multiply(Q_A);
    }

    if (s.carrying && carryRef.current && bones.attach) {
      bones.attach.updateWorldMatrix(true, false);
      g.updateWorldMatrix(true, false);
      const cg = carryRef.current;
      cg.matrixAutoUpdate = false;
      /*
       * POSITION from the bone, ORIENTATION from the animal.
       *
       * Taking the bone's full matrix meant the prop inherited whatever twist
       * the toe or the jaw happened to have and - worse - made the carry
       * offset meaningless: "y" pointed wherever that bone pointed, not up,
       * so there was no way to tune how far below the foot the bag hangs.
       * A bag hangs from a set of talons under gravity; it does not roll
       * with the toes.
       */
      M_A.copy(g.matrixWorld).invert().multiply(bones.attach.matrixWorld);
      cg.matrix.makeTranslation(M_A.elements[12], M_A.elements[13], M_A.elements[14]);
      cg.visible = true;   // belt and braces: no re-render can take it away
      cg.matrixWorldNeedsUpdate = true;
    }
    haulRealObject();

    if (raw >= 1) { s.leg++; s.t = 0; }
  });

  if (!active && !visibleWhenIdle) return null;
  return (
    <group ref={root} position={from} rotation={[0, yaw0, 0]} scale={scale}>
      <primitive object={gltf.scene} />
      {carry ? (
        <group ref={carryRef} visible={carrying}>
          <group position={carry.offset} rotation={carry.rotation} scale={carry.scale}>
            <CarriedModel url={carry.url} />
          </group>
        </group>
      ) : null}
    </group>
  );
}

/** A plain clone of a prop GLB, non-interactive: a bag in a bird's talons is
 *  scenery, and letting it keep its raycast would put a click target in mid-air. */
function CarriedModel({ url }: { url: string }) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  useEffect(() => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      o.raycast = () => {};
    });
  }, [model]);
  return <primitive object={model} />;
}

/* ==========================================================================
 *  Falling props
 * ========================================================================== */

/**
 * Tips a prop over the way gravity actually tips it.
 *
 * The old version was a cubic ease on `rotation.x` of a group INSIDE the
 * Selectable, and it looked wrong for two measured reasons:
 *
 *   1. The Selectable is itself rotated, so its local X is not horizontal. For
 *      the fishing rod (rotX -2.68, rotZ -pi, rotY -2.25) local X comes out at
 *      (0.629, 0.346, -0.697) in world space - tilted 20 degrees out of the
 *      ground plane. Spinning about that axis corkscrews the rod sideways
 *      instead of laying it down.
 *   2. `pivotY = -1.388` is the rod's own lowest vertex, which sits 0.20 BELOW
 *      the ground: the rod is planted 0.24 into the dirt. Tipping about a
 *      buried point scythes the visible rod across the ground.
 *
 * So this takes a heading, looks the rest up in a measured sweep, and builds
 * the whole transform in the camp's own space, cancelling whatever the parent
 * chain is doing:
 *
 *     local = parentWorld^-1 . T(pivot) . R(axis, theta) . T(-pivot) . parentWorld
 *
 * and the angle comes from integrating the real equation of motion for a body
 * hinged on an edge,
 *
 *     theta'' = k . sin(theta - balance)
 *
 * where `balance` is the angle at which the centre of mass passes over the
 * hinge and k = m.g.d / I. Both were measured off the actual meshes in Blender
 * (interior point-sampling for the centre of mass and the inertia, a rotation
 * sweep for the angles), which is what buys the motion its shape: the bag is
 * shoved, slows as it climbs toward its tipping point, hangs there for an
 * instant, then goes over and accelerates into the ground. A cubic ease cannot
 * do that - it is fastest at the start, which is exactly backwards.
 */
export function TipOver({
  active, table, heading, groundY, shove, fall = 1, tilt = 0, lift = 0, replay = 0,
  restitution = 0.22, contactAngle, onContact,
  rattleAmp = 0, rattleFreq = 7, rattleDamp = 4, children,
}: {
  active: boolean;
  /** measured sweep for this prop - see tipTables.ts */
  table: TipTable;
  /** the direction it falls: heading (atan2(x, z)) in the camp's own space.
   *  Everything else - hinge, tipping point, resting angle, swing rate - is
   *  read out of `table` at this angle, so this one knob is safe to turn. */
  heading: number;
  /** ground plane the hinge sits on */
  groundY: number;
  /** how hard it is shoved, as a MULTIPLE of the least it takes to go over.
   *  1 is exactly balanced on the tipping point, below 1 it rocks back
   *  upright, 1.2 goes over with a visible hesitation on the way. */
  shove: number;
  /*
   * How far over it goes, as a multiple of the measured resting angle.
   *
   * The table's resting angle is where the hull FIRST touches the ground, and
   * for most shapes that is also where it lies. Not for the fishing rod: its
   * reel sticks out, catches at 89.6 degrees and leaves the tip 0.46 in the
   * air, so the rod looks like it is hovering rather than lying in the dirt.
   * Measured: 1.13 brings the tip down to the ground with the reel bedded
   * about 5 cm in, which is what a rod dropped on soft ground looks like.
   *
   * 1 is the measured contact. Above that the prop settles INTO the ground,
   * which is a lie, but a small and useful one - so it is a knob rather than
   * something baked in.
   */
  fall?: number;
  /*
   * Fine trim on the resting angle, in radians, added on top of `fall`.
   *
   * `fall` is a multiple of the measured contact angle, so it is coarse and it
   * scales with whatever the table says for the current heading. This is an
   * absolute nudge, which is what you want for levelling: the fishing rod
   * lands 1.08 degrees nose-up at the contact angle, and over 2.3 m of rod
   * that leaves the tip end 4.4 cm off the ground while the butt touches -
   * clearly floating, even though the number is small.
   *
   * Positive pushes the far end down, negative lifts it.
   */
  tilt?: number;
  /*
   * Vertical lift, in world units, ramped in as the prop goes over.
   *
   * Rotation alone cannot land an irregular shape cleanly. Turn the rod far
   * enough for its tip to reach the ground and the reel - which sticks out
   * sideways - ends up 5 cm under it, with a fifth of the rod buried. Lifting
   * the whole thing a few centimetres as it falls fixes that without giving
   * up the angle.
   *
   * It scales with theta/rest rather than being constant, so a prop that is
   * planted in the ground (the rod is buried 0.24) stays planted while it is
   * upright and only rises as it goes over - which also reads as it being
   * levered out of the dirt rather than floating from the start.
   */
  lift?: number;
  /** bump to play it again from the top without `active` going false first.
   *  The rod uses this: the bag's knock has to be able to re-fire it. */
  replay?: number;
  /** how much of the impact speed survives the bounce */
  restitution?: number;
  /** fire onContact the first time theta passes this */
  contactAngle?: number;
  onContact?: () => void;
  /*
   * Whip, for something long and springy.
   *
   * A 2.3 m fishing rod is not a rigid body - it waves on the way over and
   * clatters when it lands, and rotating it as one stiff bar reads as a girder
   * falling. This is a damped oscillation driven by the fall itself: it is
   * excited by the initial knock and again at every bounce, in proportion to
   * how hard that bounce was, then dies away.
   *
   * It swings the tip sideways (yaw about the hinge, which is what you notice
   * on a long thin thing) plus a smaller amount along the fall, so the tip
   * leads and trails the butt rather than the whole rod moving as one.
   *
   * 0 disables it - the bags are compact enough to have no whip worth faking.
   */
  rattleAmp?: number;
  /** Hz. A rod's first bending mode is a few Hz; 7 reads as a rattle. */
  rattleFreq?: number;
  /** how fast the whip dies, per second */
  rattleDamp?: number;
  children: React.ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  /** the <Location> ring group these coordinates are relative to, resolved once */
  const ref = useRef<THREE.Object3D | null>(null);
  const st = useRef({ th: 0, w: 0, acc: 0, fired: false, settled: false,
                      /** current whip excitation, 0..1, and its phase clock */
                      wob: 0, wt: 0 });

  /* Everything the fall needs, read out of the measured sweep at whatever
   * heading is currently set. Recomputed only when the knob moves. */
  const solved = useMemo(() => {
    const t = tipAt(table, heading);
    /* The resting angle has to stay clear of the tipping point with room to
     * bounce. Land only a hair past the balance point and the rebound carries
     * the prop back OVER it, so it stands up again - true to the model, but a
     * knob that makes a falling bag spring upright is a bad knob. 0.25 rad of
     * clearance is enough that the bounce always dies on the ground. */
    const rest = Math.max(t.balance + 0.25, t.rest * fall + tilt);
    return { ...t, rest, kick: tipBarrier(t.gravity, t.balance) * shove };
  }, [table, heading, shove, fall, tilt]);

  /*
   * Replay from the top on ANY change.
   *
   * Every one of these reshapes the fall, and a tuning knob you cannot see the
   * effect of without re-clicking the prop is a knob you cannot tune. In the
   * built site the config is static, so this never fires after mount; in the
   * lab it means dragging a slider plays the whole thing again.
   */
  useEffect(() => {
    st.current = { th: 0, w: active ? solved.kick : 0, acc: 0, fired: false, settled: false,
                   wob: active ? 1 : 0, wt: 0 };
  }, [active, replay, solved, groundY, lift, contactAngle, restitution,
      rattleAmp, rattleFreq, rattleDamp]);

  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    const s = st.current;

    if (!active) {
      if (!o.matrix.equals(M_IDENT)) { o.matrix.identity(); o.matrixWorldNeedsUpdate = true; }
      return;
    }

    if (!s.settled) {
      /* Fixed 1/240 substeps. The integration has to be frame-rate independent
       * or the rod lands in a different place on a 144 Hz monitor than it does
       * on a 60 Hz one, and the contact that knocks the next prop over fires at
       * a different angle with it. */
      s.acc = Math.min(0.25, s.acc + dt);
      const H = 1 / 240;
      while (s.acc >= H) {
        s.acc -= H;
        s.w += solved.gravity * Math.sin(s.th - solved.balance) * H;
        s.th += s.w * H;
        if (s.th <= 0 && s.w < 0) { s.th = 0; s.w = 0; s.settled = true; break; }
        if (s.th >= solved.rest) {
          // Landing is what really sets a long stick going, so the bounce
          // feeds the whip in proportion to how hard it hit.
          s.wob = Math.min(1.6, s.wob + Math.abs(s.w) * 0.22);
          s.th = solved.rest;
          s.w = -s.w * restitution;
          if (Math.abs(s.w) < 0.35) { s.w = 0; s.settled = true; }
          break;
        }
      }
      if (!s.fired && contactAngle !== undefined && s.th >= contactAngle) {
        s.fired = true;
        onContact?.();
      }
    }

    if (rattleAmp > 0 && s.wob > 1e-4) {
      s.wt += dt;
      s.wob *= Math.exp(-rattleDamp * dt);
    }

    const p = o.parent;
    if (!p) return;

    /*
     * The pivot and the heading are in LOCATION space, not world space.
     *
     * Every prop in a camp hangs under a <Location> group that re-seats itself
     * on the ring each frame - position (sin a . R, 0, cos a . R) and yaw
     * a + pi + spin - so a pivot measured off the scene as authored is nowhere
     * near the same world point once the ring has turned. Treating authored
     * coordinates as world coordinates is exactly what made the condor look
     * like it was grabbing at air 15 units from the bag.
     *
     * So: resolve the ring group once, push the pivot and the axis through ITS
     * world matrix, and build the rotation there. Anything between the ring and
     * this group - drag layers, plain wrappers, the Selectable's own scale and
     * tilt - is absorbed by the parentWorld conjugation below and needs no
     * special handling.
     */
    if (ref.current !== null && ref.current.parent === null) ref.current = null;
    if (ref.current === null) {
      let a: THREE.Object3D | null = o.parent;
      while (a && !a.name.startsWith("location_")) a = a.parent;
      ref.current = a ?? o;
    }
    const frame = ref.current;
    frame.updateWorldMatrix(true, false);
    p.updateWorldMatrix(true, false);

    V_P.set(solved.pivotX, groundY, solved.pivotZ).applyMatrix4(frame.matrixWorld);
    // up x forward, i.e. horizontal and across the fall, then into world
    V_K.set(Math.cos(heading), 0, -Math.sin(heading))
        .transformDirection(frame.matrixWorld)
        .normalize();
    const whip = rattleAmp > 0 && s.wob > 1e-4
      ? rattleAmp * s.wob * Math.sin(Math.PI * 2 * rattleFreq * s.wt)
      : 0;
    /* Along the fall the whip is smaller - the tip leading and trailing the
     * butt. It is display only, never fed back into the integrator, and it is
     * clamped at the resting angle: once the rod is lying down it can whip UP
     * off the ground but not rotate on through it. */
    Q_K.setFromAxisAngle(V_K, Math.min(solved.rest, s.th + whip * 0.4));
    if (whip !== 0) {
      V_U.set(0, 1, 0).transformDirection(frame.matrixWorld).normalize();
      Q_W.setFromAxisAngle(V_U, whip);
      Q_K.premultiply(Q_W);
    }

    M_K.makeRotationFromQuaternion(Q_K);
    M_K.setPosition(
      V_P.x - (M_K.elements[0] * V_P.x + M_K.elements[4] * V_P.y + M_K.elements[8] * V_P.z),
      V_P.y - (M_K.elements[1] * V_P.x + M_K.elements[5] * V_P.y + M_K.elements[9] * V_P.z)
            + (lift !== 0 ? lift * Math.min(1, s.th / Math.max(1e-4, solved.rest)) : 0),
      V_P.z - (M_K.elements[2] * V_P.x + M_K.elements[6] * V_P.y + M_K.elements[10] * V_P.z),
    );
    o.matrix.copy(M_P.copy(p.matrixWorld).invert()).multiply(M_K).multiply(p.matrixWorld);
    o.matrixWorldNeedsUpdate = true;
  });

  return <group ref={g} matrixAutoUpdate={false}>{children}</group>;
}


/* ==========================================================================
 *  A doughnut that rolls out of a tent
 * ========================================================================== */

/**
 * Rolls along a heading, spins about the axis across it, and wobbles to a stop.
 *
 * The spin rate is derived from the distance travelled and the doughnut's own
 * radius rather than picked by eye, so it rolls instead of skidding - the one
 * detail that makes a rolling object read as rolling.
 */
export function RollingDonut({
  url, from, heading, distance, duration, radius, scale, active, onRest,
}: {
  url: string;
  from: [number, number, number];
  heading: number;
  distance: number;
  duration: number;
  radius: number;
  scale: number;
  active: boolean;
  onRest?: () => void;
}) {
  const g = useRef<THREE.Group>(null);
  const t = useRef(0);
  const rested = useRef(false);
  useEffect(() => { t.current = 0; rested.current = false; }, [active]);
  useFrame((_, dt) => {
    if (!active || !g.current) return;
    t.current += dt;
    const dur = Math.max(0.1, duration);
    const raw = Math.min(1, t.current / dur);
    // decelerate: it leaves the tent with momentum and runs out of it
    const u = 1 - Math.pow(1 - raw, 2.2);
    const d = distance * u;
    g.current.position.set(
      from[0] + Math.sin(heading) * d,
      from[1],
      from[2] + Math.cos(heading) * d,
    );
    // rolling, not skidding: theta = arc length / radius
    const roll = d / Math.max(0.01, radius);
    g.current.rotation.set(0, heading, 0);
    g.current.rotateX(roll);
    // a last wobble as it loses the last of its speed
    if (raw > 0.72) {
      const w = (raw - 0.72) / 0.28;
      g.current.rotateZ(Math.sin(w * Math.PI * 3) * 0.28 * (1 - w));
    }
    if (raw >= 1 && !rested.current) { rested.current = true; onRest?.(); }
  });
  if (!active) return null;
  return (
    <group ref={g} position={from} scale={scale}>
      <CarriedModel url={url} />
    </group>
  );
}


/* ==========================================================================
 *  The acts
 * ========================================================================== */

export const RACCOON2_URL = "/animals/raccoon_american.glb";
const DONUT_URL = "/bear/2/Donut%20by%20Quaternius%20-%20UQRRrsP3wj.glb";

/* basePosition / baseRotationY as written on each <Selectable> in CampfireScene.
   The live slider override is added on top, so dragging a bag in the lab moves
   the whole performance with it rather than leaving the critter grabbing air. */
const TENT_BASE: [number, number, number] = [4.6, 0, -4.2];
const TENT_YAW = -0.83;

/*
 * MEASURED lowest point of each model, in its own raw units.
 *
 * Taken from the Blender bounds put through the exporter's Y-up transform
 * ((x,y,z) -> (x, z, -y)), NOT by reading min/max off the GLB. For a skinned
 * mesh those accessors hold BIND-POSE data: the condor's read as a 6.2-unit
 * wingspan (it is 0.89 folded, ~3.1 with the wings out) and the raccoon's read
 * taller than the animal is long.
 *
 * None of these three has its origin at its feet, and two of them are nowhere
 * near it - which is the whole reason the first pass looked wrong. Parked at
 * y = 0 the moose was fine by luck; the raccoon, whose origin sits 0.640 above
 * its own paws, was buried to the shoulders.
 *
 * So a critter's root Y is never written directly. It is always
 *     groundY - rawBase * scale
 * which puts the feet ON the ground for any scale, and keeps them there when
 * the scale slider moves.
 */
const BASE_Y = { raccoon: 0.000 } as const;
const footY = (ground: number, who: keyof typeof BASE_Y, scale: number) =>
  ground - BASE_Y[who] * scale;

/*
 * Reach chains, measured per rig.
 *
 *   moose   Spine_03..head on local X-, ~0.30 rad each -> the muzzle reaches
 *           0.334 world and the bag sits at 0.360. The neck ALONE bottoms out
 *           at 0.61 and cannot get there at any angle.
 *   raccoon head only, on local X+. Its `neck` bone moves the muzzle by 0.000
 *           on every axis, so including it would be a pure no-op.
 */
const RACCOON_DIP_CHAIN = ["head"];

export type ActName = "raccoon";

export function CampCritters({
  config, act, onDone,
}: {
  config: CampfireSceneConfig;
  act: ActName | null;
  onDone: () => void;
}) {
  const c = config;
  const ov = useCallback(
    (n: string) => c.objectOverrides?.[n] ?? EMPTY_OVERRIDE,
    [c.objectOverrides],
  );
  const at = useCallback(
    (base: [number, number, number], n: string): [number, number, number] => {
      const o = ov(n);
      return [base[0] + o.dx, base[1] + o.dy, base[2] + o.dz];
    },
    [ov],
  );

  /* ---------------- RACCOON + DOUGHNUT ------------------------------------
   * The doughnut leaves first and the raccoon follows, which is done with a
   * "wait" leg rather than a timer: leg 0 is the raccoon standing inside the
   * tent for exactly as long as the roll lasts, so the two can never drift
   * apart however the durations are retuned. */
  const raccoon = useMemo(() => {
    const tent = at(TENT_BASE, "campfire_tent");
    const yaw = TENT_YAW + ov("campfire_tent").rotY;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const gy = footY(c.critterGroundY, "raccoon", c.raccoonScale);
    const mouth: [number, number, number] = [
      tent[0] + fx * c.tentMouthOut, c.critterGroundY + c.donutY, tent[2] + fz * c.tentMouthOut,
    ];
    const rest: [number, number, number] = [
      mouth[0] + fx * c.donutRoll, mouth[1], mouth[2] + fz * c.donutRoll,
    ];
    const meet: [number, number, number] = [
      rest[0] - fx * c.raccoonReach, gy, rest[2] - fz * c.raccoonReach,
    ];
    const home: [number, number, number] = [tent[0], gy, tent[2]];
    const legs: CritterLeg[] = [
      { dur: c.donutRollDur, to: home, clip: "idle", yaw },
      { dur: c.raccoonOutDur, to: meet, clip: "trot", gait: GAIT.raccoonTrot, ease: "out", yaw },
      { dur: c.raccoonReachDur, to: meet, clip: "stand", dip: c.raccoonDip, dipShape: "in", yaw },
      { dur: c.raccoonTakeDur, to: meet, clip: "stand", dip: c.raccoonDip, dipShape: "out",
        grab: true, yaw },
      { dur: c.raccoonBackDur, to: home, clip: "walk", gait: GAIT.raccoonWalk, ease: "in",
        yaw: yaw + Math.PI },
    ];
    return { home, mouth, yaw, legs };
  }, [at, ov, c.critterGroundY, c.raccoonScale, c.tentMouthOut, c.donutY, c.donutRoll, c.raccoonReach, c.donutRollDur,
      c.raccoonOutDur, c.raccoonReachDur, c.raccoonDip, c.raccoonTakeDur, c.raccoonBackDur]);

  return (
    <>
      <CritterPerformance
        url={RACCOON2_URL} active={act === "raccoon"} scale={c.raccoonScale}
        from={raccoon.home} yaw0={raccoon.yaw} legs={raccoon.legs}
        attachBone="mouth" dipBones={RACCOON_DIP_CHAIN}
        carry={{ url: DONUT_URL, offset: [0, c.donutCarryDrop, 0],
                 rotation: [Math.PI / 2, 0, 0], scale: c.donutCarryScale }}
        onDone={onDone}
      />
      <RollingDonut
        url={DONUT_URL} active={act === "raccoon"}
        from={raccoon.mouth} heading={raccoon.yaw}
        distance={c.donutRoll} duration={c.donutRollDur}
        radius={c.donutRadius} scale={c.donutScale}
      />
    </>
  );
}
