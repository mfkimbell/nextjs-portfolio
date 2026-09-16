import type {
  FooterButterflyLayerLayout,
  FooterDepthLayout,
  FooterGrassLayerLayout,
  HomeSectionsLayout,
} from "./types";

const FOOTER_GRASS_LAYER_SOURCES = [
  { src: "/fauna/1.png", depth: 1 },
  { src: "/fauna/2.png", depth: 2 },
  { src: "/fauna/3.png", depth: 3 },
  { src: "/fauna/4.png", depth: 4 },
  { src: "/fauna/5.png", depth: 5 },
  { src: "/fauna/6.png", depth: 6 },
  { src: "/fauna/7.png", depth: 7 },
  { src: "/fauna/8.png", depth: 8 },
  { src: "/fauna/9.png", depth: 9 },
  { src: "/fauna/10.png", depth: 10 },
  { src: "/fauna/11.png", depth: 11 },
  { src: "/fauna/12.png", depth: 12 },
  { src: "/fauna/13.png", depth: 13 },
] as const;

export const footerGrassLayers = (
  heightPct: number,
  widthPct: number = 100
): FooterGrassLayerLayout[] =>
  FOOTER_GRASS_LAYER_SOURCES.map((layer) => ({
    ...layer,
    widthPct,
    heightPct,
    bottomOffsetPct: 0,
    tileWidthPct: 100,
    tileHeightPct: 100,
  }));

export const FOOTER_DEPTHS: FooterDepthLayout = {
  // 1 is the closest/front grass layer; higher numbers are farther back.
  // Put the side trees exactly between grass layer 6 and grass layer 7.
  // footerDepthZ(6) = 80, footerDepthZ(6.5) = 75, footerDepthZ(7) = 70.
  treesDepth: 6.5,
  billboardDepth: 2.5,
  raccoonDepth: 5.5,
};

export const FOOTER_BUTTERFLY_LAYERS: FooterButterflyLayerLayout[] = [
  // Small/farther butterflies sit behind more grass.
  { layerDepth: 9.75, sceneDepth: -1.15, count: 6, seed: 71, scaleMin: 0.13, scaleMax: 0.21 },
  { layerDepth: 6.25, sceneDepth: -0.35, count: 5, seed: 171, scaleMin: 0.15, scaleMax: 0.24 },
  // Larger/closer butterflies sit in front of the bulletin board.
  { layerDepth: 0.75, sceneDepth: 0.85, count: 4, seed: 271, scaleMin: 0.18, scaleMax: 0.3 },
];

/**
 * Native asset info shared by every breakpoint's `leftTree` block. Spread this
 * into each breakpoint file so only the per-breakpoint knobs stand out.
 */
export const SIDE_TREE_SHARED = {
  nativeWidthPx: 940,
  nativeHeightPx: 8650,
  fallbackWidthPx: 420,
  transparentEdgeInsetPx: 166,
  topOffsetPx: 0,
  bottomOffsetPx: 0,
} as const;

export const WOODPECKER_DEFAULT = {
  xPx: 12,
  experienceSectionOffsetYPx: 95,
  fallbackYPx: 170,
  minYPx: 64,
} as const;

/**
 * Manual vertical rhythm for the home-page sections. These values are the
 * intended tuning surface for matching content height/spacing to the side-tree
 * artwork without coupling section layout to measured page height.
 */
export const MOBILE_HOME_SECTIONS = {
  talkToTheBirds: { minHeightPx: 620, align: "center" },
  experience: { minHeightPx: 760, align: "center" },
  skills: { minHeightPx: 260, align: "center" },
  projects: { minHeightPx: 760, align: "start", marginTopPx: 12 },
  contact: { minHeightPx: 700, align: "end", marginTopPx: 24 },
} satisfies HomeSectionsLayout;

export const TABLET_HOME_SECTIONS = {
  talkToTheBirds: { minHeightPx: 760, align: "center" },
  experience: { minHeightPx: 860, align: "center" },
  skills: { minHeightPx: 340, align: "center" },
  projects: { minHeightPx: 840, align: "start", marginTopPx: 20 },
  contact: { minHeightPx: 780, align: "end", marginTopPx: 36 },
} satisfies HomeSectionsLayout;

export const DESKTOP_HOME_SECTIONS = {
  talkToTheBirds: { minHeightPx: 840, align: "center" },
  experience: { minHeightPx: 920, align: "center" },
  skills: { minHeightPx: 420, align: "center" },
  projects: { minHeightPx: 980, align: "start", marginTopPx: 24 },
  contact: { minHeightPx: 900, align: "end", marginTopPx: 48 },
} satisfies HomeSectionsLayout;

export const WIDE_HOME_SECTIONS = {
  talkToTheBirds: { minHeightPx: 900, align: "center" },
  experience: { minHeightPx: 980, align: "center" },
  skills: { minHeightPx: 500, align: "center" },
  projects: { minHeightPx: 1040, align: "start", marginTopPx: 32 },
  contact: { minHeightPx: 940, align: "end", marginTopPx: 56 },
} satisfies HomeSectionsLayout;
