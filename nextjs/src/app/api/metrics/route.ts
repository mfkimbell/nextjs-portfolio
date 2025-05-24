import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

/**
 * GET /api/metrics
 * Returns current metrics without side-effects
 */
export async function GET() {
  const metrics = await prisma.websiteMetric.findFirst();
  return NextResponse.json(metrics);
}

/**
 * POST /api/metrics
 * Increments clicks, mouseMiles, and scroll. Does not change totalVisits.
 */
export async function POST(req: Request) {
  const { clicks = 0, mouseMiles = 0, scroll = 0 } = await req.json();

  // Fetch existing record
  const metrics = await prisma.websiteMetric.findFirst();
  if (!metrics) {
    // Create new if none
    const created = await prisma.websiteMetric.create({
      data: {
        totalVisits: 0,
        totalClicks: clicks,
        totalMouseMiles: mouseMiles,
        totalScroll: scroll,
      },
    });
    return NextResponse.json(created);
  }

  // Update existing by primary key
  const updated = await prisma.websiteMetric.update({
    where: { id: metrics.id },
    data: {
      totalClicks:      { increment: clicks },
      totalMouseMiles:  { increment: mouseMiles },
      totalScroll:      { increment: scroll },
    },
  });

  return NextResponse.json(updated);
}
