// src/components/SkillsCarousel.tsx
"use client";

import { useEffect, useRef, useState } from "react";

const icons = [
  { src: "/icons/react.png",    label: "React"    },
  { src: "/icons/python.png",   label: "Python"   },
  { src: "/icons/aws.png",      label: "AWS"      },
  { src: "/icons/docker.png",   label: "Docker"   },
  { src: "/icons/postgres.png", label: "Postgres" },
  { src: "/icons/react.png",    label: "React"    },
  { src: "/icons/python.png",   label: "Python"   },
  { src: "/icons/aws.png",      label: "AWS"      },
  { src: "/icons/docker.png",   label: "Docker"   },
  { src: "/icons/postgres.png", label: "Postgres" },
];

const RADIUS_SCALE = 0.55;

export default function SkillsCarousel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const radiusRef   = useRef(0);
  const [hovered, setHovered] = useState<string | null>(null);

  // calculate radius on mount & resize
  useEffect(() => {
    function setRadius() {
      if (!containerRef.current) return;
      radiusRef.current = containerRef.current.clientWidth * RADIUS_SCALE;
    }
    setRadius();
    window.addEventListener("resize", setRadius);
    return () => window.removeEventListener("resize", setRadius);
  }, []);

  // continuous 3D rotation
  useEffect(() => {
    let frameId: number;
    const speed = 0.005;
    let startTime: number | null = null;

    function animate(time: number) {
      if (startTime === null) startTime = time;
      const rot = ((time - startTime) * speed) % 360;
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
    <section id="skills" className="scroll-mt-22 py-1">
      <div className="max-w-6xl mx-auto px-4">
        <h2
          className="text-3xl font-bold neon-text mb-12 text-center pb-15"
        >
          {hovered ?? "Skills"}
        </h2>

        <div
          ref={containerRef}
          className="relative w-1/2 max-w-4xl h-20 overflow-visible mx-auto"
          style={{
            perspective:    "1000px",
            transformStyle: "preserve-3d",
          }}
        >
          {icons.map(({ src, label }, idx) => (
            <img
              key={idx}
              src={src}
              alt={label}
              onMouseEnter={() => setHovered(label)}
              onMouseLeave={() => setHovered(null)}
              className={`
                absolute top-1/2 left-1/2 w-20 h-20 object-contain
                transition-transform duration-200
                ${hovered === label ? "scale-104 ring-2 ring-accent" : ""}
              `}
              style={{ transformOrigin: "center center", willChange: "transform" }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
