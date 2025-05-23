/* ------------------------------------------------------------------
   src/components/Metrics.tsx – live‑updating website metrics
   • DB totals from /api/metrics (Neon + Prisma)
   • Session increments from Redux (clicks + mouse miles)
   • Tiny badge animates (“+1”, “+0.05”) to prove it's live
   • Raw text metrics overlaid between raccoon and bees
-------------------------------------------------------------------*/
"use client";

import { useEffect, useState } from "react";
import useSWRImmutable from "swr/immutable";
import Image from "next/image";
import { useAppSelector } from "@/lib/hooks";
import CanvasBoard from "./CanvasBoard";

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 300_000 };

export default function Metrics() {
  /* 1 ▸ DB totals */
  const { data: base } = useSWRImmutable<{
    totalVisits: number;
    totalClicks: number;
    totalMouseMiles: number;
    totalScroll: number;
  }>("/api/metrics", fetcher, swrOpts);

  /* 2 ▸ live session counts */
  const session = useAppSelector((s) => s.metrics);
  const [clickFlash, setClickFlash] = useState(false);
  const [mileFlash, setMileFlash] = useState(false);

  useEffect(() => {
    if (session.clicks) {
      setClickFlash(true);
      const id = setTimeout(() => setClickFlash(false), 700);
      return () => clearTimeout(id);
    }
  }, [session.clicks]);

  useEffect(() => {
    if (session.mouseMiles) {
      setMileFlash(true);
      const id = setTimeout(() => setMileFlash(false), 700);
      return () => clearTimeout(id);
    }
  }, [session.mouseMiles]);

  if (!base) return null;

  /* 3 ▸ merge totals + increments */
  const visits = base.totalVisits;
  const clicks = base.totalClicks + session.clicks;
  const mouseMiles = base.totalMouseMiles + session.mouseMiles;
  const scroll = base.totalScroll;

  return (
    <section id="metrics" className="mt-20">
      <h2 className="text-center text-white text-3xl font-bold mb-12">
        Canvas
      </h2>

      <CanvasBoard 
      visits={visits}
      mouseMiles={mouseMiles}/>

      {/* grass / raccoon / bees strip ▸ unchanged but with metrics overlay */}
      <div className="relative w-full overflow-hidden mt-10 py-13 sm:py-0 max-w-[100vw]">
        <div className="relative w-full scale-[2] sm:scale-100 origin-center max-w-[120vw]">
          <Image
            src="/fauna2.png"
            alt="Low-poly grass strip"
            width={2400}
            height={400}
            priority
            className="block w-full h-auto"
          />

          {/* raccoon */}
          <img
            src="/gifs/racoon.gif"
            alt="Raccoon"
            className="absolute left-[57%] top-[18%] w-[10%] pointer-events-none z-10"
          />

        

          {/* bees */}
          <img
            src="/animals/bee1.png"
            alt="Bee 1"
            className="absolute left-[28%] top-[57%] w-2 sm:w-5 pointer-events-none bee-anim-1-mobile sm:bee-anim-1 z-20"
          />
          <img
            src="/animals/bee2.png"
            alt="Bee 2"
            className="absolute left-[35%] top-[45%] w-2 sm:w-5 pointer-events-none bee-anim-2-mobile sm:bee-anim-2 z-20"
          />
          <img
            src="/animals/bee3.png"
            alt="Bee 3"
            className="absolute left-[40%] top-[63%] w-2 sm:w-5 pointer-events-none bee-anim-3-mobile sm:bee-anim-3 z-20"
          />
        </div>
      </div>

      {/* keyframes & tiny ping animation */}
      <style jsx global>{`
        @keyframes fly-around-mobile {
          0% { transform: translate(0, 0); }
          25% { transform: translate(1px, -3px); }
          50% { transform: translate(0, -4px); }
          75% { transform: translate(-1px, -3px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes fly-around {
          0% { transform: translate(0, 0); }
          25% { transform: translate(2px, -16px); }
          50% { transform: translate(0, -20px); }
          75% { transform: translate(-2px, -16px); }
          100% { transform: translate(0, 0); }
        }
        .bee-anim-1-mobile {
          animation: fly-around-mobile 3s ease-in-out infinite alternate 0s;
        }
        .bee-anim-2-mobile {
          animation: fly-around-mobile 5s ease-in-out infinite alternate 1.2s;
        }
        .bee-anim-3-mobile {
          animation: fly-around-mobile 3s ease-in-out infinite alternate 0.7s;
        }
        .bee-anim-1 {
          animation: fly-around 1s ease-in-out infinite alternate 0s;
        }
        .bee-anim-2 {
          animation: fly-around 1s ease-in-out infinite alternate 1.2s;
        }
        .bee-anim-3 {
          animation: fly-around 1s ease-in-out infinite alternate 0.7s;
        }

        /* subtle scale pulse */
        @keyframes badgePulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
        .animate-ping-slow {
          animation: badgePulse 0.7s ease-in-out;
        }
      `}</style>
    </section>
  );
}
