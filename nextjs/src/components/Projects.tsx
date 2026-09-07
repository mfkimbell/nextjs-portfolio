/* ------------------------------------------------------------------
   src/components/Projects.tsx
   Two owls fly, each gripping a card:
     - LEFT owl (white_owl.glb)  → DESCRIPTION card (text drawn on canvas)
     - RIGHT owl (red_owl.glb)   → ARCHITECTURE card (image texture)
   On project change, each owl "drags" its card offscreen upward, then a
   new owl swoops in from below with the new card.
-------------------------------------------------------------------*/
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF, Environment } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { projects, Project } from "@/lib/projects";
import { Github } from "lucide-react";

import Matte from "@/components/Matte";
// =========== CONFIG ===========
const CONFIG = {
  LEFT_OWL_URL: "/birds/white_owl.glb",
  RIGHT_OWL_URL: "/birds/red_owl.glb",

  OWL_TARGET_SIZE: 2.5,
  // Owl placement RELATIVE TO THE SIGN. The owl now flies IN FRONT of the
  // plank (positive Z toward camera) rather than perching on top. Y offsets
  // from the sign center; Z pushes it out toward the viewer so it clearly
  // reads as being in front of the wood, not stuck to it.
  OWL_FRONT_Y: 0.35,
  OWL_FRONT_Z: 1.8,

  // Column spacing widened alongside the longer plank aspect so the two
  // signs don't overlap in the middle when yawed inward.
  COLUMN_X: 4.2,
  CARD_Y: 0.2,
  // Wide-plank aspect (~2.3) — long horizontal sign that reads like a shop
  // placard. Fits the architecture diagrams comfortably and gives the
  // description text room to breathe across full lines instead of stacking.
  CARD_WIDTH: 6.9,
  CARD_HEIGHT: 3.0,
  CARD_DEPTH: 0.12,
  // Constant inward yaw on each sign (radians). Left plank turns slightly
  // right, right plank slightly left, so the outer side face is visible and
  // the plank's thickness reads at rest. Signed by column direction at the
  // call site.
  SIGN_STATIC_YAW: 0.65,

  // Owl is no longer perched on the sign, so no more grip pose — the GLB's
  // native flight/idle rest pose reads correctly from the front.

  FLAP_SPEED_MULT: 0.9,
  // Idle bob applied to the whole Column (owl + card together) so the sign
  // rides with the bird. Slow and gentle — one cycle every ~3s.
  BOB_HZ: 0.3,
  BOB_AMP: 0.06,

  CAMERA_Y: 1.2,
  CAMERA_Z: 12.5,
  CAMERA_FOV: 34,

  // Canvas texture for the description card. Matches CARD_WIDTH/CARD_HEIGHT
  // aspect (~2.3) so text isn't stretched.
  TEXT_CARD_TEX_W: 1472,
  TEXT_CARD_TEX_H: 640,

  // ---------- Transition (4 phases, sequential, generous timing) ----------
  // 1. TURN  — owls rotate in place to face their exit direction. No X move.
  // 2. EXIT  — owls slowly translate offscreen along their side, arcing up.
  //           Card swaps to the new project at the end of this phase.
  // 3. ENTER — new owls swoop back in from offscreen along the same side,
  //           still yawed toward their entry direction.
  // 4. LAND  — owls rotate back to face forward, settling in place.
  TRANSITION_OFFSCREEN_X: 14,
  TRANSITION_ARC_Y: 1.6,
  TURN_SEC: 0.8,
  EXIT_SEC: 1.5,
  ENTER_SEC: 1.5,
  LAND_SEC: 0.7,

  // ---------- Flight orientation ----------
  // Applied to the whole Column (owl + card) so the card turns with the owl.
  MAX_YAW_RAD: 1.2,    // ~69° — full turn toward flight direction
  MAX_BANK_RAD: 0.55,  // ~31°
  MAX_PITCH_RAD: 0.35, // ~20°
  // Rotation smoothing — larger = snappier, smaller = lazier.
  ROT_SMOOTH_HZ: 6,
} as const;
// ==============================

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smoothstep = (x: number) => x * x * (3 - 2 * x);

/** /projects/saas.png -> /projects/saas_arch.png */
const archSrcFor = (p: Project) => p.logo.replace(/(\.[^.]+)$/, "_arch$1");

/**
 * True low-poly wood.
 *
 * Actual low-poly game wood (Wind Waker, Breath of the Wild props, most
 * PS1/N64-era stylized 3D) is nearly a solid color. Depth comes from
 * geometry + lighting, not from painted noise. We use one saturated warm
 * base with a hint of a top→bottom tone shift so the plank has a subtle
 * "sun on top / shadow at bottom" read, and nothing else.
 */
let woodTexture: THREE.Texture | null = null;
function getWoodTexture(): THREE.Texture {
  if (woodTexture) return woodTexture;
  const W = 128;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Base sampled straight off /signs/contactme.png so the owls' frame and the
  // contact bulletin board read as the same timber. That board's wood averages
  // #a56e43 with #ba8052 catching the light and #95623a in shadow — browner and
  // less saturated than the #c07a3a this used to be, which sat noticeably more
  // orange than the board it was meant to match.
  ctx.fillStyle = WOOD_MID;
  ctx.fillRect(0, 0, W, H);

  // Extremely subtle top→bottom gradient. Top a touch lighter (light
  // catching the top of the plank), bottom a touch darker. That's it —
  // no brush strokes, no knots, no grain lines.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0.0, "rgba(238, 176, 118, 0.20)");
  bg.addColorStop(1.0, "rgba(47, 31, 19, 0.24)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // NearestFilter would look pixelated on a tiny canvas — Linear keeps the
  // gradient smooth without adding any perceived texture detail.
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  woodTexture = tex;
  return tex;
}

// Module-level texture cache so swapping projects during a transition
// doesn't cause a Suspense re-fetch flash.
const textureCache: Record<string, THREE.Texture> = {};
function loadArchTexture(src: string): THREE.Texture {
  if (!textureCache[src]) {
    textureCache[src] = new THREE.TextureLoader().load(src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
    });
  }
  return textureCache[src];
}
// Preload every arch image once so texture swaps during transitions are instant.
if (typeof window !== "undefined") {
  projects.forEach((p) => loadArchTexture(archSrcFor(p)));
}

function Owl({
  url,
  seed,
  onBottomOffset,
}: {
  url: string;
  seed: number;
  onBottomOffset: (offset: number) => void;
}) {
  const { scene: source, animations } = useGLTF(url) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  const { model, bottomOffset } = useMemo(() => {
    const s = cloneSkeleton(source) as THREE.Group;
    // No skeleton pose override — the GLB's native rest pose is a natural
    // flight silhouette. Overriding the thigh/leg/foot bones made sense for
    // "gripping the sign edge" but now that the owl floats in front of the
    // sign, forcing thighs to 110° back deformed the body.
    s.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    s.scale.setScalar(CONFIG.OWL_TARGET_SIZE / maxDim);
    const box2 = new THREE.Box3().setFromObject(s);
    const center = new THREE.Vector3();
    const size2 = new THREE.Vector3();
    box2.getCenter(center);
    box2.getSize(size2);
    s.position.set(-center.x, -center.y, -center.z);
    // Bottom of the auto-centered model, in the owl group's local space.
    // Negative — how far below origin the feet sit.
    return { model: s, bottomOffset: -size2.y / 2 };
  }, [source]);

  useEffect(() => {
    onBottomOffset(bottomOffset);
  }, [bottomOffset, onBottomOffset]);

  const { actions } = useAnimations(animations, model);

  useEffect(() => {
    const flap =
      Object.entries(actions).find(([name]) => /fly|flap/i.test(name))?.[1] ??
      Object.entries(actions).find(([name]) => /idle/i.test(name))?.[1] ??
      Object.values(actions).find(Boolean);
    if (!flap) return;
    // No reset()/stop() pairing — under StrictMode the mount/cleanup/remount
    // sequence was calling stop() then play() with time=0 every render, which
    // read as "wings frozen". Setting loop + playing without resetting lets
    // the mixer keep advancing across effect re-runs.
    flap.setLoop(THREE.LoopRepeat, Infinity);
    flap.timeScale = CONFIG.FLAP_SPEED_MULT;
    if (!flap.isRunning()) {
      flap.time = (seed * 0.37) % Math.max(flap.getClip().duration, 0.001);
      flap.play();
    }
  }, [actions, seed]);

  // Bob and flight orientation are applied by the parent Column so the
  // CARD rides with the owl as one flying unit.
  return <primitive object={model} />;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ── The sign is a PICTURE FRAME, matching /signs/contactme.png ───────────
 *
 * Four thin wood rails around the outside, a pale panel recessed in the middle.
 * It used to be a solid three-plank slab with the project content laid on top,
 * which read as "text burned into a board" rather than "notice pinned in a
 * frame" — and it looked nothing like the contact bulletin board it shares a
 * scene with.
 *
 * The panel sits BEHIND the wood by LOG_PANEL_RECESS. That gap is what sells
 * the frame: the logs cast a real edge shadow onto the panel, so the border
 * reads as proud timber rather than a painted-on margin. Set it to 0 and the
 * whole thing flattens back into a decal.
 */
// Width of the wood border, in world units. "Thin" is the brief — at 0.34
// against a 6.9 x 3.0 sign this is ~5% of the width, close to the ratio the
// bulletin board PNG uses on its own side rails. Also sets the log diameter,
// so the opening is identical whichever way the frame is built.
const FRAME_RAIL = 0.34;
// Depth of the panel slab itself. It only needs enough body that the recess
// has something to sit in and the frame isn't see-through from an angle.
const PANEL_DEPTH = 0.1;
// The panel is built slightly OVERSIZE and tucked under the logs, so no
// hairline gap shows between panel and wood at the signs' inward yaw. Must
// stay below FRAME_RAIL so it can never poke out the far side.
const PANEL_OVERLAP = 0.04;

/* The frame is made of LOGS, not milled lumber.
 *
 * Four branches laid around the opening, crossing at the corners and running a
 * little past them, the way a rustic stick frame is actually built. Each log is
 * a low-segment polygon tube: round enough to read as a branch, coarse enough
 * that you can count the facets, and irregular enough that it never reads as a
 * machined dowel. That last part is the whole trick — a perfect cylinder at
 * this scale looks like plumbing.
 */
// Sides of the cross-section polygon. 8 keeps a clear facet count; push past
// ~14 and it rounds off into a smooth pipe.
const LOG_RADIAL = 8;
// Cross-sections along the length. More rings = smoother bow and swell.
const LOG_RINGS = 9;
// Cross-section irregularity as a fraction of radius — the lumpiness that
// separates a branch from a dowel.
const LOG_LOBE = 0.1;
// Radians the lobe phase rotates over the full length. Without this the lumps
// line up into straight flutes and it reads as a turned column.
const LOG_LOBE_DRIFT = 2.2;
// Slow thickness swell/pinch along the length.
const LOG_SWELL = 0.07;
// Centreline bow, as a fraction of the log's RADIUS — not its length. Scaling
// bow to length is the obvious-looking choice and it is wrong: a 7-unit log
// then bows further sideways than its own diameter, which on the horizontal
// logs becomes vertical wander that eats into the opening. Radius-relative
// keeps the wobble proportional to the timber at any length.
const LOG_BOW = 0.2;
// Radius at the far end relative to the near end — branches taper.
const LOG_TAPER = 0.9;
// How far each log runs PAST the corner where it crosses its neighbour.
const LOG_OVERHANG = 0.1;
// Log radius. Half of FRAME_RAIL keeps the visible border the same width as
// the milled version it replaces, so the inner opening is unchanged.
const LOG_RADIUS = FRAME_RAIL / 2;
// The pale panel sits this far behind the logs' equator (their widest point,
// which is what bounds the opening). Small, because a round log already
// occludes the panel edge as it curves away.
const LOG_PANEL_RECESS = 0.03;

// Sampled from /signs/contactme.png — see getWoodTexture above.
const WOOD_MID = "#a56e43";
// The pale middle. Warm parchment, not white: the bulletin board's inner
// panel averages exactly this, and pure white would blow out next to the
// cream paper textures the description card already draws.
const PANEL_CREAM = "#e7d3c3";

/** Tiny deterministic PRNG so each log's lumps are stable across renders. */
function seeded(seed: number): () => number {
  let a = (seed * 1103515245 + 12345) >>> 0;
  return () => {
    a = (a * 1103515245 + 12345) >>> 0;
    return a / 4294967296;
  };
}

/**
 * One log: a low-segment polygon tube built along its own +Y, centred on its
 * origin, capped flat at both ends.
 *
 * Three independent irregularities stack up, and all three matter:
 *   LOG_LOBE       lumpy cross-section        (else: a dowel)
 *   LOG_LOBE_DRIFT lumps rotate as they climb (else: straight flutes)
 *   LOG_BOW        bowed centreline           (else: a ruler)
 *
 * Flat shading on the material turns every quad into a visible facet, so the
 * low LOG_RADIAL count is a feature rather than something to hide.
 */
function makeLogGeometry(length: number, radius: number, seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const ph = Array.from({ length: 5 }, () => rnd() * Math.PI * 2);

  const bow = radius * LOG_BOW;
  const bowX = (t: number) => bow * Math.sin(Math.PI * t + ph[0]);
  const bowZ = (t: number) => bow * 0.6 * Math.sin(Math.PI * t * 1.3 + ph[1]);

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i <= LOG_RINGS; i++) {
    const t = i / LOG_RINGS;
    const y = -length / 2 + t * length;
    const taper = 1 + (LOG_TAPER - 1) * t;
    const swell = 1 + LOG_SWELL * Math.sin(2 * Math.PI * 1.7 * t + ph[2]);
    const r0 = radius * taper * swell;
    const cx = bowX(t);
    const cz = bowZ(t);
    for (let sg = 0; sg < LOG_RADIAL; sg++) {
      const th = (sg / LOG_RADIAL) * Math.PI * 2 + LOG_LOBE_DRIFT * t;
      // Integer harmonics only — theta wraps at 2pi, and a fractional harmonic
      // would leave a hard discontinuity down the seam of every log.
      const lobe =
        1 + LOG_LOBE * Math.cos(2 * th + ph[3]) + LOG_LOBE * 0.6 * Math.cos(3 * th + ph[4]);
      const r = r0 * lobe;
      pos.push(cx + r * Math.cos(th), y, cz + r * Math.sin(th));
      uv.push(sg / LOG_RADIAL, t);
    }
  }

  for (let i = 0; i < LOG_RINGS; i++) {
    for (let sg = 0; sg < LOG_RADIAL; sg++) {
      const a = i * LOG_RADIAL + sg;
      const b = i * LOG_RADIAL + ((sg + 1) % LOG_RADIAL);
      const c = (i + 1) * LOG_RADIAL + sg;
      const d = (i + 1) * LOG_RADIAL + ((sg + 1) % LOG_RADIAL);
      idx.push(a, c, b, b, c, d);
    }
  }

  // Flat caps, so an overhanging end doesn't show a hollow tube.
  const botC = pos.length / 3;
  pos.push(bowX(0), -length / 2, bowZ(0));
  uv.push(0.5, 0);
  for (let sg = 0; sg < LOG_RADIAL; sg++) {
    idx.push(botC, (sg + 1) % LOG_RADIAL, sg);
  }
  const topC = pos.length / 3;
  pos.push(bowX(1), length / 2, bowZ(1));
  uv.push(0.5, 1);
  const top0 = LOG_RINGS * LOG_RADIAL;
  for (let sg = 0; sg < LOG_RADIAL; sg++) {
    idx.push(topC, top0 + sg, top0 + ((sg + 1) % LOG_RADIAL));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function SignMesh({ frontTexture }: { frontTexture: THREE.Texture }) {
  const { rails, innerW, innerH, panelZ, contentZ, materials, geometries } = useMemo(() => {
    const W = CONFIG.CARD_WIDTH;
    const H = CONFIG.CARD_HEIGHT;
    const innerW = W - FRAME_RAIL * 2;
    const innerH = H - FRAME_RAIL * 2;

    // One shared material for all four logs — they should read as cut from the
    // same branch. flatShading gives every facet a single hard tone, which is
    // what keeps a low LOG_RADIAL count reading as carved wood instead of a
    // badly tessellated cylinder.
    const wood = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: new THREE.Color("#ffffff"),
      emissive: new THREE.Color("#6d4320"),
      emissiveIntensity: 0.14,
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
    });
    const panel = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PANEL_CREAM),
      // A touch of self-illumination so the recessed panel doesn't read as
      // muddy once the rails start shadowing its edges.
      emissive: new THREE.Color(PANEL_CREAM),
      emissiveIntensity: 0.12,
      roughness: 0.9,
      metalness: 0,
    });

    // Two log shapes: one for the horizontal pair, one for the vertical pair.
    // Each runs LOG_OVERHANG past both corners so the ends poke out where they
    // cross, which is what makes it read as branches lashed into a frame
    // rather than a mitred picture frame.
    const geoH = makeLogGeometry(W + LOG_OVERHANG * 2, LOG_RADIUS, 11);
    const geoV = makeLogGeometry(H + LOG_OVERHANG * 2, LOG_RADIUS, 29);

    // Horizontals are built along +Y like the verticals, then turned a quarter
    // turn about Z to lie along X.
    const LIE_FLAT: [number, number, number] = [0, 0, Math.PI / 2];
    const UPRIGHT: [number, number, number] = [0, 0, 0];

    // All four sit at z = 0 and simply interpenetrate where they cross. Solid
    // opaque wood, so the intersection reads as a joint; offsetting one pair
    // backward instead would leave the panel poking out in front of them.
    const rails: {
      pos: [number, number, number];
      rot: [number, number, number];
      geo: THREE.BufferGeometry;
    }[] = [
      { pos: [0, H / 2 - LOG_RADIUS, 0],  rot: LIE_FLAT, geo: geoH },
      { pos: [0, -(H / 2 - LOG_RADIUS), 0], rot: LIE_FLAT, geo: geoH },
      { pos: [-(W / 2 - LOG_RADIUS), 0, 0], rot: UPRIGHT, geo: geoV },
      { pos: [(W / 2 - LOG_RADIUS), 0, 0],  rot: UPRIGHT, geo: geoV },
    ];

    // A round log's widest point is its equator at z = 0, and that equator is
    // what bounds the opening. So the panel is measured back from z = 0, not
    // from any front face — there isn't one.
    const panelFrontZ = -LOG_PANEL_RECESS;

    return {
      rails,
      innerW,
      innerH,
      panelZ: panelFrontZ - PANEL_DEPTH / 2,
      contentZ: panelFrontZ + 0.004,
      materials: [wood, panel],
      geometries: [geoH, geoV],
    };
  }, []);

  // Dispose the materials on unmount — but NOT their map. `getWoodTexture`
  // caches a single texture at module scope and hands the same instance to
  // every sign, so disposing it here would leave the cache holding a dead
  // texture and the next mount would render untextured wood.
  useEffect(() => {
    return () => {
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
    };
  }, [materials, geometries]);

  return (
    <group>
      {/* Pale panel first, recessed into the opening and running under the
          rails by PANEL_OVERLAP so no two faces end up coplanar. */}
      <mesh position={[0, 0, panelZ]} material={materials[1]}>
        <boxGeometry
          args={[innerW + PANEL_OVERLAP * 2, innerH + PANEL_OVERLAP * 2, PANEL_DEPTH]}
        />
      </mesh>

      {/* Project content sits ON the panel, just clear of z-fighting. The
          description card draws transparent-background ink, so the cream
          shows through as its paper. */}
      <mesh position={[0, 0, contentZ]}>
        <planeGeometry args={[innerW, innerH]} />
        <meshBasicMaterial map={frontTexture} transparent color="#ffffff" />
      </mesh>

      {/* Logs last, standing proud of the panel. */}
      {rails.map((r, i) => (
        <mesh key={i} position={r.pos} rotation={r.rot} material={materials[0]} geometry={r.geo} />
      ))}
    </group>
  );
}

function DescriptionCard({ project }: { project: Project }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CONFIG.TEXT_CARD_TEX_W;
    canvas.height = CONFIG.TEXT_CARD_TEX_H;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;

    // Fully transparent canvas — the wood plank is the paper.
    ctx.clearRect(0, 0, W, H);

    // Warm ink colour, a hair softer than pure black so it reads as text
    // burned into the plank instead of a decal stuck on top.
    const INK = "#1a1206";
    const INK_MUTED = "#3d2a15";

    const PAD_X = 90;
    const PAD_TOP = 70;
    const contentW = W - PAD_X * 2;

    // ── Title (left-aligned, tight tracking) ────────────────────────────
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const titleSize = 84;
    ctx.font = `700 ${titleSize}px "Georgia", "Times New Roman", serif`;
    const titleY = PAD_TOP + titleSize;
    ctx.fillText(project.name, PAD_X, titleY);
    // Measure so the underline hugs the title width, not the whole canvas.
    const titleW = ctx.measureText(project.name).width;

    // ── Hairline rule under the title ───────────────────────────────────
    const ruleY = titleY + 22;
    ctx.fillStyle = INK_MUTED;
    ctx.fillRect(PAD_X, ruleY, Math.min(titleW, contentW), 3);

    // ── Body copy (justified block, generous leading) ───────────────────
    const bodySize = 34;
    ctx.font = `400 ${bodySize}px "Iowan Old Style", "Palatino", "Georgia", serif`;
    ctx.fillStyle = INK;
    const lineH = Math.round(bodySize * 1.35);
    const bodyStartY = ruleY + 46 + bodySize;
    const bodyText = project.description.replace(/\s+/g, " ").trim();
    const lines = wrapText(ctx, bodyText, contentW);
    // Reserve room for the tech line so body never runs into it.
    const techLineH = 28;
    const techBlockH = techLineH + 44;
    const availableH = H - bodyStartY - techBlockH - PAD_TOP * 0.4;
    const maxBodyLines = Math.max(1, Math.floor(availableH / lineH));
    lines.slice(0, maxBodyLines).forEach((line, i) => {
      ctx.fillText(line, PAD_X, bodyStartY + i * lineH);
    });

    // ── Tech list, small caps feel ──────────────────────────────────────
    ctx.font = `600 ${techLineH}px "SF Mono", "Menlo", "Consolas", monospace`;
    ctx.fillStyle = INK_MUTED;
    const techY = H - PAD_TOP * 0.55;
    // ALL CAPS + em-space separator for a stamped-into-wood feel.
    const techLine = project.tech.map((t) => t.toUpperCase()).join("   ·   ");
    // Truncate with ellipsis if it overflows.
    let display = techLine;
    while (ctx.measureText(display).width > contentW && display.length > 3) {
      display = display.slice(0, -4) + "…";
    }
    ctx.fillText(display, PAD_X, techY);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [project]);

  return <SignMesh frontTexture={texture} />;
}

function ArchCard({ src }: { src: string }) {
  const texture = useMemo(() => loadArchTexture(src), [src]);
  return <SignMesh frontTexture={texture} />;
}

/**
 * Column manages one owl+card pair. When `activeProject` changes, it
 * flies the whole group off the top (EXIT), then swaps to the new
 * project and swoops back up from below (ENTER).
 */
function Column({
  x,
  direction,
  owlUrl,
  seed,
  activeProject,
  isDescription,
  transitionOffset,
}: {
  x: number;
  /** -1 = fly off to the LEFT, +1 = fly off to the RIGHT. */
  direction: -1 | 1;
  owlUrl: string;
  seed: number;
  activeProject: Project;
  isDescription: boolean;
  /** Phase offset in seconds (right column can lag slightly for personality). */
  transitionOffset?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const rotRef = useRef<THREE.Group>(null);
  const [displayed, setDisplayed] = useState<Project>(activeProject);
  const transitionRef = useRef<{ startedAt: number; incoming: Project } | null>(null);
  const swappedRef = useRef(false);
  const yawRef = useRef(0);
  const bankRef = useRef(0);
  const pitchRef = useRef(0);
  // Owl bottom offset is captured from the model bbox but no longer used
  // for positioning — the owl now floats in front of the sign at a fixed
  // Y/Z. We still take the callback so the Owl component's effect doesn't
  // error, but we ignore the value.
  const setOwlBottomOffset = () => {};

  useEffect(() => {
    if (
      activeProject.name !== displayed.name &&
      (!transitionRef.current || transitionRef.current.incoming.name !== activeProject.name)
    ) {
      // startedAt is set in useFrame from the clock so it's on the same timeline.
      transitionRef.current = { startedAt: -1, incoming: activeProject };
      swappedRef.current = false;
    }
  }, [activeProject, displayed]);

  // Owl floats IN FRONT of the sign (positive Z), with a slight upward Y
  // bias so it doesn't cover the title area of the description card.
  const owlGroupY = CONFIG.CARD_Y + CONFIG.OWL_FRONT_Y;
  // Front of the frame is now the logs' surface, i.e. one log radius proud
  // of z = 0 — not half a plank thickness.
  const owlGroupZ = LOG_RADIUS + CONFIG.OWL_FRONT_Z;

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = transitionRef.current;
    const time = state.clock.elapsedTime;
    let posX = x;
    let posY = 0;
    let targetYaw = 0;
    let targetBank = 0;
    let targetPitch = 0;

    if (t) {
      if (t.startedAt < 0) {
        t.startedAt = time + (transitionOffset ?? 0);
      }
      const elapsed = time - t.startedAt;
      if (elapsed >= 0) {
        const OFF = CONFIG.TRANSITION_OFFSCREEN_X * direction;
        const A = CONFIG.TURN_SEC;
        const B = A + CONFIG.EXIT_SEC;
        const C = B + CONFIG.ENTER_SEC;
        const D = C + CONFIG.LAND_SEC;
        // These bird models have their forward axis at +Z (beak toward the
        // camera at rest). To face +X, rotate.y must be POSITIVE. Bank sign
        // is opposite of yaw for a coordinated turn (right turn → right wing
        // down → rotation.z negative when yawing right).
        const outwardYaw = +direction * CONFIG.MAX_YAW_RAD;
        const outwardBank = -direction * CONFIG.MAX_BANK_RAD;

        if (elapsed < A) {
          // Phase 1 — TURN in place. No X/Y translation. Just rotate.
          const p = smoothstep(clamp(elapsed / CONFIG.TURN_SEC, 0, 1));
          targetYaw = outwardYaw * p;
          targetBank = outwardBank * p;
        } else if (elapsed < B) {
          // Phase 2 — EXIT. Slowly translate offscreen with a gentle arc.
          const p = smoothstep(clamp((elapsed - A) / CONFIG.EXIT_SEC, 0, 1));
          posX = x + OFF * p;
          posY = Math.sin(p * Math.PI) * CONFIG.TRANSITION_ARC_Y * 0.6;
          targetYaw = outwardYaw;
          targetBank = outwardBank;
          // Nose up on climb, down on descent (cos of arc slope).
          targetPitch = Math.cos(p * Math.PI) * CONFIG.MAX_PITCH_RAD * 0.5;
        } else if (elapsed < C) {
          // Phase 3 — ENTER. Swap card at the start; new birds come in from
          // the same side (so from the camera's POV they arrive from off-
          // screen). They're yawed toward the entry direction (opposite of
          // exit), still fully turned — they haven't faced forward yet.
          if (!swappedRef.current) {
            setDisplayed(t.incoming);
            swappedRef.current = true;
          }
          const p = smoothstep(clamp((elapsed - B) / CONFIG.ENTER_SEC, 0, 1));
          posX = x + OFF * (1 - p);
          posY = Math.sin(p * Math.PI) * CONFIG.TRANSITION_ARC_Y;
          // Facing inward — same magnitude, opposite sign.
          targetYaw = -outwardYaw;
          targetBank = -outwardBank;
          targetPitch = Math.cos(p * Math.PI) * CONFIG.MAX_PITCH_RAD * 0.5;
        } else if (elapsed < D) {
          // Phase 4 — LAND. New birds rotate back to face forward.
          const p = smoothstep(clamp((elapsed - C) / CONFIG.LAND_SEC, 0, 1));
          targetYaw = -outwardYaw * (1 - p);
          targetBank = -outwardBank * (1 - p);
        } else {
          transitionRef.current = null;
        }
      }
    }

    // Idle bob applies at all times so the whole column (owl + card) breathes
    // together — slow sinusoid, offset per seed so the two columns aren't
    // synced.
    const bob =
      Math.sin(2 * Math.PI * CONFIG.BOB_HZ * time + seed * 1.7) *
      CONFIG.BOB_AMP;
    groupRef.current.position.x = posX;
    groupRef.current.position.y = posY + bob;

    // Smooth toward the target rotation. Ratewise-consistent lerp.
    const dt = Math.max(delta, 1 / 240);
    const k = 1 - Math.exp(-CONFIG.ROT_SMOOTH_HZ * dt);
    yawRef.current += (targetYaw - yawRef.current) * k;
    bankRef.current += (targetBank - bankRef.current) * k;
    pitchRef.current += (targetPitch - pitchRef.current) * k;
    if (rotRef.current) {
      rotRef.current.rotation.y = yawRef.current;
      rotRef.current.rotation.z = bankRef.current;
      rotRef.current.rotation.x = pitchRef.current;
    }
  });

  // Rotate around a pivot at card height so bank/pitch tilt naturally
  // (rather than swinging the whole thing around the ground plane).
  const pivotY = CONFIG.CARD_Y;
  return (
    <group ref={groupRef} position={[x, 0, 0]}>
      <group ref={rotRef} position={[0, pivotY, 0]}>
        {/* SIGN — drawn first, yawed slightly inward so we see its side */}
        <group
          position={[0, 0, 0]}
          rotation={[0, -direction * CONFIG.SIGN_STATIC_YAW, 0]}
        >
          {isDescription ? (
            <DescriptionCard project={displayed} />
          ) : (
            <ArchCard src={archSrcFor(displayed)} />
          )}
        </group>
        {/* OWL — floats in front of the sign on the Z axis. Yawed less
            than the sign so the bird reads as facing the viewer. */}
        <group
          position={[0, owlGroupY - pivotY, owlGroupZ]}
          rotation={[0, -direction * CONFIG.SIGN_STATIC_YAW * 0.35, 0]}
        >
          <Owl
            url={owlUrl}
            seed={seed}
            onBottomOffset={setOwlBottomOffset}
          />
        </group>
      </group>
    </group>
  );
}

/**
 * Wraps the scene in a group whose scale is chosen so the full width
 * (two signs at their outer edges + margin) always fits inside the
 * canvas's world-space viewport. On phones this shrinks everything so
 * nothing clips at the sides; on desktop it's a no-op at scale = 1.
 */
function ResponsiveScene({ children }: { children: React.ReactNode }) {
  const { viewport } = useThree();
  // World-space extent the scene needs, plus a comfortable margin so the
  // owls' wingspan and the plank sides don't kiss the canvas edges.
  const NEEDED_WIDTH = 2 * (CONFIG.COLUMN_X + CONFIG.CARD_WIDTH / 2) + 2.2;
  const NEEDED_HEIGHT = CONFIG.CARD_HEIGHT + CONFIG.OWL_TARGET_SIZE + 2.0;
  const sw = viewport.width / NEEDED_WIDTH;
  const sh = viewport.height / NEEDED_HEIGHT;
  const scale = Math.min(1, sw, sh);
  return <group scale={scale}>{children}</group>;
}

export default function ProjectsSection() {
  const [active, setActive] = useState<Project>(projects[0]);

  return (
    <section id="projects" className="relative z-20 pt-10 pb-24 sm:pt-14 sm:pb-32 sm:mb-12">
      <h2 className="text-4xl font-bold neon-text text-center mb-6">
        Projects
      </h2>

      <div className="max-w-[110rem] mx-auto px-4">
        <div className="relative w-full h-[520px] sm:h-[640px] md:h-[760px]">
          <Canvas
            camera={{
              position: [0, CONFIG.CAMERA_Y, CONFIG.CAMERA_Z],
              fov: CONFIG.CAMERA_FOV,
            }}
            dpr={[1, 2]}
            gl={{ alpha: true, antialias: true }}
          >
            <Matte />
            {/* Outdoor daylight — bright but not flat. Ambient stays
                moderate so the strong overhead-right key can carve the top
                highlight and let the outward side face fall into a distinct
                shadow band. */}
            <Environment preset="park" environmentIntensity={0.45} />
            <ambientLight intensity={0.35} />
            <directionalLight
              position={[3, 10, 2]}
              intensity={2.4}
              color="#fff2cf"
            />
            {/* Bounce fill from the opposite side — enough to keep the
                shaded side face readable, not enough to erase it. */}
            <directionalLight
              position={[-4, 2, 3]}
              intensity={0.7}
              color="#b9d4f0"
            />
            <directionalLight position={[0, 3, -6]} intensity={0.4} color="#ffffff" />
            <Suspense fallback={null}>
              <ResponsiveScene>
                <Column
                  x={-CONFIG.COLUMN_X}
                  direction={-1}
                  owlUrl={CONFIG.LEFT_OWL_URL}
                  seed={1}
                  activeProject={active}
                  isDescription
                />
                <Column
                  x={+CONFIG.COLUMN_X}
                  direction={+1}
                  owlUrl={CONFIG.RIGHT_OWL_URL}
                  seed={2}
                  activeProject={active}
                  isDescription={false}
                  transitionOffset={0.08}
                />
              </ResponsiveScene>
            </Suspense>
          </Canvas>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2 sm:gap-3 relative z-30">
          {projects.map((p) => {
            const isActive = active.name === p.name;
            return (
              <button
                key={p.name}
                onClick={() => setActive(p)}
                title={p.name}
                aria-label={p.name}
                aria-pressed={isActive}
                className={`rounded-lg bg-gradient-to-br ${p.gradient}
                  w-9 h-9 sm:w-11 sm:h-11
                  flex items-center justify-center
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-white
                  transform transition-all duration-150
                  ${isActive
                    ? "scale-110 ring-2 ring-white shadow-lg"
                    : "opacity-70 hover:opacity-100 hover:scale-105"
                  }`}
              >
                <Image
                  src={p.logo}
                  alt=""
                  width={42}
                  height={42}
                  className="w-6 h-6 sm:w-7 sm:h-7 filter brightness-0 invert"
                />
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-center">
          <a
            href={active.github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm neon-text underline"
          >
            <Github size={16} aria-hidden="true" />
            <span>View {active.name} on GitHub</span>
          </a>
        </div>
      </div>
    </section>
  );
}

useGLTF.preload(CONFIG.LEFT_OWL_URL);
useGLTF.preload(CONFIG.RIGHT_OWL_URL);
