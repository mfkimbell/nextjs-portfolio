"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/** The picture's colour. Held at module scope so it is not rebuilt each frame. */
const SCREEN_PLAIN = new THREE.Color(1, 1, 1);
/** How far the hover lifts the picture, as a screen blend: a black pixel comes
 *  up by this much, a white one does not move. */
const SCREEN_HOVER_LIFT = 0.26;



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

/** One line of a section screen: a bold heading and an optional detail under
 *  it. Rows without a detail pack tighter, so a flat list fits more of them. */
export type CrtPageRow = {
  label: string;
  /** Short form for the tile's name plate. Falls back to `label`, which for
   *  anything longer than a word or two just truncates into noise. */
  tag?: string;
  sub?: string;
  /** The full write-up, one string per paragraph. Wrapped into the band. */
  body?: string[];
  /** /public path to a square-ish icon. Only used by a grid page. */
  icon?: string;
  /** /public path to a wide image for a grid page's bottom band. */
  diagram?: string;
  /** Where this row GOES when it is clicked - a project's repository, say.
   *  A row with one is a link: the board says so in the band's corner, and
   *  the click opens it in a new tab rather than navigating the page the
   *  scene is running in. */
  href?: string;
};

export type CrtPage = {
  /** Replaces "Main Menu" on the rail. */
  title: string;
  rows: CrtPageRow[];
  /** Draw the rows as a grid of icon tiles - a character-select board -
   *  instead of a list. Every row wants an `icon` for this to be worth it. */
  grid?: boolean;
  /** Tiles across. 7 x 3 puts 21 on the board. */
  cols?: number;
  /** Which tile is lit, and therefore whose diagram the band shows. */
  activeRow?: number;
  /** Tile proportions. Projects wants 21 small ones; Experience wants five
   *  big enough to read an animated logo in. `showCaption: false` drops the
   *  name plate, which is the right call when the band below already names
   *  whatever is lit. */
  tile?: { wellH?: number; capH?: number; showCaption?: boolean };
  /** Share of the page's body given to the bottom band, 0..1. The grid gets
   *  the rest. 0.6 makes the diagram the subject and the tiles the index. */
  bandFrac?: number;
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
  /** Optional /public path to a still painted under the overlay. Used for the
   *  menu itself, where a moving background fights the plates for attention.
   *  Drawn only when there is no video, so the two can coexist on one menu
   *  object and be switched by clearing `backgroundVideo`. */
  backgroundImage?: string;
  /** How the background media is fitted to the tube. Default "cover" fills
   *  the screen and lets the crop fall off the sides, which is right for a
   *  backdrop the UI is drawn over.
   *
   *  "contain" is for media whose OWN CONTENT reaches the edges of its frame.
   *  The attract video is 16:9 and the tube is 4:3, so cover scales it by
   *  height and throws away 160 source pixels off each side - and the title
   *  card's wordmark runs to x 1150 of 1280, so the end of it went over the
   *  edge. Contain scales by width instead and letterboxes the difference
   *  into black, which on a CRT is just how a widescreen picture looks. */
  backgroundFit?: "cover" | "contain";
  /** Paint the background media and nothing else - no plates, no readout.
   *  This is the attract screen the tube shows until it is clicked. */
  hideUi?: boolean;
  /** When set, the tube shows this SECTION SCREEN instead of the plate
   *  stack: its own heading on the rail, its rows down the body, and a single
   *  Back plate. Picking a plate on the menu is what opens one. */
  page?: CrtPage;
  /** The ONE image allowed to animate. See the effect in useScreenTexture:
   *  a GIF only runs while its <img> is inside the viewport, so this is what
   *  decides which tile is spinning. */
  liveImage?: string;
  /** Lights the section screen's Back plate, for pointer hover. */
  pageBackHover?: boolean;
  /** Fixed text for the bottom strip. Unset and the strip shows the current
   *  item's own subtitle instead. */
  tagline?: string;
  /** Everything this tube will EVER show, so it is all decoded up front.
   *  The screen switches media on a click; anything not already resident would
   *  start fetching at that moment and the tube would sit black through it. */
  preloadMedia?: string[];
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
/** How far the lit plate slides out to the right. In the reference the
 *  current pick sits proud of the stack; it is the main thing that tells you
 *  which row you are on at a glance. Hit-testing applies it too. */
const MELEE_SELECT_JUT = 7;
/*
 * The menu's type, in the order the real thing uses it.
 *
 *   1. A-OTF Folk Pro Bold      Fontworks - the plate labels and headings
 *   2. ITC Galliard Std Ultra   the italic serif in the sub-list and titling
 *   3. Impact                   the small sub-logo / label overlays
 *   4. DF Gothic / Contemporary secondary system pop-ups
 *
 * All four are named here in that order, with the spellings each one ships
 * under on different platforms, because canvas resolves a family list exactly
 * the way CSS does: first one INSTALLED wins. None of them is bundled with
 * this site - there is no @font-face for them - so they only appear for a
 * viewer who owns them. In practice Impact is the one that lands, since it
 * ships with both macOS and Windows; everything before it is a commercial
 * licence. The tail is a generic that at least keeps the weight and width in
 * the right region.
 */
const MELEE_FAMILIES = [
  '"A-OTF Folk Pro"', '"A-OTF FolkPro"', '"FolkPro-Bold"', '"Folk Pro"', '"FOT-Folk Pro"',
  '"ITC Galliard Std"', '"ITC Galliard"', '"Galliard Std"', '"Galliard"',
  '"Impact"',
  '"DF Gothic"', '"DFGothic-EB"', '"DF Contemporary"', '"DFPGothic-EB"',
].join(", ");

/** Upright UI text: plate labels, the caption, the bottom strip. In the
 *  reference these are Folk Pro Bold - a bold, slightly condensed gothic -
 *  NOT an italic serif, which is what they used to be drawn in here. */
const MELEE_UI_FONT = `${MELEE_FAMILIES}, "Arial Black", "Helvetica Neue", Arial, sans-serif`;
/** The italic serif: the sub-list, which is Galliard in the original. Led by
 *  Galliard so it wins here even though Folk Pro sits ahead of it overall. */
const MELEE_SERIF_FONT = '"ITC Galliard Std", "ITC Galliard", "Galliard Std", "Galliard", '
  + `${MELEE_FAMILIES}, Georgia, "Times New Roman", serif`;

/* Section-screen layout. The body runs from under the rail down to the Back
   plate; the strip keeps its place at the bottom. */
/* Back sits TOP RIGHT, where the reference keeps it, which is what frees the
   bottom of the screen for content. On a grid page that band is the selected
   project's architecture diagram; on a list page it is just more rows. */
const MELEE_PAGE_TOP = 36;
const MELEE_BACK_X = 170;
const MELEE_BACK_Y = 15;
const MELEE_BACK_W = 66;
const MELEE_BACK_H = 16;
/** Grid pages stop here and hand the rest of the screen to the diagram. */
const MELEE_GRID_WELL_H = 20;
const MELEE_GRID_CAP_H = 11;
const MELEE_PAGE_BOTTOM = 178;

/**
 * Where a grid page's grid stops and its band starts.
 *
 * One function, used by the renderer AND by the hit test, so what you point
 * at is always what lights. They used to carry their own copies of these
 * numbers, which is a bug waiting for the first time one of them is tuned.
 */
export function meleeGridLayout(page: CrtPage) {
  const cols = Math.max(1, page.cols ?? 7);
  const wellH = page.tile?.wellH ?? MELEE_GRID_WELL_H;
  const capH = page.tile?.showCaption === false ? 0 : (page.tile?.capH ?? MELEE_GRID_CAP_H);
  const cellH = wellH + capH + 1;
  const bodyH = MELEE_PAGE_BOTTOM - MELEE_PAGE_TOP;
  const bandH = Math.round(bodyH * (page.bandFrac ?? 0.3));
  const bandTop = MELEE_PAGE_BOTTOM - bandH;
  return {
    cols, wellH, capH, cellH,
    showCaption: capH > 0,
    gridTop: MELEE_PAGE_TOP,
    gridBottom: bandTop - 4,
    bandTop,
    bandBottom: MELEE_PAGE_BOTTOM,
  };
}

/** Which tile of a grid page is under this UV, or null. Mirrors the layout
 *  drawGrid uses, so what you point at is what lights. */
export function meleeGridHit(u: number, v: number, page: CrtPage): number | null {
  const L = meleeGridLayout(page);
  const x = u * MELEE_CANVAS_W;
  const y = (1 - v) * MELEE_CANVAS_H;
  const gridX = 20;
  const cellW = (MELEE_CANVAS_W - gridX - 20) / L.cols;
  const col = Math.floor((x - gridX) / cellW);
  const row = Math.floor((y - L.gridTop) / L.cellH);
  if (col < 0 || col >= L.cols || row < 0) return null;
  if (y > L.gridBottom) return null;
  const i = row * L.cols + col;
  return i >= 0 && i < page.rows.length ? i : null;
}

/** True when a click on a SECTION screen landed on its Back plate. */
export function meleePageBackHit(u: number, v: number): boolean {
  const x = u * MELEE_CANVAS_W;
  const y = (1 - v) * MELEE_CANVAS_H;
  return x >= MELEE_BACK_X && x <= MELEE_BACK_X + MELEE_BACK_W
      && y >= MELEE_BACK_Y && y <= MELEE_BACK_Y + MELEE_BACK_H;
}

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
export function meleeMenuHit(
  u: number,
  v: number,
  itemCount: number,
  activeIndex = -1,
): number | null {
  const x = u * MELEE_CANVAS_W;
  const y = (1 - v) * MELEE_CANVAS_H;
  const row = Math.floor((y - MELEE_PLATE_TOP) / (MELEE_PLATE_H + MELEE_PLATE_GAP));
  if (row < 0 || row >= itemCount) return null;
  // Reject the gap between rows, so a click there misses rather than snapping
  // to whichever plate happens to be nearer.
  if (y > MELEE_PLATE_TOP + row * (MELEE_PLATE_H + MELEE_PLATE_GAP) + MELEE_PLATE_H) return null;
  const px = MELEE_PLATE_BASE_X + (MELEE_STAGGER[row] ?? 0)
    + (row === activeIndex ? MELEE_SELECT_JUT : 0);
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
/** Break `text` into lines that each fit `maxW` at the context's current font. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

function drawMeleeMenu(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  menu: CrtMenu,
  image?: (url: string) => CanvasImageSource | null,
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

  const INK = "#eaf6ff";
  const BG_TOP = "#0b1a3a";
  const BG_MID = "#050e24";
  const BG_DEEP = "#020616";

  // If a background video is already painted onto the canvas by the caller,
  // leave those pixels alone — we're an overlay in that case. Otherwise
  // paint the synthetic starfield ground.
  if (!menu.backgroundVideo && !menu.backgroundImage) {
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

  // --- outer frame, with the STEPPED top rail ------------------------------
  /*
   * The top edge is not one straight line.
   *
   * In the reference the rail runs low across the left - just under the "Main
   * Menu" label - then kicks up a diagonal right after the slashes and
   * carries on at a higher level to the top-right corner. That step is the
   * whole signature of the frame, and drawing a plain rounded rectangle threw
   * it away: the label ended up floating over a flat line with nothing tying
   * it to the HUD.
   *
   * The kink is placed off the MEASURED width of the title, so the diagonal
   * always lands just past the slashes however long the title is.
   */
  ctx.font = `italic 900 15px ${MELEE_UI_FONT}`;
  ctx.textBaseline = "middle";
  const capText = menu.page ? menu.page.title : menu.title;
  const capX = 20;
  const capY = 11;
  const capW = ctx.measureText(capText).width;

  const fX = 8;
  const fY = 21;                 // low rail, under the caption
  const fYHigh = 11;             // high rail, right of the step
  const fW = W - fX * 2;
  const fH = H - fY - 8;
  const fR = 8;
  const slashX = capX + capW + 7;
  const kinkX = slashX + 17;     // diagonal starts just past the slashes
  const kinkRun = 9;             // its horizontal length

  function framePath(x: number, y: number, w: number, h: number, r: number,
                     kx: number, krun: number, yHi: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(kx, y);
    ctx.lineTo(kx + krun, yHi);          // the step
    ctx.lineTo(x + w - r, yHi);
    ctx.quadraticCurveTo(x + w, yHi, x + w, yHi + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  ctx.strokeStyle = "#8ad4ff";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  framePath(fX, fY, fW, fH, fR, kinkX, kinkRun, fYHigh);
  ctx.stroke();
  ctx.restore();

  // Inner hairline, following the same stepped silhouette.
  ctx.strokeStyle = "rgba(140,210,255,0.65)";
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  framePath(fX + 3, fY + 3, fW - 6, fH - 6, fR - 2, kinkX + 3, kinkRun, fYHigh + 3);
  ctx.stroke();
  ctx.lineJoin = "miter";

  // Corner accents. The top pair sit on their OWN rails - left on the low
  // one, right on the high one - or they float off the line at the step.
  ctx.strokeStyle = "#bfe8ff";
  ctx.lineWidth = 1;
  const cornerLen = 6;
  ctx.beginPath();
  ctx.moveTo(fX + fR, fY);               ctx.lineTo(fX + fR + cornerLen, fY);
  ctx.moveTo(fX + fW - fR, fYHigh);      ctx.lineTo(fX + fW - fR - cornerLen, fYHigh);
  ctx.moveTo(fX + fR, fY + fH);          ctx.lineTo(fX + fR + cornerLen, fY + fH);
  ctx.moveTo(fX + fW - fR, fY + fH);     ctx.lineTo(fX + fW - fR - cornerLen, fY + fH);
  ctx.stroke();

  // --- "Main Menu" caption, riding ABOVE the low rail ----------------------
  // Drop shadow, offset down-right one pixel, dark blue-black.
  ctx.fillStyle = "rgba(4,10,22,0.9)";
  ctx.fillText(capText, capX + 1, capY + 1);

  // Silver face with a faint vertical gradient so it doesn't read flat.
  const silver = ctx.createLinearGradient(0, capY - 8, 0, capY + 8);
  silver.addColorStop(0, "#f2f5fa");
  silver.addColorStop(1, "#b6c1cf");
  ctx.fillStyle = silver;
  ctx.fillText(capText, capX, capY);

  // The slashes bridge the caption to the step, leaning at the same angle as
  // the diagonal so they read as part of the same rail.
  ctx.strokeStyle = "#7f9bc4";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const sx = slashX + i * 5;
    ctx.beginPath();
    ctx.moveTo(sx, fY - 1);
    ctx.lineTo(sx + kinkRun, fYHigh - 1);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  /* The plate silhouette, shared by the menu's rows and the section
     screen's Back plate so the two are the same object. */
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

  /* The Back plate, shared by both page layouts - same silhouette, bevel
     and ">" tail as a menu plate, so it is plainly the same object. */
  function drawPageBack(c: CanvasRenderingContext2D) {
  const lit = !!menu.pageBackHover;
  // The Back plate - same silhouette and bevel as a menu plate, so it is
  // obviously the same kind of object and obviously clickable.
  c.save();
  c.shadowColor = "rgba(0,0,0,0.6)";
  c.shadowBlur = 2;
  c.shadowOffsetX = 2;
  c.shadowOffsetY = 2;
  c.fillStyle = "#000";
  platePath(MELEE_BACK_X, MELEE_BACK_Y, MELEE_BACK_W, MELEE_BACK_H);
  c.fill();
  c.restore();
  platePath(MELEE_BACK_X, MELEE_BACK_Y, MELEE_BACK_W, MELEE_BACK_H);
  if (lit) {
    const lf = c.createLinearGradient(0, MELEE_BACK_Y, 0, MELEE_BACK_Y + MELEE_BACK_H);
    lf.addColorStop(0, "#fff29a");
    lf.addColorStop(0.45, "#f7cf28");
    lf.addColorStop(1, "#dca400");
    c.fillStyle = lf;
  } else {
    c.fillStyle = "#050505";
  }
  c.fill();
  c.lineJoin = "miter";
  c.strokeStyle = "#5e400b";
  c.lineWidth = 3.4;
  c.stroke();
  const backRim = c.createLinearGradient(0, MELEE_BACK_Y, 0, MELEE_BACK_Y + MELEE_BACK_H);
  backRim.addColorStop(0, "#ffd964");
  backRim.addColorStop(0.5, "#d9a417");
  backRim.addColorStop(1, "#8a6410");
  c.strokeStyle = backRim;
  c.lineWidth = 1.6;
  c.stroke();

  c.font = `900 13px ${MELEE_UI_FONT}`;
  const bkX = MELEE_BACK_X + NOSE_L + 6;
  const bkY = MELEE_BACK_Y + MELEE_BACK_H / 2 + 1;
  c.fillStyle = lit ? "#120d00" : "rgba(0,0,0,0.95)";
  c.fillText("Back", lit ? bkX : bkX + 1, lit ? bkY : bkY + 1);
  const bkG = c.createLinearGradient(0, MELEE_BACK_Y + 3, 0, MELEE_BACK_Y + MELEE_BACK_H - 3);
  bkG.addColorStop(0, "#ffe27a");
  bkG.addColorStop(1, "#d9a11a");
  if (!lit) {
    c.fillStyle = bkG;
    c.fillText("Back", bkX, bkY);
  }

  // and its ">" tail, matching the menu plates
  const bax = MELEE_BACK_X + MELEE_BACK_W - NOSE_R - 7;
  const bay = MELEE_BACK_Y + MELEE_BACK_H / 2;
  c.lineCap = "round";
  c.lineJoin = "round";
  const backArrow = () => {
    c.beginPath();
    c.moveTo(bax, bay - 4.5);
    c.lineTo(bax + 4.5, bay);
    c.lineTo(bax, bay + 4.5);
  };
  backArrow();
  c.strokeStyle = "rgba(0,0,0,0.95)";
  c.lineWidth = 3.2;
  c.stroke();
  backArrow();
  c.strokeStyle = bkG;
  c.lineWidth = 1.6;
  c.stroke();
  c.lineCap = "butt";
  c.lineJoin = "miter";
  }

  // --- section screen ------------------------------------------------------
  /*
   * A picked section gets the whole tube to itself: heading on the rail, its
   * rows down the body, one Back plate. Drawn instead of the plate stack, not
   * over it, so the two can never fight for the same pixels.
   */
  if (menu.page && menu.page.grid) {
    /*
     * Character-select board: a grid of icon tiles, each with a name plate
     * under it. Lifted straight from the reference's roster - a bevelled
     * frame, the art cover-fit inside it, and a dark caption bar across the
     * bottom edge carrying the name in small caps.
     *
     * 7 x 3 is chosen so all 21 projects land on one board with nothing
     * cut. Names are wrapped to two lines the way the reference wraps
     * "ICE CLIMBERS" and "JIGGLY-PUFF" rather than being clipped.
     */
    const rows = menu.page.rows;
    const L = meleeGridLayout(menu.page);
    const cols = L.cols;
    const gridX = 20;
    const gridW = W - gridX - 20;
    const cellW = gridW / cols;
    const tileW = Math.floor(cellW) - 2;
    const { wellH, capH, cellH } = L;
    const maxRows = Math.max(1, Math.floor((L.gridBottom - L.gridTop) / cellH));
    const shown = rows.slice(0, cols * maxRows);
    const active = menu.page.activeRow ?? -1;

    ctx.textAlign = "center";
    for (let i = 0; i < shown.length; i += 1) {
      const cx = gridX + (i % cols) * cellW + 1;
      const cy = L.gridTop + Math.floor(i / cols) * cellH;
      const on = i === active;

      /*
       * The well behind the art: near-black blue-grey, and the SAME for every
       * tile, picked or not.
       *
       * It has to be the same, because the role clips carry this exact colour
       * baked in - they are the transparent source GIFs flattened onto it, so
       * that the animation sits on the well instead of on the white card the
       * flattening used to produce. Light the picked tile's well and that
       * square of baked-in backing would suddenly read as a darker patch
       * inside a lighter frame. The selection is carried by the rim, the name
       * plate and the art's own strength instead, none of which touch this.
       */
      ctx.fillStyle = "#0e141c";
      ctx.fillRect(cx, cy, tileW, wellH);
      const art = shown[i].icon ? image?.(shown[i].icon as string) ?? null : null;
      if (art) {
        const aw = (art as HTMLImageElement).naturalWidth || tileW;
        const ah = (art as HTMLImageElement).naturalHeight || wellH;
        const k = Math.min((tileW - 4) / aw, (wellH - 4) / ah);   // contain
        const dw = aw * k;
        const dh = ah * k;
        ctx.imageSmoothingEnabled = true;
        // The unselected tiles sit BACK; the pick is the only one at full
        // strength. That is the whole selection cue on the art itself, and it
        // replaces the translucent grey puck that used to be drawn over the
        // current tile - a cursor that covered up the very thing it was
        // pointing at, on a tile that is only 17px tall to begin with.
        ctx.globalAlpha = on ? 1 : 0.68;
        ctx.drawImage(art, cx + (tileW - dw) / 2, cy + (wellH - dh) / 2, dw, dh);
        ctx.globalAlpha = 1;
      }
      // One rim, and it is drawn INSIDE the tile's own box. The selected tile
      // used to get a second ring 1.5px outside its bounds, and with the
      // cells only two pixels apart that read as the tile swelling into its
      // neighbours rather than as a highlight - the grid lost its rhythm on
      // whichever tile you were looking at.
      ctx.strokeStyle = on ? "#ffd964" : "#6f89a8";
      ctx.lineWidth = on ? 2 : 1;
      const inset = on ? 1 : 0.5;
      ctx.strokeRect(cx + inset, cy + inset, tileW - inset * 2, wellH - inset * 2);

      if (!L.showCaption) continue;
      // The name plate carries the selection too: gold bar with dark letters
      // for the pick, the roster's own dark plate for the rest. Two cues that
      // agree (rim + plate) read as one clear state; the old treatment had
      // three that did not (rim, outer ring, puck).
      const capY = cy + wellH;
      if (on) {
        const capG = ctx.createLinearGradient(0, capY, 0, capY + capH);
        capG.addColorStop(0, "#ffe27a");
        capG.addColorStop(1, "#d9a11a");
        ctx.fillStyle = capG;
      } else {
        ctx.fillStyle = "rgba(6,12,24,0.92)";
      }
      ctx.fillRect(cx, capY, tileW, capH);
      ctx.font = `bold 5px ${MELEE_UI_FONT}`;
      const words = (shown[i].tag ?? shown[i].label).toUpperCase().split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (ctx.measureText(next).width > tileW - 3 && line) {
          lines.push(line);
          line = w;
          if (lines.length === 2) break;
        } else {
          line = next;
        }
      }
      if (lines.length < 2 && line) lines.push(line);
      const midX = cx + tileW / 2;
      ctx.fillStyle = on ? "#1c1303" : "#c9d9ea";
      if (lines.length > 1) {
        ctx.fillText(fitText(ctx, lines[0], tileW - 3), midX, capY + 4);
        ctx.fillText(fitText(ctx, lines[1], tileW - 3), midX, capY + 9);
      } else {
        ctx.fillText(fitText(ctx, lines[0] ?? "", tileW - 3), midX, capY + 7);
      }
    }
    ctx.textAlign = "left";

    /*
     * No cursor is drawn over the board.
     *
     * There used to be a translucent grey disc here, on the theory that at
     * 17px a border alone is easy to lose. It was worse than the problem: the
     * puck covered most of the icon it was marking, so the one tile you were
     * actually looking at was the one you could not see. The pick now shows
     * as a gold rim, a gold name plate and full-strength art while every
     * other tile is held back at 0.68 - all of it inside the tile's own box,
     * none of it on top of the art.
     */

    /*
     * The band along the bottom: the selected project's architecture diagram,
     * which is the whole reason the grid is packed into the top two thirds.
     * Kept as a framed well even with nothing selected, so the screen has the
     * same shape whether or not something is under the pointer.
     */
    const dX = gridX;
    const dY = L.bandTop;
    const dW = gridW;
    const dH = L.bandBottom - L.bandTop;
    /*
     * A page can ask for NO band (bandFrac 0), and Skills does: it is a board
     * of icons and nothing else. Everything below this line draws the band,
     * so leave now rather than framing an empty well under the tiles - which
     * is a hole in the screen, not a panel.
     */
    if (dH < 8) { drawPageBack(ctx); return; }
    ctx.fillStyle = "rgba(8,16,30,0.72)";
    ctx.fillRect(dX, dY, dW, dH);
    ctx.strokeStyle = "rgba(150,225,255,0.65)";
    ctx.lineWidth = 1;
    ctx.strokeRect(dX + 0.5, dY + 0.5, dW - 1, dH - 1);

    const pick = active >= 0 ? shown[active] : undefined;
    const diag = pick?.diagram ? image?.(pick.diagram) ?? null : null;
    if (diag) {
      const aw = (diag as HTMLImageElement).naturalWidth || dW;
      const ah = (diag as HTMLImageElement).naturalHeight || dH;
      // 2px of margin, not 6: this panel is the point of the screen, so the
      // art gets as close to the frame as it can without touching it.
      const k = Math.min((dW - 4) / aw, (dH - 4) / ah);          // contain
      const dw = aw * k;
      const dh = ah * k;
      ctx.imageSmoothingEnabled = true;
      // Nothing lettered over the art. The reference's "STAGE SELECT" mark
      // used to sit in this corner, but the heading already names the screen
      // on the rail above - repeating it here only covered up the corner of
      // the diagram the panel exists to show.
      ctx.drawImage(diag, dX + (dW - dw) / 2, dY + (dH - dh) / 2, dw, dh);
    } else if (pick) {
      /*
       * No diagram, so the panel carries the whole write-up instead.
       *
       * It used to print one centred line and ellipsize it, which threw away
       * everything past the job title - and on a panel this size there is
       * room for all of it. Left-aligned and wrapped: heading, then the role
       * and dates, then the bullets, each one flowed to the panel's width and
       * cut off only when the panel genuinely runs out of height.
       */
      const tx = dX + 8;
      const tw = dW - 16;
      let ty = dY + 14;

      ctx.font = `900 13px ${MELEE_UI_FONT}`;
      const lg = ctx.createLinearGradient(0, ty - 9, 0, ty + 3);
      lg.addColorStop(0, "#ffe27a");
      lg.addColorStop(1, "#d9a11a");
      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.fillText(fitText(ctx, pick.label, tw), tx + 1, ty + 1);
      ctx.fillStyle = lg;
      ctx.fillText(fitText(ctx, pick.label, tw), tx, ty);
      ty += 12;

      if (pick.sub) {
        ctx.font = `italic 9px ${MELEE_SERIF_FONT}`;
        ctx.fillStyle = "#a8c4de";
        for (const ln of wrapText(ctx, pick.sub, tw).slice(0, 2)) {
          ctx.fillText(ln, tx, ty);
          ty += 10;
        }
      }

      ty += 3;
      ctx.font = `8px ${MELEE_UI_FONT}`;
      // Only the FIRST line of a paragraph wears a bullet. The old loop said
      // so in a comment and then drew one on every wrapped line, so a bullet
      // arrived with each spilled word - "conferences" and "solutions" each
      // came out looking like a point of their own.
      for (const para of pick.body ?? []) {
        const lines = wrapText(ctx, para, tw - 6);
        let spilled = false;
        for (let li = 0; li < lines.length; li += 1) {
          if (ty > dY + dH - 5) { spilled = true; break; }
          if (li === 0) {
            ctx.fillStyle = "#7fb4d8";
            ctx.fillText("\u2022", tx, ty);
          }
          ctx.fillStyle = "#dce8f4";
          ctx.fillText(lines[li], tx + 6, ty);
          ty += 9;
        }
        if (spilled || ty > dY + dH - 5) break;
      }
    } else {
      ctx.textAlign = "center";
      ctx.font = `italic 9px ${MELEE_SERIF_FONT}`;
      ctx.fillStyle = "rgba(150,180,215,0.7)";
      ctx.fillText("Point at one", dX + dW / 2, dY + dH / 2);
      ctx.textAlign = "left";
    }

    drawPageBack(ctx);
    return;
  }

  if (menu.page) {
    const rows = menu.page.rows;
    const hasSub = rows.some((r) => !!r.sub);
    const rowH = hasSub ? 21 : 14;
    const avail = MELEE_BACK_Y - 6 - MELEE_PAGE_TOP;
    const shown = rows.slice(0, Math.max(1, Math.floor(avail / rowH)));
    const listX = 22;
    const listW = W - listX - 20;

    for (let i = 0; i < shown.length; i += 1) {
      const ry = MELEE_PAGE_TOP + i * rowH;

      // A short gold tick before each heading, so the column has an edge.
      ctx.fillStyle = "#d9a417";
      ctx.fillRect(listX - 8, ry - 3, 3, hasSub ? 12 : 7);

      ctx.font = `900 12px ${MELEE_UI_FONT}`;
      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.fillText(fitText(ctx, shown[i].label, listW), listX + 1, ry + 4);
      const lg = ctx.createLinearGradient(0, ry - 5, 0, ry + 7);
      lg.addColorStop(0, "#ffe27a");
      lg.addColorStop(1, "#d9a11a");
      ctx.fillStyle = lg;
      ctx.fillText(fitText(ctx, shown[i].label, listW), listX, ry + 3);

      if (shown[i].sub) {
        ctx.font = `italic 9px ${MELEE_SERIF_FONT}`;
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillText(fitText(ctx, shown[i].sub as string, listW), listX + 1, ry + 14);
        ctx.fillStyle = "#cfe3f2";
        ctx.fillText(fitText(ctx, shown[i].sub as string, listW), listX, ry + 13);
      }
    }

    // "+N more" when the list runs past what the tube can hold.
    if (shown.length < rows.length) {
      ctx.font = `italic 9px ${MELEE_SERIF_FONT}`;
      ctx.fillStyle = "rgba(180,205,230,0.85)";
      ctx.fillText(`+${rows.length - shown.length} more`, listX, MELEE_BACK_Y - 8);
    }

    drawPageBack(ctx);
  } else {
    // --- five chevron plates down the left column ----------------------------
    // The plate silhouette from the reference: pointed on BOTH ends, but the
    // top and bottom edges are slightly angled inward from the tips instead of
    // running perfectly flat — so it reads as a stretched flag/parallelogram
    // with sharp points, not a hexagon with a flat centre. Each row is nudged
    // sideways by a small handplaced offset so the column doesn't stack into a
    // straight-edged block; the original menu breathes because the plates
    // stagger. Every plate carries a soft yellow bloom behind it too.

    for (let i = 0; i < n; i += 1) {
      const y = MELEE_PLATE_TOP + i * (MELEE_PLATE_H + MELEE_PLATE_GAP);
      const on = i === idx;
      const px = MELEE_PLATE_BASE_X + (MELEE_STAGGER[i] ?? 0) + (on ? MELEE_SELECT_JUT : 0);

      /*
       * A DARK drop shadow, not a glow.
       *
       * The plates in the reference are lit objects sitting above the
       * background, and what sells that is a hard black shadow thrown down and
       * right - the same offset on every row, lit or not. A yellow bloom behind
       * each plate (what this used to do) made the whole column look like it
       * was smouldering and washed the gold rim out into the background.
       */
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = "#000";
      platePath(px, y, MELEE_PLATE_W, MELEE_PLATE_H);
      ctx.fill();
      ctx.restore();

      if (on) {
        // Lit: solid yellow face, black label. No rim - the fill IS the shape.
        platePath(px, y, MELEE_PLATE_W, MELEE_PLATE_H);
        const face = ctx.createLinearGradient(0, y, 0, y + MELEE_PLATE_H);
        face.addColorStop(0, "#fff29a");
        face.addColorStop(0.45, "#f7cf28");
        face.addColorStop(1, "#dca400");
        ctx.fillStyle = face;
        ctx.fill();
        ctx.save();
        platePath(px, y, MELEE_PLATE_W, MELEE_PLATE_H);
        ctx.clip();
        ctx.fillStyle = "rgba(255,255,235,0.45)";
        ctx.fillRect(px, y, MELEE_PLATE_W, 2);
        ctx.restore();
      } else {
        // Unlit: near-black core inside a BEVELLED gold rim. Two strokes, the
        // outer dark and the inner a top-lit gradient, so at 256x192 the rim
        // reads as a raised metal edge instead of a flat yellow outline.
        platePath(px, y, MELEE_PLATE_W, MELEE_PLATE_H);
        ctx.fillStyle = "#050505";
        ctx.fill();
        ctx.lineJoin = "miter";
        ctx.strokeStyle = "#5e400b";
        ctx.lineWidth = 3.4;
        ctx.stroke();
        const rim = ctx.createLinearGradient(0, y, 0, y + MELEE_PLATE_H);
        rim.addColorStop(0, "#ffd964");
        rim.addColorStop(0.5, "#d9a417");
        rim.addColorStop(1, "#8a6410");
        ctx.strokeStyle = rim;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // Label: heavy italic serif, black on lit / gold on dark.
      // Upright, not italic: the plates in the reference are set in Folk Pro
      // Bold standing straight up. The italic serif they used to carry is the
      // sub-list's face, not theirs.
      ctx.font = `900 13px ${MELEE_UI_FONT}`;
      const tx = px + NOSE_L + 6;
      const ty = y + MELEE_PLATE_H / 2 + 1;
      if (on) {
        ctx.fillStyle = "#120d00";
        ctx.fillText(items[i].label, tx, ty);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.95)";
        ctx.fillText(items[i].label, tx + 1, ty + 1);
        const lg = ctx.createLinearGradient(0, y + 3, 0, y + MELEE_PLATE_H - 3);
        lg.addColorStop(0, "#ffe27a");
        lg.addColorStop(1, "#d9a11a");
        ctx.fillStyle = lg;
        ctx.fillText(items[i].label, tx, ty);
      }

      /*
       * The ">" at the tail of the plate.
       *
       * This was a little hexagonal bead floating past the plate's tip, which
       * is not what the reference has: each unlit row carries a chevron ARROW
       * tucked just inside its right end, pointing onward. Same bevel as the
       * rim - dark stroke under, gold over - so it reads as part of the same
       * pressed-metal plate rather than a separate ornament.
       */
      const ax = px + MELEE_PLATE_W - NOSE_R - 7;
      const ay = y + MELEE_PLATE_H / 2;
      const aw = 4.5;
      const ah = 4.5;
      const arrow = () => {
        ctx.beginPath();
        ctx.moveTo(ax, ay - ah);
        ctx.lineTo(ax + aw, ay);
        ctx.lineTo(ax, ay + ah);
      };
      if (!on) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        arrow();
        ctx.strokeStyle = "rgba(0,0,0,0.95)";
        ctx.lineWidth = 3.2;
        ctx.stroke();
        arrow();
        const ag = ctx.createLinearGradient(0, ay - ah, 0, ay + ah);
        ag.addColorStop(0, "#ffe27a");
        ag.addColorStop(1, "#d9a11a");
        ctx.strokeStyle = ag;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
      } else {
        // The lit row swaps the arrow for the glowing target from the
        // reference - you are already here, so there is nothing to point on to.
        const rx = ax + 1;
        const pulse = 0.85 + 0.15 * Math.sin(t * 5);
        ctx.save();
        ctx.shadowColor = "rgba(255,225,110,0.95)";
        ctx.shadowBlur = 8 * pulse;
        ctx.fillStyle = "rgba(255,240,170,0.95)";
        ctx.beginPath();
        ctx.arc(rx, ay, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "#fff6c4";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(rx, ay, 3.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#f7cf28";
        ctx.beginPath();
        ctx.arc(rx, ay, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- right-side sub-list panel -------------------------------------------
    const panelX = 160;
    const panelY = 34;
    const panelW = 90;
    const panelH = 88;
    /* A translucent SLANTED pane, not an opaque rounded box. In the reference
       you can see the background moving through it, and its left edge leans -
       it reads as a sheet of glass held at an angle rather than a dialog. */
    const LEAN = 5;
    const pane = () => {
      ctx.beginPath();
      ctx.moveTo(panelX + LEAN, panelY);
      ctx.lineTo(panelX + panelW, panelY);
      ctx.lineTo(panelX + panelW - LEAN, panelY + panelH);
      ctx.lineTo(panelX, panelY + panelH);
      ctx.closePath();
    };
    pane();
    const glass = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    glass.addColorStop(0, "rgba(22,74,96,0.55)");
    glass.addColorStop(1, "rgba(12,40,66,0.45)");
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = "rgba(150,225,255,0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Vertical caption down the left edge of the panel. Small silver caps,
    // one letter per line, matching the "NEXT SCREEN" gutter in the reference.
    const gutter = "NEXT SCREEN";
    ctx.font = `bold 8px ${MELEE_UI_FONT}`;
    ctx.textBaseline = "middle";
    const gutterTop = panelY + 8;
    const gutterStep = (panelH - 20) / (gutter.length - 1);
    for (let i = 0; i < gutter.length; i += 1) {
      // Skip drawing the space, but keep its slot so letters stay evenly spaced.
      if (gutter[i] === " ") continue;
      // ride the pane's lean so the gutter stays parallel to its edge
      const gx = panelX - 8 + LEAN * (1 - i / (gutter.length - 1));
      ctx.fillStyle = "rgba(6,10,22,0.85)";
      ctx.fillText(gutter[i], gx + 1, gutterTop + i * gutterStep + 1);
      ctx.fillStyle = "#cfe3f2";
      ctx.fillText(gutter[i], gx, gutterTop + i * gutterStep);
    }

    // Sub-lines for the current selection, drawn in italic serif to match.
    const sublines = items[idx].lines.slice(0, 4);
    ctx.font = `italic 10px ${MELEE_SERIF_FONT}`;
    ctx.fillStyle = INK;
    const listX = panelX + 10;
    for (let i = 0; i < sublines.length; i += 1) {
      ctx.fillText(fitText(ctx, sublines[i], panelW - 22), listX, panelY + 14 + i * 15);
    }

  }

  // A section screen has no strip: the body needs that band, and the Back
  // plate already says what the one control is.
  if (menu.page) return;

  // --- bottom tagline bar --------------------------------------------------
  /* A translucent strip with a light outline and LIGHT text, matching the
     reference. It used to be a cream pill with dark text, which read as a
     sheet of paper stapled to the HUD; in the original the bar is part of the
     same glass frame as everything else and you can see through it. */
  /* Measured off the reference: the strip is inset about 17% of the frame's
     width on EACH side and sits just clear of the frame's bottom rail. It used
     to run nearly the frame's full width, 6px shy at either end, which read as
     a strip crammed against the edges rather than a caption floating under the
     menu. Derived from the frame so the two can never drift apart. */
  const bInset = Math.round(fW * 0.17);
  const bX = fX + bInset;
  const bW2 = fW - bInset * 2;
  const bH = 14;
  const bY = fY + fH - bH - 4;
  const br = 3;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  const strip = ctx.createLinearGradient(0, bY, 0, bY + bH);
  strip.addColorStop(0, "rgba(28,48,86,0.72)");
  strip.addColorStop(1, "rgba(10,22,46,0.72)");
  ctx.fillStyle = strip;
  roundRect(ctx, bX, bY, bW2, bH, br);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(210,235,255,0.9)";
  ctx.lineWidth = 1;
  roundRect(ctx, bX, bY, bW2, bH, br);
  ctx.stroke();

  const tagline = menu.tagline ?? items[idx].subtitle ?? items[idx].label;
  ctx.font = `bold 12px ${MELEE_UI_FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillText(fitText(ctx, tagline, bW2 - 14), W / 2 + 1, bY + bH / 2 + 1);
  ctx.fillStyle = "#eef6ff";
  ctx.fillText(fitText(ctx, tagline, bW2 - 14), W / 2, bY + bH / 2);
  ctx.textAlign = "left";

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
  vig.addColorStop(1, (menu.backgroundVideo || menu.backgroundImage) ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.55)");
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
  menu: CrtMenu,
  /** Looks a /public path up in the screen's own preloaded media. Grid pages
   *  need it to paint their tiles; everything else ignores it. */
  image?: (url: string) => CanvasImageSource | null,
) {
  if (menu.variant === "melee") {
    drawMeleeMenu(ctx, W, H, t, menu, image);
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

/*
 * How many device pixels the tube gets per LOGICAL pixel.
 *
 * Every layout number in this file is written against a 256x192 screen, and
 * that is the right space to think in - it is what the hit tests use and what
 * the original menu's proportions come from. But 256 pixels is not enough to
 * SHOW it: a 6px caption has about four pixels of actual letterform, so the
 * project names came out as grey mush once the tube was magnified on screen.
 *
 * So the canvas is drawn at THREE times that and the context is scaled to
 * match. The layout code is untouched and still thinks in 256x192; the glyphs
 * just get nine times the pixels to land on, which is the difference between
 * a 6px caption having four pixels of letterform and having eighteen.
 *
 * That is 1.8MB of texture per upload instead of 196KB, so it is paid for by
 * the refresh cap below rather than by running it every frame.
 */
const SCREEN_SS = 3;

/*
 * The tube redraws at 24fps, not at the render loop's rate.
 *
 * Nothing on a CRT needs 60: the background is video, the plates pulse
 * slowly, and a slightly steppy refresh is what the thing being imitated
 * actually looked like. Capping it means the big texture goes up 24 times a
 * second instead of 60, which is what makes 3x supersampling affordable -
 * without this, the upload alone would be ~106MB/s for one screen.
 */
const SCREEN_FPS = 24;

function useScreenTexture(
  url: string | undefined,
  menu: CrtMenu | undefined,
  width = 256,
  height = 192,
  /** Hover lift: brighten the PICTURE, in the canvas, while this is true. */
  lit = false,
) {
  // Read inside the frame loop rather than closed over, so toggling it never
  // re-subscribes the draw.
  const litRef = useRef(lit);
  litRef.current = lit;
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = width * SCREEN_SS;
    c.height = height * SCREEN_SS;
    return c;
  }, [width, height]);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearFilter;
    return t;
  }, [canvas]);

  /*
   * Every source this screen can show, alive at once, keyed by url.
   *
   * The tube is a little state machine - attract video, then the same video
   * held while the camera flies in, then a different video behind the buttons
   * - and each of those is a separate file. Tearing an element down and
   * building the next one at the moment of the click is exactly when the
   * screen must not go black, so they are all created once and simply
   * selected between.
   */
  const mediaRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());

  const sources = useMemo(() => {
    const out: string[] = [];
    const add = (u?: string) => { if (u && !out.includes(u)) out.push(u); };
    if (menu) {
      add(menu.backgroundVideo);
      add(menu.backgroundImage);
      for (const u of menu.preloadMedia ?? []) add(u);
    } else {
      add(url);
    }
    return out;
    // the JOINED list is the identity that matters, not the array object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu ? [menu.backgroundVideo, menu.backgroundImage, ...(menu.preloadMedia ?? [])].join("|") : url]);

  useEffect(() => {
    const store = mediaRef.current;
    // drop anything no longer listed
    for (const [key, el] of Array.from(store.entries())) {
      if (sources.includes(key)) continue;
      if (el instanceof HTMLVideoElement) {
        el.pause(); el.removeAttribute("src"); el.load();
      } else if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
      store.delete(key);
    }
    const plays: Array<() => void> = [];
    for (const src of sources) {
      if (store.has(src)) continue;
      if (SCREEN_VIDEO_RE.test(src)) {
        const vid = document.createElement("video");
        vid.src = src;
        vid.loop = true;
        vid.muted = true;
        vid.defaultMuted = true;
        vid.playsInline = true;
        vid.crossOrigin = "anonymous";
        vid.preload = "auto";
        const play = () => { void vid.play().catch(() => {}); };
        play();
        // Autoplay is commonly blocked until the page has been interacted
        // with, so retry on the first pointer down.
        window.addEventListener("pointerdown", play, { once: true });
        plays.push(play);
        store.set(src, vid);
      } else {
        const img = document.createElement("img");
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.src = src;
        /*
         * Parked OUTSIDE the viewport, which freezes any GIF on frame one.
         *
         * That used to be an accident - the comment here claimed the image
         * was "still visible so browsers keep animating", but left:-9999px is
         * exactly what stops them. Now it is deliberate: every tile shows a
         * still, and the effect below walks the selected one back into the
         * viewport so that one, and only one, runs.
         */
        img.style.position = "fixed";
        img.style.left = "-9999px";
        img.style.top = "-9999px";
        img.style.width = "1px";
        img.style.height = "1px";
        img.style.pointerEvents = "none";
        img.style.zIndex = "-1";
        img.style.opacity = "0";
        document.body.appendChild(img);
        store.set(src, img);
      }
    }
    return () => { for (const play of plays) window.removeEventListener("pointerdown", play); };
  }, [sources]);

  /*
   * Exactly one image animates: whichever the screen nominates.
   *
   * A browser pauses GIF playback for an <img> that is scrolled out of view,
   * so position IS the play/pause control here. The live one is moved to the
   * top-left corner at 1x1 and almost-zero opacity - rendered, therefore
   * running, but invisible - and everything else stays parked far off-screen
   * showing its first frame.
   */
  const liveImage = menu?.liveImage;
  useEffect(() => {
    for (const [key, el] of mediaRef.current.entries()) {
      const live = key === liveImage;

      if (el instanceof HTMLVideoElement) {
        /*
         * Videos are the reliable way to do this, and the reason the logos
         * are mp4 rather than gif.
         *
         * A browser decides for ITSELF whether to animate a GIF, based on
         * whether it thinks the <img> is on screen - and an <img> parked at
         * 1x1 with almost no opacity does not qualify, however you position
         * it. There is no API to override that. A <video> has play() and
         * pause(), so which logo is moving is a decision this code makes
         * rather than one it hopes for.
         *
         * The tube's own background is exempt from being NOMINATED away -
         * unlike a tile logo, it's never paused for losing liveImage. But it
         * still has to be RESUMED here: the attract video is background one
         * moment (stage 0/1) and just a bystander the next (stage 2/3, when
         * background_buttons.mp4 takes over) - at which point the branch
         * below sees it as "not live" and pauses it, same as any unselected
         * tile. Coming back out just re-exempts it without ever calling
         * play() again, so without this it would sit frozen on whatever
         * frame it happened to pause on the first time you opened the menu.
         */
        if (key === menu?.backgroundVideo) {
          if (el.paused) void el.play().catch(() => {});
          continue;
        }
        if (live) {
          void el.play().catch(() => {});
        } else if (!el.paused) {
          el.pause();
          el.currentTime = 0;     // unselected tiles sit on frame one
        }
        continue;
      }

      if (!(el instanceof HTMLImageElement)) continue;
      el.style.left = live ? "0px" : "-9999px";
      el.style.top = live ? "0px" : "-9999px";
      el.style.opacity = live ? "0.01" : "0";
    }
  }, [liveImage, sources, menu?.backgroundVideo]);

  // Tear everything down when the screen itself goes away.
  useEffect(() => {
    const store = mediaRef.current;
    return () => {
      for (const el of store.values()) {
        if (el instanceof HTMLVideoElement) {
          el.pause(); el.removeAttribute("src"); el.load();
        } else if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }
      store.clear();
    };
  }, []);

  const lastDraw = useRef(0);

  useFrame(({ clock }) => {
    // Refresh cap. Everything below - the video blit included - is skipped
    // between ticks, so this gates the canvas work AND the texture upload.
    const now = clock.elapsedTime;
    if (now - lastDraw.current < 1 / SCREEN_FPS) return;
    lastDraw.current = now;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Background media is painted in DEVICE pixels so it fills the whole
    // texture; the UI below switches to logical units.
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Paint background media (if any) into the canvas as a `cover`ing fill so
    // it fills the tube rather than letterboxing — the menu overlay will
    // cover the edge crop.
    /*
     * Pick the source by what the screen ASKED for, not by whatever happens to
     * be loaded. Every source is resident, so a rule like "video if ready,
     * else image" would keep handing back the attract video while the buttons
     * screen was asking for its own - and its background would never draw.
     *
     * The still is a fallback UNDER the requested video, not an alternative to
     * it: if the video has not decoded a frame yet, a matching poster keeps
     * the tube from flashing black on the switch.
     */
    /*
     * The hover lift, done to the PICTURE rather than to anything in the
     * scene.
     *
     * It has to be a SCREEN blend, and that is the whole point. The obvious
     * moves both fail on this image: multiplying the frame by a brighter
     * colour leaves black at black - and the title card is mostly black, so
     * nothing visible happens - while adding a flat value blows the wordmark
     * out to a flat white smear. Screen does neither: result = 1-(1-dst)(1-k)
     * lifts a black pixel by the full k, lifts a white one by nothing, and
     * cannot clip. The dark tube gets visibly brighter and the art still
     * reads.
     *
     * Applied in DEVICE pixels, after the UI is drawn, so the whole frame -
     * background video, plates, tiles - lifts together. And it only touches
     * the canvas: the spot this tube throws into the room is a light of its
     * own and is not driven by these pixels, so it does not move.
     */
    const hoverLift = () => {
      if (!litRef.current) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(255,255,255,${SCREEN_HOVER_LIFT})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = prev;
    };

    const pick = (u?: string): [CanvasImageSource, number, number] | null => {
      if (!u) return null;
      const el = mediaRef.current.get(u);
      if (!el) return null;
      if (el instanceof HTMLVideoElement) {
        return el.readyState >= 2 && el.videoWidth ? [el, el.videoWidth, el.videoHeight] : null;
      }
      return el.complete && el.naturalWidth ? [el, el.naturalWidth, el.naturalHeight] : null;
    };
    const chosen = menu
      ? (pick(menu.backgroundVideo) ?? pick(menu.backgroundImage))
      : pick(url);
    const wants = menu ? !!(menu.backgroundVideo || menu.backgroundImage) : !!url;
    const src: CanvasImageSource | null = chosen ? chosen[0] : null;
    const sw = chosen ? chosen[1] : 0;
    const sh = chosen ? chosen[2] : 0;

    if (menu) {
      /*
       * Background first, UI on top.
       *
       * The video wins when the menu asks for one - that is the attract screen
       * the tube plays until it is clicked. The still is the menu's own
       * backdrop: a moving picture behind the plates fights them for
       * attention, and the plates are what you are meant to be reading once
       * you are in. Whichever is chosen is drawn COVER-fit by default, so it
       * fills the tube and the crop falls off the edges rather than
       * letterboxing - see `backgroundFit` for when that is the wrong call.
       */
      if (wants && src) {
        const contain = menu.backgroundFit === "contain";
        const k = contain
          ? Math.min(canvas.width / sw, canvas.height / sh)
          : Math.max(canvas.width / sw, canvas.height / sh);
        const w = sw * k;
        const h = sh * k;
        // Contain leaves bars, and they have to be painted: the canvas still
        // holds the previous frame, so an unpainted margin keeps whatever was
        // there before - on the attract loop, a smear of the last frame.
        if (contain) {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(src, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      } else if (wants) {
        // Not decoded yet - clear so we don't hold the last frame of whatever
        // was on the tube before.
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      // hideUi: background only. This is the first screen - the video plays
      // with nothing drawn over it, and the plates arrive on the click.
      if (!menu.hideUi) {
        // Into logical space: the whole HUD is authored against `width` x
        // `height`, whatever the texture is actually sized at.
        ctx.setTransform(SCREEN_SS, 0, 0, SCREEN_SS, 0, 0);
        drawCrtMenu(ctx, width, height, clock.elapsedTime, menu, (u) => {
          const el = mediaRef.current.get(u);
          if (!el) return null;
          if (el instanceof HTMLVideoElement) return el.readyState >= 2 ? el : null;
          return el.complete && el.naturalWidth ? el : null;
        });
      }
      hoverLift();
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
    hoverLift();
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
  /** Throw real shadows from this tube: whatever stands in the cone gets its
   *  silhouette laid out behind it. One depth pass - a spot's shadow is a
   *  single frustum, not a point light's six faces - but it is still a whole
   *  extra render of the casters each frame, so it is off unless asked for. */
  castShadow?: boolean;
  /** Hook to shape that shadow map. The scene owns the quality settings (they
   *  are shared with the camp's lamps), and CampProps cannot import them back
   *  without a cycle, so the caller reaches in here instead. */
  tuneShadow?: (light: THREE.SpotLight) => void;
}

export function RetroCrtTv({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  screen = {},
  seed = 0,
  light: lightCfg = {},
  onScreenClick,
  onScreenHover,
  hot = false,
}: {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  screen?: CrtScreen;
  seed?: number;
  light?: CrtLightConfig;
  /** Fired as the pointer moves across the picture, with the UV under it, and
   *  null when it leaves. Lets the caller light whatever is under it. */
  onScreenHover?: (uv: { x: number; y: number } | null) => void;
  /** Fired when the picture itself is clicked, not the chassis, with the UV
   *  of the hit so the caller can work out what was under the pointer.
   *  Null when three didn't hand us one (no uv attribute on the hit). */
  onScreenClick?: (uv: { x: number; y: number } | null) => void;
  /** True while clicking this tube does something - i.e. while it is still a
   *  prop rather than a screen you are already inside. The picture lifts
   *  under the pointer while it is set, the way the chassis does. */
  hot?: boolean;
}) {
  const [glassHot, setGlassHot] = useState(false);
  // `hot` drops its onPointerOver/Out handlers below rather than just
  // ignoring them (see the JSX), so a pointer sitting on the glass at the
  // exact moment `hot` goes false (clicking in) leaves glassHot stuck true -
  // nothing is left to ever clear it. Harmless while hot stays false, since
  // the picture's hover lift is gated on `hot &&` below too - but the
  // moment the CRT is exited and `hot` comes back true, the stale flag lit
  // the screen again with no real hover behind it. Same fix SelectableInner
  // already uses for the chassis's own (separate) hover state.
  useEffect(() => { if (!hot) setGlassHot(false); }, [hot]);
  const tint = screen.tint ?? "#8be8ff";
  const lightColor = lightCfg.color ?? tint;
  const castShadow = lightCfg.castShadow ?? false;
  const tuneShadow = lightCfg.tuneShadow;
  const glow = screen.glow ?? 1;

  const { scene: gltfScene } = useGLTF(LITTLE_TV_URL);
  const chassis = useMemo(() => {
    const cloned = gltfScene.clone(true);
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        // Hide the model's flat screen mesh so our animated overlay isn't
        // fighting it for the same pixels - and take it out of the raycast
        // too. three's Raycaster tests LAYERS ONLY: `intersect()` in
        // Raycaster.js never looks at `visible`, so an invisible mesh still
        // registers hits. Left in, this one sits right where the picture plane
        // does and can win the depth sort, which hands the click to the
        // <Selectable> wrapper instead of to the screen.
        if (m.name.toLowerCase().includes("screen")) {
          m.visible = false;
          m.raycast = () => null;
        }
      }
    });
    return cloned;
  }, [gltfScene]);

  const gifTex = useScreenTexture(screen.content, screen.menu, 256, 192, hot && glassHot);
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

  // Shadow on, and shaped in the same breath - see the spotLight below for
  // why the two cannot be separated. No dep array: the quality knobs live in
  // the caller's config and change under a slider, and re-applying them is a
  // handful of property writes.
  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.castShadow = castShadow;
    if (castShadow) tuneShadow?.(light);
  });

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
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      scale={scale}
      name="crt"
      /*
       * Hover for the WHOLE tube, cabinet and glass together, rather than per
       * mesh. Point at any part of it and the picture lifts here while the
       * <Selectable> wrapping this group lights the chassis off the same
       * pointerover - one object, one highlight.
       */
      onPointerOver={hot ? () => setGlassHot(true) : undefined}
      onPointerOut={hot ? () => setGlassHot(false) : undefined}
    >
      <primitive object={chassis} />
      {/* the picture — unlit, so scene lighting can never dim it */}
      <mesh
        position={SCREEN_CENTER}
        // Deliberately NOT stopping propagation: the click has to keep
        // bubbling to the Selectable wrapper, which is what selects the tube
        // in the lab. That handler stops it, so nothing behind is hit either.
        onClick={onScreenClick ? (e) => onScreenClick(e.uv ? { x: e.uv.x, y: e.uv.y } : null) : undefined}
        /*
         * Deliberately NOT stopping propagation, and this one is subtle.
         *
         * r3f derives onPointerOver from the MOVE pass: for each hit it walks
         * up the parent chain, and a handler that stops propagation `break`s
         * that walk (events-*.js, "Event bubbling may be interrupted by
         * stopPropagation"). This handler is the deepest one on the tube, so
         * stopping here meant no ancestor ever saw the move - the <Selectable>
         * around the tube never got its pointerover, and the chassis stayed
         * dark the moment the pointer crossed onto the glass. Worse, the move
         * pass had already un-hovered it, so pointing at the screen actively
         * TURNED OFF the highlight.
         */
        onPointerMove={onScreenHover
          ? (e) => { onScreenHover(e.uv ? { x: e.uv.x, y: e.uv.y } : null); }
          : undefined}
        // Leaving the GLASS specifically drops the menu's own hover state -
        // the plate under the pointer stops being lit. The tube's glow is a
        // separate thing, handled on the group above.
        onPointerOut={onScreenHover ? () => onScreenHover(null) : undefined}
      >
        <planeGeometry args={SCREEN_SIZE} />
        <meshBasicMaterial
          map={hasPicture ? gifTex : undefined}
          /*
           * The picture is UNLIT, so the emissive lift every other prop wears
           * cannot touch it - a MeshBasicMaterial has no `emissive` at all.
           * Its colour multiplies the texture instead, so the lift is a colour
           * a little past white.
           *
           * A THREE.Color rather than a hex string, and that is the whole
           * trick: a string goes through setStyle, which is sRGB-decoded and
           * can never exceed white. A Color is copied verbatim, so 1.5 stays
           * 1.5 and the picture reads about a fifth brighter once the frame is
           * encoded back to sRGB. `toneMapped` is already false here, so
           * nothing pulls it back down again.
           *
           * Note what this does NOT do: it scales the FRAME, so black stays
           * black and the bright parts carry the lift. Adding light instead -
           * a sheet over the glass - would raise the menu's black background
           * too, and that reads as the tube throwing more light rather than as
           * the picture answering the pointer.
           */
          color={hasPicture ? SCREEN_PLAIN : tint}
          toneMapped={false}
        />
      </mesh>
      {/*
        Scanlines just in front of the picture.

        `raycast` is disabled, and that is what makes the screen clickable at
        all. This plane sits 2 mm PROUD of the picture, so it is always the
        nearer hit. It carries no handler of its own, so r3f resolves it to the
        nearest ancestor that does - the <Selectable> wrapping the whole tube -
        whose onClick calls stopPropagation to keep the lab from selecting
        whatever is behind it. In r3f's event loop that sets `stopped` and
        `break`s out of the intersection list (events-*.js: "Event bubbling may
        be interrupted by stopPropagation"), so the picture plane behind it was
        never reached and onScreenClick never fired. The overlay is pure
        decoration; taking it out of the raycast costs nothing and hands every
        click on the glass to the picture.
      */}
      <mesh
        raycast={() => null}
        position={[SCREEN_CENTER[0], SCREEN_CENTER[1], SCREEN_CENTER[2] + 0.002]}
      >
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
      {/*
        Forward-firing spot: only lights what's IN FRONT of the screen.

        castShadow is set imperatively rather than as a prop because the map
        has to be shaped in the same breath - near/far especially. A spot's
        shadow camera defaults to near 0.5, and everything this tube lights is
        closer than that, so switched on without tuning it produces a perfectly
        correct shadow map of nothing at all.
      */}
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
