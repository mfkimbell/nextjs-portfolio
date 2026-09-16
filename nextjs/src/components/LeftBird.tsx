"use client";

import BirdScene from "./BirdScene";

export default function LeftBird() {
  return (
    <section className="relative overflow-visible pt-0">
      {/* wrapper: scales down on xs, back up at sm */}
      <div className="relative z-10 transform scale-75 sm:scale-100">
        <BirdScene />

        {/* Plain <img> is intentional: the branch SVG is small, vector-scaled
            and doesn't benefit from next/image optimisation, which would
            require explicit width/height and break the tailwind sizing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/left_branch.svg"
          alt="Left jungle branch"
          className="sm:translate-y-12 sm:-translate-x-4 -translate-x-26 w-70 h-70 sm:w-[300px] sm:h-[300px]"
        />
      </div>

    </section>
  );
}
