// src/config/toucan.ts
// ─────────────────────────────────────────────────────────────────────────────
// TOUCAN SETTINGS
//
// TWO birds live here. Each has its own placement, head tracking and beak
// settings, so they move completely independently.
// Edit a number, save, hot-reload. Angles are in DEGREES (converted to radians
// internally) because degrees are easier to reason about.
//
// THE IMPORTANT ONE IS `FACING`.
// A toucan's beak is long and only reads side-on. Pointed straight at the
// camera it's completely foreshortened, and opening the jaw looks like an
// orange bib flopping onto its chest. FACING turns the bird so the beak runs
// across the frame. 0 = staring down the lens (bad), 90 = full profile.
// The two birds have opposite FACING so they angle toward each other.
// ─────────────────────────────────────────────────────────────────────────────

/** Everything ToucanGLB needs to place and animate one bird. */
export interface BirdSettings {
  readonly MODEL: string;
  readonly FACING: number;
  readonly SCALE: number;
  readonly POSITION: readonly [number, number, number];
  readonly LOOK: {
    readonly ENABLED: boolean;
    readonly YAW_RANGE: number;
    readonly PITCH_RANGE: number;
    readonly REST_YAW: number;
    readonly REST_PITCH: number;
    readonly TRAVEL_X: number;
    readonly TRAVEL_Y: number;
    readonly HEAD_HEIGHT_FRAC: number;
    readonly EASING: number;
    readonly FLIP_X: boolean;
    readonly FLIP_Y: boolean;
  };
  readonly BEAK: {
    readonly ENABLED: boolean;
    readonly SPEED: number;
  };
  readonly TALK: {
    readonly ENABLED: boolean;
    readonly EXCITED_LEVEL: number;
    readonly EXCITED_HYSTERESIS: number;
    readonly LEVEL_SMOOTHING: number;
    readonly FADE_IN: number;
    readonly FADE_OUT: number;
    readonly THROAT_GAIN: number;
  };
  readonly BREATH: {
    readonly ENABLED: boolean;
    readonly RATE: number;
    readonly DEPTH: number;
    readonly BASE: number;
    readonly PHASE: number;
  };
  /** Arrival flight. Omit to have the bird simply start perched. */
  readonly ENTRANCE?: {
    readonly ENABLED: boolean;
    /** World-space offset the bird starts at, relative to its perch. */
    readonly FROM: readonly [number, number, number];
    /** Seconds before this bird sets off. Stagger the two. */
    readonly DELAY: number;
    /** Seconds spent cruising in ACT_fly_loop before the approach begins. */
    readonly FLY_TIME: number;
  };
  readonly IDLE: {
    readonly ENABLED: boolean;
    readonly SACCADE_MS: number;
    readonly HOLD_MIN: number;
    readonly HOLD_MAX: number;
    readonly YAW_SPREAD: number;
    readonly PITCH_SPREAD: number;
    readonly BIG_LOOK_CHANCE: number;
    readonly BIG_LOOK_MULT: number;
    readonly START_DELAY: number;
  };
  /** Optional: bird 2 may omit this and fall back to bird 1's cadence. */
  readonly BREAKS?: {
    readonly ENABLED: boolean;
    readonly MIN_GAP: number;
    readonly MAX_GAP: number;
    readonly FIRST_DELAY: number;
    /** Keys are clip names in toucan_rerig.glb. Relative, need not sum to 1. */
    readonly WEIGHTS: Readonly<Record<OneShotClip, number>>;
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIPS — what lives in /models/toucan_rerig.glb
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The always-on body layer. Body only — no head, no beak.
 *
 * The quiet clip is the one to use: its Body stays under 0.7° for the whole
 * loop and spends most of it parked, because continuous body sway is exactly
 * what made the birds read as fake. Life is supposed to come from the
 * one-shots below, NOT from raising this clip's amplitude.
 *
 * The enhanced clip is the older, rockier version (Body 1.84°, Tail 3.71°),
 * kept only as a fallback in case the asset is ever rolled back.
 */
export const CLIP_IDLE_BODY_QUIET = "ACT_idle_body_quiet_8s";
export const CLIP_IDLE_BODY_FALLBACK = "ACT_idle_body_enhanced_8s";

export const CLIP_TALK_SOFT = "ACT_talk_soft_rerigged";
export const CLIP_TALK_EXCITED = "ACT_talk_excited_rerigged";

/**
 * Arrival sequence, played once on mount. These are NOT one-shots — they run
 * in a fixed order and must never be fired by the random scheduler.
 *
 * The clips only animate the bird in place: wingbeats, body attitude, braking,
 * feet, landing crouch. All world travel is a parent <group> the component
 * moves, so the flight path lives in React and the GLB stays reusable.
 */
export const CLIP_FLY_LOOP = "ACT_fly_loop";
export const CLIP_LAND_APPROACH = "ACT_land_approach";
export const CLIP_LAND_SETTLE = "ACT_land_settle";

/**
 * Fired at random between utterances. This is where the visible life lives.
 *
 * The wing clips here drive the real wing appendages via WingRoot → WingMid →
 * WingTip, on the ROLL axis (wing swings outward off the flank; left positive,
 * right negative).
 *
 * RETIRED: ACT_idle_wing_flutter and ACT_idle_wing_settle. They drive the old
 * Wing_L/Wing_R flank deformers, which barely change the silhouette from this
 * camera angle and read as body swelling rather than wing movement. Both still
 * exist in the GLB and keep CLIP_BONES entries, so either is one line from
 * returning — but mixing wing systems makes the motion read muddy.
 */
export const ONE_SHOTS = [
  "ACT_idle_wing_extract_flutter",
  "ACT_idle_rouse_extract_wings",
  "ACT_idle_wing_extract_settle",
  "ACT_idle_wing_extract_tuck",
  "ACT_idle_perch_flap",
  "ACT_idle_crouch_settle",
  "ACT_idle_rouse_flap",
  "ACT_idle_body_puff",
  "ACT_idle_foot_shift",
  "ACT_idle_preen_chest_rerigged",
  "ACT_idle_yawn",
] as const;
export type OneShotClip = (typeof ONE_SHOTS)[number];

/**
 * One-shots whose readability depends on Body translation. These duck the
 * always-on idle harder (see IDLE_DUCK below) and drive the body_puff morph.
 */
export const BODY_TRAVEL_CLIPS: readonly string[] = [
  "ACT_idle_perch_flap",
  "ACT_idle_rouse_flap",
  "ACT_idle_crouch_settle",
];

/**
 * One-shots that raise the body_puff morph while they play, and how strongly.
 *
 * The wings are separate appendages weighted only to wing bones, so they do not
 * follow body_puff at all — a full-strength puff inflates the torso underneath
 * wings that stay put. The model rouse clip already bakes a reduced puff curve
 * (peak 0.60), so it sits at full runtime strength here. Drop this entry if the
 * torso still looks like it's inflating under the wings.
 */
export const PUFF_CLIPS: Readonly<Record<string, number>> = {
  ACT_idle_perch_flap: 0.85,
  ACT_idle_rouse_flap: 0.85,
  ACT_idle_rouse_rerigged: 0.85,
  ACT_idle_body_puff: 0.85,
  ACT_idle_rouse_extract_wings: 0.85,
};

/**
 * Which bones each clip is allowed to drive.
 *
 * Blender force-sampled the export, so EVERY clip carries a track for every
 * bone — including flat rest-valued ones. Played raw, a talk clip's flat Head
 * track pins the head and kills mouse tracking. Anything not listed here is
 * stripped before the clip reaches the mixer.
 *
 * Head/LowerBeak/UpperBeak are deliberately absent from the body clips: the
 * head is procedural (see the tracking + saccade code in ToucanGLB) and the
 * beak belongs to the talk layer.
 */
export const CLIP_BONES: Readonly<Record<string, readonly string[]>> = {
  [CLIP_IDLE_BODY_QUIET]: ["Body", "Chest", "Tail", "Wing_L", "Wing_R"],
  [CLIP_IDLE_BODY_FALLBACK]: ["Body", "Chest", "Tail", "Wing_L", "Wing_R", "Foot_L", "Foot_R"],
  ACT_idle_wing_flutter: ["Body", "Chest", "Tail", "Wing_L", "Wing_R"],
  ACT_idle_crouch_settle: ["Body", "Chest", "Tail", "Wing_L", "Wing_R", "Foot_L", "Foot_R"],
  ACT_idle_perch_flap: ["Body", "Chest", "Tail", "Wing_L", "Wing_R", "Foot_L", "Foot_R"],
  ACT_idle_rouse_flap: ["Body", "Chest", "Tail", "Wing_L", "Wing_R", "Foot_L", "Foot_R"],

  // Wing-model clips. These drive the real wing appendages through
  // WingRoot -> WingMid -> WingTip, and deliberately do NOT list Wing_L/Wing_R:
  // the old flank deformers cover the same region of torso and would drag the
  // body around underneath the wing.
  ACT_idle_wing_extract_settle: [
    "Body", "Chest", "Tail",
    "WingRoot_L", "WingMid_L", "WingTip_L", "WingRoot_R", "WingMid_R", "WingTip_R",
  ],
  ACT_idle_wing_extract_flutter: [
    "Body", "Chest", "Tail",
    "WingRoot_L", "WingMid_L", "WingTip_L", "WingRoot_R", "WingMid_R", "WingTip_R",
  ],
  ACT_idle_wing_extract_tuck: [
    "Body", "Chest", "Tail",
    "WingRoot_L", "WingMid_L", "WingTip_L", "WingRoot_R", "WingMid_R", "WingTip_R",
  ],
  ACT_idle_rouse_extract_wings: [
    "Body", "Chest", "Tail",
    "WingRoot_L", "WingMid_L", "WingTip_L", "WingRoot_R", "WingMid_R", "WingTip_R",
    "Foot_L", "Foot_R",
  ],
  [CLIP_TALK_SOFT]: ["LowerBeak", "UpperBeak", "Chest"],
  [CLIP_TALK_EXCITED]: ["LowerBeak", "UpperBeak", "Chest", "Tail", "Wing_L", "Wing_R"],
  ACT_idle_wing_settle: ["Wing_L", "Wing_R", "Body", "Tail"],
  ACT_idle_rouse_rerigged: ["Body", "Wing_L", "Wing_R", "Tail", "Chest"],
  ACT_idle_body_puff: ["Body", "Chest", "Wing_L", "Wing_R", "Tail"],
  ACT_idle_foot_shift: ["Body", "Tail", "Foot_L", "Foot_R", "Chest"],
  // The only two that own the head. Procedural tracking is suppressed while
  // either plays, otherwise the clip and the mouse fight over the same bone.
  ACT_idle_preen_chest_rerigged: [
    "Head", "LowerBeak", "UpperBeak", "Body", "Wing_L", "Wing_R", "Tail", "Chest",
  ],
  ACT_idle_yawn: ["Head", "LowerBeak", "UpperBeak"],

  // Arrival clips. Head is absent on purpose — procedural tracking is
  // suppressed during the flight, not overridden by a baked track.
  [CLIP_FLY_LOOP]: [
    "Body", "Chest", "Tail",
    "WingRoot_L", "WingMid_L", "WingTip_L", "WingRoot_R", "WingMid_R", "WingTip_R",
    "Foot_L", "Foot_R",
  ],
  [CLIP_LAND_APPROACH]: [
    "Body", "Chest", "Tail",
    "WingRoot_L", "WingMid_L", "WingTip_L", "WingRoot_R", "WingMid_R", "WingTip_R",
    "Foot_L", "Foot_R",
  ],
  [CLIP_LAND_SETTLE]: [
    "Body", "Chest", "Tail",
    "WingRoot_L", "WingMid_L", "WingTip_L", "WingRoot_R", "WingMid_R", "WingTip_R",
    "Foot_L", "Foot_R",
  ],
};

/**
 * Position tracks we deliberately let through, per clip.
 *
 * Most position tracks in the GLB are force-sampled padding sitting at the
 * rest value, so the filter drops position by default. These three are real:
 * they move `Body` vertically, and because Foot_L/Foot_R are ROOT bones that
 * don't inherit Body, that compresses or extends the legs against planted feet
 * instead of sliding the whole bird through the perch.
 *
 * This is the load-bearing part of the flap clips, not a garnish — wing
 * rotation is nearly invisible from the app's camera angle, so the vertical
 * travel is what actually reads. Drop an entry here and the clip doesn't
 * error, it quietly degrades into a weak rotation-only wobble. The dev audit
 * in lib/toucanClips.ts catches exactly that.
 */
export const CLIP_POSITION_BONES: Readonly<Record<string, readonly string[]>> = {
  ACT_idle_crouch_settle: ["Body"], // 0.016 down
  ACT_idle_perch_flap: ["Body"], // ±0.011, crouch then spring up
  ACT_idle_rouse_flap: ["Body"], // ±0.012
  // The flight clips tuck the feet by TRANSLATING them 42 mm, because there
  // are no leg or ankle bones — Foot_L/R are root bones and rotating them only
  // spins the foot in place. Drop these two entries and the feet stay planted
  // in mid-air while the bird flies.
  [CLIP_FLY_LOOP]: ["Foot_L", "Foot_R"],
  [CLIP_LAND_APPROACH]: ["Foot_L", "Foot_R"],
  [CLIP_LAND_SETTLE]: ["Body"], // 16 mm landing crouch
};

/**
 * Motion we knowingly throw away, so the dev-time clip audit stays quiet about
 * it and stays loud about everything else.
 *
 * Head is dropped from the talk and rouse clips because head life is
 * procedural — mouse tracking plus saccades — and a baked Head track would
 * override it. Body is dropped from the excited talk clip because the body
 * idle loop is already writing Body; two clips on one bone average each other,
 * which dilutes both. If you want the excited lean back, add "Body" to that
 * clip's CLIP_BONES entry and remove it here.
 */
export const INTENTIONAL_DROPS: Readonly<Record<string, readonly string[]>> = {
  [CLIP_TALK_SOFT]: ["Head"],
  [CLIP_TALK_EXCITED]: ["Head", "Body"],
  ACT_idle_rouse_rerigged: ["Head"],
};

/**
 * How far the always-on body idle is ducked while a one-shot plays.
 *
 * The mixer AVERAGES clips writing the same bone, so at equal weight a one-shot
 * sharing Body/Tail/Wings with the idle comes out roughly halved. The clips
 * built on Body translation get ducked hardest — their vertical pop is the
 * whole point and must not be averaged away.
 */
export const IDLE_DUCK = {
  BODY_TRAVEL: 0.1,
  DEFAULT: 0.2,
} as const;

/**
 * DEV ONLY. Set to a clip name to fire it on a loop instead of waiting on the
 * random scheduler. Ignored in production builds.
 *
 * >>> CURRENTLY ON, for eyeballing the new wing appendages. <<<
 * Set back to null to restore normal randomised idle behaviour.
 */
export const DEBUG_FORCE_ONE_SHOT: string | null = "ACT_idle_wing_extract_flutter";

/** Seconds of rest between forced repeats. 0 = back-to-back, no pause. */
export const DEBUG_FORCE_INTERVAL = 0;

/** Clips that drive Head, so procedural head tracking must yield to them. */
export const HEAD_OWNING_CLIPS: readonly string[] = [
  "ACT_idle_preen_chest_rerigged",
  "ACT_idle_yawn",
];

/**
 * The three morph targets are driven procedurally, not by the baked morph
 * tracks. glTF packs all three weights into ONE track, so two overlapping
 * clips would average each other's weights to mush — and driving throat_pulse
 * from live mic RMS beats any baked curve anyway.
 */
export const MORPHS = {
  BODY_PUFF: "body_puff",
  CHEST_BREATH: "chest_breath",
  THROAT_PULSE: "throat_pulse",
} as const;

/**
 * This asset has REAL wing appendages — new geometry, not the flank deformers
 * or cut-out torso patches the earlier models shipped with.
 *
 * Four earlier attempts all failed the same way, and the history is worth
 * keeping because each failure mode is easy to walk back into:
 *
 *   1. Wing_L/Wing_R flank deformers — broad soft weights on the torso. Barely
 *      changed the silhouette from this camera (0.5%) and read as body
 *      swelling. Still in the GLB, still retired.
 *   2. Cutting the wing out of the body via UV islands, hinged at a point.
 *      The upper-rear edge peeled off the back like a sticker.
 *   3. Same cut, hinged along the dorsal edge. Better, but still a flap of
 *      torso surface tethered to the body.
 *   4. All of the above rotated on PITCH, chosen because it maximised measured
 *      silhouette change. That metric counts changed pixels, not plausible
 *      motion — pitch scored high precisely BECAUSE it swings the wing up and
 *      forward over the spine, where a wing cannot go.
 *
 * The fix was NOT to model a replacement wing. Several attempts at that failed
 * the same way — an invented shell never matched the original silhouette, and
 * every version read as a slab, a blob or a fin bolted to the side.
 *
 * The model already had a good folded wing: the two 58-face UV islands. So the
 * wing is EXTRACTED, not authored. WingModel_L/R are duplicates of those exact
 * islands — original vertex positions, original UVs, original material — given
 * a thin backing skin and their own bone chain. The body's copy is recessed
 * 13 mm behind them, tapering to zero at the shared perimeter so the shell
 * stays watertight and no seam opens.
 *
 * That is why the rest pose matches the original: the wing IS the original
 * wing. Proof is in the exported UVs — WingModel_L spans u[0.511,0.689]
 * v[0.618,0.923], exactly the original left island's UV bounds.
 *
 * The body's copy was then deleted outright, and the hole closed with a patch
 * fitted to the surrounding torso: 16-vertex boundary loop, two interior rings
 * and a centre, every interior point placed ON a locally-fitted body surface
 * and inset only 3 mm. UVs pinned to a black texel, weighted to Body/Tail only.
 *
 * The first attempt at that patch was a triangle fan with its centre pushed
 * 22 mm inward. It looked fine at rest because the wing covered it, but it was
 * a socket — mean 11.6 mm below the surrounding torso, max 40.4 mm — and the
 * moment the wing lifted you saw straight into a cave. The fitted version sits
 * at mean +1.75 mm with 24 of 480 verts past 8 mm.
 *
 * Which is the standing rule for this area: the body has to look right with
 * the wing HIDDEN or LIFTED, never merely hidden behind it. Check the flap-peak
 * render, not the rest pose.
 *
 * The final asset settled the two remaining faults, both of which had been
 * reported fixed prematurely on the strength of ordinary renders:
 *
 *   The shell was crumpled because it was generated by sampling the body mesh
 *   with a max-over-nearest-neighbours query — a discontinuous function that
 *   jumped up to 44 mm between adjacent points. It is now lofted from a cubic
 *   fit sampled once, so it is smooth by construction.
 *
 *   The torso still carried the original raised wing outline, reading as a
 *   second wing beneath the new one. Proven by isolation render, then fixed by
 *   projecting the old island onto a reference built from non-island geometry
 *   and relaxing a region wider than the island so no step is left at its
 *   border. Verts standing >8 mm proud went 250/348 -> 0/348.
 *
 * THE ACCEPTANCE TEST IS THE EXPORTED FILE, NOT THE BLENDER SCENE.
 *
 * Every torso fix before this one silently failed to export. The body mesh
 * carries shape keys, and on a mesh with shape keys Blender uses the Basis key
 * for display and export — edits written to `mesh.vertices[].co` are ignored
 * completely. 884 corrected vertices sat in the base mesh doing nothing while
 * every render and every in-Blender measurement showed the original geometry.
 * It was only caught by hashing ToucanMesh POSITION in the exported GLB and
 * finding it byte-identical to the untouched rerig export.
 *
 * So: edit shape_keys.key_blocks["Basis"], shift the other keys by the same
 * delta to preserve their morph offsets, and verify by diffing the exported
 * binary against a known-good file. An in-Blender render proves nothing.
 *
 * The pass after that overcorrected in the opposite direction. The old wing
 * island IS the widest part of the bird — its bulge is the shoulder mass — so
 * projecting it onto its narrower neighbours (belly, back) removed half the
 * torso: body width fell 28.7% on average and 49.7% at the chest, leaving a
 * skinny slab. What actually reads as a duplicate wing is only the RELIEF, the
 * crease at the island outline. Current asset therefore smooths that crease,
 * restores the regional mean so volume is kept, and caps per-vertex movement
 * at 5 mm: width is now within 3.7% of the original. The wing covers the rest.
 *
 * Body-width-vs-original is a standing regression check. Measure it whenever
 * the torso is touched.
 *
 * Wing lift is ROLL on WingRoot -> WingMid -> WingTip. Do not use pitch.
 */
const MODEL_PATH = "/models/toucan_wing_fly_land_v2.glb";

/* ═══════════════════════════════════════════════════════════════════════════
   BIRD 1 — the left-hand toucan
   ═══════════════════════════════════════════════════════════════════════════ */
export const toucanConfig = {
  MODEL: MODEL_PATH,

  /* ── how the bird is presented ────────────────────────────────────────── */
  FACING: 55, // degrees turned away from the camera. 40–70 all read well.
  SCALE: 3.6, // overall size
  // POSITION[1] measured by raycasting the feet onto the bough (0.025 sink,
  // so the claws grip the bark instead of floating).
  POSITION: [-4, -0.598, 0] as [number, number, number], // x, y (up), z

  /* ── head tracking ────────────────────────────────────────────────────── */
  // The head turns on top of FACING; it does not replace it.
  LOOK: {
    ENABLED: true,
    YAW_RANGE: 26, // degrees of left/right the neck may turn
    PITCH_RANGE: 14, // degrees of up/down
    REST_YAW: 0, // resting offset; 0 = looks straight along FACING
    REST_PITCH: 0,
    // Mouse travel (px) needed to reach the limits above. Bigger = the head
    // eases toward the cursor across the page instead of snapping to the stop.
    TRAVEL_X: 700,
    TRAVEL_Y: 520,
    HEAD_HEIGHT_FRAC: 0.34, // where the head sits in the canvas, 0=top 1=bottom
    EASING: 0.1, // 0.05 = slow and floaty, 0.3 = snappy
    FLIP_X: false, // true if it turns away from the cursor
    FLIP_Y: false, // true if it looks down when the cursor is up
  },

  /* ── beak ─────────────────────────────────────────────────────────────── */
  BEAK: {
    ENABLED: true, // false = beak stays shut (useful when debugging pose)
    SPEED: 1.0, // 1 = as authored, 1.5 = chattier, 0.6 = slower
  },

  /* ── talking ──────────────────────────────────────────────────────────── */
  // The beak no longer runs on a loop. It only moves while the agent is
  // actually producing audio, which is the single biggest realism win here —
  // a bird that chatters into silence reads as broken no matter how good the
  // rig is.
  TALK: {
    ENABLED: true,
    EXCITED_LEVEL: 0.075, // smoothed RMS above which the excited clip is used
    EXCITED_HYSTERESIS: 0.025, // must fall this far below before dropping back
    LEVEL_SMOOTHING: 0.12, // 0 = frozen, 1 = raw and jittery
    FADE_IN: 0.12, // seconds
    FADE_OUT: 0.28, // slower out, so the beak closes rather than snapping shut
    THROAT_GAIN: 7.0, // RMS -> throat_pulse morph
  },

  /* ── breathing ────────────────────────────────────────────────────────── */
  // Drives the chest_breath morph directly. Deliberately not baked into the
  // idle clip: overlapping clips would fight over the shared morph track.
  BREATH: {
    ENABLED: true,
    RATE: 0.42, // cycles per second
    DEPTH: 0.35,
    BASE: 0.12,
    PHASE: 0.0, // offset so the two birds never inhale together
  },

  /* ── arrival ──────────────────────────────────────────────────────────── */
  // Flies in from off the left edge and lands on the bough. FROM is in world
  // units relative to this bird's POSITION, so it is independent of where the
  // bird ends up perching.
  ENTRANCE: {
    ENABLED: true,
    FROM: [-6.5, 2.2, 1.4] as [number, number, number],
    DELAY: 0.35,
    FLY_TIME: 1.5,
  },

  /* ── idle ─────────────────────────────────────────────────────────────── */
  // A PERCHED bird idle is rotational saccades: the head snaps to a new angle
  // in 2–3 frames, then holds dead still for a second or three. Real birds hold
  // ~80–90% of the time. There is deliberately NO body translation — these two
  // are gripping bark, not hovering, and a vertical bob reads as floating.
  // The snap is interpolated LINEARLY on purpose; easing it is the single
  // biggest tell of a fake bird.
  IDLE: {
    ENABLED: true,
    SACCADE_MS: 80, // snap duration. ~2–3 frames at 30fps. Don't raise much.
    HOLD_MIN: 0.45, // seconds of stillness between snaps
    HOLD_MAX: 1.8, // randomised hold is what stops it looking mechanical
    YAW_SPREAD: 9, // degrees either side of where it's already looking
    PITCH_SPREAD: 5,
    BIG_LOOK_CHANCE: 0.18, // now and then, a wider glance around
    BIG_LOOK_MULT: 2.6,
    START_DELAY: 0.0, // offsets the first snap so two birds never sync
  },

  /* ── idle breaks ──────────────────────────────────────────────────────── */
  // One-shot behaviours fired between saccades, the way shipped bird assets do
  // it (a quiet base loop plus interrupt clips on a randomised timer).
  // Weighting follows the reference: quick comfort motions common, full preen
  // bouts rare and longer. Saccades are suppressed while a break runs — a bird
  // mid-preen isn't also glancing around.
  // Fires more often than before, because the base idle is now nearly still.
  // These one-shots ARE the bird's visible life — if it feels dead, raise the
  // frequency here rather than the amplitude of the idle loop.
  BREAKS: {
    ENABLED: true,
    // Tightened from 4–9s. Part of why the wing motion felt absent was simply
    // cadence: across ten clips, any one of them only surfaced every ~20–40s.
    MIN_GAP: 2.5,
    MAX_GAP: 5.5,
    FIRST_DELAY: 3.0, // don't fire one the instant the page loads
    // Relative weights, dominated by the real-wing clips. The head-owning pair
    // stay rare: they suspend mouse tracking for their whole duration, so
    // firing them often makes the birds feel unresponsive.
    WEIGHTS: {
      ACT_idle_wing_extract_flutter: 0.3,
      ACT_idle_rouse_extract_wings: 0.19,
      ACT_idle_wing_extract_settle: 0.13,
      ACT_idle_wing_extract_tuck: 0.08,
      ACT_idle_perch_flap: 0.09,
      ACT_idle_crouch_settle: 0.07,
      ACT_idle_rouse_flap: 0.05,
      ACT_idle_body_puff: 0.04,
      ACT_idle_foot_shift: 0.025,
      ACT_idle_preen_chest_rerigged: 0.01,
      ACT_idle_yawn: 0.005,
    },
  },

  /* ── scene-level (shared by both birds) ───────────────────────────────── */
  // Camera distance. Smaller = closer / bigger birds.
  CAMERA_Z: 4.7,

  /* ── the branch they perch on ─────────────────────────────────────────── */
  // Positioned so the top of the bough sits directly under bird 1's feet.
  // If you change a bird's SCALE or POSITION, nudge its POSITION[1] to re-seat
  // the feet on the bark.
  BRANCH: {
    SHOW: true,
    SCALE: 0.75, // the bough runs off both edges of the frame
    POSITION: [-3.55, -0.516, -0.3] as [number, number, number],
    YAW: 1, // degrees, so it runs diagonally across the frame

    /* Foliage wind. Applied in a vertex shader on the LEAF mesh only.
       The wood deliberately stays rock still: the toucans are perched on it
       with no link to its transform, so any bough movement would slide the
       branch out from under their feet. */
    WIND: {
      ENABLED: true,
      /** Displacement in local units at a fully-free leaf tip. */
      AMPLITUDE: 0.055,
      /** Multiplier on time. 1 = a slow, steady breeze. */
      SPEED: 1.0,
    },
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   BIRD 2 — perched to the right of bird 1, angled back toward it
   Shares the same rerigged model as bird 1 (one download, one GPU upload, two
   cloned skeletons). Everything that makes them read as separate birds now
   lives in the numbers below: scale, facing, beak speed, breath rate and
   phase, saccade cadence, and break timing.
   ═══════════════════════════════════════════════════════════════════════════ */
export const toucan2Config = {
  MODEL: MODEL_PATH,

  FACING: -55, // mirror of bird 1: turned back toward it, front still to camera
  SCALE: 3.3, // slightly smaller — reads as a different bird, adds depth
  // x/z put it on bare bark (past x ≈ -1.9 the bough is under the canopy), and
  // POSITION[1] is raycast-measured so the claws grip. At this spacing the two
  // beaks come within 0.14 without intersecting.
  POSITION: [-2.25, -0.528, -0.3] as [number, number, number],

  LOOK: {
    ENABLED: true,
    YAW_RANGE: 22,
    PITCH_RANGE: 12,
    REST_YAW: 0,
    REST_PITCH: 0,
    TRAVEL_X: 760, // tracks a touch lazier than bird 1
    TRAVEL_Y: 560,
    HEAD_HEIGHT_FRAC: 0.36,
    EASING: 0.075, // slower ease, so the two heads never move in lockstep
    FLIP_X: false,
    FLIP_Y: false,
  },

  BEAK: {
    ENABLED: true,
    // Both birds now share one model, so the old trick of shipping two GLBs
    // with different loop lengths is gone. This is what keeps their speech out
    // of sync instead: bird 2 talks slightly faster.
    SPEED: 1.12,
  },

  TALK: {
    ENABLED: true,
    EXCITED_LEVEL: 0.068, // gets animated a touch more readily than bird 1
    EXCITED_HYSTERESIS: 0.025,
    LEVEL_SMOOTHING: 0.14,
    FADE_IN: 0.1,
    FADE_OUT: 0.26,
    THROAT_GAIN: 7.5,
  },

  BREATH: {
    ENABLED: true,
    RATE: 0.37, // slower than bird 1, and phase-offset, so they never breathe together
    DEPTH: 0.32,
    BASE: 0.1,
    PHASE: 2.1,
  },

  // Arrives second from the opposite side, slightly higher/further back, so
  // the two landings read as separate events rather than one synchronised pair.
  ENTRANCE: {
    ENABLED: true,
    FROM: [7.2, 2.8, 1.9] as [number, number, number],
    DELAY: 1.15,
    FLY_TIME: 1.7,
  },

  // Twitchier than bird 1 — shorter holds, slightly wider glances — plus a
  // START_DELAY so their first snaps never coincide.
  IDLE: {
    ENABLED: true,
    SACCADE_MS: 70,
    HOLD_MIN: 0.35,
    HOLD_MAX: 1.5,
    YAW_SPREAD: 11,
    PITCH_SPREAD: 6,
    BIG_LOOK_CHANCE: 0.22,
    BIG_LOOK_MULT: 2.4,
    START_DELAY: 1.3,
  },

  // Offset gaps from bird 1 so the two never fire breaks in unison.
  BREAKS: {
    ENABLED: true,
    MIN_GAP: 2.2,
    MAX_GAP: 5.0,
    FIRST_DELAY: 6.5,
    WEIGHTS: {
      ACT_idle_wing_extract_flutter: 0.27,
      ACT_idle_rouse_extract_wings: 0.21,
      ACT_idle_wing_extract_settle: 0.13,
      ACT_idle_wing_extract_tuck: 0.09,
      ACT_idle_perch_flap: 0.08,
      ACT_idle_crouch_settle: 0.07,
      ACT_idle_rouse_flap: 0.06,
      ACT_idle_body_puff: 0.04,
      ACT_idle_foot_shift: 0.03,
      ACT_idle_preen_chest_rerigged: 0.01,
      ACT_idle_yawn: 0.005,
    },
  },
} as const;

export type ToucanConfig = typeof toucanConfig;
