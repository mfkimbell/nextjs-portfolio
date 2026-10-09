const round = (value: number) => Math.round(value * 1000) / 1000;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** `rgb(r g b)` from the 0-1 channel triples the scene config stores. */
export const rgbFromChannels = (r: number, g: number, b: number): string =>
  `rgb(${round(clamp01(r) * 255)} ${round(clamp01(g) * 255)} ${round(clamp01(b) * 255)})`;

/** `rgb(r g b / a)` from the 0-1 channel triples the scene config stores. */
export const rgbaFromChannels = (r: number, g: number, b: number, alpha: number): string =>
  `rgb(${round(clamp01(r) * 255)} ${round(clamp01(g) * 255)} ${round(clamp01(b) * 255)} / ${round(alpha)})`;

/**
 * The hard offset shadow under a name tag, derived from its fill so the two
 * never drift apart when the fill is retuned. A factor near 0.65 reproduces
 * the shadows the tags were hand-picked with.
 */
export const darkenedRgb = (r: number, g: number, b: number, factor: number): string =>
  rgbFromChannels(r * factor, g * factor, b * factor);
