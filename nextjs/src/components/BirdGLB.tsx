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
  const BASE_YAW = -1; // + looks right, − looks left
  const BASE_ROLL = 0.0; // + tilt right ear down, − left ear down

  // Maximum rotation delta driven by pointer
  const MAX_PITCH_DELTA = 1.2;
  const MAX_YAW_DELTA = 0.5;
  const MAX_ROLL_DELTA = 0.2;

  // Responsiveness
  const DEAD_ZONE = 0.2; // fraction of half-width before head starts turning
  const SENSITIVITY = 2.0; // scales pointer→rotation
  const INVERT_X = 1; // 1 = normal, −1 flips horizontal mapping
  const INVERT_Y = -1; // 1 = normal, −1 flips vertical mapping
  const CENTER_OFFSET_X = 1; // fraction of half-width to shift pointer origin rightwards
  const SMOOTHING = 0.1; // interpolation factor for smooth motion

  // How many pixels from the bird before nodding is fully flattened
  const PITCH_FALLOFF_RADIUS = 2000; // try 250-350px

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

      // calculate shifted center X
      const centerX = rect.left + halfW + halfW * CENTER_OFFSET_X;
      const centerY = rect.top + halfH;

      // raw offsets from shifted center
      const dx = clientX - centerX;
      const dy = clientY - centerY;

      // apply dead zone in pixels
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
      pointer.current.x = THREE.MathUtils.clamp(
        xNorm * SENSITIVITY * INVERT_X,
        -1,
        1
      );
      pointer.current.y = THREE.MathUtils.clamp(
        yNorm * SENSITIVITY * INVERT_Y,
        -1,
        1
      );
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

    // Calculate distance from mouse to bird center on screen (scroll-aware)
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const birdScreenX = rect.left + rect.width / 2;
    const birdScreenY = rect.top + rect.height / 2;
    const dx = lastPos.current.x - birdScreenX;
    const dy = lastPos.current.y - birdScreenY;

    // 0 when mouse is on the bird, 1 when cursor is ≥ radius away
    const distRatio = Math.min(1, Math.hypot(dx, dy) / PITCH_FALLOFF_RADIUS);
    const pitchScale = 1 - distRatio; // fades linearly to 0

    // Target rotations
    const targetPitch =
      BASE_PITCH +
      THREE.MathUtils.clamp(
        pointer.current.y * MAX_PITCH_DELTA * pitchScale,
        -MAX_PITCH_DELTA,
        MAX_PITCH_DELTA
      );
    const targetYaw =
      BASE_YAW +
      THREE.MathUtils.clamp(
        pointer.current.x * MAX_YAW_DELTA,
        -MAX_YAW_DELTA,
        MAX_YAW_DELTA
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
