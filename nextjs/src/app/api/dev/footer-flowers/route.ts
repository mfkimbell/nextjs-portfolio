// Dev-only endpoint: writes the FOOTER_FLOWERS array in
// src/config/footerFlowers.ts. Refuses in production.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type Placement = {
  id: number;
  src: string;
  xPct: number;
  yPct: number;
  sizePct: number;
  rotationDeg: number;
  flipX?: boolean;
  depth: number;
};

const CONFIG_PATH = path.join(
  process.cwd(),
  "src",
  "config",
  "footerFlowers.ts"
);

const ARRAY_MARKER_START = "export const FOOTER_FLOWERS:";
const ARRAY_MARKER_END = "];";

function formatArray(placements: Placement[]): string {
  const entry = (p: Placement) => {
    const lines = [
      `  {`,
      `    id: ${p.id},`,
      `    src: ${JSON.stringify(p.src)},`,
      `    xPct: ${Number(p.xPct.toFixed(2))},`,
      `    yPct: ${Number(p.yPct.toFixed(2))},`,
      `    sizePct: ${Number(p.sizePct.toFixed(2))},`,
      `    rotationDeg: ${Number(p.rotationDeg.toFixed(1))},`,
    ];
    if (p.flipX) lines.push(`    flipX: true,`);
    lines.push(`    depth: ${p.depth},`);
    lines.push(`  },`);
    return lines.join("\n");
  };
  return (
    `export const FOOTER_FLOWERS: FooterFlowerPlacement[] = [\n` +
    placements.map(entry).join("\n") +
    `\n];`
  );
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }
  let body: { placements?: Placement[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const placements = body.placements;
  if (!Array.isArray(placements)) {
    return NextResponse.json(
      { error: "placements[] required" },
      { status: 400 }
    );
  }

  const source = await fs.readFile(CONFIG_PATH, "utf8");
  const startIdx = source.indexOf(ARRAY_MARKER_START);
  if (startIdx < 0) {
    return NextResponse.json(
      { error: "config array marker not found" },
      { status: 500 }
    );
  }
  const endSearchFrom = startIdx + ARRAY_MARKER_START.length;
  const endIdx = source.indexOf(ARRAY_MARKER_END, endSearchFrom);
  if (endIdx < 0) {
    return NextResponse.json(
      { error: "config array terminator not found" },
      { status: 500 }
    );
  }
  const nextChar = source.charAt(endIdx + ARRAY_MARKER_END.length);
  const replacementEnd = endIdx + ARRAY_MARKER_END.length;

  const before = source.slice(0, startIdx);
  const after = source.slice(replacementEnd);
  const newSource =
    before + formatArray(placements) + (nextChar === "\n" ? "" : "\n") + after;

  await fs.writeFile(CONFIG_PATH, newSource, "utf8");
  return NextResponse.json({ ok: true, count: placements.length });
}
