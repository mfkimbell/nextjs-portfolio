export type PaintPoint = { x: number; y: number; pressure?: number };

export type PaintStroke = {
  pts: PaintPoint[];
  color: string;
  width: number;
  erase?: boolean;
};

export const PAPER_COLOR = "#fffdf4";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothPath(ctx: CanvasRenderingContext2D, points: PaintPoint[]) {
  if (!points.length) return;
  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, ctx.lineWidth / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

export function drawPaintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: PaintStroke,
  options: { eraseColor?: string; opacity?: number } = {}
) {
  const points = stroke.pts?.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ?? [];
  if (!points.length) return;

  const width = Math.max(0.75, stroke.width);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.erase) {
    ctx.globalCompositeOperation = options.eraseColor ? "source-over" : "destination-out";
    ctx.strokeStyle = options.eraseColor ?? "rgba(0,0,0,1)";
    ctx.fillStyle = options.eraseColor ?? "rgba(0,0,0,1)";
    ctx.globalAlpha = 1;
    ctx.lineWidth = width * 1.8;
    smoothPath(ctx, points);
    ctx.restore();
    return;
  }

  const opacity = options.opacity ?? 1;
  const color = stroke.color || "#222222";

  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.lineWidth = width;
  smoothPath(ctx, points);
  ctx.restore();
}

export function fillPaperTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed = 11,
  baseColor = PAPER_COLOR
) {
  const rand = rng(seed);
  ctx.save();
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  // Subtle warm paper grain.
  for (let i = 0; i < 900; i++) {
    const alpha = 0.018 + rand() * 0.032;
    const shade = rand() > 0.5 ? 255 : 120;
    ctx.fillStyle = `rgba(${shade}, ${shade === 255 ? 248 : 92}, ${shade === 255 ? 226 : 42}, ${alpha})`;
    ctx.fillRect(rand() * width, rand() * height, 0.7 + rand() * 1.4, 0.7 + rand() * 1.6);
  }

  // Slight edge warmth so the sheet feels physical.
  const edge = ctx.createLinearGradient(0, 0, 0, height);
  edge.addColorStop(0, "rgba(125,83,30,0.055)");
  edge.addColorStop(0.12, "rgba(125,83,30,0)");
  edge.addColorStop(0.86, "rgba(125,83,30,0)");
  edge.addColorStop(1, "rgba(125,83,30,0.065)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
