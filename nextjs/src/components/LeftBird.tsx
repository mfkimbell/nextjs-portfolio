"use client";

import Image from "next/image";
import BirdScene from "./BirdScene";

export default function Hero2() {
  return (
    <section className="relative w-full h-screen overflow-visible pt-10">
      {/* Right-side branch */}
      <Image
        src="/right_branch.svg"
        alt="Right jungle branch"
        width={300}
        height={300}
        className="absolute right-0 top-32 z-0"
      />

      {/* Left-side bird + branch */}
      <div className="relative z-10">
        <BirdScene />
        <Image
          src="/left_branch.svg"
          alt="Left jungle branch"
          width={300}
          height={300}
          className="translate-y-12 -translate-x-4"
        />
      </div>

      {/* Hero2 text overlay (if any) */}
      <div className="relative z-20 mx-auto max-w-4xl px-6 text-left mt-36 text-white">
        {/* Add any heading or content here, or leave blank if not needed */}
      </div>
    </section>
  );
}
