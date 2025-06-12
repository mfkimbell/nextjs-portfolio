/* ------------------------------------------------------------------
   src/components/Metrics.tsx – live‑updating website metrics
   • DB totals from /api/metrics (Neon + Prisma)
   • Session increments from Redux (clicks + mouse miles)
   • Tiny badge animates ("+1", "+0.05") to prove it's live
   • Raw text metrics overlaid between raccoon and bees
-------------------------------------------------------------------*/
"use client";

import { useEffect } from "react";
import useSWRImmutable from "swr/immutable";
import Image from "next/image";
import { useAppSelector } from "@/lib/hooks";
import CanvasBoard from "./CanvasBoard";
import {
  Eye,
  MousePointer,
  MousePointerClick,
} from "lucide-react";

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

  useEffect(() => {
    // Count a real page‑view exactly once on client‑side mount
    fetch('/api/metrics/visit', { method: 'POST' })
      .catch(console.error);
  }, []);

  if (!base) return null;

  /* 3 ▸ merge totals + increments */
  const visits = base.totalVisits;
  const clicks = base.totalClicks + session.clicks;
  const mouseMiles = base.totalMouseMiles + session.mouseMiles;

  return (
    <section id="metrics" className="mt-20 relative overflow-hidden">
      {/* Mobile Clouds (< 768px) */}
      <Image
        src="/clouds/cloud1.png"
        alt=""
        width={60}
        height={60}
        priority
        className="absolute left-[15%] top-[25%] opacity-45 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "6px",
          animationDuration: "8.1s",
          animationDelay: "-1.8s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={50}
        height={50}
        priority
        className="absolute right-[18%] top-[35%] opacity-50 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "5px",
          animationDuration: "7.4s",
          animationDelay: "-3.2s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud2.png"
        alt=""
        width={55}
        height={55}
        priority
        className="absolute left-[75%] top-[80%] opacity-40 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "6px",
          animationDuration: "8.9s",
          animationDelay: "-2.5s",
        } as React.CSSProperties}
      />

      {/* Desktop Clouds (≥ 768px) */}
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={170}
        height={170}
        priority
        className="absolute left-[12%] top-[20%] opacity-65 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "16px",
          animationDuration: "11.8s",
          animationDelay: "-2.5s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud2.png"
        alt=""
        width={150}
        height={150}
        priority
        className="absolute right-[15%] top-[30%] opacity-60 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "14px",
          animationDuration: "10.2s",
          animationDelay: "-4.7s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={130}
        height={130}
        priority
        className="absolute left-[80%] top-[75%] opacity-55 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "12px",
          animationDuration: "9.5s",
          animationDelay: "-1.8s",
        } as React.CSSProperties}
      />

      <h2 className="text-center text-white text-3xl font-bold mb-8">
        Canvas
      </h2>

      <CanvasBoard />

      <div className="flex justify-center mt-2 sm:mb-10 md:mb-5 lg:-mb-19  pb-2 ">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1"><Eye size={16} /> <span>{visits.toLocaleString()}</span></div>
          <div className="flex items-center gap-1"><MousePointerClick size={16} /> <span>{clicks.toLocaleString()}</span></div>
          <div className="flex items-center gap-1"><MousePointer size={16} /> <span>{mouseMiles.toFixed(4).toLocaleString()}</span></div>
        </div>
      </div>

      {/* grass / raccoon / bees strip ▸ unchanged but with metrics overlay */}
      <div className="relative w-full overflow-x-hidden overflow-y-visible   py-11.5 mt-9 sm:py-0   max-w-[100vw] z-50">
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
          <Image
            src="/gifs/racoon.gif"
            alt="Raccoon"
            width={200}
            height={200}
            className="absolute left-[57%] top-[3%] w-[10%] pointer-events-none z-350 overflow-visible"
          />

          {/* bees */}
          <Image
            src="/animals/bee1.png"
            alt="Bee 1"
            width={40}
            height={40}
            className="absolute left-[28%] top-[60%] w-2 sm:w-5 pointer-events-none bee-anim-1-mobile sm:bee-anim-1 z-20"
          />
          <Image
            src="/animals/bee2.png"
            alt="Bee 2"
            width={40}
            height={40}
            className="absolute left-[32%] top-[55%] w-2 sm:w-5 pointer-events-none bee-anim-2-mobile sm:bee-anim-2 z-20"
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

        .cloud {
          animation-name: float;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
      `}</style>
    </section>
  );
}
