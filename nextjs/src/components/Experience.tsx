/* ------------------------------------------------------------------
   src/components/Experience.tsx – responsive timeline w/ WAAPI bob + deterministic offsets
   • mobile: title ▶︎ company ▶︎ date ▶︎ badge at top‑right
   • md+: badge left, title & company inline, date below
   • hides timeline line on small screens
   • badges 50% size on mobile (inside card), full size on md+
-------------------------------------------------------------------*/
"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { roles, Role } from "@/lib/experience";

// === Configuration ===
const BOB_DURATION_MS = 8000;   // full up/down cycle in ms
const BOB_AMPLITUDE_PX = 18;     // px of vertical travel
const BOB_STAGGER_MS = 800;    // ms offset between each badge's bob start
const BADGE_FULL_PX = 128;    // badge width & height at full size
const BADGE_SM_PX = BADGE_FULL_PX / 2; // 64px on sm
const GAP_PX = 32;     // spacing from badge center to card
const BOX_MAX_WIDTH = 1150;   // max container width in px
const MD_SIDE_PADDING = BADGE_FULL_PX / 2 + GAP_PX; // 96

export default function Experience() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const badges = containerRef.current!.querySelectorAll<HTMLImageElement>(".badge");
    badges.forEach((img, idx) => {
      const anim = img.animate(
        [
          { transform: "translateY(0)" },
          { transform: `translateY(-${BOB_AMPLITUDE_PX}px)` },
          { transform: "translateY(0)" },
        ],
        {
          duration: BOB_DURATION_MS,
          iterations: Infinity,
          easing: "ease-in-out",
        }
      );
      anim.currentTime = idx * BOB_STAGGER_MS;
    });
  }, []);

  return (
    <section id="experience" className="overflow-x-hidden py-0 text-white relative">
      {/* Mobile Clouds (< 768px) */}
      <Image
        src="/clouds/cloud2.png"
        alt=""
        width={65}
        height={65}
        priority
        className="absolute left-[8%] top-[25%] opacity-45 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "7px",
          animationDuration: "8.3s",
          animationDelay: "-1.5s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud4.png"
        alt=""
        width={50}
        height={50}
        priority
        className="absolute right-[12%] top-[40%] opacity-50 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "5px",
          animationDuration: "7.1s",
          animationDelay: "-3.8s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={60}
        height={60}
        priority
        className="absolute left-[85%] top-[80%] opacity-40 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "6px",
          animationDuration: "8.7s",
          animationDelay: "-2.2s",
        } as React.CSSProperties}
      />

      {/* Desktop Clouds (≥ 768px) */}
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={150}
        height={150}
        priority
        className="absolute left-[8%] top-[20%] opacity-65 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "15px",
          animationDuration: "11.5s",
          animationDelay: "-2.8s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud1.png"
        alt=""
        width={130}
        height={130}
        priority
        className="absolute right-[10%] top-[35%] opacity-60 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "12px",
          animationDuration: "9.7s",
          animationDelay: "-4.2s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud4.png"
        alt=""
        width={120}
        height={120}
        priority
        className="absolute left-[85%] top-[75%] opacity-55 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "10px",
          animationDuration: "10.3s",
          animationDelay: "-1.5s",
        } as React.CSSProperties}
      />

      <h2 className="text-center text-3xl font-bold neon-text mb-12">
        Experience
      </h2>

      <div
        ref={containerRef}
        className={`
          relative sm:ml-2  mx-auto w-full max-w-[${BOX_MAX_WIDTH}px]
          px-4 md:px-[${MD_SIDE_PADDING}px]
        `}
      >


        <ul className="space-y-14 sm:mr-13">
          {roles.map((role: Role, idx: number) => (
            <li
              key={`${role.company}-${role.dates}-${idx}`}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-6"
            >
              {/* desktop badge on left */}
              <img
                src={role.logo}
                alt={`${role.company} badge`}
                width={BADGE_FULL_PX}
                height={BADGE_FULL_PX}
                className={`
                  hidden sm:block select-none pointer-events-none rounded-md
                  w-[${BADGE_FULL_PX}px] h-[${BADGE_FULL_PX}px]
                  badge
                `}
              />

              <article className="relative flex-1 bg-black/10 backdrop-blur-md rounded-xl px-6 py-4">
                {/* mobile badge at top-right */}
                <img
                  src={role.logo}
                  alt=""
                  width={BADGE_SM_PX}
                  height={BADGE_SM_PX}
                  className={`
                    sm:hidden absolute top-4 right-4 select-none pointer-events-none rounded-md
                    w-[${BADGE_SM_PX}px] h-[${BADGE_SM_PX}px]
                    badge
                  `}
                />

                <header className="mb-2">
                  {/* Mobile header: title, then company, then date */}
                  <div className="block sm:hidden ">
                    <h3 className="font-semibold text-lg leading-tight">
                      {role.title}
                    </h3>
                    <p className="text-sm text-gray-300 mt-1">
                      @ {role.company}
                    </p>
                    <p className="text-xs text-blue-200/80 mt-1">
                      {role.dates}
                    </p>
                  </div>
                  {/* Desktop header: title & company inline, date below */}
                  <div className="hidden sm:block">
                    <h3 className="font-semibold text-lg leading-tight">
                      {role.title}
                      <span className="ml-1 text-sm text-gray-300">
                        @ {role.company}
                      </span>
                    </h3>
                    <p className="text-xs text-blue-200/80 mt-1">
                      {role.dates}
                    </p>
                  </div>
                </header>

                <ul className="list-disc list-inside text-sm leading-relaxed marker:text-current/70 pl-1">
                  {role.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ul>
      </div>

      {/* Cloud Animation Styles */}
      <style jsx global>{`
        .cloud {
          animation-name: float;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
      `}</style>
    </section>
  );
}
