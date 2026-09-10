"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export const LITTLE_TV_URL = "/electronics/little_tv.glb";

/**
 * Low-poly props built in code, because the repo had no truck, table or chair.
 * Each is a plain group so it can be swapped for a real GLB later without the
 * scene needing to know the difference.
 */

const WOOD = "#6b4a30";
const WOOD_DARK = "#4e3522";
const METAL = "#3c4a57";
const METAL_DARK = "#28323c";
const TYRE = "#1b1d21";

function Box({
  size,
  position,
  rotation,
  color,
  rough = 0.85,
}: {
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  rough?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} metalness={0} flatShading />
    </mesh>
  );
}

/**
 * Pickup parked with its open bed facing +Z, so whatever is watching the TVs
 * stands in front of it. Roughly 4.4 long x 1.9 wide x 1.7 tall.
 */
export function PickupTruck({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
}: {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
}) {
  const wheels = useMemo(
    () =>
      [
        [-0.85, 0.34, 1.25],
        [0.85, 0.34, 1.25],
        [-0.85, 0.34, -1.1],
        [0.85, 0.34, -1.1],
      ] as [number, number, number][],
    []
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale} name="truck">
      {/* chassis */}
      <Box size={[1.85, 0.3, 4.2]} position={[0, 0.55, 0]} color={METAL_DARK} />
      {/* cab, at the -Z end */}
      <Box size={[1.8, 0.85, 1.5]} position={[0, 1.12, -1.15]} color={METAL} />
      {/* windscreen band, slightly proud so it reads as glass */}
      <Box size={[1.72, 0.42, 1.42]} position={[0, 1.36, -1.15]} color="#243440" rough={0.35} />
      {/* bonnet */}
      <Box size={[1.78, 0.42, 0.85]} position={[0, 0.9, -2.1]} color={METAL} />

      {/* open bed: floor plus three walls, the +Z end left open */}
      <Box size={[1.8, 0.12, 2.5]} position={[0, 0.74, 0.85]} color={METAL_DARK} />
      <Box size={[0.12, 0.5, 2.5]} position={[-0.84, 1.02, 0.85]} color={METAL} />
      <Box size={[0.12, 0.5, 2.5]} position={[0.84, 1.02, 0.85]} color={METAL} />
      <Box size={[1.8, 0.5, 0.12]} position={[0, 1.02, -0.36]} color={METAL} />

      {wheels.map((w, i) => (
        <mesh key={i} position={w} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.34, 0.34, 0.26, 12]} />
          <meshStandardMaterial color={TYRE} roughness={0.95} metalness={0} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Four screens standing in the truck bed, angled slightly inward. */
export function TvWall({
  tv,
  position = [0, 0, 0],
  rotationY = 0,
  scale = 0.2,
}: {
  tv: THREE.Object3D;
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
}) {
  const screens = useMemo(
    () =>
      [-0.58, -0.19, 0.19, 0.58].map((x, i) => ({
        x,
        // fan them out so the outer pair turn toward the middle
        yaw: -x * 0.42,
        // slight stagger so it doesn't read as a perfect row
        z: i % 2 === 0 ? 0 : -0.06,
      })),
    []
  );
  return (
    <group position={position} rotation={[0, rotationY, 0]} name="tv_wall">
      {screens.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation={[0, s.yaw, 0]} scale={scale}>
          <primitive object={tv.clone(true)} />
        </group>
      ))}
    </group>
  );
}

/** Simple slab table, top at y = height. */
export function Table({
  position = [0, 0, 0],
  rotationY = 0,
  width = 1.5,
  depth = 0.9,
  height = 0.62,
}: {
  position?: [number, number, number];
  rotationY?: number;
  width?: number;
  depth?: number;
  height?: number;
}) {
  const legs: [number, number, number][] = [
    [-width / 2 + 0.1, height / 2, -depth / 2 + 0.1],
    [width / 2 - 0.1, height / 2, -depth / 2 + 0.1],
    [-width / 2 + 0.1, height / 2, depth / 2 - 0.1],
    [width / 2 - 0.1, height / 2, depth / 2 - 0.1],
  ];
  return (
    <group position={position} rotation={[0, rotationY, 0]} name="table">
      <Box size={[width, 0.08, depth]} position={[0, height, 0]} color={WOOD} />
      {legs.map((l, i) => (
        <Box key={i} size={[0.09, height, 0.09]} position={l} color={WOOD_DARK} />
      ))}
    </group>
  );
}

/** Chair with its seat facing +Z. */
export function Chair({
  position = [0, 0, 0],
  rotationY = 0,
  seatHeight = 0.42,
}: {
  position?: [number, number, number];
  rotationY?: number;
  seatHeight?: number;
}) {
  const legs: [number, number, number][] = [
    [-0.19, seatHeight / 2, -0.19],
    [0.19, seatHeight / 2, -0.19],
    [-0.19, seatHeight / 2, 0.19],
    [0.19, seatHeight / 2, 0.19],
  ];
  return (
    <group position={position} rotation={[0, rotationY, 0]} name="chair">
      <Box size={[0.5, 0.07, 0.5]} position={[0, seatHeight, 0]} color={WOOD} />
      {/* backrest sits at the -Z edge, so the sitter faces +Z */}
      <Box size={[0.5, 0.55, 0.07]} position={[0, seatHeight + 0.3, -0.22]} color={WOOD} />
      {legs.map((l, i) => (
        <Box key={i} size={[0.07, seatHeight, 0.07]} position={l} color={WOOD_DARK} />
      ))}
    </group>
  );
}

/** A cable run from the bed down to the cubs, so the setup reads as plugged in. */
export function Cables({
  from,
  to,
  color = "#15171b",
}: {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
}) {
  const geo = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 0.28; // let it sag
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    return new THREE.TubeGeometry(curve, 14, 0.018, 5, false);
  }, [from, to]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
    </mesh>
  );
}

/* ------------------------------------------------------------------------- */
/* CRT                                                                        */
/* ------------------------------------------------------------------------- */

const CRT_W = 128;
const CRT_H = 96;

export interface CrtScreen {
  /** image or gif in /public to show on the screen. Omit for the built-in animation. */
  content?: string;
  /** colour of the light the screen throws into the room */
  tint?: string;
  /** how hard it lights its surroundings */
  glow?: number;
  /** Draw a live console menu instead of media. Takes precedence over `content`. */
  menu?: CrtMenu;
}

/**
 * A chunky CRT that reads as switched ON.
 *
 * Three things do that, and it needs all three: the screen is an UNLIT material so it
 * never darkens with the scene, scanlines break up the image, and it throws coloured
 * light onto whatever is in front of it. A bright texture alone just looks like a
 * sticker.
 *
 * Whatever is on the screen is drawn into a canvas, so `content` can be swapped for
 * any image without touching the geometry.
 */
export function CrtTv({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 0.45,
  screen = {},
  seed = 0,
}: {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  screen?: CrtScreen;
  seed?: number;
}) {
  const tint = screen.tint ?? "#7fd2ff";
  const glow = screen.glow ?? 1;

  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = CRT_W;
    c.height = CRT_H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter; // keep it pixelly, it's a CRT
    t.minFilter = THREE.LinearFilter;
    return { canvas: c, texture: t };
  }, []);

  // A supplied image is drawn once; otherwise the built-in animation runs.
  const still = useRef(false);
  useEffect(() => {
    still.current = false;
    if (!screen.content) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, CRT_W, CRT_H);
      // contain, so nothing is stretched out of proportion
      const k = Math.min(CRT_W / img.width, CRT_H / img.height);
      const w = img.width * k;
      const h = img.height * k;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, (CRT_W - w) / 2, (CRT_H - h) / 2, w, h);
      texture.needsUpdate = true;
      still.current = true;
    };
    img.src = screen.content;
  }, [screen.content, canvas, texture]);

  const light = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed * 3.1;

    if (!still.current) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // stand-in "game": a scrolling ground with a couple of things bobbing on it
        ctx.fillStyle = "#0b1030";
        ctx.fillRect(0, 0, CRT_W, CRT_H);
        ctx.fillStyle = "#1b2a6b";
        for (let i = 0; i < 5; i++) {
          const x = ((i * 37 - t * 26) % (CRT_W + 30)) - 30;
          ctx.fillRect(x, 30 + (i % 3) * 9, 22, 6);
        }
        ctx.fillStyle = "#2fe08a";
        ctx.fillRect(0, CRT_H - 20, CRT_W, 20);
        ctx.fillStyle = "#ffd453";
        ctx.fillRect(24, CRT_H - 28 - Math.abs(Math.sin(t * 3.1)) * 14, 10, 10);
        ctx.fillStyle = "#ff6a8a";
        ctx.fillRect(78 + Math.sin(t * 1.7) * 12, CRT_H - 30, 9, 11);
        texture.needsUpdate = true;
      }
    }

    // mains hum: a small, fast flicker so it never sits perfectly still
    if (light.current) {
      light.current.intensity = glow * (2.6 + Math.sin(t * 11.3) * 0.18 + Math.sin(t * 27.7) * 0.09);
    }
  });

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale} name="crt">
      {/* case: deeper at the back, the way a real tube is */}
      <mesh position={[0, 0.42, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 0.66, 0.62]} />
        <meshStandardMaterial color="#cfc4ad" roughness={0.85} metalness={0} flatShading />
      </mesh>
      {/* bezel */}
      <mesh position={[0, 0.45, 0.02]} castShadow>
        <boxGeometry args={[1, 0.85, 0.1]} />
        <meshStandardMaterial color="#ddd2ba" roughness={0.8} metalness={0} flatShading />
      </mesh>
      {/* the picture - basic material, so scene lighting can never dim it */}
      <mesh position={[0, 0.45, 0.075]}>
        <planeGeometry args={[0.82, 0.62]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* scanlines over the top */}
      <mesh position={[0, 0.45, 0.078]}>
        <planeGeometry args={[0.82, 0.62]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.22}
          depthWrite={false}
          alphaMap={useScanlines()}
          toneMapped={false}
        />
      </mesh>
      {/* the bit that sells it: light thrown back into the scene */}
      <pointLight
        ref={light}
        position={[0, 0.45, 0.55]}
        color={tint}
        intensity={2.6 * glow}
        distance={4.2}
        decay={2}
      />
      {/* feet */}
      <mesh position={[0, 0.05, -0.25]} receiveShadow>
        <boxGeometry args={[0.7, 0.1, 0.5]} />
        <meshStandardMaterial color="#b3a892" roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

/** One shared 1-px-on, 1-px-off alpha ramp, reused by every screen. */
let scanlineTex: THREE.DataTexture | null = null;
function useScanlines() {
  return useMemo(() => {
    if (scanlineTex) return scanlineTex;
    const h = 64;
    const data = new Uint8Array(h * 4);
    for (let i = 0; i < h; i++) {
      const v = i % 2 === 0 ? 255 : 0;
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(data, 1, h);
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 8);
    t.needsUpdate = true;
    scanlineTex = t;
    return t;
  }, []);
}

/* ------------------------------------------------------------------------- */
/* Retro CRT — real model (little_tv.glb) + animated GIF screen              */
/* ------------------------------------------------------------------------- */

/**
 * Screen plane inside the little_tv.glb model, in the model's own frame.
 * The mesh sits with its base at y=0 and faces +Z. Measured in Blender:
 *   x: [-0.121, 0.121]  (width 0.242)
 *   y: [ 0.060, 0.265]  (height 0.205, centre 0.1625)
 *   z: [ 0.102, 0.127]  (front face at z ~ 0.128)
 */
const SCREEN_CENTER: [number, number, number] = [0, 0.1625, 0.129];
const SCREEN_SIZE: [number, number] = [0.24, 0.20];

/**
 * Draws an animated GIF onto a CanvasTexture. The browser decodes and animates
 * the GIF inside a real HTMLImageElement (attached to the DOM off-screen so it
 * keeps ticking), and we redraw its current frame into the canvas every render
 * tick. Modern Chrome/Firefox/Safari all animate detached-visibility images and
 * `drawImage` captures the frame currently on screen — the same trick used by
 * three.js texture demos.
 */
const SCREEN_VIDEO_RE = /\.(mp4|webm|ogv|mov)(\?|#|$)/i;

/**
 * Paints whatever `url` points at into a canvas texture, one frame per render.
 *
 * GIFs and videos both go through the SAME canvas so the CRT treatment is
 * identical either way: nearest-neighbour so it stays pixelly, and `contain`
 * letterboxing so nothing is stretched out of proportion.
 *
 * A GIF is an <img> parked off-screen rather than display:none - browsers only
 * advance a GIF's frames while the element counts as visible. A video is a
 * muted, looping, inline <video>: muted is what earns it autoplay without a
 * click, and the one-shot pointerdown retry covers the browsers that refuse
 * until the page has been interacted with.
 */

/* --- the console menu one of the CRTs runs ------------------------------- */

export type CrtMenuItem = {
  /** Shown on the plate. Kept short - it is drawn at 12px on a 256px tube. */
  label: string;
  /** What the readout lists while this item is up. Four fit; the rest are cut. */
  lines: string[];
  /** Melee-variant only: the yellow tagline that fills the bottom bar. */
  subtitle?: string;
};

export type CrtMenu = {
  /** Small caps line along the top band. */
  title: string;
  items: CrtMenuItem[];
  /** Seconds each item holds before the attract loop moves on. */
  dwell?: number;
  /** "classic" (default) draws the amber-plate readout; "melee" draws a pixel
   *  homage to the Super Smash Bros Melee main menu. */
  variant?: "classic" | "melee";
  /** Pin the highlight to one item. Set = the attract loop stops and the
   *  screen is being driven by clicks; unset = it cycles on its own. */
  activeIndex?: number;
  /** Optional /public path to a video (mp4/webm/…) painted under the overlay
   *  every frame. When set, the melee variant skips its synthetic starfield
   *  background and draws its UI on top of the video. */
  backgroundVideo?: string;
};

/**
 * Trim a readout line to the width it has.
 *
 * The lines come from lib/experience and lib/projects, which are written for a
 * web page, not for 107 pixels of tube - "Summit Technology Consulting" ran
 * straight off the right edge. Truncating here rather than shortening the data
 * keeps the screen correct when a longer job title or project name lands
 * later.
 */
function fitText(ctx: CanvasRenderingContext2D, s: string, maxW: number) {
  if (ctx.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(out + "\u2026").width > maxW) {
    out = out.slice(0, -1);
  }
  return out.trimEnd() + "\u2026";
}

/** Ease used for the plate wipe and the readout slide. */
function easeOutCubic(x: number) {
  const u = x < 0 ? 0 : x > 1 ? 1 : x;
  return 1 - Math.pow(1 - u, 3);
}

/* --- melee plate column geometry ------------------------------------------
 * Module scope rather than local to the draw, because clicking the tube has to
 * work out which plate is under the pointer and the two must not drift apart.
 * All in 256x192 canvas pixels. */
const MELEE_PLATE_W = 110;
const MELEE_PLATE_H = 18;
const MELEE_PLATE_GAP = 3;
const MELEE_PLATE_TOP = 26;
const MELEE_PLATE_BASE_X = 20;
/** Handplaced per-row x offsets that recreate the staircase-y wobble of the
 *  reference - not a formula, just eyeballed to feel like the original. */
const MELEE_STAGGER = [10, -4, 2, -8, -2];
const MELEE_CANVAS_W = 256;
const MELEE_CANVAS_H = 192;

/**
 * Which plate a click at these plane UVs landed on, or null for a miss.
 *
 * UV origin is bottom-left and the canvas is drawn top-down, hence the flip.
 * The plates are chevrons, not rectangles, but hit-testing the bounding box is
 * what you want here: the notched tips are 6-8px of a 110px plate, and losing a
 * click because the pointer sat in a corner would just feel broken.
 */
export function meleeMenuHit(u: number, v: number, itemCount: number): number | null {
  const x = u * MELEE_CANVAS_W;
  const y = (1 - v) * MELEE_CANVAS_H;
  const row = Math.floor((y - MELEE_PLATE_TOP) / (MELEE_PLATE_H + MELEE_PLATE_GAP));
  if (row < 0 || row >= itemCount) return null;
  // Reject the gap between rows, so a click there misses rather than snapping
  // to whichever plate happens to be nearer.
  if (y > MELEE_PLATE_TOP + row * (MELEE_PLATE_H + MELEE_PLATE_GAP) + MELEE_PLATE_H) return null;
  const px = MELEE_PLATE_BASE_X + (MELEE_STAGGER[row] ?? 0);
  if (x < px || x > px + MELEE_PLATE_W) return null;
  return row;
}

/**
 * Super Smash Bros Melee main-menu homage, drawn straight into the CRT canvas.
 *
 * The proportions are the ones from the original screen: a "Main Menu" caption
 * in the corner, a vertical stack of yellow-outlined chevron plates on the left
 * with the current pick filled solid and marked with a token pip, a boxed
 * italic sub-list on the right, and a full-width strip along the bottom
 * carrying the current pick's tagline between cyan brackets. Layout is against
 * a 256x192 buffer for the same reason the classic variant is - at this size a
 * half-pixel rounds into a visibly wrong glyph.
 */
function drawMeleeMenu(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  menu: CrtMenu
) {
  const items = menu.items;
  const n = Math.max(1, items.length);
  const dwell = menu.dwell ?? 3.6;
  // Driven or free-running. With an index pinned the attract loop stops and the
  // screen is being steered by clicks instead; the phase is parked past the
  // wipe so the plate reads as settled rather than caught mid-animation.
  const driven = menu.activeIndex !== undefined;
  const idx = driven
    ? Math.max(0, Math.min(n - 1, Math.round(menu.activeIndex as number)))
    : Math.floor(t / dwell) % n;

  const YELLOW = "#f2c53a";
  const YELLOW_HI = "#ffd85a";
  const CYAN = "#7fdcff";
  const INK = "#eaf6ff";
  const BG_TOP = "#0b1a3a";
  const BG_MID = "#050e24";
  const BG_DEEP = "#020616";

  // If a background video is already painted onto the canvas by the caller,
  // leave those pixels alone — we're an overlay in that case. Otherwise
  // paint the synthetic starfield ground.
  if (!menu.backgroundVideo) {
    const bg = ctx.createRadialGradient(W * 0.35, H * 0.55, 8, W * 0.5, H * 0.5, W * 0.85);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(0.55, BG_MID);
    bg.addColorStop(1, BG_DEEP);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const cx = W * 0.78;
    const cy = H * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2 + t * 0.05;
      const alpha = 0.05 + 0.04 * (0.5 + 0.5 * Math.sin(t * 0.7 + i));
      ctx.strokeStyle = `rgba(120,170,230,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(60,110,160,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y < H; y += 12) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();
  }

  // --- outer double frame --------------------------------------------------
  // A big rounded cyan rectangle that hugs the whole HUD area, plus a
  // thinner inner line a few pixels inside for the double-outline look. The
  // frame breaks around the title area on the top edge, so text sits ON the
  // frame rather than boxed by it - draw it BEFORE the caption below.
  const fX = 8;
  const fY = 8;
  const fW = W - fX * 2;
  const fH = H - fY * 2;
  const fR = 8;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  ctx.strokeStyle = "#8ad4ff";
  ctx.lineWidth = 2;
  roundRect(ctx, fX, fY, fW, fH, fR);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(140,210,255,0.65)";
  ctx.lineWidth = 1;
  roundRect(ctx, fX + 3, fY + 3, fW - 6, fH - 6, fR - 2);
  ctx.stroke();

  // Corner accent brackets - short cyan hooks in each corner of the frame,
  // the "tech HUD" detail the reference wears at every corner.
  ctx.strokeStyle = "#bfe8ff";
  ctx.lineWidth = 1;
  const cornerLen = 6;
  const corners = [
    { x: fX + fR, y: fY, dx: 1, dy: 0 },
    { x: fX + fW - fR, y: fY, dx: -1, dy: 0 },
    { x: fX + fR, y: fY + fH, dx: 1, dy: 0 },
    { x: fX + fW - fR, y: fY + fH, dx: -1, dy: 0 },
  ];
  ctx.beginPath();
  for (const c of corners) {
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + c.dx * cornerLen, c.y);
  }
  ctx.stroke();

  // --- "Main Menu" caption (top, no box) -----------------------------------
  // Silver italic serif text floating over the background, with a subtle
  // dark drop shadow and three angled slashes to the right of the label.
  const capX = 24;
  const capY = 14;
  const capText = menu.title;
  ctx.textBaseline = "middle";
  ctx.font = 'italic 900 15px "Georgia", "Times New Roman", serif';

  // Drop shadow, offset down-right one pixel, dark blue-black.
  ctx.fillStyle = "rgba(4,10,22,0.9)";
  ctx.fillText(capText, capX + 1, capY + 1);

  // Silver face with a faint vertical gradient so it doesn't read flat.
  const silver = ctx.createLinearGradient(0, capY - 8, 0, capY + 8);
  silver.addColorStop(0, "#f2f5fa");
  silver.addColorStop(1, "#b6c1cf");
  ctx.fillStyle = silver;
  ctx.fillText(capText, capX, capY);

  // Triple parallel slashes to the right of the label, angled up-right, the
  // decorative flourish the reference wears in that corner.
  const capW = ctx.measureText(capText).width;
  const slashX = capX + capW + 8;
  ctx.strokeStyle = "#7f9bc4";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const sx = slashX + i * 5;
    ctx.beginPath();
    ctx.moveTo(sx, capY + 5);
    ctx.lineTo(sx + 6, capY - 4);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  // --- five chevron plates down the left column ----------------------------
  // The plate silhouette from the reference: pointed on BOTH ends, but the
  // top and bottom edges are slightly angled inward from the tips instead of
  // running perfectly flat — so it reads as a stretched flag/parallelogram
  // with sharp points, not a hexagon with a flat centre. Each row is nudged
  // sideways by a small handplaced offset so the column doesn't stack into a
  // straight-edged block; the original menu breathes because the plates
  // stagger. Every plate carries a soft yellow bloom behind it too.
  const NOSE_R = 8; // right-side chevron depth
  const NOSE_L = 6; // left-side chevron depth
  const EDGE_DIP = 1; // how much the top/bottom edges bow inward from the tips

  function platePath(x: number, y: number, w: number, h: number) {
    // Six points: left tip, top-left corner, top-right corner, right tip,
    // bottom-right corner, bottom-left corner. The corners sit `EDGE_DIP`
    // pixels inward from the tips vertically so the top and bottom edges
    // angle rather than running flat.
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + NOSE_L, y + EDGE_DIP);
    ctx.lineTo(x + w - NOSE_R, y + EDGE_DIP);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - NOSE_R, y + h - EDGE_DIP);
    ctx.lineTo(x + NOSE_L, y + h - EDGE_DIP);
    ctx.closePath();
  }

  for (let i = 0; i < n; i += 1) {
    const y = MELEE_PLATE_TOP + i * (MELEE_PLATE_H + MELEE_PLATE_GAP);
    const px = MELEE_PLATE_BASE_X + (MELEE_STAGGER[i] ?? 0);
    const on = i === idx;

    // Soft yellow bloom behind every plate — the halo the reference wears
    // whether the row is lit or not. Drawn as a blurred fill of the plate
    // path in transparent yellow so it feathers past the border cleanly.
    ctx.save();
    ctx.shadowColor = on ? "rgba(255,190,40,0.95)" : "rgba(240,180,40,0.55)";
    ctx.shadowBlur = on ? 12 : 7;
    ctx.shadowOffsetY = on ? 2 : 1;
    ctx.fillStyle = on ? "rgba(255,180,40,0.9)" : "rgba(210,150,30,0.65)";
    platePath(px, y, MELEE_PLATE_W, MELEE_PLATE_H);
    ctx.fill();
    ctx.restore();

    if (on) {
      // Bright yellow face, no border.
      platePath(px, y, MELEE_PLATE_W, MELEE_PLATE_H);
      const face = ctx.createLinearGradient(0, y, 0, y + MELEE_PLATE_H);
      face.addColorStop(0, "#ffe066");
      face.addColorStop(0.5, "#f5cf2a");
      face.addColorStop(1, "#e6b311");
      ctx.fillStyle = face;
      ctx.fill();
      // Subtle upper highlight sliver so it doesn't read flat.
      ctx.save();
      platePath(px, y, MELEE_PLATE_W, MELEE_PLATE_H);
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,220,0.35)";
      ctx.fillRect(px, y, MELEE_PLATE_W, 2);
      ctx.restore();
    } else {
      // Black core.
      platePath(px, y, MELEE_PLATE_W, MELEE_PLATE_H);
      ctx.fillStyle = "#000";
      ctx.fill();
      // Fat gold border. Two passes: outer darker, inner brighter, so the
      // rim reads as beveled at 256×192 where a single 1px stroke muddies.
      ctx.lineJoin = "miter";
      ctx.strokeStyle = "#7a5510";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "#e6b322";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Label: heavy italic serif, black on lit / gold on dark. A tiny drop
    // shadow on the dark plates lifts the letters off the black core.
    ctx.font = 'italic 900 12px "Georgia", "Times New Roman", serif';
    if (on) {
      ctx.fillStyle = "#0a0800";
      ctx.fillText(items[i].label, px + 10, y + MELEE_PLATE_H / 2 + 1);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.fillText(items[i].label, px + 11, y + MELEE_PLATE_H / 2 + 2);
      ctx.fillStyle = "#f2c53a";
      ctx.fillText(items[i].label, px + 10, y + MELEE_PLATE_H / 2 + 1);
    }

    // Trailing bead: a mini plate with the same chevron nose, sitting just
    // past the plate's right tip. It's the "P" bumper that trails every row.
    const bX = px + MELEE_PLATE_W + 3;
    const bY = y + 3;
    const bW = 11;
    const bH = MELEE_PLATE_H - 6;
    ctx.beginPath();
    ctx.moveTo(bX, bY + bH / 2);
    ctx.lineTo(bX + 3, bY);
    ctx.lineTo(bX + bW - 3, bY);
    ctx.lineTo(bX + bW, bY + bH / 2);
    ctx.lineTo(bX + bW - 3, bY + bH);
    ctx.lineTo(bX + 3, bY + bH);
    ctx.closePath();

    // Bead glow too, matching the plate.
    ctx.save();
    ctx.shadowColor = on ? "rgba(255,190,40,0.9)" : "rgba(240,180,40,0.5)";
    ctx.shadowBlur = on ? 8 : 5;
    ctx.fillStyle = on ? "rgba(255,180,40,0.85)" : "rgba(210,150,30,0.55)";
    ctx.fill();
    ctx.restore();

    // Redraw the bead path (shadow-fill above lost the crisp edge).
    ctx.beginPath();
    ctx.moveTo(bX, bY + bH / 2);
    ctx.lineTo(bX + 3, bY);
    ctx.lineTo(bX + bW - 3, bY);
    ctx.lineTo(bX + bW, bY + bH / 2);
    ctx.lineTo(bX + bW - 3, bY + bH);
    ctx.lineTo(bX + 3, bY + bH);
    ctx.closePath();
    if (on) {
      const bf = ctx.createLinearGradient(0, bY, 0, bY + bH);
      bf.addColorStop(0, "#ffe066");
      bf.addColorStop(1, "#e6b311");
      ctx.fillStyle = bf;
      ctx.fill();
    } else {
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.strokeStyle = "#7a5510";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = "#e6b322";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Selected row: concentric target reticle floating off the bead.
    if (on) {
      const rx = bX + bW + 10;
      const ry = y + MELEE_PLATE_H / 2;
      const bob = Math.sin(t * 5) * 0.8;
      // outer soft glow
      ctx.save();
      ctx.shadowColor = "rgba(160,255,180,0.9)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = "rgba(210,255,220,0.9)";
      ctx.beginPath();
      ctx.arc(rx, ry + bob, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // green ring
      ctx.strokeStyle = "#4dd07a";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(rx, ry + bob, 4, 0, Math.PI * 2);
      ctx.stroke();
      // black core
      ctx.fillStyle = "#0a1f14";
      ctx.beginPath();
      ctx.arc(rx, ry + bob, 2.4, 0, Math.PI * 2);
      ctx.fill();
      // inner bright dot
      ctx.fillStyle = "#eaffd8";
      ctx.beginPath();
      ctx.arc(rx, ry + bob, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- right-side sub-list panel -------------------------------------------
  const panelX = 160;
  const panelY = 34;
  const panelW = 90;
  const panelH = 88;
  // Rounded frame with a slight blue wash and a cyan outline.
  ctx.fillStyle = "rgba(10,28,58,0.85)";
  roundRect(ctx, panelX, panelY, panelW, panelH, 6);
  ctx.fill();
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Vertical caption down the left edge of the panel. Small silver caps,
  // one letter per line, matching the "NEXT SCREEN" gutter in the reference.
  const gutter = "NEXT SCREEN";
  ctx.font = 'bold 8px "Arial", "Helvetica", sans-serif';
  ctx.textBaseline = "middle";
  const gutterTop = panelY + 8;
  const gutterStep = (panelH - 16) / (gutter.length - 1);
  for (let i = 0; i < gutter.length; i += 1) {
    // Skip drawing the space, but keep its slot so letters stay evenly spaced.
    if (gutter[i] === " ") continue;
    ctx.fillStyle = "rgba(6,10,22,0.85)";
    ctx.fillText(gutter[i], panelX + 5, gutterTop + i * gutterStep + 1);
    ctx.fillStyle = "#d6e6f4";
    ctx.fillText(gutter[i], panelX + 4, gutterTop + i * gutterStep);
  }

  // Sub-lines for the current selection, drawn in italic serif to match.
  const sublines = items[idx].lines.slice(0, 4);
  ctx.font = 'italic 10px "Georgia", "Times New Roman", serif';
  ctx.fillStyle = INK;
  const listX = panelX + 18;
  for (let i = 0; i < sublines.length; i += 1) {
    ctx.fillText(fitText(ctx, sublines[i], panelW - 22), listX, panelY + 14 + i * 15);
  }

  // --- bottom tagline bar --------------------------------------------------
  // A pale off-white pill with a soft gray double-line stroke and dark italic
  // serif text - the strip along the bottom of the reference reads as a
  // sheet of paper, not a lit yellow plate. No decorative brackets.
  const bY = H - 24;
  const bH = 14;
  const bX = 14;
  const bW2 = W - bX * 2;
  const br = 3;

  // Soft outer glow around the pill so it lifts off the dark background.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  roundRect(ctx, bX, bY, bW2, bH, br);
  ctx.fill();
  ctx.restore();

  // Cream/paper fill with a subtle top-to-bottom gradient.
  const pill = ctx.createLinearGradient(0, bY, 0, bY + bH);
  pill.addColorStop(0, "#fbfbf3");
  pill.addColorStop(1, "#e6e6d6");
  ctx.fillStyle = pill;
  roundRect(ctx, bX, bY, bW2, bH, br);
  ctx.fill();

  // Double stroke: an outer mid-gray and an inner light gray a pixel inside,
  // so the border reads as beveled rather than a single flat line.
  ctx.strokeStyle = "#5a5a4a";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = "#c8c8b6";
  ctx.lineWidth = 1;
  roundRect(ctx, bX + 1.5, bY + 1.5, bW2 - 3, bH - 3, br - 1);
  ctx.stroke();

  const tagline = items[idx].subtitle ?? items[idx].label;
  ctx.font = 'italic bold 12px "Georgia", "Times New Roman", serif';
  ctx.fillStyle = "#141414";
  const tw = ctx.measureText(tagline).width;
  const tx = (W - tw) / 2;
  ctx.fillText(tagline, tx, bY + bH / 2 + 1);

  // --- tube character: roll bar + vignette so it reads as a CRT -----------
  const rollT = (t % 9) / 9;
  if (rollT < 0.14) {
    const ry = (rollT / 0.14) * H;
    const g = ctx.createLinearGradient(0, ry - 10, 0, ry + 10);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(160,220,255,0.10)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, ry - 10, W, 20);
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.82);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, menu.backgroundVideo ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

/** Tiny rounded-rect helper; canvas 2D didn't ship one until roundRect(). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * Draws the menu into a 4:3 canvas, once per frame.
 *
 * Everything is a pure function of `t`, so there is no state to keep in sync
 * and no drift: which item is up, how far its plate has wiped in, how many
 * readout lines have arrived and where the caret is all fall out of the clock.
 * That also means the screen is identical on a reload, which is what you want
 * from a thing running in the corner of a scene.
 *
 * Sizes are absolute pixels against a 256x192 buffer rather than fractions of
 * the canvas, because at this resolution a half-pixel rounds into a visibly
 * wrong glyph - it is closer to laying out a sprite than a web page.
 */
export function drawCrtMenu(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  menu: CrtMenu
) {
  if (menu.variant === "melee") {
    drawMeleeMenu(ctx, W, H, t, menu);
    return;
  }
  const items = menu.items;
  const n = Math.max(1, items.length);
  const dwell = menu.dwell ?? 3.4;
  // Driven or free-running. With an index pinned the attract loop stops and the
  // screen is being steered by clicks instead; the phase is parked past the
  // wipe so the plate reads as settled rather than caught mid-animation.
  const driven = menu.activeIndex !== undefined;
  const idx = driven
    ? Math.max(0, Math.min(n - 1, Math.round(menu.activeIndex as number)))
    : Math.floor(t / dwell) % n;
  const phase = driven ? 0.999 : (t % dwell) / dwell;
  const wipe = easeOutCubic(phase / 0.22);          // plate slides in over the first fifth

  const INK = "#cbeeff";
  const DIM = "#3f7e9c";
  const HOT = "#ffc24a";
  const RULE = "#12405c";

  // --- tube ground: a vertical wash, plus a slow drifting grid -------------
  const wash = ctx.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, "#06182a");
  wash.addColorStop(0.55, "#030d18");
  wash.addColorStop(1, "#01060d");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(28,104,142,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const drift = (t * 6) % 16;
  for (let y = -16 + drift; y < H; y += 16) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
  }
  for (let x = 0; x < W; x += 16) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, H);
  }
  ctx.stroke();

  // --- top band ------------------------------------------------------------
  ctx.fillStyle = "rgba(4,20,34,0.85)";
  ctx.fillRect(0, 0, W, 20);
  ctx.fillStyle = HOT;
  ctx.fillRect(6, 6, 3, 9);
  ctx.font = 'bold 9px "Courier New", monospace';
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.fillText(menu.title.toUpperCase().split("").join(" "), 14, 11);
  // page pips, one per item
  for (let i = 0; i < n; i += 1) {
    ctx.fillStyle = i === idx ? HOT : "#1d4f6b";
    ctx.fillRect(W - 10 - (n - 1 - i) * 8, 8, 5, 5);
  }
  ctx.fillStyle = RULE;
  ctx.fillRect(0, 20, W, 1);

  // --- the three plates ----------------------------------------------------
  const PLATE_X = 8;
  const PLATE_W = 108;
  const PLATE_H = 24;
  const top = 40;
  const gap = 30;
  ctx.font = 'bold 12px "Courier New", monospace';
  for (let i = 0; i < n; i += 1) {
    const y = top + i * gap;
    const on = i === idx;
    const w = on ? PLATE_W * wipe : PLATE_W;

    if (on) {
      // Lit plate: amber slab with a notched right edge, drawn as a path so the
      // wipe reveals the notch last rather than sliding a rectangle under it.
      ctx.fillStyle = HOT;
      ctx.beginPath();
      ctx.moveTo(PLATE_X, y);
      ctx.lineTo(PLATE_X + w - 7, y);
      ctx.lineTo(PLATE_X + w, y + PLATE_H / 2);
      ctx.lineTo(PLATE_X + w - 7, y + PLATE_H);
      ctx.lineTo(PLATE_X, y + PLATE_H);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#04121f";
      ctx.fillRect(PLATE_X, y, 3, PLATE_H);
    } else {
      ctx.strokeStyle = "#164a66";
      ctx.strokeRect(PLATE_X + 0.5, y + 0.5, PLATE_W - 7, PLATE_H - 1);
      ctx.fillStyle = "rgba(10,38,56,0.5)";
      ctx.fillRect(PLATE_X + 1, y + 1, PLATE_W - 9, PLATE_H - 2);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(PLATE_X, y, w, PLATE_H);
    ctx.clip();
    ctx.fillStyle = on ? "#0a1a26" : DIM;
    ctx.fillText(items[i].label.toUpperCase(), PLATE_X + 10, y + PLATE_H / 2 + 1);
    ctx.restore();
  }

  // --- readout -------------------------------------------------------------
  const COL = 128;
  ctx.fillStyle = RULE;
  ctx.fillRect(COL, 28, 1, H - 28 - 22);
  ctx.font = '9px "Courier New", monospace';
  const lines = items[idx].lines.slice(0, 4);
  const lineMax = W - (COL + 15) - 6;
  for (let i = 0; i < lines.length; i += 1) {
    // Each line arrives a beat after the one above it, and slides the last few
    // pixels into place - the stagger is what makes it read as a machine
    // answering rather than a slide changing.
    const a = easeOutCubic((phase - 0.16 - i * 0.055) / 0.16);
    if (a <= 0) continue;
    const y = 44 + i * 13;
    ctx.globalAlpha = a;
    ctx.fillStyle = HOT;
    ctx.fillRect(COL + 8, y - 2, 3, 3);
    ctx.fillStyle = INK;
    ctx.fillText(fitText(ctx, lines[i], lineMax), COL + 15 + (1 - a) * 5, y);
    ctx.globalAlpha = 1;
  }

  // --- bottom band ---------------------------------------------------------
  const by = H - 18;
  ctx.fillStyle = "rgba(4,20,34,0.85)";
  ctx.fillRect(0, by, W, 18);
  ctx.fillStyle = RULE;
  ctx.fillRect(0, by, W, 1);
  // marching hatch, so the strip is never static
  ctx.fillStyle = "#123f59";
  for (let x = -8 + ((t * 14) % 8); x < W; x += 8) {
    ctx.fillRect(Math.round(x), by + 12, 4, 2);
  }
  ctx.font = 'bold 8px "Courier New", monospace';
  ctx.fillStyle = DIM;
  ctx.fillText("SELECT", 8, by + 7);
  if (Math.floor(t * 1.8) % 2 === 0) {
    ctx.fillStyle = HOT;
    ctx.fillRect(46, by + 3, 4, 8);
  }
  ctx.fillStyle = DIM;
  const label = items[idx].label.toUpperCase();
  ctx.fillText(label, W - 8 - ctx.measureText(label).width, by + 7);

  // --- tube character ------------------------------------------------------
  // A roll that crosses the screen every ~9s, and a faint bloom on the plates.
  const rollT = (t % 9) / 9;
  if (rollT < 0.14) {
    const ry = (rollT / 0.14) * H;
    const g = ctx.createLinearGradient(0, ry - 10, 0, ry + 10);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(160,220,255,0.10)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, ry - 10, W, 20);
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function useScreenTexture(
  url: string | undefined,
  menu: CrtMenu | undefined,
  width = 256,
  height = 192
) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }, [width, height]);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearFilter;
    return t;
  }, [canvas]);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const vidRef = useRef<HTMLVideoElement | null>(null);

  // A menu can pair with a background video; a plain screen uses `url` directly.
  const mediaUrl = menu?.backgroundVideo ?? (menu ? undefined : url);

  useEffect(() => {
    if (!mediaUrl) return;

    if (SCREEN_VIDEO_RE.test(mediaUrl)) {
      const vid = document.createElement("video");
      vid.src = mediaUrl;
      vid.loop = true;
      vid.muted = true;
      vid.defaultMuted = true;
      vid.playsInline = true;
      vid.crossOrigin = "anonymous";
      vid.preload = "auto";
      const play = () => { void vid.play().catch(() => {}); };
      play();
      window.addEventListener("pointerdown", play, { once: true });
      vidRef.current = vid;
      return () => {
        window.removeEventListener("pointerdown", play);
        vid.pause();
        vid.removeAttribute("src");
        vid.load();
        vidRef.current = null;
      };
    }

    const img = document.createElement("img");
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = mediaUrl;
    // Off-screen but still "visible" so browsers keep animating the GIF.
    img.style.position = "fixed";
    img.style.left = "-9999px";
    img.style.top = "-9999px";
    img.style.width = "1px";
    img.style.height = "1px";
    img.style.pointerEvents = "none";
    img.style.opacity = "0";
    document.body.appendChild(img);
    imgRef.current = img;
    return () => {
      if (img.parentNode) img.parentNode.removeChild(img);
      imgRef.current = null;
    };
  }, [mediaUrl]);

  useFrame(({ clock }) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Paint background media (if any) into the canvas as a `cover`ing fill so
    // it fills the tube rather than letterboxing — the menu overlay will
    // cover the edge crop.
    const vid = vidRef.current;
    const img = imgRef.current;
    let src: CanvasImageSource | null = null;
    let sw = 0;
    let sh = 0;
    if (vid && vid.readyState >= 2 && vid.videoWidth) {
      src = vid; sw = vid.videoWidth; sh = vid.videoHeight;
    } else if (img && img.complete && img.naturalWidth) {
      src = img; sw = img.naturalWidth; sh = img.naturalHeight;
    }

    if (menu) {
      // The menu wants a rectangle painted for it. Prefer the video (cover
      // fit, cropped) so the overlay sits on top of moving pixels; otherwise
      // clear to black — drawMeleeMenu paints its own starfield when there's
      // no video underneath.
      if (menu.backgroundVideo && src) {
        const k = Math.max(canvas.width / sw, canvas.height / sh);
        const w = sw * k;
        const h = sh * k;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(src, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      } else if (menu.backgroundVideo) {
        // Video not ready yet — clear so we don't hold last frame.
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      drawCrtMenu(ctx, canvas.width, canvas.height, clock.elapsedTime, menu);
      texture.needsUpdate = true;
      return;
    }

    if (!src) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const k = Math.min(canvas.width / sw, canvas.height / sh);
    const w = sw * k;
    const h = sh * k;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    texture.needsUpdate = true;
  });

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/**
 * A CRT built around the imported little_tv.glb chassis. The GLB's screen mesh is
 * covered by an unlit picture plane so scene lighting can never dim it, backed
 * by a scanline overlay and a coloured point light thrown forward — the same
 * three ingredients that make the code-built CrtTv read as switched ON.
 */
/** Optional light-controls passed by a caller to shape the CRT's forward
 *  throw. All fields optional — defaults produce a wide, screen-hot spot. */
export interface CrtLightConfig {
  /** How far forward (in local +Z, past the screen face) the spot sits. */
  forwardOffset?: number;
  /** Cone half-angle in radians. Wider = spills more sideways. */
  angle?: number;
  /** Soft edge, 0..1. 0 = hard cone, 1 = fully feathered. */
  penumbra?: number;
  /** Max reach of the throw in world units. */
  distance?: number;
  /** Distance falloff exponent (Three default is 2). */
  decay?: number;
  /** Multiplier layered on top of the screen glow — 1 = matches the previous
   *  point light output. Set 0 to cut this CRT's contribution entirely. */
  intensityScale?: number;
  /** Local-space nudge of the light source relative to the screen center. */
  offsetX?: number;
  offsetY?: number;
  /** Colour of the throw. Overrides the screen's own `tint`, which stays what
   *  the glass falls back to when there is no picture - so the light can be
   *  dialled without changing how a dead screen reads. */
  color?: string;
}

export function RetroCrtTv({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  screen = {},
  seed = 0,
  light: lightCfg = {},
  onScreenClick,
}: {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  screen?: CrtScreen;
  seed?: number;
  light?: CrtLightConfig;
  /** Fired when the picture itself is clicked, not the chassis, with the UV
   *  of the hit so the caller can work out what was under the pointer.
   *  Null when three didn't hand us one (no uv attribute on the hit). */
  onScreenClick?: (uv: { x: number; y: number } | null) => void;
}) {
  const tint = screen.tint ?? "#8be8ff";
  const lightColor = lightCfg.color ?? tint;
  const glow = screen.glow ?? 1;

  const { scene: gltfScene } = useGLTF(LITTLE_TV_URL);
  const chassis = useMemo(() => {
    const cloned = gltfScene.clone(true);
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        // Hide the model's flat screen mesh so our animated overlay isn't fighting it
        // for the same pixels.
        if (m.name.toLowerCase().includes("screen")) m.visible = false;
      }
    });
    return cloned;
  }, [gltfScene]);

  const gifTex = useScreenTexture(screen.content, screen.menu);
  const scanlines = useScanlines();

  // Light shape: forward-firing spot (not a point). A point light lit
  // everything around the TV including the wall behind it; the spot's cone
  // confines the throw to the front. Caller can widen the cone, push the
  // source further out, or dim it entirely via `light={...}`.
  const forwardOffset = lightCfg.forwardOffset ?? 0.35;
  const angle = lightCfg.angle ?? Math.PI / 3;      // 60° half-angle default
  const penumbra = lightCfg.penumbra ?? 0.5;
  const distance = lightCfg.distance ?? 3.4;
  const decay = lightCfg.decay ?? 2;
  const intensityScale = lightCfg.intensityScale ?? 1;
  const offsetX = lightCfg.offsetX ?? 0;
  const offsetY = lightCfg.offsetY ?? 0;

  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  // Wire the spot's target so it points down +Z (out through the screen face).
  // Without an explicit target, three defaults it to (0,0,0), which for a
  // light in front of the TV would beam back INTO the chassis.
  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
      lightRef.current.target.updateMatrixWorld();
    }
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed * 3.1;
    // mains hum: a small, fast flicker so the throw never sits perfectly still
    if (lightRef.current) {
      lightRef.current.intensity = intensityScale * glow *
        (2.4 + Math.sin(t * 11.3) * 0.18 + Math.sin(t * 27.7) * 0.09);
    }
  });

  // Is there anything to put on the glass? A menu draws itself into the same
  // canvas media does, so it counts - without this the material fell back to a
  // flat `tint` fill and the tube showed a solid colour behind the scanlines.
  const hasPicture = !!(screen.content || screen.menu);

  const lightX = SCREEN_CENTER[0] + offsetX;
  const lightY = SCREEN_CENTER[1] + offsetY;
  const lightZ = SCREEN_CENTER[2] + forwardOffset;

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale} name="crt">
      <primitive object={chassis} />
      {/* the picture — unlit, so scene lighting can never dim it */}
      <mesh
        position={SCREEN_CENTER}
        // Deliberately NOT stopping propagation: the click has to keep
        // bubbling to the Selectable wrapper, which is what selects the tube
        // in the lab. That handler stops it, so nothing behind is hit either.
        onClick={onScreenClick ? (e) => onScreenClick(e.uv ? { x: e.uv.x, y: e.uv.y } : null) : undefined}
      >
        <planeGeometry args={SCREEN_SIZE} />
        <meshBasicMaterial
          map={hasPicture ? gifTex : undefined}
          color={hasPicture ? "#ffffff" : tint}
          toneMapped={false}
        />
      </mesh>
      {/* scanlines just in front of the picture */}
      <mesh position={[SCREEN_CENTER[0], SCREEN_CENTER[1], SCREEN_CENTER[2] + 0.002]}>
        <planeGeometry args={SCREEN_SIZE} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.28}
          depthWrite={false}
          alphaMap={scanlines}
          toneMapped={false}
        />
      </mesh>
      {/* Forward-firing spot: only lights what's IN FRONT of the screen. */}
      <spotLight
        ref={lightRef}
        position={[lightX, lightY, lightZ]}
        color={lightColor}
        intensity={2.4 * glow * intensityScale}
        distance={distance}
        decay={decay}
        angle={angle}
        penumbra={penumbra}
      />
      {/* Target the light points AT. Placed ~1.5 units further forward than the
       *  light itself, so the cone shoots down local +Z. Any farther is fine —
       *  spotLights use the target only for a direction vector. */}
      <object3D ref={targetRef} position={[lightX, lightY, lightZ + 1.5]} />
    </group>
  );
}

useGLTF.preload(LITTLE_TV_URL);
