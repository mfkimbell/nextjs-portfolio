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
  useRef,
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
import HouseScene from "./HouseScene";

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

    /* gentle bobbing for tie point */
    @keyframes tieBob {
      0%, 100% { transform: translateY(0px); }
      50%      { transform: translateY(-3px); }
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

// Add ultra-small screen detection for mobile
function useIsUltraSmallScreen(max = 420) {
  const [ultraSmall, setUltraSmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${max}px)`);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setUltraSmall(e.matches);
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [max]);
  return ultraSmall;
}

/* ─────────────────── Icon Button ─────────────────── */
interface IconBtnProps {
  p: Project;
  idx: number;
  selected: boolean;
  isSmall: boolean;
  isUltraSmall: boolean;
  onPick: (p: Project) => void;
  onPickKey: (e: KeyboardEvent, p: Project) => void;
}

const IconButton = memo<IconBtnProps>(
  function IconButton({ p, idx, selected, isSmall, isUltraSmall, onPick, onPickKey }) {
    const prefersReduced = useReducedMotion();

    /* ── Idle animation vars (unique per icon) ── */
    const tempo = 4 + (idx % 8) * 0.6;      // 4 – 8.2 s
    const phaseOffset = -(idx % 10) * 0.6;   // negative delay → start mid‑loop

    const idleStyle = prefersReduced
      ? {}
      : ({
        animationName: "bobSway",
        animationDuration: `${tempo}s`,
        animationTimingFunction: "linear",
        animationIterationCount: "infinite",
        animationDelay: `${phaseOffset}s`,
        // custom vars - smaller movement on mobile
        "--bob": isUltraSmall ? 2 : isSmall ? 4 : 8,
        "--tilt": `${isUltraSmall ? 1 : isSmall ? 2 : 4}deg`,
      } as React.CSSProperties);

    /* ── Selected orbit + extra flair ── */
    const RADIUS_PX = isUltraSmall ? 2 : isSmall ? 4 : 8;
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
            scale: { duration: 1.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
          },
        },
      };

    return (
      <motion.button
        onClick={() => onPick(p)}
        onKeyDown={(e) => onPickKey(e, p)}
        className={`flex flex-col items-center focus:outline-none transition-all duration-300 ${selected ? "relative z-20" : "relative z-0"
          }`}
        variants={selVariants}
        animate={selected ? "selected" : undefined}
        whileHover={!selected ? { scale: 1.05 } : {}}
        aria-selected={selected}
        style={idleStyle}
      >
        <div className="relative">
          {/* Main balloon body with spicket */}
          <div
            className={`
              relative flex items-center justify-center rounded-full 
              ${isUltraSmall ? 'w-10 h-11' : 'w-10 h-11'}
              sm:w-12 sm:h-13 md:w-16 md:h-17
              bg-gradient-to-br ${p.gradient}
              transition-all duration-300 ease-out
              ${selected ? "scale-110 -translate-y-1" : ""}
              shadow-lg hover:shadow-xl hover:-translate-y-0.5
            `}
            style={{
              borderRadius: '50% 50% 50% 50% / 45% 45% 55% 55%', // Slightly more oval, taller at bottom
              boxShadow: selected
                ? '0 8px 20px rgba(0,0,0,0.15), inset 1px -4px 0 rgba(0,0,0,0.08)'
                : '0 4px 12px rgba(0,0,0,0.1), inset 0.5px -2px 0 rgba(0,0,0,0.05)',
            }}
          >
            {/* Subtle light reflection overlay */}
            <div
              className="absolute inset-0 rounded-full opacity-60"
              style={{
                background: 'radial-gradient(ellipse 60% 50% at 75% 25%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 50%, transparent 80%)'
              }}
            />

            <Image
              src={p.logo}
              alt={p.name}
              width={42}
              height={42}
              className={`
                ${isUltraSmall ? 'h-7 w-7' : 'h-7 w-7'} 
                sm:h-8 sm:w-8 md:h-10 md:w-10
                filter brightness-0 invert drop-shadow-sm
                transition-all duration-300 ease-out
                ${selected ? "scale-110" : ""}
                relative z-10
              `}
            />

            {/* Simple spicket as overlay div */}
            <div
              className={`
                absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2
                w-0 h-0 
                ${isUltraSmall
                  ? 'border-l-[1.5px] border-r-[1.5px] border-b-[2px]'
                  : 'border-l-[2px] border-r-[2px] border-b-[3px]'}
                sm:border-l-[2.5px] sm:border-r-[2.5px] sm:border-b-[3.5px]
                md:border-l-[3px] md:border-r-[3px] md:border-b-[4px]
                border-l-transparent border-r-transparent
                opacity-60 -z-10
                transition-all duration-300 ease-out
              `}
              style={{
                borderBottomColor: p.gradient.includes('orange') ? '#c2410c' :
                  p.gradient.includes('green') ? '#15803d' :
                    p.gradient.includes('blue') ? '#1d4ed8' :
                      p.gradient.includes('pink') ? '#be185d' :
                        p.gradient.includes('purple') ? '#7c3aed' :
                          p.gradient.includes('indigo') ? '#3730a3' :
                            p.gradient.includes('yellow') ? '#a16207' :
                              p.gradient.includes('red') ? '#b91c1c' :
                                p.gradient.includes('cyan') ? '#0e7490' :
                                  '#6b7280'
              }}
            />
          </div>


        </div>
      </motion.button >
    );
  },
  (prev, next) => prev.selected === next.selected && prev.isSmall === next.isSmall && prev.isUltraSmall === next.isUltraSmall
);

/* ─────────────────── Balloon Bouquet Component ─────────────────── */
interface BalloonBouquetProps {
  projects: Project[];
  isSmall: boolean;
  isUltraSmall: boolean;
  active: Project;
  onPick: (p: Project) => void;
  onPickKey: (e: KeyboardEvent, p: Project) => void;
}

function BalloonBouquet({ projects, isSmall, isUltraSmall, active, onPick, onPickKey }: BalloonBouquetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Define scale factor - mobile is much smaller
  const scaleFactor = isUltraSmall ? 0.5 : isSmall ? 0.75 : 1;

  // Base desktop dimensions
  const baseWidth = 600;
  const baseHeight = 1000; // Much larger height to accommodate very low house position
  const baseSpacing = 70;
  const baseRowHeight = 55;
  const baseCenterX = 300;
  const baseTieY = 500;

  // Scaled dimensions
  const containerWidth = Math.round(baseWidth * scaleFactor);
  const containerHeight = Math.round(baseHeight * scaleFactor);
  const spacing = baseSpacing * scaleFactor;
  const rowHeight = baseRowHeight * scaleFactor * (isUltraSmall ? 1.6 : 1); // Extra vertical spacing for mobile
  const centerX = baseCenterX * scaleFactor;
  const tieY = baseTieY * scaleFactor + (isUltraSmall ? 40 : 0); // Move anchor down more for mobile

  // Create bouquet layout: IDENTICAL for all screen sizes
  const createBouquetLayout = () => {
    const layout: { project: Project; row: number; col: number; maxCols: number }[] = [];
    let projectIndex = 0;

    // Desktop row configuration - test with very different layout
    const rowConfigs = [
      { maxCols: 6 },  // Top row
      { maxCols: 7 },  // Second row 
      { maxCols: 8 },  // Third row
      { maxCols: 9 },  // Fourth row (widest)
      { maxCols: 8 },  // Fifth row 
      { maxCols: 7 },  // Sixth row
      { maxCols: 6 },  // Seventh row (last row)
    ];

    rowConfigs.forEach((config, rowIndex) => {
      for (let col = 0; col < config.maxCols && projectIndex < projects.length; col++) {
        layout.push({
          project: projects[projectIndex],
          row: rowIndex,
          col: col,
          maxCols: config.maxCols
        });
        projectIndex++;
      }
    });

    return layout;
  };

  const balloonLayout = createBouquetLayout();

  // Shared function to calculate exact balloon position
  const calculateBalloonPosition = (item: { project: Project; row: number; col: number; maxCols: number }) => {
    const rowWidth = (item.maxCols - 1) * spacing;
    const rowStartX = centerX - rowWidth / 2;

    let balloonX = rowStartX + (item.col * spacing);
    let balloonY = (item.row * rowHeight) + (50 * scaleFactor);

    // Special centering for the last row - always center on all screen sizes
    const lastRowItems = balloonLayout.filter(b => b.row === item.row);
    const isLastRow = item.row === Math.max(...balloonLayout.map(b => b.row));

    if (isLastRow && lastRowItems.length < item.maxCols) {
      // Center the actual balloons in the last row
      const actualBalloons = lastRowItems.length;
      const lastRowSpacing = spacing;
      const lastRowWidth = (actualBalloons - 1) * lastRowSpacing;
      const lastRowStartX = centerX - lastRowWidth / 2;
      balloonX = lastRowStartX + (item.col * lastRowSpacing);
    }

    // Apply push-away logic with scaled distances
    if (active.name !== item.project.name) {
      const selectedBalloon = balloonLayout.find(b => b.project.name === active.name);
      if (selectedBalloon) {
        const selectedRowWidth = (selectedBalloon.maxCols - 1) * spacing;
        const selectedRowStartX = centerX - selectedRowWidth / 2;
        const selectedX = selectedRowStartX + (selectedBalloon.col * spacing);
        const selectedY = (selectedBalloon.row * rowHeight) + (50 * scaleFactor);

        const deltaX = balloonX - selectedX;
        const deltaY = balloonY - selectedY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        const pushDistance = 120 * scaleFactor;
        if (distance < pushDistance && distance > 0) {
          const pushStrength = 15 * scaleFactor;
          const pushX = (deltaX / distance) * pushStrength;
          const pushY = (deltaY / distance) * pushStrength;

          balloonX += pushX;
          balloonY += pushY;
        }
      }
    }

    return { balloonX, balloonY };
  };

  return (
    <div className="flex justify-center items-start w-full">
      <div
        ref={containerRef}
        className="relative"
        style={{
          width: `${containerWidth}px`,
          height: `${containerHeight}px`
        }}
      >
        {/* Dynamic Balloon Strings */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          viewBox={`0 0 ${containerWidth} ${containerHeight}`}
          style={{ overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="stringGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'rgba(255,255,255,0.4)', stopOpacity: 1 }} />
              <stop offset="30%" style={{ stopColor: 'rgba(255,255,255,0.3)', stopOpacity: 1 }} />
              <stop offset="70%" style={{ stopColor: 'rgba(255,255,255,0.2)', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: 'rgba(255,255,255,0.1)', stopOpacity: 1 }} />
            </linearGradient>
          </defs>

          {balloonLayout.map((item, idx) => {
            // Use shared position calculation
            const { balloonX, balloonY } = calculateBalloonPosition(item);

            // String attaches to balloon bottom (scaled balloon height)
            const balloonBottomY = balloonY + (32 * scaleFactor);

            // Convergence point at bottom center
            const tieX = centerX;

            // Calculate string physics (all scaled)
            const distance = Math.sqrt(Math.pow(balloonX - tieX, 2) + Math.pow(balloonBottomY - tieY, 2));
            const sag = Math.min(distance * 0.15, 25 * scaleFactor);
            const windOffset = Math.sin(idx * 0.4) * (2 * scaleFactor);

            // Control points for natural curve (scaled)
            const cp1X = balloonX + windOffset;
            const cp1Y = balloonBottomY + sag + (30 * scaleFactor);
            const cp2X = tieX + windOffset * 0.3;
            const cp2Y = tieY - sag * 0.4;

            return (
              <path
                key={`string-${item.project.name}`}
                d={`M ${balloonX} ${balloonBottomY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${tieX} ${tieY}`}
                stroke="url(#stringGradient)"
                strokeWidth={1.5 * scaleFactor}
                fill="none"
                className="animate-pulse"
                style={{
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))',
                  transition: 'd 0.7s ease-out',
                  animationDelay: `${idx * 0.1}s`,
                  animationDuration: '4s',
                  zIndex: active.name === item.project.name ? 100 : 1 // Selected balloon's string on top
                }}
              />
            );
          })}
        </svg>

        {/* House at Tie Point - Pixar Up Style */}
        <HouseScene
          scaleFactor={scaleFactor}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          centerX={centerX}
          tieY={tieY}
        />

        {/* Balloons in Bouquet Formation */}
        {balloonLayout.map((item, idx) => {
          // Use shared position calculation
          const { balloonX, balloonY } = calculateBalloonPosition(item);

          return (
            <div
              key={item.project.name}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out ${active.name === item.project.name ? "z-50" : "z-10"
                }`}
              style={{
                left: `${balloonX}px`,
                top: `${balloonY}px`,
              }}
            >
              <IconButton
                p={item.project}
                idx={idx}
                selected={active.name === item.project.name}
                isSmall={isSmall}
                isUltraSmall={isUltraSmall}
                onPick={onPick}
                onPickKey={onPickKey}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────── Main Component ─────────────────── */
export default function ProjectsSection() {
  const isSmall = useIsSmallScreen();
  const isUltraSmall = useIsUltraSmallScreen();
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
    <section id="projects" className="py-0 px-8 relative mb-[-100px]">
      {/* Mobile Clouds (< 768px) */}
      <Image
        src="/clouds/cloud4.png"
        alt=""
        width={70}
        height={70}
        priority
        className="absolute left-[12%] top-[20%] opacity-45 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "8px",
          animationDuration: "8.8s",
          animationDelay: "-2.1s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud2.png"
        alt=""
        width={55}
        height={55}
        priority
        className="absolute right-[10%] top-[30%] opacity-50 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "6px",
          animationDuration: "7.5s",
          animationDelay: "-4.3s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud1.png"
        alt=""
        width={65}
        height={65}
        priority
        className="absolute left-[80%] top-[75%] opacity-40 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "7px",
          animationDuration: "9.1s",
          animationDelay: "-1.8s",
        } as React.CSSProperties}
      />

      {/* Desktop Clouds (≥ 768px) */}
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={180}
        height={180}
        priority
        className="absolute left-[10%] top-[15%] opacity-60 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "18px",
          animationDuration: "12.5s",
          animationDelay: "-3.2s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud1.png"
        alt=""
        width={160}
        height={160}
        priority
        className="absolute right-[8%] top-[25%] opacity-65 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "15px",
          animationDuration: "10.8s",
          animationDelay: "-1.5s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud4.png"
        alt=""
        width={140}
        height={140}
        priority
        className="absolute left-[75%] top-[70%] opacity-55 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "12px",
          animationDuration: "9.7s",
          animationDelay: "-5.8s",
        } as React.CSSProperties}
      />

      <h2 className="neon-text mb-12 text-center text-3xl font-bold">Projects</h2>

      <div className="mx-auto max-w-7xl px-4 lg:flex lg:space-x-10">
        {/* BALLOON BOUQUET PANEL */}
        <div className="relative flex-1">
          <BalloonBouquet
            projects={projects}
            isSmall={isSmall}
            isUltraSmall={isUltraSmall}
            active={active}
            onPick={pick}
            onPickKey={pickKey}
          />
        </div>

        {/* CONTENT PANEL */}
        <div className="-mt-20 flex-1 lg:mt-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={active.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                duration: 0.4,
                ease: [0.4, 0.0, 0.2, 1],
                type: "tween"
              }}
              className="space-y-4"
            >
              <motion.h3
                className="text-xl font-semibold text-white drop-shadow"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                {active.name}
              </motion.h3>

              <motion.div
                className="my-4 w-full rounded-lg border border-white p-4"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, duration: 0.35 }}
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

              <motion.p
                className="text-sm font-medium text-white drop-shadow"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                {active.description}
              </motion.p>

              <motion.div
                className="flex flex-wrap gap-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.3 }}
              >
                {active.tech.map((tech, index) => (
                  <motion.span
                    key={tech}
                    className="rounded bg-[var(--border)] px-2 py-1 text-xs text-white drop-shadow"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: 0.3 + (index * 0.02),
                      duration: 0.2,
                      type: "spring",
                      stiffness: 500,
                      damping: 30
                    }}
                  >
                    {tech}
                  </motion.span>
                ))}
              </motion.div>

              <motion.a
                href={active.github}
                target="_blank"
                rel="noopener noreferrer"
                className="neon-text mt-4 inline-block text-sm underline"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.3 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                View on GitHub →
              </motion.a>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
