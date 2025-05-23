// /app/api/metrics/test/route.ts (App Router)
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  const metric = await prisma.websiteMetric.create({
    data: {},
  });

  return NextResponse.json({ success: true, metric });
}
