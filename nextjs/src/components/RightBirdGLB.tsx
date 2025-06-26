// components/RightBirdGLB.tsx
"use client";

import React, { useEffect, useRef, RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useHelper } from "@react-three/drei";
import * as THREE from "three";

interface GLTFResult {
  scene: THREE.Group;
}

interface RightBirdGLBProps {
  containerRef: RefObject<HTMLDivElement>;
}

export default function RightBirdGLB({ containerRef }: RightBirdGLBProps) {
  /* ─── load model ─── */
  const { scene } = useGLTF("/models/RightBird.glb") as GLTFResult;

  /* ─── refs ─── */
  const sceneRef = useRef<THREE.Object3D>(null!);
  const head = useRef<THREE.Object3D>(null!);

  /* (dev) visualise skeleton – remove in prod */
  useHelper(sceneRef, THREE.SkeletonHelper);

  /* ─── pointer state ─── */
  const cursor = useRef({ x: 0, y: 0 });        // –1 … 1
  const lastMousePos = useRef({ x: 0, y: 0 });  // store mouse position for scroll updates
  const DECAY = 0.12;                          // smoothing factor

  /* ─── constants ─── */
  const BASE_PITCH = 0.3;                     // slight "curious" tilt
  const BASE_YAW = -1;                       // faces left on load

  // Absolute limits for yaw (left/right rotation)
  const YAW_LIMIT_LEFT = -1.5;            // leftmost position (more negative = further left)
  const YAW_LIMIT_RIGHT = 0.8;            // rightmost position

  // Absolute limits for pitch (up/down rotation)  
  const PITCH_LIMIT_UP = 1.2;             // highest position
  const PITCH_LIMIT_DOWN = -.2;          // lowest position

  const MAX_ROLL = -0;                     // subtle roll
  const YAW_OFFSET = 0;                    // adjust center point of yaw
  const PITCH_OFFSET = -.1;                // adjust center point of pitch
  const PITCH_SENSITIVITY = 3.2;          // multiplier for up-down reactivity
  const MOUSE_X_OFFSET = 0.3;              // shift mouse X position to align bird gaze (+ = shift right, - = shift left)

  /* ─── find head bone ─── */
  useEffect(() => {
    const h = scene.getObjectByName("Head");
    if (h) {
      head.current = h;
      head.current.rotation.set(BASE_PITCH, BASE_YAW, 0);
    } else {
      console.error("[RightBirdGLB] Head bone not found");
    }
  }, [scene, BASE_PITCH, BASE_YAW]);

  /* ─── cursor listener (viewport-wide) ─── */
  useEffect(() => {
    const updatePointer = (clientX: number, clientY: number) => {
      // Store mouse position for scroll updates
      lastMousePos.current = { x: clientX, y: clientY };

      if (!containerRef.current) {
        // Fallback to basic calculation if container not available
        cursor.current.x = ((clientX / window.innerWidth) * 2 - 1 + MOUSE_X_OFFSET) + YAW_OFFSET;
        cursor.current.y = (((clientY / window.innerHeight) * 2 - 1) + PITCH_OFFSET) * PITCH_SENSITIVITY;
        return;
      }

      // Get the bird's actual screen position from the container
      const rect = containerRef.current.getBoundingClientRect();
      const birdCenterX = rect.left + rect.width / 2;
      const birdCenterY = rect.top + rect.height / 2;

      // Use fixed distances for normalization (independent of screen size)
      const FIXED_X_RANGE = 400; // pixels - fixed horizontal range for normalization
      const FIXED_Y_RANGE = 300; // pixels - fixed vertical range for normalization
      const PROXIMITY_RANGE = 200; // pixels - fixed range for proximity calculation

      // Calculate distance-based sensitivity using fixed range
      const distanceFromBird = Math.abs(clientX - birdCenterX) / PROXIMITY_RANGE;

      // Exponential falloff - high sensitivity when close, dramatic drop when far
      const proximityFactor = Math.pow(Math.max(0, 1 - distanceFromBird), 2.5);
      const dynamicSensitivity = 0.5 + proximityFactor * 4; // ranges from 0.5 to 4.5

      // Calculate mouse position relative to bird center for X (left/right movement)
      const relativeX = (clientX - birdCenterX) / FIXED_X_RANGE;
      cursor.current.x = (THREE.MathUtils.clamp(relativeX, -2, 2) + MOUSE_X_OFFSET + YAW_OFFSET) * dynamicSensitivity;

      // Calculate mouse position relative to bird center for Y (up/down movement)
      // Apply distance-based sensitivity to pitch as well, but less dramatically than yaw
      const pitchSensitivity = 0.3 + proximityFactor * 1.2; // ranges from 0.3 to 1.5 (less dramatic than yaw)
      const relativeY = (clientY - birdCenterY) / FIXED_Y_RANGE;
      cursor.current.y = (THREE.MathUtils.clamp(relativeY, -2, 2) + PITCH_OFFSET) * PITCH_SENSITIVITY * pitchSensitivity;
    };

    const onMouseMove = (e: MouseEvent) => {
      updatePointer(e.clientX, e.clientY);
    };

    const onScrollResize = () => {
      // Recalculate bird position when scrolling/resizing
      updatePointer(lastMousePos.current.x, lastMousePos.current.y);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("scroll", onScrollResize);
    window.addEventListener("resize", onScrollResize);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScrollResize);
      window.removeEventListener("resize", onScrollResize);
    };
  }, []);

  /* ─── animation ─── */
  useFrame(() => {
    if (!head.current || !containerRef.current) return;

    /* calculate target angles and clamp to absolute limits */
    const rawYaw = BASE_YAW + cursor.current.x * 1.5; // increased sensitivity for full screen movement
    const tgtYaw = THREE.MathUtils.clamp(rawYaw, YAW_LIMIT_LEFT, YAW_LIMIT_RIGHT);

    // Reduce pitch sensitivity when bird is looking away (left), keep normal when facing user (right)
    const yawFromBase = tgtYaw - BASE_YAW; // how much bird has turned from center (can be negative)
    const pitchReduction = yawFromBase < 0
      ? Math.max(0.3, 1 + yawFromBase * 0.5)  // reduce when turning more left (negative)
      : 1.0; // full sensitivity when turning right (towards user)
    const rawPitch = BASE_PITCH + cursor.current.y * 0.8 * pitchReduction;
    const tgtPitch = THREE.MathUtils.clamp(rawPitch, PITCH_LIMIT_DOWN, PITCH_LIMIT_UP);

    const tgtRoll = cursor.current.x * MAX_ROLL * -1; // roll with yaw

    /* ease toward targets */
    head.current.rotation.y += (tgtYaw - head.current.rotation.y) * DECAY;
    head.current.rotation.x += (tgtPitch - head.current.rotation.x) * DECAY;
    head.current.rotation.z += (tgtRoll - head.current.rotation.z) * DECAY;

    // Set rotation order so pitch is applied after yaw (in local space)
    head.current.rotation.order = 'YXZ';
  });

  /* ─── render ─── */
  return (
    <primitive
      ref={sceneRef}
      object={scene}
      position={[0, -1.5, -1.8]}
      scale={[0.04, 0.04, 0.04]}
      rotation={[0, -1.2, 0]}   /* root rotation so bird faces left */
    />
  );
}

useGLTF.preload("/models/RightBird.glb");
