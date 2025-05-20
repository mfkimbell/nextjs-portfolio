/* ------------------------------------------------------------------
   src/components/Metrics.tsx  – client component, single fetch
   • bottom: full‑width grass image
   • on sm+ screens, only the middle 50% is visible
-------------------------------------------------------------------*/
"use client";

import useSWRImmutable from "swr/immutable";
import CommitsChart, { CommitPoint } from "@/components/CommitsChart";
import Image from "next/image";

/* simple fetcher helper */
const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* SWR global options for this component */
const swrOpts = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 300_000, /* 5 min */
};

export default function Metrics() {
  /* GitHub stats */
  const { data: gh } = useSWRImmutable<{
    totalCommits: number;
    timeline: CommitPoint[];
  }>("/api/github-stats", fetcher, swrOpts);

  /* Site metrics */
  const { data: site } = useSWRImmutable<{
    totalVisits: number;
    totalClicks: number;
    totalMouseMiles: number;
    totalScroll: number;
  }>("/api/site-metrics", fetcher, swrOpts);

  /* render nothing until both are loaded */
  if (!gh || !site) return null;

  return (
    <section id="metrics" className="mt-20">
      <h2 className=" text-center text-3xl font-bold text-accent">
        Metrics
      </h2>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
        {/* GitHub card */}
        <div className="border border-default bg-card p-6 rounded-default">
          <h3 className="mb-2 text-xl font-semibold text-accent">
            GitHub Activity
          </h3>
          <div className="mb-4 text-4xl font-bold text-accent">
            {gh.totalCommits}
          </div>
          <CommitsChart data={gh.timeline} />
        </div>

        {/* Site metrics card */}
        <div className="border border-default bg-card p-6 rounded-default">
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

      {/* full‑width grass strip */}
      <div className="relative w-screen overflow-hidden mt-22">
  <div className="transform scale-270 py-11 sm:py-0 sm:scale-100 origin-center">
    <Image
      src="/fauna.png"
      alt="Low-poly grass strip"
      width={2400}
      height={400}
      priority
      className="block w-full h-auto"
    />
  </div>
</div>

    </section>
  );
}
