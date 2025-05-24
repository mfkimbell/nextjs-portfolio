import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/metrics/visit
 * Increments only the totalVisits counter and returns updated metrics
 */
export async function POST() {
  // Fetch existing record
  const metrics = await prisma.websiteMetric.findFirst();

  if (!metrics) {
    // Create initial record if none exists
    const created = await prisma.websiteMetric.create({
      data: {
        totalVisits: 1,
        totalClicks: 0,
        totalMouseMiles: 0,
        totalScroll: 0,
      },
    });
    return NextResponse.json(created);
  }

  // Update existing record by its primary key
  const updated = await prisma.websiteMetric.update({
    where: { id: metrics.id },
    data: { totalVisits: { increment: 1 } },
  });

  return NextResponse.json(updated);
}
