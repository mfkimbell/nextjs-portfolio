// components/FooterAnimalScene.tsx
"use client";

import type { CSSProperties } from "react";
import { Canvas } from "@react-three/fiber";
import type { DirectionalLight } from "three";
import FooterAnimalGLB, { type FooterAnimalGLBProps } from "./FooterAnimalGLB";

import Matte from "@/components/Matte";
export type ShadowCatcherConfig = {
  /** World-space center of the receiver plane. Should sit behind the animal (negative Z). */
  position: readonly [number, number, number];
  /** Width x Height of the receiver plane. */
  size: readonly [number, number];
  /** Shadow darkness 0-1. */
  opacity?: number;
  /** Light position — silhouette-style shadow wants a light roughly along +Z (in front of the animal, close to camera axis). */
  lightPosition?: readonly [number, number, number];
};

type FooterAnimalSceneProps = FooterAnimalGLBProps & {
  className?: string;
  style?: CSSProperties;
  cameraFov?: number;
  shadowCatcher?: ShadowCatcherConfig;
  /** When true, the animal itself is hidden (moved off layer 0) but still casts shadow. Used for the second, mask-clipped shadow canvas. */
  shadowOnly?: boolean;
  /** When true, an internal `<button>` at `clickHitbox` calls onClick. The
   *  canvas wrapper itself remains `pointer-events-none` so it never blocks
   *  underlying UI (e.g. bulletin buttons). */
  interactive?: boolean;
  onClick?: () => void;
  /** Cursor style on the hitbox. Defaults to "pointer". */
  cursor?: string;
  /** Hitbox rect (percent of the canvas wrapper). Only the hitbox is
   *  clickable; the rest of the canvas passes clicks through. If omitted,
   *  the hitbox covers the full canvas — use this only for animals whose
   *  canvas rect doesn't overlap any other interactive UI. */
  clickHitbox?: {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
  };
};

export default function FooterAnimalScene({
  className = "",
  style,
  cameraFov = 40,
  shadowCatcher,
  shadowOnly = false,
  interactive = false,
  onClick,
  cursor = "pointer",
  clickHitbox,
  ...animalProps
}: FooterAnimalSceneProps) {
  const shadowsEnabled = !!shadowCatcher;
  const lightPos = shadowCatcher?.lightPosition ?? [0, 1, 12];
  const clickable = interactive && !shadowOnly && !!onClick;
  const hb = clickHitbox ?? { leftPct: 0, topPct: 0, widthPct: 100, heightPct: 100 };
  return (
    <div
      className={`pointer-events-none absolute ${className}`}
      style={style}
      aria-hidden="true"
    >
      <Canvas
        shadows={shadowsEnabled}
        camera={{ position: [0, 0.35, 5], fov: cameraFov }}
        gl={{ alpha: true, antialias: true }}
        // Canvas element defaults to pointer-events: auto, which would let it
        // steal clicks from anything underneath (e.g. the bulletin's own R3F
        // canvas). The wrapper's pointer-events-none doesn't propagate to the
        // canvas element itself, so we set it explicitly here. Interaction
        // still works via the sibling `<button>` hitbox below.
        style={{ pointerEvents: "none" }}
      >
        <Matte />
        {!shadowOnly && (
          <>
            <ambientLight intensity={1.35} />
            <directionalLight position={[3, 4, 5]} intensity={2.2} color="#fff2cf" />
            <directionalLight position={[-3, 1, 2]} intensity={0.55} color="#b9d4f0" />
          </>
        )}
        {shadowsEnabled && (
          <>
            {/* Shadow-casting light aimed roughly along the camera axis so the
                cast shadow is a near-silhouette of the animal. Layer 1 enabled
                so shadow-only meshes (on layer 1) still contribute. */}
            <directionalLight
              ref={(light: DirectionalLight | null) => {
                if (light) light.layers.enable(1);
              }}
              position={[...lightPos] as [number, number, number]}
              intensity={0.0001}
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-camera-near={0.1}
              shadow-camera-far={30}
              shadow-camera-left={-8}
              shadow-camera-right={8}
              shadow-camera-top={8}
              shadow-camera-bottom={-8}
            />
            <mesh
              position={
                [...shadowCatcher!.position] as [number, number, number]
              }
              receiveShadow
            >
              <planeGeometry
                args={[shadowCatcher!.size[0], shadowCatcher!.size[1]]}
              />
              <shadowMaterial
                transparent
                opacity={shadowCatcher!.opacity ?? 0.4}
              />
            </mesh>
          </>
        )}
        <FooterAnimalGLB
          {...animalProps}
          castShadow={shadowsEnabled}
          shadowOnly={shadowOnly}
        />
      </Canvas>
      {clickable && (
        <button
          type="button"
          aria-label="Play animation"
          onClick={onClick}
          className="absolute bg-transparent p-0"
          style={{
            left: `${hb.leftPct}%`,
            top: `${hb.topPct}%`,
            width: `${hb.widthPct}%`,
            height: `${hb.heightPct}%`,
            border: "none",
            cursor,
            pointerEvents: "auto",
          }}
        />
      )}
    </div>
  );
}
