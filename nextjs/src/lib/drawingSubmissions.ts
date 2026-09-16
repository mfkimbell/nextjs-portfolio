export type DrawingPoint = { x: number; y: number; pressure?: number };
export type DrawingStroke = {
  pts: DrawingPoint[];
  color: string;
  width: number;
  erase?: boolean;
};

const MAX_NAME_LENGTH = 40;
const MAX_STROKES = 200;
const MAX_POINTS_PER_STROKE = 2_000;
const MAX_TOTAL_POINTS = 10_000;
const DEFAULT_CANVAS_SIZE = 384;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeSubmissionName(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
}

export function sanitizeCanvasSize(value: unknown) {
  const size = typeof value === "number" ? Math.round(value) : DEFAULT_CANVAS_SIZE;
  if (!Number.isFinite(size)) return DEFAULT_CANVAS_SIZE;
  return Math.min(1_200, Math.max(100, size));
}

export function sanitizeCanvasHeight(value: unknown) {
  if (typeof value !== "number") return null;
  const size = Math.round(value);
  if (!Number.isFinite(size)) return null;
  return Math.min(1_200, Math.max(100, size));
}

export function sanitizeStrokes(value: unknown):
  | { ok: true; strokes: DrawingStroke[] }
  | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "Draw something before saving." };
  }

  if (value.length > MAX_STROKES) {
    return { ok: false, error: `Too many strokes. Limit is ${MAX_STROKES}.` };
  }

  let totalPoints = 0;
  const strokes: DrawingStroke[] = [];

  for (const rawStroke of value) {
    if (!isRecord(rawStroke) || !Array.isArray(rawStroke.pts)) {
      return { ok: false, error: "Invalid stroke data." };
    }

    if (rawStroke.pts.length === 0) continue;
    if (rawStroke.pts.length > MAX_POINTS_PER_STROKE) {
      return {
        ok: false,
        error: `One stroke is too large. Limit is ${MAX_POINTS_PER_STROKE} points.`,
      };
    }

    totalPoints += rawStroke.pts.length;
    if (totalPoints > MAX_TOTAL_POINTS) {
      return { ok: false, error: `Drawing is too large. Limit is ${MAX_TOTAL_POINTS} points.` };
    }

    const pts: DrawingPoint[] = [];
    for (const rawPoint of rawStroke.pts) {
      if (!isRecord(rawPoint)) {
        return { ok: false, error: "Invalid point data." };
      }

      const x = Number(rawPoint.x);
      const y = Number(rawPoint.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, error: "Invalid point coordinates." };
      }

      const pressure = Number(rawPoint.pressure);
      pts.push({
        x: Math.min(3_000, Math.max(-3_000, x)),
        y: Math.min(3_000, Math.max(-3_000, y)),
        ...(Number.isFinite(pressure)
          ? { pressure: Math.min(1, Math.max(0.05, pressure)) }
          : {}),
      });
    }

    const width = Number(rawStroke.width);
    const color = typeof rawStroke.color === "string" ? rawStroke.color.slice(0, 32) : "#000000";

    strokes.push({
      pts,
      color,
      width: Number.isFinite(width) ? Math.min(80, Math.max(1, width)) : 6,
      erase: rawStroke.erase === true || undefined,
    });
  }

  if (!strokes.length) {
    return { ok: false, error: "Draw something before saving." };
  }

  return { ok: true, strokes };
}

export function getRollingWeekStart() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
}
