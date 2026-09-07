// components/WoodpeckerScene.tsx
"use client";

import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import WoodpeckerGLB from "./WoodpeckerGLB";

import Matte from "@/components/Matte";
/**
 * Transparent overlay canvas. The tree the bird clings to is painted by the
 * page behind this widget, so nothing is drawn here except the bird itself.
 * See woodpeckerLayout.ts for how the bird is aligned to that tree.
 */
export default function WoodpeckerScene() {
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <div
      ref={containerRef}
      className="w-[180px] h-[180px] sm:w-[210px] sm:h-[210px] pointer-events-none"
    >
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0.15, 4], fov: 35 }}>
        <Matte />
        <Environment preset="forest" environmentIntensity={0.6} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[3, 5, 4]} intensity={2.4} color="#fff0cf" />
        <directionalLight position={[-2, 2, 3]} intensity={1.0} color="#7fcfff" />
        <directionalLight position={[0, 3, -6]} intensity={0.5} color="#ffffff" />
        <WoodpeckerGLB containerRef={containerRef} />
      </Canvas>
    </div>
  );
}
