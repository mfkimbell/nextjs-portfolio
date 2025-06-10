/* ------------------------------------------------------------------
   src/components/ProjectsSection.tsx – Extra‑Lively Motion ✨
   • Idle: continuous bob + sway via pure‑CSS keyframes (never pauses)
   • Adjacent icons get larger phase/tempo offsets to feel independent
   • Selected:
       ◦ Adds orbit (slightly larger radius on desktop)
       ◦ Pulsing scale (breath‑like)
       ◦ Gentle clockwise spin
       ◦ Animated glow ring via box‑shadow keyframes
   • All text white w/ drop‑shadow
-------------------------------------------------------------------*/
"use client";

import React, {
  useState,
  useEffect,
  KeyboardEvent,
  memo,
  useCallback,
} from "react";
import Image from "next/image";
import {
  motion,
  Variants,
  AnimatePresence,
  useReducedMotion,
} from "framer-motion";
import { projects, Project } from "@/lib/projects";

/* ─────────────────── CSS keyframes (injected once) ─────────────────── */
const styleId = "projects‑idle‑anim";
if (typeof window !== "undefined" && !document.getElementById(styleId)) {
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    /* continuous sine‑like loop (no neutral frame) */
    @keyframes bobSway {
      0%   { transform: translateY(calc(var(--bob) * -1px)) rotate(calc(var(--tilt) * -1)); }
      50%  { transform: translateY(var(--bob))        rotate(var(--tilt)); }
      100% { transform: translateY(calc(var(--bob) * -1px)) rotate(calc(var(--tilt) * -1)); }
    }

    /* pulsing glow ring */
    @keyframes glowPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,131,246,0.0), 0 0 18px 2px rgba(59,131,246,0.7); }
      50%      { box-shadow: 0 0 0 6px rgba(59,131,246,0.25), 0 0 24px 4px rgba(59,131,246,0.9); }
    }
  `;
  document.head.appendChild(style);
}

/* ─────────────────── Helpers ─────────────────── */
function useIsSmallScreen(max = 640) {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${max}px)`);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setSmall(e.matches);
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [max]);
  return small;
}

/* ─────────────────── Icon Button ─────────────────── */
interface IconBtnProps {
  p: Project;
  idx: number;
  selected: boolean;
  isSmall: boolean;
  onPick: (p: Project) => void;
  onPickKey: (e: KeyboardEvent, p: Project) => void;
}

const IconButton = memo<IconBtnProps>(
  ({ p, idx, selected, isSmall, onPick, onPickKey }) => {
    const prefersReduced = useReducedMotion();

    /* ── Idle animation vars (unique per icon) ── */
    const tempo = 4 + (idx % 8) * 0.6;      // 4 – 8.2 s
    const phaseOffset = -(idx % 10) * 0.6;   // negative delay → start mid‑loop

    const idleStyle: React.CSSProperties = prefersReduced
      ? {}
      : {
          animationName: "bobSway",
          animationDuration: `${tempo}s`,
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
          animationDelay: `${phaseOffset}s`,
          // custom vars
          // @ts-ignore
          "--bob": isSmall ? 4 : 8,
          // @ts-ignore
          "--tilt": `${isSmall ? 2 : 4}deg`,
        };

    /* ── Selected orbit + extra flair ── */
    const RADIUS_PX = isSmall ? 4 : 8;
    const circle = Array.from({ length: 9 }, (_, i) => i * 45);
    const orbitX = circle.map((a) => RADIUS_PX * Math.cos((a * Math.PI) / 180));
    const orbitY = circle.map((a) => RADIUS_PX * Math.sin((a * Math.PI) / 180));

    const selVariants: Variants = prefersReduced
      ? {}
      : {
          selected: {
            x: orbitX,
            y: orbitY,
            scale: [1, 1.12, 1],              // breathing pulse
            rotate: [0, 10, -10, 0],          // gentle spin
            transition: {
              repeat: Infinity,
              ease: "linear",
              duration: 2,
              times: circle.map((_, i) => i / (circle.length - 1)),
              rotate: { duration: 6, repeat: Infinity, ease: "easeInOut" },
              scale:  { duration: 1.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
            },
          },
        };

    return (
      <motion.button
        onClick={() => onPick(p)}
        onKeyDown={(e) => onPickKey(e, p)}
        className="flex flex-col items-center focus:outline-none"
        variants={selVariants}
        animate={selected ? "selected" : undefined}
        whileHover={!selected ? { scale: 1.05 } : {}}
        aria-selected={selected}
        style={idleStyle}
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br ${p.gradient}
              sm:h-12 sm:w-12 md:h-16 md:w-16 md:rounded-2xl
              ${selected ? "ring-4 ring-blue-300/80" : ""}`}
          /* animate glow via CSS when selected */
          style={selected && !prefersReduced ? { animation: "glowPulse 2.4s infinite ease-in-out" } : {}}
        >
          <Image
            src={p.logo}
            alt={p.name}
            width={42}
            height={42}
            className="h-9 w-9 filter brightness-0 invert sm:h-10 sm:w-10 md:h-12 md:w-12"
          />
        </div>
        <span className="mt-2 hidden w-20 truncate text-center text-xs text-white drop-shadow md:block">
          {p.name}
        </span>
      </motion.button>
    );
  },
  (prev, next) => prev.selected === next.selected && prev.isSmall === next.isSmall
);

/* ─────────────────── Main Component ─────────────────── */
export default function ProjectsSection() {
  const isSmall = useIsSmallScreen();
  const [active, setActive] = useState<Project>(projects[0]);

  const pick = useCallback((p: Project) => setActive(p), []);
  const pickKey = useCallback(
    (e: KeyboardEvent, p: Project) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick(p);
      }
    },
    [pick]
  );

  return (
    <section id="projects" className="py-10 sm:h-150 md:h-200 lg:h-225">
      <h2 className="neon-text mb-12 text-center text-3xl font-bold">Projects</h2>

      <div className="mx-auto max-w-7xl px-4 lg:flex lg:space-x-10">
        {/* ICON GRID PANEL */}
        <div className="grid flex-1 grid-cols-8 gap-4 sm:grid-cols-10 sm:gap-1 md:grid-cols-10 md:gap-6 lg:h-100 lg:mt-13 lg:grid-cols-6 lg:gap-6">
          {projects.map((p, idx) => (
            <IconButton
              key={p.name}
              p={p}
              idx={idx}
              selected={active.name === p.name}
              isSmall={isSmall}
              onPick={pick}
              onPickKey={pickKey}
            />
          ))}
        </div>

        {/* CONTENT PANEL */}
        <motion.div
          className="mt-10 flex-1 space-y-4 lg:mt-0"
          initial={false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <h3 className="text-xl font-semibold text-white drop-shadow">
            {active.name}
          </h3>

          <div className="my-4 w-full rounded-lg border border-white p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.logo}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Image
                  src={`${active.logo.replace(/(\.[^.]+)$/, "_arch$1")}`}
                  alt={`${active.name} architecture diagram`}
                  width={1000}
                  height={600}
                  className="h-auto w-full rounded-lg"
                  priority
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="text-sm font-medium text-white drop-shadow">
            {active.description}
          </p>

          <div className="flex flex-wrap gap-2">
            {active.tech.map((tech) => (
              <span
                key={tech}
                className="rounded bg-[var(--border)] px-2 py-1 text-xs text-white drop-shadow"
              >
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
