// Dev-only endpoint: writes the current cub head/bone pose from CubHeadLab
// into src/config/cubHeadPose.json. Refuses in production.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";

const CONFIG_PATH = path.join(process.cwd(), "src", "config", "cubHeadPose.json");

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (num(v) || typeof v === "string") out[k] = v;
  }

  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  // Fire-and-forget: bake the pose into cub.glb via headless Blender.
  const bakeInfo = await bakeGlb().catch((e: unknown) => ({
    ok: false,
    error: e instanceof Error ? e.message : String(e),
  }));

  return NextResponse.json({ ok: true, path: CONFIG_PATH, bake: bakeInfo });
}

const BLENDER_BIN = "/Applications/Blender.app/Contents/MacOS/Blender";
const BAKE_SCRIPT = path.join(process.cwd(), "..", "scripts", "bake_cub_head.py");

function bakeGlb(): Promise<{ ok: boolean; stdout?: string; stderr?: string; code?: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(
      BLENDER_BIN,
      ["--background", "--python", BAKE_SCRIPT],
      { cwd: process.cwd(), env: process.env },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      const ok = code === 0 && /BAKE_DONE/.test(stdout);
      resolve({ ok, code, stdout: stdout.slice(-1000), stderr: stderr.slice(-500) });
    });
    proc.on("error", (e) => resolve({ ok: false, stderr: e.message }));
  });
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
