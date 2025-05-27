// components/RightBirdGLB.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useHelper } from "@react-three/drei";
import * as THREE from "three";

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
}

export default function RightBirdGLB({ containerRef }: Props) {
  /* ─── load model ─── */
  const { scene } = useGLTF("/models/RightBird.glb") as any;

  /* ─── refs ─── */
  const sceneRef = useRef<THREE.Object3D>(null!);
  const head     = useRef<THREE.Object3D>(null!);

  /* (dev) visualise skeleton – remove in prod */
  useHelper(sceneRef, THREE.SkeletonHelper);

  /* ─── pointer state ─── */
  const cursor = useRef({ x: 0, y: 0 });        // –1 … 1
  const DECAY  = 0.12;                          // smoothing factor

  /* ─── constants ─── */
  const BASE_PITCH   =  0.25;                   // slight “curious” tilt
  const BASE_YAW     = -0.8;                    // faces left on load
  const MAX_PITCH    =  0.9;                    // rad
  const MAX_YAW      =  1.0;                    // rad
  const MAX_ROLL     =  0.25;                   // subtle roll

  /* ─── find head bone ─── */
  useEffect(() => {
    const h = scene.getObjectByName("Head");
    if (h) {
      head.current = h;
      head.current.rotation.set(BASE_PITCH, BASE_YAW, 0);
    } else {
      console.error("[RightBirdGLB] Head bone not found");
    }
  }, [scene]);

  /* ─── cursor listener (viewport-wide) ─── */
  useEffect(() => {
    const update = (e: MouseEvent) => {
      cursor.current.x = (e.clientX / window.innerWidth)  * 2 - 1; // –1 … 1
      cursor.current.y = (e.clientY / window.innerHeight) * 2 - 1; // –1 … 1
    };
    window.addEventListener("mousemove", update);
    return () => window.removeEventListener("mousemove", update);
  }, []);

  /* ─── per-frame animation ─── */
  useFrame(() => {
    if (!head.current) return;

    /* target angles - simple, one inversion for yaw */
    const tgtYaw   = BASE_YAW   + (cursor.current.x) * MAX_YAW;
    const tgtPitch = BASE_PITCH + ( cursor.current.y) * MAX_PITCH;
    const tgtRoll  =                 cursor.current.x  * MAX_ROLL * -1; // roll with yaw

    /* ease toward targets */
    head.current.rotation.y += (tgtYaw   - head.current.rotation.y) * DECAY;
    head.current.rotation.x += (tgtPitch - head.current.rotation.x) * DECAY;
    head.current.rotation.z += (tgtRoll  - head.current.rotation.z) * DECAY;
  });

  /* ─── render ─── */
  return (
    <primitive
      ref={sceneRef}
      object={scene}
      position={[0, -1.5, -1.8]}
      scale={[0.03, 0.03, 0.03]}
      rotation={[0, -1.2, 0]}   /* root rotation so bird faces left */
    />
  );
}

useGLTF.preload("/models/RightBird.glb");
