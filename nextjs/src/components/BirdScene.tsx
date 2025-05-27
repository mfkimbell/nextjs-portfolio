// BirdScene.tsx
"use client";

import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import BirdGLB from "./BirdGLB";

export default function BirdScene() {
  // we assert non‑null here so the prop type is RefObject<HTMLDivElement>
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <div
      ref={containerRef}
      className="absolute -left-18 sm:-left-6 sm:top-1/2  top-6 sm:-translate-y-1/2 w-[220px] h-[220px] pointer-events-none z-10"
    >
      <Canvas camera={{ position: [0, 1, 3], fov: 40 }}>
        <ambientLight intensity={2.8} />
        <directionalLight position={[5, 10, 5]} intensity={3.5} color="#7fcfff" />
        <BirdGLB containerRef={containerRef} />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}
