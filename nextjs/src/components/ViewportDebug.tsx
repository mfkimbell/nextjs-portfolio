"use client";

import { useEffect, useState } from "react";

/**
 * Temporary. Add ?debug to the URL to get the numbers that decide where a
 * black bar comes from, plus magenta strips pinned to the LAYOUT VIEWPORT'S
 * own left and right edges.
 *
 * The strips are the actual test, and they need no reading:
 *   - strips at the physical screen edges, outside the bars  -> the page covers
 *     the screen and something INSIDE it is painting the bars
 *   - strips at the inner edge of the bars                   -> Safari is
 *     laying the page out inside the safe area and viewport-fit=cover is not
 *     taking effect
 *
 * Mounted OUTSIDE ForceLandscape on purpose: position:fixed resolves against a
 * transformed ancestor, so nesting it would pin the strips to the rotated box
 * instead of the screen and measure the wrong thing.
 */
export default function ViewportDebug() {
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("debug")) return;

    // env() is only readable through a real element's computed style.
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right)" +
      " env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);

    const read = () => {
      const p = getComputedStyle(probe);
      const fl = document.querySelector(".force-landscape");
      const r = fl?.getBoundingClientRect();
      const cv = document.querySelector("canvas");
      const b = document.body.getBoundingClientRect();
      const vv = window.visualViewport;
      setLines([
        `inner    ${window.innerWidth} x ${window.innerHeight}`,
        `screen   ${window.screen.width} x ${window.screen.height}  dpr ${window.devicePixelRatio}`,
        `visual   ${vv ? Math.round(vv.width) + " x " + Math.round(vv.height) + " @" + Math.round(vv.offsetLeft) : "n/a"}`,
        `safe     L ${p.paddingLeft}  R ${p.paddingRight}  T ${p.paddingTop}  B ${p.paddingBottom}`,
        `body     left ${Math.round(b.left)}  w ${Math.round(b.width)}`,
        `wrapper  ${r ? `left ${Math.round(r.left)}  w ${Math.round(r.width)} x ${Math.round(r.height)}` : "NOT FOUND"}`,
        `canvas   ${cv ? `${cv.clientWidth} x ${cv.clientHeight}` : "none"}`,
      ]);
    };

    read();
    const id = window.setInterval(read, 400);
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
      window.visualViewport?.removeEventListener("resize", read);
      probe.remove();
    };
  }, []);

  if (!lines) return null;

  const strip: React.CSSProperties = {
    position: "fixed",
    top: 0,
    bottom: 0,
    width: 8,
    background: "#ff00d4",
    zIndex: 3000,
    pointerEvents: "none",
  };

  return (
    <>
      <div style={{ ...strip, left: 0 }} />
      <div style={{ ...strip, right: 0 }} />
      <div
        style={{
          position: "fixed",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 3001,
          background: "rgba(0,0,0,0.82)",
          color: "#0f0",
          font: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
          lineHeight: 1.4,
          padding: "6px 10px",
          whiteSpace: "pre",
          pointerEvents: "none",
        }}
      >
        {lines.join("\n")}
      </div>
    </>
  );
}
