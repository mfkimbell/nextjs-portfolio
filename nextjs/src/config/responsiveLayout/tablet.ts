import type { ResponsiveSceneLayout } from "./types";
import {
  FOOTER_BUTTERFLY_LAYERS,
  FOOTER_DEPTHS,
  SIDE_TREE_SHARED,
  TABLET_HOME_SECTIONS,
  WOODPECKER_DEFAULT,
  footerGrassLayers,
} from "./shared";

export const TABLET_SCENE_LAYOUT: ResponsiveSceneLayout = {
  footer: {
    bottomPaddingPct: 0,
    signs: {
      widthPct: 12,
      leftPctBySign: [7, 22, 37],
      bottomPctBySign: [4, 6, 4],
    },
    raccoon: { widthPct: 22, bottomOffsetPct: 0 },
    grassLayers: footerGrassLayers(72),
    depths: FOOTER_DEPTHS,
    butterflies: FOOTER_BUTTERFLY_LAYERS,
    billboard: {
      widthPct: 68,
      leftPct: 50,
      bottomPct: 0,
      drawings: { topPct: 4, leftPct: 20, rightPct: 20 },
    },
  },
  leftTree: {
    ...SIDE_TREE_SHARED,
    // ─── Tune these two ───────────────────────────
    treeVisiblePeekPx: 96,
    contentOverlapIntoTreePx: 72,
    // ──────────────────────────────────────────────
  },
  woodpecker: { ...WOODPECKER_DEFAULT },
  sections: TABLET_HOME_SECTIONS,
};
