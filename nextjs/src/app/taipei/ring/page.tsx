"use client";

import Image from "next/image";

export default function RingPage() {
  return (
    <div className="space-y-10 max-w-2xl mx-auto">
      <div>
        <h1 className="text-white text-2xl font-bold">💍 Anna&apos;s Ring</h1>
        <p className="text-white/40 text-sm mt-1">The ring details — keep this safe.</p>
      </div>

      {/* Full ring photo */}
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/5">
        <div className="relative w-full aspect-square">
          <Image src="/ring.png" alt="Engagement Ring" fill className="object-contain p-6" />
        </div>
      </div>

      {/* Diamond */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="relative aspect-square sm:aspect-auto sm:min-h-64">
            <Image src="/diamond.png" alt="Diamond" fill className="object-contain p-6" />
          </div>
          <div className="p-6 border-t sm:border-t-0 sm:border-l border-white/10 space-y-4">
            <div>
              <div className="text-white/35 text-[10px] uppercase tracking-widest mb-1 font-semibold">💎 Diamond</div>
              <div className="text-white font-semibold text-base leading-snug">
                ROUND Cut 1.40 Carat E Color VS1 Clarity Lab Grown Diamond
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-white/40 w-28 shrink-0">SKU</span>
                <span className="text-white/80 font-mono">LGD14-2039</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/40 w-28 shrink-0">Cut</span>
                <span className="text-white/80">Round</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/40 w-28 shrink-0">Carat</span>
                <span className="text-white/80">1.40 ct</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/40 w-28 shrink-0">Color</span>
                <span className="text-white/80">E</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/40 w-28 shrink-0">Clarity</span>
                <span className="text-white/80">VS1</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/40 w-28 shrink-0">Type</span>
                <span className="text-white/80">Lab Grown</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/40 w-28 shrink-0">Certificate</span>
                <span className="text-white/80">IGI</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/40 w-28 shrink-0">Certificate ID</span>
                <span className="text-white/80 font-mono">631465157</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Setting */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="relative aspect-square sm:aspect-auto sm:min-h-64">
            <Image src="/setting.png" alt="Ring Setting" fill className="object-contain p-6" />
          </div>
          <div className="p-6 border-t sm:border-t-0 sm:border-l border-white/10 space-y-4">
            <div>
              <div className="text-white/35 text-[10px] uppercase tracking-widest mb-1 font-semibold">💍 Setting</div>
              <div className="text-white font-semibold text-base leading-snug">
                Vintage Tulip Set Engagement Ring
              </div>
            </div>
            <p className="text-white/60 text-sm leading-relaxed">
              Semi mount ring setting for your diamond. 14k Gold petal prong set flower basket setting engagement ring.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
