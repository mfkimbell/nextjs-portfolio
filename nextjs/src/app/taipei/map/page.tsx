"use client";

const LOCATIONS = [
  { emoji: "🏨", name: "amba Taipei Songshan (Hotel)", note: "Connected to Songshan MRT — Green Line", district: "Songshan" },
  { emoji: "🍜", name: "Raohe Night Market", note: "3-min walk from hotel. Eastern entrance for Fuzhou Pepper Buns.", district: "Songshan" },
  { emoji: "🗼", name: "Taipei 101", note: "Din Tai Fung (B1), A Joy Buffet (86F), Pokemon Center, UNIQLO", district: "Xinyi" },
  { emoji: "🏮", name: "Longshan Temple", note: "Optional early morning visit — Day 2", district: "Wanhua" },
  { emoji: "🐼", name: "Taipei Zoo + Maokong Gondola", note: "End of Brown MRT Line. Gondola base at zoo.", district: "Wenshan" },
  { emoji: "🧱", name: "Dihua Street (Dadaocheng)", note: "Old Taipei — dried mango, bamboo crafts, Baroque facades", district: "Datong" },
  { emoji: "🛍️", name: "Ximending District", note: "Harajuku of Taipei. Wan Nian Building, Animate, Pop Mart, Magfreak", district: "Wanhua" },
  { emoji: "🥣", name: "Fu Hang Soy Milk", note: "Above Shandao Temple MRT Station. Blue Line, Exit 5.", district: "Zhongzheng" },
  { emoji: "♨️", name: "Grand View Resort Beitou", note: "Private hot springs. Reservation ID: 5DUJE9", district: "Beitou" },
  { emoji: "🌡️", name: "Thermal Valley (地熱谷)", note: "Short walk from Grand View Resort", district: "Beitou" },
  { emoji: "🌅", name: "Tamsui Old Street + Fisherman's Wharf", note: "End of Red MRT Line. Ferry to Lover's Bridge.", district: "Tamsui" },
  { emoji: "🪨", name: "Yehliu Geopark", note: "North coast — Queen's Head rock. Tour bus Day 5.", district: "Wanli, New Taipei" },
  { emoji: "🏮", name: "Shifen Old Street + Waterfall", note: "Sky lanterns on the train tracks. Tour bus Day 5.", district: "Pingxi, New Taipei" },
  { emoji: "🍵", name: "Jiufen Old Street", note: "Spirited Away vibes. A-Mei Tea House. Tour bus Day 5.", district: "Ruifang, New Taipei" },
  { emoji: "🦌", name: "Bambi Land (斑比山丘)", note: "Sika deer + capybaras. Taxi from Luodong TRA Station.", district: "Luodong, Yilan" },
  { emoji: "🏘️", name: "Shenkeng Old Street", note: "Tofu Capital — grilled stinky tofu. Taxi from Taipei Zoo.", district: "Shenkeng, New Taipei" },
  { emoji: "🐾", name: "Paws Forest (肉球森林)", note: "Toucans, meerkats, cats. Reservation required.", district: "Zhongshan" },
  { emoji: "🎮", name: "Syntrend Creative Park", note: "12-story tech/anime mall. ROG, Gundam Base, gachapon.", district: "Zhongzheng" },
];

const DISTRICTS = [
  "Songshan", "Xinyi", "Wanhua", "Wenshan", "Datong", "Zhongzheng",
  "Beitou", "Tamsui", "Wanli, New Taipei", "Pingxi, New Taipei",
  "Ruifang, New Taipei", "Luodong, Yilan", "Shenkeng, New Taipei", "Zhongshan",
];

export default function MapPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-white text-2xl font-bold">Map & Locations</h1>
        <p className="text-white/50 text-sm mt-1">Every place on the itinerary, organized by district.</p>
      </div>

      {/* Embedded Google Map */}
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/5">
        <div className="p-4 border-b border-white/10">
          <h2 className="text-white font-semibold">🗺️ Taipei Interactive Map</h2>
          <p className="text-white/50 text-xs mt-0.5">Explore the city — all your key spots are in the central districts.</p>
        </div>
        <div className="relative" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d58252.05553025024!2d121.50348!3d25.04776!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3442ac946834fc43%3A0x2e98e3e88b1ea9a1!2sTaipei%2C%20Taiwan!5e0!3m2!1sen!2sus!4v1"
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>

      {/* MRT Map reference */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="text-white font-bold text-lg mb-3">🚇 MRT System Map</h2>
        <p className="text-white/60 text-sm mb-4">
          The MRT covers all your key destinations. Your hotel (Songshan) is on the Green Line — central to everything.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { line: "Green Line (Xinyi)", color: "#28a745", key: "Your hotel — Songshan Station" },
            { line: "Red Line (Danshui-Xinyi)", color: "#e74c3c", key: "Taipei 101, Tamsui, Airport MRT" },
            { line: "Brown Line (Wenhu)", color: "#8B4513", key: "Taipei Zoo & Maokong Gondola" },
            { line: "Blue Line (Bannan)", color: "#3498db", key: "Ximending (Ximen Station)" },
            { line: "Pink Line (Xinbeitou Branch)", color: "#e91e8c", key: "Beitou Hot Springs" },
          ].map((l) => (
            <div key={l.line} className="flex items-center gap-3 bg-black/20 rounded-lg p-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
              <div>
                <div className="text-white text-sm font-medium">{l.line}</div>
                <div className="text-white/50 text-xs">{l.key}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-white/30 text-xs mt-4">
          Search &quot;Taipei MRT map&quot; for the full official system map — available as a PDF from the TRTC website.
        </p>
      </div>

      {/* Location index by district */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="text-white font-bold text-lg mb-4">📍 All Locations by District</h2>
        <div className="space-y-6">
          {DISTRICTS.filter((d) => LOCATIONS.some((l) => l.district === d)).map((district) => (
            <div key={district}>
              <h3 className="text-sky-300 text-sm font-semibold uppercase tracking-wider mb-2">
                {district}
              </h3>
              <div className="space-y-2">
                {LOCATIONS.filter((l) => l.district === district).map((loc) => (
                  <div key={loc.name} className="flex gap-3 bg-black/20 rounded-lg p-3 border border-white/5">
                    <span className="text-lg">{loc.emoji}</span>
                    <div>
                      <div className="text-white text-sm font-medium">{loc.name}</div>
                      <div className="text-white/50 text-xs">{loc.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upload placeholder */}
      <div className="bg-white/5 border border-dashed border-white/20 rounded-2xl p-8 text-center">
        <div className="text-4xl mb-3">🖼️</div>
        <h2 className="text-white font-semibold mb-1">Upload Custom Map Images</h2>
        <p className="text-white/40 text-sm">
          Drop any saved maps, screenshots, or custom route images here — upload the files to{" "}
          <code className="text-sky-400 bg-black/30 px-1 rounded">nextjs/public/taipei/</code>{" "}
          and they will appear below automatically.
        </p>
      </div>
    </div>
  );
}
