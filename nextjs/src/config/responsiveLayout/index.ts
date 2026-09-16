/**
 * Breakpoint-specific decorative layout config.
 *
 * One file per breakpoint (see ./mobile.ts, ./tablet.ts, ./desktop.ts, ./wide.ts).
 * Interfaces and constants live in ./types.ts and ./shared.ts.
 *
 * Current coverage:
 * - ForestFooter: signs, raccoon, foreground grass, banner scene sizing
 * - HomeShell: side tree page-height scale/crop, visible side-gutter width,
 *   and manual section slots
 * - DraggableWoodpecker: woodpecker anchor near the Experience section
 */
import { DESKTOP_SCENE_LAYOUT } from "./desktop";
import { MOBILE_SCENE_LAYOUT } from "./mobile";
import { TABLET_SCENE_LAYOUT } from "./tablet";
import {
  RESPONSIVE_BREAKPOINT_MIN_WIDTH,
  type ResponsiveBreakpoint,
  type ResponsiveSceneLayout,
} from "./types";
import { WIDE_SCENE_LAYOUT } from "./wide";

export * from "./types";

export const RESPONSIVE_SCENE_LAYOUT: Record<ResponsiveBreakpoint, ResponsiveSceneLayout> = {
  mobile: MOBILE_SCENE_LAYOUT,
  tablet: TABLET_SCENE_LAYOUT,
  desktop: DESKTOP_SCENE_LAYOUT,
  wide: WIDE_SCENE_LAYOUT,
};

export function getResponsiveBreakpoint(widthPx: number): ResponsiveBreakpoint {
  if (widthPx >= RESPONSIVE_BREAKPOINT_MIN_WIDTH.wide) return "wide";
  if (widthPx >= RESPONSIVE_BREAKPOINT_MIN_WIDTH.desktop) return "desktop";
  if (widthPx >= RESPONSIVE_BREAKPOINT_MIN_WIDTH.tablet) return "tablet";
  return "mobile";
}
