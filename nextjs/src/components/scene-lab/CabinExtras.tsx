"use client";

/*
 * Scene 3 ("Cabin") set dressing that lives in the cabin's location frame:
 *
 *   CabinMoon - a giant moon rising behind the cabin roof, placed relative to
 *               scene 3's saved camera so it stays behind the cabin if that
 *               shot is reframed.
 *   CabinCat  - one of the white cats on the bear's table, playing its baked
 *               loop (public/Cat/cat_sit.glb, cat_sleep.glb; built in Blender
 *               from public/Cat/Cat.fbx - the sleeper is a custom pose: on
 *               its side, back rounded, head resting inside the curl with the
 *               paws tucked under the chin, tail wrapped round, eyes shut, with
 *               a slow breathing loop. Both carry cat_orange_texture.png, the
 *               model's own atlas with the white fur recoloured ginger).
 */

import { idlePreload } from "@/lib/idlePreload";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Billboard, useGLTF } from "@react-three/drei";
import { LETTER_WIDTHS } from "@/components/scene-lab/CampsiteTitleIntro";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { catScratch, createPurr, type Purr } from "@/lib/catSounds";

// ?v= so browsers drop the old white-cat files they cached
export const CAT_SIT_URL = "/Cat/cat_sit.glb?v=8";
export const CAT_SLEEP_URL = "/Cat/cat_sleep.glb?v=8";
/** Both porch cats now stand (the cat rig's standing idle, cat_stand.glb). */
export const CAT_STAND_URL = "/Cat/cat_stand.glb?v=3";
/** The cat's texture atlas with the fur left white, every UV island's colour
 *  bled outward over the empty space (so seams never pick up black), for
 *  recolouring live - see paintCat. */
const CAT_BASE_TEXTURE_URL = "/Cat/cat_base_texture.png?v=1";

export type CatColors = {
  /** Fur colour, sRGB 0..1. */
  fur: [number, number, number];
  /** Tabby stripe colour, sRGB 0..1. */
  stripe: [number, number, number];
  /** Stripe strength, 0 = solid fur. */
  stripes: number;
  /** White markings (nose blaze, muzzle, chin and chest bib), 0 = none. */
  white?: number;
  /** How big the markings are, 0..1 (0.5 = as designed). */
  whiteSize?: number;
  /** Edge of the markings, 0 = soft blend - 1 = a crisp line. */
  whiteEdge?: number;
  /** Recolour the model's green ring round each eye to match the painted iris (sRGB). */
  eyeRing?: [number, number, number];
};

type CatBase = { N: number; rgb: Uint8ClampedArray; w: Float32Array; v: Float32Array; band: Float32Array; white: Float32Array };
/** Where the white markings go, in the atlas (baked from the model in 3D:
 *  a blaze up the nose between the eyes, the muzzle and chin, throat and chest). */
const CAT_WHITE_MASK_URL = "/Cat/cat_white_mask.png?v=2";
function loadGray(url: string, N: number): Promise<Float32Array> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = N;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0, N, N);
      const d = g.getImageData(0, 0, N, N).data;
      const out = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) out[i] = d[i * 4] / 255;
      resolve(out);
    };
    img.onerror = () => resolve(new Float32Array(N * N));   // no mask = no markings
    img.src = url;
  });
}
let catBasePromise: Promise<CatBase> | null = null;
/** Read the white atlas once and precompute, per pixel, how much of it is fur
 *  (unsaturated and light - pink paws, nose and eyes keep their colour), its
 *  baked shading and a soft tabby stripe pattern across the body islands. */
function loadCatBase(): Promise<CatBase> {
  if (catBasePromise) return catBasePromise;
  catBasePromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const N = img.width;
      const c = document.createElement("canvas");
      c.width = c.height = N;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const rgb = g.getImageData(0, 0, N, N).data;
      const w = new Float32Array(N * N), v = new Float32Array(N * N), band = new Float32Array(N * N);
      const sx = 2048 / N; // the stripe pattern was tuned on the 2048 atlas
      for (let y = 0; y < N; y++) {
        const yy = y * sx;
        const wob = Math.sin(yy / 61 + 1.3) * 9 + Math.sin(yy / 23) * 4;
        for (let x = 0; x < N; x++) {
          const i = y * N + x, o = i * 4;
          const r = rgb[o] / 255, gg = rgb[o + 1] / 255, b = rgb[o + 2] / 255;
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          const s = mx > 1e-4 ? (mx - mn) / mx : 0;
          w[i] = Math.min(1, Math.max(0, (0.22 - s) / 0.12)) * Math.min(1, Math.max(0, (mx - 0.35) / 0.3));
          v[i] = mx;
          const st = 0.5 + 0.5 * Math.sin((x * sx + wob) / 26);
          band[i] = Math.pow(Math.min(1, Math.max(0, (st - 0.55) / 0.45)), 1.5);
        }
      }
      loadGray(CAT_WHITE_MASK_URL, N).then((white) => resolve({ N, rgb, w, v, band, white }));
    };
    img.onerror = reject;
    img.src = CAT_BASE_TEXTURE_URL;
  });
  return catBasePromise;
}

/** The atlas with the fur painted in `colors`, as a texture for the cat. */
function paintCat(base: CatBase, colors: CatColors) {
  const { N, rgb, w, v, band, white } = base;
  const wk = Math.max(0, Math.min(2, colors.white ?? 0));
  // the mask is a wide smooth field: threshold it for a crisp marking edge
  const th = 1 - Math.max(0.02, Math.min(0.98, colors.whiteSize ?? 0.5));
  const hw = 0.004 + (1 - Math.max(0, Math.min(1, colors.whiteEdge ?? 0.9))) * 0.22;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const out = g.createImageData(N, N);
  const d = out.data;
  const [fr, fg, fb] = colors.fur, [sr, sg, sb] = colors.stripe;
  const k = Math.max(0, Math.min(1.5, colors.stripes));
  for (let i = 0; i < N * N; i++) {
    const o = i * 4, wi = w[i];
    const t = Math.min(1, band[i] * k);
    const shade = 0.55 + 0.45 * v[i];
    let r = (fr + (sr - fr) * t) * shade * 255, gg = (fg + (sg - fg) * t) * shade * 255, b = (fb + (sb - fb) * t) * shade * 255;
    const mv = white[i];
    const tt = Math.min(1, Math.max(0, (mv - (th - hw)) / (2 * hw)));
    const m = Math.min(1, tt * tt * (3 - 2 * tt) * wk);
    if (m > 0) {             // bright clean white, barely shaded, no stripes through it
      const ws = (0.93 + 0.07 * v[i]) * 255;
      r += (0.98 * ws - r) * m; gg += (0.96 * ws - gg) * m; b += (0.92 * ws - b) * m;
    }
    // the model's green eye ring, recoloured to the iris (its own shading kept)
    if (colors.eyeRing) {
      const R0 = rgb[o], G0 = rgb[o + 1], B0 = rgb[o + 2];
      const mxc = Math.max(R0, G0, B0), mnc = Math.min(R0, G0, B0);
      if (G0 > R0 * 1.05 && G0 > B0 * 1.05 && mxc > 0 && (mxc - mnc) / mxc > 0.25) {
        const lv = (mxc / 255) * 1.15;
        d[o] = Math.min(255, colors.eyeRing[0] * lv * 255);
        d[o + 1] = Math.min(255, colors.eyeRing[1] * lv * 255);
        d[o + 2] = Math.min(255, colors.eyeRing[2] * lv * 255);
        d[o + 3] = 255;
        continue;
      }
    }
    // the white markings push through soft fur edges, but never over the
    // pink nose leather (where the atlas says "not fur" outright)
    const wf = Math.max(wi, m * Math.min(1, wi * 3));
    d[o] = rgb[o] + (r - rgb[o]) * wf;
    d[o + 1] = rgb[o + 1] + (gg - rgb[o + 1]) * wf;
    d[o + 2] = rgb[o + 2] + (b - rgb[o + 2]) * wf;
    d[o + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;            // glTF UVs
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ moon */

/** A tiny seeded PRNG so the craters land in the same places every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** What the moon's face is painted with. 0s give a plain solid disc. */
export type MoonSurface = {
  /** Master strength of all surface detail, 0 = solid colour. */
  texture: number;
  /** Number of craters. */
  craters: number;
  /** Crater size multiplier. */
  craterSize: number;
  /** Strength of the big soft grey "seas". */
  maria: number;
  /** Darkening towards the rim, 0 = flat disc. */
  limb: number;
  /** Changes the crater layout. */
  seed: number;
};

/** Smooth value noise on a wrapping lattice, for the seas and the grain. */
function makeNoise(rand: () => number, size = 64) {
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (x: number, y: number) => g[((y % size) + size) % size * size + (((x % size) + size) % size)];
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function moonPixels(m: MoonSurface, N: number) {
  const k = Math.max(0, m.texture);
  const rand = rng(Math.round(m.seed) * 7919 + 13);
  const noise = makeNoise(rand);
  const fbm = (x: number, y: number, oct: number) => {
    let v = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      v += amp * noise(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03;
      const t = x * 0.8 - y * 0.6; y = x * 0.6 + y * 0.8 + 3.1; x = t + 1.7; // turn each octave: no grid
    }
    return v / norm;
  };
  const val = new Float32Array(N * N).fill(1);
  const r = N / 2;
  const ox = rand() * 50, oy = rand() * 50;
  if (k > 0) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = (x + 0.5 - r) / r, ny = (y + 0.5 - r) / r;
      if (nx * nx + ny * ny > 1.02) continue;
      // seas: big low-frequency dark shapes with soft edges
      const f = fbm(nx * 2.2 + ox, ny * 2.2 + oy, 4);
      const sea = Math.min(1, Math.max(0, (f - 0.48) / 0.16));
      // grain: fine mottling everywhere
      const grain = fbm(nx * 22 + oy, ny * 22 + ox, 3) - 0.5;
      val[y * N + x] = 1 - Math.min(0.62, sea * sea * (3 - 2 * sea) * 0.42 * m.maria * k) - grain * 0.22 * k;
    }
    // craters: a shaded bowl lit from the upper left, a bright rim, faint ejecta
    const L = [-0.7071, -0.7071];
    const count = Math.round(m.craters);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 0.95;
      const cx = r + Math.cos(a) * rr * r, cy = r + Math.sin(a) * rr * r;
      const cr = (N / 512) * (2.5 + Math.pow(rand(), 3.2) * 34) * Math.max(0.05, m.craterSize);
      const reach = cr * 1.6;
      const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(N - 1, Math.ceil(cx + reach));
      const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(N - 1, Math.ceil(cy + reach));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const d = dist / cr;
        if (d > 1.6) continue;
        const ux = dist > 1e-6 ? dx / dist : 0, uy = dist > 1e-6 ? dy / dist : 0;
        const facing = ux * L[0] + uy * L[1]; // +1 = toward the light
        let dv = 0;
        if (d < 1) {
          // floor darker; the wall facing away from the light catches it
          dv -= 0.16 * (1 - d * d);
          dv += -facing * 0.2 * Math.pow(d, 1.5);
        } else if (d < 1.22) {
          const t = 1 - Math.abs(d - 1.08) / 0.14;
          dv += Math.max(0, t) * (0.1 + 0.1 * facing);
        } else {
          dv += 0.03 * (1.6 - d) / 0.38; // ejecta
        }
        val[y * N + x] += dv * k;
      }
    }
  }
  const out = new Uint8ClampedArray(N * N * 4);
  const limb = Math.max(0, Math.min(1, m.limb));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const nx = (x + 0.5 - r) / r, ny = (y + 0.5 - r) / r;
    const q = Math.sqrt(nx * nx + ny * ny);
    const i = y * N + x;
    const v = Math.max(0, Math.min(1, val[i] * (1 - limb * 0.75 * Math.pow(Math.min(1, q), 2.5))));
    const c = Math.round(255 * v);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = c;
    out[i * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, (1 - q) * r / 1.5)));
  }
  return out;
}

/** The moon's face, in greys on white (tinted later by the material colour),
 *  transparent outside the circle: dark seas, grain, and craters shaded as
 *  bowls lit from the upper left with a bright rim. texture = 0 gives a plain
 *  disc. Generated per pixel; previewed offline while it was tuned. */
function makeMoonTexture(m: MoonSurface) {
  const N = 512;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  img.data.set(moonPixels(m, N));
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/*
 * The bloom: a camera-facing quad behind the disc, drawn additively. Inside
 * the moon's edge it is full strength (hidden by the disc anyway); past the
 * edge it falls to nothing at the quad's rim along (1 - t)^softness.
 */
const HALO_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const HALO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uEdge;      // moon radius / halo radius
  uniform float uSoftness;  // falloff exponent
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d >= 1.0) discard;
    float t = clamp((d - uEdge) / max(1e-4, 1.0 - uEdge), 0.0, 1.0);
    float a = uStrength * pow(1.0 - t, uSoftness);
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

export type CabinMoonProps = {
  /** Scene 3's camera, in the cabin's location frame. */
  view: { cx: number; cy: number; cz: number; tx: number; ty: number; tz: number };
  /** Degrees left of the shot's centre line (negative = right). */
  leftDeg: number;
  /** Degrees above the shot's centre line. */
  upDeg: number;
  /** How far out it sits. Far enough not to slide about as the camera moves. */
  distance: number;
  /** Its size on screen, in degrees across. */
  sizeDeg: number;
  /** Disc colour (white by default) and brightness multiplier. */
  color: [number, number, number];
  brightness: number;
  surface: MoonSurface;
  /** Bloom: strength (0 = none), how far it reaches (x the moon's radius),
   *  softness (higher = tighter to the rim, lower = hazier) and colour. */
  bloom: number;
  bloomSize: number;
  bloomSoftness: number;
  bloomColor: [number, number, number];
};

export function CabinMoon({
  view, leftDeg, upDeg, distance, sizeDeg, color, brightness, surface, bloom, bloomSize, bloomSoftness, bloomColor,
}: CabinMoonProps) {
  // Regenerated when a surface slider changes - after a short pause, since a
  // busy 512px surface takes a few hundred ms and a slider fires every step.
  const [moonTex, setMoonTex] = useState<THREE.CanvasTexture | null>(null);
  const surfaceKey = [surface.texture, surface.craters, surface.craterSize, surface.maria, surface.limb, surface.seed].join("|");
  const firstTex = useRef(true);
  useEffect(() => {
    if (typeof document === "undefined") return;
    let made: THREE.CanvasTexture | null = null;
    const build = () => {
      made = makeMoonTexture(surface);
      setMoonTex((prev) => { prev?.dispose(); return made; });
    };
    if (firstTex.current) { firstTex.current = false; build(); return; }
    const id = window.setTimeout(build, 140);
    return () => window.clearTimeout(id);
  }, [surfaceKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { setMoonTex((prev) => { prev?.dispose(); return null; }); }, []);

  const haloUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(1, 1, 1) },
    uStrength: { value: 0.6 },
    uEdge: { value: 0.35 },
    uSoftness: { value: 2 },
  }), []);
  const haloScale = Math.max(1.05, bloomSize);
  haloUniforms.uColor.value.setRGB(bloomColor[0], bloomColor[1], bloomColor[2]);
  haloUniforms.uStrength.value = Math.max(0, bloom);
  haloUniforms.uEdge.value = 1 / haloScale;
  haloUniforms.uSoftness.value = Math.max(0.1, bloomSoftness);

  const { position, quaternion, radius, back } = useMemo(() => {
    const cam = new THREE.Vector3(view.cx, view.cy, view.cz);
    const fwd = new THREE.Vector3(view.tx, view.ty, view.tz).sub(cam).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const d = fwd.clone()
      .addScaledVector(right, Math.tan(THREE.MathUtils.degToRad(-leftDeg)))
      .addScaledVector(up, Math.tan(THREE.MathUtils.degToRad(upDeg)))
      .normalize();
    const dist = Math.max(5, distance);
    const p = cam.clone().addScaledVector(d, dist);
    // face the camera: the plane's +Z points back at it
    const m = new THREE.Matrix4().lookAt(cam, p, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    return {
      position: p,
      quaternion: q,
      radius: dist * Math.tan(THREE.MathUtils.degToRad(Math.max(0.5, sizeDeg) / 2)),
      // the bloom sits a little behind the disc so the disc hides its middle
      back: d.clone().multiplyScalar(dist * 0.02),
    };
  }, [view.cx, view.cy, view.cz, view.tx, view.ty, view.tz, leftDeg, upDeg, distance, sizeDeg]);

  const moonColor = useMemo(
    () => new THREE.Color(color[0], color[1], color[2]).multiplyScalar(Math.max(0, brightness)),
    [color[0], color[1], color[2], brightness], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!moonTex) return null;
  return (
    <group>
      <mesh position={position} quaternion={quaternion} scale={radius * 2} renderOrder={-2}>
        <planeGeometry args={[1, 1]} />
        {/* alphaTest, not blending: the disc writes depth only inside the
            circle, so it hides stars and the bloom behind it without cutting
            a square out of the glow. */}
        <meshBasicMaterial key={moonTex.uuid} map={moonTex} color={moonColor} alphaTest={0.5} fog={false} toneMapped={false} />
      </mesh>
      {bloom > 0.001 ? (
        <mesh position={position.clone().add(back)} quaternion={quaternion} scale={radius * 2 * haloScale} renderOrder={-3}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            vertexShader={HALO_VERT}
            fragmentShader={HALO_FRAG}
            uniforms={haloUniforms}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}

/* ------------------------------------------------------------------ cats */

/**
 * Set while a cat is being petted. The lab's orbit camera reads it and holds
 * still, so rubbing a cat does not also spin the view (OrbitControls hears
 * the pointer before the scene does, so it cannot simply be stopped).
 */
export const catPetLock = { active: false };
/** When any porch cat last took a click - so a click on ONE cat isn't read by
 *  the OTHER as "clicked somewhere else, leave the close-up". */
const catClick = { at: -1 };

const PET_CURSOR = "url('/cursors/pet_hand.svg') 15 16, grab";
/** The site's ordinary "this does something" pointer, before the close-up. */
const ZOOM_CURSOR = "pointer";
const PET_CURSOR_SCRATCH = "url('/cursors/pet_hand_scratch.svg') 15 16, grabbing";

function makeHeartTexture() {
  const N = 96;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.translate(N / 2, N / 2 + 6);
  g.beginPath();
  g.moveTo(0, 26);
  g.bezierCurveTo(-34, 2, -30, -30, 0, -14);
  g.bezierCurveTo(30, -30, 34, 2, 0, 26);
  g.closePath();
  g.fillStyle = "#ff7aa8";
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = "#7a1f3d";
  g.stroke();
  g.beginPath();
  g.ellipse(-11, -8, 6, 4, -0.6, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The eye catchlights: two small dots drawn on a clear sheet over each pupil
 *  (part of the model, so they close behind the eyelid). Positions are 0..1
 *  across the pupil, x to the viewer's right, y up. */
export type CatGlint = {
  left: [number, number];
  right: [number, number];
  size: number;          // main dot radius, fraction of the pupil
  second: number;        // second dot size vs the main one, 0 = none
  secondOffset: [number, number];
  brightness: number;
  roundness: number;     // 1 = circle, lower = flatter oval
  softness: number;      // 0 = crisp edge, 1 = very soft
  /** a painted iris filling the eye (colour, pupil, lighting) - see makeGlintMaterial */
  iris?: CatIris;
};

/** The painted eye: a lit, coloured iris with a dark pupil, under the glints. */
export type CatIris = {
  on: number;                       // 0/1
  inner: [number, number, number];  // colour round the pupil (sRGB 0..1)
  outer: [number, number, number];  // colour at the rim
  size: number;                     // iris radius, fraction of the eye (0.5 fills it)
  offset: [number, number];         // nudge the iris within the eye
  pupilW: number;                   // pupil width / height, fraction of the iris
  pupilH: number;
  ring: number;                     // dark rim round the iris, 0..1
  shade: number;                    // the top darkened by the eyelid's shadow, 0..1
  glow: number;                     // bright, lit lower half (light passing through), 0..1
  brightness: number;               // overall
  trackX: number;                   // how far the pupil slides toward the cursor, side to side (negative flips)
  trackY: number;                   // ... and up / down
  pupilSoft: number;                // pupil edge, 0 crisp - 1 soft
};
// The original look: a big black pupil filling most of the eye inside the
// model's olive ring - but now the black part SLIDES toward the cursor.
export const IRIS_DEFAULTS: CatIris = {
  on: 1, inner: [0.65, 0.76, 0.37], outer: [0.65, 0.76, 0.37], size: 0.6, offset: [0, 0],
  pupilW: 0.72, pupilH: 0.72, ring: 0, shade: 0, glow: 0, brightness: 1,
  trackX: 0.3, trackY: 0.25, pupilSoft: 0.06,
};

const GLINT_DEFAULTS: CatGlint = {
  left: [0.34, 0.7], right: [0.34, 0.7], size: 0.13, second: 0.45, secondOffset: [0.17, -0.15],
  brightness: 1, roundness: 1, softness: 0.25,
};

function makeGlintMaterial() {
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;
  // lit (standard) so the eye sits in the scene's light like the rest of the
  // cat - an unlit iris glowed in the dark. The glint dots are added as
  // emission, so they still sparkle.
  const mat = new THREE.MeshStandardMaterial({ map: white, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0 });
  const u = {
    uLeft: { value: new THREE.Vector2(...GLINT_DEFAULTS.left) },
    uRight: { value: new THREE.Vector2(...GLINT_DEFAULTS.right) },
    uSize: { value: GLINT_DEFAULTS.size },
    uSecond: { value: GLINT_DEFAULTS.second },
    uSecondOffset: { value: new THREE.Vector2(...GLINT_DEFAULTS.secondOffset) },
    uBright: { value: 1 },
    uRound: { value: 1 },
    uSoft: { value: 0.25 },
    uShut: { value: 0 },   // the eyelid's eye_close weight - fully shut hides the dots
    uIrisOn: { value: 1 },
    uIrisIn: { value: new THREE.Color() },
    uIrisOut: { value: new THREE.Color() },
    uIrisR: { value: 0.5 },
    uIrisOff: { value: new THREE.Vector2() },
    uPupil: { value: new THREE.Vector2(0.42, 0.62) },
    uRing: { value: 0.55 },
    uShade: { value: 0.4 },
    uGlow: { value: 0.45 },
    uIrisBright: { value: 1 },
    uPupilOff: { value: new THREE.Vector2() },   // pupil looking toward the cursor
    uPupilSoft: { value: 0.14 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", `uniform vec2 uLeft; uniform vec2 uRight; uniform float uSize; uniform float uSecond;
uniform vec2 uSecondOffset; uniform float uBright; uniform float uRound; uniform float uSoft; uniform float uShut;
uniform float uIrisOn; uniform vec3 uIrisIn; uniform vec3 uIrisOut; uniform float uIrisR; uniform vec2 uIrisOff;
uniform vec2 uPupil; uniform float uRing; uniform float uShade; uniform float uGlow; uniform float uIrisBright;
uniform vec2 uPupilOff; uniform float uPupilSoft;
float glintDot(vec2 p, vec2 c, float r) {
  if (r <= 0.0) return 0.0;
  vec2 d = p - c; d.y /= max(0.05, uRound);
  float l = length(d);
  return 1.0 - smoothstep(r * (1.0 - uSoft), r, l);
}
void main() {`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(uBright) * glintA;`)
      .replace("#include <map_fragment>", `
  float side = step(1.0001, vMapUv.x);
  vec2 p = vec2(vMapUv.x - side, 1.0 - vMapUv.y);
  vec2 c = mix(uLeft, uRight, side);
  float a = max(glintDot(p, c, uSize), glintDot(p, c + uSecondOffset, uSize * uSecond));
  // the iris: a radial gradient, darker rim, the top shaded by the lid, the
  // lower half lit up (light coming through), and a dark pupil
  vec2 q = p - (vec2(0.5) + uIrisOff);
  float R = max(0.02, uIrisR);
  float r = length(q) / R;
  float irisA = (1.0 - smoothstep(0.93, 1.0, r)) * uIrisOn;
  vec3 col = mix(uIrisIn, uIrisOut, smoothstep(0.15, 1.0, r));
  col *= 1.0 - uRing * smoothstep(0.62, 1.0, r);
  col *= 1.0 - uShade * smoothstep(-0.1, 0.75, q.y / R);
  col += uIrisIn * uGlow * smoothstep(0.05, 0.85, -q.y / R) * (1.0 - smoothstep(0.55, 0.95, r));
  // (the left eye's UVs run mirrored, so its sideways shift is flipped back)
  vec2 po = vec2(uPupilOff.x * (side > 0.5 ? 1.0 : -1.0), uPupilOff.y) * R;
  vec2 pq = q - po;
  float pd = length(vec2(pq.x / max(0.02, uPupil.x), pq.y / max(0.02, uPupil.y))) / R;
  float pupilA = 1.0 - smoothstep(1.0 - max(0.01, uPupilSoft), 1.0, pd);
  col = mix(col * uIrisBright, vec3(0.015, 0.01, 0.01), pupilA);
  float closed = 1.0 - smoothstep(0.8, 0.97, uShut);
  float alpha = max(irisA, a) * closed;
  if (alpha < 0.01) discard;
  diffuseColor = vec4(mix(col, vec3(0.0), a), alpha);
  float glintA = a * closed;
`);
  };
  return { mat, u };
}

type Heart = { sprite: THREE.Sprite; age: number; vx: number; sway: number };

/** How a cat's head follows the cursor (all angles in degrees). */
export type CatGaze = {
  amount: number;
  always: number;
  maxLeft: number;
  maxRight: number;
  maxUp: number;
  maxDown: number;
  yawGain: number;
  pitchGain: number;
  yawOffset: number;
  pitchOffset: number;
  deadzone: number;
  follow: number;
  blend: number;
  neckShare: number;
  tilt: number;
  depth: number;
  overhead: number;
  /** looking down, how much the neck leans forward to help (x the down angle) */
  lean: number;
  /** the most that forward lean can be, degrees */
  leanMax: number;
  /** looking down, how far the neck stretches forward (and a little down), in
   *  the cat model's own units at a full 45 deg look down (the model is ~0.9 tall) */
  reach: number;
  /** how much the NECK bends when looking up (x its share; the head does the rest) */
  neckUp: number;
  /** how much the NECK bends when looking down (x its share and the forward lean) */
  neckDown: number;
  /** share of a SIDEWAYS turn done by the neck (the head swivels the rest) */
  neckTurn: number;
  /** 0..1: keep the head where it is when the neck turns, instead of swinging
   *  round (and back) on the shoulders */
  headPin: number;
  /** cap on how far the neck may slide to do that (model units) - sliding is
   *  what stretches the neck, so keep it small */
  neckSlideMax: number;
  /** 0..1: how much of the head's own turn is handed down the neck's small
   *  bones, so the twist is spread along the neck instead of all at the skull
   *  (all at one joint pinches the neck thin, like a sweet wrapper) */
  twistSpread: number;
  /** leaning in toward what it watches: the neck tips forward this many degrees
   *  when the cursor is out in front of the cat (the head tips back up to keep
   *  looking at it), with a little of the forward stretch */
  leanForward: number;
  /** 0..1: how much a cursor straight out in front sets off the lean-in */
  leanFrontWeight: number;
  /** a direction that ALSO sets off the lean-in (e.g. up and to one side):
   *  its turn (deg, + = the cat's left = your right when it faces you) ... */
  leanZoneYaw: number;
  /** ... its up/down (deg, + = up) ... */
  leanZonePitch: number;
  /** ... and how wide that zone is (deg; 0 = off) */
  leanZoneWidth: number;
};
export const CAT_GAZE_DEFAULTS: CatGaze = {
  amount: 1,
  always: 0,
  maxLeft: 100,
  maxRight: 100,
  maxUp: 60,
  maxDown: 12,
  yawGain: 1,
  pitchGain: 0.7,
  yawOffset: 0,
  pitchOffset: 0,
  deadzone: 2,
  follow: 8,
  blend: 3,
  neckShare: 0.35,
  tilt: 8,
  depth: 0.55,
  overhead: 0.35,
  lean: 1,
  leanMax: 25,
  reach: 0.1,
  neckUp: 0.3,
  neckDown: 1,
  neckTurn: 0.15,
  headPin: 0.6,
  neckSlideMax: 0.02,
  twistSpread: 0.6,
  leanForward: 10,
  leanFrontWeight: 1,
  leanZoneYaw: 55,
  leanZonePitch: 25,
  leanZoneWidth: 50,
};

export type CatShadowTune = {
  /** darkness 0..1 */
  strength: number;
  /** x the natural length (a pretend lower/higher light) */
  length: number;
  /** swing the shadow round the cat, degrees */
  turn: number;
  /** how far from the cat it reaches before fading out, x a cat-height */
  radius: number;
  /** 0 = hard cut at the radius, 1 = fades out from the cat's paws */
  fade: number;
  /** nudge the whole shadow (m, world) */
  shiftX: number;
  shiftZ: number;
  /** squash the shadow sideways (1 = true width) */
  width: number;
};
/** The cat model's rough size in its own units: it stands with its paws and
 *  rump on y = 0 (its origin is the surface it sits on), ~0.45 wide, ~0.9 tall. */
const CAT_FOOTPRINT = new THREE.Vector3(0.55, 0.9, 0.55);

/**
 * The cat's shadow from the monitor's glow, cast onto the surface it sits on
 * (the table, the chair seat) and nothing else.
 *
 * A real shadow map would mean one more shadow-casting light, which pushes
 * the cabin's shaders past the GPU's texture limit and blacks out all of the
 * lighting. Instead each body mesh gets a twin sharing its skeleton (so it
 * moves, purrs and rubs with the cat), whose vertex shader squashes every
 * skinned vertex along the ray from the light onto the plane the cat sits on:
 * the true silhouette, flat on the furniture. It fades out past a radius round
 * the cat so it never hangs off a table edge.
 */
function CatShadow({ model, skip, light, floorY, footprint, tune }: {
  model: THREE.Object3D;
  /** a material whose meshes cast no shadow (the eye-glint sheet) */
  skip: THREE.Material;
  light: React.MutableRefObject<THREE.Light | null>;
  floorY: number;
  footprint: THREE.Vector3;
  tune: CatShadowTune;
}) {
  const anchor = useRef<THREE.Group>(null);
  const u = useMemo(() => ({
    uLight: { value: new THREE.Vector3(0, 10, 0) },
    uPlaneY: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uRadius: { value: 1 },
    uFade: { value: 0.4 },
    uOpacity: { value: 0.5 },
    uShift: { value: new THREE.Vector2() },
    uDir: { value: new THREE.Vector2(1, 0) },
    uWidth: { value: 1 },
  }), []);
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace("void main() {", "uniform vec3 uLight; uniform float uPlaneY; uniform vec2 uCenter; uniform vec2 uShift; uniform vec2 uDir; uniform float uWidth; varying vec3 vShadowW;\nvoid main() {")
        .replace("#include <project_vertex>", `
  vec4 wp = modelMatrix * vec4( transformed, 1.0 );
  // parts of the cat at or above the light's height throw their shadow off
  // toward infinity: cap the throw (the radius fade hides it long before)
  float dy = min(wp.y - uLight.y, -0.002);
  float t = min((uPlaneY - uLight.y) / dy, 60.0);
  vec3 onPlane = uLight + (wp.xyz - uLight) * max(t, 0.0);
  onPlane.y = uPlaneY;
  // squash across the shadow's own direction, then nudge it
  vec2 rel = onPlane.xz - uCenter;
  vec2 side = vec2(-uDir.y, uDir.x);
  rel = uDir * dot(rel, uDir) + side * dot(rel, side) * uWidth;
  onPlane.xz = uCenter + rel + uShift;
  vShadowW = onPlane;
  vec4 mvPosition = viewMatrix * vec4( onPlane, 1.0 );
  gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", "uniform vec2 uCenter; uniform vec2 uShift; uniform float uRadius; uniform float uFade; uniform float uOpacity; varying vec3 vShadowW;\nvoid main() {")
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
  float dc = length(vShadowW.xz - uCenter - uShift);
  gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity * (1.0 - smoothstep(uRadius * (1.0 - clamp(uFade, 0.0, 1.0)) - 1e-4, uRadius, dc)));`);
    };
    return m;
  }, [u]);
  // the shadow twins: same geometry and skeleton as each body mesh
  const twins = useMemo(() => {
    const list: { src: THREE.SkinnedMesh; twin: THREE.SkinnedMesh }[] = [];
    model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || sm.material === skip) return;
      const twin = new THREE.SkinnedMesh(sm.geometry, mat);
      twin.bind(sm.skeleton, sm.bindMatrix);
      twin.frustumCulled = false;
      twin.castShadow = false;
      twin.receiveShadow = false;
      twin.renderOrder = 1;
      twin.raycast = () => {};
      twin.position.copy(sm.position); twin.quaternion.copy(sm.quaternion); twin.scale.copy(sm.scale);
      list.push({ src: sm, twin });
    });
    return list;
  }, [model, skip, mat]);
  useEffect(() => {
    for (const { src, twin } of twins) src.parent?.add(twin);
    return () => { for (const { twin } of twins) twin.parent?.remove(twin); };
  }, [twins]);
  useEffect(() => () => mat.dispose(), [mat]);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), s: new THREE.Vector3() }), []);
  useFrame(() => {
    const L = light.current, a = anchor.current;
    const full = (L?.userData.fullIntensity as number) || 1;
    let lit = L && L.visible ? Math.min(1, L.intensity / full) : 0;
    // weaker the further the cat is from the screen, gone past the light's reach
    const reach = (L as THREE.SpotLight | null)?.distance ?? 0;
    if (L && a && reach > 0) {
      L.getWorldPosition(tmp.v); a.getWorldPosition(tmp.s);
      const d = tmp.v.distanceTo(tmp.s), k = Math.min(1, Math.max(0, (d - reach * 0.35) / (reach * 0.65)));
      lit *= 1 - k * k * (3 - 2 * k);
    }
    const op = Math.max(0, Math.min(1, tune.strength)) * lit;
    for (const { src, twin } of twins) {
      twin.visible = op > 0.005 && src.visible;
      if (src.morphTargetInfluences && twin.morphTargetInfluences) {
        for (let i = 0; i < src.morphTargetInfluences.length; i++) twin.morphTargetInfluences[i] = src.morphTargetInfluences[i];
      }
    }
    if (op <= 0.005 || !L || !a) return;
    u.uOpacity.value = op;
    a.localToWorld(tmp.v.set(0, floorY + 0.004, 0));
    u.uPlaneY.value = tmp.v.y;
    u.uCenter.value.set(tmp.v.x, tmp.v.z);
    // the light the shadow is cast from: the real screen light, swung round
    // the cat by `turn` and lowered (longer) or raised (shorter) by `length`
    L.getWorldPosition(u.uLight.value);
    const lx = u.uLight.value.x - tmp.v.x, lz = u.uLight.value.z - tmp.v.z;
    const tr = THREE.MathUtils.degToRad(tune.turn);
    const rx = lx * Math.cos(tr) - lz * Math.sin(tr), rz = lx * Math.sin(tr) + lz * Math.cos(tr);
    const above = Math.max(0.02, u.uLight.value.y - tmp.v.y) / Math.max(0.05, tune.length);
    u.uLight.value.set(tmp.v.x + rx, tmp.v.y + above, tmp.v.z + rz);
    const dl = Math.hypot(rx, rz) || 1;
    u.uDir.value.set(-rx / dl, -rz / dl);
    u.uWidth.value = Math.max(0.05, tune.width);
    u.uShift.value.set(tune.shiftX, tune.shiftZ);
    u.uFade.value = tune.fade;
    a.getWorldScale(tmp.s);
    // a low screen light throws long shadows: let them run a few cat-heights
    u.uRadius.value = footprint.y * tmp.s.x * Math.max(0.05, tune.radius);
  });
  return <group ref={anchor} />;
}

export type CatSoundLevels = { purr: number; scratch: number };

/**
 * A cat from public/Cat, playing its baked loop from a random point so two
 * cats never move in step - and pettable. Hover shows a hand; press and rub
 * to scratch it: fur-scratch sounds follow the hand, the cat warms up and
 * purrs (fading out again after you stop), and pink hearts float up from
 * under your hand. The sitting cat shuts its eyes, leans its cheek into the
 * rub, lifts its chin and swishes its tail; the sleeping one sinks deeper,
 * flicks its tail and breathes a little quicker.
 */
export function CabinCat({
  url, speed = 1, kind, sound, focus, colors, glint, anchorOut, fat = 0, fatBelly = 1, fatWide = 1, shadowLight, shadow,
  gaze: gazeTune,
}: {
  /** How the head follows the cursor (see CatGaze). */
  gaze?: Partial<CatGaze>;
  /** the light this cat's (fake) shadow falls away from - the monitor glow */
  shadowLight?: React.MutableRefObject<THREE.Light | null>;
  shadow?: CatShadowTune;
  /** Overall chubbiness: 0 = the model as built, 1 = round. */
  fat?: number;
  /** How much of that goes into a hanging belly (x fat). */
  fatBelly?: number;
  /** How much goes into wider flanks (x fat). */
  fatWide?: number;
  /** set to the box round the posed cat (for a camera to frame it) */
  anchorOut?: React.MutableRefObject<THREE.Object3D | null>;
  url: string;
  /** Eye catchlights (see CatGlint). */
  glint?: CatGlint;
  /** Live fur colours (see paintCat). Unset = the orange baked into the GLB. */
  colors?: CatColors;
  speed?: number;
  kind: "sit" | "sleep";
  /** Volumes (master already folded in), 0..1. */
  sound: CatSoundLevels;
  /**
   * Click-to-zoom: while not `active` a click asks for the close-up instead
   * of petting (normal hover pointer); once the camera is in, it pets. A
   * click anywhere else while zoomed in calls onExit. `anchorRef` is set to
   * the box round the posed cat, for the close-up camera to aim at.
   */
  focus?: {
    active: boolean;
    onEnter: () => void;
    onExit: () => void;
    anchorRef: React.MutableRefObject<THREE.Object3D | null>;
  };
}) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] };
  const model = useMemo(() => skeletonClone(gltf.scene) as THREE.Group, [gltf.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const groupRef = useRef<THREE.Group>(null);
  const heartsRef = useRef<THREE.Group>(null);
  const [hit, setHit] = useState<{ center: THREE.Vector3; size: THREE.Vector3 } | null>(null);

  const rig = useMemo(() => {
    const bone = (n: string) => (model.getObjectByName(n) as THREE.Bone | undefined) ?? null;
    // The body and the eye-glint sheet are separate meshes that BOTH carry the
    // eye_close shape. Driving only whichever came last (the glint, in the
    // re-exported files) left the real eyelids wide open - drive every one.
    const faces: THREE.Mesh[] = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.morphTargetDictionary && "eye_close" in m.morphTargetDictionary) faces.push(m);
    });
    const face = faces.find((m) => !String((m.material as THREE.Material)?.name ?? "").startsWith("CatGlint")) ?? faces[0] ?? null;
    const tweaked = ["Head", "NeckBase", "Neck_01", "Neck_01.001", "tail_02", "tail_03", "tail_04"].map(bone).filter((b): b is THREE.Bone => !!b);
    return {
      head: bone("Head"), neck: bone("Neck_01"), nose: bone("nose"), // NeckBase: a neck bone added in Blender (blender/cabin_extras.blend) between
      // the shoulders and the head, holding just the neck - so the neck can
      // lean and turn without the front legs (children of the spine) moving
      neckBase: bone("NeckBase"),
      neck1: bone("Neck_01"), neck2: bone("Neck_01.001"),
      neckBaseRest: (bone("NeckBase")?.position.clone() ?? null) as THREE.Vector3 | null, tails: ["tail_02", "tail_03", "tail_04"].map(bone).filter((b): b is THREE.Bone => !!b),
      face: face as THREE.Mesh | null,
      faces,
      tweaked,
      clean: new Map<THREE.Bone, THREE.Quaternion>(tweaked.map((b) => [b, b.quaternion.clone()])),
    };
  }, [model]);
  const eyeBase = useRef(0);
  const look = useRef(0);
  const lookRef = useRef<CatGaze>(CAT_GAZE_DEFAULTS);
  lookRef.current = { ...CAT_GAZE_DEFAULTS, ...(gazeTune ?? {}) };
  const camera = useThree((st) => st.camera);
  const getR3f = useThree((st) => st.get);
  const lookRay = useMemo(() => new THREE.Raycaster(), []);
  const gaze = useRef<THREE.Vector3 | null>(null);   // eased look angles (yaw, pitch, down-lean)
  const leanFwd = useRef(0);                          // eased "cursor is out in front" 0..1
  const pupilAim = useRef(new THREE.Vector2());       // -1..1 where the cursor is vs the head


  // each cat gets its own materials, so the two can wear different colours
  const mats = useMemo(() => {
    // Idempotent on purpose: React (dev / StrictMode) runs a memo twice and
    // keeps the FIRST result. A second pass used to clone the clones and put
    // THOSE on the meshes, so every repaint (fur colour, stripes, the white
    // nose and chest) went to materials nothing was drawing with.
    const done = model.userData.catMats as THREE.MeshStandardMaterial[] | undefined;
    if (done) return done;
    const list: THREE.MeshStandardMaterial[] = [];
    model.userData.catMats = list;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const cloned = (Array.isArray(m.material) ? m.material : [m.material]).map((mm) => {
        const c = (mm as THREE.MeshStandardMaterial).clone();
        if (c.name !== "CatGlint") list.push(c);   // the eye catchlights get their own shader below
        return c;
      });
      m.material = Array.isArray(m.material) ? cloned : cloned[0];
    });
    return list;
  }, [model]);
  // the catchlight sheet: swap its material for the dot shader
  const glintMat = useMemo(() => {
    const prev = model.userData.catGlint as ReturnType<typeof makeGlintMaterial> | undefined;
    if (prev) return prev;     // idempotent, same reason as mats above
    const g = makeGlintMaterial();
    model.userData.catGlint = g;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && m.material.name === "CatGlint") { m.material = g.mat; m.renderOrder = 2; }
    });
    return g;
  }, [model, mats]); // eslint-disable-line react-hooks/exhaustive-deps -- after the per-cat material clones
  useEffect(() => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      const dict = m.isMesh ? m.morphTargetDictionary : undefined;
      if (!dict || !m.morphTargetInfluences) return;
      const f = Math.max(0, fat);
      if (dict.fat_belly !== undefined) m.morphTargetInfluences[dict.fat_belly] = Math.min(3, f * fatBelly);
      if (dict.fat_wide !== undefined) m.morphTargetInfluences[dict.fat_wide] = Math.min(3, f * fatWide);
    });
  }, [model, fat, fatBelly, fatWide]);
  const glintRef2 = useRef(glint);
  glintRef2.current = glint;
  const colorKey = colors ? [...colors.fur, ...colors.stripe, colors.stripes, colors.white ?? 0, colors.whiteSize ?? 0.5, colors.whiteEdge ?? 0.9, ...(colors.eyeRing ?? [-1, -1, -1])].map((n) => n.toFixed(3)).join("|") : "";
  useEffect(() => {
    if (!colors || typeof document === "undefined") return;
    let cancelled = false;
    let made: THREE.CanvasTexture | null = null;
    const id = window.setTimeout(() => {
      loadCatBase().then((base) => {
        if (cancelled) return;
        made = paintCat(base, colors);
        for (const m of mats) {
          const old = m.map;
          m.map = made;
          m.needsUpdate = true;
          if (old && old.userData.catPainted) old.dispose();
        }
        made.userData.catPainted = true;
      }).catch(() => { /* keep the baked texture */ });
    }, 120);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [colorKey, mats]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const glintSheet = m.material === glintMat.mat;
      m.castShadow = !glintSheet;
      m.receiveShadow = true;
      // skinned: the bind-pose bounds are not where the pose puts the cat
      m.frustumCulled = false;
    });
    const face = rig.face;
    if (face?.morphTargetInfluences && face.morphTargetDictionary) {
      eyeBase.current = face.morphTargetInfluences[face.morphTargetDictionary.eye_close] ?? 0;
    }
    const clip = gltf.animations[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    action.time = Math.random() * clip.duration;
    mixer.update(0);
    // the invisible hit box is measured a couple of frames from now (below)
    measureHitIn.current = 2;
    return () => {
      action.stop();
      mixer.uncacheRoot(model);
    };
  }, [model, mixer, gltf.animations, rig]);

  /*
   * An invisible box round the posed cat to pet - steadier to hit than
   * raycasting the skinned mesh itself. Measured only once the cat has been
   * through a render or two: at mount the skinned meshes' bind matrices still
   * belong to wherever the clone was made, so the box came out in the wrong
   * frame entirely (under the floor, a fifth the size) and nothing could
   * click or hover the cats.
   */
  const measureHitIn = useRef(-1);
  useFrame(() => {
    if (measureHitIn.current < 0) return;
    if (measureHitIn.current-- > 0) return;
    model.updateWorldMatrix(true, false);
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        m.getVertexPosition(i, v);
        v.applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        box.expandByPoint(v);
      }
    });
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3()).multiplyScalar(1.08);
      setHit({ center: box.getCenter(new THREE.Vector3()), size });
    }
  });

  // ---- petting state
  const pet = useRef({
    down: false, hover: false, happy: 0, eyeHappy: 0, shut: 0, moved: 0, lastX: 0, lastY: 0, lastScratch: 0, lastHeart: 0,
    rub: 0, rubTarget: 0, point: new THREE.Vector3(), t: 0,
  });
  const purr = useRef<Purr | null>(null);
  const heartTex = useMemo(() => (typeof document === "undefined" ? null : makeHeartTexture()), []);
  const hearts = useRef<Heart[]>([]);
  useEffect(() => () => {
    purr.current?.stop();
    purr.current = null;
    heartTex?.dispose();
    for (const h of hearts.current) h.sprite.material.dispose();
    hearts.current = [];
    if (pet.current.down) catPetLock.active = false;
  }, [heartTex]);

  const setCursor = (c: string) => { if (typeof document !== "undefined") document.body.style.cursor = c; };
  const focusRef = useRef(focus);
  focusRef.current = focus;
  /*
   * Hover highlight, the same warm glow every other clickable prop gets - but
   * only while the cat is something to click INTO (before the close-up). Once
   * the camera is in, the petting cursor is the affordance and a glowing cat
   * would just look odd under your hand.
   */
  const [hoverGlow, setHoverGlow] = useState(false);
  const glowOn = hoverGlow && !!focus && !focus.active;
  useEffect(() => {
    for (const m of mats) {
      const base = (m.userData.glowBase ??= { e: m.emissive.clone(), i: m.emissiveIntensity }) as { e: THREE.Color; i: number };
      if (glowOn) { m.emissive.setRGB(1, 0.86, 0.6); m.emissiveIntensity = 0.22; }
      else { m.emissive.copy(base.e); m.emissiveIntensity = base.i; }
    }
  }, [glowOn, mats]);
  /** Petting is on unless this cat zooms first and the camera is not in yet. */
  const canPet = () => !focusRef.current || focusRef.current.active;
  const focusActive = focus?.active ?? false;
  useEffect(() => {
    // the camera just arrived (or left) under a resting pointer: swap cursors
    if (pet.current.hover) setCursor(focusActive || !focusRef.current ? PET_CURSOR : ZOOM_CURSOR);
    if (!focusActive && pet.current.down) {
      pet.current.down = false;
      catPetLock.active = false;
    }
  }, [focusActive]);
  const endPet = () => {
    const p = pet.current;
    if (!p.down) return;
    p.down = false;
    catPetLock.active = false;
    setCursor(p.hover ? PET_CURSOR : "");
  };
  const toLocal = (world: THREE.Vector3) => (heartsRef.current ? heartsRef.current.worldToLocal(world.clone()) : world.clone());

  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      pet.current.hover = true;
      setHoverGlow(true);
      if (!pet.current.down) setCursor(canPet() ? PET_CURSOR : ZOOM_CURSOR);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      pet.current.hover = false;
      setHoverGlow(false);
      if (!pet.current.down) setCursor("");
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      catClick.at = performance.now();
      if (!canPet()) return;          // this click asks for the close-up (onClick)
      const p = pet.current;
      p.down = true;
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      p.point.copy(toLocal(e.point));
      catPetLock.active = true;
      (e.target as unknown as Element).setPointerCapture?.(e.pointerId);
      setCursor(PET_CURSOR_SCRATCH);
      if (!purr.current) purr.current = createPurr();
      catScratch(soundRef.current.scratch, 0.6);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const p = pet.current;
      if (!p.down) return;
      e.stopPropagation();
      const dx = e.clientX - p.lastX;
      const dy = e.clientY - p.lastY;
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      p.moved += Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.5) p.rubTarget = Math.sign(dx);
      if (e.intersections.length) p.point.copy(toLocal(e.point));
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
      endPet();
    },
    onPointerCancel: () => endPet(),
    onLostPointerCapture: () => endPet(),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      catClick.at = performance.now();
      const f = focusRef.current;
      if (f && !f.active) f.onEnter();
    },
    // zoomed in, a click that lands anywhere but the cat lets the camera go
    onPointerMissed: () => {
      const f = focusRef.current;
      if (performance.now() - catClick.at < 400) return;   // it was the other cat
      if (f?.active && !pet.current.down && !catPetLock.active) f.onExit();
    },
  };

  const tmp = useMemo(() => ({
    q: new THREE.Quaternion(), pq: new THREE.Quaternion(), a: new THREE.Vector3(), b: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
  }), []);
  /** Turn a bone by `angle` about a WORLD-space axis, on top of its pose. */
  const turnWorld = (bone: THREE.Bone, axis: THREE.Vector3, angle: number) => {
    if (!bone.parent || Math.abs(angle) < 1e-5) return;
    bone.parent.getWorldQuaternion(tmp.pq);
    tmp.q.setFromAxisAngle(axis, angle);
    const local = bone.quaternion.clone();
    bone.quaternion.copy(tmp.pq).invert().multiply(tmp.q).multiply(tmp.pq).multiply(local);
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const p = pet.current;
    const gl = glintRef2.current ?? GLINT_DEFAULTS, gu = glintMat.u;
    gu.uLeft.value.set(gl.left[0], gl.left[1]);
    gu.uRight.value.set(gl.right[0], gl.right[1]);
    gu.uSize.value = gl.size; gu.uSecond.value = gl.second;
    gu.uSecondOffset.value.set(gl.secondOffset[0], gl.secondOffset[1]);
    gu.uBright.value = gl.brightness; gu.uRound.value = gl.roundness; gu.uSoft.value = gl.softness;
    const ir = { ...IRIS_DEFAULTS, ...(gl.iris ?? {}) };
    gu.uIrisOn.value = ir.on >= 0.5 ? 1 : 0;
    gu.uIrisIn.value.setRGB(ir.inner[0], ir.inner[1], ir.inner[2], THREE.SRGBColorSpace);
    gu.uIrisOut.value.setRGB(ir.outer[0], ir.outer[1], ir.outer[2], THREE.SRGBColorSpace);
    gu.uIrisR.value = ir.size; gu.uIrisOff.value.set(ir.offset[0], ir.offset[1]);
    gu.uPupil.value.set(ir.pupilW, ir.pupilH);
    gu.uRing.value = ir.ring; gu.uShade.value = ir.shade; gu.uGlow.value = ir.glow; gu.uIrisBright.value = ir.brightness;
    gu.uPupilSoft.value = ir.pupilSoft;
    // the pupils glance toward the cursor along with the head (eased back to
    // centre when the cat isn't watching)
    const pt = pupilAim.current;
    gu.uPupilOff.value.set(gu.uPupilOff.value.x + (pt.x * ir.trackX - gu.uPupilOff.value.x) * Math.min(1, dt * 10),
      gu.uPupilOff.value.y + (pt.y * ir.trackY - gu.uPupilOff.value.y) * Math.min(1, dt * 10));
    p.t += dt;
    // how much rubbing happened this frame, as a 0..1 "speed"
    const speed = Math.min(1, p.moved / Math.max(1e-3, dt) / 900);
    p.moved = 0;
    const warming = p.down ? (speed > 0.05 ? 0.9 : 0.35) : -0.3;
    p.happy = Math.min(1, Math.max(0, p.happy + warming * dt));
    p.rub += (p.rubTarget * (p.down ? 1 : 0) - p.rub) * (1 - Math.exp(-dt * 5));
    const happy = p.happy * p.happy * (3 - 2 * p.happy);

    // the baked loop (a touch quicker while the sleeper is content), from a clean pose
    for (const bn of rig.tweaked) bn.quaternion.copy(rig.clean.get(bn)!);
    if (rig.neckBase && rig.neckBaseRest) rig.neckBase.position.copy(rig.neckBaseRest);
    mixer.update(dt * Math.max(0, speedRef.current) * (kind === "sleep" ? 1 + 0.35 * happy : 1));
    for (const bn of rig.tweaked) rig.clean.get(bn)!.copy(bn.quaternion);

    // reactions
    model.updateWorldMatrix(true, true);
    // in the close-up, follow the cursor with their eyes and head (eased in and
    // out, within a comfortable neck range); petting rubs and chin-lifts layer
    // on top of this
    const G = lookRef.current;
    const lookOn = G.amount > 0 && (G.always >= 0.5 || (focusRef.current?.active ?? false));
    look.current += ((lookOn ? 1 : 0) - look.current) * (1 - Math.exp(-dt * Math.max(0.05, G.blend)));
    if (!(rig.head && rig.nose && look.current > 0.001)) pupilAim.current.set(0, 0);
    if (rig.head && rig.nose && look.current > 0.001) {
      rig.head.getWorldPosition(tmp.a);
      rig.nose.getWorldPosition(tmp.b);
      const fwd = tmp.b.clone().sub(tmp.a).normalize();     // where the head points now (its idle pose)
      // the point under the cursor, out at the cat's own distance from the camera
      // Where the cursor ray crosses a flat, screen-facing plane set part of the
      // way from the camera to the cat (depth: 0 = at the camera, 1 = level
      // with the head). In front of the head, so the cat always looks OUT
      // toward you, turning further the further the cursor goes to one side -
      // never past side-on into looking backwards (a plane right through the
      // head did that), and never swinging back the other way (a sphere round
      // the camera did that).
      lookRay.setFromCamera(getR3f().pointer, camera);
      const camFwd = camera.getWorldDirection(new THREE.Vector3());
      const planeD = Math.max(0.01, tmp.a.clone().sub(lookRay.ray.origin).dot(camFwd)) * Math.min(0.95, Math.max(0.05, G.depth));
      const along = Math.max(0.05, lookRay.ray.direction.dot(camFwd));
      const target = lookRay.ray.origin.clone().addScaledVector(lookRay.ray.direction, planeD / along);
      // The target, in the head's own level frame: ahead / to its left / up.
      // Taking the side-to-side angle straight from that blows up when the
      // cursor is right above the head (ahead and left both ~0, so the angle
      // flips wildly - the "stuck then jerks over" sweep). Instead "ahead" is
      // never allowed below a share of the distance, so passing overhead the
      // turn glides through centre and the head tips back to look up.
      const off = target.clone().sub(tmp.a);
      const fh = Math.hypot(fwd.x, fwd.z) || 1e-6;
      const ahead = new THREE.Vector3(fwd.x / fh, 0, fwd.z / fh);
      const left = new THREE.Vector3().crossVectors(tmp.up, ahead);
      const dist = off.length() || 1e-6;
      const fwdAmt = off.dot(ahead), latAmt = off.dot(left), upAmt = off.y;
      const horiz = Math.hypot(fwdAmt, latAmt);
      // the full side-to-side angle (so a cursor far to one side, even level
      // with or behind the cat, really is looked at) ...
      let yaw = Math.atan2(latAmt, fwdAmt);                                   // + = the cat's left
      // ... faded out only when the cursor is nearly straight above/below the
      // head, where that angle is meaningless and used to make the head jerk
      const ov = Math.max(0.05, G.overhead), hf = horiz / dist;
      const t0 = Math.min(1, Math.max(0, (hf - ov * 0.3) / (ov * 0.7)));
      yaw *= t0 * t0 * (3 - 2 * t0);
      // right behind the cat the angle would flip from +180 to -180: stay on
      // the side it was already turning to
      if (fwdAmt < 0 && gaze.current && Math.abs(gaze.current.x) > 0.5 && Math.sign(yaw) !== Math.sign(gaze.current.x)) {
        yaw = Math.sign(gaze.current.x) * Math.PI;
      }
      let pitch = Math.atan2(upAmt, Math.max(1e-4, horiz)) - Math.atan2(fwd.y, fh);
      // where the cursor sits vs where the head points, -1..1, for the pupils
      pupilAim.current.set(Math.max(-1, Math.min(1, -yaw / 1.1)), Math.max(-1, Math.min(1, pitch / 0.9)));
      // how far out IN FRONT of the cat the cursor is (0..1) - for leaning in
      const inFrontRaw = Math.min(1, Math.max(0, (fwdAmt / dist - 0.25) / 0.6));
      // ...or in the chosen lean-in zone (e.g. top right), by angular distance
      const RAD = 180 / Math.PI;
      const zw = Math.max(0, G.leanZoneWidth);
      let inZone = 0;
      if (zw > 0) {
        const dA = Math.hypot(yaw * RAD - G.leanZoneYaw, (Math.atan2(upAmt, Math.max(1e-4, horiz)) * RAD) - G.leanZonePitch);
        const z = Math.min(1, Math.max(0, (zw - dA) / (zw * 0.5)));
        inZone = z * z * (3 - 2 * z);
      }
      const inFront = Math.max(inFrontRaw * Math.max(0, Math.min(1, G.leanFrontWeight)), inZone);
      const D = THREE.MathUtils.degToRad;
      const dz = D(G.deadzone);
      const dead = (x: number) => (Math.abs(x) <= dz ? 0 : x - Math.sign(x) * dz);
      yaw = dead(yaw) * G.yawGain + D(G.yawOffset);
      pitch = dead(pitch) * G.pitchGain + D(G.pitchOffset);
      // soft limits: ease into the stops instead of hitting a wall
      // linear up to 70% of the limit, then a short soft knee into it - so the
      // full limit is actually reachable (a plain tanh only ever got ~3/4 there)
      const soft = (x: number, lo: number, hi: number) => {
        const lim = x >= 0 ? hi : lo;
        if (lim <= 1e-4) return 0;
        const a = Math.abs(x), knee = lim * 0.7;
        if (a <= knee) return x;
        const r = lim - knee;
        return Math.sign(x) * (knee + r * Math.tanh((a - knee) / r));
      };
      // Looking down, the neck and shoulders lean forward. This is taken from
      // the RAW downward angle (before the head's own down-limit clips it), so
      // it keeps working even with a small "furthest look down", and it is
      // spread over the chest and upper neck bones so it reads as a lean.
      const lean = -Math.min(D(Math.max(0, G.leanMax)), Math.max(0, -pitch) * Math.max(0, G.lean));
      yaw = soft(yaw, D(G.maxRight), D(G.maxLeft));
      pitch = soft(pitch - lean, D(G.maxDown), D(G.maxUp));   // the head does the rest
      // smooth the ANGLES (not the target point), so sweeps stay even
      const kf = 1 - Math.exp(-dt * Math.max(0.05, G.follow));
      if (!gaze.current) gaze.current = new THREE.Vector3(yaw, pitch, lean);
      gaze.current.x += (yaw - gaze.current.x) * kf;
      gaze.current.y += (pitch - gaze.current.y) * kf;
      gaze.current.z += (lean - gaze.current.z) * kf;
      const w = look.current * Math.min(1, G.amount);
      yaw = gaze.current.x * w; pitch = gaze.current.y * w;
      const leanNow = gaze.current.z * w;
      leanFwd.current += (inFront - leanFwd.current) * kf;
      const leanIn = -THREE.MathUtils.degToRad(Math.max(0, G.leanForward)) * leanFwd.current * w;   // forward = down
      const share = Math.max(0, Math.min(0.9, G.neckShare));
      const right = fwd.clone().cross(tmp.up).normalize();
      // up and down get their own amount of NECK bend; the head makes up the rest
      const neckPitchShare = rig.neckBase ? pitch * share * Math.max(0, pitch >= 0 ? G.neckUp : G.neckDown) : 0;
      const neckPitch = neckPitchShare + leanNow * Math.max(0, G.neckDown) + leanIn;
      const turnShare = Math.max(0, Math.min(0.9, G.neckTurn));
      if (rig.neckBase && (share > 0 || turnShare > 0 || leanNow !== 0 || leanIn !== 0)) {
        // the neck's part of a sideways turn - pivoting on the shoulders swings
        // the head round and BACK, so (headPin) slide the neck to hold the head
        // where it was: it swivels in place, as a cat's does
        const headBefore = rig.head.getWorldPosition(new THREE.Vector3());
        turnWorld(rig.neckBase, tmp.up, yaw * turnShare);
        if (G.headPin > 0 && rig.neckBase.parent) {
          rig.neckBase.updateWorldMatrix(false, true);
          const drift = headBefore.sub(rig.head.getWorldPosition(new THREE.Vector3())).multiplyScalar(Math.min(1, G.headPin));
          // capped: a long slide is what stretched the neck out
          const capW = Math.max(0, G.neckSlideMax) * model.getWorldScale(new THREE.Vector3()).x;
          if (drift.length() > capW) drift.setLength(capW);
          const par = rig.neckBase.parent;
          const pq = par.getWorldQuaternion(new THREE.Quaternion()).invert();
          const ps = par.getWorldScale(new THREE.Vector3());
          rig.neckBase.position.add(drift.applyQuaternion(pq).divide(ps));
        }
        turnWorld(rig.neckBase, right, neckPitch);   // the neck tips (forward and down, or a little back)
        // ...and stretches OUT: a cat looking down pushes its head forward past
        // its chest instead of tucking its chin in (the squash)
        // (leaning in toward the cursor also pushes the head out a little)
        const downFrac = Math.min(1, Math.max(0, -leanNow / Math.max(1e-3, D(Math.max(1, G.leanMax)))) + 0.4 * leanFwd.current * w);
        if (downFrac > 0 && rig.neckBase.parent && G.reach > 0) {
          const par = rig.neckBase.parent;
          par.updateWorldMatrix(true, false);
          const pq = par.getWorldQuaternion(new THREE.Quaternion()).invert();
          const ps = par.getWorldScale(new THREE.Vector3());
          const ms = model.getWorldScale(new THREE.Vector3());
          // forward along the cat's facing, a touch down; model units -> parent units
          const worldOff = new THREE.Vector3(fwd.x, 0, fwd.z).normalize().multiplyScalar(0.85).addScaledVector(tmp.up, -0.35)
            .multiplyScalar(G.reach * downFrac * ms.x * Math.max(0, G.neckDown));
          worldOff.applyQuaternion(pq).divide(ps);
          rig.neckBase.position.add(worldOff);
        }
        rig.neckBase.updateWorldMatrix(false, true);
      }
      // the head's part of the turn, spread down the neck's chain (Neck_01 ->
      // Neck_01.001 -> Head) so no single joint twists far - one big twist at
      // the skull is what pinched the neck skinny
      const headYaw = yaw * (1 - turnShare);
      const spread = Math.max(0, Math.min(1, G.twistSpread));
      const n1 = rig.neck1, n2 = rig.neck2;
      if (spread > 0 && n1 && n2) {
        turnWorld(n1, tmp.up, headYaw * spread * 0.5);
        n1.updateWorldMatrix(false, true);
        turnWorld(n2, tmp.up, headYaw * spread * 0.5);
        n2.updateWorldMatrix(false, true);
        turnWorld(rig.head, tmp.up, headYaw * (1 - spread));
      } else {
        turnWorld(rig.head, tmp.up, headYaw);
      }
      // pitch about the head's NEW sideways axis, then a little curious roll
      rig.head.getWorldPosition(tmp.a); rig.nose.getWorldPosition(tmp.b);
      const f2 = tmp.b.clone().sub(tmp.a).normalize();
      // (minus the lean-in: the head tips back up by it, so the gaze stays on target)
      turnWorld(rig.head, f2.clone().cross(tmp.up).normalize(), pitch - neckPitchShare - leanIn);
      if (G.tilt) {
        const maxYaw = Math.max(1e-3, D(Math.max(G.maxLeft, G.maxRight)));
        turnWorld(rig.head, f2, -(yaw / maxYaw) * D(G.tilt));
      }
      rig.head.updateWorldMatrix(false, true);
    }
    if (rig.head && rig.neck && happy > 0.001) {
      rig.head.getWorldPosition(tmp.a);
      rig.neck.getWorldPosition(tmp.b);
      const along = tmp.a.clone().sub(tmp.b).normalize();     // neck -> head
      const side = along.clone().cross(tmp.up).normalize();
      if (kind === "sit") {
        turnWorld(rig.head, along, p.rub * 0.38 * happy);       // cheek into the hand
        turnWorld(rig.head, side, -0.2 * happy);                 // chin up
      } else {
        turnWorld(rig.head, along, Math.sin(p.t * 1.3) * 0.06 * happy);
      }
    }
    const tailAmp = kind === "sit" ? 0.28 : 0.18;
    rig.tails.forEach((bn, i) => {
      const w = kind === "sit" ? Math.sin(p.t * 2.2 - i * 0.6) : Math.max(0, Math.sin(p.t * 3.1 - i * 0.9)) ** 3;
      turnWorld(bn, tmp.up, w * tailAmp * happy);
    });
    const face = rig.face;
    if (face?.morphTargetInfluences && face.morphTargetDictionary) {
      // eyes shut (glints tucked behind the lids) while the hand is on, quickly;
      // after, they stay contentedly shut as long as the cat is still happy
      // the eyes open 30% faster than the rest of the contentment fades
      // (purr, bob, tail keep the slower 0.3/s; the eyelids use 0.39/s)
      p.eyeHappy = p.down ? p.happy : Math.max(0, Math.min(p.happy, p.eyeHappy - 0.39 * dt));
      const eyeHappy = p.eyeHappy * p.eyeHappy * (3 - 2 * p.eyeHappy);
      p.shut += ((p.down ? 1 : eyeHappy) - p.shut) * (1 - Math.exp(-dt * (p.down ? 9 : 2.5 * 1.3)));
      // the sleeper is asleep: eyes fully shut, no catchlights (its baked rest
      // is only 80% closed, which left the dots glinting through)
      const shut = kind === "sleep" ? 1 : eyeBase.current + (1 - eyeBase.current) * Math.max(p.shut, eyeHappy);
      for (const f of rig.faces) {
        const j = f.morphTargetDictionary?.eye_close;
        if (j !== undefined && f.morphTargetInfluences) f.morphTargetInfluences[j] = shut;
      }
      glintMat.u.uShut.value = shut;
    }
    // a tiny happy bob for the sitter
    if (groupRef.current) {
      const bob = kind === "sit" ? Math.max(0, Math.sin(p.t * 7)) * 0.025 * happy * (p.down ? 1 : 0.4) : 0;
      groupRef.current.scale.set(1 + bob * 0.4, 1 - bob, 1 + bob * 0.4);
    }

    // sounds
    const snd = soundRef.current;
    if (p.down && speed > 0.04 && p.t - p.lastScratch > 0.075) {
      p.lastScratch = p.t;
      catScratch(snd.scratch, 0.35 + 0.65 * speed);
    }
    if (purr.current) purr.current.update(happy, snd.purr);

    // hearts from under the hand
    if (p.down && heartTex && heartsRef.current && p.t - p.lastHeart > (speed > 0.05 ? 0.38 : 0.9)) {
      p.lastHeart = p.t;
      const mat = new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(p.point);
      sprite.scale.setScalar(0.001);
      heartsRef.current.add(sprite);
      hearts.current.push({ sprite, age: 0, vx: (Math.random() - 0.5) * 0.25, sway: Math.random() * 6.28 });
    }
    for (let i = hearts.current.length - 1; i >= 0; i--) {
      const h = hearts.current[i];
      h.age += dt;
      const u = h.age / 1.5;
      if (u >= 1) {
        heartsRef.current?.remove(h.sprite);
        h.sprite.material.dispose();
        hearts.current.splice(i, 1);
        continue;
      }
      // hearts live in the cat's (scaled) frame: a model unit is ~0.17 m here
      h.sprite.position.y += 0.9 * dt;
      h.sprite.position.x += (h.vx + Math.sin(h.sway + h.age * 4) * 0.3) * dt;
      h.sprite.material.opacity = Math.min(1, u * 8) * (1 - u * u);
      h.sprite.scale.setScalar(0.32 * Math.min(1, u * 5) * (1 + 0.1 * Math.sin(h.age * 12)));
    }
  });

  return (
    <group>
      <group ref={groupRef} {...handlers}>
        <primitive object={model} />
        {hit ? (
          <mesh position={hit.center} ref={(m) => { if (focus) focus.anchorRef.current = m; if (anchorOut) anchorOut.current = m; }}>
            <boxGeometry args={[hit.size.x, hit.size.y, hit.size.z]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        ) : null}
      </group>
      {hit && shadowLight && shadow ? (
        <CatShadow model={model} skip={glintMat.mat} light={shadowLight} floorY={0} footprint={CAT_FOOTPRINT} tune={shadow} />
      ) : null}
      <group ref={heartsRef} />
    </group>
  );
}

idlePreload(CAT_SIT_URL);

/* ------------------------------------------------------------- gramophone */

export const GRAMOPHONE_URL = "/gramaphone/gramophone_anim.glb";
export const GRAMOPHONE_TABLE_URL = "/gramaphone/Table%20by%20jeremy%20-%20fdtYBOniyxa.glb";
/** The table model is 7.543 units tall; at the scale CabinGramophone uses its
 *  top sits at this height in the gramophone group's frame. */
const TABLE_SCALE = 0.042;
const TABLE_TOP = 7.543 * TABLE_SCALE;
const GRAMO_SCALE = 0.46;
/** The gramophone's base sits 0.15 below its origin. */
const GRAMO_BASE = 0.15;
/** Horn mouth, in the Horn node's own frame (its +Y runs throat -> mouth). */
const HORN_MOUTH = new THREE.Vector3(0, 0.6, 0);

export type GramophoneTune = {
  /** Record turns per second. */
  recordSpeed: number;
  /** Crank turns per second. */
  crankSpeed: number;
  /** Beats per minute for the horn pump, the bounce and the notes. */
  bpm: number;
  /** Horn squash-and-stretch on each beat, 0 = still. */
  pump: number;
  /** Whole machine bobbing on the beat, 0 = still. */
  bounce: number;
  /** Music notes drifting out of the horn: 0 = none, 1 = one per beat. */
  notes: number;
  /** Overall animation speed (x) - everything: record, crank and the beat. */
  speed?: number;
  /** Seconds into the song before the beat (pump, bounce, notes) starts. */
  delay?: number;
};

/** The gramophone song's playback position, written every frame by its audio
 *  loop. The animation runs off this clock, so the beat stays locked to the
 *  music (pauses, loops back round) instead of drifting on its own timer. */
export const gramophoneSongClock = { current: 0 };

/** A white music note on a transparent square, tinted by the sprite. */
function makeNoteTexture(glyph: string) {
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.font = `bold ${N * 0.8}px serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = 6;
  g.fillText(glyph, N / 2, N / 2 + N * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Note = { sprite: THREE.Sprite; age: number; life: number; vx: number; vz: number; sway: number; spin: number };

/**
 * The porch gramophone on its little table, animated the way cartoons animate
 * a record player: the record spins, the crank turns, the horn swells and
 * relaxes on every beat (stretch along the bell, squeeze across it), the whole
 * machine gives a little bob, and notes float up out of the horn and fade.
 *
 * The GLB (public/gramaphone/gramophone_anim.glb) was split in Blender from
 * the single-mesh Don Carson model into Body, Record, Crank and Horn, each with
 * its origin on its own pivot: Record on the spindle (spins about local Y),
 * Crank on its shaft (local Z), Horn at the throat with local Y along the bell.
 */
export function CabinGramophone({ tune }: { tune: GramophoneTune }) {
  const gltf = useGLTF(GRAMOPHONE_URL) as unknown as { scene: THREE.Group };
  const table = useGLTF(GRAMOPHONE_TABLE_URL) as unknown as { scene: THREE.Group };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const tableModel = useMemo(() => table.scene.clone(true), [table.scene]);
  const bodyRef = useRef<THREE.Group>(null);
  const notesRef = useRef<THREE.Group>(null);
  const tuneRef = useRef(tune);
  tuneRef.current = tune;

  const rig = useMemo(() => {
    const find = (n: string) => model.getObjectByName(n) ?? null;
    const record = find("Record"), crank = find("Crank"), horn = find("Horn");
    return {
      record, crank, horn,
      recordQ: record?.quaternion.clone() ?? new THREE.Quaternion(),
      crankQ: crank?.quaternion.clone() ?? new THREE.Quaternion(),
      hornScale: horn?.scale.clone() ?? new THREE.Vector3(1, 1, 1),
    };
  }, [model]);

  useEffect(() => {
    for (const root of [model, tableModel]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
      });
    }
  }, [model, tableModel]);

  const noteTex = useMemo(
    () => (typeof document === "undefined" ? [] : ["♪", "♫", "♩"].map(makeNoteTexture)),
    [],
  );
  useEffect(() => () => noteTex.forEach((t) => t.dispose()), [noteTex]);
  const notes = useRef<Note[]>([]);
  const clock = useRef({ t: 0, lastBeat: -1, rnd: 1 });
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), v: new THREE.Vector3(), axisY: new THREE.Vector3(0, 1, 0), axisZ: new THREE.Vector3(0, 0, 1) }), []);

  useFrame((_, delta) => {
    const tu = tuneRef.current;
    const dt = Math.min(delta, 0.1);
    const c = clock.current;
    const speed = Math.max(0, tu.speed ?? 1);
    const song = gramophoneSongClock.current;
    // follow the song when it's playing; otherwise keep ticking on our own
    if (song > 0) c.t = song; else c.t += dt;
    const t = c.t * speed;
    const beatT = Math.max(0, c.t - Math.max(0, tu.delay ?? 0)) * speed;
    const beatOn = c.t >= Math.max(0, tu.delay ?? 0);
    // record and crank
    if (rig.record) rig.record.quaternion.copy(rig.recordQ).multiply(tmp.q.setFromAxisAngle(tmp.axisY, -t * tu.recordSpeed * Math.PI * 2));
    if (rig.crank) rig.crank.quaternion.copy(rig.crankQ).multiply(tmp.q.setFromAxisAngle(tmp.axisZ, t * tu.crankSpeed * Math.PI * 2));
    // the beat: a quick swell, then a slower settle with a little overshoot
    const beatLen = 60 / Math.max(20, tu.bpm);
    const phase = (beatT % beatLen) / beatLen;
    const swell = !beatOn ? 0 : phase < 0.12 ? Math.sin((phase / 0.12) * Math.PI * 0.5) : Math.cos(((phase - 0.12) / 0.88) * Math.PI * 1.5) * Math.exp(-((phase - 0.12) / 0.88) * 3);
    if (rig.horn) {
      const a = 0.16 * tu.pump * swell;
      rig.horn.scale.set(rig.hornScale.x * (1 - a * 0.5), rig.hornScale.y * (1 + a), rig.hornScale.z * (1 - a * 0.5));
    }
    if (bodyRef.current) {
      const b = 0.035 * tu.bounce * swell;
      bodyRef.current.scale.set(1 + b * 0.5, 1 - b, 1 + b * 0.5);
    }
    // a note on each beat (or every few beats), out of the horn mouth
    const beat = Math.floor(beatT / beatLen);
    if (beatOn && beat !== c.lastBeat) {
      c.lastBeat = beat;
      c.rnd = (c.rnd * 16807) % 2147483647;
      const r = c.rnd / 2147483647;
      if (tu.notes > 0.001 && r < tu.notes && rig.horn && notesRef.current && noteTex.length) {
        const mat = new THREE.SpriteMaterial({ map: noteTex[beat % noteTex.length], color: new THREE.Color(1, 0.86, 0.45), transparent: true, depthWrite: false, opacity: 0 });
        const sprite = new THREE.Sprite(mat);
        rig.horn.updateWorldMatrix(true, false);
        const p = rig.horn.localToWorld(tmp.v.copy(HORN_MOUTH));
        notesRef.current.worldToLocal(p);
        sprite.position.copy(p);
        sprite.scale.setScalar(0.11);
        notesRef.current.add(sprite);
        notes.current.push({ sprite, age: 0, life: 2.6, vx: (r - 0.5) * 0.12, vz: (r * 7 % 1 - 0.5) * 0.12, sway: r * 6.28, spin: (r - 0.5) * 0.8 });
      }
    }
    for (let i = notes.current.length - 1; i >= 0; i--) {
      const n = notes.current[i];
      n.age += dt;
      const u = n.age / n.life;
      if (u >= 1) {
        notesRef.current?.remove(n.sprite);
        n.sprite.material.dispose();
        notes.current.splice(i, 1);
        continue;
      }
      n.sprite.position.x += (n.vx + Math.sin(n.sway + n.age * 3) * 0.05) * dt;
      n.sprite.position.z += n.vz * dt;
      n.sprite.position.y += 0.22 * dt;
      n.sprite.material.opacity = Math.min(1, u * 6) * (1 - Math.pow(u, 2));
      n.sprite.material.rotation = Math.sin(n.sway + n.age * 2) * 0.35 + n.spin * u;
      n.sprite.scale.setScalar(0.09 + 0.05 * Math.min(1, u * 3));
    }
  });

  useEffect(() => () => {
    for (const n of notes.current) n.sprite.material.dispose();
    notes.current = [];
  }, []);

  return (
    <group>
      <primitive object={tableModel} scale={TABLE_SCALE} />
      <group position={[0, TABLE_TOP, 0]}>
        {/* the bob squashes from the base, so this group sits on the table top */}
        <group ref={bodyRef}>
          <group position={[0, GRAMO_BASE * GRAMO_SCALE, 0]} scale={GRAMO_SCALE}>
            <primitive object={model} />
          </group>
        </group>
      </group>
      {/* notes live outside the bobbing group so they drift free of it */}
      <group ref={notesRef} />
    </group>
  );
}

idlePreload(GRAMOPHONE_URL);
idlePreload(GRAMOPHONE_TABLE_URL);

/* ------------------------------------------------------------- microphone */

export const MICROPHONE_PARTS_URL = "/microphone_parts.glb";
/** Pole length as authored (its bottom sits on the base, its top runs up into
 *  the head's clamp). */
const MIC_POLE_LEN = 1.194;

/**
 * The microphone stand, split in Blender into Base (static), Pole (stretches)
 * and Head (rides up on top), so `extraHeight` (metres) raises the mic without
 * a gap and without moving the base. Recoloured: the whole pole is silver;
 * elsewhere the white parts go black and the black parts become brushed metal.
 */
export function MicrophoneStand({
  extraHeight = 0, shine = 0.45, gloss = 0.82, metalness = 1,
}: {
  extraHeight?: number;
  /** How strongly the metal reflects its surroundings, 0..1 on a gentle curve
   *  (the night scene is dark, so even a little reflection reads strongly). */
  shine?: number;
  /** 0 = matte, 1 = mirror: how tight and bright the highlights from the scene's lights are. */
  gloss?: number;
  /** 0 = painted, 1 = bare metal. */
  metalness?: number;
}) {
  const gltf = useGLTF(MICROPHONE_PARTS_URL) as unknown as { scene: THREE.Group };
  const { gl } = useThree();
  // something for the metal to reflect: the night scene has no environment,
  // and bare metal under point lights reads flat and dark. A soft studio room,
  // used by this material only, puts highlights along every groove.
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return tex;
  }, [gl]);
  useEffect(() => () => env.dispose(), [env]);
  const metal = useMemo(() => new THREE.MeshStandardMaterial({
    color: 0xd6dade, roughness: 0.18, metalness: 1, envMap: env, envMapIntensity: 0.02, flatShading: true,
  }), [env]);
  useEffect(() => {
    // 0..1 slider -> 0..0.1 reflection, squared so the low end is finely spaced
    const s = Math.min(1, Math.max(0, shine));
    metal.envMapIntensity = 0.1 * s * s;
    metal.roughness = Math.min(1, Math.max(0.02, 1 - gloss));
    metal.metalness = Math.min(1, Math.max(0, metalness));
  }, [metal, shine, gloss, metalness]);
  const model = useMemo(() => {
    const m = gltf.scene.clone(true);
    const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.45, metalness: 0.2, envMap: env, envMapIntensity: 0.02 });
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // the whole pole is silver
      let onPole = false;
      for (let a: THREE.Object3D | null = mesh; a; a = a.parent) if (a.name === "Pole") onPole = true;
      const swap = (mat: THREE.Material) => {
        if (onPole) return metal;
        if (mat.name.startsWith("Black")) return metal;
        if (mat.name.startsWith("Glow") || mat.name.startsWith("Metal")) return black;
        return mat;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
    return m;
  }, [gltf.scene, metal, env]);
  const parts = useMemo(() => {
    const pole = model.getObjectByName("Pole"), head = model.getObjectByName("Head");
    return { pole, head, headY: head?.position.y ?? 0, poleScale: pole?.scale.y ?? 1 };
  }, [model]);
  useEffect(() => {
    const dh = Math.max(-MIC_POLE_LEN * 0.8, extraHeight);
    if (parts.pole) parts.pole.scale.y = parts.poleScale * (MIC_POLE_LEN + dh) / MIC_POLE_LEN;
    if (parts.head) parts.head.position.y = parts.headY + dh;
  }, [extraHeight, parts]);
  return <primitive object={model} />;
}

idlePreload(MICROPHONE_PARTS_URL);

/* ------------------------------------------------------------- typewriter */

/** A sheet of paper with a few lines already typed on it. */
function makePaperTexture() {
  const W = 256, H = 290;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f6f2e6";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(40,36,32,0.75)";
  // typed lines start low on the page (the top is still to come off the roller)
  let y = 150;
  for (let i = 0; i < 9; i++) {
    const len = i === 8 ? 70 : 150 + ((i * 37) % 50);
    for (let x = 28; x < 28 + len; x += 7) {
      if ((x * 13 + i * 7) % 11 < 2) continue;   // gaps between words
      g.fillRect(x, y, 5, 3);
    }
    y += 13;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The paper coming out of the typewriter: tucked round the front of the
 * platen (roller), rising out of it and curling back over the top like a real
 * sheet. Shaped in Blender against the typewriter model and built
 * here in the typewriter GLB's own frame - the model sits turned ~19 degrees,
 * so the sheet follows its roller axis rather than the world axes.
 */
function makePaperGeometry() {
  const a = THREE.MathUtils.degToRad(19);
  // roller axis (u) and keyboard-ward direction (v), in three's y-up frame
  const ux = Math.cos(a), uz = -Math.sin(a);
  const vx = -Math.sin(a), vz = -Math.cos(a);
  const bx = 0.03, bz = 0.03;
  const W = 0.21, H = 0.27, N = 14;
  // (v, height) profile: wraps over the roller, then rises and curls back
  const prof: [number, number][] = [];
  const R = 0.022, rc: [number, number] = [-0.128, 0.058];
  for (const deg of [60, 80, 100]) {
    const t = THREE.MathUtils.degToRad(deg);
    prof.push([rc[0] + R * Math.cos(t), rc[1] + R * Math.sin(t)]);
  }
  for (let i = 1; i <= N; i++) {
    const tilt = THREE.MathUtils.degToRad(14 + 26 * Math.pow(i / N, 2.2));
    const [pv, py] = prof[prof.length - 1];
    prof.push([pv - (H / N) * Math.sin(tilt), py + (H / N) * Math.cos(tilt)]);
  }
  // arc length up the sheet -> texture v (0 at the roller, 1 at the top edge)
  const len = [0];
  for (let i = 1; i < prof.length; i++) len.push(len[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const total = len[len.length - 1];
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  prof.forEach(([pv, py], i) => {
    for (const [sx, tu] of [[-W / 2, 1], [W / 2, 0]] as const) {   // the reader at the keys sees -u on their right
      pos.push(bx + ux * sx + vx * pv, py, bz + uz * sx + vz * pv);
      uv.push(tu, len[i] / total);
    }
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k + 1, k - 2, k + 1, k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function TypewriterPaper() {
  const tex = useMemo(() => (typeof document === "undefined" ? null : makePaperTexture()), []);
  const geo = useMemo(() => makePaperGeometry(), []);
  useEffect(() => () => { tex?.dispose(); geo.dispose(); }, [tex, geo]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial map={tex} color="#ffffff" roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ------------------------------------------------------- chat-choice arrows */

export type ChatChoice = "phone" | "mic" | "type";

/** Every knob on the chat-choice arrows + their words (all lab sliders). */
export const CHAT_ARROW_DEFAULTS = {
  chatArrowScale: 1,
  chatArrowLength: 1,
  chatArrowLabelSize: 0.12,
  chatArrowLabelGap: 0.08,
  chatArrowHeadWidth: 0.11,
  chatArrowHeadHeight: 0.16,
  chatArrowShaftWidth: 0.07,
  chatArrowSides: 4,
  chatArrowYaw: 0,
  chatArrowPhoneYaw: 0,
  chatArrowMicYaw: 0,
  chatArrowTypeYaw: 0,
  chatArrowTiltX: 0,
  chatArrowTiltZ: 0,
  chatArrowSpinSpeed: 1.1,
  chatArrowBobAmount: 0.06,
  chatArrowBobSpeed: 2.6,
  chatArrowStagger: 1.7,
  chatArrowHoverGrow: 1.15,
  chatArrowColorR: 1,
  chatArrowColorG: 1,
  chatArrowColorB: 1,
  chatArrowShine: 0.5,
  chatArrowMetalness: 0,
  chatArrowGlow: 0.3,
  chatArrowHoverGlow: 0.8,
  chatArrowGlowPulse: 0.08,
  chatArrowGlowSpeed: 5,
  chatArrowOpacity: 1,
  chatTextFaceCamera: 1,
  chatTextYaw: 0,
  chatTextTiltX: 0,
  chatTextSpinSpeed: 0,
  chatTextBobWithArrow: 1,
  chatTextOffsetX: 0,
  chatTextOffsetZ: 0,
  chatTextSpacing: 0.08,
  chatTextDepth: 1,
  chatTextWave: 0,
  chatTextWaveSpeed: 1.6,
  chatTextWaviness: 0.6,
  chatTextColorR: 1,
  chatTextColorG: 1,
  chatTextColorB: 1,
  chatTextShine: 0.45,
  chatTextMetalness: 0,
  chatTextGlow: 0.3,
  chatTextHoverGlow: 0.8,
  chatTextGlowPulse: 0.08,
  chatTextOpacity: 1,
};
export type ChatArrowTune = typeof CHAT_ARROW_DEFAULTS;

const D2R = THREE.MathUtils.degToRad;
/** The arrows and words can't be hovered or clicked - only the props can. */
const noRaycast = () => {};

/** One glyph from the title screen's alphabet (public/letters/X.glb), with
 *  the title screen's per-letter wobble. */
function TitleLetter({ char, x, index, material, tune }: {
  char: string; x: number; index: number; material: THREE.Material; tune: React.MutableRefObject<ChatArrowTune>;
}) {
  const { scene } = useGLTF(`/letters/${char}.glb`);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) { m.material = material; m.castShadow = false; m.receiveShadow = false; m.raycast = noRaycast; } });
    return c;
  }, [scene, material]);
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const T = tune.current;
    const t = state.clock.elapsedTime * T.chatTextWaveSpeed + index * T.chatTextWaviness;
    g.position.y = Math.sin(t) * 0.025 * T.chatTextWave;
    g.rotation.z = Math.sin(t * 0.85 + index * 0.3) * 0.035 * T.chatTextWave;
  });
  return (
    <group position={[x, 0, 0]}>
      <group ref={ref}><primitive object={obj} /></group>
    </group>
  );
}

/** A word in the title-screen letters, centred, `size` tall. */
function TitleWord({ text, size, spacing, depth, material, tune }: {
  text: string; size: number; spacing: number; depth: number; material: THREE.Material; tune: React.MutableRefObject<ChatArrowTune>;
}) {
  const placed = useMemo(() => {
    const out: { c: string; x: number }[] = [];
    let cur = 0;
    for (const raw of text.toUpperCase()) {
      if (raw === " ") { cur += 0.55; continue; }
      const w = LETTER_WIDTHS[raw];
      if (w === undefined) continue;
      out.push({ c: raw, x: cur + w / 2 });
      cur += w + spacing;
    }
    const total = Math.max(cur - spacing, 0);
    return out.map((p) => ({ ...p, x: p.x - total / 2 }));
  }, [text, spacing]);
  return (
    <group scale={[size, size, size * depth]}>
      {placed.map((p, i) => <TitleLetter key={i} char={p.c} x={p.x} index={i} material={material} tune={tune} />)}
    </group>
  );
}

function applyLook(m: THREE.MeshStandardMaterial, r: number, g: number, b: number, shine: number, metal: number, glow: number, opacity: number) {
  m.color.setRGB(r, g, b, THREE.SRGBColorSpace);
  m.emissive.copy(m.color);
  m.emissiveIntensity = Math.max(0, glow);
  m.roughness = 1 - shine;
  m.metalness = metal;
  const tr = opacity < 0.999;
  if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
  m.opacity = opacity;
  m.depthWrite = !tr;
}

/**
 * A bobbing 3D arrow pointing down at a prop, with its word above it in the
 * title screen's letters - the "pick how you want to talk to the bears" cue
 * over the telephone (call), the microphone (talk) and the typewriter (type).
 * Everything about the arrow and the word comes from `tune` (the lab's
 * "Chat-choice arrows" sliders). Click the arrow or the word to choose.
 */
export function ChoiceArrow({
  position, label, phase = 0, yawExtraDeg = 0, tune: tuneIn, propHovered,
}: {
  position: [number, number, number];
  label: string;
  /** 0,1,2... - multiplied by chatArrowStagger so the three move out of step */
  phase?: number;
  /** this arrow's own extra turn (deg), applied to arrow and word */
  yawExtraDeg?: number;
  tune: Partial<ChatArrowTune>;
  /** true while the pointer is over this arrow's prop - lights it up too */
  propHovered?: () => boolean;
}) {
  const T: ChatArrowTune = { ...CHAT_ARROW_DEFAULTS };
  for (const k of Object.keys(CHAT_ARROW_DEFAULTS) as (keyof ChatArrowTune)[]) {
    const v = tuneIn[k];
    if (typeof v === "number" && Number.isFinite(v)) T[k] = v;
  }
  const tune = useRef(T);
  tune.current = T;
  const root = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const word = useRef<THREE.Group>(null);
  const hoverAmt = useRef(0);   // 0..1, eased: a touch bigger when hovered
  const mat = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const letterMat = useMemo(() => new THREE.MeshStandardMaterial(), []);
  useEffect(() => () => { mat.dispose(); letterMat.dispose(); }, [mat, letterMat]);

  const head = T.chatArrowHeadHeight, shaft = 0.18 * T.chatArrowLength;
  const top = head + shaft;            // arrow spans y 0 (tip) .. top
  const sides = Math.max(3, Math.round(T.chatArrowSides));

  useFrame((state, dt) => {
    const c = tune.current;
    const k = state.clock.elapsedTime + phase * c.chatArrowStagger;
    const by = Math.sin(k * c.chatArrowBobSpeed) * c.chatArrowBobAmount;
    if (bob.current) bob.current.position.y = by;
    if (spin.current) spin.current.rotation.y = D2R(c.chatArrowYaw + yawExtraDeg) + k * c.chatArrowSpinSpeed;
    if (word.current) {
      word.current.position.y = top + c.chatArrowLabelGap + (c.chatTextBobWithArrow >= 0.5 ? by : 0);
      word.current.rotation.set(D2R(c.chatTextTiltX), D2R(c.chatTextYaw + yawExtraDeg) + k * c.chatTextSpinSpeed, 0);
    }
    const on = !!propHovered?.();
    hoverAmt.current += ((on ? 1 : 0) - hoverAmt.current) * Math.min(1, dt * 10);
    const h = hoverAmt.current;
    root.current?.scale.setScalar((1 + (c.chatArrowHoverGrow - 1) * h) * c.chatArrowScale);
    const pulse = Math.sin(k * c.chatArrowGlowSpeed);
    applyLook(mat, c.chatArrowColorR, c.chatArrowColorG, c.chatArrowColorB, c.chatArrowShine, c.chatArrowMetalness,
      c.chatArrowGlow + pulse * c.chatArrowGlowPulse,
      c.chatArrowOpacity);
    applyLook(letterMat, c.chatTextColorR, c.chatTextColorG, c.chatTextColorB, c.chatTextShine, c.chatTextMetalness,
      c.chatTextGlow + pulse * c.chatTextGlowPulse,
      c.chatTextOpacity);
  });
  const wordMesh = (
    <TitleWord text={label} size={T.chatArrowLabelSize} spacing={T.chatTextSpacing} depth={T.chatTextDepth} material={letterMat} tune={tune} />
  );
  return (
    <group ref={root} position={position}>
      <group ref={bob}>
        <group rotation={[D2R(T.chatArrowTiltX), 0, D2R(T.chatArrowTiltZ)]}>
          <group ref={spin}>
            {/* head points down, tip at the group's origin */}
            <mesh position={[0, head / 2, 0]} rotation={[Math.PI, Math.PI / sides, 0]} material={mat} raycast={noRaycast}>
              <coneGeometry args={[T.chatArrowHeadWidth, head, sides]} />
            </mesh>
            <mesh position={[0, head + shaft / 2 - 0.005, 0]} rotation={[0, Math.PI / sides, 0]} material={mat} raycast={noRaycast}>
              <cylinderGeometry args={[T.chatArrowShaftWidth / Math.SQRT2, T.chatArrowShaftWidth / Math.SQRT2, shaft, sides]} />
            </mesh>
          </group>
        </group>
      </group>
      <group position={[T.chatTextOffsetX, 0, T.chatTextOffsetZ]}>
        {T.chatTextFaceCamera >= 0.5 ? (
          <Billboard><group ref={word}>{wordMesh}</group></Billboard>
        ) : (
          <group ref={word}>{wordMesh}</group>
        )}
      </group>
    </group>
  );
}
