"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import AirplaneGLB from "./AirplaneGLB";

import Matte from "@/components/Matte";
interface AirplaneTrackingProps {
  className?: string;
}

export default function AirplaneTracking({
  className = "pointer-events-none relative h-screen w-full overflow-hidden z-1",
}: AirplaneTrackingProps) {
  return (
    <div className={className} aria-hidden="true">
      {/* 1) 3D scene */}
      <Canvas
        shadows
        camera={{ position: [0, 0, 5], fov: 50 }}
        className="pointer-events-none"
      >
        <Matte />
        {/* Ambient fill */}
        <ambientLight intensity={1.6} />

        {/* Directional “sun” */}
        <directionalLight
          castShadow
          position={[2, 4, 5]}
          intensity={2.4}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />

        {/* Ground shadow plane */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -2.5, 0]}
          receiveShadow
        >
          <planeGeometry args={[12, 12]} />
          <shadowMaterial opacity={0.12} />
        </mesh>

        {/* Airplane */}
        <Suspense fallback={null}>
          <AirplaneGLB />
        </Suspense>
      </Canvas>     
    </div>
  );
}
