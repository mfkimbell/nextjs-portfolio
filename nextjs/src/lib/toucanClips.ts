// lib/toucanClips.ts
//
// The rerigged toucan was exported from Blender with force sampling on. That
// was the right call — it's what prevents the rest-pose offset bug that used to
// leave the beak a full radian open — but it has a consequence:
//
//   EVERY clip carries a track for EVERY bone, on all three of translation,
//   rotation and scale, even when the value never changes from rest.
//
// So `ACT_talk_soft_rerigged` ships a flat Head track. Play it raw and the
// mixer pins the head to rest, and mouse tracking silently stops working. Same
// for the flat beak tracks in the body idle clip: they'd clamp the beak shut
// underneath the talk layer.
//
// Everything here exists to strip a clip down to the tracks it actually needs
// before it ever reaches the AnimationMixer.

import * as THREE from "three";

/** `Wing_L.quaternion` -> `Wing_L`, `Toucan.morphTargetInfluences` -> `Toucan` */
const targetOf = (trackName: string) => trackName.split(".")[0];

/** `Wing_L.quaternion` -> `quaternion` */
const propertyOf = (trackName: string) => trackName.split(".").slice(1).join(".");

/**
 * Build a clip containing only the tracks it's allowed to drive.
 *
 * Rotation: kept for bones in `allowedBones`.
 *
 * Position: dropped by default, and kept ONLY for bones explicitly listed in
 * `allowedPositionBones`. Almost every position track in the asset is
 * rest-valued sampling padding, but not all of them — ACT_idle_crouch_settle
 * genuinely animates Body.position to compress the bird against its planted
 * feet. Blanket-dropping position would silently turn that crouch into a lean.
 *
 * Scale: always dropped. Nothing in the rig scales.
 *
 * Morph tracks: always dropped. glTF packs all three morph weights into a
 * single interleaved track, so two overlapping clips would each write all
 * three and average one another into mush. Morphs are driven procedurally
 * instead (see ToucanGLB), which also lets throat_pulse follow live mic RMS
 * rather than a baked guess.
 */
export function filterClip(
  clip: THREE.AnimationClip,
  allowedBones: readonly string[],
  allowedPositionBones: readonly string[] = []
): THREE.AnimationClip {
  const rot = new Set(allowedBones);
  const pos = new Set(allowedPositionBones);
  const tracks = clip.tracks.filter((t) => {
    const prop = propertyOf(t.name);
    const bone = targetOf(t.name);
    if (prop === "quaternion") return rot.has(bone);
    if (prop === "position") return pos.has(bone);
    return false; // scale, morphTargetInfluences, anything else
  });
  const out = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  out.blendMode = clip.blendMode;
  return out;
}

/**
 * Filter a whole library at once.
 *
 * Clips with no entry in `boneMap` are dropped rather than passed through — an
 * unfiltered clip is exactly the failure mode this module exists to prevent, so
 * silently allowing one through would defeat the point.
 */
export function filterClips(
  clips: THREE.AnimationClip[],
  boneMap: Readonly<Record<string, readonly string[]>>,
  positionMap: Readonly<Record<string, readonly string[]>> = {}
): THREE.AnimationClip[] {
  return clips
    .filter((c) => boneMap[c.name] !== undefined)
    .map((c) => filterClip(c, boneMap[c.name], positionMap[c.name] ?? []));
}

/**
 * Names of every bone a clip actually moves on the given property, ignoring
 * flat rest-valued tracks. Only used by the dev-time sanity check below.
 */
function movingBones(
  clip: THREE.AnimationClip,
  property: "quaternion" | "position",
  epsilon = 1e-4
): Set<string> {
  const stride = property === "quaternion" ? 4 : 3;
  const moving = new Set<string>();
  for (const t of clip.tracks) {
    if (propertyOf(t.name) !== property) continue;
    const v = t.values;
    let varies = false;
    for (let i = stride; i < v.length && !varies; i += stride) {
      for (let k = 0; k < stride; k++) {
        if (Math.abs(v[i + k] - v[k]) > epsilon) {
          varies = true;
          break;
        }
      }
    }
    if (varies) moving.add(targetOf(t.name));
  }
  return moving;
}

/**
 * Dev-only. Warns if a clip genuinely animates a bone the filter throws away
 * (motion silently lost) or if the allow-list names a bone that doesn't exist
 * in the asset (typo, or the GLB was re-exported with different bone names).
 */
export function auditClips(
  clips: THREE.AnimationClip[],
  boneMap: Readonly<Record<string, readonly string[]>>,
  intentionalDrops: Readonly<Record<string, readonly string[]>> = {},
  positionMap: Readonly<Record<string, readonly string[]>> = {}
): string[] {
  const problems: string[] = [];
  const present = new Set(clips.map((c) => c.name));

  for (const name of Object.keys(boneMap)) {
    if (!present.has(name)) problems.push(`clip "${name}" is not in the GLB`);
  }

  for (const clip of clips) {
    const allowed = boneMap[clip.name];
    if (!allowed) continue;
    const expected = new Set(intentionalDrops[clip.name] ?? []);
    const dropped = [...movingBones(clip, "quaternion")].filter(
      (b) => !allowed.includes(b) && !expected.has(b)
    );
    if (dropped.length) {
      problems.push(`"${clip.name}" animates ${dropped.join(", ")} but they are filtered out`);
    }

    // The crouch failure mode: it doesn't error without its Body.position
    // track, it just stops being a crouch. Catch that loudly.
    const allowedPos = positionMap[clip.name] ?? [];
    const droppedPos = [...movingBones(clip, "position")].filter((b) => !allowedPos.includes(b));
    if (droppedPos.length) {
      problems.push(
        `"${clip.name}" meaningfully animates ${droppedPos
          .map((b) => `${b}.position`)
          .join(", ")} but position is being dropped — add it to CLIP_POSITION_BONES`
      );
    }

    const known = new Set(clip.tracks.map((t) => targetOf(t.name)));
    const unknown = allowed.filter((b) => !known.has(b));
    if (unknown.length) {
      problems.push(`"${clip.name}" allow-list names missing bones: ${unknown.join(", ")}`);
    }
  }
  return problems;
}
