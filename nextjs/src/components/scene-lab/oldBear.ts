/*
 * The old grey bear's LOOK, driven live from the lab.
 *
 * bear_old_grey.glb (scripts/old-bear/make_old_grey_bear.py) is the normal
 * bear rig with four extra meshes on the head and jaw joints - OldGlasses,
 * OldGlassesLens, OldBrows, OldBeard - and the ORIGINAL brown fur texture.
 * Everything that makes him old is applied here instead, from config, so it
 * can be tuned with sliders rather than by rebuilding the model:
 *
 *   coat    how grey (0 = his old brown, 1 = fully grey), how bright, how
 *           pale the face/muzzle goes, and a warm-cool tint - recoloured from
 *           the original texture on a canvas, cached per setting
 *           and the coat's COLOUR (what the fur is recoloured to)
 *   props   glasses size / height / how far down the snout, brows size, beard
 *           size / length / width, and a show toggle for each
 *   hair    the beard and eyebrows' colour
 *   lenses  how cloudy the glasses are, from clear to milky
 *
 * Colours are stored as sRGB 0..1 channels (what a colour picker shows), in
 * three number keys each so they save with the rest of the scene config.
 *
 * Each prop node sits at its own pivot on the face's axes (x right, y up the
 * face, z out along the snout), so scale and offsets here are about its own
 * middle - the beard hangs from its top, so "length" grows downwards.
 */

import { useEffect } from "react";
import * as THREE from "three";

export type OldBearLook = {
  grey: number;
  brightness: number;
  faceLight: number;
  warmth: number;
  glassesShow: number;
  glassesScale: number;
  glassesUp: number;
  glassesFwd: number;
  browShow: number;
  browScale: number;
  beardShow: number;
  beardScale: number;
  beardLength: number;
  beardWidth: number;
  /** The coat colour the fur is recoloured to (sRGB 0..1) - mid-tone fur
   *  lands on this; lighter and darker fur keep their shading around it. */
  coatR: number;
  coatG: number;
  coatB: number;
  /** Beard and eyebrow colour (sRGB 0..1). The brows sit a shade lighter. */
  hairR: number;
  hairG: number;
  hairB: number;
  /** Glasses: 0 = clear lenses, 1 = thick milky old-man lenses, 2 = solid
   *  bright white "can't see his eyes at all" cartoon lenses. */
  lensCloud: number;
  /** Which entry of OLD_BEAR_BEARD_STYLES to use. See that list. */
  beardStyle: number;
};

/**
 * Beard shapes.
 *
 * The GLB ships ONE beard mesh (1572 verts, hanging from y=0 down to y=-0.37),
 * so these are not six models - they are six deformations of that one mesh,
 * applied to its vertices. That keeps it all in config with no new art, and the
 * existing beardScale/Length/Width sliders still layer on top as multipliers.
 *
 *   taper  how much it narrows toward the chin. 0 = slab-sided, 1 = a point.
 *   fork   splits the bottom into two tufts. 0 = none.
 *   puff   front-to-back bulge, so it reads round rather than flat.
 *   drop   extra length, applied before the beardLength slider.
 *   jowl   widens the TOP, where it meets the jaw, for a mutton-chop spread.
 */
export type BeardStyle = {
  label: string;
  taper: number;
  fork: number;
  puff: number;
  drop: number;
  jowl: number;
};

export const OLD_BEAR_BEARD_STYLES: BeardStyle[] = [
  { label: "0 - Original (mesh as modelled)", taper: 0.00, fork: 0.00, puff: 1.00, drop: 1.00, jowl: 1.00 },
  { label: "1 - Trimmed, square",             taper: 0.15, fork: 0.00, puff: 0.85, drop: 0.70, jowl: 1.00 },
  { label: "2 - Long wizard point",           taper: 0.80, fork: 0.00, puff: 0.95, drop: 1.70, jowl: 0.95 },
  { label: "3 - Big bushy",                   taper: 0.10, fork: 0.00, puff: 1.45, drop: 1.15, jowl: 1.25 },
  { label: "4 - Forked twin-tail",            taper: 0.55, fork: 0.55, puff: 1.00, drop: 1.45, jowl: 1.00 },
  { label: "5 - Goatee (narrow)",             taper: 0.45, fork: 0.00, puff: 0.90, drop: 1.05, jowl: 0.45 },
];

export const OLD_BEAR_LOOK_DEFAULTS: OldBearLook = {
  grey: 0.55,
  brightness: 0.85,
  faceLight: 0.35,
  warmth: 0.25,
  glassesShow: 1,
  glassesScale: 1,
  glassesUp: 0,
  glassesFwd: 0,
  browShow: 1,
  browScale: 1,
  beardShow: 1,
  beardScale: 1,
  beardLength: 1,
  beardWidth: 1,
  // the grey the coat has always been (was baked into the recolour maths)
  coatR: 0.711,
  coatG: 0.701,
  coatB: 0.689,
  // the beard mesh's own white
  hairR: 0.906,
  hairG: 0.901,
  hairB: 0.886,
  lensCloud: 0,
  beardStyle: 0,
};

/** Every number in the look, for building slider UIs from one list (the main
 *  Scene Lab and the rocking-chair lab both use it). `key` is the look field,
 *  `configKey` the campfireScene.json key it saves under. */
export const OLD_BEAR_SLIDERS: { key: keyof OldBearLook; label: string; min: number; max: number; step: number }[] = [
  { key: "grey", label: "Recolour (0 = his old brown)", min: 0, max: 1, step: 0.01 },
  { key: "brightness", label: "Coat brightness", min: 0.3, max: 1.8, step: 0.01 },
  { key: "faceLight", label: "Pale face / muzzle", min: 0, max: 1, step: 0.01 },
  { key: "warmth", label: "Tint (cool / warm)", min: -1, max: 1, step: 0.01 },
  { key: "lensCloud", label: "Glasses cloudiness", min: 0, max: 2, step: 0.01 },
  { key: "glassesShow", label: "Glasses on", min: 0, max: 1, step: 1 },
  { key: "glassesScale", label: "Glasses size", min: 0.4, max: 2, step: 0.01 },
  { key: "glassesUp", label: "Glasses up / down", min: -0.3, max: 0.3, step: 0.005 },
  { key: "glassesFwd", label: "Glasses along snout", min: -0.3, max: 0.3, step: 0.005 },
  { key: "browShow", label: "Eyebrows on", min: 0, max: 1, step: 1 },
  { key: "browScale", label: "Eyebrow size", min: 0.3, max: 2, step: 0.01 },
  { key: "beardStyle", label: "Beard SHAPE (0-5, see OLD_BEAR_BEARD_STYLES)", min: 0, max: 5, step: 1 },
  { key: "beardShow", label: "Beard on", min: 0, max: 1, step: 1 },
  { key: "beardScale", label: "Beard size", min: 0.3, max: 2, step: 0.01 },
  { key: "beardLength", label: "Beard length", min: 0.3, max: 2.5, step: 0.01 },
  { key: "beardWidth", label: "Beard width", min: 0.4, max: 1.8, step: 0.01 },
];

/** The colour pickers: which three look fields make up each colour. */
export const OLD_BEAR_COLORS: { label: string; keys: [keyof OldBearLook, keyof OldBearLook, keyof OldBearLook] }[] = [
  { label: "Coat colour", keys: ["coatR", "coatG", "coatB"] },
  { label: "Beard + eyebrow colour", keys: ["hairR", "hairG", "hairB"] },
];

/** Look field -> scene-config key: grey -> oldBearGrey, coatR -> oldBearCoatR. */
export function oldBearConfigKey(k: keyof OldBearLook): string {
  return `oldBear${k.charAt(0).toUpperCase()}${k.slice(1)}`;
}

/** sRGB 0..1 channels <-> "#rrggbb", for <input type="color">. */
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* --- the coat ------------------------------------------------------------- */

const TEX_SIZE = 1024;
const sourcePixels = new WeakMap<object, ImageData>();
const coatCache = new Map<string, THREE.CanvasTexture>();

function readSource(img: CanvasImageSource & { width: number; height: number }): ImageData | null {
  const hit = sourcePixels.get(img);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = TEX_SIZE;
  c.height = TEX_SIZE;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, TEX_SIZE, TEX_SIZE);
  const data = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
  sourcePixels.set(img, data);
  return data;
}

/**
 * The same split the offline recolour used (scripts/old-bear/recolor_old_grey.py):
 * the painted texture has four kinds of pixel - fur, the paler face/muzzle,
 * the red of the mouth, and near-black (nose, eyes, gutters) - and each goes
 * grey its own way. `grey` then blends from the original towards that.
 */
function recolour(src: ImageData, look: OldBearLook): ImageData {
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const d = out.data;
  const g = Math.min(1, Math.max(0, look.grey));
  const br = Math.max(0, look.brightness);
  const face = Math.min(1, Math.max(0, look.faceLight));
  const w = Math.max(-1, Math.min(1, look.warmth));
  const tr = 1 + 0.07 * w;
  const tb = 1 - 0.09 * w;
  // The coat colour, in the texture's own (linear - see coatTexture) values,
  // scaled so mid-tone fur (v ~ 0.45) lands exactly on it.
  const coat = new THREE.Color().setRGB(look.coatR, look.coatG, look.coatB, THREE.SRGBColorSpace);
  const kr = coat.r / 0.45, kg = coat.g / 0.45, kb = coat.b / 0.45;
  for (let i = 0; i < s.length; i += 4) {
    const r = s[i] / 255, gg = s[i + 1] / 255, b = s[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx > 1e-4 ? (mx - mn) / mx : 0;
    const dd = Math.max(mx - mn, 1e-6);
    let h = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
    h *= 60; if (h < 0) h += 360;
    const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    let or = r * br, og = gg * br, ob = b * br;
    let tr2: number, tg2: number, tb2: number;
    const red = sat > 0.55 && (h < 8 || h > 345) && mx > 0.25;
    const light = !red && mx > 0.55;
    const dark = !red && !light && lum < 0.035;
    if (dark) {
      tr2 = r; tg2 = gg; tb2 = b; or = r; og = gg; ob = b;
    } else if (red) {
      const k = 0.6 + mx * 0.6;
      tr2 = 0.55 * k; tg2 = 0.3 * k; tb2 = 0.31 * k;
    } else if (light) {
      const v = Math.min(0.92, (0.3 + lum * 0.6 + 0.3 * face) * br);
      tr2 = v * 1.02 * tr; tg2 = v; tb2 = v * 0.94 * tb;
    } else {
      const v = Math.min(0.8, (0.13 + lum * 1.65) * br);
      tr2 = v * kr * tr; tg2 = v * kg; tb2 = v * kb * tb;
    }
    d[i] = Math.round(Math.min(1, or + (tr2 - or) * g) * 255);
    d[i + 1] = Math.round(Math.min(1, og + (tg2 - og) * g) * 255);
    d[i + 2] = Math.round(Math.min(1, ob + (tb2 - ob) * g) * 255);
    d[i + 3] = s[i + 3];
  }
  return out;
}

function coatKey(look: OldBearLook) {
  const q = (v: number) => Math.round(v * 100);
  return [look.grey, look.brightness, look.faceLight, look.warmth, look.coatR, look.coatG, look.coatB].map(q).join("|");
}

/** The recoloured coat for these settings, built once and cached. */
function coatTexture(original: THREE.Texture, look: OldBearLook): THREE.Texture | null {
  const key = coatKey(look);
  const hit = coatCache.get(key);
  if (hit) return hit;
  const img = original.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width) return null;
  const src = readSource(img);
  if (!src) return null;
  const c = document.createElement("canvas");
  c.width = TEX_SIZE;
  c.height = TEX_SIZE;
  c.getContext("2d")?.putImageData(recolour(src, look), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = original.flipY;
  // The Wild Poly fur texture holds LINEAR values though the GLB tags it
  // sRGB; the site's Animal corrects the tag (see its material pass), and
  // saying so here keeps every old bear - OnlyBears, the lab - the same.
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.wrapS = original.wrapS;
  t.wrapT = original.wrapT;
  t.magFilter = original.magFilter;
  t.minFilter = original.minFilter;
  t.anisotropy = original.anisotropy;
  // keep the cache small: a slider drag walks through many settings
  if (coatCache.size > 12) {
    const first = coatCache.keys().next().value;
    if (first !== undefined) { coatCache.get(first)?.dispose(); coatCache.delete(first); }
  }
  coatCache.set(key, t);
  return t;
}

/* --- props ---------------------------------------------------------------- */

type Rest = { p: THREE.Vector3; s: THREE.Vector3 };

function rest(o: THREE.Object3D): Rest {
  const u = o.userData as { oldBearRest?: Rest };
  if (!u.oldBearRest) u.oldBearRest = { p: o.position.clone(), s: o.scale.clone() };
  return u.oldBearRest;
}

/**
 * Reshape the beard mesh into one of OLD_BEAR_BEARD_STYLES.
 *
 * The beard hangs from its pivot: y = 0 at the jaw, down to y = -0.37 at the
 * tip. So `t` below is 0 at the jawline and 1 at the tip, and every style is
 * expressed as "how wide/deep/long is it at depth t".
 *
 * The geometry is cloned on first touch and the untouched positions kept in
 * userData, so each rebuild starts from the original mesh rather than
 * compounding on the last deformation. Cloning also stops the two old bears
 * (rocking chair and the OnlyBears gag) sharing one buffer - three's
 * clone(true) shares geometry between instances, so deforming in place would
 * have one bear's style silently rewrite the other's.
 *
 * Only runs when the style index actually changes, not every frame.
 */
function applyBeardStyle(mesh: THREE.Mesh, styleIndex: number) {
  const i = Math.max(0, Math.min(OLD_BEAR_BEARD_STYLES.length - 1, Math.round(styleIndex)));
  const ud = mesh.userData as { beardBase?: Float32Array; beardStyleApplied?: number };
  if (ud.beardStyleApplied === i) return;

  if (!ud.beardBase) {
    mesh.geometry = mesh.geometry.clone();
    const src = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    ud.beardBase = new Float32Array(src.array as ArrayLike<number>);
  }
  const base = ud.beardBase;
  const attr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const s = OLD_BEAR_BEARD_STYLES[i];

  // depth of the mesh below the pivot, read off the base so it is exact
  let minY = 0;
  for (let k = 1; k < base.length; k += 3) if (base[k] < minY) minY = base[k];
  const depth = Math.max(1e-4, -minY);

  for (let k = 0; k < base.length; k += 3) {
    const x0 = base[k], y0 = base[k + 1], z0 = base[k + 2];
    const t = Math.max(0, Math.min(1, -y0 / depth));       // 0 jaw -> 1 tip
    // narrow toward the tip, widen at the jaw
    const w = (1 - s.taper * t) * (1 + (s.jowl - 1) * (1 - t));
    let x = x0 * w;
    const z = z0 * w * s.puff;
    const y = y0 * s.drop;
    // fork: pull the two halves apart low down, and lift the centre between
    // them so the split reads as a notch rather than a straight cut
    if (s.fork > 0) {
      const f = s.fork * t * t;
      x += Math.sign(x0) * f * depth * 0.45;
      const centre = 1 - Math.min(1, Math.abs(x0) / (depth * 0.35));
      arr[k + 1] = y + centre * f * depth * 0.5;
    } else {
      arr[k + 1] = y;
    }
    arr[k] = x;
    arr[k + 2] = z;
  }
  attr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
  ud.beardStyleApplied = i;
}

const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const LENS_CLEAR = new THREE.Color(0.78, 0.9, 0.97);
const LENS_MILKY = new THREE.Color(0.9, 0.9, 0.88);
const LENS_WHITE = new THREE.Color(1, 1, 1);

function propMaterial(o: THREE.Object3D): THREE.MeshStandardMaterial | null {
  const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
  return m && !Array.isArray(m) && m.isMeshStandardMaterial ? m : null;
}

/**
 * Apply a look to one old-bear model. Cheap for the props (a few node
 * writes); the coat only rebuilds when its four numbers change, and is shared
 * between every old bear on the page.
 */
export function applyOldBearLook(model: THREE.Object3D, look: OldBearLook) {
  model.traverse((o) => {
    switch (o.name) {
      case "OldGlasses":
      case "OldGlassesLens": {
        const r = rest(o);
        o.visible = look.glassesShow >= 0.5;
        o.scale.copy(r.s).multiplyScalar(Math.max(0.05, look.glassesScale));
        // offsets along the face: up the face, and out along the snout
        tmpV.set(0, look.glassesUp, look.glassesFwd).applyQuaternion(o.quaternion);
        o.position.copy(r.p).add(tmpV);
        const lens = o.name === "OldGlassesLens" ? propMaterial(o) : null;
        if (lens) {
          // 0..1  clear (the faint blue glass it was modelled with) to milky,
          //       nearly opaque and matte, the way old lenses fog over
          // 1..2  on to solid white that glows a little, so it still reads as
          //       white in the dim, firelit cabin instead of going grey
          const c = Math.max(0, Math.min(2, look.lensCloud));
          const a = Math.min(1, c);
          const b = Math.max(0, c - 1);
          lens.color.copy(LENS_CLEAR).lerp(LENS_MILKY, a).lerp(LENS_WHITE, b);
          lens.opacity = Math.min(1, 0.22 + 0.7 * a + 0.08 * b);
          lens.roughness = Math.min(1, 0.05 + 0.85 * a + 0.1 * b);
          lens.emissive.setScalar(0.45 * b);
          const solid = lens.opacity >= 0.999;
          if (lens.transparent === solid) { lens.transparent = !solid; lens.needsUpdate = true; }
          lens.depthWrite = solid;
        }
        break;
      }
      case "OldBrows": {
        const r = rest(o);
        o.visible = look.browShow >= 0.5;
        o.scale.copy(r.s).multiplyScalar(Math.max(0.05, look.browScale));
        const m = propMaterial(o);
        if (m) {
          // a shade lighter than the beard, as the model had them
          tmpC.setRGB(look.hairR, look.hairG, look.hairB, THREE.SRGBColorSpace);
          m.color.setRGB(Math.min(1, tmpC.r * 1.075), Math.min(1, tmpC.g * 1.075), Math.min(1, tmpC.b * 1.075));
        }
        break;
      }
      case "OldBeard": {
        const r = rest(o);
        o.visible = look.beardShow >= 0.5;
        // Shape first (vertex-level), then the scale sliders on top of it.
        const bm = o as THREE.Mesh;
        if (bm.isMesh) applyBeardStyle(bm, look.beardStyle ?? 0);
        const k = Math.max(0.05, look.beardScale);
        o.scale.set(r.s.x * k * look.beardWidth, r.s.y * k * look.beardLength, r.s.z * k);
        const m = propMaterial(o);
        if (m) { m.color.setRGB(look.hairR, look.hairG, look.hairB, THREE.SRGBColorSpace); }
        break;
      }
      default: {
        const m = o as THREE.Mesh;
        if (!m.isMesh) break;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (!mat || Array.isArray(mat) || !mat.map) break;
        const ud = mat.userData as { oldBearOriginalMap?: THREE.Texture };
        if (!ud.oldBearOriginalMap) ud.oldBearOriginalMap = mat.map;
        const coat = coatTexture(ud.oldBearOriginalMap, look);
        if (coat && mat.map !== coat) { mat.map = coat; mat.needsUpdate = true; }
      }
    }
  });
}

/** Read the look out of the scene config (keys `oldBear*`), with defaults. */
export function oldBearLookFromConfig(c: Partial<Record<string, unknown>>): OldBearLook {
  const out = { ...OLD_BEAR_LOOK_DEFAULTS };
  for (const k of Object.keys(out) as (keyof OldBearLook)[]) {
    const v = c[oldBearConfigKey(k)];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * Keep a model in step with the look. Slider drags arrive many times a
 * second, so the (canvas) coat rebuild is debounced; the very first
 * application is immediate so he never shows up brown.
 */
export function useOldBearLook(model: THREE.Object3D | null | undefined, look: OldBearLook) {
  const key = JSON.stringify(look);
  useEffect(() => {
    if (!model) return;
    const ud = model.userData as { oldBearApplied?: boolean };
    if (!ud.oldBearApplied) {
      ud.oldBearApplied = true;
      applyOldBearLook(model, look);
      return;
    }
    const id = setTimeout(() => applyOldBearLook(model, look), 70);
    return () => clearTimeout(id);
    // `key` is the look's identity; the object itself is rebuilt each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, key]);
}
