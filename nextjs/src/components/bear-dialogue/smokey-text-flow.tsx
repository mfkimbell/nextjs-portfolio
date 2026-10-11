"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Text that flows around the Smokey icon instead of being boxed away from it.
//
// Uniform padding wastes the whole column above the icon: the bear sits in the
// bottom-right corner, so only the last few lines need to be short. CSS floats
// are the only thing that makes text wrap around a box, and a float is placed
// at the line it appears in — which puts it at the TOP. To pull the reserved
// space down to the bottom corner, a zero-width float of height
// (text height - reserve height) goes in front of it and pushes it down.
//
// That height can only be known by measuring, and measuring feeds back into
// wrapping, so the two settle over a pass or two and then hold. The pass
// counter stops a pathological line from oscillating forever.

const REM_FALLBACK_PX = 16;
const SETTLE_TOLERANCE_PX = 2;
const MAX_SETTLE_PASSES = 4;

export type SmokeyTextFlowProps = {
  padTopRem: number;
  padRightRem: number;
  padBottomRem: number;
  padLeftRem: number;
  /** How far the icon intrudes past the padding, from the right and bottom. */
  reserveWidthRem: number;
  reserveHeightRem: number;
  /** shape-outside for the reserve, so lines hug the bear's silhouette. */
  reserveShape?: string;
  /** The plaque's min-height in em. The icon is pinned to the PLAQUE's
   *  bottom, so the flow has to be at least as tall or the reserve sits above
   *  the bear whenever the copy is short. */
  minHeightEm?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

export default function SmokeyTextFlow({
  padTopRem,
  padRightRem,
  padBottomRem,
  padLeftRem,
  reserveWidthRem,
  reserveHeightRem,
  reserveShape,
  minHeightEm = 0,
  className,
  style,
  children,
}: SmokeyTextFlowProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const passesRef = useRef(0);
  const [pushPx, setPushPx] = useState(0);
  const reserving = reserveWidthRem > 0 && reserveHeightRem > 0;

  useEffect(() => {
    const node = textRef.current;
    if (!node || !reserving) return;
    // New geometry gets a fresh settle budget, but the push KEEPS its current
    // value. Zeroing it here meant every tick of a slider sent the reserve
    // back to the top of the flow, so the copy snapped to full width and then
    // re-wrapped a frame later — a flicker on every pixel of a drag, right
    // when you are trying to judge the result.
    passesRef.current = 0;
    // The reserve is sized in em, so convert with THIS element's em, not the
    // root rem. They only agree at the plaque's design width; anywhere else
    // (narrow phone, browser zoom, the lab preview) the push was computed for
    // a block of a different height than the one drawn, and the settle loop
    // kept chasing it.
    const emPx = parseFloat(getComputedStyle(node).fontSize) || REM_FALLBACK_PX;
    const settle = () => {
      // Push the reserve down to the bottom of the text box: the copy's height,
      // or the plaque's min-height when the copy is shorter than that. Worked
      // out from the min-height NUMBER rather than measuring the flow, because
      // the flow's height includes these floats — measuring it would let a
      // push that got too big hold itself up forever after words are removed.
      const floorPx = (minHeightEm - padTopRem - padBottomRem) * emPx;
      const want = Math.max(0, Math.max(node.offsetHeight, floorPx) - reserveHeightRem * emPx);
      setPushPx((previous) => {
        if (Math.abs(previous - want) <= SETTLE_TOLERANCE_PX) return previous;
        if (passesRef.current >= MAX_SETTLE_PASSES) return previous;
        passesRef.current += 1;
        return want;
      });
    };
    settle();
    const observer = new ResizeObserver(settle);
    observer.observe(node);
    return () => observer.disconnect();
  }, [minHeightEm, padBottomRem, padLeftRem, padRightRem, padTopRem, reserving, reserveHeightRem, reserveWidthRem, reserveShape]);

  return (
    <div
      className={className}
      style={{
        ...style,
        display: "flow-root",
        boxSizing: "border-box",
        minHeight: minHeightEm > 0 ? `${minHeightEm}em` : undefined,
        paddingTop: `${padTopRem}em`,
        paddingRight: `${padRightRem}em`,
        paddingBottom: `${padBottomRem}em`,
        paddingLeft: `${padLeftRem}em`,
      }}
    >
      {reserving ? (
        <>
          <div aria-hidden="true" style={{ float: "right", width: 0, height: `${pushPx}px` }} />
          <div
            aria-hidden="true"
            style={{
              float: "right",
              clear: "right",
              width: `${reserveWidthRem}em`,
              height: `${reserveHeightRem}em`,
              shapeOutside: reserveShape,
            }}
          />
        </>
      ) : null}
      <div ref={textRef}>{children}</div>
    </div>
  );
}
