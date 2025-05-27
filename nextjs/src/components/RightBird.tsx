// components/RightBird.tsx
"use client";

import RightBirdScene from "./RightBirdScene";

export default function RightBird() {
  return (
    <section className="relative overflow-hidden p-35  w-full">
      {/* wrapper: scales down on xs, back up at sm */}
      <div className="relative z-0 transform scale-75 sm:scale-100">
        <RightBirdScene />

        <img
          src="/right_branch.png"
          alt="Right jungle branch"
          className="
            pointer-events-none
            absolute -right-43 top-1/2
            transform -translate-y-1/2
            w-24 h-24
            sm:w-[350px] sm:h-[250px]
          "
        />
      </div>
    </section>
  );
}
