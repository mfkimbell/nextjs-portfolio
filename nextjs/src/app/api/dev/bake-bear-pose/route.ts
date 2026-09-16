// Dev-only endpoint: shells out to Blender in background mode to bake
// bearPoses.json into per-bear GLBs at public/wildpoly/bear_sit_<id>.glb.
// The lab's Save button calls POST here after writing the JSON so the site
// picks up the new pose without a manual rebake. Refuses in production.
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const REPO = process.cwd();
// Pure-Python bake script (no Blender dep). Rewrites sit_log animation channels
// for the posed bones so their sample equals `rest * delta` at every keyframe -
// exactly what the lab renders via runtime quaternion multiplication. Blender
// was involved earlier but its Euler-XYZ + Y-up conversion drifted from
// three.js's convention on bones with non-trivial rest orientations.
const PYTHON = "/usr/bin/python3";
const SCRIPT = path.join(REPO, "scripts", "bake_bear_pose.py");

/** Return the mtime (ms) of a baked file, or 0 if missing - the frontend uses
 *  it as a cache-bust query so useGLTF re-fetches after a rebake. */
async function statMtime(file: string): Promise<number> {
  try {
    const s = await fs.stat(file);
    return Math.floor(s.mtimeMs);
  } catch {
    return 0;
  }
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  try {
    // Pure Python, no Blender - runs in ~200ms.
    const { stdout, stderr } = await exec(
      PYTHON,
      [SCRIPT],
      { cwd: REPO, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );

    // Bake script prints a marker line so we can echo something structured
    const marker = stdout.split("\n").find((l) => l.startsWith("BAKE_RESULT:"));
    const result = marker ? JSON.parse(marker.slice("BAKE_RESULT:".length)) : { baked: [] };

    // Attach cache-bust versions so the client can force useGLTF to refetch
    const versions: Record<string, number> = {};
    for (const b of result.baked ?? []) {
      versions[b.bear_id] = await statMtime(b.out);
    }
    return NextResponse.json({ ok: true, ...result, versions, stderr: stderr.slice(-500) });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json(
      {
        error: err.message ?? "bake failed",
        stdout: (err.stdout ?? "").slice(-1000),
        stderr: (err.stderr ?? "").slice(-1000),
      },
      { status: 500 },
    );
  }
}

/** Report current bake versions so the site can cache-bust useGLTF on mount. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }
  const wildpoly = path.join(REPO, "public", "wildpoly");
  const versions: Record<string, number> = {};
  for (const bearId of ["front_log", "back_right_log"]) {
    versions[bearId] = await statMtime(path.join(wildpoly, `bear_sit_${bearId}.glb`));
  }
  return NextResponse.json({ versions });
}
