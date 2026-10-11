import type { CSSProperties } from "react";
import { rgbaFromChannels } from "./color";

// Shadow, outline and glow for the Smokey head icon, plus the text padding that
// keeps the dialogue copy from touching it.
//
// smokey_head.png is an alpha cutout (about two thirds transparent), so a CSS
// border or box-shadow would trace the image's bounding box rather than the
// head. Everything here is built from chained drop-shadow(), which follows the
// alpha channel: four unit offsets per pass build the outline, and each pass
// compounds on the one before it.

const PX_PER_REM = 16;
const MAX_OUTLINE_PASSES = 8;
const MIN_TEXT_COLUMN_REM = 4;

export type SmokeyIconSettings = {
  sizeRem: number;
  /** Insets from the plaque's bottom-right corner to the icon's centre. */
  insetXRem: number;
  insetYRem: number;
  /** The icon's own breathing room, kept clear of text on each axis. */
  marginXRem: number;
  marginYRem: number;
  /** Clamp the insets so the icon and its effects cannot cross the plaque edge. */
  keepInside: number;
  tiltDeg: number;
  opacity: number;
  outlineOn: number;
  outlineWidthPx: number;
  /** Fully resolved CSS color, alpha included. */
  outlineColor: string;
  shadowXRem: number;
  shadowYRem: number;
  shadowBlurPx: number;
  shadowLayers: number;
  shadowOpacity: number;
  shadowColor: string;
  glowPx: number;
  glowPasses: number;
  glowOpacity: number;
  glowColor: string;
};

export type SmokeyTextLayout = {
  widthRem: number;
  /** Only the two sides the icon's corner can reach matter here. */
  paddingRightRem: number;
  paddingBottomRem: number;
};

const round = (value: number) => Math.round(value * 1000) / 1000;

const outlineWidthPx = (icon: SmokeyIconSettings) =>
  icon.outlineOn >= 0.5 ? Math.max(0, icon.outlineWidthPx) : 0;

const hasShadow = (icon: SmokeyIconSettings) =>
  icon.shadowOpacity > 0 && (icon.shadowXRem !== 0 || icon.shadowYRem !== 0 || icon.shadowBlurPx > 0);

const hasGlow = (icon: SmokeyIconSettings) => icon.glowOpacity > 0 && icon.glowPx > 0;

/** The chained drop-shadow stack: outline first, then cast shadow, then glow. */
export const smokeyIconFilter = (icon: SmokeyIconSettings): string | undefined => {
  const parts: string[] = [];

  const outline = outlineWidthPx(icon);
  if (outline > 0) {
    const passes = Math.min(MAX_OUTLINE_PASSES, Math.max(1, Math.round(outline)));
    const step = round(outline / passes);
    for (let pass = 0; pass < passes; pass += 1) {
      parts.push(
        `drop-shadow(${step}px 0 0 ${icon.outlineColor})`,
        `drop-shadow(-${step}px 0 0 ${icon.outlineColor})`,
        `drop-shadow(0 ${step}px 0 ${icon.outlineColor})`,
        `drop-shadow(0 -${step}px 0 ${icon.outlineColor})`,
      );
    }
  }

  if (hasShadow(icon)) {
    const layers = Math.max(1, Math.round(icon.shadowLayers));
    for (let layer = 1; layer <= layers; layer += 1) {
      const fraction = layer / layers;
      parts.push(
        `drop-shadow(${round(icon.shadowXRem * fraction)}rem ${round(icon.shadowYRem * fraction)}rem ${round(icon.shadowBlurPx * fraction)}px ${icon.shadowColor})`,
      );
    }
  }

  if (hasGlow(icon)) {
    const passes = Math.max(1, Math.round(icon.glowPasses));
    for (let pass = 0; pass < passes; pass += 1) {
      parts.push(`drop-shadow(0 0 ${round(icon.glowPx)}px ${icon.glowColor})`);
    }
  }

  return parts.length > 0 ? parts.join(" ") : undefined;
};

/** How far the effects spill past the artwork, in rem. */
export const smokeyIconBleedRem = (icon: SmokeyIconSettings): number => {
  const outline = outlineWidthPx(icon) / PX_PER_REM;
  const shadow = hasShadow(icon)
    ? Math.max(Math.abs(icon.shadowXRem), Math.abs(icon.shadowYRem)) + icon.shadowBlurPx / PX_PER_REM
    : 0;
  const glow = hasGlow(icon)
    ? (icon.glowPx * Math.max(1, Math.round(icon.glowPasses))) / PX_PER_REM
    : 0;
  return outline + Math.max(shadow, glow);
};

/** Half-width of the icon including everything drawn around it. */
export const smokeyIconReachRem = (icon: SmokeyIconSettings): number =>
  icon.sizeRem / 2 + smokeyIconBleedRem(icon);

/**
 * The corner insets actually used, after the keep-inside clamp. An inset
 * smaller than the icon's reach would hang the artwork (or its shadow) off the
 * plaque, which is exactly what goes wrong when the bubble narrows on a small
 * screen, so the clamp floors each inset at the reach.
 */
export const resolvedInsetsRem = (icon: SmokeyIconSettings): { x: number; y: number } => {
  const reach = smokeyIconReachRem(icon);
  const clamp = icon.keepInside >= 0.5;
  return {
    x: clamp ? Math.max(icon.insetXRem, reach) : icon.insetXRem,
    y: clamp ? Math.max(icon.insetYRem, reach) : icon.insetYRem,
  };
};

export const SMOKEY_ICON_CLASS = "pointer-events-none absolute z-10 object-contain";

export const smokeyIconStyle = (icon: SmokeyIconSettings): CSSProperties => {
  const inset = resolvedInsetsRem(icon);
  // right/bottom follow the plaque's real corner at any width or height, so
  // the icon keeps its distance from it instead of drifting with the centre.
  return {
    width: `${icon.sizeRem}em`,
    height: `${icon.sizeRem}em`,
    opacity: icon.opacity,
    filter: smokeyIconFilter(icon),
    right: `${round(inset.x)}em`,
    bottom: `${round(inset.y)}em`,
    transform: `translate(50%, 50%) rotate(${icon.tiltDeg}deg)`,
  };
};

/** Silhouette points, relative to the icon box centre, in units of its side. */
export type ArtworkOutline = readonly (readonly [number, number])[];

export type SmokeyTextReserve = {
  reserveWidthRem: number;
  reserveHeightRem: number;
  /** CSS shape-outside for the reserve float, tracing the bear's silhouette. */
  shape?: string;
};

export const NO_TEXT_RESERVE: SmokeyTextReserve = { reserveWidthRem: 0, reserveHeightRem: 0 };

const OUTLINE_BANDS = 40;

/**
 * What the text must flow around in the bottom-right corner.
 *
 * With the artwork's outline, that is the bear's actual silhouette: rotated by
 * the icon's tilt, grown by the margin (plus outline/shadow/glow bleed) on
 * each axis, and returned as a shape-outside polygon so each line of copy
 * stops exactly the margin away from whatever part of the bear is level with
 * it — the brim tip, the top of the hat, the cheek. Lines below the bear wrap
 * full width again. Without an outline (not loaded yet, or unreadable) it
 * falls back to the icon's square box.
 *
 * Width is capped so a huge icon cannot squeeze the copy below a readable
 * column.
 */
export const smokeyTextReserve = (
  icon: SmokeyIconSettings,
  layout: SmokeyTextLayout,
  outline?: ArtworkOutline | null,
): SmokeyTextReserve => {
  if (icon.opacity <= 0) return NO_TEXT_RESERVE;

  const inset = resolvedInsetsRem(icon);
  const maxWidth = Math.max(0, layout.widthRem - layout.paddingRightRem - MIN_TEXT_COLUMN_REM);

  if (!outline || outline.length < 3) {
    const reach = smokeyIconReachRem(icon);
    const reserveWidthRem = Math.min(
      Math.max(0, inset.x + reach + icon.marginXRem - layout.paddingRightRem),
      maxWidth,
    );
    const reserveHeightRem = Math.max(0, inset.y + reach + icon.marginYRem - layout.paddingBottomRem);
    return { reserveWidthRem, reserveHeightRem };
  }

  const bleed = smokeyIconBleedRem(icon);
  // Negative margins are allowed: they tuck the copy slightly under the art.
  const marginX = icon.marginXRem + bleed;
  const marginY = icon.marginYRem + bleed;

  // Silhouette in em, rotated as drawn, relative to the icon's centre.
  const theta = (icon.tiltDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  let top = Infinity;
  let bottom = -Infinity;
  const points = outline.map(([nx, ny]) => {
    const x = nx * icon.sizeRem;
    const y = ny * icon.sizeRem;
    const px = x * cos - y * sin;
    const py = x * sin + y * cos;
    if (py < top) top = py;
    if (py > bottom) bottom = py;
    return [px, py] as const;
  });
  const step = Math.max(1e-6, (bottom - top) / OUTLINE_BANDS);

  // Leftmost point per horizontal band; gaps take a neighbour's value.
  const leftmost = new Array<number>(OUTLINE_BANDS).fill(Infinity);
  for (const [px, py] of points) {
    const band = Math.min(OUTLINE_BANDS - 1, Math.max(0, Math.floor((py - top) / step)));
    if (px < leftmost[band]) leftmost[band] = px;
  }
  for (let i = 1; i < OUTLINE_BANDS; i += 1) if (!Number.isFinite(leftmost[i])) leftmost[i] = leftmost[i - 1];
  for (let i = OUTLINE_BANDS - 2; i >= 0; i -= 1) if (!Number.isFinite(leftmost[i])) leftmost[i] = leftmost[i + 1];

  // Grow by the margin: sideways directly, vertically by letting each band
  // take the leftmost edge of every band within marginY of it.
  const spread = Math.min(OUTLINE_BANDS, Math.max(0, Math.ceil(marginY / step)));
  const edge = leftmost.map((_, i) => {
    let min = Infinity;
    for (let j = Math.max(0, i - spread); j <= Math.min(OUTLINE_BANDS - 1, i + spread); j += 1) {
      if (leftmost[j] < min) min = leftmost[j];
    }
    return min - marginX;
  });

  // Plaque-corner space: the text box's bottom-right corner is the origin.
  const toX = (x: number) => x - inset.x + layout.paddingRightRem;
  const toY = (y: number) => y - inset.y + layout.paddingBottomRem;
  const shapeTop = top - marginY;
  const shapeBottom = bottom + marginY;

  const reserveWidthRem = Math.min(Math.max(0, -toX(Math.min(...edge))), maxWidth);
  const reserveHeightRem = Math.max(0, -toY(shapeTop));
  if (reserveWidthRem <= 0 || reserveHeightRem <= 0) return NO_TEXT_RESERVE;

  // Float space: origin at the float's top-left, float bottom-right on the corner.
  const fx = (x: number) => round(Math.min(reserveWidthRem, Math.max(0, reserveWidthRem + toX(x))));
  const fy = (y: number) => round(Math.min(reserveHeightRem, Math.max(0, reserveHeightRem + toY(y))));
  const vertices: string[] = [`${fx(edge[0])}em ${fy(shapeTop)}em`];
  for (let i = 0; i < OUTLINE_BANDS; i += 1) {
    const y0 = top + i * step;
    vertices.push(`${fx(edge[i])}em ${fy(y0)}em`, `${fx(edge[i])}em ${fy(y0 + step)}em`);
  }
  vertices.push(
    `${fx(edge[OUTLINE_BANDS - 1])}em ${fy(shapeBottom)}em`,
    `${round(reserveWidthRem)}em ${fy(shapeBottom)}em`,
    `${round(reserveWidthRem)}em ${fy(shapeTop)}em`,
  );

  return { reserveWidthRem, reserveHeightRem, shape: `polygon(${vertices.join(", ")})` };
};

/** @deprecated use rgbaFromChannels from ./color */
export const smokeyRgba = rgbaFromChannels;
