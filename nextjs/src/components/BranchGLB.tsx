// components/BranchGLB.tsx
//
// The bough the toucan perches on. Procedurally generated low-poly geometry
// with baked vertex colours (COLOR_0), so there's no texture to load.
//
// It's deliberately larger than the canvas: the thick end and the foliage both
// run off frame, which is what makes it read as a branch rather than a twig.
//
// The asset is now split into two meshes:
//
//   BranchWood    static. Never moves — see below.
//   BranchLeaves  swayed in a vertex shader, using a baked `_wind` attribute.
//
// THE WOOD DOES NOT MOVE, ON PURPOSE.
// The toucans are positioned in world space with no parent link to the branch.
// Sway the bough and it slides out from under their feet — the birds would hang
// in mid-air while their perch drifted. Only foliage moves. A real branch would
// flex too, but selling that means driving the birds off the same signal, which
// is a much larger change than this is worth.
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { toucanConfig as CFG } from "@/config/toucan";

const MODEL = "/models/branch_v2.glb";
const LEAF_MESH = "BranchLeaves";
const deg = THREE.MathUtils.degToRad;

/* Injected after <begin_vertex>, which is what declares `transformed`.
 *
 * `_wind` is baked per vertex by blender/branch_rebuild.py:
 *   .x  sway weight — 0 where the foliage meets the wood, 1 at the free tips,
 *       measured as distance to the nearest wood vertex. This is what stops the
 *       clumps detaching and floating: their stems are pinned.
 *   .y  phase, constant across each clump, so a clump moves as one mass rather
 *       than each leaf shimmering independently.
 *
 * Three sine terms rather than one: a single sine reads as a mechanical pulse
 * because every clump reaches its extreme at the same rate. Layering periods
 * that don't divide evenly means the foliage never quite repeats.
 */
const WIND_CHUNK = /* glsl */ `
  float wAmt = _wind.x;
  float wPh  = _wind.y;
  float wT   = uWindTime;

  float swing =
      sin(wT * 1.00 + wPh) * 0.62
    + sin(wT * 2.30 + wPh * 1.7) * 0.26
    + sin(wT * 4.10 + wPh * 2.9) * 0.12;
  float drift = sin(wT * 0.83 + wPh * 1.3 + 1.7);

  transformed += vec3(swing, drift * 0.28, drift * 0.70) * (wAmt * uWindAmp);
`;

export default function BranchGLB() {
  const gltf = useGLTF(MODEL) as unknown as { scene: THREE.Group };

  // useGLTF caches and shares the scene; clone so mounting this twice (or a
  // hot reload) can't hand two mounts the same object.
  const scene = useMemo(() => cloneSkeleton(gltf.scene) as THREE.Group, [gltf.scene]);

  const B = CFG.BRANCH;
  const wind = B.WIND;

  // Stable uniform objects: the shader keeps a reference to these, so they must
  // outlive every recompile. Mutating .value each frame costs nothing.
  const uTime = useRef({ value: 0 });
  const uAmp = useRef({ value: wind.AMPLITUDE });
  const active = useRef(false);

  useEffect(() => {
    uAmp.current.value = wind.AMPLITUDE;
  }, [wind.AMPLITUDE]);

  useEffect(() => {
    if (!wind.ENABLED) return;

    const leaves = scene.getObjectByName(LEAF_MESH) as THREE.Mesh | null;
    if (!leaves?.isMesh) {
      console.warn(`[Branch] "${LEAF_MESH}" not found — is this branch_v2.glb?`);
      return;
    }
    if (!leaves.geometry.getAttribute("_wind")) {
      console.warn("[Branch] leaf mesh has no _wind attribute; skipping sway");
      return;
    }

    // Clone the material: useGLTF shares its materials across every consumer of
    // the same URL, and onBeforeCompile mutates the material in place.
    const mat = (leaves.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
    leaves.material = mat;

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = uTime.current;
      shader.uniforms.uWindAmp = uAmp.current;
      shader.vertexShader =
        `attribute vec2 _wind;\nuniform float uWindTime;\nuniform float uWindAmp;\n` +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\n${WIND_CHUNK}`
        );
    };
    mat.needsUpdate = true;

    // The leaves now leave their authored bounding box. Without this the
    // frustum test still uses the rest-pose bounds and clumps near the frame
    // edge pop out of existence at the extremes of their swing.
    leaves.geometry.computeBoundingSphere();
    if (leaves.geometry.boundingSphere) {
      leaves.geometry.boundingSphere.radius += wind.AMPLITUDE * 2;
    }
    leaves.frustumCulled = false;

    active.current = true;
    return () => {
      active.current = false;
      mat.dispose();
    };
  }, [scene, wind.ENABLED, wind.AMPLITUDE]);

  useFrame((_, delta) => {
    // Accumulated rather than read from clock.elapsedTime so the foliage
    // doesn't lurch after a tab has been backgrounded for a while.
    if (active.current) uTime.current.value += delta * wind.SPEED;
  });

  if (!B.SHOW) return null;

  return (
    <primitive
      object={scene}
      position={[...B.POSITION] as [number, number, number]}
      scale={B.SCALE}
      rotation={[0, deg(B.YAW), 0]}
    />
  );
}

useGLTF.preload(MODEL);
