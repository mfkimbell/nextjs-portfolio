// components/RightBirdScene.tsx
"use client";

import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import RightBirdGLB from "./RightBirdGLB";

import Matte from "@/components/Matte";
export default function RightBirdScene() {
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <div className="relative z-0">
      {/* Bird Canvas */}
      <div
        ref={containerRef}
        className="
          absolute right-0 top-0
          w-[140px] sm:w-[160px] h-[140px] sm:h-[160px]
          pointer-events-none z-0
          scale-85 sm:scale-100
        "
      >
        <Canvas dpr={[1, 2]} camera={{ position: [0, 1, 3], fov: 40 }}>
          <Matte />
          <Environment preset="city" environmentIntensity={0.6} />
          <ambientLight intensity={0.35} />
          <directionalLight
            position={[5, 10, 5]}
            intensity={2.4}
            color="#fff2d6"
          />
          <directionalLight
            position={[-6, 4, -3]}
            intensity={0.9}
            color="#7fcfff"
          />
          <directionalLight
            position={[0, 3, -6]}
            intensity={0.5}
            color="#ffffff"
          />
          <RightBirdGLB containerRef={containerRef} />
          <OrbitControls enableZoom={false} enablePan={false} />
        </Canvas>
      </div>
    </div>
  );
}
