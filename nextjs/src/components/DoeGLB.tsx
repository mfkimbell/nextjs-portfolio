// components/DoeGLB.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

const MODEL = "/models/doe.glb";
const IDLE_ANIMATION = "Deer_Rig|Deer_Rig|Deer_Rig|Dear_idle";

export default function DoeGLB() {
  const { scene: source, animations } = useGLTF(MODEL) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  const scene = useMemo(() => {
    const cloned = cloneSkeleton(source) as THREE.Group;
    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return cloned;
  }, [source]);

  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    const action = actions[IDLE_ANIMATION] ?? Object.values(actions).find(Boolean);
    if (!action) return;

    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    return () => {
      action.stop();
    };
  }, [actions]);

  return (
    <primitive
      object={scene}
      position={[0, -1.25, 0]}
      rotation={[0, -Math.PI, 0]}
      scale={1.45}
    />
  );
}

useGLTF.preload(MODEL);
