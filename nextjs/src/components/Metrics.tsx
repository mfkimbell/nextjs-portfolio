// src/components/Metrics.tsx
import CommitsChart, { CommitPoint } from "@/components/CommitsChart";

async function getGitHub() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/github-stats`,
    { cache: "no-store" }
  );
  return res.json() as Promise<{
    totalCommits: number;
    timeline: CommitPoint[];
  }>;
}

async function getSiteMetrics() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/site-metrics`,
    { cache: "no-store" }
  );
  return res.json() as Promise<{
    totalVisits: number;
    totalClicks: number;
    totalMouseMiles: number;
    totalScroll: number;
  }>;
}

export default async function Metrics() {
  const [gh, site] = await Promise.all([getGitHub(), getSiteMetrics()]);
  const totalCommits = gh.totalCommits!;
  const chartData = gh.timeline!;

  return (
    <section id="metrics" className="py-24">
      <h2 className="text-3xl font-bold text-accent mb-12 text-center">
        Metrics
      </h2>

      <div className="mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl">
        {/* GitHub */}
        <div className="bg-card border border-default rounded-default p-6">
          <h3 className="mb-2 text-xl font-semibold text-accent">
            GitHub Activity
          </h3>
          <div className="text-4xl font-bold text-accent mb-4">
            {totalCommits}
          </div>
          <CommitsChart data={chartData} />
        </div>

        {/* Site */}
        <div className="bg-card border border-default rounded-default p-6">
          <h3 className="mb-4 text-xl font-semibold text-accent">
            Website Metrics
          </h3>
          <ul className="space-y-2 text-muted">
            <li>👁️ {site.totalVisits} visits</li>
            <li>🖱️ {site.totalClicks} clicks</li>
            <li>🐭 {site.totalMouseMiles} mouse miles</li>
            <li>📜 {site.totalScroll} px scrolled</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
