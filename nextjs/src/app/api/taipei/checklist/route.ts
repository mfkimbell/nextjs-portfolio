import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// PATCH /api/taipei/checklist  { id, done }
export async function PATCH(req: NextRequest) {
  const { id, done } = await req.json();
  if (!id || done === undefined)
    return NextResponse.json({ error: 'id and done required' }, { status: 400 });

  const updated = await prisma.taipeiCheckItem.update({ where: { id }, data: { done } });
  return NextResponse.json(updated);
}
