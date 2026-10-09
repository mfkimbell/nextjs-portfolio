"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import type { DialoguePlaqueProps } from "./dialogue-plaque.types";
import { makeJellyPath } from "./jelly-path";

export default function DialoguePlaque({ opacity, blurPx, scale, borderOn, borderWidthPx, borderColor, motionOn, waveAmplitude, waveSpeed, waveSpacing, roundness, minHeight, children }: DialoguePlaqueProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const active = motionOn >= 0.5 && !reducedMotion && waveAmplitude > 0.01 && waveSpeed > 0;
    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const seconds = (now - start) / 1000;
      path.setAttribute("d", makeJellyPath({ phase: active ? seconds * waveSpeed * Math.PI * 2 : 0, amplitude: waveAmplitude, spacing: waveSpacing, roundness, cx: 500, cy: 150, rx: 462, ry: 116 }));
      if (active) frame = requestAnimationFrame(draw);
    };
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [motionOn, reducedMotion, roundness, waveAmplitude, waveSpacing, waveSpeed]);

  return (
    <div style={{ backdropFilter: `blur(${blurPx}px)`, minHeight, transform: `scale(${scale})` }} className="relative origin-bottom">
      <svg aria-hidden="true" viewBox="0 0 1000 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_7px_0_rgba(28,24,18,0.5)]">
        <path ref={pathRef} fill={`rgb(255 248 229 / ${opacity})`} stroke={borderOn >= 0.5 ? borderColor : "transparent"} strokeWidth={borderWidthPx} vectorEffect="non-scaling-stroke" />
      </svg>
      {children}
    </div>
  );
}
