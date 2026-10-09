// Dev-only endpoint: reads/writes the current banjo pose from BanjoBearLab
// into src/config/banjoBearPose.json. Refuses in production.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "src", "config", "banjoBearPose.json");
const CAMPFIRE_CONFIG_PATH = path.join(process.cwd(), "src", "config", "campfireScene.json");
const HAT_CONFIG_KEYS = {
  hatX: "smokeyHatX",
  hatY: "smokeyHatY",
  hatZ: "smokeyHatZ",
  hatRotX: "smokeyHatRotX",
  hatRotY: "smokeyHatRotY",
  hatRotZ: "smokeyHatRotZ",
  hatScale: "smokeyHatScale",
  hatColorR: "smokeyHatColorR",
  hatColorG: "smokeyHatColorG",
  hatColorB: "smokeyHatColorB",
  hatBandColorR: "smokeyHatBandColorR",
  hatBandColorG: "smokeyHatBandColorG",
  hatBandColorB: "smokeyHatBandColorB",
} as const;

const isPlainObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Recursively strip anything that isn't a number/bool/string/plain-object. */
function sanitize(v: unknown): unknown {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  if (isPlainObj(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, vv] of Object.entries(v)) {
      const s = sanitize(vv);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const out = sanitize(body);
  if (!isPlainObj(out)) {
    return NextResponse.json({ error: "expected object" }, { status: 400 });
  }

  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  try {
    const campfire = JSON.parse(await fs.readFile(CAMPFIRE_CONFIG_PATH, "utf8")) as Record<string, unknown>;
    for (const [sourceKey, targetKey] of Object.entries(HAT_CONFIG_KEYS)) {
      if (typeof out[sourceKey] === "number") campfire[targetKey] = out[sourceKey];
    }
    await fs.writeFile(CAMPFIRE_CONFIG_PATH, `${JSON.stringify(campfire, null, 2)}\n`, "utf8");
  } catch {
    // The pose save remains valid even if the optional campfire mirror is unavailable.
  }

  return NextResponse.json({ ok: true, path: CONFIG_PATH, mirroredPath: CAMPFIRE_CONFIG_PATH });
}

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
