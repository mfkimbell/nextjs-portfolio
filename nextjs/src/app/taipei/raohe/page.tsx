"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { TaipeiDay } from "../types";
import { useMode } from "../ModeContext";

const RAOHE_ITEMS = [
  {
    img: "/food/1.png",
    name: "Fuzhou Pepper Buns",
    tag: "Most Famous ⭐",
    desc: "The most famous stall at the eastern entrance. Get the crispy, charcoal-baked pork and black pepper buns.",
  },
  {
    img: "/food/2.png",
    name: "Chen Tung Pork Ribs Medicinal Herbs Soup",
    tag: "Sit-down stall",
    desc: "Order the tender pork ribs in herbal broth, and pair it with a bowl of braised pork rice.",
  },
  {
    img: "/food/3.png",
    name: "Dongfahao Oyster Vermicelli & Sticky Rice",
    tag: "Century-old spot",
    desc: "Get the oyster vermicelli (made with a clear broth, no cornstarch) and the Taiwanese sticky rice.",
  },
  {
    img: "/food/4.png",
    name: "Shi Boss Stinky Tofu",
    tag: "Deep-fried or herbal soup",
    desc: "Try it deep-fried with pickled cabbage, or in their spicy herbal soup with duck blood.",
  },
  {
    img: "/food/5.png",
    name: "Hongshao Beef Noodle Restaurant",
    tag: "Classic comfort",
    desc: "A classic, comforting bowl of red-braised beef noodles with a rich, dark broth.",
  },
  {
    img: "/food/6.png",
    name: "Mochi Baby (麻糬寶寶)",
    tag: "Dessert pushcart",
    desc: "Fresh, handmade glutinous rice mochi. Choose from crushed peanuts, black sesame, or powdered sugar.",
  },
];

export default function RaohePage() {
  const { mode } = useMode();
  const [days, setDays] = useState<TaipeiDay[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/taipei/days?mode=${mode}`).then((r) => r.json()).then(setDays);
  }, [mode]);

  // Find Raohe checklist items (first 6 — the food items)
  const raoheChecks: Record<number, { id: string; done: boolean }> = {};
  for (const day of days) {
    for (const ev of day.events) {
      if (ev.title.toLowerCase().includes("raohe")) {
        ev.checklist.forEach((c, i) => {
          if (i < 6) raoheChecks[i] = { id: c.id, done: c.done };
        });
      }
    }
  }

  async function toggleCheck(checkId: string, done: boolean) {
    setSaving(true);
    await fetch("/api/taipei/checklist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: checkId, done }),
    });
    setSaving(false);
    setDays((prev) =>
      prev.map((day) => ({
        ...day,
        events: day.events.map((ev) => ({
          ...ev,
          checklist: ev.checklist.map((c) => (c.id === checkId ? { ...c, done } : c)),
        })),
      }))
    );
  }

  const doneCount = Object.values(raoheChecks).filter((c) => c.done).length;
  const totalCount = RAOHE_ITEMS.length;

  return (
    <div className="space-y-6">
      {saving && (
        <div className="fixed top-20 right-4 bg-sky-500/90 text-white text-xs px-3 py-1.5 rounded-full z-50 shadow-lg">
          Saving…
        </div>
      )}

      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white text-2xl font-bold">🏮 Raohe Night Market</h1>
          <p className="text-white/50 text-sm mt-1">
            Michelin Bib Gourmand ⭐ · 3-min walk from the hotel · Cash preferred
          </p>
        </div>
        {totalCount > 0 && (
          <span className="text-white/50 text-sm">
            {doneCount}/{totalCount} tried
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {RAOHE_ITEMS.map((item, i) => {
          const check = raoheChecks[i];
          return (
            <div
              key={i}
              className={`rounded-2xl overflow-hidden border transition-all ${
                check?.done
                  ? "border-green-500/40 bg-green-500/5 opacity-60"
                  : "border-white/10 bg-white/5 hover:border-white/25"
              }`}
            >
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src={item.img}
                  alt={item.name}
                  fill
                  className={`object-cover transition-all ${check?.done ? "grayscale" : ""}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute top-2 left-2">
                  <span className="bg-sky-500/80 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    {item.tag}
                  </span>
                </div>
                {check?.done && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-5xl drop-shadow-lg">✅</span>
                  </div>
                )}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`font-semibold text-sm leading-snug ${check?.done ? "line-through text-white/40" : "text-white"}`}>
                    {item.name}
                  </h3>
                  {check && (
                    <input
                      type="checkbox"
                      checked={check.done}
                      onChange={() => toggleCheck(check.id, !check.done)}
                      className="w-5 h-5 rounded accent-sky-400 flex-shrink-0 mt-0.5 cursor-pointer"
                    />
                  )}
                </div>
                <p className="text-white/55 text-xs mt-1.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
        <p className="font-semibold text-white/80 text-sm">📍 Getting there</p>
        <p className="text-white/60 text-sm">3-minute walk from amba Songshan — cross the street heading north to the market entrance on Raohe Street. The eastern entrance is where you&apos;ll find the Fuzhou Pepper Bun stall.</p>
        <p className="text-yellow-200/60 text-sm">💡 Cash preferred at most stalls. Go before 10 PM for shorter queues.</p>
      </div>
    </div>
  );
}
