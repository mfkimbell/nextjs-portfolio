// src/components/SkyBackground.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Send,
  Award,
  Folder,
  Briefcase,
  BarChart,
} from "lucide-react";

// utility – random duration + delay string
const randFloat = (min = 4, max = 9) => {
  const dur   = (Math.random() * (max - min) + min).toFixed(2);
  const delay = (Math.random() * 1.5).toFixed(2);
  return `${dur}s ${delay}s`;
};

// foreground clouds (larger, in front)
const fgClouds = [
  { src: "/clouds/cloud4.png", w: 260, h: 260, className: "left-[8%]  top-48" },
  { src: "/clouds/cloud5.png", w: 300, h: 300, className: "left-[72%] top-[65%]" },
  { src: "/clouds/cloud3.png", w: 240, h: 240, className: "left-[50%] top-20" },
  // extra
  { src: "/clouds/cloud2.png", w: 280, h: 280, className: "left-[20%] top-[30%]" },
];

// background clouds (smaller, blurred)
const bgClouds = [
  { src: "/clouds/cloud2.png", w: 140, h: 140, className: "left-[25%] top-10 blur-[1px]" },
  { src: "/clouds/cloud3.png", w: 160, h: 160, className: "left-[60%] top-96 blur-[1px]" },
  { src: "/clouds/cloud4.png", w: 120, h: 120, className: "left-[85%] top-28 blur-[1px]" },
  // extra
  { src: "/clouds/cloud5.png", w: 150, h: 150, className: "left-[10%] top-[50%] blur-[2px]" },
  { src: "/clouds/cloud3.png", w: 130, h: 130, className: "left-[80%] top-[20%] blur-[2px]" },
];

export default function SkyBackground() {
  // one random animation for the Projects cloud
  const [projectAnim, setProjectAnim] = useState<string>("");
  // random animations array for decorative clouds
  const [anims, setAnims] = useState<string[]>([]);

  useEffect(() => {
    setProjectAnim(randFloat());
    const total = fgClouds.length + bgClouds.length;
    setAnims(Array.from({ length: total }, () => randFloat()));
  }, []);

  if (!projectAnim || anims.length === 0) return null;

  return (
    <div className="absolute inset-0 z-0 pointer-events-none select-none">
      {/* —— Invisible header clone for spacing & Projects placeholder —— */}
      <div className="fixed top-4 right-4 w-fit px-3 py-2 rounded-full hidden md:flex items-center space-x-4 pointer-events-none">
        <Send className="invisible w-5 h-5" />
        <Award className="invisible w-5 h-5" />
        {/* Projects icon placeholder with floating cloud */}
        <div className="relative w-5 h-5">
          <Folder className="invisible w-5 h-5" />
          <div className="relative w-350 h- translate-y-65 translate-x-150">
            <Folder className="invisible w-5 h-5" />
            <Image
              src="/clouds/cloud4.png"
              alt="Projects cloud"
              width={520}
              height={520}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
              style={{ animation: `float ease-in-out infinite` }}
            />
          </div>
        </div>
        <Briefcase className="invisible w-5 h-5" />
        <BarChart   className="invisible w-5 h-5" />
      </div>

      {/* —— Decorative floating clouds —— */}
      {fgClouds.map((c, i) => (
        <Image
          key={`fg-${i}`}
          src={c.src}
          alt=""
          width={c.w}
          height={c.h}
          priority
          className={`pointer-events-none absolute ${c.className}`}
          style={{ animation: `${i === 0 ? "floatTiny 12s ease-in-out infinite" : `float ${anims[i]} ease-in-out infinite`}` }}
        />
      ))}

      {bgClouds.map((c, i) => (
        <Image
          key={`bg-${i}`}
          src={c.src}
          alt=""
          width={c.w}
          height={c.h}
          priority
          className={`pointer-events-none absolute ${c.className}`}
          style={{ animation: `floatSlow ${anims[fgClouds.length + i]} linear infinite` }}
        />
      ))}

      <style jsx>{`
        @keyframes float {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
        @keyframes floatSlow {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes floatTiny {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
