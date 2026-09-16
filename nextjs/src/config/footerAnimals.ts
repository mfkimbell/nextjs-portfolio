import type { ResponsiveBreakpoint } from "@/config/responsiveLayout";

export type FooterAnimalId = "bunny" | "bunnySmall" | "deer";

/**
 * Optional peek behavior — the animal periodically slides out from behind
 * a nearby occluder (e.g. the bulletin board) and back. Times are seconds
 * and the total is used as the CSS animation duration.
 */
export type FooterAnimalPeek = {
  /** How long the animal stays hidden (behind the occluder) each cycle. */
  hiddenSec: number;
  /** How long the slide-out takes. */
  slideOutSec: number;
  /** How long the animal stays visible/peeked. */
  holdSec: number;
  /** How long the slide-back takes. */
  slideBackSec: number;
  /**
   * Translate in the direction the animal peeks. Positive values move to the
   * peek side, expressed as % of the animal's own width. e.g. anchor:left with
   * translatePct: -100 means the animal slides its full width to the left.
   */
  translatePct: number;
};
export type FooterAnimalAnchor = "left" | "right";

export type FooterAnimalBreakpointPlacement = {
  /** Offset from the selected side of the bulletin wrapper, as %. Negative moves outward. */
  sideOffsetPct: number;
  /** Offset from the bottom of the bulletin wrapper, as %. Negative sinks into grass. */
  bottomPct: number;
  widthPct: number;
  heightPct: number;
};

export type FooterAnimalShadowCatcher = {
  /** World-space center of the shadow-receiver plane. Should sit behind the
   *  animal (negative z) at roughly the bulletin's projected world location. */
  position: readonly [number, number, number];
  /** Width x Height of the plane. Size to cover the bulletin's world footprint. */
  size: readonly [number, number];
  /** 0..1 shadow darkness. */
  opacity?: number;
  /** Light position — silhouette-style shadow wants the light in front of the
   *  animal, roughly along the camera axis (positive z). */
  lightPosition?: readonly [number, number, number];
};

export type FooterAnimalConfig = {
  id: FooterAnimalId;
  enabled: boolean;
  modelUrl: string;
  animationName?: string;
  /** Seconds into the clip to start at. Use to desync copies of the same clip. */
  animationTimeOffset?: number;
  /** Playback rate. 1 = normal. Slightly-off values keep two copies from re-syncing. */
  animationTimeScale?: number;
  anchor: FooterAnimalAnchor;
  minWidthPx: number;
  /** Depth in the same 1..13 grass-depth system as footer.depths. */
  depth: number;
  /**
   * Optional second GLB rendered at the same position/scale/camera but at its
   * own depth. Use for animals that have been split in Blender into a front
   * and a back part so the two halves can slot in front of / behind different
   * grass layers. The two GLBs must share a coordinate system so they visually
   * re-attach when rendered stacked.
   */
  backModelUrl?: string;
  /** Depth for the `backModelUrl` half. Required if backModelUrl is set. */
  backDepth?: number;
  cameraFov: number;
  /**
   * When true, render at the footer's top level (sibling of butterflies) with
   * `inset-0`, so the canvas gets the full footer height. Tall models like the
   * deer need this so their head/antlers aren't clipped by the billboard div.
   */
  fullFooter?: boolean;
  /**
   * When present, enables real R3F shadow-mapping for this animal. The animal
   * casts its silhouette onto a receiver plane positioned at the bulletin's
   * world location; the plane is otherwise transparent so the shadow alpha-
   * composites onto the bulletin behind the canvas.
   */
  shadowCatcher?: FooterAnimalShadowCatcher;
  /** Optional peek-in/peek-out cycle. Applied as a CSS transform animation on the animal's outer div. */
  peek?: FooterAnimalPeek;
  /**
   * When true, the animal's canvas rect is clickable. Clicking triggers a
   * one-shot play of `clickAnimationName` (or the first non-idle clip in the
   * GLB) and fades back to idle. Do NOT enable this on `fullFooter: true`
   * animals whose canvas covers unrelated UI — the canvas rect will
   * block underlying clicks.
   */
  interactive?: boolean;
  /**
   * Optional explicit name of the click clip in the GLB. If omitted, the
   * component picks the first clip whose name differs from `animationName`.
   */
  clickAnimationName?: string;
  /**
   * When true, the click clip plays once and clamps at its final frame; the
   * animal does not return to idle. Use for terminal poses like "sit / lie
   * down" where springing back to the grazing idle would look wrong.
   */
  clickHoldsFinalFrame?: boolean;
  /**
   * For `fullFooter: true` animals only. A transparent overlay button rendered
   * at these percent-of-footer coords absorbs clicks; needed because the
   * animal's canvas is `inset-0` and can't be made pointer-events-auto
   * without blocking the bulletin buttons below it. Tune to the animal's
   * on-screen visual bbox.
   */
  clickHitbox?: {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
  };
  scene: {
    position: readonly [number, number, number];
    /** Euler XYZ in degrees, for easier hand tuning. */
    rotationDeg: readonly [number, number, number];
    scale: number;
  };
  placement: Record<ResponsiveBreakpoint, FooterAnimalBreakpointPlacement>;
};

const NON_MOBILE_BUNNY = {
  sideOffsetPct: -24,
  bottomPct: -5,
  widthPct: 38,
  heightPct: 44,
} as const;

const NON_MOBILE_DEER = {
  sideOffsetPct: -24,
  bottomPct: -5,
  widthPct: 38,
  heightPct: 48,
} as const;

const NON_MOBILE_BUNNY_SMALL = {
  // Half the size of the big bunny (38/44). Positioned so the canvas straddles
  // the bulletin's left edge — the Blender-baked PeekIdle animation swings the
  // bunny's body from behind the edge (hidden) out into view (peek) and back.
  sideOffsetPct: 2,
  bottomPct: -2,
  widthPct: 19,
  heightPct: 22,
} as const;

export const FOOTER_ANIMALS = [
  {
    id: "bunny",
    enabled: true,
    modelUrl: "/models/bunny.glb",
    animationName: "Armature.001|Idle",
    // Available clips in bunny.glb: Idle, Run, Die. Die = lying down.
    clickAnimationName: "Armature.001|Die",
    anchor: "left",
    minWidthPx: 120,
    depth: 5.5,
    cameraFov: 40,
    fullFooter: false,
    interactive: true,
    // Scoped hitbox around the visible bunny mesh (percent of the canvas rect).
    // Keeps the rest of the canvas pointer-events-none so the bulletin buttons
    // that sit under the canvas's right edge stay clickable.
    clickHitbox: { leftPct: 35, topPct: 55, widthPct: 45, heightPct: 40 },
    scene: {
      position: [.2, -1.-0, 0],
      rotationDeg: [0, 0, 0],
      scale: .5,
    },
    placement: {
      mobile: { sideOffsetPct: -8, bottomPct: -5, widthPct: 34, heightPct: 38 },
      tablet: NON_MOBILE_BUNNY,
      desktop: NON_MOBILE_BUNNY,
      wide: NON_MOBILE_BUNNY,
    },
  },
  {
    id: "bunnySmall",
    enabled: true,
    modelUrl: "/models/bunny.glb",
    animationName: "Armature.001|Idle",
    clickAnimationName: "Armature.001|Die",
    anchor: "left",
    minWidthPx: 60,
    depth: 1.5,
    cameraFov: 40,
    fullFooter: false,
    interactive: true,
    // Hitbox is percent-of-canvas. Canvas is -12% to 7% of the bulletin wrapper;
    // we cap widthPct so the right edge of the hitbox lands at ~0% of the
    // wrapper — right at the bulletin's left edge, without crossing it.
    // (0 - -12) / 19 = 63.2% of canvas from the left.
    clickHitbox: { leftPct: 30, topPct: 50, widthPct: 33, heightPct: 45 },
    scene: {
      position: [0.2, -1, 0],
      rotationDeg: [0, 0, 0],
      scale: 0.5,
    },
    placement: {
      mobile: { sideOffsetPct: -4, bottomPct: -2, widthPct: 19, heightPct: 22 },
      tablet: NON_MOBILE_BUNNY_SMALL,
      desktop: NON_MOBILE_BUNNY_SMALL,
      wide: NON_MOBILE_BUNNY_SMALL,
    },
  },
  {
    id: "deer",
    enabled: true,
    modelUrl: "/models/deer_front.glb",
    animationName: "Armature|Eat",
    // New Sit clip baked in Blender: counter-rotates _rootJoint by -68° X
    // over 30 frames while playing the Die pose keyframes, so the outer
    // React rotation [68, -7, 10] cancels out and the deer visually settles
    // into a lying-down pose instead of face-planting.
    clickAnimationName: "Armature|Sit",
    clickHoldsFinalFrame: true,
    interactive: true,
    // Deer canvas is inset-0 of the FOOTER (fullFooter), so hitbox coords are
    // percent-of-footer. Deer visually renders on the right side; keep the
    // hitbox tight to the deer so it doesn't cover the bulletin's right edge
    // (bulletin extends roughly to 82% of viewport at desktop).
    clickHitbox: { leftPct: 82, topPct: 30, widthPct: 15, heightPct: 55 },
    anchor: "right",
    minWidthPx: 130,
    depth: 1.5,
    backModelUrl: "/models/deer_back.glb",
    backDepth: 6.5,
    cameraFov: 60,
    fullFooter: true,
    shadowCatcher: {
      // Behind the deer at z=-1, sized to roughly cover the bulletin footprint
      // at that depth. Tune position.y and size to align the shadow with the
      // bulletin's screen location.
      position: [0, 1.0, -1],
      size: [7, 3.5],
      opacity: 0.45,
      // Light in front of the deer along the camera axis — shadow becomes
      // roughly the deer's silhouette from the camera's POV.
      lightPosition: [0, 1, 12],
    },
    scene: {
      position: [2.4, -2.8, 0],
      rotationDeg: [68, -7 , 10],
      scale: 1.35,
    },
    placement: {
      mobile: { sideOffsetPct: -8, bottomPct: -5, widthPct: 34, heightPct: 42 },
      tablet: NON_MOBILE_DEER,
      desktop: NON_MOBILE_DEER,
      wide: NON_MOBILE_DEER,
    },
  },
] as const satisfies readonly FooterAnimalConfig[];

export function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function rotationDegreesToRadians(
  rotationDeg: readonly [number, number, number]
): [number, number, number] {
  return [
    degreesToRadians(rotationDeg[0]),
    degreesToRadians(rotationDeg[1]),
    degreesToRadians(rotationDeg[2]),
  ];
}
