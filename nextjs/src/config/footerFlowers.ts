// One entry per flower placement. The numeric `id` matches the debug label
// rendered above each flower in the site so you can quickly say "move #3"
// and know which config entry to touch.
//
// - `depth` follows the same convention as grass layers: 1 = closest/front,
//   higher = farther back. Keep flowers < 8 so they render in front of
//   /fauna/8.png and everything behind it.
// - `xPct` / `yPct` are % of the footer element (yPct increases downward).
// - `sizePct` is width as a % of the footer width.

export type FooterFlowerPlacement = {
  id: number;
  src: string;
  xPct: number;
  yPct: number;
  sizePct: number;
  rotationDeg: number;
  flipX?: boolean;
  depth: number;
};

export const FOOTER_FLOWERS: FooterFlowerPlacement[] = [
  {
    id: 2,
    src: "/flowers/253c6c68-be8c-4665-b839-bedea7a441ee.png",
    xPct: 16.03,
    yPct: 95.79,
    sizePct: 3.8,
    rotationDeg: 4,
    depth: 1.5,
  },
  {
    id: 6,
    src: "/flowers/ca8baea7-cc4e-424e-bad1-b13453c09f8b.png",
    xPct: 77.49,
    yPct: 93.91,
    sizePct: 5.3,
    rotationDeg: 6,
    depth: 5.5,
  },
  {
    id: 7,
    src: "/flowers/d0f4a04b-c5ae-4d2e-a22a-30519dcd6089.png",
    xPct: 90.83,
    yPct: 85.31,
    sizePct: 1.5,
    rotationDeg: -8,
    depth: 11.5,
  },
  {
    id: 8,
    src: "/flowers/dc7c35a0-e0e6-4b3a-8cd6-be25373195ba.png",
    xPct: 48.76,
    yPct: 94,
    sizePct: 5.3,
    rotationDeg: 3,
    depth: 2.5,
  },
  {
    id: 9,
    src: "/flowers/253c6c68-be8c-4665-b839-bedea7a441ee.png",
    xPct: 52.66,
    yPct: 92.83,
    sizePct: 2.9,
    rotationDeg: 9,
    depth: 6.5,
  },
  {
    id: 11,
    src: "/flowers/b2e5673a-f8c8-4116-92fa-2a9bd346c76e.png",
    xPct: 21.56,
    yPct: 89.9,
    sizePct: 4,
    rotationDeg: 0,
    depth: 6.5,
  },
];

/** Toggle numbered labels above each flower for tuning. */
export const FOOTER_FLOWERS_SHOW_LABELS = true;
