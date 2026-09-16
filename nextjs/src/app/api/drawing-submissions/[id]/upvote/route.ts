import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const updated = await prisma.drawingSubmission.updateMany({
    where: { id, hidden: false },
    data: { upvotes: { increment: 1 } },
  });

  if (!updated.count) {
    return NextResponse.json({ error: "Drawing not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
