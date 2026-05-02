"use client";

const SECTIONS = [
  {
    id: "hotel",
    emoji: "🏨",
    title: "Your Home Base — amba Taipei Songshan",
    color: "sky",
    content: [
      {
        type: "info",
        body: "The amba Taipei Songshan is directly connected to Songshan MRT Station on the Green Line (Xinyi Line). The hotel lobby is on the 17th floor. The station is in the basement of the building — you literally take the hotel elevator down to the platform.",
      },
      {
        type: "tip",
        body: "You never need to go outside to board the MRT. This makes it incredibly convenient for every day of the trip.",
      },
    ],
  },
  {
    id: "mrt",
    emoji: "🚇",
    title: "Taipei MRT (Metro) — The Core System",
    color: "green",
    content: [
      {
        type: "info",
        body: "The MRT (Mass Rapid Transit) is Taipei's subway. It's clean, fast, air-conditioned, and runs every 3–8 minutes during the day. All signs are in English and Chinese. Fares range from NT$20–65 depending on distance. Use your Easy Card to tap in and tap out — no need to buy single-journey tickets.",
      },
      {
        type: "lines",
        lines: [
          {
            name: "Green Line (Xinyi Line)",
            color: "#28a745",
            key: "Your line — Songshan Station is your stop",
            stops: "Songshan ↔ Taipei City Hall ↔ Ximen ↔ Zhongshan",
            notes: "Runs east-west through central Taipei. Ximen is 5 stops west — direct, no transfer.",
          },
          {
            name: "Brown Line (Wenhu Line — Elevated)",
            color: "#8B4513",
            key: "Zoo & Maokong access",
            stops: "Connects at Zhongxiao Xinsheng (Blue/Brown transfer) and at Taipei City Hall",
            notes: "Runs in a loop around the city. Take it to Taipei Zoo (last stop southwest) for the zoo and Maokong Gondola.",
          },
          {
            name: "Red Line (Danshui-Xinyi Line)",
            color: "#e74c3c",
            key: "Airport, Tamsui, Taipei 101",
            stops: "Tamsui ↔ Zhongshan ↔ Taipei 101/World Trade Center ↔ Taipei Main Station",
            notes: "Runs north-south. Taipei 101 station is on this line. Tamsui (hot springs day) is the north end.",
          },
          {
            name: "Blue Line (Bannan Line)",
            color: "#3498db",
            key: "Ximending access",
            stops: "Ximen ↔ Zhongxiao Xinsheng ↔ Shandao Temple",
            notes: "East-west line. Transfer from Green to Blue at Ximen for Fu Hang Soy Milk (Shandao Temple).",
          },
          {
            name: "Pink Line (Xinbeitou Branch)",
            color: "#e91e8c",
            key: "Beitou Hot Springs",
            stops: "Beitou ↔ Xinbeitou (1 stop)",
            notes: "Short branch line. Transfer from Red Line at Beitou Station.",
          },
        ],
      },
    ],
  },
  {
    id: "easycard",
    emoji: "💳",
    title: "Easy Card — Everything You Need to Know",
    color: "teal",
    content: [
      {
        type: "info",
        body: "The Easy Card (悠遊卡) is a rechargeable tap-to-pay card. It works on the MRT, buses, Maokong Gondola, some taxis, and convenience store purchases. Buy one at the airport MRT station counter or any 7-Eleven / FamilyMart.",
      },
      {
        type: "list",
        items: [
          "Cost: NT$100 (includes NT$50 stored value)",
          "Load more at any MRT station or convenience store",
          "Tap the yellow reader to enter; tap again to exit — fare is deducted automatically",
          "3% discount on MRT fares vs single-journey tickets",
          "Works on city buses — tap on boarding, tap again when exiting",
          "Works at 7-Eleven, FamilyMart, and many restaurants",
          "Refundable at MRT service centers (minus NT$20 handling fee)",
        ],
      },
      {
        type: "tip",
        body: "Load at least NT$500 when you buy it. You can top up at any MRT machine — just press 'Add Value' and insert cash or use a card.",
      },
    ],
  },
  {
    id: "routes",
    emoji: "🗺️",
    title: "Key Routes Day-by-Day",
    color: "purple",
    content: [
      {
        type: "routes",
        routes: [
          {
            day: "Day 1",
            name: "Airport → Hotel",
            steps: [
              "Easiest: Taxi or Uber from TPE → amba Songshan (~NT$1,200–1,500, ~45 min)",
              "MRT option: Airport MRT from TPE → Taipei Main Station, transfer to Green Line → Songshan (~70 min total)",
            ],
            tip: "After a long flight, just take the taxi. Worth it.",
          },
          {
            day: "Day 2",
            name: "Hotel → Taipei 101",
            steps: [
              "MRT Green Line from Songshan → Taipei City Hall (2 stops east)",
              "Walk ~10 min or take a short Uber to Taipei 101",
            ],
            tip: "City Hall station is the closest MRT to Taipei 101.",
          },
          {
            day: "Day 2",
            name: "Hotel → Maokong Gondola",
            steps: [
              "Option A (Easy): Uber/taxi directly to 'Maokong Gondola Station' (~45 min, NT$300–400)",
              "Option B (MRT): Green Line from Songshan → Taipei City Hall (2 stops). Transfer to Brown Line (Wenhu Line). Ride 10 stops to the last stop: Taipei Zoo Station. Walk to gondola entrance.",
            ],
            tip: "Uber is easier here — avoids navigating transfers.",
          },
          {
            day: "Day 3",
            name: "Hotel → Taipei Zoo",
            steps: [
              "MRT Green Line from Songshan → Taipei City Hall (2 stops)",
              "Transfer to Brown Line (Wenhu Line) heading southwest",
              "Ride 10 stops to the last stop: Taipei Zoo Station",
              "Walk to zoo entrance",
            ],
            tip: "The Brown Line is elevated — enjoy the city views.",
          },
          {
            day: "Day 3",
            name: "Zoo → Shenkeng Old Street",
            steps: [
              "Uber or taxi from Taipei Zoo entrance (~15 min, NT$200–300)",
              "No direct MRT route — taxi is best here",
            ],
            tip: "Grab Uber from the zoo main gate. Input '深坑老街' or 'Shenkeng Old Street'.",
          },
          {
            day: "Day 4",
            name: "Hotel → Luodong (TRA Train)",
            steps: [
              "Walk or short taxi from amba Songshan to Songshan TRA Station (台鐵松山站)",
              "Note: This is a DIFFERENT station from Songshan MRT — it's the national rail station",
              "Board TRA Express at 9:37 AM — tickets on Mitch's app",
              "Ride ~1 hour to Luodong Station",
            ],
            tip: "Songshan TRA Station is about a 5-min walk east of the hotel. Allow 15 min to find it the first time.",
          },
          {
            day: "Day 5",
            name: "Hotel → Tour Pickup (Taipei Main Station)",
            steps: [
              "MRT Green Line from Songshan → Taipei Main Station (2 stops west)",
              "Follow signs to East Gate, Exit 3",
            ],
            tip: "Check your GetYourGuide voucher for the exact meeting point — it may vary.",
          },
          {
            day: "Day 6",
            name: "Hotel → Ximending",
            steps: [
              "MRT Green Line from Songshan → Ximen Station (5 stops west)",
              "Exit 6 — walk into the pedestrian zone",
            ],
            tip: "Direct line, no transfers. 15 min.",
          },
          {
            day: "Day 6",
            name: "Ximending → Hotel",
            steps: [
              "MRT Green Line from Ximen → Songshan Station",
              "Same line, reverse direction. 15 min.",
            ],
            tip: "Trains every 3–8 min. Just tap your Easy Card.",
          },
          {
            day: "Day 8",
            name: "Hotel → Fu Hang Soy Milk",
            steps: [
              "Hotel elevator → Songshan MRT Station",
              "Green Line from Songshan → Ximen Station",
              "At Ximen, transfer to Blue Line (Bannan Line) heading toward Nangang",
              "Ride 2 stops to Shandao Temple Station",
              "Use Exit 5 — Fu Hang is on the 2F of the market building above",
            ],
            tip: "The Green→Blue transfer at Ximen is well-signed. Total ~20 min.",
          },
          {
            day: "Day 8",
            name: "Hotel → Beitou Hot Springs",
            steps: [
              "MRT Green Line from Songshan → Zhongshan Station",
              "Transfer to Red Line (north direction)",
              "Ride to Beitou Station",
              "Transfer to Pink Xinbeitou Branch Line — 1 stop to Xinbeitou Station",
              "Walk or taxi to Grand View Resort (~10 min)",
            ],
            tip: "Or just take a taxi from the hotel (~NT$400, ~30 min). Easier on a spa day.",
          },
          {
            day: "Day 8",
            name: "Beitou → Tamsui",
            steps: [
              "From Xinbeitou: Pink branch line back to Beitou Station (1 stop)",
              "Transfer to Red Line heading north",
              "Ride to Tamsui Station (end of line)",
            ],
            tip: "The Red Line runs all the way north to Tamsui — it's the same line you used to get to Beitou.",
          },
          {
            day: "Day 8",
            name: "Tamsui → Hotel",
            steps: [
              "MRT Red Line from Tamsui south to Zhongshan Station (~40 min)",
              "Transfer to Green Line at Zhongshan → Songshan Station (~10 min)",
            ],
            tip: "Total ~55 min. Trains every 3–8 min.",
          },
          {
            day: "Day 9",
            name: "Hotel → Airport (Departure)",
            steps: [
              "Pre-book taxi or Uber the night before",
              "Depart hotel by 6:30 AM",
              "Ride ~45 min to Taoyuan Airport (TPE)",
            ],
            tip: "Do NOT take the MRT on departure day with luggage — it requires a transfer and is about 70 min. Just take the taxi.",
          },
        ],
      },
    ],
  },
  {
    id: "taxi",
    emoji: "🚕",
    title: "Taxis & Uber",
    color: "yellow",
    content: [
      {
        type: "info",
        body: "Taxis in Taipei are metered, safe, and relatively cheap. Uber also works well. Most drivers don't speak English — have the destination written in Chinese or use Google Maps to show them.",
      },
      {
        type: "list",
        items: [
          "Base fare: NT$70 for the first 1.25 km",
          "Typical short trip (3–5 km): NT$150–250",
          "Airport to hotel: ~NT$1,200–1,500",
          "Show your destination on Google Maps or have it in Chinese — most drivers don't speak English",
          "Uber works identically to at home — English app, price estimate up front",
          "LINE Taxi is the local equivalent of Uber — also widely used",
        ],
      },
      {
        type: "tip",
        body: "For the Michelin dinner (Day 3), use Uber so you're not stressing about directions while dressed up.",
      },
    ],
  },
  {
    id: "tra",
    emoji: "🚄",
    title: "TRA (Taiwan Railways) — Day Trip Train",
    color: "orange",
    content: [
      {
        type: "info",
        body: "The TRA (台灣鐵路) is Taiwan's national rail system — separate from the MRT. You need this for Day 4 (Luodong / Bambi Land). Tickets are already on Mitch's app.",
      },
      {
        type: "important",
        body: "Songshan TRA Station (台鐵松山站) is DIFFERENT from Songshan MRT Station. The TRA station is about a 5-minute walk east of the hotel. Allow extra time to find it the first time.",
      },
      {
        type: "list",
        items: [
          "Day 4: Depart Songshan TRA 9:37 AM → Luodong (~1h)",
          "Day 4: Return Luodong 3:16 PM → Songshan (~1h 20m)",
          "Tickets are already booked on Mitch's app — show the QR code to the conductor",
          "Sit in your reserved seats — reserved seating is assigned",
          "The route goes along the northeast coast — beautiful views",
        ],
      },
    ],
  },
  {
    id: "gondola",
    emoji: "🚡",
    title: "Maokong Gondola",
    color: "emerald",
    content: [
      {
        type: "info",
        body: "The Maokong Gondola runs from Taipei Zoo Station up to Maokong Mountain — tea houses, views, and hiking trails.",
      },
      {
        type: "list",
        items: [
          "Base station: Maokong Gondola Station (beside Taipei Zoo MRT stop)",
          "One-way: NT$120 / Round trip: NT$240",
          "Pay with Easy Card (tap) or cash",
          "Operating hours: Tue–Sun, closes around 9–10 PM (verify current hours)",
          "Closed Mondays for maintenance",
          "Clear gondola cabins available — glass floor, extra fee",
          "Ride time: ~25 min from base to top",
        ],
      },
      {
        type: "tip",
        body: "The Crystal Cabin (glass floor gondola) costs extra but the views are incredible. Ask for it at the ticket counter — it's limited.",
      },
    ],
  },
];

type ColorKey = "sky" | "green" | "teal" | "purple" | "yellow" | "orange" | "emerald";

const ACCENT: Record<ColorKey, string> = {
  sky: "border-sky-500/40 bg-sky-500/10",
  green: "border-green-500/40 bg-green-500/10",
  teal: "border-teal-500/40 bg-teal-500/10",
  purple: "border-purple-500/40 bg-purple-500/10",
  yellow: "border-yellow-500/40 bg-yellow-500/10",
  orange: "border-orange-500/40 bg-orange-500/10",
  emerald: "border-emerald-500/40 bg-emerald-500/10",
};

const BADGE: Record<ColorKey, string> = {
  sky: "bg-sky-500",
  green: "bg-green-600",
  teal: "bg-teal-600",
  purple: "bg-purple-600",
  yellow: "bg-yellow-500 text-black",
  orange: "bg-orange-500",
  emerald: "bg-emerald-600",
};

export default function TransitPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-white text-2xl font-bold">Transit Guide</h1>
        <p className="text-white/50 text-sm mt-1">Everything you need to get around Taipei without stress.</p>
      </div>

      {/* Quick jump */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/50 transition-all"
          >
            {s.emoji} {s.title.split("—")[0].trim()}
          </a>
        ))}
      </div>

      {SECTIONS.map((section) => {
        const color = section.color as ColorKey;
        return (
          <div
            key={section.id}
            id={section.id}
            className={`rounded-2xl border p-6 ${ACCENT[color]}`}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{section.emoji}</span>
              <h2 className="text-white font-bold text-lg">{section.title}</h2>
            </div>

            <div className="space-y-4">
              {section.content.map((block, bi) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const b = block as any;
                if (b.type === "info") {
                  return <p key={bi} className="text-white/75 text-sm leading-relaxed">{b.body}</p>;
                }
                if (b.type === "tip") {
                  return (
                    <div key={bi} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-200/80 text-sm">
                      💡 {b.body}
                    </div>
                  );
                }
                if (b.type === "important") {
                  return (
                    <div key={bi} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-200/80 text-sm font-medium">
                      ⚠️ {b.body}
                    </div>
                  );
                }
                if (b.type === "list" && b.items) {
                  return (
                    <ul key={bi} className="space-y-1.5">
                      {b.items.map((item: string, ii: number) => (
                        <li key={ii} className="flex gap-2 text-sm text-white/70">
                          <span className="text-white/30 mt-0.5">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  );
                }
                if (b.type === "lines" && b.lines) {
                  return (
                    <div key={bi} className="space-y-3">
                      {b.lines.map((line: { name: string; color: string; key: string; stops: string; notes: string }, li: number) => (
                        <div key={li} className="bg-black/20 rounded-xl p-4 border border-white/10">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-3 h-3 rounded-full border-2 border-white/50" style={{ backgroundColor: line.color }} />
                            <span className="text-white font-semibold text-sm">{line.name}</span>
                            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full text-white ${BADGE[color]}`}>{line.key}</span>
                          </div>
                          <p className="text-white/50 text-xs mb-1">{line.stops}</p>
                          <p className="text-white/70 text-xs">{line.notes}</p>
                        </div>
                      ))}
                    </div>
                  );
                }
                if (b.type === "routes" && b.routes) {
                  return (
                    <div key={bi} className="space-y-4">
                      {b.routes.map((route: { day: string; name: string; steps: string[]; tip: string }, ri: number) => (
                        <div key={ri} className="bg-black/20 rounded-xl p-4 border border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full text-white ${BADGE[color]}`}>{route.day}</span>
                            <span className="text-white font-semibold text-sm">{route.name}</span>
                          </div>
                          <ol className="space-y-1 mb-2">
                            {route.steps.map((step: string, si: number) => (
                              <li key={si} className="flex gap-2 text-sm text-white/70">
                                <span className="text-sky-400/60 font-mono text-xs mt-0.5 min-w-[16px]">{si + 1}.</span>
                                {step}
                              </li>
                            ))}
                          </ol>
                          {route.tip && (
                            <div className="text-yellow-200/60 text-xs bg-yellow-500/10 rounded px-2 py-1 border border-yellow-500/20">
                              💡 {route.tip}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
