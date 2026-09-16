import type { ResponsiveSceneLayout } from "./types";
import {
  FOOTER_BUTTERFLY_LAYERS,
  FOOTER_DEPTHS,
  SIDE_TREE_SHARED,
  WIDE_HOME_SECTIONS,
  WOODPECKER_DEFAULT,
  footerGrassLayers,
} from "./shared";

export const WIDE_SCENE_LAYOUT: ResponsiveSceneLayout = {
  footer: {
    bottomPaddingPct: 0,
    signs: {
      widthPct: 6,
      leftPctBySign: [8, 20, 32],
      bottomPctBySign: [4, 6, 4],
    },
    raccoon: { widthPct: 22, bottomOffsetPct: 0 },
    grassLayers: footerGrassLayers(80),
    depths: FOOTER_DEPTHS,
    butterflies: FOOTER_BUTTERFLY_LAYERS,
    billboard: {
      widthPct: 34,
      leftPct: 50,
      bottomPct: 0,
      drawings: { topPct: 4, leftPct: 20, rightPct: 20 },
    },
  },
  leftTree: {
    ...SIDE_TREE_SHARED,
    // ─── Tune these two ───────────────────────────
    treeVisiblePeekPx: 196,
    contentOverlapIntoTreePx: 102,
    // ──────────────────────────────────────────────
  },
  woodpecker: { ...WOODPECKER_DEFAULT },
  sections: WIDE_HOME_SECTIONS,
};
