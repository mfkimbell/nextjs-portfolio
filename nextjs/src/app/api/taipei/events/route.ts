import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// PATCH /api/taipei/events  { id, ...fields }
export async function PATCH(req: NextRequest) {
  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updated = await prisma.taipeiEvent.update({
    where: { id },
    data,
    include: { checklist: { orderBy: { order: 'asc' } } },
  });
  return NextResponse.json(updated);
}
