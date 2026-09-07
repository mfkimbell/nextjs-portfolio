/* ------------------------------------------------------------------
   src/components/Experience.tsx – responsive timeline w/ WAAPI bob + deterministic offsets
   • mobile: title ▶︎ company ▶︎ date ▶︎ badge at top‑right
   • md+: badge left, title & company inline, date below
   • hides timeline line on small screens
   • badges 50% size on mobile (inside card), full size on md+
-------------------------------------------------------------------*/
"use client";

import { roles, Role } from "@/lib/experience";

// === Configuration ===
const BOB_DURATION_MS = 8000; // full up/down cycle in ms
const BOB_AMPLITUDE_PX = 18; // px of vertical travel
const BOB_STAGGER_MS = 800; // ms offset between each badge's bob start
const BADGE_FULL_PX = 128; // badge width & height at full size
const BADGE_SM_PX = BADGE_FULL_PX / 2; // 64px on sm
const GAP_PX = 32; // spacing from badge center to card

export default function Experience() {
  return (
    <section
      id="experience"
      className="relative overflow-visible py-12 text-white sm:py-16"
    >
      <h2 className="relative z-30 mb-8 text-center text-4xl font-bold neon-text">
        Experience
      </h2>

      <div className="relative z-30 flex w-full justify-center">
        <div
          className={`
            relative mx-auto w-full max-w-[950px]
            px-4 md:pl-[${BADGE_FULL_PX + GAP_PX}px] md:pr-4
          `}
        >
          <ul className="space-y-10">
            {roles.map((role: Role, idx: number) => (
              <li
                key={`${role.company}-${role.dates}-${idx}`}
                className="relative flex flex-col items-start sm:items-center"
              >
                {/* Small badge: visible for <lg (mobile, sm, md) */}
                <div
                  className="absolute top-4 right-4 z-10 block select-none pointer-events-none lg:hidden"
                  style={{ animationDelay: `${idx * -BOB_STAGGER_MS}ms` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={role.logo}
                    alt={`${role.company} badge`}
                    width={BADGE_SM_PX}
                    height={BADGE_SM_PX}
                    className="experience-badge-float rounded-md w-16 h-16"
                  />
                </div>
                {/* Large badge: visible for lg+ */}
                <div
                  className="absolute left-0 top-1/2 z-10 hidden -translate-x-full -translate-y-1/2 select-none pointer-events-none lg:block"
                  style={{ animationDelay: `${idx * -BOB_STAGGER_MS}ms` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={role.logo}
                    alt={`${role.company} badge`}
                    width={BADGE_FULL_PX}
                    height={BADGE_FULL_PX}
                    className="experience-badge-float rounded-md w-32 h-32"
                  />
                </div>

                <article className="relative flex-1 bg-black/10 backdrop-blur-md rounded-xl px-6 py-4 w-full sm:pl-[96px]">
                  <header className="mb-2">
                    {/* Mobile header: title, then company · date */}
                    <div className="block sm:hidden">
                      <h3 className="font-semibold text-lg leading-tight pr-14">
                        {role.title}
                      </h3>
                      <p className="text-sm text-gray-300 mt-1">
                        @ {role.company}
                        <span className="ml-2 text-xs text-blue-200/80">
                          {role.dates}
                        </span>
                      </p>
                    </div>
                    {/* Desktop header: title @ company on left, dates on right */}
                    <div className="hidden sm:flex sm:items-baseline sm:justify-between sm:gap-4">
                      <h3 className="font-semibold text-lg leading-tight">
                        {role.title}
                        <span className="ml-1 text-sm text-gray-300">
                          @ {role.company}
                        </span>
                      </h3>
                      <p className="text-xs text-blue-200/80 whitespace-nowrap">
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
      </div>

      {/* Cloud Animation Styles */}
      <style jsx global>{`
        .experience-badge-float {
          animation: experienceBadgeFloat ${BOB_DURATION_MS}ms ease-in-out infinite;
          animation-delay: inherit;
        }

        @keyframes experienceBadgeFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-${BOB_AMPLITUDE_PX}px); }
        }
      `}</style>
    </section>
  );
}
