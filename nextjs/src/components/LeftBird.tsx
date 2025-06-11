"use client";

import BirdScene from "./BirdScene";
import Image from "next/image";

export default function LeftBird() {
  return (
    <section className="relative overflow-visible pt-10">
      {/* Mobile Clouds (< 768px) */}
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={55}
        height={55}
        priority
        className="absolute left-[8%] top-[30%] opacity-45 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "6px",
          animationDuration: "7.8s",
          animationDelay: "-2.1s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud5.png"
        alt=""
        width={45}
        height={45}
        priority
        className="absolute right-[25%] top-[20%] opacity-50 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "5px",
          animationDuration: "7.2s",
          animationDelay: "-4.3s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud1.png"
        alt=""
        width={50}
        height={50}
        priority
        className="absolute left-[70%] top-[75%] opacity-40 pointer-events-none cloud md:hidden"
        style={{
          "--float-distance": "5px",
          animationDuration: "8.5s",
          animationDelay: "-1.7s",
        } as React.CSSProperties}
      />

      {/* Desktop Clouds (≥ 768px) */}
      <Image
        src="/clouds/cloud4.png"
        alt=""
        width={140}
        height={140}
        priority
        className="absolute left-[5%] top-[25%] opacity-60 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "14px",
          animationDuration: "10.8s",
          animationDelay: "-3.2s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud1.png"
        alt=""
        width={120}
        height={120}
        priority
        className="absolute right-[20%] top-[15%] opacity-65 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "12px",
          animationDuration: "9.5s",
          animationDelay: "-1.8s",
        } as React.CSSProperties}
      />
      <Image
        src="/clouds/cloud3.png"
        alt=""
        width={110}
        height={110}
        priority
        className="absolute left-[75%] top-[70%] opacity-55 pointer-events-none cloud hidden md:block"
        style={{
          "--float-distance": "10px",
          animationDuration: "11.2s",
          animationDelay: "-5.5s",
        } as React.CSSProperties}
      />

      {/* wrapper: scales down on xs, back up at sm */}
      <div className="relative z-10 transform scale-75 sm:scale-100">
        <BirdScene />

        <img
          src="/left_branch.svg"
          alt="Left jungle branch"
          className="sm:translate-y-12 sm:-translate-x-4 -translate-x-26 w-70 h-70 sm:w-[300px] sm:h-[300px]"
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
