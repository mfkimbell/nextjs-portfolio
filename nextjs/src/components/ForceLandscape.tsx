"use client";

import { useEffect, useState } from "react";

type Box = { w: number; h: number; tx: number; rotate: boolean };

/**
 * Keeps the site in a landscape-shaped box however the phone is held.
 *
 * A web page cannot turn a device's orientation on iOS. `screen.orientation
 * .lock()` is Android-and-fullscreen only and is simply absent in iOS Safari,
 * and the manifest's `orientation` field applies to installed PWAs, which
 * Safari also ignores. The one approach that works everywhere is to rotate the
 * PAGE instead of the device: in portrait we render into a box with the
 * dimensions swapped and turn it 90 degrees, so the layout is always the
 * landscape one and the visitor turns the phone to read it.
 *
 * The box is measured in JS rather than written as 100vw/100vh because those
 * units disagree with the visible area on iOS while the browser chrome is
 * collapsing - which would leave a strip of the rotated box hanging off the
 * screen, the exact bug this is meant to avoid.
 *
 * `position: fixed` descendants resolve against a transformed ancestor rather
 * than the viewport, so the overlay buttons inside ride along with the
 * rotation instead of staying stuck to the physical screen edges.
 */
export default function ForceLandscape({ children }: { children: React.ReactNode }) {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const portrait = vh > vw;
      setBox({
        w: portrait ? vh : vw,
        h: portrait ? vw : vh,
        // Rotating about the top-left corner swings the box off to the left,
        // so it gets pushed back across by one viewport width.
        tx: portrait ? vw : 0,
        rotate: portrait,
      });
    };
    measure();

    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    // iOS reports the final size late, as the address bar finishes collapsing;
    // visualViewport is what actually tracks that.
    window.visualViewport?.addEventListener("resize", measure);

    // Where a real lock IS available (Android, installed or fullscreen), take
    // it - then the page rotation below never has to kick in.
    void (async () => {
      try {
        const o = screen.orientation as ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
        };
        await o?.lock?.("landscape");
      } catch {
        // iOS, or Android outside fullscreen. Expected; the rotation covers it.
      }
    })();

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  // The wrapper is ALWAYS rendered, never swapped in after measuring. Two
  // reasons: <main> inside is h-full, so a missing wrapper would give it a
  // percentage height of nothing and collapse the scene to zero on first
  // paint; and rendering a different tree before/after the effect is a
  // hydration mismatch. Server and first client paint both get the same
  // viewport-unit fallback, then the effect swaps in measured pixels.
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: box ? box.w : "100%",
        height: box ? box.h : "100dvh",
        overflow: "hidden",
        transformOrigin: "top left",
        transform: box?.rotate ? `translateX(${box.tx}px) rotate(90deg)` : undefined,
      }}
    >
      {children}
    </div>
  );
}
