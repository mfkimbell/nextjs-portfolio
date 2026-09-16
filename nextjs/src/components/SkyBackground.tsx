// src/components/SkyBackground.tsx
"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { Send, Award, Folder, Briefcase, BarChart } from "lucide-react";
import { CLOUD_MOTION_CONFIG } from "@/config/cloudMotion";

type CloudStyle = CSSProperties & { "--float-distance"?: string };
type CloudDriftStyle = CSSProperties & {
  "--cloud-drift-start"?: string;
  "--cloud-drift-end"?: string;
};

type CloudSpriteProps = {
  id: number;
  src: string;
  width: number;
  height?: number;
  className: string;
  imageClassName?: string;
  style: CloudStyle;
  alt?: string;
  priority?: boolean;
};

function CloudSprite({
  id,
  src,
  width,
  height = width,
  className,
  imageClassName = "",
  style,
  alt = "",
  priority = false,
}: CloudSpriteProps) {
  // Full-screen left-to-right drift. Smaller/farther clouds use the slower
  // duration; bigger/front clouds blend toward the faster duration.
  const driftConfig = CLOUD_MOTION_CONFIG.horizontalDrift;
  const sizeMix = Math.min(
    1,
    Math.max(
      0,
      (width - driftConfig.smallCloudWidthPx) /
        Math.max(1, driftConfig.bigCloudWidthPx - driftConfig.smallCloudWidthPx)
    )
  );
  const driftDurationSec = Math.round(
    driftConfig.smallCloudDurationSec -
      (driftConfig.smallCloudDurationSec - driftConfig.bigCloudDurationSec) * sizeMix
  );
  const driftPadPx = width + driftConfig.offscreenPaddingPx;
  const driftDelaySec = -((id * driftConfig.delaySeedSec) % driftDurationSec);
  const driftStyle: CloudDriftStyle = {
    "--cloud-drift-start": `calc(-100vw - ${driftPadPx}px)`,
    "--cloud-drift-end": `calc(100vw + ${driftPadPx}px)`,
    animationDuration: `${driftDurationSec}s`,
    animationDelay: `${driftDelaySec}s`,
  };

  return (
    <div className={className} style={{ width }}>
      <div className="cloud-drift" style={driftStyle}>
        <div className="cloud-float relative" style={style}>
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            priority={priority}
            sizes={`${width}px`}
            className={`h-auto w-full object-contain ${imageClassName}`}
          />
          <span className="cloud-number" aria-hidden="true">
            {id}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SkyBackground() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden max-w-screen overflow-x-hidden">
      {/* ————— Invisible header clone (md+) ————— */}
      <div className="fixed top-4 right-4 w-fit px-3 py-2 rounded-full hidden md:flex items-center space-x-4 pointer-events-none">
        <Send className="invisible w-5 h-5" />
        <Award className="invisible w-5 h-5" />
        <div className="relative w-5 h-5">
          <Folder className="invisible w-5 h-5" />
          <div className="relative w-[300px] h-[300px] translate-x-[140px] translate-y-[60px]">
            <Folder className="invisible w-5 h-5" />
          </div>
        </div>
        <Briefcase className="invisible w-5 h-5" />
        <BarChart className="invisible w-5 h-5" />
      </div>


      {/* ===================================================== */}
      {/* SMALL-SCREEN CLOUDS (<768 px)                         */}
      {/* ===================================================== */}

      {/* large-ish mobile puffs */}
      <CloudSprite
        id={2}
        src="/clouds/cloud4.png"
        width={140}
        height={180}
        priority
        className="absolute left-[6%] top-[53%] md:hidden"
        style={{
          "--float-distance": "20px",
          animationDuration: "7s",
          animationDelay: "-0.5s",
        }}
      />
      <CloudSprite
        id={3}
        src="/clouds/cloud3.png"
        width={120}
        height={160}
        priority
        className="absolute left-[55%] top-[68%] md:hidden"
        style={{
          "--float-distance": "18px",
          animationDuration: "6.5s",
          animationDelay: "-2s",
        }}
      />

      {/* medium mobile puffs */}
      <CloudSprite
        id={4}
        src="/clouds/cloud5.png"
        width={110}
        height={140}
        priority
        className="absolute left-[10%] top-[20%] md:hidden"
        style={{
          "--float-distance": "14px",
          animationDuration: "8s",
          animationDelay: "-1s",
        }}
      />
      <CloudSprite
        id={5}
        src="/clouds/cloud2.png"
        width={90}
        height={120}
        priority
        className="absolute left-[70%] top-[38%] md:hidden"
        style={{
          "--float-distance": "14px",
          animationDuration: "8.6s",
          animationDelay: "-2.5s",
        }}
      />

      {/* tiny mobile wisps */}
      <CloudSprite
        id={6}
        src="/clouds/cloud2.png"
        width={54}
        height={72}
        priority
        className="absolute left-[60%] top-[10%] md:hidden"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "5px",
          animationDuration: "5.5s",
          animationDelay: "-1.8s",
        }}
      />
      <CloudSprite
        id={7}
        src="/clouds/cloud3.png"
        width={54}
        height={72}
        priority
        className="absolute left-[15%] top-[78%] md:hidden"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "5px",
          animationDuration: "6.2s",
          animationDelay: "-0.7s",
        }}
      />

      {/* Mostly smaller mobile clouds around Contact Me */}
      <CloudSprite
        id={8}
        src="/clouds/cloud5.png"
        width={62}
        className="absolute left-[3%] top-[85%] md:hidden"
        imageClassName="blur-[0.5px] opacity-95"
        style={{
          "--float-distance": "6px",
          animationDuration: "7.4s",
          animationDelay: "-1.3s",
        }}
      />
      <CloudSprite
        id={9}
        src="/clouds/cloud1.png"
        width={50}
        className="absolute left-[39%] top-[83%] md:hidden"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "5px",
          animationDuration: "6.8s",
          animationDelay: "-3.1s",
        }}
      />
      <CloudSprite
        id={10}
        src="/clouds/cloud2.png"
        width={74}
        className="absolute left-[72%] top-[88%] md:hidden"
        style={{
          "--float-distance": "10px",
          animationDuration: "8.2s",
          animationDelay: "-2.2s",
        }}
      />
      <CloudSprite
        id={11}
        src="/clouds/cloud4.png"
        width={54}
        className="absolute left-[12%] top-[95%] md:hidden"
        imageClassName="blur-[0.5px] opacity-95"
        style={{
          "--float-distance": "5px",
          animationDuration: "7.8s",
          animationDelay: "-4.2s",
        }}
      />
      <CloudSprite
        id={12}
        src="/clouds/cloud3.png"
        width={60}
        className="absolute left-[57%] top-[96%] md:hidden"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "5px",
          animationDuration: "6.9s",
          animationDelay: "-0.9s",
        }}
      />

      {/* ===================================================== */}
      {/* LARGE-SCREEN CLOUDS (≥768 px)                         */}
      {/* ===================================================== */}

      {/* Foreground – downsized "giants". No opacity override: these render at 100%. */}
      <CloudSprite
        id={13}
        src="/clouds/cloud5.png"
        width={240}
        priority
        className="hidden md:block absolute left-[14%] top-[26%]"
        style={{
          "--float-distance": "28px",
          animationDuration: "12s",
          animationDelay: "-1.1s",
        }}
      />
      <CloudSprite
        id={14}
        src="/clouds/cloud4.png"
        width={220}
        priority
        className="hidden md:block absolute left-[45%] top-[8%]"
        style={{
          "--float-distance": "26px",
          animationDuration: "10.5s",
          animationDelay: "-3.3s",
        }}
      />
      <CloudSprite
        id={15}
        src="/clouds/cloud3.png"
        width={200}
        priority
        className="hidden md:block absolute left-[80%] top-[72%]"
        style={{
          "--float-distance": "24px",
          animationDuration: "11.2s",
          animationDelay: "-2.4s",
        }}
      />

      {/* Mid-ground */}
      <CloudSprite
        id={16}
        src="/clouds/cloud2.png"
        width={145}
        priority
        className="hidden md:block absolute left-[30%] top-[60%]"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "12px",
          animationDuration: "9s",
          animationDelay: "-0.7s",
        }}
      />
      <CloudSprite
        id={17}
        src="/clouds/cloud1.png"
        width={260}
        priority
        className="hidden md:block absolute left-[55%] top-[55%]"
        style={{
          "--float-distance": "18px",
          animationDuration: "9s",
          animationDelay: "-0.7s",
        }}
      />
      <CloudSprite
        id={18}
        src="/clouds/cloud5.png"
        width={138}
        priority
        className="hidden md:block absolute left-[88%] top-[18%]"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "12px",
          animationDuration: "8.6s",
          animationDelay: "-2s",
        }}
      />
      <CloudSprite
        id={19}
        src="/clouds/cloud4.png"
        width={138}
        priority
        className="hidden md:block absolute left-[8%] top-[80%]"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "12px",
          animationDuration: "9.5s",
          animationDelay: "-3.5s",
        }}
      />

      {/* Mostly smaller desktop clouds around Contact Me */}
      <CloudSprite
        id={20}
        src="/clouds/cloud2.png"
        width={96}
        className="hidden md:block absolute left-[2%] top-[86%]"
        imageClassName="blur-[0.5px] opacity-95"
        style={{
          "--float-distance": "8px",
          animationDuration: "8.4s",
          animationDelay: "-1.4s",
        }}
      />
      <CloudSprite
        id={21}
        src="/clouds/cloud5.png"
        width={66}
        className="hidden md:block absolute left-[23%] top-[89%]"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "6px",
          animationDuration: "7.2s",
          animationDelay: "-3.2s",
        }}
      />
      <CloudSprite
        id={22}
        src="/clouds/cloud3.png"
        width={92}
        className="hidden md:block absolute left-[39%] top-[84%]"
        style={{
          "--float-distance": "11px",
          animationDuration: "8.9s",
          animationDelay: "-0.5s",
        }}
      />
      <CloudSprite
        id={23}
        src="/clouds/cloud4.png"
        width={70}
        className="hidden md:block absolute left-[53%] top-[92%]"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "6px",
          animationDuration: "7.8s",
          animationDelay: "-4.1s",
        }}
      />
      <CloudSprite
        id={24}
        src="/clouds/cloud2.png"
        width={108}
        className="hidden md:block absolute left-[73%] top-[86%]"
        style={{
          "--float-distance": "13px",
          animationDuration: "9.1s",
          animationDelay: "-2.6s",
        }}
      />
      <CloudSprite
        id={25}
        src="/clouds/cloud1.png"
        width={64}
        className="hidden md:block absolute left-[88%] top-[91%]"
        imageClassName="blur-[0.75px] opacity-95"
        style={{
          "--float-distance": "5px",
          animationDuration: "7.1s",
          animationDelay: "-1.8s",
        }}
      />
      <CloudSprite
        id={26}
        src="/clouds/cloud3.png"
        width={76}
        className="hidden md:block absolute left-[16%] top-[96%]"
        imageClassName="blur-[0.5px] opacity-95"
        style={{
          "--float-distance": "7px",
          animationDuration: "8.2s",
          animationDelay: "-5.0s",
        }}
      />
      <CloudSprite
        id={27}
        src="/clouds/cloud5.png"
        width={86}
        className="hidden md:block absolute left-[63%] top-[98%]"
        imageClassName="blur-[0.5px] opacity-95"
        style={{
          "--float-distance": "7px",
          animationDuration: "8.6s",
          animationDelay: "-0.9s",
        }}
      />

      {/* ========== CLOUD ANIMATION ========== */}
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
        @keyframes driftRight {
          0% {
            transform: translateX(var(--cloud-drift-start));
          }
          100% {
            transform: translateX(var(--cloud-drift-end));
          }
        }
        .cloud-drift {
          animation-name: driftRight;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .cloud-float {
          animation-name: float;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        .cloud-number {
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 1;
          transform: translate(-50%, -50%);
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.72);
          color: rgba(15, 23, 42, 0.92);
          font-size: 0.78rem;
          font-weight: 900;
          line-height: 1;
          min-width: 1.35rem;
          padding: 0.18rem 0.32rem;
          text-align: center;
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.55);
          box-shadow: 0 2px 7px rgba(15, 23, 42, 0.16);
        }
      `}</style>
    </div>
  );
}
