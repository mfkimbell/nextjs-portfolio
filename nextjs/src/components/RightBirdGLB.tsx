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
  const DECAY = 0.12;                          // smoothing factor

  /* ─── constants ─── */
  const BASE_PITCH = 0.3;                     // slight "curious" tilt
  const BASE_YAW = -1.5;                       // faces left on load

  // Separate limits for left/right movement
  const MAX_YAW_LEFT = 0.2               // how far it can turn left
  const MAX_YAW_RIGHT = 1.8;                   // how far it can turn right

  // Separate limits for up/down movement
  const MAX_PITCH_UP = 1.0;                    // how far it can look up
  const MAX_PITCH_DOWN = 1.4;                  // how far it can look down

  const MAX_ROLL = -0.25;                      // subtle roll
  const YAW_OFFSET = 0.2;                      // adjust center point of yaw
  const PITCH_OFFSET = 0.1;                    // adjust center point of pitch

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
    const update = (e: MouseEvent) => {
      // Adjust cursor range to be more centered
      cursor.current.x = ((e.clientX / window.innerWidth) * 2 - 1) + YAW_OFFSET;
      cursor.current.y = ((e.clientY / window.innerHeight) * 2 - 1) + PITCH_OFFSET;
    };
    window.addEventListener("mousemove", update);
    return () => window.removeEventListener("mousemove", update);
  }, []);

  /* ─── animation ─── */
  useFrame(() => {
    if (!head.current || !containerRef.current) return;

    /* target angles with separate limits for each direction */
    const tgtYaw = BASE_YAW + (cursor.current.x > 0
      ? cursor.current.x * MAX_YAW_RIGHT
      : cursor.current.x * MAX_YAW_LEFT);

    const tgtPitch = BASE_PITCH + (cursor.current.y > 0
      ? cursor.current.y * MAX_PITCH_UP
      : cursor.current.y * MAX_PITCH_DOWN);

    const tgtRoll = cursor.current.x * MAX_ROLL * -1; // roll with yaw

    /* ease toward targets */
    head.current.rotation.y += (tgtYaw - head.current.rotation.y) * DECAY;
    head.current.rotation.x += (tgtPitch - head.current.rotation.x) * DECAY;
    head.current.rotation.z += (tgtRoll - head.current.rotation.z) * DECAY;
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
