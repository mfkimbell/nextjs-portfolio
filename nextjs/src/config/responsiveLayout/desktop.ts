import type { ResponsiveSceneLayout } from "./types";
import {
  FOOTER_BUTTERFLY_LAYERS,
  DESKTOP_HOME_SECTIONS,
  FOOTER_DEPTHS,
  SIDE_TREE_SHARED,
  WOODPECKER_DEFAULT,
  footerGrassLayers,
} from "./shared";

export const DESKTOP_SCENE_LAYOUT: ResponsiveSceneLayout = {
  footer: {
    bottomPaddingPct: 0,
    signs: {
      widthPct: 9,
      leftPctBySign: [8, 21, 34],
      bottomPctBySign: [4, 6, 4],
    },
    raccoon: { widthPct: 22, bottomOffsetPct: 0 },
    grassLayers: footerGrassLayers(85),
    depths: FOOTER_DEPTHS,
    butterflies: FOOTER_BUTTERFLY_LAYERS,
    billboard: {
      widthPct: 45,
      leftPct: 50,
      bottomPct: 0,
      drawings: { topPct: 4, leftPct: 20, rightPct: 20 },
    },
  },
  leftTree: {
    ...SIDE_TREE_SHARED,
    // ─── Tune these two ───────────────────────────
    treeVisiblePeekPx: 126,
    contentOverlapIntoTreePx: 72,
    // ──────────────────────────────────────────────
  },
  woodpecker: { ...WOODPECKER_DEFAULT },
  sections: DESKTOP_HOME_SECTIONS,
};
