"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import type { DialoguePlaqueProps } from "./dialogue-plaque.types";
import { makeJellyPath, PLAQUE_VIEWBOX } from "./jelly-path";

export default function DialoguePlaque({ opacity, blurPx, scale, borderOn, borderWidthPx, borderColor, motionOn, waveAmplitude, waveSpeed, waveSpacing, roundness, minHeight, designWidthRem, children }: DialoguePlaqueProps) {
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
      path.setAttribute("d", makeJellyPath({ phase: active ? seconds * waveSpeed * Math.PI * 2 : 0, amplitude: waveAmplitude, spacing: waveSpacing, roundness, cx: PLAQUE_VIEWBOX.cx, cy: PLAQUE_VIEWBOX.cy, rx: PLAQUE_VIEWBOX.rx, ry: PLAQUE_VIEWBOX.ry }));
      if (active) frame = requestAnimationFrame(draw);
    };
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [motionOn, reducedMotion, roundness, waveAmplitude, waveSpacing, waveSpeed]);

  return (
    <div
      style={{
        backdropFilter: `blur(${blurPx}px)`,
        minHeight,
        transform: `scale(${scale})`,
        // 1em == 1rem at the design width, tracking the bubble from there.
        // Everything inside is authored in em, so the plaque keeps its exact
        // proportions whether it sits at its rem cap, is squeezed to 92vw on a
        // phone, or is rescaled by browser zoom or iOS text sizing.
        fontSize: `calc(100cqw / ${designWidthRem})`,
      }}
      className="relative origin-bottom"
    >
      <svg aria-hidden="true" viewBox="0 0 1000 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_7px_0_rgba(28,24,18,0.5)]">
        <path ref={pathRef} fill={`rgb(255 248 229 / ${opacity})`} stroke={borderOn >= 0.5 ? borderColor : "transparent"} strokeWidth={borderWidthPx} vectorEffect="non-scaling-stroke" />
      </svg>
      {children}
    </div>
  );
}
