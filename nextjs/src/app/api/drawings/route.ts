// app/api/drawings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BOARD_ID = 'shared-board';

// Fix: Match the frontend types exactly
type Point = { x: number; y: number };
type Stroke = { pts: Point[]; color: string; width: number; erase?: boolean };

export async function GET() {
  const board = await prisma.drawing.findUnique({ where: { id: BOARD_ID } });
  return NextResponse.json(board ?? { id: BOARD_ID, strokes: [] });
}

export async function POST(req: NextRequest) {
  const { newStrokes } = await req.json();
  if (!Array.isArray(newStrokes)) {
    return NextResponse.json(
      { error: 'newStrokes[] required' },
      { status: 400 }
    );
  }

  // 1. Load existing
  const board = await prisma.drawing.findUnique({ where: { id: BOARD_ID } });
  const existing = Array.isArray(board?.strokes)
    ? (board!.strokes as unknown as Stroke[])
    : [];

  // 2. Merge into a single flat array
  const merged = [...existing, ...newStrokes];

  // 3. Upsert with the merged array
  const updated = await prisma.drawing.upsert({
    where: { id: BOARD_ID },
    create: { id: BOARD_ID, strokes: merged },
    update: { strokes: merged }, // full overwrite with merged array
  });

  return NextResponse.json(updated);
}

export async function DELETE() {
  // clear to empty array
  const cleared = await prisma.drawing.upsert({
    where: { id: BOARD_ID },
    create: { id: BOARD_ID, strokes: [] },
    update: { strokes: [] },
  });
  return NextResponse.json(cleared);
}
