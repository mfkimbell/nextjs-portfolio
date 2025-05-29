/* ------------------------------------------------------------------
   src/components/ProjectsSection.tsx – Responsive Motion ✨
   • Idle: gentle bob + sway on all icons. Amplitude automatically halves on small screens (<640 px)
   • Selected: tiny orbital drift with glow. Orbit radius shrinks on small screens so motion feels calmer on iOS/mobile
   • All text white w/ drop‑shadow
-------------------------------------------------------------------*/
"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import Image from "next/image";
import { motion, Variants } from "framer-motion";
import { projects, Project } from "@/lib/projects";

/*************************
 * Helper – responsive    *
 *************************/
function useIsSmallScreen(max = 640) {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(`(max-width:${max}px)`);
    const cb = (e: MediaQueryListEvent | MediaQueryList) => setSmall(e.matches);
    cb(m);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  }, [max]);
  return small;
}

export default function ProjectsSection() {
  const isSmall = useIsSmallScreen();

  // ===== CONFIG (responsive) =====
  const IDLE_BOB  = isSmall ? 4 : 8;   // px
  const IDLE_TILT = isSmall ? 2 : 4;   // deg
  const IDLE_SEC  = 10;                // seconds per loop
  const STAG_S    = 0.5;               // stagger delay

  const RADIUS_PX = isSmall ? 2 : 4;   // orbit radius
  const ORBIT_SEC = 2;                 // seconds per circle

  // generate circular keyframes (0..360 step 45°)
  const circle = Array.from({ length: 9 }, (_, i) => i * 45);
  const orbitX = circle.map(a => RADIUS_PX * Math.cos((a * Math.PI) / 180));
  const orbitY = circle.map(a => RADIUS_PX * Math.sin((a * Math.PI) / 180));

  const iconVariants: Variants = {
    idle: (i: number) => ({
      y:      [0, -IDLE_BOB, 0, IDLE_BOB, 0],
      rotate: [0,  IDLE_TILT, 0, -IDLE_TILT, 0],
      transition: {
        y:      { duration: IDLE_SEC, repeat: Infinity, ease: "easeInOut", delay: i * STAG_S },
        rotate: { duration: IDLE_SEC, repeat: Infinity, ease: "easeInOut", delay: i * STAG_S },
      },
    }),
    selected: {
      x: orbitX,
      y: orbitY,
      transition: {
        duration: ORBIT_SEC,
        ease: "linear",
        repeat: Infinity,
      },
    },
  };

  const [active, setActive] = useState<Project>(projects[0]);
  const pick = (p: Project) => setActive(p);
  const pickKey = (e: KeyboardEvent, p: Project) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(p);
    }
  };

  return (
    <section id="projects" className="py-10">
      <h2 className="neon-text mb-12 text-center text-3xl font-bold">Projects</h2>

      <div className="mx-auto max-w-7xl px-4 lg:flex lg:space-x-10">
        {/* ICON GRID PANEL */}
        <div className="grid flex-1 grid-cols-8 gap-4 sm:gap-1 sm:grid-cols-10 md:grid-cols-10 md:gap-6 lg:grid-cols-6 lg:gap-6 lg:h-100 lg:mt-13">
          {projects.map((p, idx) => {
            const selected = active.name === p.name;
            return (
              <motion.button
                key={p.name}
                onClick={() => pick(p)}
                onKeyDown={(e) => pickKey(e, p)}
                className="flex flex-col items-center focus:outline-none"
                custom={idx}
                variants={iconVariants}
                initial="idle"
                animate={selected ? "selected" : "idle"}
                whileHover={!selected ? { scale: 1.05 } : {}}
                aria-selected={selected}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br ${p.gradient}
                    sm:h-12 sm:w-12 md:h-16 md:w-16 md:rounded-2xl
                    ${selected ? "ring-4 ring-blue-300/80 drop-shadow-[0_0_20px_rgba(59,131,246,0.9)]" : ""}`}
                >
                  <Image
                    src={p.logo}
                    alt={p.name}
                    width={42}
                    height={42}
                    className="h-9 w-9 filter brightness-0 invert sm:h-10 sm:w-10 md:h-12 md:w-12"
                  />
                </div>
                <span className="mt-2 hidden w-16 truncate text-xs text-center text-white drop-shadow md:block">{p.name}</span>
              </motion.button>
            );
          })}
        </div>

        {/* CONTENT PANEL */}
        <motion.div
          key={active.name}
          className="mt-10 flex-1 space-y-4 lg:mt-0"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <h3 className="text-xl font-semibold text-white drop-shadow">{active.name}</h3>

          <div className="my-4 w-full rounded-lg border border-white p-4">
            <Image
              src={`${active.logo.replace(/(\.[^.]+)$/, "_arch$1")}`}
              alt={`${active.name} architecture diagram`}
              width={1000}
              height={600}
              className="h-auto w-full rounded-lg"
              priority
            />
          </div>

          <p className="text-sm font-medium text-white drop-shadow">{active.description}</p>

          <div className="flex flex-wrap gap-2">
            {active.tech.map((tech) => (
              <span key={tech} className="rounded bg-[var(--border)] px-2 py-1 text-xs text-white drop-shadow">
                {tech}
              </span>
            ))}
          </div>

          <a
            href={active.github}
            target="_blank"
            rel="noopener noreferrer"
            className="neon-text mt-4 inline-block text-sm underline"
          >
            View on GitHub →
          </a>
        </motion.div>
      </div>
    </section>
  );
}
