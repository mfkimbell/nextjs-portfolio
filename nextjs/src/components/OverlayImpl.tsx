// src/components/OverlayImpl.tsx
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import AirplaneGLB from "./AirplaneGLB";

export default function OverlayImpl() {
  // fix: initialize ref with null
  const elRef = useRef<HTMLDivElement | null>(null);

  // Create and style the container once
  if (!elRef.current && typeof document !== "undefined") {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    elRef.current = el;
  }

  // Append to body on mount, remove on unmount
  useEffect(() => {
    if (!elRef.current) return;
    document.body.appendChild(elRef.current);
    return () => {
      document.body.removeChild(elRef.current!);
    };
  }, []);

  // Don't render until we have our container
  if (!elRef.current) return null;

  return createPortal(
    <Canvas
      shadows
      frameloop="always"
      camera={{ position: [0, 0, 5], fov: 50 }}
    >
      <ambientLight intensity={1.6} />
      <directionalLight position={[2, 4, 5]} intensity={1} />
      <Suspense fallback={null}>
        <AirplaneGLB />
      </Suspense>
    </Canvas>,
    elRef.current
  );
}
