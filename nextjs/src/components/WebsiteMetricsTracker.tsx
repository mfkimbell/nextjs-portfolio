"use client";

import { useEffect, useRef } from "react";
import { mutate } from "swr";
import { useAppDispatch } from "@/lib/hooks";
import { addClicks, addMiles, resetSession } from "@/lib/store";

export default function WebsiteMetricsTracker() {
  const dispatch  = useAppDispatch();
  const clicksRef = useRef(0);
  const distPxRef = useRef(0);
  const lastPos   = useRef<{ x: number; y: number } | null>(null);
  const pxToMiles = (px: number) => px / (96 * 12 * 5280);

  /* record visit once */
  useEffect(() => {
    fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      keepalive: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const onClick = () => {
      clicksRef.current += 1;
      dispatch(addClicks(1));
    };

    const onMove = (e: PointerEvent) => {
      if (lastPos.current) {
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        distPxRef.current += Math.hypot(dx, dy);
        dispatch(addMiles(pxToMiles(Math.hypot(dx, dy))));
      }
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener("pointerdown", onClick);
    window.addEventListener("pointermove", onMove);

    const flush = () => {
      const clicks = clicksRef.current;
      const miles  = pxToMiles(distPxRef.current);
      if (!clicks && !miles) return;

      /* optimistic UI update */
      mutate("/api/metrics", (prev: any) =>
        prev
          ? { ...prev, totalClicks: prev.totalClicks + clicks,
                     totalMouseMiles: prev.totalMouseMiles + miles }
          : prev,
        false
      );

      /* send to DB */
      fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clicks, mouseMiles: miles }),
        keepalive: true,
      }).catch(() => {});

      /* reset session counts for next batch */
      clicksRef.current = 0;
      distPxRef.current = 0;
      dispatch(resetSession());
    };

    const id = setInterval(flush, 10_000);        // ⬅ every 10 s
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });

    return () => {
      window.removeEventListener("pointerdown", onClick);
      window.removeEventListener("pointermove", onMove);
      clearInterval(id);
    };
  }, [dispatch]);

  return null;
}
