// components/ToucanScene.tsx
"use client";

import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import ToucanGLB, { type VoiceState } from "./ToucanGLB";
import { toucanConfig as CFG, toucan2Config } from "@/config/toucan";

import Matte from "@/components/Matte";
type ToucanSceneProps = {
  /**
   * Live voice state. A ref, not a value: the voice hook updates the audio
   * level on every animation frame, and threading that through as a prop would
   * re-render this whole subtree at 60fps. The ref identity never changes, so
   * React stays out of the loop and useFrame reads it directly.
   */
  voiceRef?: React.RefObject<VoiceState>;
};

function ToucanScene({ voiceRef }: ToucanSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    // Wide canvas for the two toucans.
    <div
      ref={containerRef}
      className="w-full h-[320px] sm:h-[440px] md:h-[520px] cursor-grab active:cursor-grabbing"
    >
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, CFG.CAMERA_Z], fov: 40 }}>
        <Matte />
        <Environment preset="city" environmentIntensity={0.6} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={2.4}
          color="#fff2d6"
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight
          position={[-6, 4, -3]}
          intensity={0.9}
          color="#7fcfff"
        />
        <directionalLight
          position={[0, 3, -6]}
          intensity={0.6}
          color="#ffffff"
        />
        {/* Two birds sharing one rerigged model but nothing else: separate
            cloned skeletons, placement, head tracking, beak speed, breathing
            phase, saccade cadence and idle-break timing. */}
        <ToucanGLB containerRef={containerRef} config={CFG} voiceRef={voiceRef} />
        <ToucanGLB containerRef={containerRef} config={toucan2Config} voiceRef={voiceRef} />
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          minDistance={2.5}
          maxDistance={9}
          target={[-3.1, 0.05, -0.15]}
        />
      </Canvas>
    </div>
  );
}

// TalkToTheBirds re-renders every frame while the agent talks (the hook stores
// the audio level in state). Nothing here depends on those values, so memoising
// keeps the canvas out of that render loop entirely.
export default React.memo(ToucanScene);
