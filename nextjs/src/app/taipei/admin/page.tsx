"use client";

import Image from "next/image";
import { useMode } from "../ModeContext";

function dayImg(dayNum: number, mode: "real" | "fake"): string {
  const variants: Record<number, { real: string; fake: string }> = {
    2: { real: "/days/day2real.png", fake: "/days/day2fake.png" },
    6: { real: "/days/day6real.png", fake: "/days/day6fake.png" },
  };
  if (variants[dayNum]) return variants[dayNum][mode];
  return `/days/day${dayNum}.png`;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function AdminPage() {
  const { mode, setMode } = useMode();
  const isReal = mode === "real";

  return (
    <div className="space-y-8 max-w-xl mx-auto">
      <div>
        <h1 className="text-white text-2xl font-bold">⚙️ Admin</h1>
        <p className="text-white/40 text-sm mt-1">Controls the view mode across the whole itinerary.</p>
      </div>

      {/* Toggle */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-semibold text-lg">
              {isReal ? "🌸 Real Mode" : "🎭 Fake Mode"}
            </div>
            <div className="text-white/50 text-sm mt-0.5">
              {isReal
                ? "Showing the real itinerary — safe for you only."
                : "Showing the decoy itinerary — safe to show Anna."}
            </div>
          </div>

          {/* Toggle switch */}
          <button
            onClick={() => setMode(isReal ? "fake" : "real")}
            className={`relative w-16 h-8 rounded-full transition-colors duration-300 focus:outline-none ${
              isReal ? "bg-sky-500" : "bg-pink-500"
            }`}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
                isReal ? "left-1" : "left-9"
              }`}
            />
          </button>
        </div>

        <div className={`text-xs px-3 py-2 rounded-lg border ${
          isReal
            ? "bg-sky-500/10 border-sky-500/30 text-sky-300"
            : "bg-pink-500/10 border-pink-500/30 text-pink-300"
        }`}>
          {isReal
            ? "🔒 Real mode is active. Days 2 and 6 show the actual plan."
            : "🎭 Fake mode is active. Days 2 and 6 show decoy images. Safe to hand over the phone."}
        </div>
      </div>

      {/* Day image preview grid */}
      <div>
        <h2 className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-3">Day Image Preview</h2>
        <div className="grid grid-cols-5 gap-3">
          {ALL_DAYS.map((dayNum) => {
            const src = dayImg(dayNum, mode);
            const hasFake = dayNum === 2 || dayNum === 6;
            return (
              <div key={dayNum} className="space-y-1">
                <div className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                  <Image src={src} alt={`Day ${dayNum}`} fill className="object-cover" />
                  {hasFake && (
                    <div className={`absolute bottom-0 inset-x-0 text-[9px] text-center py-0.5 font-bold ${
                      isReal ? "bg-sky-500/80 text-white" : "bg-pink-500/80 text-white"
                    }`}>
                      {isReal ? "REAL" : "FAKE"}
                    </div>
                  )}
                </div>
                <div className="text-white/40 text-[10px] text-center">Day {dayNum}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
