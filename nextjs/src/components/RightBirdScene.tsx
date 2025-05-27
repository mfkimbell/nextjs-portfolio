// components/RightBirdScene.tsx
"use client";

import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import RightBirdGLB from "./RightBirdGLB";

export default function RightBirdScene() {
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <div
      ref={containerRef}
      className="
        absolute -right-18 sm:-right-6 top-6
        sm:-translate-y-1/2
        w-[160px] h-[160px]
        pointer-events-none z-10
      "
    >
      <Canvas camera={{ position: [0, 1, 3], fov: 40 }}>
        <ambientLight intensity={2.8} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={3.5}
          color="#7fcfff"
        />
        <RightBirdGLB containerRef={containerRef} />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}
