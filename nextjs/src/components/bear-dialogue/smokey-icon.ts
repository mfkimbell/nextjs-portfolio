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
const MIN_TEXT_ROW_REM = 2;

export type SmokeyIconSettings = {
  sizeRem: number;
  /** 0 = place from the plaque centre with xRem/yRem, 1 = pin to the bottom-right corner. */
  anchor: number;
  /** Centre-anchored offsets. */
  xRem: number;
  yRem: number;
  /** Bottom-right-anchored insets, corner to icon centre. */
  insetXRem: number;
  insetYRem: number;
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
  minHeightRem: number;
  paddingXRem: number;
  paddingYRem: number;
  clearanceRem: number;
  autoClearanceOn: number;
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

export const isAnchored = (icon: SmokeyIconSettings): boolean => icon.anchor >= 0.5;

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

/** Tailwind classes for the icon, which differ by anchor. */
export const smokeyIconClassName = (icon: SmokeyIconSettings): string =>
  isAnchored(icon)
    ? "pointer-events-none absolute z-10 object-contain"
    : "pointer-events-none absolute left-1/2 top-1/2 z-10 object-contain";

export const smokeyIconStyle = (icon: SmokeyIconSettings): CSSProperties => {
  const shared = {
    width: `${icon.sizeRem}rem`,
    height: `${icon.sizeRem}rem`,
    opacity: icon.opacity,
    filter: smokeyIconFilter(icon),
  };
  if (isAnchored(icon)) {
    const inset = resolvedInsetsRem(icon);
    // right/bottom follow the plaque's real corner at any width or height, so
    // the icon keeps its distance from it instead of drifting with the centre.
    return {
      ...shared,
      right: `${round(inset.x)}rem`,
      bottom: `${round(inset.y)}rem`,
      transform: `translate(50%, 50%) rotate(${icon.tiltDeg}deg)`,
    };
  }
  return {
    ...shared,
    transform: `translate(-50%, -50%) translate(${icon.xRem}rem, ${icon.yRem}rem) rotate(${icon.tiltDeg}deg)`,
  };
};

/**
 * Padding for the text block so the copy never touches the icon.
 *
 * The icon is absolutely centred and then offset, so it only collides with the
 * text when its box overlaps the text rect on BOTH axes. When it does, the copy
 * is pushed along whichever axis needs less room, and the push is measured from
 * the icon's visual edge — outline and shadow bleed included — not from the
 * image box.
 */
export const smokeyTextPadding = (
  icon: SmokeyIconSettings,
  layout: SmokeyTextLayout,
): CSSProperties => {
  const base: CSSProperties = {
    paddingTop: `${layout.paddingYRem}rem`,
    paddingBottom: `${layout.paddingYRem}rem`,
    paddingLeft: `${layout.paddingXRem}rem`,
    paddingRight: `${layout.paddingXRem}rem`,
  };

  if (layout.autoClearanceOn < 0.5 || icon.opacity <= 0) return base;

  const reach = smokeyIconReachRem(icon);
  const halfWidth = layout.widthRem / 2;
  const halfHeight = layout.minHeightRem / 2;
  const capX = Math.max(0, halfWidth - layout.paddingXRem - MIN_TEXT_COLUMN_REM);
  const capY = Math.max(0, halfHeight - layout.paddingYRem - MIN_TEXT_ROW_REM);

  // Pinned to the corner, the overlap depends only on the inset and the reach,
  // never on how wide or tall the plaque happens to be.
  if (isAnchored(icon)) {
    const inset = resolvedInsetsRem(icon);
    const overX = inset.x + reach - layout.paddingXRem;
    const overY = inset.y + reach - layout.paddingYRem;
    if (overX <= 0 || overY <= 0) return base;
    const wantX = overX + layout.clearanceRem;
    const wantY = overY + layout.clearanceRem;
    const okX = wantX <= capX;
    const okY = wantY <= capY;
    const takeX = okX && okY ? wantX <= wantY : okX || (!okY && capX >= capY);
    return takeX
      ? { ...base, paddingRight: `${round(layout.paddingXRem + Math.min(wantX, capX))}rem` }
      : { ...base, paddingBottom: `${round(layout.paddingYRem + Math.min(wantY, capY))}rem` };
  }

  const overlapX = icon.xRem >= 0
    ? halfWidth - layout.paddingXRem - (icon.xRem - reach)
    : icon.xRem + reach - (layout.paddingXRem - halfWidth);
  const overlapY = icon.yRem >= 0
    ? halfHeight - layout.paddingYRem - (icon.yRem - reach)
    : icon.yRem + reach - (layout.paddingYRem - halfHeight);

  // Clear of the text rect on at least one axis: nothing to push.
  if (overlapX <= 0 || overlapY <= 0) return base;

  // What each axis would need, and the most it can give up before the text
  // column collapses.
  const needX = overlapX + layout.clearanceRem;
  const needY = overlapY + layout.clearanceRem;
  const fitsX = needX <= capX;
  const fitsY = needY <= capY;

  // Prefer the cheaper axis, but only among the axes that can actually clear
  // the icon. If neither can, take the one that gets furthest.
  const useX = fitsX && fitsY ? needX <= needY : fitsX || (!fitsY && capX >= capY);

  if (useX) {
    const addX = Math.min(needX, capX);
    return icon.xRem >= 0
      ? { ...base, paddingRight: `${round(layout.paddingXRem + addX)}rem` }
      : { ...base, paddingLeft: `${round(layout.paddingXRem + addX)}rem` };
  }
  const addY = Math.min(needY, capY);
  return icon.yRem >= 0
    ? { ...base, paddingBottom: `${round(layout.paddingYRem + addY)}rem` }
    : { ...base, paddingTop: `${round(layout.paddingYRem + addY)}rem` };
};

/** @deprecated use rgbaFromChannels from ./color */
export const smokeyRgba = rgbaFromChannels;
