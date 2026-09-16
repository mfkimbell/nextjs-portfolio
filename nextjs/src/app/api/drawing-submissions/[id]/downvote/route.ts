import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BOARD_ID = "shared-board";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function removeSubmissionFromSharedCanvas(submissionId: string) {
  const board = await prisma.drawing.findUnique({ where: { id: BOARD_ID } });
  if (!Array.isArray(board?.strokes)) return;

  const filtered = board.strokes.filter(
    (stroke) => !isRecord(stroke) || stroke.submissionId !== submissionId
  );

  if (filtered.length === board.strokes.length) return;

  await prisma.drawing.update({
    where: { id: BOARD_ID },
    data: { strokes: filtered },
  });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const updated = await prisma.drawingSubmission.updateMany({
    where: { id, hidden: false },
    data: {
      downvotes: { increment: 1 },
      hidden: true,
    },
  });

  if (!updated.count) {
    return NextResponse.json({ error: "Drawing not found." }, { status: 404 });
  }

  await removeSubmissionFromSharedCanvas(id);

  return NextResponse.json({ ok: true });
}
