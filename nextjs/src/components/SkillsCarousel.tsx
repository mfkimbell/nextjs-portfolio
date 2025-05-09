// src/components/SkillsCarousel.tsx
"use client";

import { useEffect, useRef } from "react";

const icons = [
  "/icons/react.png",
  "/icons/python.png",
  "/icons/aws.png",
  "/icons/docker.png",
  "/icons/postgres.png",
  "/icons/react.png",
  "/icons/python.png",
  "/icons/aws.png",
  "/icons/docker.png",
  "/icons/postgres.png",
];

/** Fraction of the container’s width to use as radius */
const RADIUS_SCALE = 0.55;
/** Icon square size in px (w‑20/h‑20 = 80px) */
const ICON_SIZE = 80;

export default function SkillsCarousel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const radiusRef    = useRef(0);

  // compute only the radius; container height is fixed via CSS
  useEffect(() => {
    function setRadius() {
      if (!containerRef.current) return;
      radiusRef.current = containerRef.current.clientWidth * RADIUS_SCALE;
    }
    setRadius();
    window.addEventListener("resize", setRadius);
    return () => window.removeEventListener("resize", setRadius);
  }, []);

  // 3D rotation loop
  useEffect(() => {
    let frameId: number;
    const speed = 0.005;
    let start: number | null = null;

    function animate(time: number) {
      if (start === null) start = time;
      const rot = ((time - start) * speed) % 360;
      const r   = radiusRef.current;
      const items = Array.from(containerRef.current?.children ?? []) as HTMLElement[];
      const n = items.length;

      items.forEach((item, i) => {
        const angle = ((360 / n) * i + rot) * (Math.PI / 180);
        const x     = Math.sin(angle) * r;
        const z     = Math.cos(angle) * r;
        const scale = 0.8 + ((z + r) / (2 * r)) * 0.4;

        item.style.transform = `
          translate(-50%, -50%)
          translateX(${x}px)
          translateZ(${z}px)
          scale(${scale})
        `;
      });

      frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <section id="skills" className="py-14 flex justify-center">
      <div
        ref={containerRef}
        className="relative w-1/2 max-w-4xl h-20 overflow-visible"
        style={{
          perspective:    "1000px",
          transformStyle: "preserve-3d",
        }}
      >
        {icons.map((src, idx) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={idx}
            src={src}
            alt=""
            className="absolute top-1/2 left-1/2 w-20 h-20 object-contain"
            style={{ transformOrigin: "center center", willChange: "transform" }}
          />
        ))}
      </div>
    </section>
  );
}
