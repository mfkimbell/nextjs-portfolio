"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { makeJellyPath } from "./jelly-path";

// A jelly blob that fills whatever it is dropped into, for small labels like
// the bear name tags. Unlike the plaque — which stretches one fixed 1000x300
// viewBox — this measures its host so the wave stays the same depth on every
// edge no matter how wide the text makes the tag.

const SAMPLE_COUNT = 64;

export type JellyBackdropProps = {
  fill: string;
  stroke: string;
  strokeWidthPx: number;
  shadowColor: string;
  shadowYPx: number;
  amplitude: number;
  speed: number;
  spacing: number;
  roundness: number;
  motionOn: number;
  /** Radians, so sibling tags do not wobble in lockstep. */
  phaseOffset?: number;
};

export default function JellyBackdrop({
  fill,
  stroke,
  strokeWidthPx,
  shadowColor,
  shadowYPx,
  amplitude,
  speed,
  spacing,
  roundness,
  motionOn,
  phaseOffset = 0,
}: JellyBackdropProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      setSize((current) =>
        current.width === host.offsetWidth && current.height === host.offsetHeight
          ? current
          : { width: host.offsetWidth, height: host.offsetHeight },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const path = pathRef.current;
    if (!path || size.width <= 0 || size.height <= 0) return;
    // Keep the stroke and the wave crests inside the box.
    const inset = strokeWidthPx / 2 + amplitude;
    const rx = Math.max(1, size.width / 2 - inset);
    const ry = Math.max(1, size.height / 2 - inset);
    const active = motionOn >= 0.5 && !reducedMotion && amplitude > 0.01 && speed > 0;
    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const seconds = (now - start) / 1000;
      path.setAttribute(
        "d",
        makeJellyPath({
          phase: (active ? seconds * speed * Math.PI * 2 : 0) + phaseOffset,
          amplitude,
          spacing,
          roundness,
          cx: size.width / 2,
          cy: size.height / 2,
          rx,
          ry,
          count: SAMPLE_COUNT,
        }),
      );
      if (active) frame = requestAnimationFrame(draw);
    };
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [amplitude, motionOn, phaseOffset, reducedMotion, roundness, size, spacing, speed, strokeWidthPx]);

  return (
    <div ref={hostRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
      {size.width > 0 && size.height > 0 ? (
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="h-full w-full overflow-visible"
          style={{ filter: shadowYPx !== 0 ? `drop-shadow(0 ${shadowYPx}px 0 ${shadowColor})` : undefined }}
        >
          <path ref={pathRef} fill={fill} stroke={strokeWidthPx > 0 ? stroke : "none"} strokeWidth={strokeWidthPx} strokeLinejoin="round" />
        </svg>
      ) : null}
    </div>
  );
}
