// src/components/SkyBackground.tsx
"use client";

import Image from "next/image";
import { Send, Award, Folder, Briefcase, BarChart } from "lucide-react";

export default function SkyBackground() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden">
      {/* ————— Invisible header clone (md+) ————— */}
      <div className="fixed top-4 right-4 w-fit px-3 py-2 rounded-full hidden md:flex items-center space-x-4 pointer-events-none">
        <Send className="invisible w-5 h-5" />
        <Award className="invisible w-5 h-5" />
        <div className="relative w-5 h-5">
          <Folder className="invisible w-5 h-5" />
          <div className="relative w-[300px] h-[300px] translate-x-[140px] translate-y-[60px]">
            <Folder className="invisible w-5 h-5" />
            {/* decorative cloud for the header */}
            <Image
              src="/clouds/cloud4.png"
              alt="Projects cloud"
              width={460}
              height={460}
              priority
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain hidden md:block cloud"
              style={
                {
                  "--float-distance": "30px",
                  animationDuration: "11s",
                  animationDelay: "-2s",
                } as React.CSSProperties
              }
            />
          </div>
        </div>
        <Briefcase className="invisible w-5 h-5" />
        <BarChart className="invisible w-5 h-5" />
      </div>

      
      {/* ===================================================== */}
      {/* SMALL-SCREEN CLOUDS (<768 px)                         */}
      {/* ===================================================== */}

      {/* large-ish mobile puffs */}
      <Image
        src="/clouds/cloud4.png"
        alt=""
        width={140}
        height={180}
        priority
        className="absolute left-[6%] top-[46%] md:hidden object-contain cloud"
        style={{
          "--float-distance": "20px",
          animationDuration: "7s",
          animationDelay: "-0.5s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={120}
        height={160}
        priority
        className="absolute left-[55%] top-[68%] md:hidden object-contain cloud"
        style={{
          "--float-distance": "18px",
          animationDuration: "6.5s",
          animationDelay: "-2s",
        } as React.CSSProperties}
      />

      {/* medium mobile puffs */}
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={110}
        height={140}
        priority
        className="absolute left-[30%] top-[20%] md:hidden object-contain cloud"
        style={{
          "--float-distance": "14px",
          animationDuration: "8s",
          animationDelay: "-1s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud2.png"
        alt=""
        width={90}
        height={120}
        priority
        className="absolute left-[70%] top-[38%]  md:hidden object-contain cloud"
        style={{
          "--float-distance": "14px",
          animationDuration: "8.6s",
          animationDelay: "-2.5s",
        } as React.CSSProperties}
      />

      {/* tiny mobile wisps */}
      <Image
        src="/clouds/cloud2.png"
        alt=""
        width={60}
        height={80}
        priority
        className="absolute left-[60%] top-[10%] blur-[1px] md:hidden object-contain cloud"
        style={{
          "--float-distance": "8px",
          animationDuration: "5.5s",
          animationDelay: "-1.8s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={60}
        height={80}
        priority
        className="absolute left-[15%] top-[78%] blur-[1px] md:hidden object-contain cloud"
        style={{
          "--float-distance": "8px",
          animationDuration: "6.2s",
          animationDelay: "-0.7s",
        } as React.CSSProperties}
      />
      {/* ===================================================== */}
      {/* LARGE-SCREEN CLOUDS (≥768 px)                         */}
      {/* ===================================================== */}

      {/* Foreground – downsized “giants” */}
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={240}
        height={240}
        priority
        className="hidden md:block absolute left-[14%] top-[26%] object-contain cloud"
        style={
          {
            "--float-distance": "28px",
            animationDuration: "12s",
            animationDelay: "-1.1s",
          } as React.CSSProperties
        }
      />
      <Image
        src="/clouds/cloud4.png"
        alt=""
        width={220}
        height={220}
        priority
        className="hidden md:block absolute left-[45%] top-[8%] object-contain cloud"
        style={
          {
            "--float-distance": "26px",
            animationDuration: "10.5s",
            animationDelay: "-3.3s",
          } as React.CSSProperties
        }
      />
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={200}
        height={200}
        priority
        className="hidden md:block absolute left-[80%] top-[72%] object-contain cloud"
        style={
          {
            "--float-distance": "24px",
            animationDuration: "11.2s",
            animationDelay: "-2.4s",
          } as React.CSSProperties
        }
      />

      {/* Mid-ground */}
      <Image
        src="/clouds/cloud2.png"
        alt=""
        width={160}
        height={160}
        priority
        className="hidden blur-[1px] md:block absolute left-[30%] top-[60%] object-contain cloud"
        style={
          {
            "--float-distance": "18px",
            animationDuration: "9s",
            animationDelay: "-0.7s",
          } as React.CSSProperties
        }
      />
        <Image
        src="/clouds/cloud1.png"
        alt=""
        width={260}
        height={260}
        priority
        className="hidden  md:block absolute left-[55%] top-[45%] object-contain cloud"
        style={
          {
            "--float-distance": "18px",
            animationDuration: "9s",
            animationDelay: "-0.7s",
          } as React.CSSProperties
        }
      />
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={150}
        height={150}
        priority
        className="hidden blur-[1px] md:block absolute left-[88%] top-[18%] object-contain cloud"
        style={
          {
            "--float-distance": "18px",
            animationDuration: "8.6s",
            animationDelay: "-2s",
          } as React.CSSProperties
        }
      />
      <Image
        src="/clouds/cloud4.png"
        alt=""
        width={150}
        height={150}
        priority
        className="hidden blur-[1px] md:block absolute left-[8%] top-[80%] object-contain cloud"
        style={
          {
            "--float-distance": "18px",
            animationDuration: "9.5s",
            animationDelay: "-3.5s",
          } as React.CSSProperties
        }
      />

      {/* ========== FLOATING ANIMATION ========== */}
      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(calc(-1 * var(--float-distance)));
          }
        }
        .cloud {
          animation-name: float;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
      `}</style>
    </div>
  );
}
