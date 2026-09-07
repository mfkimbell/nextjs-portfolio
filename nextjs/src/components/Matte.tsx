"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Flattens the specular response of every material in the canvas it's dropped
 * into, so GLB imports read as matte instead of shiny.
 *
 * Why a scene sweep rather than a per-loader hook: GLBs come in through ~48
 * separate useGLTF calls spread over 23 files, several of them cloned per
 * instance. Sweeping the graph catches every one of them - including models
 * that stream in later - from a single mount point.
 *
 * Module-scoped WeakSet: GLB materials are shared between clones (Object3D
 * .clone() copies the reference, not the material) and between canvases via
 * drei's URL cache, so each material only ever needs flattening once. That
 * also keeps the sweep from fighting anything that legitimately animates a
 * material afterwards.
 */
const flattened = new WeakSet<THREE.Material>();

type Glossy = THREE.Material & {
  roughness?: number;
  metalness?: number;
  roughnessMap?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  clearcoat?: number;
  sheen?: number;
  specularIntensity?: number;
  iridescence?: number;
  shininess?: number;
  specular?: THREE.Color;
};

function flatten(material: THREE.Material) {
  if (flattened.has(material)) return;
  flattened.add(material);
  const m = material as Glossy;

  // Only touch properties the material actually has. MeshBasicMaterial (flame
  // cones, spark points, glow discs) has no roughness at all, and assigning one
  // would be meaningless - those are unlit by design and already have no shine.
  if (typeof m.roughness === "number") {
    m.roughness = 1;
    // roughness is MULTIPLIED by roughnessMap.g at shade time, so leaving the
    // map attached puts the gloss straight back on any texel below 1.0.
    m.roughnessMap = null;
  }
  if (typeof m.metalness === "number") {
    m.metalness = 0;
    m.metalnessMap = null;
  }

  // MeshPhysicalMaterial's extra specular lobes, each its own source of shine.
  if (typeof m.clearcoat === "number") m.clearcoat = 0;
  if (typeof m.sheen === "number") m.sheen = 0;
  if (typeof m.specularIntensity === "number") m.specularIntensity = 0;
  if (typeof m.iridescence === "number") m.iridescence = 0;

  // MeshPhongMaterial, which is what a few older GLBs import as.
  if (typeof m.shininess === "number") m.shininess = 0;
  if (m.specular instanceof THREE.Color) m.specular.setRGB(0, 0, 0);

  m.needsUpdate = true;
}

/**
 * `every` is in frames. Models load asynchronously, so this can't be a one-shot
 * effect - but it doesn't need to run every frame either, and the WeakSet means
 * a repeat sweep is just a graph walk with no writes.
 */
export default function Matte({ every = 10 }: { every?: number }) {
  const scene = useThree((s) => s.scene);
  const tick = useRef(0);

  useFrame(() => {
    if (tick.current++ % every) return;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) if (m) flatten(m);
    });
  });

  return null;
}
