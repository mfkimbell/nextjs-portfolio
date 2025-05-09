import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET() {
  const metrics = await prisma.websiteMetric.findFirst();
  return NextResponse.json(metrics);
}

export async function POST(req: Request) {
  const body = await req.json();

  const { mouseMiles = 0, clicks = 0, scroll = 0 } = body;

  const metrics = await prisma.websiteMetric.findFirst();

  if (!metrics) {
    const newMetrics = await prisma.websiteMetric.create({
      data: {
        totalMouseMiles: mouseMiles,
        totalVisits: 1,
        totalClicks: clicks,
        totalScroll: scroll,
      },
    });
    return NextResponse.json(newMetrics);
  }

  const updatedMetrics = await prisma.websiteMetric.update({
    where: { id: metrics.id },
    data: {
      totalMouseMiles: { increment: mouseMiles },
      totalVisits: { increment: 1 },
      totalClicks: { increment: clicks },
      totalScroll: { increment: scroll },
    },
  });

  return NextResponse.json(updatedMetrics);
}
