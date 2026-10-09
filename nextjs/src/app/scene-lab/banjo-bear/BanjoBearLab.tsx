"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getBanjoFingerPhase } from "@/lib/banjo-performance";

import Matte from "@/components/Matte";
const BEAR_URL = "/wildpoly/bear_sit_fixed.glb";
const BANJO_URL = "/bear/1/banjo_clean.glb";
const HAT_URL = "/bear/1/smokey_hat_fitted.glb?v=split-fit-3";
useGLTF.preload(BEAR_URL);
useGLTF.preload(BANJO_URL);
useGLTF.preload(HAT_URL);

const API_URL = "/api/dev/banjo-bear-pose";

/**
 * Bones we override each frame. We use their REST local rotation as the base and
 * add user-controlled Euler deltas on top, so sliders at 0 mean "leave bone
 * exactly as the sit_log body pose has it".
 */
const ARM_BONES = [
  "shoulder_R", "upperarm_R", "arm_R", "hand_R",
  "shoulder_L", "upperarm_L", "arm_L", "hand_L",
] as const;
type ArmBoneName = (typeof ARM_BONES)[number];

/** Which animation to use as body pose baseline (arms are overridden). */
const BASE_CLIP = "sit_log";

function makeBrimGeometry(outer: number, hole: number, thickness: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, outer * hole, 0, Math.PI * 2, true);
  shape.holes.push(inner);
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 64 }).rotateX(-Math.PI / 2);
}

type ArmRot = { x: number; y: number; z: number };

type State = {
  bpx: number; bpy: number; bpz: number;
  brx: number; bry: number; brz: number;
  bsc: number;
  arms: Record<ArmBoneName, ArmRot>;
  paused: boolean;
  frame: number;
  speed: number;
  pickingAmount: number;
  fretAmount: number;
  hatX: number; hatY: number; hatZ: number;
  hatRotX: number; hatRotY: number; hatRotZ: number;
  hatScale: number;
  hatBrimWidth: number; hatBrimDiameter: number; hatBrimRoundness: number;
  hatDiscWidth: number; hatDiscDiameter: number; hatDiscRoundness: number;
  hatDiscSize: number;
  hatBrimHole: number;
  hatBrimThickness: number;
  hatBrimPitch: number; hatBrimYaw: number; hatBrimRoll: number;
  hatBandWidth: number; hatBandHeight: number; hatBandDiameter: number;
  hatColorR: number; hatColorG: number; hatColorB: number;
  hatBandColorR: number; hatBandColorG: number; hatBandColorB: number;
};

const zeroArms: Record<ArmBoneName, ArmRot> = ARM_BONES.reduce((acc, n) => {
  acc[n] = { x: 0, y: 0, z: 0 };
  return acc;
}, {} as Record<ArmBoneName, ArmRot>);

const DEFAULT_STATE: State = {
  bpx: 0.0699, bpy: 0.2702, bpz: 0.1699,
  brx: -0.98,  bry: -1.3978, brz: -2.1395,
  bsc: 0.1892,
  arms: JSON.parse(JSON.stringify(zeroArms)),
  paused: false,
  frame: 30,
  speed: 1.0,
  pickingAmount: 0,
  fretAmount: 0,
  hatX: 0, hatY: 0, hatZ: 0,
  hatRotX: 0, hatRotY: 0, hatRotZ: 0,
  hatScale: 1,
  hatBrimWidth: 1, hatBrimDiameter: 1, hatBrimRoundness: 1,
  hatDiscWidth: 1, hatDiscDiameter: 1, hatDiscRoundness: 1,
  hatDiscSize: 1,
  hatBrimHole: 0.58,
  hatBrimThickness: 0.035,
  hatBrimPitch: 0, hatBrimYaw: 0, hatBrimRoll: 0,
  hatBandWidth: 1, hatBandHeight: 1, hatBandDiameter: 1,
  hatColorR: 0.85, hatColorG: 0.64, hatColorB: 0.25,
  hatBandColorR: 0.12, hatBandColorG: 0.12, hatBandColorB: 0.12,
};

function BanjoBear({
  state,
  onDurationKnown,
}: {
  state: State;
  onDurationKnown: (durationSec: number, fps: number, clipNames: string[]) => void;
}) {
  const bearGltf = useGLTF(BEAR_URL) as unknown as { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
  const banjoGltf = useGLTF(BANJO_URL) as unknown as { scene: THREE.Object3D };
  const hatGltf = useGLTF(HAT_URL) as unknown as { scene: THREE.Object3D };

  const bearScene = useMemo(() => skeletonClone(bearGltf.scene) as THREE.Object3D, [bearGltf.scene]);
  const head = useMemo(() => bearScene.getObjectByName("head"), [bearScene]);
  const banjoScene = useMemo(() => banjoGltf.scene.clone(true) as THREE.Object3D, [banjoGltf.scene]);
  const hatScene = useMemo(() => {
    const source = hatGltf.scene.clone(true) as THREE.Object3D;
    source.updateMatrixWorld(true);
    const clone = new THREE.Group();
    const materials: THREE.MeshStandardMaterial[] = [];
    const bandMaterials: THREE.MeshStandardMaterial[] = [];
    const bandMeshes: THREE.Mesh[] = [];
    const brimBounds: THREE.Box3[] = [];
    const brimMeshes: THREE.Mesh[] = [];
    source.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.name.includes("Fitted_Brim")) {
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        geometry.computeBoundingBox();
        if (geometry.boundingBox) brimBounds.push(geometry.boundingBox);
        return;
      }
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const meshMaterials = sourceMaterials.map(() => {
        const copy = new THREE.MeshStandardMaterial({
          color: "#d9a441",
          emissive: "#3a2108",
          emissiveIntensity: 0.35,
          roughness: 0.72,
          metalness: 0,
          side: THREE.DoubleSide,
        });
        if (mesh.name.includes("Fitted_Band")) bandMaterials.push(copy);
        else materials.push(copy);
        return copy;
      });
      const flattened = new THREE.Mesh(
        mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),
        meshMaterials.length === 1 ? meshMaterials[0] : meshMaterials,
      );
      flattened.castShadow = true;
      flattened.receiveShadow = false;
      flattened.frustumCulled = false;
      clone.add(flattened);
      if (mesh.name.includes("Fitted_Band")) bandMeshes.push(flattened);
    });
    const brimBox = brimBounds[0];
    if (brimBox) {
      const center = brimBox.getCenter(new THREE.Vector3());
      const size = brimBox.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.z) / 2;
      const material = new THREE.MeshStandardMaterial({ color: "#d9a441", emissive: "#3a2108", emissiveIntensity: 0.35, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(makeBrimGeometry(radius, 0.58, 0.035), material);
      ring.position.copy(center);
      ring.userData.baseRadius = radius;
      clone.add(ring);
      brimMeshes.push(ring);
      materials.push(material);
    }
    clone.userData.hatMaterials = materials;
    clone.userData.hatBandMaterials = bandMaterials;
    clone.userData.hatBandMeshes = bandMeshes;
    clone.userData.hatBrimMeshes = brimMeshes;
    clone.matrixAutoUpdate = false;
    return clone;
  }, [hatGltf.scene]);
  const hatTransform = useRef({
    local: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
  });

  const banjoRef = useRef<THREE.Object3D | null>(null);
  const foodRef = useRef<THREE.Object3D | null>(null);
  const armBonesRef = useRef<Partial<Record<ArmBoneName, THREE.Bone>>>({});
  /** Rest local quaternion per arm bone, captured at mount. */
  const restQuatRef = useRef<Partial<Record<ArmBoneName, THREE.Quaternion>>>({});
  const fingersRRef = useRef<THREE.Bone | null>(null);
  const fingersLRef = useRef<THREE.Bone | null>(null);
  const fingersRRestRef = useRef<THREE.Quaternion | null>(null);
  const fingersLRestRef = useRef<THREE.Quaternion | null>(null);

  const { actions, mixer } = useAnimations(bearGltf.animations, bearScene);

  useEffect(() => {
    // Locate socket + arm bones, capture rest local quats
    bearScene.traverse((o) => {
      if (o.name === "Food" || o.name === "food") foodRef.current = o;
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      if (o.name === "fingers_R") { fingersRRef.current = b; fingersRRestRef.current = b.quaternion.clone(); }
      if (o.name === "fingers_L") { fingersLRef.current = b; fingersLRestRef.current = b.quaternion.clone(); }
      if ((ARM_BONES as readonly string[]).includes(o.name)) {
        const name = o.name as ArmBoneName;
        armBonesRef.current[name] = b;
        restQuatRef.current[name] = b.quaternion.clone();
      }
    });

    // Attach banjo to Food socket
    if (foodRef.current && banjoRef.current == null) {
      foodRef.current.add(banjoScene);
      banjoRef.current = banjoScene;
    }

    // Play the body-pose clip. sit_log gives the natural sit; arms will be
    // overridden per-frame below so anything in the arm curves is ignored.
    const clip = actions[BASE_CLIP];
    if (clip) {
      clip.reset().play();
      clip.setEffectiveTimeScale(state.speed);
    }
    const dur = clip?.getClip().duration ?? 0;
    onDurationKnown(dur, 24, Object.keys(actions));

    return () => {
      if (foodRef.current && banjoRef.current) {
        foodRef.current.remove(banjoRef.current);
        banjoRef.current = null;
      }
      clip?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, bearScene, banjoScene, hatScene]);

  useFrame((_state, delta) => {
    const clip = actions[BASE_CLIP];
    if (clip) {
      if (state.paused) {
        clip.paused = true;
        clip.time = state.frame / 24;
      } else {
        clip.paused = false;
        clip.setEffectiveTimeScale(state.speed);
      }
    }
    mixer?.update(state.paused ? 0 : delta);

    // Banjo transform (Food-local)
    const banjo = banjoRef.current;
    if (banjo) {
      banjo.position.set(state.bpx, state.bpy, state.bpz);
      banjo.rotation.set(state.brx, state.bry, state.brz);
      banjo.scale.setScalar(state.bsc);
    }

    if (head) {
      bearScene.updateMatrixWorld(true);
      const transform = hatTransform.current;
      transform.position.set(state.hatX, state.hatY, state.hatZ);
      transform.rotation.setFromEuler(new THREE.Euler(state.hatRotX, state.hatRotY, state.hatRotZ));
      transform.scale.setScalar(state.hatScale);
      transform.local.compose(transform.position, transform.rotation, transform.scale);
      hatScene.matrix.multiplyMatrices(head.matrixWorld, transform.local);
      hatScene.matrixWorldNeedsUpdate = true;
      for (const mesh of (hatScene.userData.hatBrimMeshes as THREE.Mesh[] | undefined) ?? []) {
        mesh.scale.set(state.hatBrimWidth, state.hatBrimRoundness, state.hatBrimDiameter);
        mesh.rotation.set(state.hatBrimPitch, state.hatBrimYaw, state.hatBrimRoll);
        const radius = mesh.userData.baseRadius as number | undefined;
        if (radius) {
          mesh.geometry.dispose();
          mesh.geometry = makeBrimGeometry(radius, state.hatBrimHole, state.hatBrimThickness);
        }
      }
      for (const mesh of (hatScene.userData.hatBandMeshes as THREE.Mesh[] | undefined) ?? []) {
        mesh.scale.set(state.hatBandWidth, state.hatBandHeight, state.hatBandDiameter);
      }
      for (const mesh of (hatScene.userData.hatBrimMeshes as THREE.Mesh[] | undefined) ?? []) {
        mesh.scale.set(state.hatDiscWidth * state.hatDiscSize, state.hatDiscRoundness, state.hatDiscDiameter * state.hatDiscSize);
      }
      for (const material of (hatScene.userData.hatMaterials as THREE.MeshStandardMaterial[] | undefined) ?? []) {
        material.color.setRGB(state.hatColorR, state.hatColorG, state.hatColorB);
        material.emissive?.setRGB(state.hatColorR * 0.2, state.hatColorG * 0.2, state.hatColorB * 0.2);
        material.emissiveIntensity = 0.7;
      }
      for (const material of (hatScene.userData.hatBandMaterials as THREE.MeshStandardMaterial[] | undefined) ?? []) {
        material.color.setRGB(state.hatBandColorR, state.hatBandColorG, state.hatBandColorB);
        material.emissive?.setRGB(state.hatBandColorR * 0.2, state.hatBandColorG * 0.2, state.hatBandColorB * 0.2);
        material.emissiveIntensity = 0.7;
      }
    }

    // Arm bones: hard-override to rest + user Euler. This wipes out whatever the
    // animation just wrote for each bone, so the arms are pure user pose.
    const scratch = new THREE.Quaternion();
    const scratchEul = new THREE.Euler();
    for (const name of ARM_BONES) {
      const b = armBonesRef.current[name];
      const rest = restQuatRef.current[name];
      if (!b || !rest) continue;
      const r = state.arms[name];
      scratchEul.set(r.x, r.y, r.z, "XYZ");
      scratch.setFromEuler(scratchEul);
      b.quaternion.copy(rest).multiply(scratch);
    }
    const phase = getBanjoFingerPhase(clip?.time ?? state.frame / 24, 96);
    const handR = armBonesRef.current.hand_R;
    if (handR && state.pickingAmount > 0) {
      scratchEul.set(
        -phase.pickCurl * 0.055 * state.pickingAmount,
        Math.sin((clip?.time ?? state.frame / 24) * 96 / 60 * Math.PI * 2) * 0.025 * state.pickingAmount,
        Math.sin((clip?.time ?? state.frame / 24) * 96 / 60 * Math.PI * 2) * 0.045 * state.pickingAmount,
        "XYZ",
      );
      handR.quaternion.multiply(scratch.setFromEuler(scratchEul));
    }
    if (fingersRRef.current && fingersRRestRef.current) {
      scratchEul.set(-phase.pickCurl * 0.34 * state.pickingAmount, 0, phase.pickCurl * 0.12 * state.pickingAmount, "XYZ");
      fingersRRef.current.quaternion.copy(fingersRRestRef.current).multiply(scratch.setFromEuler(scratchEul));
    }
    if (fingersLRef.current && fingersLRestRef.current) {
      scratchEul.set(-phase.fretPressure * 0.035 * state.fretAmount, 0, 0, "XYZ");
      fingersLRef.current.quaternion.copy(fingersLRestRef.current).multiply(scratch.setFromEuler(scratchEul));
    }
  });

  return (
    <>
      <primitive object={bearScene} />
      {head ? <primitive object={hatScene} /> : null}
    </>
  );
}

function Slider({
  label,
  value,
  setValue,
  min,
  max,
  step = 0.001,
  fmt,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  fmt?: (v: number) => string;
}) {
  const display = fmt ? fmt(value) : value.toFixed(4);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.9 }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

const deg = (v: number) => `${((v * 180) / Math.PI).toFixed(1)}°`;
const rgbHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")}`;

function ArmGroup({
  title,
  bone,
  rot,
  update,
  reset,
}: {
  title: string;
  bone: ArmBoneName;
  rot: ArmRot;
  update: (bone: ArmBoneName, axis: "x" | "y" | "z", v: number) => void;
  reset: (bone: ArmBoneName) => void;
}) {
  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: "pointer", padding: "3px 0", fontSize: 12, fontWeight: 600 }}>
        {title}  <span style={{ opacity: 0.55, fontWeight: 400 }}>[{bone}]</span>
      </summary>
      <div style={{ paddingLeft: 6 }}>
        <Slider label="rot X" min={-Math.PI} max={Math.PI} step={0.005} value={rot.x} setValue={(v) => update(bone, "x", v)} fmt={deg} />
        <Slider label="rot Y" min={-Math.PI} max={Math.PI} step={0.005} value={rot.y} setValue={(v) => update(bone, "y", v)} fmt={deg} />
        <Slider label="rot Z" min={-Math.PI} max={Math.PI} step={0.005} value={rot.z} setValue={(v) => update(bone, "z", v)} fmt={deg} />
        <button onClick={() => reset(bone)} style={{ ...btnStyle, marginTop: 2, padding: "2px 8px", fontSize: 11 }}>
          reset {bone}
        </button>
      </div>
    </details>
  );
}

export default function BanjoBearLab() {
  const [s, setS] = useState<State>(DEFAULT_STATE);
  const [dur, setDur] = useState<number>(287 / 24);
  const [copied, setCopied] = useState<string>("");
  const [saveMsg, setSaveMsg] = useState<string>("");
  const hydrated = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    fetch(API_URL)
      .then((r) => r.json())
      .then((d: Partial<State>) => {
        if (dirty.current) return;
        setS((prev) => {
          const next: State = { ...prev, arms: { ...prev.arms } };
          for (const [k, v] of Object.entries(d)) {
            if (k === "arms" && v && typeof v === "object") {
              // merge arms per-bone
              const armsIn = v as Partial<Record<ArmBoneName, Partial<ArmRot>>>;
              for (const bn of ARM_BONES) {
                const r = armsIn[bn];
                if (r) {
                  next.arms[bn] = {
                    x: typeof r.x === "number" ? r.x : prev.arms[bn].x,
                    y: typeof r.y === "number" ? r.y : prev.arms[bn].y,
                    z: typeof r.z === "number" ? r.z : prev.arms[bn].z,
                  };
                }
              }
            } else if (k in prev && typeof v === typeof (prev as unknown as Record<string, unknown>)[k]) {
              (next as unknown as Record<string, unknown>)[k] = v as unknown;
            }
          }
          return next;
        });
        hydrated.current = true;
      })
      .catch(() => {});
  }, []);

  const setScalar = <K extends keyof State>(key: K) => (v: State[K]) => {
    dirty.current = true;
    setS((p) => ({ ...p, [key]: v }));
  };

  const updateArm = (bone: ArmBoneName, axis: "x" | "y" | "z", v: number) => {
    dirty.current = true;
    setS((p) => ({
      ...p,
      arms: { ...p.arms, [bone]: { ...p.arms[bone], [axis]: v } },
    }));
  };

  const resetArm = (bone: ArmBoneName) => {
    dirty.current = true;
    setS((p) => ({
      ...p,
      arms: { ...p.arms, [bone]: { x: 0, y: 0, z: 0 } },
    }));
  };

  const save = async () => {
    setSaveMsg("saving…");
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!res.ok) {
        const text = await res.text();
        setSaveMsg(`error ${res.status}: ${text.slice(0, 60)}`);
        return;
      }
       setSaveMsg(`saved pose + campfire hat config ✓`);
      setTimeout(() => setSaveMsg(""), 4000);
    } catch (e) {
      setSaveMsg(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const copyBanjo = () => {
    const snippet = `prop: {
  url: BANJO_URL,
  scale: ${s.bsc.toFixed(4)},
  position: [${s.bpx.toFixed(4)}, ${s.bpy.toFixed(4)}, ${s.bpz.toFixed(4)}],
  rotation: [${s.brx.toFixed(4)}, ${s.bry.toFixed(4)}, ${s.brz.toFixed(4)}],
  configKey: "banjoProp",
},`;
    navigator.clipboard.writeText(snippet).then(
      () => { setCopied("copied banjo baseline"); setTimeout(() => setCopied(""), 3000); },
      () => setCopied("copy failed"),
    );
  };

  const copyArms = () => {
    const lines = ARM_BONES.map((n) => {
      const r = s.arms[n];
      return `  ${n}: { x: ${r.x.toFixed(4)}, y: ${r.y.toFixed(4)}, z: ${r.z.toFixed(4)} },`;
    }).join("\n");
    const snippet = `// Arm rotation overrides (local Euler XYZ radians, added to bone rest).
// Apply in a useFrame AFTER mixer.update, on the back-left bear.
const BANJO_ARM_ROTS = {
${lines}
};`;
    navigator.clipboard.writeText(snippet).then(
      () => { setCopied("copied arm rotations"); setTimeout(() => setCopied(""), 3000); },
      () => setCopied("copy failed"),
    );
  };

  const resetBanjo = () => setS((p) => ({
    ...p,
    bpx: DEFAULT_STATE.bpx, bpy: DEFAULT_STATE.bpy, bpz: DEFAULT_STATE.bpz,
    brx: DEFAULT_STATE.brx, bry: DEFAULT_STATE.bry, brz: DEFAULT_STATE.brz,
    bsc: DEFAULT_STATE.bsc,
  }));
  const resetHat = () => {
    dirty.current = true;
    setS((p) => ({
      ...p,
    hatX: DEFAULT_STATE.hatX,
    hatY: DEFAULT_STATE.hatY,
    hatZ: DEFAULT_STATE.hatZ,
    hatRotX: DEFAULT_STATE.hatRotX,
    hatRotY: DEFAULT_STATE.hatRotY,
    hatRotZ: DEFAULT_STATE.hatRotZ,
    hatScale: DEFAULT_STATE.hatScale,
    hatBrimWidth: DEFAULT_STATE.hatBrimWidth,
    hatBrimDiameter: DEFAULT_STATE.hatBrimDiameter,
    hatBrimRoundness: DEFAULT_STATE.hatBrimRoundness,
    hatDiscWidth: DEFAULT_STATE.hatDiscWidth,
    hatDiscDiameter: DEFAULT_STATE.hatDiscDiameter,
    hatDiscRoundness: DEFAULT_STATE.hatDiscRoundness,
    hatDiscSize: DEFAULT_STATE.hatDiscSize,
    hatBrimHole: DEFAULT_STATE.hatBrimHole,
    hatBrimThickness: DEFAULT_STATE.hatBrimThickness,
    hatBrimPitch: DEFAULT_STATE.hatBrimPitch,
    hatBrimYaw: DEFAULT_STATE.hatBrimYaw,
    hatBrimRoll: DEFAULT_STATE.hatBrimRoll,
    hatBandWidth: DEFAULT_STATE.hatBandWidth,
    hatBandHeight: DEFAULT_STATE.hatBandHeight,
    hatBandDiameter: DEFAULT_STATE.hatBandDiameter,
    hatColorR: DEFAULT_STATE.hatColorR,
    hatColorG: DEFAULT_STATE.hatColorG,
    hatColorB: DEFAULT_STATE.hatColorB,
    hatBandColorR: DEFAULT_STATE.hatBandColorR,
    hatBandColorG: DEFAULT_STATE.hatBandColorG,
    hatBandColorB: DEFAULT_STATE.hatBandColorB,
    }));
  };
  const setHatColor = (hex: string) => {
    const value = hex.replace("#", "");
    if (value.length !== 6) return;
    setS((p) => ({
      ...p,
      hatColorR: parseInt(value.slice(0, 2), 16) / 255,
      hatColorG: parseInt(value.slice(2, 4), 16) / 255,
      hatColorB: parseInt(value.slice(4, 6), 16) / 255,
    }));
    dirty.current = true;
  };
  const resetAllArms = () => setS((p) => ({ ...p, arms: JSON.parse(JSON.stringify(zeroArms)) }));
  const resetAll = () => setS(DEFAULT_STATE);

  const totalFrames = Math.max(1, Math.round(dur * 24));

  return (
    <div style={{ display: "flex", height: "100vh", background: "#111", color: "#eee", fontFamily: "monospace" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <Canvas gl={{ localClippingEnabled: true }} camera={{ position: [1.8, 1.1, 2.0], fov: 40 }}>
          <Matte />
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 3]} intensity={1.2} />
          <directionalLight position={[-2, 3, -2]} intensity={0.4} />
          <gridHelper args={[6, 24, "#333", "#222"]} />
          <BanjoBear state={s} onDurationKnown={(d) => setDur(d)} />
          <OrbitControls target={[0, 0.9, 0]} />
        </Canvas>
        <div style={{ position: "absolute", bottom: 12, left: 12, fontSize: 12, opacity: 0.75, pointerEvents: "none" }}>
          orbit: drag · pan: shift-drag · zoom: wheel
        </div>
      </div>
      <div style={{ width: 400, padding: 14, borderLeft: "1px solid #333", overflowY: "auto" }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Banjo Bear Lab</h2>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 10 }}>
          Body pose is <code>{BASE_CLIP}</code>. All 4 arm bones per side are
          overridden by the sliders below (0° = bone rest rotation, add rotation
          to swing/bend). Save writes JSON to disk. Copy buttons emit code.
        </div>

        <details open>
          <summary style={{ cursor: "pointer", padding: "6px 0", fontWeight: 600 }}>Animation</summary>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <button
              onClick={() => setScalar("paused")(!s.paused)}
              style={{ padding: "4px 10px", background: s.paused ? "#8a5" : "#333", color: "#eee", border: "1px solid #555", cursor: "pointer" }}
            >
              {s.paused ? "▶ play" : "❚❚ pause"}
            </button>
            <span style={{ fontSize: 11 }}>frame {Math.round(s.frame)} / {totalFrames}</span>
          </div>
          <Slider label="frame (when paused)" min={0} max={totalFrames} step={1} value={s.frame} setValue={setScalar("frame")} fmt={(v) => `${Math.round(v)}`} />
          <Slider label="speed" min={0.1} max={2.0} step={0.05} value={s.speed} setValue={setScalar("speed")} fmt={(v) => `${v.toFixed(2)}×`} />
          <Slider label="picking amount" min={0} max={1} step={0.01} value={s.pickingAmount} setValue={setScalar("pickingAmount")} />
          <Slider label="fret pressure" min={0} max={1} step={0.01} value={s.fretAmount} setValue={setScalar("fretAmount")} />
        </details>

        <details open style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", padding: "6px 0", fontWeight: 600 }}>Banjo transform (Food-local)</summary>
          <div style={{ fontSize: 10, opacity: 0.6, margin: "2px 0 4px" }}>position (m)</div>
          <Slider label="pos X" min={-0.6} max={0.6} value={s.bpx} setValue={setScalar("bpx")} />
          <Slider label="pos Y" min={-0.6} max={0.6} value={s.bpy} setValue={setScalar("bpy")} />
          <Slider label="pos Z" min={-0.6} max={0.6} value={s.bpz} setValue={setScalar("bpz")} />
          <div style={{ fontSize: 10, opacity: 0.6, margin: "6px 0 4px" }}>rotation</div>
          <Slider label="rot X" min={-Math.PI} max={Math.PI} step={0.005} value={s.brx} setValue={setScalar("brx")} fmt={deg} />
          <Slider label="rot Y" min={-Math.PI} max={Math.PI} step={0.005} value={s.bry} setValue={setScalar("bry")} fmt={deg} />
          <Slider label="rot Z" min={-Math.PI} max={Math.PI} step={0.005} value={s.brz} setValue={setScalar("brz")} fmt={deg} />
          <div style={{ fontSize: 10, opacity: 0.6, margin: "6px 0 4px" }}>scale</div>
          <Slider label="scale" min={0.02} max={0.5} step={0.001} value={s.bsc} setValue={setScalar("bsc")} />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={resetBanjo} style={btnStyle}>Reset banjo</button>
            <button onClick={copyBanjo} style={btnStyleGreen}>Copy banjo</button>
          </div>
        </details>

        <details open style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", padding: "6px 0", fontWeight: 600 }}>Smokey hat (head-local)</summary>
          <div style={{ fontSize: 10, opacity: 0.65, margin: "2px 0 4px" }}>Position follows Smokey&apos;s animated head bone.</div>
          <Slider label="hat X" min={-1} max={1} value={s.hatX} setValue={setScalar("hatX")} />
          <Slider label="hat Y" min={-4.5} max={4.5} value={s.hatY} setValue={setScalar("hatY")} />
          <Slider label="hat Z" min={-4.5} max={4.5} value={s.hatZ} setValue={setScalar("hatZ")} />
          <Slider label="hat pitch" min={-Math.PI} max={Math.PI} step={0.01} value={s.hatRotX} setValue={setScalar("hatRotX")} fmt={deg} />
          <Slider label="hat yaw" min={-Math.PI} max={Math.PI} step={0.01} value={s.hatRotY} setValue={setScalar("hatRotY")} fmt={deg} />
          <Slider label="hat roll" min={-Math.PI} max={Math.PI} step={0.01} value={s.hatRotZ} setValue={setScalar("hatRotZ")} fmt={deg} />
          <Slider label="hat scale" min={0.02} max={4.5} step={0.005} value={s.hatScale} setValue={setScalar("hatScale")} />
          <Slider label="brim width" min={0.5} max={2.5} step={0.01} value={s.hatBrimWidth} setValue={setScalar("hatBrimWidth")} />
          <Slider label="brim diameter" min={0.5} max={2.5} step={0.01} value={s.hatBrimDiameter} setValue={setScalar("hatBrimDiameter")} />
          <Slider label="brim roundedness" min={0.5} max={2} step={0.01} value={s.hatBrimRoundness} setValue={setScalar("hatBrimRoundness")} />
          <div style={{ fontSize: 10, opacity: 0.65, marginTop: 8 }}>Outer disc only</div>
          <Slider label="disc uniform size" min={0.5} max={2.5} step={0.01} value={s.hatDiscSize} setValue={setScalar("hatDiscSize")} />
          <Slider label="disc width" min={0.5} max={2.5} step={0.01} value={s.hatDiscWidth} setValue={setScalar("hatDiscWidth")} />
          <Slider label="disc diameter" min={0.5} max={2.5} step={0.01} value={s.hatDiscDiameter} setValue={setScalar("hatDiscDiameter")} />
          <Slider label="disc roundedness" min={0.5} max={2} step={0.01} value={s.hatDiscRoundness} setValue={setScalar("hatDiscRoundness")} />
          <Slider label="brim hole" min={0.1} max={0.9} step={0.01} value={s.hatBrimHole} setValue={setScalar("hatBrimHole")} />
          <Slider label="brim thickness" min={0.005} max={0.2} step={0.005} value={s.hatBrimThickness} setValue={setScalar("hatBrimThickness")} />
          <Slider label="brim pitch" min={-Math.PI} max={Math.PI} step={0.01} value={s.hatBrimPitch} setValue={setScalar("hatBrimPitch")} fmt={deg} />
          <Slider label="brim yaw" min={-Math.PI} max={Math.PI} step={0.01} value={s.hatBrimYaw} setValue={setScalar("hatBrimYaw")} fmt={deg} />
          <Slider label="brim roll" min={-Math.PI} max={Math.PI} step={0.01} value={s.hatBrimRoll} setValue={setScalar("hatBrimRoll")} fmt={deg} />
          <div style={{ fontSize: 10, opacity: 0.65, marginTop: 8 }}>Hat band only</div>
          <Slider label="band width" min={0.5} max={2.5} step={0.01} value={s.hatBandWidth} setValue={setScalar("hatBandWidth")} />
          <Slider label="band height" min={0.5} max={2} step={0.01} value={s.hatBandHeight} setValue={setScalar("hatBandHeight")} />
          <Slider label="band diameter" min={0.5} max={2.5} step={0.01} value={s.hatBandDiameter} setValue={setScalar("hatBandDiameter")} />
          <Slider label="hat color R" min={0} max={1} step={0.01} value={s.hatColorR} setValue={setScalar("hatColorR")} />
          <Slider label="hat color G" min={0} max={1} step={0.01} value={s.hatColorG} setValue={setScalar("hatColorG")} />
          <Slider label="hat color B" min={0} max={1} step={0.01} value={s.hatColorB} setValue={setScalar("hatColorB")} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 11 }}>
            hat body color
            <input type="color" value={rgbHex(s.hatColorR, s.hatColorG, s.hatColorB)} onChange={(e) => setHatColor(e.target.value)} />
            <code>{rgbHex(s.hatColorR, s.hatColorG, s.hatColorB)}</code>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 11 }}>
            hat band color
            <input
              type="color"
              value={rgbHex(s.hatBandColorR, s.hatBandColorG, s.hatBandColorB)}
              onChange={(e) => {
                const value = e.target.value.replace("#", "");
                if (value.length !== 6) return;
                dirty.current = true;
                setS((p) => ({ ...p, hatBandColorR: parseInt(value.slice(0, 2), 16) / 255, hatBandColorG: parseInt(value.slice(2, 4), 16) / 255, hatBandColorB: parseInt(value.slice(4, 6), 16) / 255 }));
              }}
            />
            <code>{rgbHex(s.hatBandColorR, s.hatBandColorG, s.hatBandColorB)}</code>
          </label>
          <button onClick={resetHat} style={{ ...btnStyle, marginTop: 8 }}>Reset hat</button>
        </details>

        <details open style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", padding: "6px 0", fontWeight: 600 }}>Right arm (strumming)</summary>
          <ArmGroup title="Shoulder R" bone="shoulder_R" rot={s.arms.shoulder_R} update={updateArm} reset={resetArm} />
          <ArmGroup title="Upperarm R (swing from body)" bone="upperarm_R" rot={s.arms.upperarm_R} update={updateArm} reset={resetArm} />
          <ArmGroup title="Elbow R (bend)" bone="arm_R" rot={s.arms.arm_R} update={updateArm} reset={resetArm} />
          <ArmGroup title="Wrist R" bone="hand_R" rot={s.arms.hand_R} update={updateArm} reset={resetArm} />
        </details>

        <details open style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", padding: "6px 0", fontWeight: 600 }}>Left arm (fretting)</summary>
          <ArmGroup title="Shoulder L" bone="shoulder_L" rot={s.arms.shoulder_L} update={updateArm} reset={resetArm} />
          <ArmGroup title="Upperarm L (swing from body)" bone="upperarm_L" rot={s.arms.upperarm_L} update={updateArm} reset={resetArm} />
          <ArmGroup title="Elbow L (bend)" bone="arm_L" rot={s.arms.arm_L} update={updateArm} reset={resetArm} />
          <ArmGroup title="Wrist L" bone="hand_L" rot={s.arms.hand_L} update={updateArm} reset={resetArm} />
        </details>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={resetAllArms} style={btnStyle}>Reset all arms</button>
          <button onClick={copyArms} style={btnStyleGreen}>Copy arm rotations</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button onClick={save} style={btnStyleGreen}>Save to disk</button>
          <button onClick={resetAll} style={btnStyle}>Reset all</button>
          <span style={{ fontSize: 11, opacity: 0.85 }}>{saveMsg}</span>
        </div>
        <div style={{ marginTop: 8, minHeight: 18, fontSize: 12, color: "#7c7" }}>{copied}</div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "#333",
  color: "#eee",
  border: "1px solid #555",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: 12,
};
const btnStyleGreen: React.CSSProperties = {
  ...btnStyle,
  background: "#2a5a2a",
  border: "1px solid #4a8a4a",
};
