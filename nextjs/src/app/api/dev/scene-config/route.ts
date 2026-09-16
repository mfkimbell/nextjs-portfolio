// Dev-only endpoint: writes the tuned campfire scene into
// src/config/campfireScene.json, which sceneConfig.ts layers over its built-in
// defaults. That file is committed, so whatever is saved here is what ships -
// unlike localStorage, which never leaves the browser it was tuned in.
// Refuses in production.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "src", "config", "campfireScene.json");

/** Per-object placement: every field is a plain number. */
const OVERRIDE_FIELDS = ["dx", "dy", "dz", "rotX", "rotY", "rotZ", "scale", "hide", "noShadow"] as const;
/** One location's camera, in that location's own frame. */
const VIEW_FIELDS = ["cx", "cy", "cz", "tx", "ty", "tz"] as const;
/** Duplicate placement: same shape as an override minus `hide`, plus `source`. */
const DUPLICATE_FIELDS = ["dx", "dy", "dz", "rotX", "rotY", "rotZ", "scale", "noShadow"] as const;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Only well-formed numbers make it to disk.
 *
 * This is writing a source file from an HTTP body, so nothing is taken on trust: any
 * key that is not a finite number, a numeric override record, or a numeric view is
 * dropped rather than written. A NaN that reached the file would break the scene for
 * everyone on the next deploy, not just the browser that produced it.
 */
function sanitize(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (num(value)) {
      out[key] = value;
      continue;
    }

    if (key === "objectOverrides" && value && typeof value === "object" && !Array.isArray(value)) {
      const overrides: Record<string, Record<string, number>> = {};
      for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
        if (!entry || typeof entry !== "object") continue;
        const src = entry as Record<string, unknown>;
        const dst: Record<string, number> = {};
        for (const field of OVERRIDE_FIELDS) {
          const v = src[field];
          dst[field] = num(v) ? v : field === "scale" ? 1 : 0;
        }
        overrides[name] = dst;
      }
      out[key] = overrides;
      continue;
    }

    if (key === "lockedObjects" && value && typeof value === "object" && !Array.isArray(value)) {
      const locks: Record<string, boolean> = {};
      for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
        if (entry === true) locks[name] = true;
      }
      out[key] = locks;
      continue;
    }

    if (key === "objectDuplicates" && value && typeof value === "object" && !Array.isArray(value)) {
      const duplicates: Record<string, Record<string, number | string>> = {};
      for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
        if (!entry || typeof entry !== "object") continue;
        const src = entry as Record<string, unknown>;
        const source = src.source;
        if (typeof source !== "string" || !source) continue;
        const dst: Record<string, number | string> = { source };
        for (const field of DUPLICATE_FIELDS) {
          const v = src[field];
          dst[field] = num(v) ? v : field === "scale" ? 1 : 0;
        }
        duplicates[name] = dst;
      }
      out[key] = duplicates;
      continue;
    }

    // locationViews are deliberately stripped here - camera state is owned by
    // /api/dev/camera-defaults so a regular Save with a fiddled-with camera
    // can't overwrite the pinned "default" per location. To change the default,
    // use "Save default camera" in the lab.
    if (key === "locationViews") continue;
    // anything else is silently dropped
  }

  return out;
}
void VIEW_FIELDS; // retained for future re-enable; suppresses unused import lint

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  let body: { campfire?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const campfire = body.campfire;
  if (!campfire || typeof campfire !== "object" || Array.isArray(campfire)) {
    return NextResponse.json({ error: "campfire object required" }, { status: 400 });
  }

  const clean = sanitize(campfire as Record<string, unknown>);
  // Preserve locationViews already on disk - camera is owned by the separate
  // "Save default camera" flow, and stripping the field would drop the pinned
  // defaults the site loads for a fresh visitor.
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const existing = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(existing.locationViews)) {
      clean.locationViews = existing.locationViews;
    }
  } catch {
    // no existing file yet - fine
  }

  const keys = Object.keys(clean).length;
  if (!keys) {
    return NextResponse.json({ error: "nothing usable in that config" }, { status: 400 });
  }

  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(clean, null, 2)}\n`, "utf8");

  return NextResponse.json({
    ok: true,
    keys,
    objects: Object.keys((clean.objectOverrides as object) ?? {}).length,
  });
}
