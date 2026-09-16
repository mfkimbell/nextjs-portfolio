import type { ResponsiveSceneLayout } from "./types";
import {
  FOOTER_BUTTERFLY_LAYERS,
  FOOTER_DEPTHS,
  MOBILE_HOME_SECTIONS,
  SIDE_TREE_SHARED,
  WOODPECKER_DEFAULT,
  footerGrassLayers,
} from "./shared";

export const MOBILE_SCENE_LAYOUT: ResponsiveSceneLayout = {
  footer: {
    bottomPaddingPct: 0,
    signs: {
      widthPct: 18,
      leftPctBySign: [4, 25, 46],
      bottomPctBySign: [4, 6, 4],
    },
    raccoon: { widthPct: 22, bottomOffsetPct: 0 },
    grassLayers: footerGrassLayers(65),
    depths: FOOTER_DEPTHS,
    butterflies: FOOTER_BUTTERFLY_LAYERS,
    billboard: {
      widthPct: 95,
      leftPct: 50,
      bottomPct: 0,
      drawings: { topPct: 4, leftPct: 20, rightPct: 20 },
    },
  },
  leftTree: {
    ...SIDE_TREE_SHARED,
    // ─── Tune these two ───────────────────────────
    treeVisiblePeekPx: 126,
    contentOverlapIntoTreePx: 92,
    // ──────────────────────────────────────────────
  },
  woodpecker: { ...WOODPECKER_DEFAULT },
  sections: MOBILE_HOME_SECTIONS,
};
