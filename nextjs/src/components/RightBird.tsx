// components/RightBird.tsx
"use client";

import RightBirdScene from "./RightBirdScene";
import Image from "next/image";

export default function RightBird() {
  return (
    <section className="relative overflow-hidden p-35 w-full pt-0 sm:pb-60 min-h-[100px] z-0">
      {/* Mobile Clouds (< 768px) */}
      <Image
        src="/clouds/cloud4.png"
        alt=""
        width={60}
        height={60}
        priority
        className="absolute left-[10%] top-[25%] opacity-45 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "6px",
          animationDuration: "8.2s",
          animationDelay: "-1.9s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud1.png"
        alt=""
        width={50}
        height={50}
        priority
        className="absolute right-[30%] top-[40%] opacity-50 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "5px",
          animationDuration: "7.6s",
          animationDelay: "-3.4s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={55}
        height={55}
        priority
        className="absolute left-[65%] top-[80%] opacity-40 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "6px",
          animationDuration: "8.8s",
          animationDelay: "-2.3s",
        } as React.CSSProperties}
      />

      {/* Desktop Clouds (≥ 768px) */}
      <Image
        src="/clouds/cloud2.png"
        alt=""
        width={150}
        height={150}
        priority
        className="absolute left-[8%] top-[20%] opacity-60 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "14px",
          animationDuration: "11.3s",
          animationDelay: "-2.8s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={130}
        height={130}
        priority
        className="absolute right-[25%] top-[35%] opacity-65 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "12px",
          animationDuration: "9.8s",
          animationDelay: "-4.5s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud1.png"
        alt=""
        width={120}
        height={120}
        priority
        className="absolute left-[70%] top-[75%] opacity-55 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "10px",
          animationDuration: "10.7s",
          animationDelay: "-1.2s",
        } as React.CSSProperties}
      />

      {/* Branch and Bird - 3D effect */}
      <div className="relative w-full h-[50px] min-h-[10px]">
        {/* Background branch - behind the bird */}
        <img
          src="/right_branch.png"
          alt="Right jungle branch background"
          className="absolute -right-55 sm:-right-45 top-6 sm:top-12 w-[295px] sm:w-[380px] object-contain z-0"
          style={{ height: 'auto', maxWidth: 'none' }}
        />

        {/* Bird Canvas - position so bird sits on branch */}
        <div className="absolute -right-49 sm:-right-[135px] -top-[9px] sm:-top-[10px] z-0">
          <RightBirdScene />
        </div>

        {/* Foreground branch - in front of the bird */}
        <img
          src="/right_branch_front.png"
          alt="Right jungle branch foreground"
          className="absolute -right-55 sm:-right-45 top-6 sm:top-12 w-[295px] sm:w-[380px] object-contain z-20"
          style={{ height: 'auto', maxWidth: 'none' }}
        />
      </div>

      <style jsx>{`
        .cloud {
          animation: cloudFloat var(--float-distance, 10px) var(--duration, 8s) ease-in-out infinite;
        }

        @keyframes cloudFloat {
          0%, 100% { 
            transform: translateY(0px);
          }
          50% { 
            transform: translateY(calc(-1 * var(--float-distance, 10px)));
          }
        }
      `}</style>
    </section>
  );
}
