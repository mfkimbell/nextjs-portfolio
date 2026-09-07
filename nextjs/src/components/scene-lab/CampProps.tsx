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
function useScreenTexture(url: string | undefined, width = 256, height = 192) {
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

  useEffect(() => {
    if (!url) return;

    if (SCREEN_VIDEO_RE.test(url)) {
      const vid = document.createElement("video");
      vid.src = url;
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
    img.src = url;
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
  }, [url]);

  useFrame(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const vid = vidRef.current;
    const img = imgRef.current;
    let src: CanvasImageSource | null = null;
    let sw = 0;
    let sh = 0;
    // readyState >= 2 is HAVE_CURRENT_DATA: there is a frame to draw.
    if (vid && vid.readyState >= 2 && vid.videoWidth) {
      src = vid; sw = vid.videoWidth; sh = vid.videoHeight;
    } else if (img && img.complete && img.naturalWidth) {
      src = img; sw = img.naturalWidth; sh = img.naturalHeight;
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
}

export function RetroCrtTv({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  screen = {},
  seed = 0,
  light: lightCfg = {},
}: {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  screen?: CrtScreen;
  seed?: number;
  light?: CrtLightConfig;
}) {
  const tint = screen.tint ?? "#8be8ff";
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

  const gifTex = useScreenTexture(screen.content);
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

  const lightX = SCREEN_CENTER[0] + offsetX;
  const lightY = SCREEN_CENTER[1] + offsetY;
  const lightZ = SCREEN_CENTER[2] + forwardOffset;

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale} name="crt">
      <primitive object={chassis} />
      {/* the picture — unlit, so scene lighting can never dim it */}
      <mesh position={SCREEN_CENTER}>
        <planeGeometry args={SCREEN_SIZE} />
        <meshBasicMaterial
          map={screen.content ? gifTex : undefined}
          color={screen.content ? "#ffffff" : tint}
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
        color={tint}
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
