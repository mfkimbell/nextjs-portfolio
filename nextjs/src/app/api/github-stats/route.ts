// src/app/api/github-stats/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  // You would query GitHub’s GraphQL API here.
  // For now return mock data.
  const dummy = {
    totalCommits: 420,
    timeline: [
      { period: "Jan", commits: 20 },
      { period: "Feb", commits: 32 },
      { period: "Mar", commits: 40 },
      { period: "Apr", commits: 28 },
    ],
  };
  return NextResponse.json(dummy);
}
