"use client";

import Image from "next/image";
import BirdScene from "./BirdScene";

export default function LeftBird() {
  return (
    <section className="relative  overflow-visible pt-10">
      {/* Right-side branch */}
    

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

     
    </section>
  );
}
