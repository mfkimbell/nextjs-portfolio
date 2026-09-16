// components/ParrotScene.tsx
"use client";

import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import ParrotGLB from "./ParrotGLB";

import Matte from "@/components/Matte";
export default function ParrotScene() {
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <div
      ref={containerRef}
      className="w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] pointer-events-none"
    >
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0.6, 3], fov: 40 }}>
        <Matte />
        <Environment preset="city" environmentIntensity={0.6} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 10, 5]} intensity={2.4} color="#fff2d6" />
        <directionalLight position={[-6, 4, -3]} intensity={0.9} color="#7fcfff" />
        <directionalLight position={[0, 3, -6]} intensity={0.5} color="#ffffff" />
        <ParrotGLB containerRef={containerRef} />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}
