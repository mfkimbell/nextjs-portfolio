// components/RightBirdScene.tsx
"use client";

import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import RightBirdGLB from "./RightBirdGLB";

export default function RightBirdScene() {
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <div className="relative">
      {/* Bird Canvas */}
      <div
        ref={containerRef}
        className="
          absolute right-0 top-0
          w-[140px] sm:w-[160px] h-[140px] sm:h-[160px]
          pointer-events-none z-100
          scale-85 sm:scale-100
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
    </div>
  );
}
