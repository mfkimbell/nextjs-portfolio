// components/FooterAnimalGLB.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

export type FooterAnimalGLBProps = {
  modelUrl: string;
  animationName?: string;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: number;
  castShadow?: boolean;
  /** Seconds into the clip to start at. Use to desync copies of the same clip. */
  animationTimeOffset?: number;
  /** Playback rate. 1 = normal. Slightly-off values keep two copies from re-syncing. */
  animationTimeScale?: number;
  /**
   * When true, the mesh is moved off the default render layer (0) so it isn't
   * visible in the main pass, but still casts shadow when the light layer is
   * configured to include layer 1. Used for the "shadow-only" second canvas.
   */
  shadowOnly?: boolean;
  /**
   * Optional name of the "click" clip to play once and fade back from. If not
   * set, the component picks the first clip in the GLB whose name differs from
   * `animationName` — i.e. the model's other shipped animation (typically the
   * lying-down / rest pose for these creatures).
   */
  clickAnimationName?: string;
  /**
   * Monotonic tick — every increment triggers a one-shot play of the click
   * clip. Parent bumps this on user click.
   */
  clickTrigger?: number;
  /** When true, the click clip clamps at its final frame instead of fading
   *  back into the idle. Use for terminal poses like sit/lie. */
  clickHoldsFinalFrame?: boolean;
};

export default function FooterAnimalGLB({
  modelUrl,
  animationName,
  position = [0, -1.15, 0],
  rotation = [0, 0, 0],
  scale = 1,
  castShadow = false,
  animationTimeOffset = 0,
  animationTimeScale = 1,
  shadowOnly = false,
  clickAnimationName,
  clickTrigger = 0,
  clickHoldsFinalFrame = false,
}: FooterAnimalGLBProps) {
  const { scene: source, animations } = useGLTF(modelUrl) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  const scene = useMemo(() => {
    const cloned = cloneSkeleton(source) as THREE.Group;
    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = castShadow || shadowOnly;
      mesh.receiveShadow = false;
      if (shadowOnly) {
        child.layers.set(1);
      }
    });
    return cloned;
  }, [source, castShadow, shadowOnly]);

  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    const action =
      (animationName ? actions[animationName] : null) ??
      Object.values(actions).find(Boolean);
    if (!action) return;

    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    action.timeScale = animationTimeScale;
    if (animationTimeOffset) {
      action.time = animationTimeOffset;
    }
    return () => {
      action.stop();
    };
  }, [actions, animationName, animationTimeOffset, animationTimeScale]);

  useEffect(() => {
    if (!clickTrigger) return;
    // Prefer the explicitly-named click clip; otherwise fall back to the first
    // clip whose name differs from the idle. That heuristic makes clicking
    // work without needing to know the exact "lying down" clip name baked
    // into each GLB.
    const clickAction =
      (clickAnimationName ? actions[clickAnimationName] : null) ??
      Object.entries(actions).find(
        ([name, a]) => a && name !== animationName
      )?.[1] ??
      null;
    if (!clickAction) return;

    const idleAction =
      (animationName ? actions[animationName] : null) ??
      Object.values(actions).find(Boolean);

    clickAction.reset();
    clickAction.setLoop(THREE.LoopOnce, 1);
    clickAction.clampWhenFinished = clickHoldsFinalFrame;
    clickAction.timeScale = 1;
    idleAction?.fadeOut(0.2);
    clickAction.fadeIn(0.15).play();

    if (clickHoldsFinalFrame) return;

    const mixer = clickAction.getMixer();
    const onFinished = (evt: { action: THREE.AnimationAction }) => {
      if (evt.action !== clickAction) return;
      clickAction.fadeOut(0.25);
      if (idleAction) {
        idleAction.reset().fadeIn(0.25).play();
        idleAction.timeScale = animationTimeScale;
      }
      mixer.removeEventListener("finished", onFinished as never);
    };
    mixer.addEventListener("finished", onFinished as never);
    return () => {
      mixer.removeEventListener("finished", onFinished as never);
    };
  }, [clickTrigger, actions, animationName, clickAnimationName, animationTimeScale, clickHoldsFinalFrame]);

  return (
    <primitive
      object={scene}
      position={[...position] as [number, number, number]}
      rotation={[...rotation] as [number, number, number]}
      scale={scale}
    />
  );
}

useGLTF.preload("/models/bunny.glb");
useGLTF.preload("/models/deer_front.glb");
useGLTF.preload("/models/deer_back.glb");
useGLTF.preload("/models/doe.glb");
