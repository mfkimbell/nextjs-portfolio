"use client";

import BirdScene from "./BirdScene";

export default function LeftBird() {
  return (
    <section className="relative overflow-visible pt-10">
      {/* wrapper: scales down on xs, back up at sm */}
      <div className="relative z-10 transform scale-75 sm:scale-100">
        <BirdScene />

        <img
          src="/left_branch.svg"
          alt="Left jungle branch"
          className="
            sm:translate-y-12 sm:-translate-x-2 -translate-x-20
            w-70 h-70       /* 6rem on xs */
            sm:w-[300px]     /* full 300px at sm+ */
            sm:h-[300px]
          "
        />
      </div>
    </section>
  );
}
