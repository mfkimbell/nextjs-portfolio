// BirdGLB.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
}

interface GLTFResult {
  scene: THREE.Group;
}

export default function BirdGLB({ containerRef }: Props) {
  const { scene } = useGLTF("/models/Bird.glb") as GLTFResult;
  const head = useRef<THREE.Object3D>(null!);

  /* --------------------------------------------------
     POINTER STATE
  -------------------------------------------------- */
  const pointer = useRef({ x: 0, y: 0 });
  const lastPos = useRef({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });

  /* --------------------------------------------------
     TUNEABLE "KNOBS"
     Adjust these to control behavior
  -------------------------------------------------- */
  // Base (starting) head orientation
  const BASE_PITCH = 0.3; // + looks up,  − looks down
  const BASE_YAW = -.8; // + looks right, − looks left
  const BASE_ROLL = 0.0; // + tilt right ear down, − left ear down

  // Maximum rotation delta driven by pointer
  const MAX_PITCH_DELTA = 1.2;
  const MAX_YAW_DELTA = 0.8;
  const MAX_ROLL_DELTA = 0.2;

  // Responsiveness
  const DEAD_ZONE = 0.05; // fraction of half-width before head starts turning
  const SENSITIVITY = 2.0; // scales pointer→rotation
  const INVERT_X = 1; // 1 = normal, −1 flips horizontal mapping
  const INVERT_Y = -1; // 1 = normal, −1 flips vertical mapping
  const CENTER_OFFSET_X = .8; // fraction of half-width to shift pointer origin rightwards
  const CENTER_OFFSET_Y = .25; // fraction of half-height to shift pointer origin (+ = shift down, - = shift up)
  const SMOOTHING = 0.1; // interpolation factor for smooth motion



  /* -------------------------------------------------- */

  /* grab the head bone once and apply base orientation */
  useEffect(() => {
    head.current = scene.getObjectByName("Head")!;
    head.current.rotation.set(BASE_PITCH, BASE_YAW, BASE_ROLL);
  }, [scene, BASE_YAW]);

  /* pointer tracking with pixel-based dead zone and center offset */
  useEffect(() => {
    const updatePointer = (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;

      // calculate shifted center X and Y
      const centerX = rect.left + halfW + halfW * CENTER_OFFSET_X;
      const centerY = rect.top + halfH + halfH * CENTER_OFFSET_Y;

      // raw offsets from shifted center
      const dx = clientX - centerX;
      const dy = clientY - centerY;

      // apply dead zone in pixels (much smaller now)
      const deadPxX = halfW * DEAD_ZONE;
      const deadPxY = halfH * DEAD_ZONE;

      // compute normalized X
      let xNorm: number;
      if (Math.abs(dx) < deadPxX) {
        xNorm = 0;
      } else {
        const signX = dx > 0 ? 1 : -1;
        xNorm = ((Math.abs(dx) - deadPxX) / (halfW - deadPxX)) * signX;
      }

      // compute normalized Y (invert dy so up=positive)
      let yNorm: number;
      if (Math.abs(dy) < deadPxY) {
        yNorm = 0;
      } else {
        const signY = dy > 0 ? -1 : 1;
        yNorm = ((Math.abs(dy) - deadPxY) / (halfH - deadPxY)) * signY;
      }

      // apply sensitivity, inversion, and clamp
      let finalX = xNorm * SENSITIVITY * INVERT_X;
      let finalY = yNorm * SENSITIVITY * INVERT_Y;

      // Normalize diagonal movement to prevent it from being weaker
      const magnitude = Math.hypot(finalX, finalY);
      if (magnitude > 1) {
        finalX = finalX / magnitude;
        finalY = finalY / magnitude;
      }

      pointer.current.x = THREE.MathUtils.clamp(finalX, -1, 1);
      pointer.current.y = THREE.MathUtils.clamp(finalY, -1, 1);
    };

    const onMouseMove = (e: MouseEvent) => {
      lastPos.current = { x: e.clientX, y: e.clientY };
      updatePointer(e.clientX, e.clientY);
    };
    const onScrollResize = () =>
      updatePointer(lastPos.current.x, lastPos.current.y);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("scroll", onScrollResize);
    window.addEventListener("resize", onScrollResize);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScrollResize);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [containerRef, INVERT_Y]);

  /* per-frame smoothing toward target rotations */
  useFrame(() => {
    if (!head.current || !containerRef.current) return;

    // Calculate target yaw first
    const targetYaw =
      BASE_YAW +
      THREE.MathUtils.clamp(
        pointer.current.x * MAX_YAW_DELTA,
        -MAX_YAW_DELTA,
        MAX_YAW_DELTA
      );

    // Reduce pitch sensitivity when bird is looking away (right for left bird), keep normal when facing user (left)
    const yawFromBase = targetYaw - BASE_YAW; // how much bird has turned from center
    const yawBasedReduction = yawFromBase > 0
      ? Math.max(0.5, 1 - yawFromBase * 0.3)  // gentler reduction when turning more right (positive)
      : 1.0; // full sensitivity when turning left (towards user)

    // Target rotations with only yaw-based pitch scaling (removed distance-based scaling)
    const targetPitch =
      BASE_PITCH +
      THREE.MathUtils.clamp(
        pointer.current.y * MAX_PITCH_DELTA * yawBasedReduction,
        -MAX_PITCH_DELTA,
        MAX_PITCH_DELTA
      );

    const targetRoll =
      BASE_ROLL +
      THREE.MathUtils.clamp(
        -pointer.current.x * MAX_ROLL_DELTA,
        -MAX_ROLL_DELTA,
        MAX_ROLL_DELTA
      );

    // Smooth interpolation
    head.current.rotation.x +=
      (targetPitch - head.current.rotation.x) * SMOOTHING;
    head.current.rotation.y +=
      (targetYaw - head.current.rotation.y) * SMOOTHING;
    head.current.rotation.z +=
      (targetRoll - head.current.rotation.z) * SMOOTHING;

    // Set rotation order so pitch is applied after yaw (in local space)
    head.current.rotation.order = 'YXZ';
  });

  return (
    <primitive
      object={scene}
      position={[0, -1.5, -1.8]}
      scale={0.03}
      rotation={[0, 1.2, 0]} /* body yaw */
    />
  );
}

// preload for performance
useGLTF.preload("/models/Bird.glb");
