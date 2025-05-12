"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Award,
  Briefcase,
  BarChart,
  Github,
  Download,
  Mail,
  Linkedin,
} from "lucide-react";

// utility – random duration + delay string
const randFloat = (min = 4, max = 9) => {
  const dur = (Math.random() * (max - min) + min).toFixed(2);
  const delay = (Math.random() * 1.5).toFixed(2);
  return `${dur}s ${delay}s`;
};

export default function SkyBackground() {
  /* Foreground and background cloud configs */
  const fgClouds = [
    { src: "/clouds/cloud4.png", w: 260, h: 260, class: "left-[8%] top-48" },
    { src: "/clouds/cloud5.png", w: 300, h: 300, class: "left-[72%] top-[65%]" },
    { src: "/clouds/cloud3.png", w: 240, h: 240, class: "left-[50%] top-20" },
  ];
  const bgClouds = [
    { src: "/clouds/cloud2.png", w: 140, h: 140, class: "left-[25%] top-10 blur-[1px]" },
    { src: "/clouds/cloud3.png", w: 160, h: 160, class: "left-[60%] top-96 blur-[1px]" },
    { src: "/clouds/cloud4.png", w: 120, h: 120, class: "left-[85%] top-28 blur-[1px]" },
  ];

  // Hold random animation strings client‑side to avoid hydration mismatch
  const [anims, setAnims] = useState<string[]>([]);
  useEffect(() => {
    const total = fgClouds.length + bgClouds.length + 1; // +1 for rat
    setAnims(Array.from({ length: total }, () => randFloat()));
  }, []);

  if (anims.length === 0) return null; // wait until client-side to render

  return (
<header className="absolute inset-x-0 top-0 z-3 select-none">
{/* Invisible header replica for spacing */}
      <div className="pointer-events-none mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="invisible text-lg font-semibold">Mitchell&nbsp;Kimbell</Link>
        <div className="hidden md:flex items-center">
          <div className="flex items-center space-x-4 pointer-events-none">
            <Link href="#skills" className="invisible" aria-label="Skills"><Award className="w-5 h-5"/></Link>
            {/* Projects cloud */}
            <div className="relative w-5 h-5 pointer-events-none">
              <Image src="/clouds/cloud3.png" alt="Projects Cloud" fill priority style={{ animation: `float ${anims[0]} ease-in-out infinite` }} />
            </div>
            <Link href="#experience" className="invisible" aria-label="Experience"><Briefcase className="w-5 h-5"/></Link>
            <Link href="#metrics" className="invisible" aria-label="Metrics"><BarChart className="w-5 h-5"/></Link>
          </div>
        </div>
      </div>

      {/* decorative clouds & rat */}
      <div className="absolute top-0 left-0 w-full h-screen z-0 pointer-events-none">
        {fgClouds.map((c, i) => (
          <Image key={`fg-${i}`} src={c.src} alt="Cloud" width={c.w} height={c.h} priority className={`pointer-events-none absolute ${c.class}`} style={{ animation: `float ${anims[i+1]} ease-in-out infinite` }} />
        ))}
        {bgClouds.map((c, i) => (
          <Image key={`bg-${i}`} src={c.src} alt="Cloud" width={c.w} height={c.h} priority className={`pointer-events-none absolute ${c.class}`} style={{ animation: `floatSlow ${anims[i+1+fgClouds.length]} linear infinite` }} />
        ))}

        {/* Rat – clickable */}
       
      </div>

      <style jsx>{`
        @keyframes float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-10px); }
        }
        @keyframes floatSlow {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-6px); }
        }
      `}</style>
    </header>
  );
}
