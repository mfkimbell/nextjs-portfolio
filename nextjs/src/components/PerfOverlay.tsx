"use client";

import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { perfStats } from "@/lib/perfStats";

/**
 * TEMPORARY performance readout for measuring phones. Sits above everything
 * (title screen included) and measures the page itself with its own frame
 * counter, so the start-up stalls show up even while the 3D scene is still
 * loading. ?noperf hides it.
 */
const T0 = typeof performance !== "undefined" ? performance.now() : 0;

export default function PerfOverlay() {
  const [show, setShow] = useState(false);
  const [, force] = useState(0);
  const frames = useRef({ n: 0, since: 0, worst: 0, fps: 0, avg: 0, worstShown: 0, long: 0, firstFrameAt: 0 });
  const { progress, loaded, total } = useProgress();

  useEffect(() => {
    setShow(!new URLSearchParams(window.location.search).has("noperf"));
  }, []);

  useEffect(() => {
    if (!show) return;
    let raf = 0;
    let last = performance.now();
    const f = frames.current;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      f.n += 1;
      f.worst = Math.max(f.worst, dt);
      if (dt > 100) f.long += 1;
      if (!f.since) f.since = now;
      if (now - f.since >= 1000) {
        f.fps = (f.n * 1000) / (now - f.since);
        f.avg = (now - f.since) / f.n;
        f.worstShown = f.worst;
        f.n = 0; f.worst = 0; f.since = now;
        force((x) => x + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show]);

  if (!show) return null;
  const f = frames.current;
  const p = perfStats;
  const fresh = performance.now() - p.updatedAt < 3000;
  const up = (performance.now() - T0) / 1000;
  return (
    <div className="pointer-events-none fixed left-2 top-12 z-[9999] max-w-[62vw] rounded bg-black/80 px-2 py-1 font-mono text-[10px] leading-tight text-lime-300">
      <div className="text-white">{p.scene || "starting"} &middot; {p.gfx || "?"} &middot; up {up.toFixed(0)}s</div>
      <div>{f.fps.toFixed(0)} fps &middot; avg {f.avg.toFixed(1)}ms &middot; worst {f.worstShown.toFixed(0)}ms</div>
      <div>{f.long} freezes over 100ms</div>
      <div>loading {Math.round(progress)}% ({loaded}/{total}) &middot; {p.prewarmedAt ? `ready at ${((p.prewarmedAt - T0) / 1000).toFixed(1)}s` : "not ready yet"}</div>
      {fresh ? (
        <>
          <div>{p.calls} calls &middot; {(p.tris / 1000).toFixed(0)}k tris &middot; {p.progs} shaders</div>
          <div>{p.lights} lights &middot; {p.shadowMaps} shadow passes{p.shadowsThrottled ? " (halved)" : ""}</div>
          <div>{p.w}x{p.h} @{p.dpr.toFixed(2)}x &middot; {p.geoms} geom &middot; {p.textures} tex</div>
          <div className="text-white/70">{p.gpu.slice(0, 38)} &middot; {navigator.hardwareConcurrency ?? "?"} cores</div>
        </>
      ) : <div className="text-white/60">(3D numbers appear once the scene runs)</div>}
    </div>
  );
}
