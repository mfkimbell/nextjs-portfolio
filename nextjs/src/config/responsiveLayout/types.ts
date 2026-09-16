export type ResponsiveBreakpoint = "mobile" | "tablet" | "desktop" | "wide";

export const RESPONSIVE_BREAKPOINT_MIN_WIDTH = {
  mobile: 0,
  tablet: 640,
  desktop: 1024,
  wide: 1440,
} as const;

export interface FooterSignsLayout {
  /** Width of each sign as a percentage of the footer banner width. */
  widthPct: number;
  /** Left edge of sign1/sign2/sign3 as percentages of the footer banner width. */
  leftPctBySign: readonly [number, number, number];
  /** Bottom edge of sign1/sign2/sign3 as percentages of the footer banner height. */
  bottomPctBySign: readonly [number, number, number];
}

export interface FooterRaccoonLayout {
  /** Width of the raccoon as a % of the billboard width. */
  widthPct: number;
  /** Optional vertical offset above the billboard's top edge, as a % of the raccoon's own height. Positive = float up, negative = sink into billboard. Defaults to 0 (raccoon's feet sit on billboard top). */
  bottomOffsetPct?: number;
}

export interface ContactBillboardLayout {
  /** Width of the billboard as a % of the scene width. */
  widthPct: number;
  /** Where the billboard center sits horizontally, as a % of viewport width (50 = viewport center). Nudge above/below 50 to visually compensate for asymmetric decorations (e.g. the left tree). */
  leftPct: number;
  /** Space below the billboard as a % of the footer width. 0 = sign starts at the bottom of the site; increase to lift it upward. */
  bottomPct: number;
  /**
   * Where the pinned drawings row sits over the billboard's top wood plank.
   * Values are % of the billboard's own height.
   */
  drawings: {
    topPct: number;
    leftPct: number;
    rightPct: number;
  };
}

export interface FooterSceneLayout {
  /**
   * Extra footer space below everything, as a % of the footer width. Keep at 0
   * when the contact sign should start at the bottom of the site.
   */
  bottomPaddingPct: number;
  signs: FooterSignsLayout;
  raccoon: FooterRaccoonLayout;
  grassLayers: readonly FooterGrassLayerLayout[];
  depths: FooterDepthLayout;
  butterflies: readonly FooterButterflyLayerLayout[];
  billboard: ContactBillboardLayout;
}

export interface ForegroundGrassLayout {
  src: string;
  /** Width of the rendered grass image as a % of the footer scene width. Increase this to make the grass wider/larger. */
  widthPct: number;
  /** Left edge of the rendered grass image as a % of the footer scene width. */
  leftPct: number;
  /** Optional right inset as a % of the scene width. Use with leftPct to squish the strip in from the right. Overrides widthPct when set. */
  rightPct?: number;
  /** Height of the visible crop window as a % of the scene height. Increase this to reveal more vertical grass. */
  heightPct: number;
  /** Optional shift up from the scene bottom, as % of the scene height. Defaults to 0. */
  bottomOffsetPct?: number;
  /** Height of the grass image as a % of the strip's height. Defaults to 100 (fills vertically). Lower values shrink the image toward the bottom of the strip. */
  tileHeightPct?: number;
  /** Width of the grass image as a % of the strip's width. Defaults to 100 (fills horizontally). */
  tileWidthPct?: number;
}

export interface FooterGrassLayerLayout {
  src: string;
  /** Numeric grass depth: 0 is closest/front, higher numbers are farther/back. Objects with depths between two layer values render between those grass images. */
  depth: number;
  /** Viewport-relative width. This intentionally ignores side tree/content gutters. */
  widthPct: number;
  /** Horizontal nudge in vw from viewport center. */
  xOffsetVw?: number;
  /** Height of the layer window as a % of the footer height. */
  heightPct: number;
  /** Optional shift up from the footer bottom, as % of the footer height. */
  bottomOffsetPct?: number;
  /** Height of the layer image as a % of the layer window. */
  tileHeightPct?: number;
  /** Width of the layer image as a % of the layer window. */
  tileWidthPct?: number;
}

export interface FooterDepthLayout {
  /** Side tree depth relative to numbered grass layers. 0 is closest/front, higher numbers are farther/back. */
  treesDepth: number;
  /** Contact sign + 3D bulletin board depth relative to numbered grass layers. 0 is closest/front, higher numbers are farther/back. */
  billboardDepth: number;
  /** Raccoon depth relative to numbered grass layers. 0 is closest/front, higher numbers are farther/back. */
  raccoonDepth: number;
}

export interface FooterButterflyLayerLayout {
  /** DOM/grass layer depth. 0 is closest/front; higher numbers are farther/back. */
  layerDepth: number;
  /** R3F z/depth value inside that layer's transparent canvas. */
  sceneDepth: number;
  count: number;
  seed: number;
  /** Smaller ranges feel farther back; larger ranges feel closer/front. */
  scaleMin: number;
  scaleMax: number;
}

/**
 * Left/right side tree gutter config. Applied to both trees (mirrored).
 *
 * The two knobs you tune per breakpoint are `treeVisiblePeekPx` and
 * `contentOverlapIntoTreePx` — see comments below. Everything else is native
 * asset info that stays the same across breakpoints.
 */
export interface LeftTreeLayout {
  /** Native pixel width of public/fauna/left_tree.png and right_tree.png. Used to preserve aspect ratio when scaling to page height. */
  nativeWidthPx: number;
  /** Native pixel height of the tree PNG. */
  nativeHeightPx: number;
  /** Used briefly before the page height has been measured on the client. */
  fallbackWidthPx: number;
  /** Native transparent padding on the inner (content-facing) edge of the tree PNG before drawn artwork begins. Constant per asset — do not tweak unless the PNGs change. */
  transparentEdgeInsetPx: number;

  // ─── The two per-breakpoint knobs ────────────────────────────────────────
  /**
   * How many px of DRAWN tree artwork peeks into the viewport from each side.
   * Increase to show more tree; decrease to show less.
   */
  treeVisiblePeekPx: number;
  /**
   * How many px the page content is allowed to overlap into the tree strip.
   * The outer portion of the strip is transparent (~`transparentEdgeInsetPx`
   * once scaled), so content can safely overlap up to that width without
   * touching the drawn tree.
   */
  contentOverlapIntoTreePx: number;
  // ─────────────────────────────────────────────────────────────────────────

  topOffsetPx: number;
  bottomOffsetPx: number;
}

export interface WoodpeckerAnchorLayout {
  xPx: number;
  experienceSectionOffsetYPx: number;
  fallbackYPx: number;
  minYPx: number;
}

export type SectionFrameAlign = "start" | "center" | "end";

export interface HomeSectionFrameLayout {
  /** Manual per-breakpoint floor for this section's vertical slot. */
  minHeightPx?: number;
  marginTopPx?: number;
  marginBottomPx?: number;
  /** Where the existing section component sits inside the vertical slot. */
  align?: SectionFrameAlign;
}

export interface HomeSectionsLayout {
  talkToTheBirds: HomeSectionFrameLayout;
  experience: HomeSectionFrameLayout;
  skills: HomeSectionFrameLayout;
  projects: HomeSectionFrameLayout;
  contact: HomeSectionFrameLayout;
}

export interface ResponsiveSceneLayout {
  footer: FooterSceneLayout;
  leftTree: LeftTreeLayout;
  woodpecker: WoodpeckerAnchorLayout;
  sections: HomeSectionsLayout;
}
