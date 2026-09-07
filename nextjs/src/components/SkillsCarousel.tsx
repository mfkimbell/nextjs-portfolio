// src/components/SkillsCarousel.tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

import Matte from "@/components/Matte";
// =========== CONFIG ===========
// A left-to-right drifting row. Each skill's icon GLB sits on a straight
// horizontal track at a constant height, with its assigned bird perched on
// top; the whole row slides toward +X and wraps, so an item leaving the right
// edge reappears at the far left and the row never runs dry.
//
// Every item faces the camera (rotation 0) — that was already the orientation
// the ring used at its front, which is why the birds' beaks read correctly.
const CONFIG = {
  // ---------- Track ----------
  // Vertical position of the row's center.
  Y_CENTER: 0.4,
  // Drift speed in world units per second. Negative sends them right-to-left.
  DRIFT_SPEED: 0.55,
  // Spacing is derived from the live viewport width so roughly this many items
  // are on screen at any breakpoint, rather than a fixed world-space gap that
  // would crowd on mobile and scatter on a wide monitor.
  ITEMS_ON_SCREEN: 10,
  // Floor on that derived spacing, so icons can never overlap on a narrow phone.
  MIN_SPACING: 2.2,

  // ---------- Icon (skill GLB) ----------
  ICON_SCALE: 1.2,

  // ---------- Bird (perched on top) ----------
  BIRD_SCALE: 0.3,
  // Baseline for every bird: 0 = feet exactly on icon top; negative pushes
  // the bird DOWN into the icon so its feet nestle rather than float. Each
  // skill can override with `birdY` in SKILLS below.
  BIRD_LIFT_ABOVE_ICON: -0.05,

  // ---------- Idle animation ----------
  // Birds play the imported "idle" clip while perched. Head/tail/wings
  // move naturally; only the LEG bones are locked so the feet stay
  // planted on the icon (the imported clips otherwise pull the feet up).
  //
  // ANIMATE_IDLE = false → birds are frozen; leg pose still applies.
  ANIMATE_IDLE: true,
  IDLE_SPEED_MULT: 0.6,   // <1 slower, >1 faster
  // Bones stripped from the imported clip. Anything at or below the pelvis
  // is frozen so the FEET don't slide during idle — only the upper body
  // (spine/neck/head/wings/tail) animates from the clip. Procedural
  // yaw/pitch is applied to the HEAD bone (see below), not the group, so
  // the feet stay planted even with our extra motion.
  LOCK_BONES: [
    "root", "hip", "pelvis", "center", "body_root",
    "thigh", "leg", "foot", "toe", "tarsus",
  ] as ReadonlyArray<string>,
  // Substrings to search for the "head" bone. First match wins.
  HEAD_BONE_HINTS: ["head", "skull", "neck"] as ReadonlyArray<string>,
  FEET_POSE: { thighPitchDeg: 120, legPitchDeg: 10, footPitchDeg: -20 },

  // Extra whole-body procedural motion on top of the imported clip. Every
  // bird gets deterministic-but-different amplitude/frequency/phase from
  // its slot index so no two look alike.
  //   BOB_*    → vertical bob        (world units)
  //   YAW_*    → head-look side-to-side (degrees, applied at group level)
  //   PITCH_*  → subtle nose-up/down  (degrees)
  //   All *_HZ values are the MAX; each slot picks a random value in
  //   [MIN_FACTOR × MAX, MAX]. Amp arrays scale the same way.
  // Vertical bob is OFF (birds are perched, not floating). Set BOB_AMP_MAX
  // to a small value (e.g. 0.03) if you want a subtle up/down breath.
  BOB_HZ_MAX: 0.9,
  BOB_AMP_MAX: 0,
  YAW_HZ_MAX: 0.5,
  YAW_AMP_DEG_MAX: 12,
  PITCH_HZ_MAX: 0.7,
  PITCH_AMP_DEG_MAX: 5,
  MIN_FACTOR: 0.3,      // per-slot random values scale down to this fraction

  // ---------- Camera ----------
  CAMERA_Y: 1.0,
  CAMERA_Z: 10,
  CAMERA_FOV: 30,

  BIRD_TARGET_SIZE: 1.8,   // bird normalized so largest bbox dim = this
} as const;

const deg = (d: number) => (d * Math.PI) / 180;

// Deterministic hash → number in [0, 1). Different `salt` values yield
// independent-looking streams from the same slot index.
function hash01(slot: number, salt: number): number {
  const s = Math.sin(slot * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/* Hard-faceted look WITHOUT touching the geometry.
 *
 * three.js computes a per-face normal in the fragment shader when flatShading
 * is on, so every existing triangle reads as a flat plate. Doing it here rather
 * than in the GLB matters: docker.glb is only 184 tris and its bird 493, so
 * actually decimating them to force facets would wreck both silhouettes, and
 * baking split normals into the assets would inflate them for no visual gain.
 *
 * The materials MUST be cloned first. useGLTF caches per URL and hands every
 * consumer the same material instances, so mutating in place would flat-shade
 * anything else that ever loads the same file. */
function applyFlatShading(root: THREE.Object3D) {
  const flatten = (m: THREE.Material) => {
    const c = m.clone() as THREE.MeshStandardMaterial;
    c.flatShading = true;
    c.needsUpdate = true;
    return c;
  };
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(flatten)
      : flatten(mesh.material);
  });
}
// ==============================

// Per-skill overrides for tuning where each bird sits:
//   birdY     — extra Y offset ADDED on top of the auto placement.
//               Positive = bird higher above icon, negative = deeper into icon.
//   birdX     — horizontal shift of the bird relative to icon center.
//   birdScale — multiplier on the global BIRD_SCALE for this bird only.
//   flat      — render this skill's icon AND bird with hard faceted shading.
// All fields optional; unspecified = default (auto placement, no scale change).
type SkillDef = {
  label: string;
  glb: string;
  bird: string;
  birdY?: number;
  birdX?: number;
  birdScale?: number;
  flat?: boolean;
};

const SKILLS: SkillDef[] = [
  { label: "React",          glb: "/icons_glb/react.glb?v=2",      bird: "/birds/grey_bird_cyan.glb" },
  { label: "NextJS",         glb: "/icons_glb/nextjs.glb",         bird: "/birds/blue_orange_bird_blue.glb" },
  { label: "Typescript",     glb: "/icons_glb/typescript.glb",     bird: "/birds/white_tan_bird_blue.glb" },
  { label: "Python",         glb: "/icons_glb/python.glb",         bird: "/birds/blue_orange_bird_python.glb" },
  { label: "C#",             glb: "/icons_glb/csharp.glb",         bird: "/birds/grey_bird_purple.glb" },
  { label: ".NET8",          glb: "/icons_glb/dotnet.glb",         bird: "/birds/blue_orange_bird_purple.glb" },
  { label: "AWS",            glb: "/icons_glb/aws.glb",            bird: "/birds/white_tan_bird.glb" },
  { label: "Bedrock",        glb: "/icons_glb/bedrock.glb",        bird: "/birds/white_tan_bird_teal.glb" },
  { label: "TensorFlow",     glb: "/icons_glb/tensorflow.glb",     bird: "/birds/grey_bird_orange.glb" },
  { label: "PyTorch",        glb: "/icons_glb/pytorch.glb",        bird: "/birds/orange_bird_red.glb" },
  { label: "Google Cloud",   glb: "/icons_glb/googlecloud.glb",    bird: "/birds/blue_orange_bird_gcp.glb" },
  { label: "Kubernetes",     glb: "/icons_glb/kubernetes.glb",     bird: "/birds/grey_bird_royalblue.glb" },
  { label: "Kafka",          glb: "/icons_glb/kafka.glb?v=2",      bird: "/birds/white_tan_bird_red.glb" },
  { label: "Harness",        glb: "/icons_glb/harness.glb",        bird: "/birds/white_tan_bird_royalblue.glb" },
  { label: "Github Actions", glb: "/icons_glb/githubactions.glb",  bird: "/birds/grey_bird_blue.glb" },
  { label: "Ansible",        glb: "/icons_glb/ansible.glb",        bird: "/birds/blue_orange_bird_red.glb" },
  { label: "Docker",         glb: "/icons_glb/docker.glb",         bird: "/birds/orange_bird_blue.glb", flat: true },
  { label: "Postgres",       glb: "/icons_glb/postgres.glb",       bird: "/birds/white_tan_bird_blue.glb" },
  { label: "Terraform",      glb: "/icons_glb/terraform.glb",      bird: "/birds/blue_orange_bird_purple.glb" },
];

const BIRD_URLS = Array.from(new Set(SKILLS.map((s) => s.bird)));

/**
 * One carousel item: icon GLB + bird perched on top. Everything is
 * measured and positioned synchronously so the bird is placed correctly
 * on the very first frame — no state, no flash of "bird inside icon".
 */
function TrackItem({
  slotIndex,
  skill,
  onHover,
}: {
  slotIndex: number;
  skill: (typeof SKILLS)[number];
  onHover: (label: string | null) => void;
}) {
  const bobRef = useRef<THREE.Group>(null);

  const iconGLB = useGLTF(skill.glb) as unknown as { scene: THREE.Group };
  const birdGLB = useGLTF(skill.bird) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  const { iconModel, birdModel, birdY, filteredAnimations, headBone, headRest } = useMemo(() => {
    // ---- Icon: clone, center, measure post-scale top Y.
    const icon = cloneSkeleton(iconGLB.scene) as THREE.Group;
    if (skill.flat) applyFlatShading(icon);
    const iconBox = new THREE.Box3().setFromObject(icon);
    const iconCenter = new THREE.Vector3();
    const iconSize = new THREE.Vector3();
    iconBox.getCenter(iconCenter);
    iconBox.getSize(iconSize);
    icon.position.set(-iconCenter.x, -iconCenter.y, -iconCenter.z);
    const iconTopY = (iconSize.y / 2) * CONFIG.ICON_SCALE;

    // ---- Bird: clone, apply feet pose, auto-scale to BIRD_TARGET_SIZE * BIRD_SCALE.
    const bird = cloneSkeleton(birdGLB.scene) as THREE.Group;
    if (skill.flat) applyFlatShading(bird);
    const thighPitch = deg(CONFIG.FEET_POSE.thighPitchDeg);
    const legPitch = deg(CONFIG.FEET_POSE.legPitchDeg);
    const footPitch = deg(CONFIG.FEET_POSE.footPitchDeg);
    bird.traverse((node) => {
      const name = node.name.toLowerCase();
      if (name.includes("thigh")) node.rotation.set(thighPitch, 0, 0);
      else if (name.startsWith("leg_") || /^leg\d/.test(name)) node.rotation.set(legPitch, 0, 0);
      else if (name.startsWith("foot") && !name.includes("back")) node.rotation.set(footPitch, 0, 0);
    });
    bird.updateMatrixWorld(true);
    const birdBoxRaw = new THREE.Box3().setFromObject(bird);
    const birdSizeRaw = new THREE.Vector3();
    birdBoxRaw.getSize(birdSizeRaw);
    const maxDim = Math.max(birdSizeRaw.x, birdSizeRaw.y, birdSizeRaw.z) || 1;
    const perSkillBirdScale = skill.birdScale ?? 1;
    bird.scale.setScalar(
      (CONFIG.BIRD_TARGET_SIZE * CONFIG.BIRD_SCALE * perSkillBirdScale) / maxDim
    );
    const birdBox = new THREE.Box3().setFromObject(bird);
    const birdCenter = new THREE.Vector3();
    const birdSize = new THREE.Vector3();
    birdBox.getCenter(birdCenter);
    birdBox.getSize(birdSize);
    bird.position.set(-birdCenter.x, -birdCenter.y, -birdCenter.z);
    const birdBottomY = -birdSize.y / 2;

    // ---- Vertical placement: bird's feet (bottom of bbox) sit at icon
    // top + LIFT. Because birdBottomY is negative, subtracting it lifts
    // the model up by |birdBottomY|.
    const yPlacement = iconTopY - birdBottomY + CONFIG.BIRD_LIFT_ABOVE_ICON;

    // ---- Idle-clip tracks stripped for LEG bones so feet stay planted.
    const patterns = CONFIG.LOCK_BONES.map((p) => p.toLowerCase());
    const filtered = CONFIG.ANIMATE_IDLE
      ? birdGLB.animations.map((clip) => {
          const kept = clip.tracks.filter((t) => {
            const boneName = (t.name.split(".")[0] || "").toLowerCase();
            return !patterns.some((p) => boneName.includes(p));
          });
          return new THREE.AnimationClip(clip.name, clip.duration, kept);
        })
      : [];

    // ---- Find the head bone (procedural yaw/pitch is applied here so
    // the feet don't rotate with the whole group). Fall back to null; if
    // no head is found, procedural rotation is silently skipped.
    // TypeScript's control flow narrows a `let` assigned inside a callback
    // to `never` at reads that follow the traverse - work around it by
    // treating the accumulator as a Ref cell so the outer scope keeps the
    // widened type.
    const found: { bone: THREE.Object3D | null } = { bone: null };
    const hints = CONFIG.HEAD_BONE_HINTS.map((h) => h.toLowerCase());
    bird.traverse((node) => {
      if (found.bone) return;
      const n = node.name.toLowerCase();
      if (hints.some((h) => n.includes(h))) found.bone = node;
    });
    // Capture the head bone's rest rotation so we ADD our procedural
    // motion on top of it (rather than clobbering the model's rest pose).
    const headBone = found.bone;
    const headRest = headBone
      ? { x: headBone.rotation.x, y: headBone.rotation.y, z: headBone.rotation.z }
      : null;

    return {
      iconModel: icon,
      birdModel: bird,
      birdY: yPlacement,
      filteredAnimations: filtered,
      headBone,
      headRest,
    };
  }, [iconGLB.scene, birdGLB.scene, birdGLB.animations, skill.birdScale, skill.flat]);

  const { actions } = useAnimations(filteredAnimations, birdModel);
  useEffect(() => {
    if (!CONFIG.ANIMATE_IDLE) return;
    // Prefer an "idle" clip; fall back to any fly/flap clip; else the first.
    const entries = Object.entries(actions);
    const preferred =
      entries.find(([name]) => /idle/i.test(name))?.[1] ??
      entries.find(([name]) => /fly|flap/i.test(name))?.[1] ??
      Object.values(actions).find(Boolean);
    if (!preferred) return;
    preferred.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    // Start each bird at a very different point in its cycle so 19 birds
    // aren't clearly synchronized.
    preferred.time = hash01(slotIndex, 7) * (preferred.getClip?.().duration ?? 1);
    // Wider tempo variation (±30 %) so different birds move at different paces.
    preferred.timeScale =
      (0.7 + hash01(slotIndex, 3) * 0.6) * CONFIG.IDLE_SPEED_MULT;
    return () => {
      preferred.stop();
    };
  }, [actions, slotIndex]);

  // Per-slot deterministic motion parameters — 6 independent oscillators
  // (bob / yaw / pitch, each with its own Hz + amp + phase). MIN_FACTOR
  // guarantees at least some motion even on unlucky hashes.
  const motion = useMemo(() => {
    const mix = (v: number, max: number) =>
      max * (CONFIG.MIN_FACTOR + (1 - CONFIG.MIN_FACTOR) * v);
    return {
      bobHz:    mix(hash01(slotIndex, 11), CONFIG.BOB_HZ_MAX),
      bobAmp:   mix(hash01(slotIndex, 13), CONFIG.BOB_AMP_MAX),
      bobPhase: hash01(slotIndex, 17) * Math.PI * 2,
      yawHz:    mix(hash01(slotIndex, 19), CONFIG.YAW_HZ_MAX),
      yawAmp:   mix(hash01(slotIndex, 23), deg(CONFIG.YAW_AMP_DEG_MAX)),
      yawPhase: hash01(slotIndex, 29) * Math.PI * 2,
      pitchHz:    mix(hash01(slotIndex, 31), CONFIG.PITCH_HZ_MAX),
      pitchAmp:   mix(hash01(slotIndex, 37), deg(CONFIG.PITCH_AMP_DEG_MAX)),
      pitchPhase: hash01(slotIndex, 41) * Math.PI * 2,
    };
  }, [slotIndex]);

  useFrame((state) => {
    if (!bobRef.current) return;
    const t = state.clock.elapsedTime;
    const bobY = Math.sin(2 * Math.PI * motion.bobHz * t + motion.bobPhase) *
      motion.bobAmp;
    // Per-skill overrides let you nudge each bird individually.
    const skillY = skill.birdY ?? 0;
    const skillX = skill.birdX ?? 0;
    bobRef.current.position.set(skillX, birdY + skillY + bobY, 0);
    // NOTE: rotation on the whole group would drag the feet with it, so
    // procedural yaw/pitch is applied to the HEAD bone below instead.
    bobRef.current.rotation.set(0, 0, 0);

    // Head-only rotation → head-look side-to-side + subtle nod. Rest
    // pose is preserved by adding the oscillation on top.
    if (headBone && headRest) {
      const yaw = Math.sin(2 * Math.PI * motion.yawHz * t + motion.yawPhase) *
        motion.yawAmp;
      const pitch = Math.sin(2 * Math.PI * motion.pitchHz * t + motion.pitchPhase) *
        motion.pitchAmp;
      headBone.rotation.set(
        headRest.x + pitch,
        headRest.y + yaw,
        headRest.z
      );
    }
  });

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(skill.label);
      }}
      onPointerOut={() => onHover(null)}
    >
      <primitive object={iconModel} scale={CONFIG.ICON_SCALE} />
      <group ref={bobRef} position={[0, birdY, 0]}>
        <primitive object={birdModel} />
      </group>
    </group>
  );
}

function Track({ onHover }: { onHover: (label: string | null) => void }) {
  const slotsRef = useRef<(THREE.Group | null)[]>([]);
  // World-space width visible at the track plane. Reading it from R3F rather
  // than hardcoding matters here: the camera is fov 30 at z 10, so only ~5.4
  // units are actually on screen, and that number changes with the container's
  // aspect ratio at every breakpoint.
  const viewportWidth = useThree((s) => s.viewport.width);
  const N = SKILLS.length;

  const spacing = Math.max(CONFIG.MIN_SPACING, viewportWidth / CONFIG.ITEMS_ON_SCREEN);
  const loop = N * spacing;
  // Half a slot of slack so an item is already hidden before it would pop.
  const cullX = viewportWidth / 2 + spacing;

  useFrame((state) => {
    const shift = state.clock.elapsedTime * CONFIG.DRIFT_SPEED;
    for (let i = 0; i < N; i++) {
      const slot = slotsRef.current[i];
      if (!slot) continue;
      // Wrap into [-loop/2, loop/2). The double modulo keeps it correct for a
      // negative DRIFT_SPEED too, where the raw value goes negative.
      const x = ((((i * spacing + shift + loop / 2) % loop) + loop) % loop) - loop / 2;
      slot.position.x = x;
      // Most of the 19 items sit far off screen at any moment. Hiding them
      // skips their draw call and GPU skinning; the animation mixer still
      // ticks, so hover and clip timing stay continuous as they re-enter.
      slot.visible = Math.abs(x) <= cullX;
    }
  });

  return (
    <group position={[0, CONFIG.Y_CENTER, 0]}>
      {SKILLS.map((skill, i) => (
        <group
          key={i}
          ref={(el) => {
            slotsRef.current[i] = el;
          }}
        >
          <TrackItem slotIndex={i} skill={skill} onHover={onHover} />
        </group>
      ))}
    </group>
  );
}

export default function SkillsCarousel() {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <section id="skills" className="relative py-14 z-10 overflow-visible">
      <div className="max-w-6xl mx-auto px-4 relative z-20">
        <h2 className="text-4xl sm:text-4xl font-bold neon-text mb-10 text-center sm:mb-14">
          {hovered ?? "Skills"}
        </h2>
      </div>

      <div className="relative w-full h-96 sm:h-[28rem] md:h-[34rem] z-20 overflow-visible">
        <Canvas
          camera={{
            position: [0, CONFIG.CAMERA_Y, CONFIG.CAMERA_Z],
            fov: CONFIG.CAMERA_FOV,
          }}
          gl={{ alpha: true, antialias: true }}
        >
          <Matte />
          <ambientLight intensity={1.35} />
          <directionalLight position={[3, 4, 5]} intensity={2.0} color="#fff2cf" />
          <directionalLight position={[-3, 1, 2]} intensity={0.6} color="#b9d4f0" />
          <Suspense fallback={null}>
            <Track onHover={setHovered} />
          </Suspense>
        </Canvas>
      </div>
    </section>
  );
}

BIRD_URLS.forEach((u) => useGLTF.preload(u));
SKILLS.forEach((s) => useGLTF.preload(s.glb));
