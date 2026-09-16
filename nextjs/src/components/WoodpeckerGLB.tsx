// components/WoodpeckerGLB.tsx
"use client";

import React, { useEffect, useMemo, useRef, RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { SURFACE_X, BIRD_SCALE, BIRD_Y } from "./woodpeckerLayout";

/**
 * woodpecker_peck_v9.glb - coordinate contract (authored in Blender, exported Y-up):
 *   implied tree surface = the plane z = 0; the bird lives at z > 0, back facing +z
 *   foot grip point at y = 0; rest beak tip z = +0.55, impact drives it to z = -0.206
 *   (0.08 into the bark) - rest/cock poses are bit-identical to v9
 *   rotating +90deg about Y puts that surface on world x = SURFACE_X
 *
 * Behaviour: a pecking bout stretched to 1.5 seconds at runtime, then a
 * one-second rest, repeating. No alert routine, no cursor tracking, no showy
 * head turns.
 *
 * The whole lower body (hips, ankles, feet, every toe, tail) is world-locked and
 * bit-identical on every frame of every clip - the peck is driven entirely from
 * the chest up. Counter-recoil lives on Chest, never on Body; putting it on Body
 * is what made the hips pump against planted feet in earlier versions.
 *
 * Clips (60fps; every one starts and ends on the neutral cling pose so
 * cross-fades are seamless):
 *   ACT_peck_bout      1.00s  8 jabs at 8.6/sec - the only scheduled clip
 *   ACT_cling_idle     2.75s  looping brace, head moves at most 1.1 deg
 *   ACT_peck_single    0.45s  one jab               - ASSET ONLY, not scheduled
 *   ACT_peck_readable  1.15s  two restrained jabs   - ASSET ONLY, not scheduled
 *   ACT_peck_burst     0.92s  five fast jabs        - ASSET ONLY, not scheduled
 *   ACT_peck_alert     1.65s  small glance          - ASSET ONLY, not scheduled
 *   Animation          2.04s  original lower-beak clip from the source model
 *
 * Do not add per-frame rotation to bones here. An additive nudge multiplied onto
 * a bone quaternion every frame is how the head ended up drifting before; the
 * mixer owns the rig, full stop.
 */

const MODEL = "/models/woodpecker_peck_v15.glb";
const IDLE = "ACT_cling_idle";

/** The peck. Everything not listed here ships as an unused asset. */
const PECK = "ACT_peck_bout";

/**
 * Idle beats dropped into some of the gaps. These only turn the head and work
 * the beak - the head never pulls back from the trunk, because retreating it
 * reads as the head sinking into the body. Yaw is applied about the head's own
 * origin so the beak swings. All three start and end on the neutral cling pose.
 */
const IDLE_BEATS = ["ACT_idle_look", "ACT_idle_peek", "ACT_idle_call"];
/** Fraction of gaps that get an idle beat instead of plain standing. */
const IDLE_BEAT_CHANCE = 0.55;

/** Play the authored 1s peck bout over 1.5s, then rest for 1s. */
const PECK_DURATION = 1.5;
const REST = 1.0;
const FIRST_REST = 1.0;

const FADE = 0.2;

interface WoodpeckerGLBProps {
  containerRef: RefObject<HTMLDivElement>;
}

type GLTFResult = { scene: THREE.Group; animations: THREE.AnimationClip[] };

export default function WoodpeckerGLB({ containerRef }: WoodpeckerGLBProps) {
  const gltf = useGLTF(MODEL) as unknown as GLTFResult;

  // useGLTF caches the parsed scene; the mixer mutates bones, so own a clone.
  const scene = useMemo(() => cloneSkeleton(gltf.scene) as THREE.Group, [gltf.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);

  const actions = useMemo(() => {
    const map: Record<string, THREE.AnimationAction> = {};
    for (const clip of gltf.animations) map[clip.name] = mixer.clipAction(clip);
    return map;
  }, [gltf.animations, mixer]);

  const sched = useRef<{ timer: number; busy: THREE.AnimationAction | null; nextIsPeck: boolean }>({
    timer: FIRST_REST,
    busy: null,
    nextIsPeck: true,
  });

  useEffect(() => {
    const idle = actions[IDLE];
    if (!idle) {
      console.warn(
        "[WoodpeckerGLB] missing clip " + IDLE + " - available: " + Object.keys(actions).join(", ")
      );
      return;
    }
    idle.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();

    const onFinished = (event: { action: THREE.AnimationAction }) => {
      event.action.fadeOut(FADE);
      actions[IDLE]?.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(FADE).play();
      const st = sched.current;
      // After a peck, sometimes slip an idle beat into the gap; after a beat,
      // always go back to pecking so the bird never idles twice in a row.
      st.nextIsPeck = st.nextIsPeck ? Math.random() >= IDLE_BEAT_CHANCE : true;
      st.busy = null;
      st.timer = REST;
    };

    mixer.addEventListener("finished", onFinished as never);
    return () => {
      mixer.removeEventListener("finished", onFinished as never);
      mixer.stopAllAction();
    };
  }, [actions, mixer]);

  useFrame((_, delta) => {
    // Clamp dt so a backgrounded tab doesn't fire a queue of scheduled bouts.
    const dt = Math.min(delta, 0.05);
    const s = sched.current;

    if (!s.busy) {
      s.timer -= dt;
      if (s.timer <= 0) {
        const isPeck = s.nextIsPeck;
        const name = isPeck
          ? PECK
          : IDLE_BEATS[Math.floor(Math.random() * IDLE_BEATS.length)];
        const action = actions[name];
        if (action) {
          action.reset();
          action.setLoop(THREE.LoopOnce, 1);
          // Only the peck is retimed; idle beats play at their authored speed.
          action.setDuration(isPeck ? PECK_DURATION : action.getClip().duration);
          action.clampWhenFinished = true;
          action.setEffectiveWeight(1);
          action.fadeIn(FADE).play();
          actions[IDLE]?.fadeOut(FADE);
          s.busy = action;
        } else {
          s.nextIsPeck = true;
          s.timer = REST;
        }
      }
    }

    mixer.update(dt);
    // Intentionally nothing after mixer.update(): no cursor follow, no additive
    // bone rotation. containerRef is kept for API compatibility with the scene.
    void containerRef;
  });

  return (
    <primitive
      object={scene}
      position={[SURFACE_X, BIRD_Y, 0]}
      scale={BIRD_SCALE}
      rotation={[0, Math.PI / 2, 0]}
    />
  );
}

useGLTF.preload(MODEL);
