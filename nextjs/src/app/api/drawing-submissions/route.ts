import { NextRequest, NextResponse } from "next/server";
import type { DrawingSubmission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  sanitizeCanvasHeight,
  sanitizeCanvasSize,
  sanitizeStrokes,
  sanitizeSubmissionName,
} from "@/lib/drawingSubmissions";

export const dynamic = "force-dynamic";

type PublicSubmission = Pick<
  DrawingSubmission,
  "id" | "name" | "strokes" | "canvasSize" | "canvasHeight" | "upvotes" | "createdAt"
>;

function toPublicSubmission(drawing: PublicSubmission) {
  return {
    id: drawing.id,
    name: drawing.name,
    strokes: drawing.strokes,
    canvasSize: drawing.canvasSize,
    canvasHeight: drawing.canvasHeight,
    upvotes: drawing.upvotes,
    createdAt: drawing.createdAt.toISOString(),
  };
}

async function getVisibleSubmissions(limit = 3) {
  const take = Math.max(1, Math.min(32, limit));

  const drawings = await prisma.drawingSubmission.findMany({
    where: { hidden: false },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      name: true,
      strokes: true,
      canvasSize: true,
      canvasHeight: true,
      upvotes: true,
      createdAt: true,
    },
  });

  return drawings.map(toPublicSubmission);
}

export async function GET(request: NextRequest) {
  // The bulletin board asks for more than the gallery does, so the cap is a
  // query param now. Callers that omit it keep the original 3.
  const raw = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3;

  try {
    const drawings = await getVisibleSubmissions(limit);

    return NextResponse.json(
      {
        drawings,
        limit,
        weekWindowDays: 7,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.warn("[drawing-submissions] Could not load drawings; returning empty gallery.", error);
    return NextResponse.json(
      {
        drawings: [],
        limit,
        weekWindowDays: 7,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const name = sanitizeSubmissionName(record.name);

  const strokesResult = sanitizeStrokes(record.strokes);
  if (!strokesResult.ok) {
    return NextResponse.json({ error: strokesResult.error }, { status: 400 });
  }

  try {
    const drawing = await prisma.drawingSubmission.create({
      data: {
        name,
        strokes: strokesResult.strokes,
        canvasSize: sanitizeCanvasSize(record.canvasSize),
        canvasHeight: sanitizeCanvasHeight(record.canvasHeight),
      },
      select: {
        id: true,
        name: true,
        strokes: true,
        canvasSize: true,
        canvasHeight: true,
        upvotes: true,
        createdAt: true,
      },
    });

    const drawings = await getVisibleSubmissions();

    return NextResponse.json(
      {
        drawing: toPublicSubmission(drawing),
        drawings,
      },
      { status: 201 }
    );
  } catch (error) {
    console.warn("[drawing-submissions] Could not save drawing.", error);
    return NextResponse.json(
      { error: "Drawing submissions are temporarily unavailable." },
      { status: 503 }
    );
  }
}
