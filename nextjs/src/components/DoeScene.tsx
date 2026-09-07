// components/DoeScene.tsx
"use client";

import type { CSSProperties } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import DoeGLB from "./DoeGLB";

import Matte from "@/components/Matte";
export default function DoeScene({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`pointer-events-none absolute ${className}`}
      style={style}
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.45, 5], fov: 34 }}
        gl={{ alpha: true, antialias: true }}
      >
        <Matte />
        <Environment preset="forest" environmentIntensity={0.55} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[3, 4, 5]} intensity={1.9} color="#fff2cf" />
        <directionalLight position={[-3, 1, 2]} intensity={0.7} color="#b9d4f0" />
        <directionalLight position={[0, 3, -6]} intensity={0.4} color="#ffffff" />
        <DoeGLB />
      </Canvas>
    </div>
  );
}
