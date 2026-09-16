// src/config/projectorRaccoons.ts
// ─────────────────────────────────────────────────────────────────────────────
// PROJECTOR RACCOON SCENE KNOBS
//
// Intended for the future Projects-section GLB scene:
//   /models/projector_raccoon_scene.glb
//
// This file lets the runtime spin each individual raccoon independently. The
// objectName values should match the Blender object/group names in the exported
// GLB. Existing imported asset note: the source file is `/models/racoon.glb`
// with one “c”.
//
// Runtime axis convention is THREE.JS / glTF, not Blender authoring space:
//   x = left/right, y = up, z = depth. For a turntable spin, use [0, 1, 0].
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectorRaccoonId =
  | "imported-left-01"
  | "imported-left-02"
  | "imported-left-03"
  | "custom-right-01"
  | "custom-right-02";

export type ProjectorRaccoonSide = "left" | "right";
export type ProjectorRaccoonSource = "imported-racoon-glb" | "custom-blender";
export type SpinDirection = 1 | -1;

export type RaccoonSpinConfig = {
  /** Master per-raccoon switch. Global switch below must also be enabled. */
  enabled: boolean;
  /** Runtime/local rotation axis. [0, 1, 0] = vertical turntable spin. */
  axis: readonly [number, number, number];
  /** Easy-to-tune speed. 30 = one full turn every 12 seconds. */
  speedDegPerSecond: number;
  /** 1 = clockwise from above, -1 = counter-clockwise from above. */
  direction: SpinDirection;
  /** Starting offset so all raccoons do not line up identically. */
  phaseDeg: number;
};

export type ProjectorRaccoonModelConfig = {
  id: ProjectorRaccoonId;
  /** Must match the Blender object/group name in projector_raccoon_scene.glb. */
  objectName: string;
  label: string;
  side: ProjectorRaccoonSide;
  source: ProjectorRaccoonSource;
  spin: RaccoonSpinConfig;
};

export const PROJECTOR_RACCOON_SCENE_MODEL_URL = "/models/projector_raccoon_scene.glb";
export const IMPORTED_RACOON_MODEL_URL = "/models/racoon.glb";

export const PROJECTOR_RACCOON_SPIN_GLOBAL = {
  enabled: true,
  masterSpeedMultiplier: 1,
  /** Respect prefers-reduced-motion in the eventual React scene. */
  pauseWhenReducedMotion: true,
} as const;

export const PROJECTOR_RACCOON_MODELS = [
  {
    id: "imported-left-01",
    objectName: "ImportedRacoon_Left_01",
    label: "Imported left raccoon 1",
    side: "left",
    source: "imported-racoon-glb",
    spin: {
      enabled: true,
      axis: [0, 1, 0],
      speedDegPerSecond: 24,
      direction: 1,
      phaseDeg: 0,
    },
  },
  {
    id: "imported-left-02",
    objectName: "ImportedRacoon_Left_02",
    label: "Imported left raccoon 2",
    side: "left",
    source: "imported-racoon-glb",
    spin: {
      enabled: true,
      axis: [0, 1, 0],
      speedDegPerSecond: 18,
      direction: -1,
      phaseDeg: 120,
    },
  },
  {
    id: "imported-left-03",
    objectName: "ImportedRacoon_Left_03",
    label: "Imported left raccoon 3",
    side: "left",
    source: "imported-racoon-glb",
    spin: {
      enabled: true,
      axis: [1, 1, 0],
      speedDegPerSecond: 15,
      direction: 1,
      phaseDeg: 240,
    },
  },
  {
    id: "custom-right-01",
    objectName: "CustomRaccoon_Right_01",
    label: "Custom right raccoon 1",
    side: "right",
    source: "custom-blender",
    spin: {
      enabled: true,
      axis: [0, 1, 0],
      speedDegPerSecond: 22,
      direction: -1,
      phaseDeg: 60,
    },
  },
  {
    id: "custom-right-02",
    objectName: "CustomRaccoon_Right_02",
    label: "Custom right raccoon 2",
    side: "right",
    source: "custom-blender",
    spin: {
      enabled: true,
      axis: [0, 1, 0],
      speedDegPerSecond: 20,
      direction: 1,
      phaseDeg: 180,
    },
  },
] as const satisfies readonly ProjectorRaccoonModelConfig[];

export const PROJECTOR_RACCOON_SPIN_OBJECT_NAMES = PROJECTOR_RACCOON_MODELS.map(
  (raccoon) => raccoon.objectName
);

// ─────────────────────────────────────────────────────────────────────────────
// PER-OBJECT TRANSFORM OVERRIDES (for /models/projector_raccoon_scene.glb)
//
// Offsets are ADDED on top of the transforms authored in Blender, so leaving a
// field undefined = no change. Axis convention is three.js / glTF:
//   +x right, +y up, +z toward the camera.
// Rotation is Euler XYZ in degrees. Scale is a uniform multiplier.
//
// To reposition or turn one raccoon or the projector, tweak the entry below
// and reload. If you want to move the whole scene, do it in Blender + re-export
// — this is only for per-piece fine-tuning without going back to Blender.
// ─────────────────────────────────────────────────────────────────────────────

export type SceneObjectTransformConfig = {
  /** Node name inside the GLB. Must match a top-level or nested object name. */
  objectName: string;
  label: string;
  positionOffset?: readonly [number, number, number];
  rotationOffsetDeg?: readonly [number, number, number];
  scaleMultiplier?: number;
};

export const PROJECTOR_SCENE_OBJECT_TRANSFORMS: readonly SceneObjectTransformConfig[] = [
  {
    objectName: "Racoon_Projectionist_rig",
    label: "Top-left raccoon on BigBranch_Left (SitWatch_ArmsLap)",
  },
  {
    objectName: "Racoon_Popcorn_rig",
    label: "Front-bottom raccoon on LowBranch_B, holding popcorn bucket (Idle_Popcorn)",
  },
  {
    objectName: "Racoon_Hanging_rig",
    label: "Right-side raccoon hanging upside down from BigBranch_Right (Idle_Hanging)",
  },
  {
    objectName: "Racoon_PopcornB_rig",
    label: "Mid raccoon on BigBranch_Left (SitWatch_ArmsCrossed)",
  },
  {
    objectName: "Racoon_PopcornC_rig",
    label: "Highest raccoon on BigBranch_Left, far left (SitWatch_HeadScratch)",
  },
  {
    objectName: "Racoon_Sitter_A_rig",
    label: "Raccoon on MidBranch_Center (SitWatch_ArmsDown)",
  },
  {
    objectName: "Racoon_Sitter_B_rig",
    label: "Raccoon on LowBranch_A, left half (SitWatch_LeanForward)",
  },
  {
    objectName: "Racoon_Sitter_C_rig",
    label: "Raccoon on LowBranch_A, right half (SitWatch_HandsBehindHead)",
  },
  {
    objectName: "BigBranch_Left",
    label: "Big branch entering from the left, holds most watchers",
  },
  {
    objectName: "BigBranch_Right",
    label: "Big branch entering from the right, in front of TV, holds ropes & hanging raccoon",
  },
  {
    objectName: "LowBranch_A",
    label: "Mid-low horizontal branch on the left",
  },
  {
    objectName: "LowBranch_B",
    label: "Ground-level log at the front",
  },
  {
    objectName: "MidBranch_Center",
    label: "Central mid-height branch",
  },
  {
    objectName: "TV_Rope_L",
    label: "Left rope suspending the TV from the big-right branch",
  },
  {
    objectName: "TV_Rope_R",
    label: "Right rope suspending the TV from the big-right branch",
  },
  {
    objectName: "TV",
    label: "Whole TV set (body + antenna + knobs, moves together)",
  },
  {
    objectName: "TV_Body",
    label: "TV body / cabinet",
  },
  {
    objectName: "TV_Antenna",
    label: "TV antenna arms",
  },
];

export function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function getRaccoonSpinRadiansPerSecond(spin: RaccoonSpinConfig) {
  return degreesToRadians(spin.speedDegPerSecond) * spin.direction;
}
