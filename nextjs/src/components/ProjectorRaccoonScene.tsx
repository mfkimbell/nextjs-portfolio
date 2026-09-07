// components/ProjectorRaccoonScene.tsx
//
// Transparent canvas wrapper for the Projects section's raccoon projector show.
// The page background shows through; nothing is drawn here but the model.
"use client";

import React, { Suspense, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import ProjectorRaccoonGLB from "./ProjectorRaccoonGLB";

import Matte from "@/components/Matte";
/** Authored extents of the GLB (8.45 x 4.36), padded off the frame edge. */
const FIT_WIDTH = 9.3;
const FIT_HEIGHT = 4.9;

/**
 * Pulls the camera back far enough that the whole scene fits, on whichever axis
 * is tighter. The section is very wide on desktop and nearly square on a phone;
 * a fixed camera z either strands the scene in the middle of a wide frame or
 * crops the projector and the branch off a narrow one.
 */
function FitCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => {
    const halfFov = (camera.fov * Math.PI) / 360;
    const distForHeight = FIT_HEIGHT / 2 / Math.tan(halfFov);
    const distForWidth = FIT_WIDTH / 2 / (Math.tan(halfFov) * camera.aspect);
    camera.position.set(0, 0, Math.max(distForHeight, distForWidth));
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  return null;
}

type Props = {
  /** Public URL of the architecture PNG to project onto the screen. */
  archSrc?: string;
  className?: string;
};

function ProjectorRaccoonScene({ archSrc, className }: Props) {
  return (
    <div
      className={
        className ??
        "w-full h-[260px] sm:h-[360px] md:h-[440px] lg:h-[520px] pointer-events-none"
      }
    >
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 9], fov: 40 }}>
        <Matte />
        <FitCamera />
        <Environment preset="apartment" environmentIntensity={0.5} />
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[3, 5, 4]}
          intensity={1.6}
          color="#fff3d6"
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-4, 3, 2]} intensity={0.5} color="#bcd9ff" />
        <directionalLight position={[0, 3, -6]} intensity={0.4} color="#ffffff" />
        <Suspense fallback={null}>
          <ProjectorRaccoonGLB archSrc={archSrc} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Projects re-renders on every hover/selection change in the switcher row.
// Only archSrc matters to the canvas, so memoising keeps the GL loop out of it.
export default React.memo(ProjectorRaccoonScene);
