/* ------------------------------------------------------------------
   src/components/Experience.tsx – responsive timeline w/ WAAPI bob + deterministic offsets
   • mobile: title ▶︎ company ▶︎ date ▶︎ badge at top‑right
   • md+: badge left, title & company inline, date below
   • hides timeline line on small screens
   • badges 50% size on mobile (inside card), full size on md+
-------------------------------------------------------------------*/
"use client";

import { useEffect, useRef } from "react";
import { roles, Role } from "@/lib/experience";

// === Configuration ===
const BOB_DURATION_MS  = 8000;   // full up/down cycle in ms
const BOB_AMPLITUDE_PX = 18;     // px of vertical travel
const BOB_STAGGER_MS   = 800;    // ms offset between each badge’s bob start
const BADGE_FULL_PX    = 128;    // badge width & height at full size
const BADGE_SM_PX      = BADGE_FULL_PX / 2; // 64px on sm
const GAP_PX           = 32;     // spacing from badge center to card
const BOX_MAX_WIDTH    = 1150;   // max container width in px
const MD_SIDE_PADDING  = BADGE_FULL_PX / 2 + GAP_PX; // 96

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
    <section id="experience" className="overflow-x-hidden py-16 text-white">
      <h2 className="text-center text-3xl font-bold neon-text mb-12">
        Experience
      </h2>

      <div
        ref={containerRef}
        className={`
          relative mx-auto w-full max-w-[${BOX_MAX_WIDTH}px]
          px-4 md:px-[${MD_SIDE_PADDING}px]
        `}
      >
        

        <ul className="space-y-14">
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
    </section>
  );
}
