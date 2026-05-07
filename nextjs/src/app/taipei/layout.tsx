"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { ModeProvider, useMode } from "./ModeContext";

const ALL_PICS = [
  "DSC00948.JPG","DSC01768.JPG","film-14.jpeg","fourthofjuly-5.jpeg",
  "IMG_0025.PNG","IMG_0633.jpeg","IMG_0967.JPG","IMG_0972.JPG",
  "IMG_1259.jpeg","IMG_1273.jpeg","IMG_1344.jpeg","IMG_1424.jpeg",
  "IMG_1456.jpeg","IMG_1473.jpeg","IMG_1654.jpeg","IMG_1789.JPG",
  "IMG_2244.jpeg","IMG_2592.jpeg","IMG_2628.jpeg","IMG_2676.jpeg",
  "IMG_2719.jpeg","IMG_2741.jpeg","IMG_2749.jpeg","IMG_2819.jpeg",
  "IMG_2833.jpeg","IMG_2919.jpeg","IMG_3055.jpeg","IMG_3263.jpeg",
  "IMG_3270.jpeg","IMG_3284.jpeg","IMG_3522.jpeg","IMG_3872.JPG",
  "IMG_3971.jpeg","IMG_4107.jpeg","IMG_4324.jpeg","IMG_8237.jpeg",
  "portra-5.JPG",
];

function seededShuffle(arr: string[], seed: number) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ROTATIONS = [-7, -5, -3, -2, 2, 3, 5, 7, -4, 4, -6, 6];

function Polaroid({ src, rotate }: { src: string; rotate: number }) {
  return (
    <div
      className="bg-white shadow-xl shadow-black/50 opacity-70 hover:opacity-95 hover:scale-105 transition-all duration-300 cursor-default flex-shrink-0"
      style={{ transform: `rotate(${rotate}deg)`, padding: "7px 7px 26px 7px", width: "100px" }}
    >
      <div className="relative overflow-hidden" style={{ width: "86px", height: "86px" }}>
        <Image src={`/couple_pics/${src}`} alt="" fill className="object-cover" sizes="86px" />
      </div>
    </div>
  );
}

function PhotoColumn({ photos, topPad, side, className }: { photos: string[]; topPad: number; side: "left" | "right"; className: string }) {
  return (
    <div
      className={`${className} absolute top-0 ${side}-0 flex-col items-center gap-6 overflow-hidden pointer-events-none`}
      style={{ width: "116px", paddingTop: `${topPad}px` }}
    >
      {photos.map((src, i) => (
        <Polaroid key={src} src={src} rotate={ROTATIONS[(i + topPad) % ROTATIONS.length]} />
      ))}
    </div>
  );
}

function PolaroidWall({ children }: { children: React.ReactNode }) {
  const { left, right } = useMemo(() => {
    const shuffled = seededShuffle(ALL_PICS, 42);
    const mid = Math.ceil(shuffled.length / 2);
    return { left: shuffled.slice(0, mid), right: shuffled.slice(mid) };
  }, []);

  return (
    <div className="relative min-h-screen">
      <PhotoColumn photos={left} topPad={280} side="left" className="hidden xl:flex" />
      <PhotoColumn photos={[...left, ...right]} topPad={280} side="right" className="flex xl:hidden" />
      <PhotoColumn photos={right} topPad={280} side="right" className="hidden xl:flex" />
      {children}
    </div>
  );
}

const NAV = [
  { href: "/taipei", label: "🗓️ Schedule" },
  { href: "/taipei/raohe", label: "🏮 Raohe" },
  { href: "/taipei/transit", label: "🚆 Transit Guide" },
  { href: "/taipei/map", label: "🗺️ Map" },
];

function TaipeiNav() {
  const pathname = usePathname();
  const { mode } = useMode();

  return (
    <div className="border-b border-white/10 bg-black/30 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between py-3">
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">
              🇹🇼 Mitch & Anna — Taiwan 2026
            </h1>
            <p className="text-white/50 text-xs">May 13 – 22 · amba Taipei Songshan</p>
          </div>
        </div>
        <nav className="flex gap-1 pb-2 flex-wrap">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  active
                    ? "bg-sky-500 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {label}
              </Link>
            );
          })}
          {mode === "real" && (
            <Link
              href="/taipei/ring"
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                pathname === "/taipei/ring"
                  ? "bg-pink-500 text-white"
                  : "text-pink-300/70 hover:text-pink-200 hover:bg-pink-500/20"
              }`}
            >
              💍 Anna&apos;s Ring
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}

export default function TaipeiLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModeProvider>
      {/* Fixed background — always covers viewport no matter how tall the page gets */}
      <div className="fixed inset-0 -z-10" style={{ background: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" }} />

      <TaipeiNav />
      <PolaroidWall>
        <div className="max-w-5xl mx-auto px-4 py-8">{children}</div>
      </PolaroidWall>
    </ModeProvider>
  );
}
