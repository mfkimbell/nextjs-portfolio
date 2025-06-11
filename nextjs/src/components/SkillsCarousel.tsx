// src/components/SkillsCarousel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const icons = [
  { src: "/icons/react.png", label: "React" },
  { src: "/icons/nextjs.png", label: "NextJS" },
  { src: "/icons/typescript.png", label: "Typescript" },
  { src: "/icons/python.png", label: "Python" },
  { src: "/icons/csharp.png", label: "C#" },
  { src: "/icons/dotnet.png", label: ".NET8" },
  { src: "/icons/aws.png", label: "AWS" },
  { src: "/icons/bedrock.png", label: "Bedrock" },
  { src: "/icons/tensorflow.png", label: "Bedrock" },
  { src: "/icons/pytorch.png", label: "PyTorch" },
  { src: "/icons/googlecloud.png", label: "Google Cloud" },
  { src: "/icons/kubernetes.png", label: "Kubernetes" },
  { src: "/icons/kafka.png", label: "Kafka" },
  { src: "/icons/harness.png", label: "Harness" },
  { src: "/icons/githubactions.png", label: "Github Actions" },
  { src: "/icons/ansible.png", label: "Ansible" },
  { src: "/icons/docker.png", label: "Docker" },
  { src: "/icons/postgres.png", label: "Postgres" },
  { src: "/icons/terraform.png", label: "Terraform" },

];

const RADIUS_SCALE = 0.75;

export default function SkillsCarousel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const radiusRef = useRef(0);
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
      const r = radiusRef.current;
      const items = Array.from(containerRef.current?.children ?? []) as HTMLElement[];
      const n = items.length;

      items.forEach((item, i) => {
        const angle = ((360 / n) * i + rot) * (Math.PI / 180);
        const x = Math.sin(angle) * r;
        const z = Math.cos(angle) * r;
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
    <section id="skills" className="relative py-16 z-10 overflow-visible">
      {/* Mobile Clouds (< 768px) */}
      <Image
        src="/clouds/cloud1.png"
        alt=""
        width={80}
        height={80}
        priority
        className="absolute left-[10%] top-[15%] opacity-50 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "8px",
          animationDuration: "8.5s",
          animationDelay: "-1.2s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={60}
        height={60}
        priority
        className="absolute right-[15%] top-[25%] opacity-45 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "6px",
          animationDuration: "7.8s",
          animationDelay: "-3.5s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={70}
        height={70}
        priority
        className="absolute left-[75%] top-[70%] opacity-40 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "7px",
          animationDuration: "9.2s",
          animationDelay: "-2.8s",
        } as React.CSSProperties}
      />

      {/* Desktop Clouds (≥ 768px) */}
      <Image
        src="/clouds/cloud2.png"
        alt=""
        width={160}
        height={160}
        priority
        className="absolute left-[8%] top-[20%] opacity-60 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "15px",
          animationDuration: "11.2s",
          animationDelay: "-1.5s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={140}
        height={140}
        priority
        className="absolute right-[12%] top-[35%] opacity-65 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "12px",
          animationDuration: "9.8s",
          animationDelay: "-4.2s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={120}
        height={120}
        priority
        className="absolute left-[85%] top-[75%] opacity-55 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "10px",
          animationDuration: "10.5s",
          animationDelay: "-2.8s",
        } as React.CSSProperties}
      />

      <div className="max-w-6xl mx-auto px-4 relative z-20">
        <h2
          className="text-3xl font-bold neon-text mb-12 text-center pb-15"
        >
          {hovered ?? "Skills"}
        </h2>

        <div
          ref={containerRef}
          className="relative w-1/2 max-w-4xl h-20 overflow-visible mx-auto z-20"
          style={{
            perspective: "1000px",
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
                absolute top-1/2 left-1/2
                w-10 h-10 md:w-20 md:h-20 lg:w-24 lg:h-24
                object-contain transition-transform duration-200
                ${hovered === label ? "scale-102" : ""}
              `}

              style={{ transformOrigin: "center center", willChange: "transform" }}
            />
          ))}
        </div>
      </div>

      {/* Cloud Animation Styles */}
      <style jsx global>{`
        .cloud {
          animation-name: float;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
      `}</style>
    </section>
  );
}
