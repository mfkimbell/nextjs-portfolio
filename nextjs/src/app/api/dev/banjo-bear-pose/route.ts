// Dev-only endpoint: reads/writes the current banjo pose from BanjoBearLab
// into src/config/banjoBearPose.json. Refuses in production.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "src", "config", "banjoBearPose.json");

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

  return NextResponse.json({ ok: true, path: CONFIG_PATH });
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
