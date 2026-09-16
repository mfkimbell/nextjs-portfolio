// Dev-only endpoint: queues face-centroid delete requests for the truck GLB.
// The browser Truck Editor picks a face + flood-fills a flat patch, then POSTs
// { meshName, worldCentroids: [{x,y,z}] } here. This route appends entries to
// nextjs/truck_delete_queue.json (at repo root of the nextjs project), which is
// consumed by a Blender MCP script that opens the truck, deletes matching
// faces, and re-exports pickup_truck.glb. Refuses in production.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const QUEUE_PATH = path.join(process.cwd(), "truck_delete_queue.json");

type Point = { x: number; y: number; z: number };
type Entry = { meshName: string; worldCentroids: Point[]; at: string };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const point = (v: unknown): v is Point =>
  !!v && typeof v === "object" && num((v as Point).x) && num((v as Point).y) && num((v as Point).z);

async function readQueue(): Promise<Entry[]> {
  try {
    const raw = await fs.readFile(QUEUE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 403 });
  }
  return NextResponse.json({ entries: await readQueue() });
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 403 });
  }
  const body = (await req.json()) as { meshName?: unknown; worldCentroids?: unknown };
  const meshName = typeof body.meshName === "string" ? body.meshName : null;
  const rawList = Array.isArray(body.worldCentroids) ? body.worldCentroids : null;
  if (!meshName || !rawList) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  const worldCentroids: Point[] = [];
  for (const p of rawList) {
    if (point(p)) worldCentroids.push({ x: p.x, y: p.y, z: p.z });
  }
  if (worldCentroids.length === 0) {
    return NextResponse.json({ error: "no valid centroids" }, { status: 400 });
  }
  const queue = await readQueue();
  queue.push({ meshName, worldCentroids, at: new Date().toISOString() });
  await fs.writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2));
  return NextResponse.json({ ok: true, queued: worldCentroids.length, total: queue.length });
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 403 });
  }
  await fs.writeFile(QUEUE_PATH, "[]");
  return NextResponse.json({ ok: true });
}
