export type CheckItem = { label: string; done: boolean; order: number };
export type EventData = {
  time: string; emoji: string; title: string;
  description: string; location: string; transit: string; tips: string;
  order: number; realOnly?: boolean; fakeOnly?: boolean; checklist: CheckItem[];
};
export type DayData = {
  dayNum: number; date: string; label: string; focus: string;
  fakeFocus?: string; notes: string; order: number; events: EventData[];
};

export const DAYS: DayData[] = [
  // ── DAY 0 ──────────────────────────────────────────────────────────────────
  {
    dayNum: 0, order: 0,
    date: "Wednesday, May 13",
    label: "Day 0",
    focus: "Travel Day — Atlanta to Seattle to Taipei",
    notes: "Get only 4 hours of sleep the night before to help reset your body clock on the plane.",
    events: [
      {
        order: 0, time: "4:00 AM CT", emoji: "⏰",
        title: "Wake Up",
        description: "Night before: get only 4 hours of sleep to help with the time-zone reset.",
        location: "", transit: "", tips: "",
        checklist: [],
      },
      {
        order: 1, time: "4:30 AM CT", emoji: "🚗",
        title: "Depart for Atlanta",
        description: "Hit I-20 East before morning rush hour gets heavy.",
        location: "I-20 East toward Atlanta", transit: "Drive ~2h 45m", tips: "Leave no later than 4:30 to beat Atlanta rush hour.",
        checklist: [],
      },
      {
        order: 2, time: "7:45 AM ET", emoji: "🅿️",
        title: "Arrive College Park MARTA Station",
        description: "Pull into the long-term secure parking deck ($8/day).",
        location: "3800 Main St, College Park, GA — long-term parking deck",
        transit: "Drive from I-20",
        tips: "Pay at the machine before you leave. Save the ticket.",
        checklist: [
          { label: "Park car in secure deck", done: false, order: 0 },
          { label: "Note parking spot/level", done: false, order: 1 },
          { label: "Pay parking machine", done: false, order: 2 },
        ],
      },
      {
        order: 3, time: "8:00 AM ET", emoji: "🚆",
        title: "Board MARTA to ATL",
        description: "Walk bags to the platform. Red or Gold line southbound — one stop, ~2 minutes.",
        location: "College Park MARTA Station platform",
        transit: "MARTA Red/Gold Line southbound — 1 stop to ATL Airport station",
        tips: "Trains run every ~10 min on weekday mornings.",
        checklist: [],
      },
      {
        order: 4, time: "8:05 AM ET", emoji: "🧳",
        title: "Arrive ATL — Security",
        description: "Train drops you inside the Domestic Terminal between baggage claims. Escalator up to security. 3+ stress-free hours before departure.",
        location: "ATL Domestic Terminal — MARTA station exit",
        transit: "Walk up escalator to security checkpoint",
        tips: "TSA PreCheck lane if you have it. Grab breakfast airside.",
        checklist: [
          { label: "Through security", done: false, order: 0 },
          { label: "Grab breakfast/coffee", done: false, order: 1 },
        ],
      },
      {
        order: 5, time: "10:15 AM ET", emoji: "💊",
        title: "Take Melatonin & Reset Watches",
        description: "Take 3mg Melatonin before boarding the ATL→SEA flight. Change all watches to Taiwan time (GMT+8).",
        location: "ATL gate area",
        transit: "",
        tips: "Taiwan is 13 hours ahead of ET. Set watch now so you naturally think in local time.",
        checklist: [
          { label: "Take 3mg melatonin", done: false, order: 0 },
          { label: "Change watch to Taiwan time (GMT+8)", done: false, order: 1 },
          { label: "Change phone timezone", done: false, order: 2 },
        ],
      },
      {
        order: 6, time: "11:15 AM ET", emoji: "✈️",
        title: "Depart ATL → Seattle (SEA)",
        description: "Delta flight Atlanta to Seattle.",
        location: "Hartsfield-Jackson Atlanta International Airport (ATL)",
        transit: "~5h flight",
        tips: "Try to sleep — it's effectively 'tonight' in Taiwan time.",
        checklist: [],
      },
      {
        order: 7, time: "Layover", emoji: "🔁",
        title: "Seattle Layover",
        description: "Short connection — 1h 10m. Don't leave the secure area.",
        location: "Seattle-Tacoma International Airport (SEA)",
        transit: "Stay in terminal — check gate assignment for Delta 69",
        tips: "Grab caffeine here — the Delta 69 flight to Taipei is overnight and you want to stay awake at the start.",
        checklist: [
          { label: "Find gate for Delta 69 to Taipei", done: false, order: 0 },
          { label: "Grab caffeine for long haul", done: false, order: 1 },
        ],
      },
      {
        order: 8, time: "3:55 PM PT", emoji: "✈️",
        title: "Depart SEA → Taipei (TPE) — Delta 69",
        description: "TRY TO STAY AWAKE at the start — use caffeine. ~11h flight.",
        location: "Seattle-Tacoma International Airport (SEA)",
        transit: "Delta 69 — ~11h direct to Taoyuan International Airport (TPE)",
        tips: "Stay awake first few hours to match Taiwan evening. Sleep the back half.",
        checklist: [],
      },
    ],
  },

  // ── DAY 1 ──────────────────────────────────────────────────────────────────
  {
    dayNum: 1, order: 1,
    date: "Thursday, May 14",
    label: "Day 1",
    focus: "Arrival & The First Bite",
    notes: "This will depend on how tired you are — the night market is a 3-minute walk from the hotel, so go only if you have energy.",
    events: [
      {
        order: 0, time: "7:55 PM", emoji: "🛬",
        title: "Land at Taoyuan International Airport (TPE)",
        description: "Welcome to Taiwan! Proceed through immigration and customs.",
        location: "Taoyuan International Airport (TPE)",
        transit: "",
        tips: "Have your passport and arrival card ready. Follow signs to Immigration.",
        checklist: [
          { label: "Through immigration", done: false, order: 0 },
          { label: "Collect bags", done: false, order: 1 },
          { label: "Through customs", done: false, order: 2 },
        ],
      },
      {
        order: 1, time: "~8:15 PM", emoji: "🏧",
        title: "ATM & Easy Card",
        description: "Withdraw cash with Fidelity Debit (no foreign transaction fees). Then find a convenience store (7-Eleven or FamilyMart) and buy an Easy Card — load NT$500+ for MRT rides.",
        location: "TPE Arrivals hall",
        transit: "",
        tips: "Easy Cards are sold at airport MRT station counters and convenience stores for NT$100 (includes NT$50 stored value). Load extra — it covers MRT, buses, and some convenience store purchases.",
        checklist: [
          { label: "Withdraw NT$ from ATM (Fidelity debit)", done: false, order: 0 },
          { label: "Buy Easy Card (NT$100)", done: false, order: 1 },
          { label: "Load at least NT$500 on Easy Card", done: false, order: 2 },
        ],
      },
      {
        order: 2, time: "9:30 PM", emoji: "🏨",
        title: "Check In — amba Taipei Songshan",
        description: "Lobby is on the 17th floor. There is reportedly a river view. The hotel is connected directly to Songshan MRT Station (Green Line).",
        location: "amba Taipei Songshan — connected to Songshan Station",
        transit: "Airport MRT from TPE → Taoyuan HSR, then transfer; or taxi/Uber (~NT$1,200, ~45 min)",
        tips: "Easiest from airport: take a taxi or Uber directly — about NT$1,200–1,500 and 45 min with no transfers. Ask hotel for exact MRT route if preferred.",
        checklist: [
          { label: "Check in to amba Songshan", done: false, order: 0 },
          { label: "Drop bags, freshen up", done: false, order: 1 },
        ],
      },
      {
        order: 3, time: "10:00 PM", emoji: "🍜",
        title: "Raohe Night Market",
        description: "Only 3-minute walk from the hotel — cross the street. Michelin Bib Gourmand night market. Go only if you have energy.",
        location: "Raohe Street Night Market, Songshan District",
        transit: "3-minute walk from amba Songshan — cross the street",
        tips: "Start at the eastern entrance for the famous Fuzhou Pepper Buns. Cash preferred at most stalls.",
        checklist: [
          { label: "Fuzhou Pepper Buns (eastern entrance) ⭐", done: false, order: 0 },
          { label: "Chen Tung Pork Ribs Medicinal Herbs Soup", done: false, order: 1 },
          { label: "Dongfahao Oyster Vermicelli & Sticky Rice", done: false, order: 2 },
          { label: "Shi Boss Stinky Tofu (deep-fried)", done: false, order: 3 },
          { label: "Hongshao Beef Noodle Restaurant", done: false, order: 4 },
          { label: "Mochi Baby — peanut/sesame/sugar mochi", done: false, order: 5 },
          { label: "Papaya Milk or Watermelon Juice", done: false, order: 6 },
        ],
      },
    ],
  },

  // ── DAY 2 ──────────────────────────────────────────────────────────────────
  {
    dayNum: 2, order: 2,
    date: "Friday, May 15",
    label: "Day 2",
    focus: "Taipei 101 & Maokong Gondola",
    fakeFocus: "Taipei 101 & Maokong Gondola",
    notes: "If feeling tired after shopping, 30-min nap max at hotel before gondola. Gondola takes ~45 min to reach by Uber.",
    events: [
      {
        order: 0, time: "7:00–9:00 AM", emoji: "🏮",
        title: "Optional: Longshan Temple",
        description: "If you're up mega early and bored, walk to Longshan Temple before shopping.",
        location: "Longshan Temple, Wanhua District",
        transit: "MRT Green Line from Songshan → Longshan Temple (Bannan Blue Line, transfer at Zhongxiao Xinsheng). About 20 min.",
        tips: "Beautiful and atmospheric in the morning before crowds. Free entry.",
        checklist: [],
      },
      {
        order: 1, time: "9:00 AM", emoji: "🛍️",
        title: "Pokémon Center Taipei",
        description: "Catch 'em all.",
        location: "Pokémon Center Taipei — inside Taipei 101 mall",
        transit: "MRT Green Line from Songshan → Taipei City Hall (2 stops), then walk 10 min to Taipei 101. Or taxi.",
        tips: "Opens at 11 AM on most days — verify hours. May want to arrive when Din Tai Fung opens instead.",
        checklist: [
          { label: "Browse Pokémon Center", done: false, order: 0 },
          { label: "Taiwan-exclusive merch", done: false, order: 1 },
        ],
      },
      {
        order: 2, time: "10:00 AM", emoji: "🥟",
        title: "Din Tai Fung — Taipei 101 B1",
        description: "Get a number immediately on arrival. While waiting: walk the skybridge to Gentle Monster (Breeze Nan Shan) or browse luxury shops. Order the Truffle Xiao Long Bao.",
        location: "Din Tai Fung, Taipei 101 B1 (basement)",
        transit: "Inside Taipei 101 mall",
        tips: "Go straight to the counter for a number before doing anything else. Wait can be 30–60 min. Worth every minute.",
        checklist: [
          { label: "Get queue number immediately", done: false, order: 0 },
          { label: "Truffle Xiao Long Bao", done: false, order: 1 },
          { label: "Shrimp & Pork Shao Mai", done: false, order: 2 },
          { label: "Pork Chop Fried Rice", done: false, order: 3 },
        ],
      },
      {
        order: 3, time: "12:00 PM", emoji: "🌰",
        title: "Donguri Republic (Studio Ghibli Store)",
        description: "Photo op with the giant Catbus and moving Totoro display.",
        location: "Donguri Republic — Breeze Nan Shan, near Taipei 101",
        transit: "Walk across the skybridge from Taipei 101",
        tips: "The Totoro figure moves on the hour — time your visit.",
        checklist: [
          { label: "Photo with Catbus", done: false, order: 0 },
          { label: "Photo with moving Totoro", done: false, order: 1 },
        ],
      },
      {
        order: 4, time: "1:00 PM", emoji: "👕",
        title: "UNIQLO / GU at ATT 4 FUN",
        description: "Check for Taiwan-exclusive T-shirt prints (UTme!).",
        location: "ATT 4 FUN mall, Xinyi District (near Taipei 101)",
        transit: "5-min walk from Taipei 101",
        tips: "Taiwan UNIQLO often has Asia-exclusive prints. GU has trendy budget fashion.",
        checklist: [
          { label: "UTme! exclusive T-shirts", done: false, order: 0 },
        ],
      },
      {
        order: 5, time: "2:00 PM", emoji: "🏨",
        title: "Return to Hotel — Rest",
        description: "Drop off shopping bags. Shower, rest, drink caffeine. 30-min nap MAX — you need to power through to reset sleep schedules.",
        location: "amba Taipei Songshan",
        transit: "MRT or taxi back to Songshan Station",
        tips: "Set an alarm for the nap. Do not sleep longer than 30 min.",
        checklist: [],
      },
      {
        order: 6, time: "4:30 PM", emoji: "🚡",
        title: "Maokong Gondola — Tea Ceremony & Sunset",
        description: "Gondola ride up the mountain with a tea ceremony reservation. Tea ceremony demonstration, try different Taiwanese teas and learn their history. See the city at sunset from the mountain. Ride the famous glass-bottom gondola cabins!",
        location: "Maokong Gondola — base at Taipei Zoo Station",
        transit: "Option A: Uber/taxi ~45 min to Maokong Gondola Taipei Zoo Station. Option B: MRT Green Line 2 stops to City Hall, transfer to Brown Line (Wenhu Line), ride 10 stops to the last stop (Taipei Zoo Station). Then walk to gondola entrance.",
        tips: "Gondola one-way is NT$120. Round trip NT$240. Cash or Easy Card. Ask for the Crystal Cabin (glass floor) — stunning views.",
        checklist: [
          { label: "Tea ceremony reservation confirmed", done: false, order: 0 },
          { label: "Ride the glass-bottom Crystal Cabin", done: false, order: 1 },
          { label: "Watch the sunset from the mountain", done: false, order: 2 },
        ],
      },
      {
        order: 7, time: "Evening", emoji: "🍵",
        title: "Dinner on Maokong Mountain",
        description: "Option 1: Yi Shi de Da Cha Hu Tea Restaurant (on Maokong Mountain). Option 2: Head back to Raohe Night Market for more Michelin Bib Gourmand dishes.",
        location: "Maokong Mountain or Raohe Night Market",
        transit: "Take gondola back down to zoo station, then MRT or taxi home.",
        tips: "Yi Shi de Da Cha Hu is famous for tea-infused cuisine with a mountain view.",
        realOnly: true,
        checklist: [],
      },
      {
        order: 8, time: "7:00–9:30 PM", emoji: "🥂",
        title: "A Joy Buffet — 3 Michelin Stars (Taipei 101, 86F)",
        description: "The highest buffet in Taiwan. 3-Michelin-Star restaurant on the 86th floor of Taipei 101. Stunning city views.",
        location: "A Joy Buffet, 86F Taipei 101, Xinyi District",
        transit: "Uber or MRT Red Line to Taipei 101/World Trade Center Station, then walk.",
        tips: "Dress code: smart casual/formal. Arrive a few minutes early.",
        fakeOnly: true,
        checklist: [
          { label: "Smart casual/formal attire", done: false, order: 0 },
          { label: "View from the 86th floor", done: false, order: 1 },
        ],
      },
    ],
  },

  // ── DAY 3 ──────────────────────────────────────────────────────────────────
  {
    dayNum: 3, order: 3,
    date: "Saturday, May 16",
    label: "Day 3",
    focus: "Pandas, The Tofu Capital & Night Market Round 2",
    fakeFocus: "Pandas, The Tofu Capital & High-Altitude Celebrations",
    notes: "",
    events: [
      {
        order: 0, time: "9:30 AM", emoji: "🐼",
        title: "Taipei Zoo",
        description: "See the Giant Pandas (most active in the morning) and the Pangolin Dome.",
        location: "Taipei Zoo, Wenshan District",
        transit: "MRT Green Line from Songshan → Taipei City Hall (2 stops). Transfer to Brown Line (Wenhu Line) heading southwest. Ride 10 stops to the last stop: Taipei Zoo Station. Walk to entrance.",
        tips: "Giant Pandas are most active before 11 AM. Pangolin Dome is a highlight — small animals, air-conditioned.",
        checklist: [
          { label: "See Giant Pandas (go early!)", done: false, order: 0 },
          { label: "Pangolin Dome", done: false, order: 1 },
        ],
      },
      {
        order: 1, time: "1:30 PM", emoji: "🏘️",
        title: "Taxi to Shenkeng Old Street — Tofu Capital",
        description: "A beautifully restored red-brick historical street known as the 'Tofu Capital' of Taiwan. Try grilled stinky tofu (sweeter and less intense than fried). Alternatives: sweet tofu ice cream, taro balls, wild boar sausages.",
        location: "Shenkeng Old Street (深坑老街), New Taipei City",
        transit: "Grab Uber or taxi from Taipei Zoo entrance — about 15 min, NT$200–300.",
        tips: "The grilled version here is genuinely different and much more approachable than the fried night-market kind. Give it a try.",
        checklist: [
          { label: "Try grilled stinky tofu", done: false, order: 0 },
          { label: "Sweet tofu ice cream", done: false, order: 1 },
          { label: "Taro balls", done: false, order: 2 },
        ],
      },
      {
        order: 2, time: "3:00 PM", emoji: "🏨",
        title: "Return to Hotel — Freshen Up",
        description: "Zoo and Shenkeng are both entirely outdoors. May humidity is intense. Taxi back to shower, cool off, and change into nice clothes for dinner.",
        location: "amba Taipei Songshan",
        transit: "Taxi or Uber from Shenkeng back to hotel (~20 min)",
        tips: "Give yourself enough time to get fully ready — this is a Michelin dinner.",
        checklist: [
          { label: "Shower and change", done: false, order: 0 },
          { label: "Nice clothes for dinner", done: false, order: 1 },
        ],
      },
      {
        order: 3, time: "5:00 PM", emoji: "🏮",
        title: "Raohe Night Market — Round 2",
        description: "Back to Raohe for more Michelin Bib Gourmand snacks! Compare notes on what you tried on Day 1 and knock out anything you missed.",
        location: "Raohe Street Night Market, Songshan District",
        transit: "3-minute walk from hotel",
        tips: "Great time for photos at the iconic red entrance gate with the evening lights on.",
        checklist: [
          { label: "Finish the Michelin list from Day 1", done: false, order: 0 },
          { label: "Photo at the red entrance gate", done: false, order: 1 },
        ],
      },
      {
        order: 4, time: "6:00 PM", emoji: "📸",
        title: "Photoshoot — Luna",
        description: "Session with Luna. Meet outside Songshan MRT Station, Exit 5 at 6 PM.",
        location: "Songshan MRT Station, Exit 5 → Raohe Street Night Market",
        transit: "Hotel elevator down to Songshan MRT — 1 min walk to Exit 5.",
        tips: "Be at Exit 5 at 6 PM sharp.",
        realOnly: true,
        checklist: [
          { label: "Meet Luna at Songshan MRT Exit 5 at 6 PM", done: false, order: 0 },
        ],
      },
    ],
  },

  // ── DAY 4 ──────────────────────────────────────────────────────────────────
  {
    dayNum: 4, order: 4,
    date: "Sunday, May 17",
    label: "Day 4",
    focus: "Nature Day — Bambi Land + Evening Night Market Choice",
    notes: "Leave Luodong by 3:16 PM to avoid Sunday evening rush back to Taipei.",
    events: [
      {
        order: 0, time: "9:37 AM", emoji: "🚆",
        title: "Train to Luodong — Songshan Station",
        description: "Reserved seats on TRA Express. Enjoy the coastal views on the way.",
        location: "Songshan TRA Station (台鐵松山站) — different from MRT Songshan Station",
        transit: "Take the hotel elevator down to Songshan MRT Station. Walk or short taxi to Songshan TRA Station (~5 min). Board TRA Express to Luodong. Ride ~1h.",
        tips: "Tickets are on Mitch's app. TRA (Taiwan Railways) is different from MRT — it's the national rail. Songshan TRA Station is a short walk from the MRT station.",
        checklist: [
          { label: "Confirm TRA tickets on app", done: false, order: 0 },
          { label: "Get to Songshan TRA Station by 9:20 AM", done: false, order: 1 },
        ],
      },
      {
        order: 1, time: "10:30 AM", emoji: "🦌",
        title: "Bambi Land (斑比山丘)",
        description: "Sika deer and capybaras. Use this time for nature photography before the afternoon heat peaks.",
        location: "Bambi Land (斑比山丘), Luodong, Yilan County",
        transit: "Taxi or Uber from Luodong TRA Station — about 10 min.",
        tips: "Go early before the heat. Deer are usually fed in the morning and are more active.",
        checklist: [
          { label: "Feed the sika deer", done: false, order: 0 },
          { label: "Photos with capybaras", done: false, order: 1 },
        ],
      },
      {
        order: 2, time: "1:00 PM", emoji: "🌿",
        title: "Luodong Hit List (Choose One)",
        description: "Option A: Forestry Culture Park near the station — industrial/vintage train photos. Option B: Local scallion pancake + cafe to cool off.",
        location: "Luodong, Yilan County",
        transit: "Walk or short taxi from Bambi Land",
        tips: "Forestry Culture Park is beautiful and photogenic if you want more content. Cafe option if you're hot and tired.",
        checklist: [],
      },
      {
        order: 3, time: "3:16 PM", emoji: "🚆",
        title: "Express Train Back to Taipei",
        description: "Catch the 3:16 PM express — arrives Songshan ~4:34 PM. Avoids Sunday evening rush.",
        location: "Luodong TRA Station",
        transit: "TRA Express Luodong → Songshan, ~1h 20m. Tickets on Mitch's app.",
        tips: "Do NOT miss this train. The next trains fill up with people returning to Taipei for the work week.",
        checklist: [
          { label: "Board 3:16 PM TRA Express", done: false, order: 0 },
        ],
      },
      {
        order: 4, time: "5:00 PM", emoji: "🚿",
        title: "Reset at Hotel",
        description: "Drop bags, shower, recharge camera batteries.",
        location: "amba Taipei Songshan",
        transit: "Walk from Songshan MRT (connected to hotel)",
        tips: "",
        checklist: [
          { label: "Recharge all camera batteries", done: false, order: 0 },
        ],
      },
      {
        order: 5, time: "6:30 PM", emoji: "🌃",
        title: "Evening — Choose Your Night Market",
        description: "Choice 1: Ningxia Night Market — concentrated food tour. Choice 2: Shilin Night Market — Harajuku-scale experience + claw machines. Choice 3: CityLink Songshan mall (attached to hotel) if low energy.",
        location: "Ningxia Night Market / Shilin Night Market / CityLink Songshan",
        transit: "Ningxia: MRT Green Line → Zhongshan, then walk. Shilin: MRT Red Line to Jiantan Station. CityLink: in the hotel building.",
        tips: "Shilin is the biggest in Taiwan — overwhelming in the best way. Ningxia is smaller and more food-focused.",
        checklist: [],
      },
    ],
  },
];
