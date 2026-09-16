// components/FooterButterflies.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

import Matte from "@/components/Matte";
/**
 * Ambient butterflies for the footer.
 *
 * butterfly_fly_v1.glb is the static butterfly.glb rigged with Root/Body plus
 * two segments per wing. ACT_flap is a 0.25s beat whose first and last frames
 * are vertex-identical, so each instance just loops it at its own rate.
 *
 * ORIENTATION - the model was authored nose-along -Y in Blender, and the glTF
 * Y-up conversion maps Blender -Y to +Z. So in this scene:
 *     model +Z = forward (nose)
 *     model +Y = up (back/dorsal side)
 *     model  X = wingspan
 * Each butterfly is aimed by building a basis from those two vectors rather
 * than by guessing a yaw angle - guessing is what made them spin.
 */

const MODEL = "/models/butterfly_fly_v2.glb";

/** Real butterfly colourways - a colour multiply over the model's amber texture. */
const PALETTE = [
  "#e0762a", // monarch orange
  "#c9531a", // deep monarch
  "#ef8b1f", // bright orange
  "#2f62c4", // blue morpho
  "#3f7fe0", // bright morpho
  "#6f9fe0", // pale morpho
  "#f0c433", // swallowtail yellow
  "#e3a81c", // deep yellow
  "#f5d75a", // pale yellow
];

type GLTFResult = { scene: THREE.Group; animations: THREE.AnimationClip[] };

type Path = {
  cx: number; cy: number; rx: number; ry: number;
  speed: number; phase: number;
  wobbleA: number; wobbleF: number;
  bobA: number; bobF: number;
  z: number; scale: number; flapRate: number;
  color: string;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePath(
  i: number,
  count: number,
  rand: () => number,
  depth: number,
  scaleMin: number,
  scaleMax: number
): Path {
  return {
    cx: (rand() - 0.5) * 7.0,
    // biased low: the swarm should sit toward the bottom of the footer
    cy: -1.15 + (rand() - 0.5) * 2.2,
    rx: 1.0 + rand() * 1.8,
    ry: 0.45 + rand() * 1.0,
    speed: 0.11 + rand() * 0.13,
    phase: (i / count) * Math.PI * 2 + rand() * 0.8,
    wobbleA: 0.16 + rand() * 0.26,
    wobbleF: 0.6 + rand() * 1.1,
    bobA: 0.10 + rand() * 0.18,
    bobF: 1.0 + rand() * 1.5,
    z: depth + (rand() - 0.5) * 1.4,
    scale: scaleMin + rand() * Math.max(0, scaleMax - scaleMin),
    flapRate: 0.8 + rand() * 0.7,
    color: PALETTE[Math.floor(rand() * PALETTE.length)],
  };
}

/**
 * Butterflies hold their wings above the body, so the model's up axis is kept
 * pointing at world +Y (screen up) with only a slight lean toward the camera so
 * the wings read as a raised V rather than an edge-on sliver. Forward still
 * follows travel; the up vector is re-orthogonalised against it each frame, so
 * a climbing butterfly tilts naturally instead of flipping over.
 */

/**
 * The source texture is amber, so multiplying it by blue lands on near-black -
 * which is why the blue butterflies were invisible. The map is therefore rebuilt
 * once as a shared tint mask.
 *
 * Its luminance is cleanly bimodal (measured: dark border 0.12-0.31, bright
 * interior 0.56-0.88, almost nothing between), so a split at 0.44 separates the
 * two. Border pixels are crushed toward 0 so they stay BLACK under any tint;
 * interior pixels are lifted toward 1 so they take the colour at full strength.
 */
const BORDER_SPLIT = 0.44;
const greyCache = new WeakMap<THREE.Texture, THREE.Texture | null>();
function greyscaleMap(src: THREE.Texture | null | undefined): THREE.Texture | null {
  if (!src) return null;
  if (greyCache.has(src)) return greyCache.get(src) ?? null;
  let out: THREE.Texture | null = null;
  try {
    const img = src.image as CanvasImageSource & { width: number; height: number };
    const w = img?.width ?? 0;
    const h = img?.height ?? 0;
    if (w && h && typeof document !== "undefined") {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const l = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
          let v: number;
          if (l < BORDER_SPLIT) {
            // Outline: keep it black whatever colour the wing is tinted.
            v = 0.05 + (l / BORDER_SPLIT) * 0.09;
          } else {
            // Interior: remap 0.44..0.88 up to a bright, fully colourable range.
            const u = Math.min(1, (l - BORDER_SPLIT) / (0.88 - BORDER_SPLIT));
            v = 0.62 + u * 0.38;
          }
          px[i] = px[i + 1] = px[i + 2] = Math.round(Math.min(1, v) * 255);
        }
        ctx.putImageData(data, 0, 0);
        out = new THREE.CanvasTexture(c);
        out.flipY = src.flipY;
        out.colorSpace = src.colorSpace;
        out.wrapS = src.wrapS;
        out.wrapT = src.wrapT;
        out.needsUpdate = true;
      }
    }
  } catch {
    out = null; // tainted canvas or no DOM - fall back to the original map
  }
  greyCache.set(src, out);
  return out;
}

const UP_BIAS = new THREE.Vector3(0, 1, 0.42).normalize();

function Butterfly({ path, pointer }: { path: Path; pointer: React.RefObject<THREE.Vector2> }) {
  const gltf = useGLTF(MODEL) as unknown as GLTFResult;

  // Clone the rig AND the materials so each instance can carry its own tint.
  const scene = useMemo(() => {
    const s = cloneSkeleton(gltf.scene) as THREE.Group;
    const tint = new THREE.Color(path.color);
    s.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      const grey = greyscaleMap(src.map);
      if (grey) mat.map = grey;
      mat.color = tint;
      mesh.material = mat;
      mesh.frustumCulled = false;
    });
    return s;
  }, [gltf.scene, path.color]);

  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const group = useRef<THREE.Group>(null);
  const shove = useRef(new THREE.Vector2(0, 0));
  const vel = useRef(new THREE.Vector2(1, 0));

  // Scratch objects, allocated once.
  const m = useMemo(
    () => ({
      fwd: new THREE.Vector3(),
      up: new THREE.Vector3(),
      side: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
    }),
    []
  );

  useEffect(() => {
    const clip = gltf.animations.find((c) => c.name === "ACT_flap") ?? gltf.animations[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.timeScale = path.flapRate;
    action.play();
    return () => void mixer.stopAllAction();
  }, [gltf.animations, mixer, path.flapRate]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    mixer.update(dt);
    const g = group.current;
    if (!g) return;

    // Fit the orbit to what the camera can actually see at this depth, so nobody
    // sails out of the top of the canvas where the clipped edge would show.
    const cam = state.camera as THREE.PerspectiveCamera;
    const dist = Math.max(0.5, cam.position.z - path.z);
    const halfH = Math.tan(((cam.fov ?? 45) * Math.PI) / 360) * dist;
    const halfW = halfH * (cam.aspect || 1.6);
    const MARGIN = 0.45;
    const ry = Math.min(path.ry, Math.max(0.1, halfH - MARGIN - path.bobA) * 0.55);
    const rx = Math.min(path.rx, Math.max(0.1, halfW - MARGIN - path.wobbleA) * 0.85);
    const limY = Math.max(0.05, halfH - MARGIN - ry - path.bobA);
    const limX = Math.max(0.05, halfW - MARGIN - rx - path.wobbleA);
    // Keep the swarm in the lower part of the frame - they may not climb into
    // the top third, but they can go all the way down.
    const topLimY = limY * 0.15;
    const cy = THREE.MathUtils.clamp(path.cy, -limY, topLimY);
    const cx = THREE.MathUtils.clamp(path.cx, -limX, limX);

    const t = state.clock.elapsedTime * path.speed + path.phase;
    let x = cx + Math.cos(t) * rx + Math.sin(t * path.wobbleF) * path.wobbleA;
    let y = cy + Math.sin(t) * ry + Math.sin(t * path.bobF + 1.3) * path.bobA;

    // Analytic tangent of the path - reliable heading even when the loop is slow.
    let vx = -Math.sin(t) * rx + path.wobbleF * Math.cos(t * path.wobbleF) * path.wobbleA;
    let vy = Math.cos(t) * ry + path.bobF * Math.cos(t * path.bobF + 1.3) * path.bobA;

    // Soft attraction to the cursor; it also steers, so it feeds the heading.
    const p = pointer.current;
    if (p) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      const R = 1.55;
      if (d2 < R * R) {
        const d = Math.max(Math.sqrt(d2), 1e-4);
        // A nudge, not a stampede - they lean toward the mouse and drift back.
        const pull = (1 - d / R) * 0.62;
        shove.current.x += ((dx / d) * pull - shove.current.x) * 0.09;
        shove.current.y += ((dy / d) * pull - shove.current.y) * 0.09;
      }
    }
    shove.current.multiplyScalar(0.92);
    x += shove.current.x;
    y += shove.current.y;
    vx += shove.current.x * 1.3;
    vy += shove.current.y * 1.3;

    // Final guard: the cursor shove must not push anyone past the frame edge.
    const hardY = halfH - MARGIN * 0.6;
    const hardX = halfW - MARGIN * 0.6;
    y = THREE.MathUtils.clamp(y, -hardY, hardY * 0.42);
    x = THREE.MathUtils.clamp(x, -hardX, hardX);

    g.position.set(x, y, path.z);

    // Smooth the heading a little, then always face it.
    const len = Math.hypot(vx, vy);
    if (len > 1e-6) {
      vel.current.x += (vx / len - vel.current.x) * 0.18;
      vel.current.y += (vy / len - vel.current.y) * 0.18;
    }
    const vl = Math.hypot(vel.current.x, vel.current.y) || 1;
    let fx = vel.current.x / vl;
    let fy = vel.current.y / vl;
    // Butterflies hold their wings above the body. If the nose pitches far off
    // horizontal the up vector rotates out of screen-up and the wings stop
    // reading as raised, so travel is only allowed to tilt the body ~23 deg.
    const MAX_PITCH = 0.39;
    if (Math.abs(fy) > MAX_PITCH) {
      fy = Math.sign(fy) * MAX_PITCH;
      fx = Math.sign(fx || 1) * Math.sqrt(Math.max(0, 1 - MAX_PITCH * MAX_PITCH));
    }
    m.fwd.set(fx, fy, 0);

    // Basis: model +Z -> travel direction, model +Y -> tilted up vector.
    // Gram-Schmidt the up vector against travel so the wings never roll under.
    m.up.copy(UP_BIAS);
    m.up.addScaledVector(m.fwd, -m.up.dot(m.fwd));
    if (m.up.lengthSq() < 1e-6) m.up.set(0, 0, 1);
    m.up.normalize();
    m.side.crossVectors(m.up, m.fwd).normalize();
    m.basis.makeBasis(m.side, m.up, m.fwd);
    m.q.setFromRotationMatrix(m.basis);
    g.quaternion.slerp(m.q, 1 - Math.pow(0.001, dt)); // fast, frame-rate independent
  });

  return (
    <group ref={group} scale={path.scale}>
      <primitive object={scene} />
    </group>
  );
}

export function ButterflySwarm({
  count,
  depth,
  seed,
  scaleMin,
  scaleMax,
}: {
  count: number;
  depth: number;
  seed: number;
  scaleMin: number;
  scaleMax: number;
}) {
  const pointer = useRef(new THREE.Vector2(999, 999));
  const { gl, viewport } = useThree();

  useEffect(() => {
    const updatePointer = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      pointer.current.set(
        ((event.clientX - rect.left) / rect.width - 0.5) * viewport.width,
        -((event.clientY - rect.top) / rect.height - 0.5) * viewport.height
      );
    };

    const clearPointer = () => pointer.current.set(999, 999);

    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("pointerleave", clearPointer);
    return () => {
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerleave", clearPointer);
    };
  }, [gl, viewport.height, viewport.width]);

  const paths = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, (_, i) =>
      makePath(i, count, rand, depth, scaleMin, scaleMax)
    );
  }, [count, depth, scaleMax, scaleMin, seed]);

  return (
    <>
      {paths.map((p, i) => (
        <Butterfly key={i} path={p} pointer={pointer} />
      ))}
    </>
  );
}

export default function FooterButterflies({
  count = 10,
  depth = 0,
  seed = 1,
  scaleMin = 0.13,
  scaleMax = 0.24,
  className = "inset-0",
  style,
}: {
  count?: number;
  depth?: number;
  seed?: number;
  scaleMin?: number;
  scaleMax?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={"pointer-events-none absolute " + className} style={style} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent", pointerEvents: "none" }}
      >
        <Matte />
        <Environment preset="park" environmentIntensity={0.5} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[2, 4, 5]} intensity={1.8} color="#fff3d6" />
        <directionalLight position={[-3, 1, 2]} intensity={0.7} color="#bfe4ff" />
        <directionalLight position={[0, 3, -6]} intensity={0.4} color="#ffffff" />
        <ButterflySwarm
          count={count}
          depth={depth}
          seed={seed}
          scaleMin={scaleMin}
          scaleMax={scaleMax}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL);
