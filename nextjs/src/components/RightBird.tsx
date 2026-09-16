// components/RightBird.tsx
"use client";

import RightBirdScene from "./RightBirdScene";

export default function RightBird() {
  return (
    <section className="relative overflow-hidden pr-35 pl-35 pb-0 w-full pt-0 pb-30 sm:pb-40 min-h-[100px] z-0">
      {/* Branch and Bird - 3D effect */}
      <div className="relative w-full h-[50px] min-h-[10px]">
        {/* Background branch - behind the bird */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/right_branch_front.png"
          alt="Right jungle branch foreground"
          className="absolute -right-55 sm:-right-45 top-6 sm:top-12 w-[295px] sm:w-[380px] object-contain z-20"
          style={{ height: 'auto', maxWidth: 'none' }}
        />
      </div>

    </section>
  );
}
