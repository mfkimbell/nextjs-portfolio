// BirdScene.tsx
"use client";

import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import BirdGLB from "./BirdGLB";

import Matte from "@/components/Matte";
export default function BirdScene() {
  // we assert non‑null here so the prop type is RefObject<HTMLDivElement>
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <div
      ref={containerRef}
      className="absolute -left-18 sm:-left-6 sm:top-1/2  top-6 sm:-translate-y-1/2 w-[220px] h-[220px] pointer-events-none z-10"
    >
      <Canvas dpr={[1, 2]} camera={{ position: [0, 1, 3], fov: 40 }}>
        <Matte />
        <Environment preset="city" environmentIntensity={0.6} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 10, 5]} intensity={2.6} color="#fff2d6" />
        <directionalLight position={[-6, 4, -3]} intensity={0.9} color="#7fcfff" />
        <directionalLight position={[0, 3, -6]} intensity={0.5} color="#ffffff" />
        <BirdGLB containerRef={containerRef} />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}
