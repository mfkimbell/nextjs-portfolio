// src/app/api/site-metrics/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  // Replace with a Prisma query if you have metrics in Postgres
  const metrics = {
    totalVisits: 1234,
    totalClicks: 8765,
    totalMouseMiles: 54.3,
    totalScroll: 987654,
  };
  return NextResponse.json(metrics);
}
