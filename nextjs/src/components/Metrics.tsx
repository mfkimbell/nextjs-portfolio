/* ------------------------------------------------------------------
   src/components/Metrics.tsx  – client component, single fetch
   • bottom: full‑width grass image
   • raccoon GIF is pinned to a fixed percent of the grass image itself
   • three bees that float around fixed anchor points, size & pos responsive
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
  dedupingInterval: 300_000,
};

export default function Metrics() {
  const { data: gh } = useSWRImmutable<{
    totalCommits: number;
    timeline: CommitPoint[];
  }>("/api/github-stats", fetcher, swrOpts);

  const { data: site } = useSWRImmutable<{
    totalVisits: number;
    totalClicks: number;
    totalMouseMiles: number;
    totalScroll: number;
  }>("/api/site-metrics", fetcher, swrOpts);

  if (!gh || !site) return null;

  return (
    <section id="metrics" className="mt-20">
      <h2 className="text-center text-3xl font-bold text-accent mb-12">
        Metrics
      </h2>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2 mb-10">
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
        <div className="border border-default bg-card p-6 rounded-default z-1">
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

      {/* full‑width grass strip with raccoon + bees overlay */}
      <div className="relative w-full overflow-hidden mt-10 py-13 sm:py-0 max-w-[100vw]">
        {/* Image wrapper with relative position for overlay */}
        <div className="relative w-full scale-[2] sm:scale-100 origin-center max-w-[120vw]">
          <Image
            src="/fauna2.png"
            alt="Low‑poly grass strip"
            width={2400}
            height={400}
            priority
            className="block w-full h-auto"
          />

          {/* raccoon pinned to spot inside image container */}
          <img
            src="/gifs/racoon.gif"
            alt="Raccoon on stump"
            className="absolute left-[57%] top-[18%] w-[10%] sm:left-[57%] sm:top-[18%] sm:w-[10%] pointer-events-none z-10"
          />

          {/* ——— Bee overlays ——— */}
          <img
            src="/animals/bee1.png"
            alt="Bee 1"
            className="absolute left-[27%] top-[67%] w-2 sm:w-5 pointer-events-none bee-anim-1-mobile sm:bee-anim-1 z-20"
          />
          <img
            src="/animals/bee2.png"
            alt="Bee 2"
            className="absolute left-[35%] top-[55%] w-2 sm:w-5 pointer-events-none bee-anim-2-mobile sm:bee-anim-2 z-20"
          />
          <img
            src="/animals/bee3.png"
            alt="Bee 3"
            className="absolute left-[40%] top-[68%] w-2 sm:w-5 pointer-events-none bee-anim-3-mobile sm:bee-anim-3 z-20"
          />
        </div>
      </div>

      {/* floating animation for bees */}
      <style jsx global>{`
       @keyframes fly-around {
        0%   { transform: translate(0,     0); }
        25%  { transform: translate(1px, -6px); }
        50%  { transform: translate(0,   -8px); }
        75%  { transform: translate(-1px, -6px); }
        100% { transform: translate(0,     0); }
      }

        .bee-anim-1-mobile {
          animation: fly-around 3s ease-in-out infinite alternate 0s;
        }
        .bee-anim-2-mobile {
          animation: fly-around 5s ease-in-out infinite alternate 1.2s;
        }
        .bee-anim-3-mobile {
          animation: fly-around 3s ease-in-out infinite alternate 0.7s;
        }
        .bee-anim-1 {
          animation: fly-around 10s ease-in-out infinite alternate 0s;
        }
        .bee-anim-2 {
          animation: fly-around 12s ease-in-out infinite alternate 1.2s;
        }
        .bee-anim-3 {
          animation: fly-around 8s ease-in-out infinite alternate 0.7s;
        }
      `}</style>
    </section>
  );
}
