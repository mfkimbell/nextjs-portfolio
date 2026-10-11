// The wobbling outline shared by the dialogue plaque and the name tags.
//
// A superellipse sampled at `count` points, with a sine wave travelling around
// its perimeter, closed up with Catmull-Rom-ish cubic segments. Advancing
// `phase` each frame is what makes it read as jelly.

export type JellyPathOptions = {
  /** Radians; advance over time to animate. */
  phase: number;
  /** Wave depth in viewBox units. */
  amplitude: number;
  /** Wave count around the perimeter. */
  spacing: number;
  /** 0 = soft ellipse, 1 = squircle. */
  roundness: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  count?: number;
};

type Point = { x: number; y: number };

export function makeJellyPath({
  phase,
  amplitude,
  spacing,
  roundness,
  cx,
  cy,
  rx,
  ry,
  count = 96,
}: JellyPathOptions): string {
  const points: Point[] = [];
  const exponent = 2.4 + Math.max(0, Math.min(1, roundness)) * 3.6;
  const power = 2 / exponent;
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const wave = Math.sin(t * spacing - phase) * amplitude;
    points.push({
      x: cx + Math.sign(cos) * Math.pow(Math.abs(cos), power) * rx + cos * wave,
      y: cy + Math.sign(sin) * Math.pow(Math.abs(sin), power) * ry + sin * wave,
    });
  }
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < count; i += 1) {
    const p0 = points[(i - 1 + count) % count];
    const p1 = points[i];
    const p2 = points[(i + 1) % count];
    const p3 = points[(i + 2) % count];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return `${path} Z`;
}

// The blob fills its layout box exactly.
//
// It used to be drawn inset (rx 462 of 500, ry 116 of 150). Because the
// viewBox is stretched with preserveAspectRatio="none", that inset was ~4% of
// the WIDTH but ~13% of the HEIGHT, so padding measured from the box gave a
// fixed gap at the sides and a gap at top and bottom that collapsed as the
// bubble grew with its text: 3.8rem of clearance on a short plaque down to
// 1.0rem on a tall one. Filling the box makes padding mean the same thing on
// every edge at every size. Wave crests ride a few units past the edge, which
// is what overflow-visible on the svg is for.
export const PLAQUE_VIEWBOX = { width: 1000, height: 300, cx: 500, cy: 150, rx: 500, ry: 150 } as const;

/**
 * Where the plaque's blob crosses the 45-degree diagonal, as a fraction of its
 * box, measured from the top-left.
 *
 * This matters because the blob is a superellipse inset inside its box: at
 * roundness 0.45 the box corner (0%, 0%) is empty space and the blob does not
 * start until roughly 11% across and 17% down. Anything pinned to the box
 * corner — a name tag — floats off the bubble. Pin to this point instead.
 */
export function jellyCornerFraction(roundness: number): { x: number; y: number } {
  const exponent = 2.4 + Math.max(0, Math.min(1, roundness)) * 3.6;
  const k = Math.pow(Math.SQRT1_2, 2 / exponent);
  const v = PLAQUE_VIEWBOX;
  return { x: (v.cx - k * v.rx) / v.width, y: (v.cy - k * v.ry) / v.height };
}
