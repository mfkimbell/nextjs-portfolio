/* ------------------------------------------------------------------
   Experience.tsx – timeline w/ WAAPI bob + deterministic offsets
   • roles data in lib/experience.ts
   • GIFs load immediately (spin baked in)
   • bob driven by Web Animations API, seeded by badge index
   • no more data‑src hack, so images always render
-------------------------------------------------------------------*/
"use client";

import { useEffect, useRef } from "react";
import { roles, Role } from "@/lib/experience";

// === Configuration ===
const BOB_DURATION_MS  = 8000;  // full up/down cycle in ms
const BOB_AMPLITUDE_PX = 18;    // px of vertical travel
const BOB_STAGGER_MS   = 800;   // ms offset between each badge’s bob start
const BADGE_SIZE_PX    = 128;   // badge width & height
const GAP_PX           = 32;    // spacing from badge center to card
const BOX_MAX_WIDTH    = "1150px";// max width of container
// === End Configuration ===

export default function Experience() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const badges = containerRef.current!.querySelectorAll<HTMLImageElement>(".badge");
    badges.forEach((img, idx) => {
      // start all GIFs immediately
      // (src is already set in JSX)
      
      // set up bob animation via WAAPI
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
      // seed each loop so they remain perfectly staggered
      anim.currentTime = idx * BOB_STAGGER_MS;
    });
  }, []);

  // compute equal side‑padding so the timeline line sits just left of badges
  const sidePadding = BADGE_SIZE_PX / 2 + GAP_PX;

  return (
    <section id="experience" className="py-0 text-white">
      <h2 className="text-3xl font-bold neon-text mb-16 text-center">
        Experience
      </h2>

      <div
        ref={containerRef}
        className="relative mx-auto"
        style={{
          maxWidth: BOX_MAX_WIDTH,
          paddingLeft: sidePadding,
          paddingRight: sidePadding,
        }}
      >
        {/* vertical timeline line */}
        <span
          className="absolute top-0 h-full w-px bg-white/25"
          style={{ left: sidePadding }}
        />

        <ul className="space-y-14">
          {roles.map((role: Role, idx: number) => (
            <li
              key={`${role.company}-${role.dates}-${idx}`}
              className="flex items-center gap-6"
            >
              {/* badge: src set here so GIF always shows */}
              <img
                className="badge select-none pointer-events-none rounded-md -mr-4"
                src={role.logo}
                alt={`${role.company} badge`}
                width={BADGE_SIZE_PX}
                height={BADGE_SIZE_PX}
              />

              <article className="flex-1 bg-black/10 backdrop-blur-md rounded-xl px-6 py-4">
                <header className="mb-1">
                  <h3 className="font-semibold leading-tight text-lg">
                    {role.title}
                    <span className="ml-1 text-sm text-gray-300">
                      @ {role.company}
                    </span>
                  </h3>
                  <p className="text-xs text-blue-200/80">{role.dates}</p>
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
