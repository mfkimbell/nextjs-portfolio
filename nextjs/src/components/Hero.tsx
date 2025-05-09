"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import AirplaneGLB from "./AirplaneGLB";

export default function Hero() {
  return (
    <section className="relative w-full h-screen overflow-visit">
      <Canvas shadows camera={{ position: [0, 0, 5], fov: 50 }}>
        {/* Ambient fill */}
        <ambientLight intensity={1.6} />

        {/* Directional “sun” */}
        <directionalLight
          castShadow
          position={[2, 4, 5]}
          intensity={1}
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

      {/* Hero text overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white drop-shadow-md">
          Mitchell Kimbell
        </h1>
        <p className="mt-3 text-lg text-blue-100 max-w-md">
          Full-stack engineer navigating the cloud with creative precision
        </p>
      </div>
    </section>
  );
}
