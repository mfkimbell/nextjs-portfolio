"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ComponentRef, MutableRefObject, ReactNode, RefObject } from "react";
import IntroFlight from "@/components/scene-lab/IntroFlight";
import SafeAsset from "@/components/scene-lab/SafeAsset";
import { CampCritters, TipOver, RACCOON2_URL, type ActName } from "@/components/scene-lab/CritterActs";
import { TIP_TABLES } from "@/components/scene-lab/tipTables";
import { useComputerPointer, useRetroDesktop, useRetroDesktopTexture, type PcSounds, type PcState } from "@/components/scene-lab/RetroDesktop";
import { pcBeep, pcChirp, pcKey, pcMouseClick, pcPark, pcPawThud, pcSeek, pcWake } from "@/lib/retroPcSounds";
import OnlyBearsBear, { makeOnlyBearsState, type OnlyBearsState, type OnlyBearsTune } from "@/components/scene-lab/OnlyBearsBear";
import { oldBearLookFromConfig, useOldBearLook } from "@/components/scene-lab/oldBear";
import { applyRockingPosture, makePostureState, readRockingPosture, type PostureState, type RockingPosture } from "@/components/scene-lab/rockingPosture";
import {
  applyChairRock, applyLegLock, makeLegLock, readRockMotion, rockAngle, rockPosture, rockState, type LegLock,
} from "@/components/scene-lab/rockingChair";
import { RetroCrtTv, Table, Chair, meleeMenuHit, meleePageBackHit, meleeGridHit, type CrtScreen, type CrtMenu, type CrtPage } from "@/components/scene-lab/CampProps";
import { roles } from "@/lib/experience";
import { projects } from "@/lib/projects";
import { SKILLS, skillIcon } from "@/lib/skills";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Clone, OrbitControls, Stars, useAnimations, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { CampfireSceneConfig, LocationView, ObjectOverride } from "@/components/scene-lab/sceneConfig";
import { defaultLocationView, DEFAULT_CAMPFIRE_CONFIG, DUPLICATE_PREFIX, EMPTY_OVERRIDE, BUG_SWARM_TWEAK_DEFAULTS } from "@/components/scene-lab/sceneConfig";
import type { BugSwarmScope, BugSwarmTweak } from "@/components/scene-lab/sceneConfig";
import banjoBearPoseRaw from "@/config/banjoBearPose.json";
import rockingChairBearPoseRaw from "@/config/rockingChairBearPose.json";
import bearPosesRaw from "@/config/bearPoses.json";
import { useCampsiteAudioLoop, useCampsiteOneShot } from "@/lib/campsiteSounds";
import type { BearVoiceStateRef } from "@/lib/bearVoiceState";
import { clampSpring, stepSpring } from "@/lib/bear-animation";
import { getBanjoFingerPhase } from "@/lib/banjo-performance";

import Matte from "@/components/Matte";
import { rebindMixerRoot } from "@/lib/rebindMixer";
const FIRE_CRACKLING_URL = "/sound/fire_crackling.mp3";
const BANJO_URL_SOUND = "/sound/banjo.mp3";
const CLICK_URL = "/sound/click.wav";
const HOVER_URL = "/sound/hover.wav";
/** Minimum gap between hover-cue plays, so crossing an internal seam
 *  between two meshes of the same named object (see the comment by
 *  handleScenePointerMove) can't replay it. */
const HOVER_SOUND_COOLDOWN_MS = 500;
const BACK_URL = "/sound/back.wav";
const SELECT_URL = "/sound/select.wav";
const FISH_FLOP_URL = "/sound/fish_flop.wav";
const LEFT_BAG_FALL_URL = "/sound/left-bag-fall.mp3";
const RIGHT_BAG_FALL_URL = "/sound/right-bag-fall.mp3";
const FISHING_ROD_FALL_URL = "/sound/fishing-rod-fall-sound.mp3";
const FIRE_WHOOSH_URL = "/sound/fire whoosh.mp3";
/** Minimum gap between fire-click reactions (ember burst + whoosh), so
 *  clicking the campfire repeatedly can't stack them. Doesn't apply to the
 *  fish's own impact - that's already paced by the several-second throw
 *  animation, not a rapid click. */
const FIRE_CLICK_COOLDOWN_MS = 500;
// These two live under /CRT, not /sound - the rest of the CRT asset set
// (cursor, the CRT's own music track) is there too.
const CRT_ZOOM_IN_URL = "/CRT/zoom into CRT.wav";
const CRT_ZOOM_OUT_URL = "/CRT/zoom out of crt.wav";
const CRT_MUSIC_URL = "/sound/CRT music.mp3";
/** CRT_MUSIC's volume multiplier at the two ends of the zoom: quiet while
 *  you're just standing in the arcade panel, lifted once the close-up is
 *  held. CrtFocusCamera eases a 0..1 progress value between them over
 *  exactly the same flight the camera itself is making, so the loop rises
 *  as the tube actually gets closer rather than snapping the moment the
 *  camera arrives. */
const CRT_MUSIC_FAR_MULT = 0.35;
const CRT_MUSIC_FOCUS_BOOST = 1.6;

/** 0..1 clamp for volume knobs, tolerant of missing/NaN JSON values. */
function clampUnit(v: number) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

type ArmRot = { x: number; y: number; z: number };
type BanjoBearArmName =
  | "shoulder_L" | "upperarm_L" | "arm_L" | "hand_L"
  | "shoulder_R" | "upperarm_R" | "arm_R" | "hand_R";

const BANJO_BEAR_POSE = banjoBearPoseRaw as {
  bpx: number; bpy: number; bpz: number;
  brx: number; bry: number; brz: number;
  bsc: number;
  arms: Record<BanjoBearArmName, ArmRot>;
  paused?: boolean;
  frame?: number;
};

/** Frames-per-second the banjo bear lab uses to convert its `frame` slider
 *  into clip time. Must match BanjoBearLab (`clip.time = frame / 24`). */
const BANJO_BEAR_FPS = 24;

// Rocking-chair bear's full-body pose, authored in /scene-lab/rocking-chair-bear
// (rockingChairBearPose.json) - every posable bone in the rig (torso, both
// arms, both legs, tail), each with rotation AND scale. Scale is what gives
// "length": a bone's children sit at a fixed translation along its own local
// +Y (see the bind-pose dump this rig was built from - every child joint's
// translation is ~[0, length, 0] in its parent's local space), so scaling a
// bone's Y stretches that whole downstream chain with it - shoulder_L's sy
// lengthens the entire arm, not just the shoulder stub. sx/sz thicken it.
//
// Applied as a RELATIVE layer on top of whatever the sit_log mixer already
// wrote that frame (quaternion.multiply, not "replace with bind*delta"), so
// all-zero-rotation + scale-1 is a true no-op that leaves the site's existing
// motion (head bob, breathing, etc.) untouched - only bones you actually move
// off their defaults change anything. `enabled` still exists as a single
// kill switch for the whole layer.
type RockingChairBoneName =
  | "center" | "spine" | "chest" | "pelvis" | "head"
  | "shoulder_L" | "upperarm_L" | "arm_L" | "hand_L" | "fingers_L"
  | "shoulder_R" | "upperarm_R" | "arm_R" | "hand_R" | "fingers_R"
  | "thigh_L" | "leg_L" | "foot_L" | "toe_L"
  | "thigh_R" | "leg_R" | "foot_R" | "toe_R"
  | "tail_01";

type BonePose = { rx: number; ry: number; rz: number; sx: number; sy: number; sz: number };

const ROCKING_CHAIR_BEAR_POSE = rockingChairBearPoseRaw as {
  enabled: boolean;
  parts: Record<RockingChairBoneName, BonePose>;
};
/** The saved posture (recline / hunch / head) for the rocking-chair bear. */
const ROCKING_CHAIR_POSTURE = readRockingPosture((rockingChairBearPoseRaw as { posture?: unknown }).posture);
/** How the chair rocks and how he moves with it (rockingChair.ts). */
const ROCKING_CHAIR_ROCK = readRockMotion((rockingChairBearPoseRaw as { rock?: unknown }).rock);

const ROCKING_CHAIR_BONE_NAMES: RockingChairBoneName[] = [
  "center", "spine", "chest", "pelvis", "head",
  "shoulder_L", "upperarm_L", "arm_L", "hand_L", "fingers_L",
  "shoulder_R", "upperarm_R", "arm_R", "hand_R", "fingers_R",
  "thigh_L", "leg_L", "foot_L", "toe_L",
  "thigh_R", "leg_R", "foot_R", "toe_R",
  "tail_01",
];

// Per-bear bone/prop overrides authored in /scene-lab/bear-pose. Each key is
// a bear id (front_log / back_left_log / back_right_log / table) referenced
// by the AnimalPlacement's bearId field below.
type BearPoseBone = { rx: number; ry: number; rz: number; px: number; py: number; pz: number };
type BearPoseProp = {
  scale?: number;
  px?: number; py?: number; pz?: number;
  rx?: number; ry?: number; rz?: number;
  stickLength?: number;
  stickRadius?: number;
  // Stick offset in the socket frame, applied on TOP of the built-in
  // "cylinder rotated 90 deg on X so it lies along +Z" pose. All optional -
  // absent means no offset. Lets the roasting stick move independently of the
  // fish (or whichever prop is stuck on it) via the bear-pose lab.
  stickPx?: number; stickPy?: number; stickPz?: number;
  stickRx?: number; stickRy?: number; stickRz?: number;
  // How much the Food socket bone follows sit_log's paw rotation.
  //   1.0 = full swing (bear turns the fish as it wags its paw)
  //   0.0 = held rock steady (fish stays still while the paw wiggles)
  // Applied at runtime by slerping Food.quaternion back toward rest.
  foodRotationScale?: number;
  // Same for both hand_L / hand_R wrists - a 0 here locks the wrists at rest
  // regardless of the sit_log clip.
  handRotationScale?: number;
};
type BearPoseEntry = {
  animation?: string;
  // The lab's transport state. `paused` + `frame` are what the pose was
  // AUTHORED against, so the site has to reproduce them or the clip carries
  // the bones away from the pose that was baked. 24 fps, same as the lab.
  paused?: boolean;
  frame?: number;
  speed?: number;
  bones?: Record<string, BearPoseBone>;
  prop?: BearPoseProp;
};
const BEAR_POSES = bearPosesRaw as Record<string, BearPoseEntry>;

// Scratch for the wrist damping in Animal's useFrame - that runs once per bear
// per frame, so it must not allocate.
const HAND_TARGET_Q = new THREE.Quaternion();
const HAND_DELTA_Q = new THREE.Quaternion();
const HAND_DELTA_E = new THREE.Euler();

/** Overlay any prop transform authored in /scene-lab/bear-pose on top of the
 *  placement's baseline. Fields left undefined in JSON fall through to the
 *  placement default so partial edits still work. */
function mergeBearPoseProp<T extends {
  scale: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  stickLength?: number;
  stickRadius?: number;
  stickPosition?: [number, number, number];
  stickRotation?: [number, number, number];
}>(
  base: T,
  override: BearPoseProp | undefined,
): T {
  if (!override) return base;
  const [bpx, bpy, bpz] = base.position ?? [0, 0, 0];
  const [brx, bry, brz] = base.rotation ?? [0, 0, 0];
  const [bspx, bspy, bspz] = base.stickPosition ?? [0, 0, 0];
  const [bsrx, bsry, bsrz] = base.stickRotation ?? [0, 0, 0];
  return {
    ...base,
    scale: override.scale ?? base.scale,
    position: [override.px ?? bpx, override.py ?? bpy, override.pz ?? bpz],
    rotation: [override.rx ?? brx, override.ry ?? bry, override.rz ?? brz],
    stickLength: override.stickLength ?? base.stickLength,
    stickRadius: override.stickRadius ?? base.stickRadius,
    stickPosition: [override.stickPx ?? bspx, override.stickPy ?? bspy, override.stickPz ?? bspz],
    stickRotation: [override.stickRx ?? bsrx, override.stickRy ?? bsry, override.stickRz ?? bsrz],
  };
}

const CAMPFIRE_SCENE_URL = "/forest/campfire_scene.glb";
const PINE_TREE_URL = "/forest/pine_tree.glb";
const WOOD_LOG_URL = "/forest/wood_log.glb";
// A repaired copy of log_low-poly_3d_model (1).glb - see NEW_LOG below. The original
// is left untouched next to it.
const NEW_LOG_URL = "/bear/log_low_poly.glb";
const WHITE_OWL_URL = "/birds/white_owl.glb";
const RED_OWL_URL = "/birds/red_owl.glb";
const TOUCAN_URL = "/models/toucan_wing_fly_land_v2.glb";
const DEER_URL = "/models/deer.glb";
const DOE_URL = "/models/doe.glb";
const BEAR_URL = "/wildpoly/bear_sit_fixed.glb";
/*
 * The OLD grey bear: the rocking-chair bear and the OnlyBears bear are the
 * same fellow and share this model. It is bear_sit_fixed.glb (same rig,
 * mouth rig, morphs and sit_log) with a silver-grey coat and a greyed-out
 * face, and big round tortoiseshell glasses + bushy white brows parented to
 * the head joint - built by scripts/old-bear/make_old_grey_bear.py from
 * geometry authored in Blender. Because the glasses are part of the model,
 * he needs no "glasses" accessory.
 */
const BEAR_OLD_URL = "/wildpoly/bear_old_grey.glb";
// Bear pose baked into GLBs by nextjs/scripts/bake_bear_pose.py (invoked from
// /api/dev/bake-bear-pose whenever the pose lab saves). The site loads these
// instead of BEAR_URL for the fish-holding bears, so the lab's edits are
// visible on the site the moment the bake finishes - no runtime overlay.
const BEAR_URL_FRONT_LOG = "/wildpoly/bear_sit_front_log.glb";
const BEAR_URL_BACK_RIGHT_LOG = "/wildpoly/bear_sit_back_right_log.glb";
const FISH_URL = "/animals/fish.glb";
// Byte-identical copy of fish.glb served under a different URL so useGLTF caches
// it as an independent asset. That gives the fish-on-stick its own materials and
// scene graph, so hover-highlighting the flopping fish no longer bleeds into
// the bear's caught fish (and vice versa).
const FISH_STICK_URL = "/animals/fish_stick.glb";
// Plain body model. The lamps are NOT baked in - they are extruded at runtime
// from config (see TruckLamps) so their shape stays adjustable. The anchors
// below were measured in Blender against this exact file.
// (pickup_truck_lit.glb has the same lamps baked in, kept as a reference.)
const PICKUP_TRUCK_URL = "/vehicles/pickup_truck.glb";

/**
 * Where each lamp pair sits on the body, and which way that bit of bodywork
 * faces. Measured by raycasting the mesh in Blender, not eyeballed - the front
 * of this truck curves away toward the corners (y -2.393 at centre, -2.281 at
 * the corner), so a lamp has to be aligned to its own face normal or it floats
 * off the surface at one end. Positions are the DEFAULTS; the config's
 * SpanX/Y/Z sliders move each pair from here.
 *
 * Rear is easier: the bed's back panel is genuinely flat (normal straight down
 * -Z) between |x| 0.68-0.83 and y 0.88-1.15.
 */
const HEAD_LAMP_NORMAL: [number, number, number] = [0.14, -0.16, 0.98];
const TAIL_LAMP_NORMAL: [number, number, number] = [0, 0, -1];

/**
 * Rounded-rectangle lens outline. `radius01` runs 0 (hard rectangle) to 1,
 * where the corner radius reaches half the short side and the outline becomes
 * a stadium - the oval LED look.
 */
function lampShape(w: number, h: number, radius01: number) {
  const hw = Math.max(0.001, w / 2);
  const hh = Math.max(0.001, h / 2);
  const r = Math.min(hw, hh) * Math.max(0, Math.min(1, radius01));
  const sh = new THREE.Shape();
  if (r <= 0.0005) {
    sh.moveTo(-hw, -hh); sh.lineTo(hw, -hh); sh.lineTo(hw, hh); sh.lineTo(-hw, hh);
    sh.closePath();
    return sh;
  }
  sh.moveTo(-hw + r, -hh);
  sh.lineTo(hw - r, -hh);
  sh.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  sh.lineTo(hw, hh - r);
  sh.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  sh.lineTo(-hw + r, hh);
  sh.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  sh.lineTo(-hw, -hh + r);
  sh.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
  sh.closePath();
  return sh;
}

const LAMP_UP = new THREE.Vector3(0, 1, 0);

/** Orientation that lays a lens flat on a piece of bodywork facing `normal`. */
function lampQuaternion(normal: [number, number, number], mirror: boolean) {
  const n = new THREE.Vector3(normal[0] * (mirror ? -1 : 1), normal[1], normal[2]).normalize();
  const right = new THREE.Vector3().crossVectors(LAMP_UP, n);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(n, right).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, n)
  );
}

interface LampPairProps {
  normal: [number, number, number];
  spanX: number; y: number; z: number;
  w: number; h: number; radius: number; depth: number;
  rotX: number; rotY: number; rotZ: number;
  bezelPad: number; bezelDepth: number; proud: number;
  color: THREE.Color; emissive: number; hide: number;
}

function LampPair(p: LampPairProps) {
  // Geometry only rebuilds when the shape itself changes, not when the pair is
  // dragged around - moving is a transform, not a re-extrude.
  const lens = useMemo(
    () => new THREE.ExtrudeGeometry(lampShape(p.w, p.h, p.radius), {
      depth: p.depth, bevelEnabled: true, bevelThickness: 0.006,
      bevelSize: 0.006, bevelSegments: 2, curveSegments: 18,
    }),
    [p.w, p.h, p.radius, p.depth]
  );
  const bezel = useMemo(
    () => new THREE.ExtrudeGeometry(
      lampShape(p.w + p.bezelPad * 2, p.h + p.bezelPad * 2, p.radius), {
        depth: p.bezelDepth, bevelEnabled: true, bevelThickness: 0.004,
        bevelSize: 0.004, bevelSegments: 2, curveSegments: 18,
      }),
    [p.w, p.h, p.radius, p.bezelPad, p.bezelDepth]
  );
  useEffect(() => () => { lens.dispose(); bezel.dispose(); }, [lens, bezel]);
  if (p.hide >= 0.5) return null;

  return (
    <>
      {[false, true].map((mirror) => {
        const sx = mirror ? -1 : 1;
        return (
          <group
            key={mirror ? "r" : "l"}
            position={[p.spanX * sx, p.y, p.z]}
            quaternion={lampQuaternion(p.normal, mirror)}
          >
            {/* Extrusion runs 0..depth along +Z, so each mesh is pushed back by
                its own depth to leave its FRONT face at the offset we want. */}
            <group rotation={[p.rotX, p.rotY * sx, p.rotZ * sx]}>
              <mesh position={[0, 0, 0.004 - p.bezelDepth]} geometry={bezel} castShadow={false} receiveShadow>
                <meshStandardMaterial color="#0a0a0c" roughness={0.85} metalness={0} />
              </mesh>
              <mesh position={[0, 0, p.proud - p.depth]} geometry={lens} castShadow={false}>
                <meshStandardMaterial
                  color={p.color}
                  emissive={p.color}
                  emissiveIntensity={p.emissive}
                  toneMapped={false}
                />
              </mesh>
            </group>
          </group>
        );
      })}
    </>
  );
}

/** Both lamp pairs, entirely config-driven. */
function TruckLamps({ config: c }: { config: CampfireSceneConfig }) {
  const headColor = useMemo(
    () => new THREE.Color().setRGB(c.truckHeadLampColorR, c.truckHeadLampColorG, c.truckHeadLampColorB),
    [c.truckHeadLampColorR, c.truckHeadLampColorG, c.truckHeadLampColorB]
  );
  const tailColor = useMemo(
    () => new THREE.Color().setRGB(c.truckTailLampColorR, c.truckTailLampColorG, c.truckTailLampColorB),
    [c.truckTailLampColorR, c.truckTailLampColorG, c.truckTailLampColorB]
  );
  return (
    <>
      <LampPair
        normal={HEAD_LAMP_NORMAL}
        spanX={c.truckHeadLampSpanX} y={c.truckHeadLampY} z={c.truckHeadLampZ}
        w={c.truckHeadLampW} h={c.truckHeadLampH}
        radius={c.truckHeadLampRadius} depth={c.truckHeadLampDepth}
        rotX={c.truckHeadLampRotX} rotY={c.truckHeadLampRotY} rotZ={c.truckHeadLampRotZ}
        bezelPad={c.truckHeadLampBezelPad} bezelDepth={c.truckHeadLampBezelDepth}
        proud={c.truckHeadLampProud} color={headColor}
        emissive={c.truckHeadLampEmissive} hide={c.truckHeadLampHide}
      />
      <LampPair
        normal={TAIL_LAMP_NORMAL}
        spanX={c.truckTailLampSpanX} y={c.truckTailLampY} z={c.truckTailLampZ}
        w={c.truckTailLampW} h={c.truckTailLampH}
        radius={c.truckTailLampRadius} depth={c.truckTailLampDepth}
        rotX={c.truckTailLampRotX} rotY={c.truckTailLampRotY} rotZ={c.truckTailLampRotZ}
        bezelPad={c.truckTailLampBezelPad} bezelDepth={c.truckTailLampBezelDepth}
        proud={c.truckTailLampProud} color={tailColor}
        emissive={c.truckTailLampEmissive} hide={c.truckTailLampHide}
      />
    </>
  );
}
const CARAVAN_URL = "/vehicles/caravan.glb";
// Hollow variant of the caravan: window material (02___Default) is transparent
// and every material has doubleSided=true so you can see the back interior wall
// through the windows. Exported from Blender; original preserved at
// caravan_original_backup.glb.
const CARAVAN_HOLLOW_URL = "/vehicles/caravan_hollow.glb";
const CAMPER_URL = "/bear/low_poly_camper.glb";
const CUB_URL = "/bear/2/cub.glb";
const WOODEN_CABIN_URL = "/bear/2/wooden_cabin.glb";
// Spaces in the filename, so percent-encoded.
const GLASSES_URL = "/bear/Glasses%20by%20jeremy%20-%209i5mmOwt7cu.glb";
const TENT_URL = "/bear/low-poly_tent.glb";

// New per-scene props. Spaces in filenames are percent-encoded.
const HONEY_WAND_URL = "/bear/2/Honey%20wand%20by%20Poly%20by%20Google%20-%205DhrBw4JgWW.glb";
const WOOD_PILE_URL = "/bear/1/Wood%20Pile%20by%20K%20H%20(Kash)%20-%208ueXsvnRjC1.glb";
const BANJO_URL = "/bear/1/banjo_clean.glb";
// Quaternius fishing rod, authored ~6cm long along Z. baseScale on the
// Selectable brings it up to a usable size next to the campfire benches.
const FISHING_ROD_URL = "/bear/1/Fishing%20Rod%20by%20Quaternius%20-%200YAR0Lg58p.glb";
// Quaternius backpack, authored ~1.6 cm across - baseScale gets it to a
// campfire-appropriate size and the drawer slider tunes from there.
const BACKPACK_URL = "/bear/1/Backpack%20by%20Quaternius%20-%202g9Jm7kvIU.glb";
// Voxel_dev hiking backpack. Real-world scale (~0.98 m tall) but authored
// offset ~20 units in -X, so a normalization group re-centers before scale.
const HIKING_BACKPACK_URL = "/bear/1/Hiking%20Backpack%20by%20Voxel_dev%20-%20pVuHdEBRUs.glb";
// Quaternius book (0.31 x 0.81 x 0.67, y-tall, min_y = -0.407). Anchor drops
// the bottom to y=0.
const BOOK_URL = "/bear/1/Book%20by%20Quaternius%20-%20h3Wh4fxSQX.glb";
// Second Quaternius backpack, real-world sized (~1.07 x 0.95 x 0.80).
const BACKPACK_Q2_URL = "/bear/1/Backpack%20by%20Quaternius%20-%20vF7TuXCPDH.glb";
// J-Toastie backpack. Real-world sized, already sitting on y=0.
const BACKPACK_TOASTIE_URL = "/bear/1/Backpack%20by%20J-Toastie%20-%20N2wKlicUau.glb";
// Quaternius fish bone, authored ~9 mm long. baseScale gets it to plate size.
const FISH_BONE_URL = "/bear/1/Fish%20Bone%20by%20Quaternius%20-%20bU5RLZnq6v.glb";
// Don Carson keg, authored ~1 cm tall. baseScale gets it to a plausible barrel.
const KEG_URL = "/bear/1/Keg%20by%20Don%20Carson%20-%20uaTAOcUXa4.glb";
// MilkAndBanana kettle, authored ~6 units across. Normalization group centers
// X/Z and sinks the bottom to y=0; outer baseScale sets its final world size.
const KETTLE_URL = "/bear/1/Kettle%20by%20MilkAndBanana%20-%20XggUrd5f03.glb";
// Ancient wooden beer mug (low poly). Sketchfab source authored ~1635 units
// tall - normalization group centers X/Z, drops the bottom to y=0.
const BEER_MUG_URL = "/bear/1/ancient_wooden_beer_mug_-_low_poly.glb";
// Jimi Youm soju bottle, authored ~0.89 units tall - normalization centers
// X/Z and drops the bottom to y=0; baseScale=0.22 lands it at ~20 cm.
const SOJU_URL = "/bear/1/Soju%20by%20Jimi%20Youm%20-%200FJq5yTfjg5.glb";
// Poly-by-Google stool. Source is ~2.3 x 3.1 x 2.3 with min-Y at -2.00, so
// normalization drops the bottom to zero and baseScale sets its world size.
const STOOL_URL = "/bear/1/Stool%20by%20Poly%20by%20Google%20-%20cLydFlVg-wI.glb";
// Poly-by-Google camera-on-tripod. Source ~4.83 x 3.82 x 4.05 with min-Y at
// ~0, so no anchor needed; baseScale sets its final size.
const CAMERA_URL = "/bear/1/Camera%20by%20Poly%20by%20Google%20-%200nfSsetwy0Z.glb";
// Don Carson chopping-block log with axe stuck in it. Source ~0.27 x 0.30 x
// 0.28 with a small offset from origin; light anchor + baseScale places it.
const LOG_AXE_URL = "/bear/1/Log%20%26%20Axe%20-%20Game%20Asset%20by%20Don%20Carson%20-%20ayOM0vyW_qd.glb";
const LAPTOP_URL = "/bear/1/Laptop%20by%20Kenney%20-%20GnbwSUiVty.glb";
// Quaternius A-frame tent, edited from the original download:
//   - groundsheet removed (18 horizontal tris off the Green primitive, the
//     only near-ground horizontal geometry in the model)
//   - the two long guy lines pulled in from z +/-12.37 to +/-8.66, with their
//     ground stakes moved to match, so the wires land just outside the tent
//     instead of reaching twice its depth away
// The source node is Z-up scaled 348.6x, so the mesh's local Y is world depth.
// Body is 10.91 x 9.54 x 12.49 with min-Y at -0.18 (the stakes sit below
// ground on purpose); full extent including the lines is 14.58 x 10.32 x 17.36.
// baseScale 0.16 puts the body at ~1.75 x 1.53 x 2.0 m, matching the height of
// the low-poly tent already pitched across camp; the anchor lifts min-Y to y=0.
// Original file kept alongside as "Tent by Quaternius - 5Q7qIrfDxA.glb".
const TENT_AFRAME_URL = "/bear/1/tent_a_frame.glb";
const OLD_BEAR_TABLE_URL = "/bear/3/Table%20by%20Hunter%20Paramore%20-%207qAyGZnerYt.glb";
const OLD_BEAR_CHAIR_URL = "/bear/3/Chair%20by%20Quaternius%20-%20iMNqRzPwwe.glb";
const OLD_BEAR_COMPUTER_URL = "/bear/3/low_poly_computer_with_devices.glb";
const OLD_BEAR_BOOKS_URL = "/bear/3/Book%20Stack%20by%20Danni%20Bittman%20-%201WggoIFq8tx.glb";
const OLD_BEAR_MUG_URL = "/bear/3/Mug%20With%20Office%20Tool%20by%20CreativeTrio%20-%204jSgnM5WWk.glb";
const OLD_BEAR_BOXES_URL = "/bear/3/Cardboard%20Boxes%20by%20Quaternius%20-%20V9KbWC8Vd6.glb";
const OLD_BEAR_PAPERS_URL = "/bear/3/Small%20Stack%20of%20Paper%20by%20Jarlan%20Perez%20-%20aiBozYlPe--.glb";
const OLD_BEAR_TOILET_URL = "/bear/3/Toilet%20Paper%20stack%20by%20Quaternius%20-%206jlZSAxsYb.glb";
const OLD_BEAR_POSTIT_URL = "/bear/3/Yellow%20Post-it%20by%20Zack%20Huang%20-%201-ZStsi8S91.glb";
const OLD_BEAR_DEBRIS_URL = "/bear/3/Debris%20Papers%20by%20Quaternius%20-%20MujITy1NRR.glb";
const OLD_BEAR_LANTERN_URL = "/bear/3/Lantern%20by%20Poly%20by%20Google%20-%209YMVn5hMiv8.glb";
/** Rocking chair for the cabin study. Bear sits in it via ROCKING_CHAIR_BEAR,
 *  rendered as a child of the same Selectable so moving/rotating/scaling the
 *  chair in the lab carries the bear with it - drag the chair, not two things. */
const ROCKING_CHAIR_URL = "/rocking-chair.glb";
const OLD_BEAR_CARAVAN_URL = "/bear/3/Caravan%20by%20Poly%20by%20Google%20-%20aiDmjN8uOmA%20(1).glb";
// New camping scene GLB dropped into old-bear/. Kept as a raw placeable so the
// user can decide what to keep or strip out.
const OLD_BEAR_CAMPING_URL = "/bear/3/camping.glb";

/**
 * GameCube, split out of gamecube_with_controller.glb.
 *
 * The source is a 53 MB, 2.17M-triangle Sketchfab CAD model whose every material
 * uses KHR_materials_pbrSpecularGlossiness - an extension three.js dropped, so it
 * would have rendered untextured. Rebuilt in Blender into two files at 874 KB
 * total: coplanar faces dissolved first (it is subdivision output, so that alone
 * removed 94% of it for free), then collapsed to a per-object budget weighted by
 * surface area, which keeps the port recesses square instead of turning them to
 * mush. Materials came back out as metallicRoughness, and the one alpha-BLEND
 * material was forced opaque - that is the same flag that made the bear render
 * see-through and stop self-occluding.
 *
 * Both are exported in METRES: the console shell measures 0.150 x 0.156 x 0.106,
 * against 150 x 161 x 110 mm for the real thing. Console origin is centred with
 * its feet on y=0 and its port face looking down -Z. Controller origin is its
 * centre, and its cord leaves toward -Z as well.
 */
const GAMECUBE_URL = "/bear/gamecube.glb";
// New arcade consoles (added to /public/bear/2/). Sources vary wildly in
// authoring scale, so each Selectable that uses one wraps it in a small
// anchor + baseScale normalization.
const XBOX360_URL = "/bear/2/xbox_360_fat_low_poly.glb";
// The PS2 slim used to sit here. Removed with its GLB: it had been hidden
// (objectOverrides.arcade_ps2_slim.hide = 1) so nothing rendered it, but the
// module-scope useGLTF.preload downloaded and parsed it anyway - 11.4 MB and
// 186,743 triangles, 51% of the scene's geometry, for a console nobody saw.
const GAMECUBE_CONSOLE_URL = "/bear/2/gamecube_console.glb";
const CONTROLLER_URL = "/bear/gamecube_controller.glb";

// Snacks, packs, and props dropped into /public/bear/2/. Every asset here is
// surfaced as one Selectable in the arcade sector so the object drawer can
// find and place them; default positions form a loose grid behind the cubs
// which you drag/scale in the lab. Source authoring scales are all over the
// place, so the default baseScale is a rough starting point per asset.
const CUB_BACKPACK_URL = "/bear/2/Backpack%20by%20Emmett%20%E2%80%9CTawpShelf%E2%80%9D%20Baber%20-%20ems9KHrB_4x.glb";
const CUB_CHIPS_URL = "/bear/2/Chips%20by%20CreativeTrio%20-%20uF1dGn3HXi.glb";
const CUB_COOKIE_URL = "/bear/2/Cookie%20by%20Poly%20by%20Google%20-%208Xmx93RrgDT.glb";
const CUB_DONUT_URL = "/bear/2/Donut%20by%20Quaternius%20-%20UQRRrsP3wj.glb";
const CUB_FRIES_URL = "/bear/2/French%20fries%20by%20Poly%20by%20Google%20-%20eLvKtdMFaXF.glb";
const CUB_MARSHMALLOWS_URL = "/bear/2/Marshmallows%20by%20Jarlan%20Perez%20-%201KaEvyPT4BG.glb";
const CUB_OPEN_BACKPACK_URL = "/bear/2/Open%20Backpack%20by%20Emmett%20%E2%80%9CTawpShelf%E2%80%9D%20Baber%20-%2026m92LMKK4e.glb";
const CUB_PICNIC_BASKET_URL = "/bear/2/Picnic%20Basket%20by%20Poly%20by%20Google%20-%20aWBGhxXig8y.glb";
const CUB_PICNIC_TABLE_URL = "/bear/2/Picnic%20Table%20by%20J-Toastie%20-%20GQieALI2C4.glb";
const CUB_PRETZEL_URL = "/bear/2/Pretzal%20by%20Jarlan%20Perez%20-%208G1Z7FGHWt-.glb";
const CUB_SMORE_URL = "/bear/2/S%27more%20-%20toasted%20by%20sirkitree%20-%204Er9zaRIQj-.glb";
const CUB_SANDWICH_COOKIE_URL = "/bear/2/Sandwich%20Cookie%20by%20Poly%20by%20Google%20-%201_1zbKquoYZ.glb";
const CUB_MATCHBOX_URL = "/bear/2/matchbox%20open%20by%20Justin%20Randall%20-%201Jv2TQvqA_5.glb";
const CUB_TRASH_BAG_URL = "/bear/2/trah%20bag%20grey%20by%20Jens%20Kull%20-%20axTuG36RXnN.glb";

type ArcadeCubProp = {
  name: string;
  label: string;
  url: string;
  position: [number, number, number];
  scale: number;
  rotationY?: number;
};

// Two rows of props laid out behind the cubs (z >= 1.4), at gentle X spacing so
// none of them start overlapping. Every entry is Selectable, so drag them into
// the shot from the lab drawer.
const ARCADE_CUB_PROPS: ArcadeCubProp[] = [
  { name: "arcade_backpack", label: "backpack", url: CUB_BACKPACK_URL, position: [-2.1, 0, 1.4], scale: 0.25 },
  { name: "arcade_open_backpack", label: "open backpack", url: CUB_OPEN_BACKPACK_URL, position: [-1.4, 0, 1.4], scale: 0.25 },
  { name: "arcade_picnic_basket", label: "picnic basket", url: CUB_PICNIC_BASKET_URL, position: [-0.7, 0, 1.4], scale: 0.25 },
  { name: "arcade_picnic_table", label: "picnic table", url: CUB_PICNIC_TABLE_URL, position: [0, 0, 1.4], scale: 0.35 },
  { name: "arcade_trash_bag", label: "trash bag", url: CUB_TRASH_BAG_URL, position: [0.7, 0, 1.4], scale: 0.25 },
  { name: "arcade_matchbox", label: "matchbox", url: CUB_MATCHBOX_URL, position: [1.4, 0, 1.4], scale: 0.2 },
  { name: "arcade_smore", label: "s'more", url: CUB_SMORE_URL, position: [2.1, 0, 1.4], scale: 0.15 },
  { name: "arcade_marshmallows", label: "marshmallows", url: CUB_MARSHMALLOWS_URL, position: [-2.1, 0, 2.1], scale: 0.15 },
  { name: "arcade_chips", label: "chips", url: CUB_CHIPS_URL, position: [-1.4, 0, 2.1], scale: 0.2 },
  { name: "arcade_pretzel", label: "pretzel", url: CUB_PRETZEL_URL, position: [-0.7, 0, 2.1], scale: 0.2 },
  { name: "arcade_donut", label: "donut", url: CUB_DONUT_URL, position: [0, 0, 2.1], scale: 0.2 },
  { name: "arcade_cookie", label: "cookie", url: CUB_COOKIE_URL, position: [0.7, 0, 2.1], scale: 0.2 },
  { name: "arcade_sandwich_cookie", label: "sandwich cookie", url: CUB_SANDWICH_COOKIE_URL, position: [1.4, 0, 2.1], scale: 0.2 },
  { name: "arcade_fries", label: "french fries", url: CUB_FRIES_URL, position: [2.1, 0, 2.1], scale: 0.2 },
];

/**
 * The four controller ports, in console-local metres, found by clustering the
 * recessed geometry in the port band rather than by eye - they came out evenly
 * spaced 27 mm apart, and port 1 landed exactly on the plug the model already had
 * inserted. Ordered left-to-right so cub N wires to port N and the leads never
 * cross. A plug is baked into each of the four, so the sockets are never empty.
 */
const CONSOLE_PORTS: Array<[number, number, number]> = [
  [-0.04020, 0.06328, -0.09532],
  [-0.01315, 0.06328, -0.09532],
  [0.01373, 0.06328, -0.09532],
  [0.04079, 0.06328, -0.09532],
];

/**
 * The four controller ports on gamecube_console.glb - the dots on its front -
 * in the MODEL's own units.
 *
 * Measured in Blender rather than eyeballed. Importing the GLB and splitting
 * every mesh into connected shells turns up four IDENTICAL pieces, 1.0 x 0.26
 * x 1.0, sitting at the same height and evenly spaced 1.7464 apart along one
 * face - which is what a row of sockets looks like to a clustering pass and
 * what nothing else on this model looks like.
 *
 * The face matters and cost me a screenshot: the opposite side clusters
 * suspiciously well too, because the vent slats are also a regular row. A
 * front view settled it - four sockets with the two memory-card slots beneath
 * them on this face, vents and the recessed panel on the other.
 *
 * Two conversions are baked in. Blender is Z-up and glTF is Y-up, so the
 * measured (x, y, z) is read back as (x, z, -y). And the y is the socket
 * MOUTH - the pieces' outermost face at -5.4911, not their centre - so a lead
 * starts where it would really plug in rather than a millimetre inside the
 * shell.
 */
const ARCADE_CONSOLE_PORTS: Array<[number, number, number]> = [
  [-2.6195, 4.4906, 5.4911],
  [-0.8732, 4.4906, 5.4911],
  [0.8732, 4.4906, 5.4911],
  [2.6195, 4.4906, 5.4911],
];

/**
 * Cord gauge for the arcade's leads, in world units.
 *
 * Worth the arithmetic rather than reusing WIRE_RADIUS, which belongs to a
 * console at a different scale: this console is 10.467 model units wide at
 * baseScale 0.014, so it stands 0.1465 world units across. A real GameCube is
 * 150mm, which puts this scene at about a metre to the unit - and a real
 * controller cord is ~2.5mm, and 3.6mm is about as thin as this holds up: at
 * the distance the camera sits that is a pixel and a half, and anything under
 * a pixel flickers as it crosses pixel boundaries rather than drawing a line.
 */
const ARCADE_WIRE_RADIUS = 0.0018;

/** Cord and plug colour. Near-black rather than pure: at #000 a cord reads as
 *  a hole cut in the floor, because nothing in the scene can shade it. */
const ARCADE_WIRE_COLOR = "#0a0a0c";

/** Where the cord leaves the controller shell, in controller-local metres. */
const CONTROLLER_CORD_EXIT = new THREE.Vector3(-0.00668, -0.00142, -0.03165);

/**
 * What each CRT is showing. Drop an image in /public and point `content` at it; leave
 * it out and the screen runs a built-in animation so it never looks dead. `tint` is
 * the colour that screen throws onto the cubs, so it's worth matching the artwork.
 */
/**
 * Each screen plays a project GIF from /public/gifs so the arcade wall reads
 * as a stack of running games. Tints match each GIF's dominant palette so the
 * light they throw onto the bears feels like it's coming from what's on
 * screen, not a decorator's guess.
 */
/**
 * What crt_0 runs: a console menu built from the site's OWN data.
 *
 * Companies come out of lib/experience roles and titles out of lib/projects,
 * so the screen cannot drift from the rest of the site - add a job or ship a
 * project and the tube in the truck bed picks it up on the next build. Skills
 * are the one literal list, mirroring the front of SkillsCarousel; importing
 * that module here would drag a whole 3D carousel into the scene's graph for
 * twelve strings.
 *
 * Four lines is the readout's limit at this size, and shortest-first reads
 * better on a 256px tube than newest-first would.
 */
/* The tube runs two screens. Idle it plays the attract video with nothing
   drawn over it; clicking it brings up the plates, which sit on this still
   instead - a moving background behind the menu fights the plates for
   attention. Both live in /public/CRT. */
const CRT_ATTRACT_VIDEO = "/CRT/Menu.mp4";
/* .mp4, not the .mov that was dropped in: the file is H.264 either way, but
   Firefox will not open a QuickTime container. This one is that exact video
   remuxed with `ffmpeg -c copy` - same bytes, same quality, a container every
   browser reads. background_buttons.mov is still on disk as the source. */
const CRT_BUTTONS_VIDEO = "/CRT/background_buttons.mp4";
/*
 * The P1 hand, as the mouse cursor, for as long as the tube is open.
 *
 * Downscaled from the crt_cursor.png in that folder rather than used
 * directly: a CSS cursor image is capped at 128px square (Chrome ignores a
 * larger one outright, so the cursor would simply not change), and the
 * source is 2048x2108 and 1.8MB - a download the size of the whole menu
 * video for something that is 40 pixels on screen.
 *
 * The hotspot is the FINGERTIP - measured off the alpha channel as the
 * middle of the topmost opaque row, not eyeballed. Put it anywhere else and
 * the plate you click is not the plate the finger is touching.
 */
const CRT_CURSOR = "url('/CRT/crt_cursor_48.png') 24 2, pointer";
/* Poster under the buttons video, so the switch never shows black. */
const CRT_MENU_BACKGROUND = "/CRT/background.jpg";

const PORTFOLIO_MENU: CrtMenu = {
  title: "Main Menu",
  dwell: 3.6,
  variant: "melee",
  // No fixed tagline: the strip carries the lit item's own subtitle.
  backgroundVideo: CRT_ATTRACT_VIDEO,
  backgroundImage: CRT_MENU_BACKGROUND,
  // everything the tube can show, decoded before it is needed
  preloadMedia: [CRT_ATTRACT_VIDEO, CRT_BUTTONS_VIDEO, CRT_MENU_BACKGROUND],
  items: [
    {
      label: "Experience",
      subtitle: "Where I've Built",
      icon: "briefcase",
      caption: "Career",
      lines: roles.slice(0, 4).map((r) => r.company),
    },
    {
      label: "Projects",
      subtitle: "Things I've Shipped",
      icon: "code",
      caption: "Portfolio",
      lines: [...projects]
        .sort((a, b) => a.name.length - b.name.length)
        .slice(0, 4)
        .map((p) => p.name),
    },
    {
      label: "Skills",
      subtitle: "Tools of the Trade",
      icon: "gear",
      caption: "Toolkit",
      lines: ["React / Next / TS", "Python / C# / .NET", "AWS / GCP / K8s", "Bedrock / PyTorch"],
    },
  ],
};

/*
 * One screen per section, built from the same site data the menu plates are.
 *
 * The plates only ever had room for four teaser lines each; picking one now
 * opens its own readout, so Experience can carry job titles and dates and
 * Projects can carry their stacks instead of just a list of names. Order
 * matches PORTFOLIO_MENU.items, because the plate index IS the page index.
 */
/* Plate names. Long enough to be clear, short enough not to be truncated -
   the tile is a label, the panel underneath is where the full name lives. */
const COMPANY_TAGS: Record<string, string> = {
  "Twilio": "Twilio",
  "Regions Bank": "Regions",
  "Summit Technology Consulting": "Summit",
  "Dark Tower": "Dark Tower",
  "BioGX": "BioGX",
};

const SECTION_PAGES: CrtPage[] = [
  {
    // A board of the company logos, which are animated gifs. They keep
    // animating because the loader parks each <img> in the document rather
    // than decoding it detached - a detached image shows frame one forever.
    // Five big tiles across one row, so a spinning logo is actually readable;
    // the band underneath carries the role and dates for whichever is lit.
    title: "Experience",
    grid: true,
    cols: roles.length,
    // The panel carries the whole role - title, dates and every bullet - so
    // it needs the height, and the logo strip shrinks to pay for it.
    // Big logo tiles (38px wells, nearly square) over a band sized to hold
    // the longest role's three bullets. The layout is 36 + 49 + 4 = 89 down
    // to the band, which is what 0.62 of the 142px body leaves.
    bandFrac: 0.62,
    tile: { wellH: 38, capH: 10 },
    // Five small looping logos: all of them run, not just the lit one.
    animateAll: true,
    rows: roles.map((r) => ({
      label: r.company,
      // A clean short form for the plate. "Summit Technology Consulting"
      // truncated to fit was the thing that looked unprofessional.
      tag: COMPANY_TAGS[r.company] ?? r.company.split(/\s+/)[0],
      // The tile names the company, so the band leads with the ROLE. The
      // parenthetical ("(Go To Market Innovation)") is dropped there - it
      // doubled the heading onto a second line.
      sub: r.title.replace(/\s*\(.*?\)\s*/g, " ").trim(),
      meta: r.dates,
      body: r.bullets,
      // .mp4, not the .gif the rest of the site uses: on a canvas the browser
      // will not reliably animate an off-screen <img>, and a <video> can be
      // told to play. Same artwork, a third of the bytes.
      icon: r.logo.replace(/\.gif$/i, ".mp4"),
    })),
  },
  {
    title: "Projects",
    // A roster board, not a list: each project is a tile with its own icon,
    // 7 across by 3 down, which is exactly the 21 there are.
    /*
     * Thumbnails squeezed into a strip so the diagram gets the screen.
     *
     * 11 across by 2 down holds all 21 in half the rows 7-across needed, and
     * that bought the panel another 20 logical pixels of height. The tiles are
     * an index at this size, not a label - which is why they have no name
     * plates and lean on the lit rim instead.
     */
    grid: true,
    cols: 11,
    bandFrac: 0.72,
    tile: { wellH: 16, showCaption: false },
    // Every logo has an "_arch" twin already on disk, so the diagram path is
    // derived rather than being a field nobody would remember to fill in.
    rows: projects.map((pr) => ({
      label: pr.name,
      icon: pr.logo,
      diagram: pr.logo.replace(/\.png$/i, "_arch.png"),
      // Every one of the 21 has a repo, so every tile on this board is a link.
      href: pr.github,
    })),
  },
  {
    title: "Skills",
    /*
     * Every icon, on one board.
     *
     * This was eight lines of "React / Next.js / TypeScript" - the tech
     * bundled into slash-separated strings because a list was all the screen
     * could do. It is a grid now, off the same SKILLS the carousel on the
     * site runs on, so the two can never disagree about what he works with.
     *
     * 5 across by 4 down holds all nineteen and fills the body exactly:
     * cellH 33 x 4 rows is 132 of the 138 available. No name plates and no
     * band - at this size a caption under each would be mush, and the marks
     * are the recognisable thing anyway. That is what pays for icons this
     * big: 28px of art where a captioned board would have given 20.
     */
    grid: true,
    cols: 5,
    bandFrac: 0,
    // artScale pulls each mark ~7% in from the tile's rim, so the wider
    // logos (aws, docker) are not drawn hard against its edges.
    tile: { wellH: 32, showCaption: false, artScale: 0.93 },
    rows: SKILLS.map((s) => ({ label: s.label, icon: skillIcon(s) })),
  },
];

const ARCADE_SCREENS: CrtScreen[] = [
  // crt_0 runs the portfolio menu rather than media. Tint is the cool blue
  // the menu actually averages to, so the light it throws onto the cubs comes
  // from what is on the screen instead of from the artwork that used to be.
  { menu: PORTFOLIO_MENU, tint: "#79c6f0", glow: 1.0 },
  // Left CRT: a real video rather than a GIF, so it actually moves.
  { content: "/bear/2/summit.mp4", tint: "#8bd0ff", glow: 0.95 },
  { content: "/gifs/darktower.gif", tint: "#ffb46f", glow: 0.9 },
  { content: "/gifs/regions.gif",   tint: "#8affc0", glow: 0.95 },
];

/**
 * The campsite is three places standing on a ring with an empty middle. The camera
 * lives in that middle and turns to face one at a time, so a step is 360/3 degrees
 * and three steps come back to where you started.
 *
 * Each location is authored in its OWN local frame, centred on its own origin with
 * the camera off at +Z looking in - exactly the frame the campfire was already
 * built in - and then dropped onto the ring. So a location can be composed as if it
 * were the only thing in the world.
 *
 * The group is turned to `azimuth + PI`, not `azimuth`, which points its local +Z
 * back toward the middle. That is what puts the camera on the inner side and every
 * bear facing it; turning both the contents and the viewpoint by half a turn about
 * the same centre leaves the framing identical to before.
 */
const LOCATION_COUNT = 3;
const LOCATION_AZIMUTH = (i: number, c: CampfireSceneConfig) =>
  c.locationAngleOffset + (i * Math.PI * 2) / LOCATION_COUNT;

/**
 * The transform that puts location i on the ring - the same one the <Location> group
 * applies, so anything expressed in a location's frame can be carried into world
 * space with it, and back again with its inverse.
 */
function ringMatrix(a: number, c: CampfireSceneConfig, out: THREE.Matrix4) {
  out.makeRotationY(a + Math.PI + c.locationSpin);
  out.setPosition(Math.sin(a) * c.locationRadius, 0, Math.cos(a) * c.locationRadius);
  return out;
}

function locationMatrix(i: number, c: CampfireSceneConfig, out: THREE.Matrix4) {
  return ringMatrix(LOCATION_AZIMUTH(i, c), c, out);
}

/** Signed shortest way round from `a` to `b`, in radians. */
function shortestTurn(a: number, b: number) {
  return ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

const LOCATION_VIEW_KEYS = ["cx", "cy", "cz", "tx", "ty", "tz"] as const;

/** This location's saved framing, falling back to the shared ring baseline. */
function locationView(i: number, c: CampfireSceneConfig): LocationView {
  return c.locationViews?.[i] ?? defaultLocationView(i, c);
}

/** Where the camera stands to look at location i, and what it aims at, in world space. */
function locationCamera(
  i: number,
  c: CampfireSceneConfig,
  pos: THREE.Vector3,
  target: THREE.Vector3,
  scratch: THREE.Matrix4 = new THREE.Matrix4()
) {
  const v = locationView(i, c);
  locationMatrix(i, c, scratch);
  pos.set(v.cx, v.cy, v.cz).applyMatrix4(scratch);
  target.set(v.tx, v.ty, v.tz).applyMatrix4(scratch);
}

/** A world-space camera and target folded back into location i's frame, for saving. */
export function worldToLocationView(
  i: number,
  c: CampfireSceneConfig,
  pos: [number, number, number],
  target: [number, number, number]
): LocationView {
  const inv = locationMatrix(i, c, new THREE.Matrix4()).invert();
  const p = new THREE.Vector3(...pos).applyMatrix4(inv);
  const t = new THREE.Vector3(...target).applyMatrix4(inv);
  return { cx: p.x, cy: p.y, cz: p.z, tx: t.x, ty: t.y, tz: t.z };
}

/**
 * Drops its children onto the ring at location `index`.
 *
 * No contact shadows here. ContactShadows only ever renders onto a SQUARE plane, so
 * one per location just drew three squares on the ground; the single circular
 * CampfireGround is the surface under the whole campsite instead.
 */
/**
 * Half-width of the arc a location stays lit for, in radians.
 *
 * Sites are 120° apart, so the window has to admit exactly one when parked and
 * both of a pair mid-turn: anything over 60° does the latter, anything under
 * 120° does the former, and 75° sits in the middle.
 *
 * This deliberately measures the camera's ANGLE around the ring rather than its
 * distance to each site. Distance looked simpler and failed a check: the shots
 * stand back by very different amounts (4.0, 2.6 and 10.2 units from their own
 * site), so no single distance threshold separates "parked here" from "mid-turn
 * elsewhere" for all three. The angle does not care how far back a shot sits.
 */
const LOCATION_VISIBLE_ARC = Math.PI * (75 / 180);

function Location({
  index,
  config,
  gate = false,
  children,
}: {
  index: number;
  config: CampfireSceneConfig;
  /** Switch off whenever the camera is looking at a different site. Off during
   *  free-look and the intro flight, where "which site" has no answer. */
  gate?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const cfg = useRef(config);
  cfg.current = config;
  const gateRef = useRef(gate);
  gateRef.current = gate;

  useFrame(({ camera }) => {
    if (!ref.current) return;
    const c = cfg.current;
    const a = LOCATION_AZIMUTH(index, c);
    ref.current.position.set(Math.sin(a) * c.locationRadius, 0, Math.cos(a) * c.locationRadius);
    ref.current.rotation.set(0, a + Math.PI + c.locationSpin, 0);

    /*
     * Hiding the group is what makes this worth doing, and not because of the
     * meshes - three already frustum-culls those per object. It is the LIGHTS.
     * They go into one global list with no distance test, and
     * lights_fragment_begin loops every one of them for every lit fragment, so
     * a lantern behind the camera still costs on every pixel. In
     * WebGLRenderer.projectObject the `object.visible === false` early-out sits
     * ABOVE the isLight branch, so switching a location off drops its lights
     * out of the frame entirely. WebGLShadowMap honours it too, so their shadow
     * passes go with them.
     */
    if (!gateRef.current) {
      ref.current.visible = true;
      return;
    }
    // Where the camera stands around the ring. ringMatrix puts a site at
    // (sin a · R, 0, cos a · R), so the same atan2 recovers the camera's own
    // angle whatever radius it happens to be orbiting at.
    const camAngle = Math.atan2(camera.position.x, camera.position.z);
    ref.current.visible = Math.abs(shortestTurn(camAngle, a)) < LOCATION_VISIBLE_ARC;
  });

  return (
    <group ref={ref} name={`location_${index}`}>
      {children}
    </group>
  );
}

// Replaces the tent baked into campfire_scene.glb, which is stripped out below.
// Where that one stood, so the existing tentX/Y/Z/RotationY/Scale sliders keep
// meaning exactly what they did before - they're offsets from this.
const TENT_BASE = { x: 4.429, y: 0, z: -2.567 };
// This model is authored Z-up and its Sketchfab root carries no conversion rotation,
// so without the -90 deg X it lies on its side. Measured: 3.27x taper along Z (wide
// base, narrow apex) vs ~1.0x on X and Y.
const TENT_UPRIGHT: [number, number, number] = [-Math.PI / 2, 0, 0];
// After that rotation: recentres the footprint and drops the base onto y = 0.
const TENT_ANCHOR: [number, number, number] = [0.036, 0.125, -0.009];

// The camper is a Sketchfab diorama - van, awning, string lights, table, chair,
// plants - and its origin sits out in a corner rather than on the van. These put the
// van body itself on the group origin so `position` means where the van goes.
const CAMPER_ANCHOR: [number, number, number] = [-0.04, 0, -1.46];
// The patio/awning side of the diorama faces local +X, so a -90 deg yaw turns it to
// face +Z, i.e. toward the fire.
const CAMPER_BASE = { x: 0, y: 0, z: -6.0, rotY: -Math.PI / 2, scale: 0.4 };

// Measured off the rig: `mouth` is a child of `head` at a fixed local offset, so the
// direction the face points is constant in head-local space regardless of pose.
// normalize([0, 0.377, 0.236]).
const FACE_FWD_LOCAL = new THREE.Vector3(0, 0.848, 0.531).normalize();
const FACE_UP_LOCAL = new THREE.Vector3(0, 0.531, -0.848).normalize();
const FACE_RIGHT_LOCAL = new THREE.Vector3(1, 0, 0);

// Same idea for the chest bone, measured the same way. It sits nearly axis-aligned
// for a seated bear: +Z out of the chest, +Y up.
const CHEST_FWD_LOCAL = new THREE.Vector3(-0.078, 0.058, 0.995).normalize();
const CHEST_UP_LOCAL = new THREE.Vector3(0, 0.956, -0.292).normalize();

/** builds the rotation that maps a model authored Y-up / +Z-forward onto a bone */
function boneBasis(fwd: THREE.Vector3, up: THREE.Vector3) {
  const f = fwd.clone().normalize();
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  const u = new THREE.Vector3().crossVectors(f, r).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, f));
}
/** how far a bear will crane its head off neutral before it stops trying, radians */
const MAX_GLANCE = 1.0;

type HeadRegistry = Map<string, {
  bearId?: AnimalPlacement["bearId"];
  position: THREE.Vector3;
  fishPosition?: THREE.Vector3;
}>;
type FishReaction = {
  phase: "idle" | "flying" | "impact-delay" | "fire" | "partner" | "return";
  /** WORLD position of what the back bears are reacting to: the fish itself
   *  while it flies (updated every frame), then the spot where it hit the fire. */
  target: THREE.Vector3;
  phaseStartedAt: number;
  flightProgress: number;
};

/**
 * Live world positions the wires need: where each controller's cord leaves its shell,
 * and where each console port is. Both ends move - the cubs breathe, and the console
 * follows its config sliders - so the wire reads them every frame rather than being
 * given fixed endpoints.
 */
type CordRegistry = Map<string, THREE.Vector3>;
type PortRegistry = Map<number, THREE.Vector3>;
type DragPlaneMode = "xz" | "xy";

// Three benches around the fire at 120 deg intervals, plus a spare 4th bench
// placed just outside the ring so it can be dragged wherever. The spare uses
// the same OLD_LOG model and gets its own object-override row (`bench_3`), so
// dragging in the lab persists through the normal save.
const BENCH_ANGLES = [
  Math.PI / 2,
  Math.PI / 2 + (2 * Math.PI) / 3,
  Math.PI / 2 + (4 * Math.PI) / 3,
  Math.PI / 2 + Math.PI,
];

interface BenchModel {
  url: string;
  /** model-space nudge applied before placing, so different logs line up with each other */
  anchor: [number, number, number];
  /** normalises models authored at different scales before anything else applies */
  scale: number;
  /** height of the sit-on surface in model units, AFTER the anchor. Whatever sits on
   *  this bench derives its Y from this, so swapping in a log of a different height
   *  moves the occupant with it instead of leaving them floating. */
  top: number;
}

const OLD_LOG: BenchModel = { url: WOOD_LOG_URL, anchor: [0, 0, 0], scale: 1, top: 1.074 };
// Its nodes use `matrix` rather than translation/rotation/scale, and one of them
// carries a 100x scale - so the raw model is 404 units long. Hence scale 0.01, which
// brings it to 4.05 x 0.92 x 1.02 against the old log's 3.77 x 1.09 x 1.11.
// The anchor then lines its base and centre up with the old log's.
const NEW_LOG: BenchModel = {
  url: NEW_LOG_URL,
  anchor: [-0.0143, 0.0119, -0.1473],
  scale: 0.01,
  top: 0.9012,
};

/** which log stands at each bench angle - swap freely */
const BENCH_MODELS: BenchModel[] = [OLD_LOG, NEW_LOG, OLD_LOG, NEW_LOG];

interface PropAttachment {
  url: string;
  /** scale in the socket bone's space (already bear model units, so 1 is life-size) */
  scale: number;
  /** euler radians, applied inside the socket frame. Normally unnecessary: sit_log
   *  keys the socket's rotation to the live paw-to-paw axis, so a prop authored
   *  along +Z lands on the stick line by construction. */
  rotation?: [number, number, number];
  /** offset in the socket frame. Used to slide the prop along the stick, e.g.
   *  push a fish out to the tip so it reads as biting the end. */
  position?: [number, number, number];
  /** length of a wooden stick added along the socket's +Z axis, skewered through
   *  the prop. Left undefined for props that already include their own stick. */
  stickLength?: number;
  /** cylinder radius for the stick */
  stickRadius?: number;
  /** extra position offset for the stick, in the socket frame. Applied on top
   *  of (0,0,0) so the stick can slide independently of the prop it carries. */
  stickPosition?: [number, number, number];
  /** extra rotation for the stick, applied on top of the built-in X=PI/2 that
   *  aligns the cylinder with the socket's +Z axis. Lets the stick tilt or
   *  spin around its own axis without moving the fish. */
  stickRotation?: [number, number, number];
  /** if set, SocketProp will layer live config-driven offsets on top of the
   *  baseline transform each frame. Keys read: `${configKey}X/Y/Z`,
   *  `${configKey}RotX/Y/Z`, `${configKey}Scale` (multiplier). */
  configKey?: "banjoProp";
}

/**
 * A prop carried between two bones - for the cub rig, which has no hands and no
 * socket bone to hang anything from.
 *
 * It rides at the live MIDPOINT of the two bones, recomputed every frame, rather
 * than at a fixed offset from one of them. Anchoring to a single bone makes the
 * prop swing around that joint as the clip plays; the midpoint stays put.
 */
interface HandheldAttachment {
  url: string;
  scale: number;
  /** the two bones it is held between */
  bones: [string, string];
  /** euler radians, applied in the animal's own frame */
  rotation?: [number, number, number];
  /** nudge off the bone midpoint, in the animal's own frame */
  offset: [number, number, number];
}

interface AnimalPlacement {
  url: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  label: string;
  flatShading?: boolean;
  animation?: string;
  /** seconds into the clip to start — desyncs instances that share one animation */
  animationOffset?: number;
  /** playback rate; keep these mutually non-integer so instances never re-sync */
  animationSpeed?: number;
  /** hold the clip at a single frame - bones are static, no cycling. Used by
   *  the fish-holder bears so the lab-authored pose reads clean instead of
   *  the sit_log arms swinging through their delta every second. */
  animationHoldFrame?: number;
  /** derive Y from the bench top instead of using position[1] */
  sitOnBench?: boolean;
  /** which of the three benches it's sitting on - picks the right seat height when
   *  the benches aren't all the same log */
  bench?: number;
  /** parented to the rig's "Food" socket bone. sit_log keys that bone to the rear
   *  paw with +Z running along the paw-to-paw axis, so a prop authored along +Z
   *  from the rear grip sits in both paws and inherits the roasting roll. */
  prop?: PropAttachment;
  /** bolted to bones so they ride the animation - glasses on the head, tie on the chest */
  accessories?: Array<"glasses" | "tie">;
  /** held between two bones, for rigs with no socket to hang a prop from */
  handheld?: HandheldAttachment;
  /** euler radians applied INSIDE the placement, to correct a model authored in a
   *  different orientation. Separate from rotationY so facing still works normally. */
  modelRotation?: [number, number, number];
  /** runtime-animate the arms into a banjo-picking pose, overriding whatever the
   *  base clip writes for shoulder/upperarm/arm/hand on both sides. */
  banjoPlayer?: boolean;
  /** key into bearPoses.json - the bear-pose lab writes bone deltas and prop
   *  transforms under this key, and this Animal applies them every frame. */
  bearId?: "front_log" | "back_left_log" | "back_right_log" | "table";
  /** runtime-animate arms + legs into the rocking-chair pose authored in
   *  /scene-lab/rocking-chair-bear (rockingChairBearPose.json), the same
   *  hard-override technique banjoPlayer uses for its arms. */
  rockingChairPose?: boolean;
  /** Talking animation stays above the neck: no torso lean or chest breathing,
   *  so the arms (and whatever prop they hold) never move while this bear talks. */
  talkBodyStill?: boolean;
}

const ANIMALS: AnimalPlacement[] = [
  { url: WHITE_OWL_URL, position: [-1.6, 0.55, 2.4], rotationY: Math.PI, scale: 0.5, label: "white owl on front log" },
  { url: RED_OWL_URL, position: [-0.8, 0.55, 2.4], rotationY: Math.PI, scale: 0.5, label: "red owl on front log" },
  { url: TOUCAN_URL, position: [0, 0.55, 2.4], rotationY: Math.PI, scale: 3.6, label: "toucan on front log" },
  { url: DEER_URL, position: [0.8, 0, 2.4], rotationY: Math.PI, scale: 1.5, label: "deer next to front log", flatShading: true },
  { url: DOE_URL, position: [1.6, 0, 2.4], rotationY: Math.PI, scale: 1.45, label: "doe next to front log", flatShading: true },
  {
    url: BEAR_URL_FRONT_LOG, position: [0.4, 0, 2.4], bench: 0, rotationY: Math.PI, scale: 0.5,
    label: "bear on front log", animation: "sit_log", sitOnBench: true,
    animationOffset: 0, animationSpeed: 1, bearId: "front_log",
    prop: {
      url: FISH_STICK_URL,
      scale: 0.04,
      // Flip so the mouth end points along the stick's tip (+Z) instead of back
      // toward the bear. Fish is authored with tail at +Y, mouth at -Y.
      rotation: [-Math.PI / 2, 0, 0],
      // Push the fish out to the far end of the stick so the tip enters its
      // mouth. Stick runs from z = -stickLength/2 to +stickLength/2; the mouth
      // lands at fish_center - 0.16 after the 0.04 scale. For a 2.0 m stick,
      // 0.85 puts the mouth right on the tip.
      position: [0, 0, 0.85],
      stickLength: 2.0,
      stickRadius: 0.02,
    },
    accessories: ["glasses"],
  },
  {
    url: BEAR_URL, position: [-2.078, 0, -1.2], bench: 1, rotationY: Math.PI / 3, scale: 0.5,
    label: "bear on back-left log", animation: "sit_log", sitOnBench: true,
    animationOffset: 2.1, animationSpeed: 0.94, bearId: "back_left_log",
    // Body pose from sit_log; the arms are hard-overridden every frame by the
    // banjoPlayer path in Animal, which drives shoulder/upperarm/arm/hand into
    // a picking pose (fret hand sliding, pick hand strumming). The banjo prop
    // baseline below is the Food-local transform for the drum on the belly
    // with neck rising up-and-to-bear's-left.
    banjoPlayer: true,
    prop: {
      url: BANJO_URL,
      scale: BANJO_BEAR_POSE.bsc,
      position: [BANJO_BEAR_POSE.bpx, BANJO_BEAR_POSE.bpy, BANJO_BEAR_POSE.bpz],
      rotation: [BANJO_BEAR_POSE.brx, BANJO_BEAR_POSE.bry, BANJO_BEAR_POSE.brz],
      configKey: "banjoProp",
    },
    accessories: ["glasses"],
  },
  {
    url: BEAR_URL_BACK_RIGHT_LOG, position: [2.078, 0, -1.2], bench: 2, rotationY: -Math.PI / 3, scale: 0.5,
    label: "bear on back-right log", animation: "sit_log", sitOnBench: true,
    animationOffset: 4.3, animationSpeed: 1.07, bearId: "back_right_log",
    // Maple: talking animates head/face only - arms and fish stick stay put.
    talkBodyStill: true,
    prop: {
      url: FISH_STICK_URL,
      scale: 0.04,
      // Flip so the mouth end points along the stick's tip (+Z) instead of back
      // toward the bear. Fish is authored with tail at +Y, mouth at -Y.
      rotation: [-Math.PI / 2, 0, 0],
      // Push the fish out to the far end of the stick so the tip enters its
      // mouth. Stick runs from z = -stickLength/2 to +stickLength/2; the mouth
      // lands at fish_center - 0.16 after the 0.04 scale. For a 2.0 m stick,
      // 0.85 puts the mouth right on the tip.
      position: [0, 0, 0.85],
      stickLength: 2.0,
      stickRadius: 0.02,
    },
    accessories: ["tie"],
  },
];

/**
 * The real cub rig (BabyBear_Rig, mesh Baby_Bear) - a different model from the adult.
 *
 * The file needed a one-node patch before it would stand up. Its rig root carries a
 * +90 deg X rotation and parents BOTH the mesh and the skeleton; the skeleton undoes
 * it (its own root is a 180 deg X flip) but the mesh does not, and three.js multiplies
 * the skinned result by the mesh node's world matrix - which glTF says to ignore. So
 * the bones stood upright while the mesh lay on its back, sunk 0.345 below the floor.
 * Cancelling that rotation on the mesh node alone fixes it and leaves the bones alone.
 *
 * (SkinnedMesh.applyBoneTransform returns OBJECT space, before that matrix is applied,
 * which is what fooled me into calling this correct earlier. Measure in world space.)
 *
 * It now stands 0.427 with its feet on the floor through every idle pose, facing +Z -
 * about 41% the height of a seated adult, roughly right for a cub.
 *
 * The rig is a QUADRUPED: 37 joints, four legs, and no arm or hand bones at all. So a
 * controller is held between the two front paws (the `_dupli_001` set) rather than in
 * hands, and there is no sit action - they crouch over the game on all fours.
 */
const CUB_PAWS: [string, string] = ["toes_01_dupli_001.l", "toes_01_dupli_001.r"];

/** A controller, held between the front paws and wired to port `port`. */
const cub = (
  i: number,
  position: [number, number, number],
  rotationY: number,
  offset: number,
  speed: number
): AnimalPlacement => ({
  url: CUB_URL,
  position,
  rotationY,
  scale: 1,
  label: `cub ${i + 1}`,
  animation: "sit_cross",
  animationOffset: offset,
  animationSpeed: speed,
  handheld: {
    url: CONTROLLER_URL,
    scale: 1,
    bones: CUB_PAWS,
    // The cord leaves the controller toward -Z, so turn it half round to point the
    // lead the way the cub is facing - at the console - instead of behind it.
    rotation: [-0.2, Math.PI, 0],
    // up off the paws a little, and forward so it is in front of the chest
    offset: [0, 0.018, 0.03],
  },
});

/**
 * Four cubs in profile along the truck's flank, so the camera reads faces rather than
 * backs. Ordered by z to match the console's ports left-to-right, so no lead crosses
 * another. Speeds are mutually non-integer so the four never fall into lockstep.
 *
 * Kept as the original console-side row for reference; the current arcade
 * uses ARCADE_CUBS below (cubs sitting in front of a tailgate-mounted TV
 * stack) instead of standing next to a GameCube console.
 */
const CUBS: AnimalPlacement[] = [
  cub(0, [0.40, 0, -0.85], -Math.PI / 2 + 0.20, 1.4, 1.06),
  cub(1, [0.52, 0, -0.28], -Math.PI / 2 + 0.07, 5.7, 0.93),
  cub(2, [0.52, 0, 0.28], -Math.PI / 2 - 0.07, 3.1, 1.11),
  cub(3, [0.40, 0, 0.85], -Math.PI / 2 - 0.20, 0.6, 0.87),
];

void CUBS; // kept for reference; not rendered by the current ArcadeSector

/**
 * Four cubs sitting on the ground in front of the truck, facing back toward
 * it (rotY = PI, so their local -Z / face points at world -Z where the truck
 * sits with its tailgate down). Each cub holds a controller in its paws via
 * the shared `cub(...)` helper - which uses the "idle" clip - so from the
 * camera the shot reads as four kids on the floor watching the CRTs. Speeds
 * are mutually non-integer so the four never fall into lockstep.
 */
/**
 * Which cub is plugged into which socket, in socket order left to right.
 *
 * Both of those "left to right"s are the ARCADE CAMERA's, not the model's, and
 * they were checked rather than assumed: projecting each socket and each cub
 * onto that shot's right-vector puts the sockets in their model order
 * (screen-x -0.068, -0.053, -0.037, -0.022 for 0..3) and the cubs the other
 * way round - cub 3 sits at -0.345 and cub 2 at -0.181, so the bear on the
 * LEFT of frame is cub 3.
 *
 * Only the left pair is wired. The other two sockets stay empty - and empty
 * means empty: a plug sitting in a socket with no cord running out of it
 * looks more broken than a bare hole.
 */
const ARCADE_PORT_CUBS: readonly (string | null)[] = [
  "arcade_cub_3",   // port 1 - the bear on the left
  "arcade_cub_2",   // port 2 - the bear on the right
  null,
  null,
];

const ARCADE_CUBS: AnimalPlacement[] = [
  cub(0, [-0.55, 0, 1.75], Math.PI, 1.4, 1.06),
  cub(1, [-0.19, 0, 1.60], Math.PI, 5.7, 0.93),
  cub(2, [ 0.19, 0, 1.60], Math.PI, 3.1, 1.11),
  cub(3, [ 0.55, 0, 1.75], Math.PI, 0.6, 0.87),
];

/**
 * Console on the ground between the cubs and the truck, ports facing the cubs. A
 * -90 deg yaw turns its port face (local -Z) onto +X, which also lays its four ports
 * out along world +Z in the same order the cubs are sitting.
 */
const CONSOLE_BASE = { x: -0.62, y: 0, z: 0, rotY: -Math.PI / 2, scale: 1 };

/** Sits on the Chair in the contact location - seat height 0.42. */
const CONTACT_BEAR: AnimalPlacement = {
  url: BEAR_URL, position: [-0.95, 0.42, 0], rotationY: Math.PI / 2, scale: 0.5,
  label: "bear at the table", animation: "sit_log", animationOffset: 3.1, animationSpeed: 1,
  accessories: ["glasses"], bearId: "table",
};

/**
 * Sits in the rocking chair, rendered as a CHILD of the chair's own
 * Selectable (see cabin_rocking_chair in CabinSector) - not a sibling like
 * CONTACT_BEAR/contact_chair are. Position/rotation/scale below are a first
 * guess in the CHAIR'S LOCAL SPACE (seat height, facing) and are almost
 * certainly off; nudge them from the lab's object drawer by clicking the
 * bear directly (name "bear_rocking_chair"). Dragging the chair itself
 * (name "cabin_rocking_chair") moves both together.
 */
const ROCKING_CHAIR_BEAR: AnimalPlacement = {
  url: BEAR_OLD_URL, position: [0, 0.4, 0], rotationY: 0, scale: 0.5,
  label: "bear in the rocking chair", animation: "sit_log", animationOffset: 5.6, animationSpeed: 1,
  bearId: "table", rockingChairPose: true,
};

const seededRandom = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
};

function CameraRig({
  config,
  paused = false,
}: {
  config: CampfireSceneConfig;
  /** while the intro flight owns the camera, this rig must not touch it */
  paused?: boolean;
}) {
  const { camera } = useThree();
  const initialized = useRef(false);
  const lastConfigCamera = useRef<[number, number, number]>([config.cameraX, config.cameraY, config.cameraZ]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    lastConfigCamera.current = [config.cameraX, config.cameraY, config.cameraZ];
    if (paused) return;
    camera.position.set(config.cameraX, config.cameraY, config.cameraZ);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = config.fov;
      camera.updateProjectionMatrix();
    }
  }, [camera, config, paused]);

  useEffect(() => {
    const [lastX, lastY, lastZ] = lastConfigCamera.current;
    if (
      Math.abs(config.cameraX - lastX) > 0.001 ||
      Math.abs(config.cameraY - lastY) > 0.001 ||
      Math.abs(config.cameraZ - lastZ) > 0.001
    ) {
      lastConfigCamera.current = [config.cameraX, config.cameraY, config.cameraZ];
      if (!paused) camera.position.set(config.cameraX, config.cameraY, config.cameraZ);
    }
  }, [camera, config.cameraX, config.cameraY, config.cameraZ, paused]);

  useFrame(() => {
    if (paused) return;
    if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - config.fov) > 0.01) {
      camera.fov = config.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/**
 * Drives the camera when the site is running in panelled mode: it stands in the
 * empty middle and turns to face one location at a time.
 *
 * The position is derived from the ring rather than from cameraX/Y/Z, because the
 * camera is no longer orbiting one subject - it is pivoting between three of them,
 * and the pull-back that frames a location has to stay the same for all three.
 */
function LocationCamera({
  config,
  panel,
  active,
  suspended = false,
  editing = false,
}: {
  config: CampfireSceneConfig;
  panel: number;
  active: boolean;
  /** While true this hands the camera to someone else (the CRT close-up) and
   *  stops writing to it. On resume it re-seeds its interpolation state from
   *  wherever the camera actually ended up, so control comes back as a glide
   *  to this location's shot rather than a cut. */
  suspended?: boolean;
  /**
   * In the lab we want to orbit a location to frame it, so this rig has to let go.
   * It keeps the camera only while moving to a new shot - after a location change or
   * a slider nudge - and then hands over until the next one.
   */
  editing?: boolean;
}) {
  const { camera } = useThree();
  /**
   * The move is a TURN around the ring, not a slide between two points.
   *
   * Lerping the world camera and the world aim point independently makes both cut a
   * chord across the middle, and mid-way the camera ends up close to and above its
   * own aim - which reads as the camera dipping to look at the floor before coming
   * back up. Measured on Desk -> Campfire it spiked to 14.7 degrees of look-down with
   * the gap closing from 4.55m to 2.87m.
   *
   * So interpolate the ring ANGLE and the local shot instead. The camera swings round
   * the middle at a steady radius, always facing outward, and the horizon stays put:
   * the same move now glides 8.8 -> 6.5 degrees with no spike.
   */
  const angle = useRef<number | null>(null);
  const view = useRef<LocationView | null>(null);
  const scratch = useMemo(() => new THREE.Matrix4(), []);
  const aim = useMemo(() => new THREE.Vector3(), []);
  const lastPanel = useRef(panel);
  const lastView = useRef<LocationView | null>(null);
  const holding = useRef(true);

  const wasSuspended = useRef(false);

  useFrame((_, delta) => {
    if (!active) return;
    if (suspended) { wasSuspended.current = true; return; }
    if (wasSuspended.current) {
      wasSuspended.current = false;
      // Someone else moved the camera while we were out. Fold the pose they
      // left it in back into this location's frame and carry on from there -
      // otherwise the first frame after resuming snaps to the shot we were
      // still holding from before.
      if (view.current) {
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const look = camera.position.clone().addScaledVector(fwd, 3);
        Object.assign(view.current, worldToLocationView(
          panel, config,
          [camera.position.x, camera.position.y, camera.position.z],
          [look.x, look.y, look.z],
        ));
        angle.current = LOCATION_AZIMUTH(panel, config);
      }
      holding.current = true;
      lastView.current = null;
    }
    const wantAngle = LOCATION_AZIMUTH(panel, config);
    const wantView = locationView(panel, config);

    if (angle.current === null || !view.current) {
      angle.current = wantAngle;
      view.current = { ...wantView };
    }
    const cur = view.current;

    if (editing) {
      // Re-take the camera only when the shot we should be showing actually changes:
      // a different location, or this location's numbers edited from the panel.
      const prev = lastView.current;
      const moved =
        !prev ||
        LOCATION_VIEW_KEYS.some((f) => Math.abs(wantView[f] - prev[f]) > 1e-4);
      if (panel !== lastPanel.current || moved) {
        // Seed from the location we are leaving, so the turn starts where the camera
        // already is - orbiting saves that shot, so its saved view is where we are.
        if (panel !== lastPanel.current) {
          angle.current = LOCATION_AZIMUTH(lastPanel.current, config);
          Object.assign(cur, locationView(lastPanel.current, config));
        }
        lastPanel.current = panel;
        lastView.current = { ...wantView };
        holding.current = true;
      }
      if (!holding.current) return;
      const settled =
        Math.abs(shortestTurn(angle.current, wantAngle)) < 1e-4 &&
        LOCATION_VIEW_KEYS.every((f) => Math.abs(wantView[f] - cur[f]) < 1e-4);
      if (settled) {
        holding.current = false;
        return;
      }
    }

    // Frame-rate independent easing: reaches ~99% of the way in locationTurnSpeed
    // seconds whatever the frame rate.
    const settle = Math.max(0.05, config.locationTurnSpeed);
    const k = 1 - Math.pow(0.01, Math.min(delta, 1 / 20) / settle);

    // Shortest way round, so stepping 2 -> 0 turns one notch forward rather than
    // unwinding 240 degrees back through everything.
    angle.current += shortestTurn(angle.current, wantAngle) * k;
    for (const f of LOCATION_VIEW_KEYS) cur[f] += (wantView[f] - cur[f]) * k;

    ringMatrix(angle.current, config, scratch);
    camera.position.set(cur.cx, cur.cy, cur.cz).applyMatrix4(scratch);
    aim.set(cur.tx, cur.ty, cur.tz).applyMatrix4(scratch);
    camera.lookAt(aim);
  });

  return null;
}

/**
 * Flies the camera onto crt_0's glass, and off it again.
 *
 * This owns the camera itself rather than going through LocationCamera, and
 * that is the whole point: LocationCamera is mounted only when a location is
 * selected (`panelled`), so a close-up routed through it silently did nothing
 * in free-look - which is where the tube was actually being clicked. This
 * mounts unconditionally.
 *
 * `view` arrives in LOCATION_ARCADE's local frame (that is where crt_0 lives),
 * so it gets carried to world space through the same ring matrix the sector
 * itself uses.
 *
 * Handing back:
 *   - `handoff` true  (a location owns the camera): release the moment the
 *     focus ends. LocationCamera re-seeds from the pose we leave behind and
 *     glides to its own shot, so the return costs nothing here.
 *   - `handoff` false (free-look): nobody else is driving, so ease back to the
 *     pose we grabbed the camera at, then let go.
 */
function CrtFocusCamera({
  active,
  view,
  config,
  handoff,
  zoomRef,
}: {
  active: boolean;
  view: LocationView | null;
  config: CampfireSceneConfig;
  handoff: boolean;
  /** Written every frame with CRT_MUSIC's volume multiplier, eased from
   *  CRT_MUSIC_FAR_MULT (idle, out on the ring) to CRT_MUSIC_FOCUS_BOOST
   *  (arrived on the glass) in lockstep with the same flight the camera
   *  itself is making - so the loop rises as the tube actually gets closer
   *  instead of snapping the moment the camera arrives. A plain ref, not
   *  state: this changes every frame and nothing here needs a re-render
   *  for it - the CRT music hook reads it straight off its own rAF loop. */
  zoomRef?: React.MutableRefObject<number>;
}) {
  const { camera } = useThree();
  type Pose = { px: number; py: number; pz: number; tx: number; ty: number; tz: number };
  const pose = useRef<Pose | null>(null);
  const seed = useRef<Pose | null>(null);
  const zoomProgress = useRef(0);
  const scratch = useMemo(() => new THREE.Matrix4(), []);
  const goal = useMemo(() => new THREE.Vector3(), []);
  const aim = useMemo(() => new THREE.Vector3(), []);
  const fwd = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const settle = Math.max(0.05, config.locationTurnSpeed);
    const k = 1 - Math.pow(0.01, Math.min(delta, 1 / 20) / settle);

    // Same k the camera itself eases on, so the music's rise is locked to
    // the actual flight rather than running on a timer of its own.
    zoomProgress.current += ((active ? 1 : 0) - zoomProgress.current) * k;
    if (zoomRef) {
      zoomRef.current = CRT_MUSIC_FAR_MULT
        + (CRT_MUSIC_FOCUS_BOOST - CRT_MUSIC_FAR_MULT) * zoomProgress.current;
    }

    if (active && view) {
      if (!pose.current) {
        // Grab the camera where it stands, and remember it for the way back.
        camera.getWorldDirection(fwd);
        const look = camera.position.clone().addScaledVector(fwd, 3);
        pose.current = {
          px: camera.position.x, py: camera.position.y, pz: camera.position.z,
          tx: look.x, ty: look.y, tz: look.z,
        };
        seed.current = { ...pose.current };
      }
      locationMatrix(LOCATION_ARCADE, config, scratch);
      goal.set(view.cx, view.cy, view.cz).applyMatrix4(scratch);
      aim.set(view.tx, view.ty, view.tz).applyMatrix4(scratch);
      const p = pose.current;
      p.px += (goal.x - p.px) * k; p.py += (goal.y - p.py) * k; p.pz += (goal.z - p.pz) * k;
      p.tx += (aim.x - p.tx) * k;  p.ty += (aim.y - p.ty) * k;  p.tz += (aim.z - p.tz) * k;
      camera.position.set(p.px, p.py, p.pz);
      camera.lookAt(p.tx, p.ty, p.tz);
      return;
    }

    if (!pose.current || !seed.current) return;
    if (handoff) { pose.current = null; seed.current = null; return; }
    const p = pose.current, s = seed.current;
    p.px += (s.px - p.px) * k; p.py += (s.py - p.py) * k; p.pz += (s.pz - p.pz) * k;
    p.tx += (s.tx - p.tx) * k;  p.ty += (s.ty - p.ty) * k;  p.tz += (s.tz - p.tz) * k;
    camera.position.set(p.px, p.py, p.pz);
    camera.lookAt(p.tx, p.ty, p.tz);
    if (Math.abs(p.px - s.px) + Math.abs(p.py - s.py) + Math.abs(p.pz - s.pz) < 1e-3) {
      pose.current = null; seed.current = null;
    }
  });

  return null;
}

/**
 * Flies the camera onto the cabin computer's glass, and off it again.
 *
 * The same job CrtFocusCamera does for the arcade tube, but aimed off the
 * picture plane's own WORLD matrix instead of a shot written in a location's
 * frame: wherever the computer has been dragged, scaled or turned in the
 * lab, and wherever the ring has put the cabin, "straight in front of the
 * screen" is read off the mesh itself. Standoff and height are in screen
 * heights (pcFocusBack / pcFocusHeight), so the framing survives rescaling.
 */
function PcFocusCamera({
  active,
  screenRef,
  config,
  handoff,
  revealRef,
}: {
  active: boolean;
  screenRef: React.MutableRefObject<THREE.Mesh | null>;
  config: CampfireSceneConfig;
  handoff: boolean;
  /** OnlyBears: while `.reveal` is set the shot pulls back from the glass to
   *  show the bear behind the monitor (pcReveal* knobs), slower than the zoom. */
  revealRef?: React.MutableRefObject<OnlyBearsState>;
}) {
  const { camera } = useThree();
  type Pose = { px: number; py: number; pz: number; tx: number; ty: number; tz: number };
  const pose = useRef<Pose | null>(null);
  const seed = useRef<Pose | null>(null);
  const v = useMemo(() => ({
    center: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    up: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    fwd: new THREE.Vector3(),
  }), []);

  useFrame((_, delta) => {
    const reveal = !!revealRef?.current.reveal;
    // the pull-back is a slow, deliberate move - the reveal is the joke
    const settle = Math.max(0.05, config.locationTurnSpeed) * (reveal ? 1.9 : 1);
    const k = 1 - Math.pow(0.01, Math.min(delta, 1 / 20) / settle);
    const mesh = screenRef.current;

    if (active && mesh) {
      if (!pose.current) {
        camera.getWorldDirection(v.fwd);
        const look = camera.position.clone().addScaledVector(v.fwd, 3);
        pose.current = {
          px: camera.position.x, py: camera.position.y, pz: camera.position.z,
          tx: look.x, ty: look.y, tz: look.z,
        };
        seed.current = { ...pose.current };
      }
      mesh.updateWorldMatrix(true, false);
      mesh.getWorldPosition(v.center);
      mesh.getWorldQuaternion(v.q);
      mesh.getWorldScale(v.scale);
      v.normal.set(0, 0, 1).applyQuaternion(v.q);
      v.up.set(0, 1, 0).applyQuaternion(v.q);
      const h = PC_SCREEN_SIZE[1] * v.scale.y;
      const back = reveal ? config.pcRevealBack : config.pcFocusBack;
      const lift = reveal ? config.pcRevealHeight : config.pcFocusHeight;
      const aimUp = reveal ? config.pcRevealAimUp : 0;
      const gx = v.center.x + v.normal.x * back * h + v.up.x * lift * h;
      const gy = v.center.y + v.normal.y * back * h + v.up.y * lift * h;
      const gz = v.center.z + v.normal.z * back * h + v.up.z * lift * h;
      const ax = v.center.x + v.up.x * aimUp * h;
      const ay = v.center.y + v.up.y * aimUp * h;
      const az = v.center.z + v.up.z * aimUp * h;
      const p = pose.current;
      p.px += (gx - p.px) * k; p.py += (gy - p.py) * k; p.pz += (gz - p.pz) * k;
      p.tx += (ax - p.tx) * k; p.ty += (ay - p.ty) * k; p.tz += (az - p.tz) * k;
      camera.position.set(p.px, p.py, p.pz);
      camera.lookAt(p.tx, p.ty, p.tz);
      return;
    }

    if (!pose.current || !seed.current) return;
    if (handoff) { pose.current = null; seed.current = null; return; }
    const p = pose.current, s0 = seed.current;
    p.px += (s0.px - p.px) * k; p.py += (s0.py - p.py) * k; p.pz += (s0.pz - p.pz) * k;
    p.tx += (s0.tx - p.tx) * k;  p.ty += (s0.ty - p.ty) * k;  p.tz += (s0.tz - p.tz) * k;
    camera.position.set(p.px, p.py, p.pz);
    camera.lookAt(p.tx, p.ty, p.tz);
    if (Math.abs(p.px - s0.px) + Math.abs(p.py - s0.py) + Math.abs(p.pz - s0.pz) < 1e-3) {
      pose.current = null; seed.current = null;
    }
  });

  return null;
}

function OrbitCameraSaver({
  target,
  onChange,
  enabled = true,
  snapTo,
  snapSignal,
  livePoseRef,
}: {
  target: [number, number, number];
  onChange: (pos: [number, number, number], tgt: [number, number, number]) => void;
  enabled?: boolean;
  /** When present + snapSignal ticks, force the camera position and orbit target
   *  to these values imperatively - used by "Reset camera" to snap back to the
   *  last saved pose without losing the ObjectDragLayer / picking state. */
  snapTo?: { pos: [number, number, number]; tgt: [number, number, number] };
  snapSignal?: number;
  /** Ref the parent can read from to grab the current camera pose without
   *  waiting for a drag to end - lets "Save camera" commit whatever is on
   *  screen right now, even if the user hasn't touched the camera this
   *  session. Updated on every OrbitControls "change" event (cheap; just
   *  copies 6 numbers into the ref). */
  livePoseRef?: React.MutableRefObject<
    { pos: [number, number, number]; tgt: [number, number, number] } | null
  >;
}) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const userDraggingRef = useRef(false);

  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.enabled = enabled;
  }, [enabled]);

  // Seed the live pose ref once controls mount so a Save-without-drag has a
  // value to commit. OrbitControls fires "change" on any camera edit but not
  // reliably on first mount, so we take one manual reading here.
  useEffect(() => {
    if (!controlsRef.current || !livePoseRef) return;
    const controls = controlsRef.current;
    const cam = controls.object as THREE.PerspectiveCamera;
    const tgt = controls.target as THREE.Vector3;
    livePoseRef.current = {
      pos: [cam.position.x, cam.position.y, cam.position.z],
      tgt: [tgt.x, tgt.y, tgt.z],
    };
  }, [livePoseRef]);

  // Snap-to-saved values live in refs so the effect below only runs when the
  // user actually presses "Reset camera" (snapSignal ticks). If we depended on
  // snapTo directly, its inline-object identity would change every render and
  // the effect would fire constantly - which is what was yanking the camera
  // back to the saved pose mid-drag.
  const snapPosRef = useRef(snapTo?.pos);
  const snapTgtRef = useRef(snapTo?.tgt);
  snapPosRef.current = snapTo?.pos;
  snapTgtRef.current = snapTo?.tgt;
  // Skip the initial mount fire: snapSignal starts at 0 (or undefined) and
  // useEffect always runs once on mount. Without this the camera would jump
  // to the saved pose the moment the scene loads, cancelling the intro fly-in.
  const lastSnapSignalRef = useRef<number | undefined>(snapSignal);
  useEffect(() => {
    if (snapSignal == null) return;
    if (lastSnapSignalRef.current === snapSignal) return;
    lastSnapSignalRef.current = snapSignal;
    const controls = controlsRef.current;
    if (!controls) return;
    const pos = snapPosRef.current;
    const tgt = snapTgtRef.current;
    if (!pos || !tgt) return;
    const cam = controls.object as THREE.PerspectiveCamera;
    cam.position.set(pos[0], pos[1], pos[2]);
    (controls.target as THREE.Vector3).set(tgt[0], tgt[1], tgt[2]);
    cam.lookAt(controls.target as THREE.Vector3);
    controls.update();
  }, [snapSignal]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={target}
      enabled={enabled}
      enableDamping
      dampingFactor={0.12}
      minDistance={1.5}
      maxDistance={200}
      enablePan
      onChange={() => {
        // Populate the live pose ref every time controls fire "change", which
        // includes damping frames and even the initial settle. No setState here
        // - just copies to a ref, so 60 fps is fine.
        const controls = controlsRef.current;
        if (!controls || !livePoseRef) return;
        const cam = controls.object as THREE.PerspectiveCamera;
        const tgt = controls.target as THREE.Vector3;
        livePoseRef.current = {
          pos: [cam.position.x, cam.position.y, cam.position.z],
          tgt: [tgt.x, tgt.y, tgt.z],
        };
      }}
      onStart={() => { userDraggingRef.current = true; }}
      onEnd={() => {
        if (!userDraggingRef.current) return;
        userDraggingRef.current = false;
        const controls = controlsRef.current;
        if (!controls || !enabled) return;
        const cam = controls.object as THREE.PerspectiveCamera;
        const tgt = controls.target as THREE.Vector3;
        onChange(
          [cam.position.x, cam.position.y, cam.position.z],
          [tgt.x, tgt.y, tgt.z]
        );
      }}
    />
  );
}

/**
 * Wraps a child in a named clickable/draggable group. Reads its own row of
 * config.objectOverrides so dragging in the lab writes back onto that name.
 * Used for the "one-off" props (truck, CRTs, table, chair) that don't have
 * their own frame-driven override handling like Animal / GameCubeConsole do.
 *
 * Pass identity position/rotation/scale to the wrapped component - Selectable
 * carries the base transform so the drag delta composes cleanly.
 */
/**
 * Hover feedback for anything a visitor is meant to click.
 *
 * Without it there is no way to know an object is interactive until you have
 * already clicked it - and half of these only work ONCE, so a missed affordance
 * is a trick the visitor never finds. Two signals, because either alone is easy
 * to miss on a dark scene: the pointer changes, and the object lifts a little
 * out of the gloom.
 *
 * The lift is emissive rather than a scale or an outline: this scene is lit by
 * a single fire, so the thing that reads instantly is an object appearing to
 * catch more of the light. Every material's original emissive is cached on the
 * way in and restored on the way out, so a hover can never leave a prop glowing.
 */
/** The tint a clickable prop wears while the pointer is on it. Warm, as though
 *  the fire caught it - and the SAME everywhere, so "this does something" is
 *  one language across the scene rather than per-prop decoration. */
const HOVER_GLOW_COLOR = { r: 1, g: 0.86, b: 0.6 } as const;
const HOVER_GLOW_INTENSITY = 0.22;
const HOVER_CURSOR = "url('/cursors/pointer.svg') 14 14, pointer";

type GlowTarget = THREE.Object3D | RefObject<THREE.Object3D | null> | null | undefined;
type GlowCache = {
  root: THREE.Object3D;
  mats: { mat: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }[];
};

/**
 * Brighten everything under `target` while `lit`, and put it back when it goes
 * out. The pointer changes with it: a prop that lights up without the cursor
 * changing reads as decoration rather than as a button.
 *
 * Three things this has to get right, all of them learned the hard way:
 *
 *  - RESTORING MUST SURVIVE THE AFFORDANCE GOING AWAY. Clicking a prop is
 *    exactly the moment it stops being clickable - the click starts the fall,
 *    the fall drops the affordance - and an earlier version bailed out before
 *    touching the materials in that case. The warm emissive stayed on for the
 *    rest of the visit, so a bag lying on the ground went on glowing as though
 *    the cursor were still over it.
 *  - The materials are SHARED with drei's GLTF cache, so the original emissive
 *    and intensity are kept per material and written back verbatim. Anything
 *    less leaks a permanent glow into every other user of that model.
 *  - The cache is keyed on the ROOT it was collected from. Point this at a
 *    different object and the old one is put back first, or it keeps whatever
 *    it was wearing when the target moved on.
 */
function useHoverGlow(target: GlowTarget, lit: boolean) {
  const cache = useRef<GlowCache | null>(null);

  const restore = useCallback(() => {
    const c = cache.current;
    if (!c) return;
    for (const t of c.mats) {
      t.mat.emissive.copy(t.color);
      t.mat.emissiveIntensity = t.intensity;
      t.mat.needsUpdate = true;
    }
  }, []);

  useEffect(() => {
    const root = target && "current" in target ? target.current : target ?? null;
    if (cache.current && cache.current.root !== root) {
      restore();
      cache.current = null;
    }
    if (!root) return;
    if (!lit) { restore(); return; }
    if (!cache.current) {
      const mats: GlowCache["mats"] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.material) return;
        for (const raw of Array.isArray(m.material) ? m.material : [m.material]) {
          const std = raw as THREE.MeshStandardMaterial;
          if (std && "emissive" in std) {
            mats.push({ mat: std, color: std.emissive.clone(), intensity: std.emissiveIntensity ?? 1 });
          }
        }
      });
      cache.current = { root, mats };
    }
    for (const t of cache.current.mats) {
      t.mat.emissive.setRGB(HOVER_GLOW_COLOR.r, HOVER_GLOW_COLOR.g, HOVER_GLOW_COLOR.b);
      t.mat.emissiveIntensity = HOVER_GLOW_INTENSITY;
      t.mat.needsUpdate = true;
    }
  }, [target, lit, restore]);

  // and if the prop unmounts while lit, put the shared material back
  useEffect(() => restore, [restore]);

  useEffect(() => {
    if (!lit) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = HOVER_CURSOR;
    // Restore on unmount too: these props get carried off mid-hover, and a
    // cursor left pointing at nothing would stick for the rest of the visit.
    return () => { document.body.style.cursor = prev; };
  }, [lit]);
}

/**
 * Hover affordance for a Selectable: same glow, but it owns the group ref the
 * caller wraps its children in.
 */
function useHoverLift(hovered: boolean, enabled: boolean) {
  const group = useRef<THREE.Group>(null);
  useHoverGlow(group, hovered && enabled);
  return group;
}

function Selectable({
  name,
  onSelect,
  config,
  basePosition = [0, 0, 0],
  baseRotationY = 0,
  baseScale = 1,
  hidden = false,
  interactive = false,
  children,
}: {
  name: string;
  onSelect: (name: string) => void;
  config: CampfireSceneConfig;
  basePosition?: [number, number, number];
  baseRotationY?: number;
  baseScale?: number;
  /** Runtime hide, as opposed to the config's own `hide` slider. Set while a
   *  critter is carrying this object off - what you can see is its clone in a
   *  mouth or a set of talons, and leaving the original standing there would
   *  give the game away. */
  hidden?: boolean;
  /** true = this one does something when clicked, so advertise it on hover */
  interactive?: boolean;
  children: ReactNode;
}) {
  return (
    <SelectableInner
      name={name} onSelect={onSelect} config={config} basePosition={basePosition}
      baseRotationY={baseRotationY} baseScale={baseScale} hidden={hidden}
      interactive={interactive}
    >
      {children}
    </SelectableInner>
  );
}

function SelectableInner({
  name, onSelect, config, basePosition = [0, 0, 0], baseRotationY = 0,
  baseScale = 1, hidden = false, interactive = false, children,
}: {
  name: string;
  onSelect: (name: string) => void;
  config: CampfireSceneConfig;
  basePosition?: [number, number, number];
  baseRotationY?: number;
  baseScale?: number;
  hidden?: boolean;
  interactive?: boolean;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const liftRef = useHoverLift(hovered && interactive, interactive);
  // onPointerOut is unmounted along with interactivity, so without this the
  // flag would stay true forever on a prop that was clicked mid-hover.
  useEffect(() => { if (!interactive) setHovered(false); }, [interactive]);
  const o = config.objectOverrides?.[name] ?? EMPTY_OVERRIDE;
  if (hidden || o.hide >= 0.5) return null;
  return (
    <group
      name={name}
      position={[basePosition[0] + o.dx, basePosition[1] + o.dy, basePosition[2] + o.dz]}
      // XZY so rotY (heading) is applied first extrinsically, then rotZ and rotX
      // are world-fixed axes. Slider "tilt fwd/back" always tips around world X,
      // "tilt left/right" always rolls around world Z, regardless of heading.
      rotation={new THREE.Euler(o.rotX, baseRotationY + o.rotY, o.rotZ, "XZY")}
      scale={baseScale * o.scale}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(name); }}
      onPointerOver={interactive ? (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); } : undefined}
      onPointerOut={interactive ? (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(false); } : undefined}
    >
      <group ref={liftRef}>{children}</group>
    </group>
  );
}

function ObjectDragLayer({
  children,
  selectedObject,
  mode,
  config,
  onTranslate,
}: {
  children: ReactNode;
  selectedObject: string | null;
  mode: DragPlaneMode;
  config: CampfireSceneConfig;
  onTranslate: (name: string, next: Pick<ObjectOverride, "dx" | "dy" | "dz">) => void;
}) {
  const dragPlane = useMemo(() => new THREE.Plane(), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);
  // --- why objects used to shoot off across the map -------------------------
  //
  // The xz drag plane is horizontal (normal 0,1,0) and this camera looks along
  // it at a shallow angle: it sits at locationCameraHeight ~4.55 aiming at
  // ~0.9, from ~16 back, so the view is only about 13 degrees below level. As
  // the pointer approaches the horizon the ray becomes parallel to the plane
  // and the intersection races off toward infinity - a couple of pixels of
  // mouse movement becoming tens of world units. Above the horizon it flips
  // sign and lands BEHIND the camera.
  //
  // The old code only had MAX_DRAG_DISTANCE = 20 to lean on, which didn't stop
  // the teleport so much as decide how far it went - and 20 units is wider
  // than the entire camp, which is how the cabin ended up 26 units out.
  //
  // Fixed at the source instead: an intersection is only accepted when the ray
  // meets the plane at a usable angle and lands somewhere plausible. Drag past
  // that and the object simply stops following rather than flinging itself.
  //
  /** sin of the ray/plane angle below which the hit point is unusable (~4.6 deg). */
  const MIN_PLANE_INCIDENCE = 0.08;
  /** hits further than this from the camera are the runaway, not a real target. */
  const MAX_PICK_DISTANCE = 80;
  /** Cap on total displacement from where the drag began, per axis. Generous
   *  enough for any real placement; release and re-drag to go further. */
  const MAX_DRAG_DISTANCE = 8;
  const dragRef = useRef<{
    name: string;
    parent: THREE.Object3D;
    /** Plane-space point captured at pointerDown, in parent's local frame. */
    startLocalPoint: THREE.Vector3;
    startOverride: ObjectOverride;
  } | null>(null);

  const findSelectedAncestor = (hit: THREE.Object3D) => {
    if (!selectedObject) return null;
    let node: THREE.Object3D | null = hit;
    while (node) {
      if (node.name === selectedObject) return node;
      node = node.parent;
    }
    return null;
  };

  const intersectDragPlane = (event: ThreeEvent<PointerEvent>) => {
    // Reject grazing rays before trusting the intersection at all: near the
    // horizon the hit point is numerically meaningless and jumps enormously
    // for sub-pixel pointer movement.
    if (Math.abs(event.ray.direction.dot(dragPlane.normal)) < MIN_PLANE_INCIDENCE) return null;
    if (!event.ray.intersectPlane(dragPlane, intersection)) return null;
    if (intersection.distanceTo(event.ray.origin) > MAX_PICK_DISTANCE) return null;
    return intersection.clone();
  };

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!selectedObject) return;
    const object = findSelectedAncestor(event.object);
    if (!object?.parent) return;

    event.stopPropagation();
    (event.target as unknown as Element).setPointerCapture?.(event.pointerId);

    object.updateWorldMatrix(true, false);
    object.parent.updateWorldMatrix(true, false);

    const worldPosition = new THREE.Vector3();
    object.getWorldPosition(worldPosition);
    dragPlane.setFromNormalAndCoplanarPoint(
      mode === "xz" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1),
      worldPosition
    );

    const startWorldPoint = intersectDragPlane(event) ?? worldPosition;
    // Duplicates carry their offset in objectDuplicates, not objectOverrides -
    // read from the right store so a drag continues from the current position
    // instead of jumping back to the source's override baseline.
    const startOverride = selectedObject.startsWith(DUPLICATE_PREFIX)
      ? (config.objectDuplicates?.[selectedObject] ?? EMPTY_OVERRIDE)
      : (config.objectOverrides?.[selectedObject] ?? EMPTY_OVERRIDE);

    dragRef.current = {
      name: selectedObject,
      parent: object.parent,
      startLocalPoint: object.parent.worldToLocal(startWorldPoint.clone()),
      startOverride: {
        dx: startOverride.dx,
        dy: startOverride.dy,
        dz: startOverride.dz,
        rotX: 0, rotY: 0, rotZ: 0, scale: 1, hide: 0,
      },
    };
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    if (!drag) return;

    event.stopPropagation();
    const worldPoint = intersectDragPlane(event);
    if (!worldPoint) return;

    // Delta from the drag-start reference in the parent's local frame. Using
    // an anchored delta (instead of a marching last-point) means a jittery
    // grazing-angle intersection can't flip the sign of the step and reverse
    // the drag direction - each move just recomputes the total displacement.
    const localPoint = drag.parent.worldToLocal(worldPoint.clone());
    const clamp = (v: number) => (v > MAX_DRAG_DISTANCE ? MAX_DRAG_DISTANCE : v < -MAX_DRAG_DISTANCE ? -MAX_DRAG_DISTANCE : v);
    const deltaX = clamp(localPoint.x - drag.startLocalPoint.x);
    const deltaY = clamp(localPoint.y - drag.startLocalPoint.y);
    const deltaZ = clamp(localPoint.z - drag.startLocalPoint.z);

    onTranslate(drag.name, {
      dx: drag.startOverride.dx + deltaX,
      dy: mode === "xy" ? drag.startOverride.dy + deltaY : drag.startOverride.dy,
      dz: mode === "xz" ? drag.startOverride.dz + deltaZ : drag.startOverride.dz,
    });
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current) return;
    event.stopPropagation();
    (event.target as unknown as Element).releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  return (
    <group
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {children}
    </group>
  );
}

/**
 * Locks named objects out of the raycaster so clicks pass through to whatever
 * is behind. For each name flagged in config.lockedObjects, walks that node's
 * descendants and replaces `mesh.raycast` with a noop; restores the original
 * on unlock or when the entry is cleared. Runs from a useFrame so it picks up
 * newly-mounted objects (bears loading async, duplicates spawning) without
 * needing every component to opt in to a hook.
 */
function LockLayer({ config }: { config: CampfireSceneConfig }) {
  const scene = useThree((state) => state.scene);
  // Original raycast fn keyed by mesh, so unlocking restores exactly what was
  // there before (respects any custom raycast set by drei or by us elsewhere).
  const origRef = useRef<Map<THREE.Mesh, THREE.Mesh["raycast"]>>(new Map());
  const noop = useMemo<THREE.Mesh["raycast"]>(() => () => {}, []);
  // Latest-config pattern used by every other useFrame in this file: r3f's
  // useFrame captures the callback identity, and stale-config bugs are hard to
  // spot when the layer LOOKS right but silently uses last render's map. Keep
  // this consistent with WoodLogBench / Location / SocketProp.
  const cfgRef = useRef(config);
  cfgRef.current = config;

  useFrame(() => {
    const locked = cfgRef.current.lockedObjects || {};
    // Compute the current set of meshes that should be non-raycasting.
    const shouldBeLocked = new Set<THREE.Mesh>();
    for (const [name, on] of Object.entries(locked)) {
      if (!on) continue;
      const root = scene.getObjectByName(name);
      if (!root) continue;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) shouldBeLocked.add(m);
      });
    }
    // Unlock meshes that were locked before but aren't anymore.
    for (const [mesh, orig] of origRef.current) {
      if (!shouldBeLocked.has(mesh)) {
        mesh.raycast = orig;
        origRef.current.delete(mesh);
      }
    }
    // Lock meshes that should be locked and aren't yet.
    for (const mesh of shouldBeLocked) {
      if (!origRef.current.has(mesh)) {
        origRef.current.set(mesh, mesh.raycast);
        mesh.raycast = noop;
      }
    }
  });

  return null;
}

/**
 * Scene-wide "don't cast shadow" enforcer. Named groups aren't all wrapped in
 * Selectable - Camper/Tent/Bonfire/Benches/Animals/Fish are all custom
 * components with their own top-level <group name="..."> - so a Selectable-
 * scoped effect can't reach them. This layer walks the whole scene each
 * frame, resolves every override with noShadow=1 to its named group, and
 * stamps castShadow=false on descendants. Meshes we flipped off get
 * restored to true when the flag flips back. Uses the same "keep an origRef"
 * pattern as LockLayer so we don't clobber meshes that legitimately have
 * castShadow=false (flame cones, sparks, glow discs).
 */
function ShadowLayer({ config }: { config: CampfireSceneConfig }) {
  const scene = useThree((state) => state.scene);
  // Meshes we currently have suppressed. Original castShadow value stored so
  // "un-flag" restores exactly what we found (usually true, but not always).
  const originalRef = useRef<Map<THREE.Mesh, boolean>>(new Map());
  const cfgRef = useRef(config);
  cfgRef.current = config;

  useFrame(() => {
    const overrides = cfgRef.current.objectOverrides || {};
    const duplicates = cfgRef.current.objectDuplicates || {};
    const shouldSuppress = new Set<THREE.Mesh>();
    const collect = (name: string) => {
      const root = scene.getObjectByName(name);
      if (!root) return;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) shouldSuppress.add(m);
      });
    };
    for (const [name, ov] of Object.entries(overrides)) {
      if (!ov || (ov.noShadow ?? 0) < 0.5) continue;
      collect(name);
    }
    for (const [name, dup] of Object.entries(duplicates)) {
      if (!dup || (dup.noShadow ?? 0) < 0.5) continue;
      collect(name);
    }
    // Restore meshes that were suppressed before but aren't anymore.
    for (const [mesh, orig] of originalRef.current) {
      if (!shouldSuppress.has(mesh)) {
        mesh.castShadow = orig;
        originalRef.current.delete(mesh);
      }
    }
    // Suppress meshes that should be off and aren't yet.
    for (const mesh of shouldSuppress) {
      if (!originalRef.current.has(mesh)) {
        originalRef.current.set(mesh, mesh.castShadow);
        mesh.castShadow = false;
      }
    }
  });

  return null;
}

/**
 * Global blueprint registry for animated source objects. Any component that
 * wants its duplicates to keep animating (rather than freeze into a pose)
 * registers here with the source object's name. DuplicatesLayer looks up
 * this map on clone: if a blueprint is found, it spins up a fresh
 * AnimationMixer on the clone and plays the same clip the source is playing,
 * so the copy stays alive instead of standing still.
 *
 * Registration is idempotent - same name overwrites - and cleaned up on
 * unmount so a stale entry can't point at a torn-down object.
 */
type AnimationBlueprint = {
  clips: THREE.AnimationClip[];
  clipName?: string;
  offset?: number;
  speed?: number;
};
const duplicateAnimationBlueprints = new Map<string, AnimationBlueprint>();
function registerDuplicateAnimation(name: string, bp: AnimationBlueprint) {
  duplicateAnimationBlueprints.set(name, bp);
}
function unregisterDuplicateAnimation(name: string) {
  duplicateAnimationBlueprints.delete(name);
}

/**
 * Universal duplicate renderer. Finds each duplicate entry's source by name
 * anywhere in the r3f scene graph, snapshots its world transform on first
 * sight, clones the subtree (SkeletonUtils for anything with a SkinnedMesh so
 * bones don't tear, plain deep clone otherwise), and re-applies user deltas
 * every frame. The clone is a static snapshot of the source's pose - if the
 * source keeps animating, the clone stays in its first-seen pose, which is the
 * behavior "duplicate" implies (a frozen copy you can then move around).
 */
function DuplicatesLayer({
  config,
  onSelect,
}: {
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
}) {
  const scene = useThree((state) => state.scene);
  const hostRef = useRef<THREE.Group>(null!);
  type Snapshot = {
    clone: THREE.Object3D;
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    scale: THREE.Vector3;
    /** Present when the source registered an AnimationBlueprint. Ticked each
     *  frame so the cloned bear keeps playing sit_log alongside its original. */
    mixer?: THREE.AnimationMixer;
  };
  const snapshotsRef = useRef<Map<string, Snapshot>>(new Map());
  // First-sight bookkeeping: DuplicatesLayer's useFrame subscribes BEFORE the
  // Location and WoodLogBench components below it in the JSX, so on frame 1 the
  // source's parent transforms haven't been written yet (Location's position is
  // still (0,0,0) at that instant). Capturing then would freeze the clone at a
  // stale origin pose, and it would visibly sit at world origin instead of next
  // to its source. Wait until we've been called `CAPTURE_WAIT_FRAMES` times
  // with the source present, so all sibling useFrames have run and world
  // matrices are current, then capture.
  const seenCountRef = useRef<Map<string, number>>(new Map());
  const CAPTURE_WAIT_FRAMES = 2;

  useFrame((_, delta) => {
    const host = hostRef.current;
    if (!host) return;
    const duplicates = config.objectDuplicates || {};
    const map = snapshotsRef.current;
    const counts = seenCountRef.current;
    const seen = new Set<string>();

    for (const [id, dup] of Object.entries(duplicates)) {
      seen.add(id);
      let snap = map.get(id);
      if (!snap) {
        // Source lookup is intentionally global: any named node anywhere in the
        // scene tree qualifies, so a duplicate works whether the source is a
        // captured GLB node, a Selectable, a Camper, a Bench, an Animal, etc.
        const source = scene.getObjectByName(dup.source);
        if (!source) continue;
        // Defer capture until sibling useFrames have written their transforms
        // this frame (see comment on seenCountRef above).
        const count = (counts.get(id) ?? 0) + 1;
        counts.set(id, count);
        if (count < CAPTURE_WAIT_FRAMES) continue;
        // Force a world-matrix pass so getWorldPosition/Quaternion return the
        // pose the current frame renders, not a stale one from mount.
        source.updateWorldMatrix(true, false);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scaleV = new THREE.Vector3();
        source.getWorldPosition(pos);
        source.getWorldQuaternion(quat);
        source.getWorldScale(scaleV);
        const hasSkinned = (() => {
          let found = false;
          source.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) found = true; });
          return found;
        })();
        const clone = hasSkinned
          ? (skeletonClone(source) as THREE.Object3D)
          : (source.clone(true) as THREE.Object3D);
        clone.name = id;
        clone.visible = true;
        host.add(clone);

        // If the source published animation clips, spin up a fresh mixer on
        // the clone and start the same clip. Clips reference bones by name and
        // SkeletonUtils.clone preserves those names, so this rebinds cleanly.
        // A fresh mixer means the clone advances on its own — moving it around
        // doesn't pause it, and it isn't yoked to the original's mixer.
        const bp = duplicateAnimationBlueprints.get(dup.source);
        let mixer: THREE.AnimationMixer | undefined;
        if (bp && bp.clips.length) {
          mixer = new THREE.AnimationMixer(clone);
          const wantedName = bp.clipName;
          const clip =
            (wantedName ? bp.clips.find((c) => c.name === wantedName) : null)
            ?? (wantedName ? bp.clips.find((c) => c.name.toLowerCase().includes(wantedName.toLowerCase())) : null)
            ?? bp.clips[0];
          if (clip) {
            const action = mixer.clipAction(clip);
            action.reset().play();
            action.time = bp.offset ?? 0;
            action.timeScale = bp.speed ?? 1;
          }
        }

        snap = { clone, pos, quat, scale: scaleV, mixer };
        map.set(id, snap);
      }
      if (snap.mixer) snap.mixer.update(delta);
      // Apply user deltas on top of the frozen snapshot. Position adds in world
      // units; rotation composes the snapshot's world orientation with an XZY
      // Euler (heading first, then world-Z roll, then world-X pitch) so tilts
      // stay world-fixed. Scale is a uniform multiplier off the snapshot.
      snap.clone.position.copy(snap.pos).add(new THREE.Vector3(dup.dx, dup.dy, dup.dz));
      const rotDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(dup.rotX, dup.rotY, dup.rotZ, "XZY")
      );
      snap.clone.quaternion.copy(snap.quat).multiply(rotDelta);
      snap.clone.scale.copy(snap.scale).multiplyScalar(dup.scale);
    }

    for (const [id, snap] of map) {
      if (!seen.has(id)) {
        snap.mixer?.stopAllAction();
        host.remove(snap.clone);
        map.delete(id);
        counts.delete(id);
      }
    }
    for (const id of counts.keys()) {
      if (!seen.has(id)) counts.delete(id);
    }
  });

  return (
    <group
      ref={hostRef}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        let node: THREE.Object3D | null = e.object;
        while (node) {
          if (node.name.startsWith(DUPLICATE_PREFIX)) {
            onSelect(node.name);
            return;
          }
          node = node.parent;
        }
      }}
    />
  );
}

interface CapturedNode {
  node: THREE.Object3D;
  /** the parent it was detached from, so a delete can be undone */
  parent: THREE.Object3D | null;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  /** the node's own pitch/roll from the GLB - tilt overrides are added on top of these
   *  rather than replacing them, so nothing that was already angled snaps upright. */
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  visible: boolean;
}

type TreeOriginal = CapturedNode;

function CampfireSceneModel({
  config,
  onSelect,
}: {
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
}) {
  const gltf = useGLTF(CAMPFIRE_SCENE_URL) as unknown as { scene: THREE.Group };
  const [fireHot, setFireHot] = useState(false);
  const { scene, trees, bonfire, campItems, namedNodes } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const toRemove: THREE.Object3D[] = [];
    const treeOriginals: TreeOriginal[] = [];
    const campItemOriginals: CapturedNode[] = [];
    let bonfireNode: CapturedNode | null = null as CapturedNode | null;
    const seenTreeNodes = new Set<THREE.Object3D>();
    const nameMap = new Map<string, CapturedNode>();

    const capture = (obj: THREE.Object3D): CapturedNode => ({
      node: obj,
      parent: obj.parent,
      position: obj.position.clone(),
      scale: obj.scale.clone(),
      rotationX: obj.rotation.x,
      rotationY: obj.rotation.y,
      rotationZ: obj.rotation.z,
      visible: true,
    });

    cloned.traverse((object) => {
      const name = (object.name || "").toLowerCase();
      if (object instanceof THREE.Mesh) {
        // The pack ships a 60x60 flat slab as node "ground" (its geometry is "Plane"),
        // which this catches - the circular CampfireGround stands in for it.
        if (name.includes("plane") || name.includes("ground") || name.includes("floor")) {
          toRemove.push(object);
          return;
        }
        object.castShadow = true;
        object.receiveShadow = true;
        if (Array.isArray(object.material)) {
          object.material = object.material.map((m) => m.clone());
        } else if (object.material) {
          object.material = object.material.clone();
        }
      }

      const isTree = name.startsWith("tree_") || name.includes("pine");
      const captured = capture(object);
      if (isTree) {
        let parent = object.parent;
        let ancestorAlreadyTracked = false;
        while (parent) {
          if (seenTreeNodes.has(parent)) {
            ancestorAlreadyTracked = true;
            break;
          }
          parent = parent.parent;
        }
        if (!ancestorAlreadyTracked && !seenTreeNodes.has(object)) {
          seenTreeNodes.add(object);
          treeOriginals.push(captured);
          nameMap.set(object.name, captured);
        }
      } else if (name === "bonfire" && !bonfireNode) {
        bonfireNode = captured;
        nameMap.set(object.name, captured);
      } else if (name === "tent") {
        // superseded by the standalone <Tent> below - drop it so there aren't two
        toRemove.push(object);
        return;
      } else if (name.startsWith("camp_item_")) {
        campItemOriginals.push(captured);
        nameMap.set(object.name, captured);
      }
    });
    toRemove.forEach((obj) => obj.parent?.remove(obj));
    return {
      scene: cloned,
      trees: treeOriginals,
      bonfire: bonfireNode,
      campItems: campItemOriginals,
      namedNodes: nameMap,
    };
  }, [gltf.scene]);

  const cfgRef = useRef(config);
  cfgRef.current = config;

  useFrame(() => {
    const c = cfgRef.current;
    const overrides = c.objectOverrides || {};
    const applyOverride = (
      captured: CapturedNode,
      basePos: [number, number, number],
      baseRotY: number,
      baseScale: [number, number, number],
      hiddenByBulk = false
    ) => {
      const o = overrides[captured.node.name] ?? EMPTY_OVERRIDE;

      // A deleted object is detached from the scene graph outright - not rendered,
      // not raycast, not traversed, not costing anything. Re-attached on restore.
      if (o.hide >= 0.5) {
        if (captured.node.parent) captured.node.parent.remove(captured.node);
        return;
      }
      if (!captured.node.parent && captured.parent) captured.parent.add(captured.node);

      captured.node.position.set(basePos[0] + o.dx, basePos[1] + o.dy, basePos[2] + o.dz);
      // XZY: heading applied first, then world-Z roll, then world-X pitch. Keeps
      // tilt sliders anchored to world axes so they don't flip with rotY.
      captured.node.rotation.set(
        captured.rotationX + o.rotX,
        baseRotY + o.rotY,
        captured.rotationZ + o.rotZ,
        "XZY"
      );
      captured.node.scale.set(baseScale[0] * o.scale, baseScale[1] * o.scale, baseScale[2] * o.scale);
      // treeCloseRadius is a bulk view cull, not a deletion - visibility is right here.
      captured.node.visible = !hiddenByBulk;
    };

    for (const t of trees) {
      const px = t.position.x * c.treeSpread;
      const pz = t.position.z * c.treeSpread;
      const dist = Math.hypot(px, pz);
      const hiddenByBulk = dist < c.treeCloseRadius;
      applyOverride(
        t,
        [px, t.position.y + c.treeY, pz],
        t.rotationY,
        [t.scale.x * c.treeScale, t.scale.y * c.treeScale, t.scale.z * c.treeScale],
        hiddenByBulk
      );
    }

    if (bonfire) {
      // Unified "campfire" override slides the log along with the flame group,
      // so a single drag translates the whole assembly. The individual bonfire
      // override still carries scale/rotation tweaks.
      const campfireOffset = overrides["campfire"] ?? EMPTY_OVERRIDE;
      applyOverride(
        bonfire,
        [
          bonfire.position.x + c.bonfireX + campfireOffset.dx,
          bonfire.position.y + c.bonfireY + campfireOffset.dy,
          bonfire.position.z + c.bonfireZ + campfireOffset.dz,
        ],
        bonfire.rotationY + c.bonfireRotationY,
        [bonfire.scale.x * c.bonfireScale, bonfire.scale.y * c.bonfireScale, bonfire.scale.z * c.bonfireScale]
      );
    }

    for (const item of campItems) {
      applyOverride(
        item,
        [item.position.x * c.campItemsSpread, item.position.y + c.campItemsY, item.position.z * c.campItemsSpread],
        item.rotationY,
        [item.scale.x * c.campItemsScale, item.scale.y * c.campItemsScale, item.scale.z * c.campItemsScale]
      );
    }

  });

  /*
   * The fire lights under the pointer like every other clickable prop.
   *
   * It cannot use a Selectable's hover for this: the log is a node INSIDE this
   * GLB rather than something wrapped in a group of its own, which is the same
   * reason the click below has to walk up from whatever mesh was hit. So the
   * hover is resolved the same way, and only the log counts - the flame, the
   * sparks and the glow disc are decoration routed elsewhere.
   *
   * Gated on the burst actually being armed. A prop that brightens and then
   * does nothing when clicked is worse than one that never brightened.
   */
  const fireClickable = config.fireClickBurstOn >= 0.5;
  const hitName = (obj: THREE.Object3D) => {
    let node: THREE.Object3D | null = obj;
    while (node && !namedNodes.has(node.name)) node = node.parent;
    return node?.name ?? "";
  };
  useHoverGlow(bonfire?.node ?? null, fireClickable && fireHot);

  return (
    <primitive
      object={scene}
      position={[config.sceneX, config.sceneY, config.sceneZ]}
      rotation={[0, config.sceneRotationY, 0]}
      scale={config.sceneScale}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        const on = fireClickable && hitName(e.object) === "bonfire";
        if (on !== fireHot) setFireHot(on);
      }}
      onPointerOut={() => { if (fireHot) setFireHot(false); }}
      onClick={(e: THREE.Event & { object: THREE.Object3D; stopPropagation: () => void }) => {
        // stopPropagation ONLY once we've actually resolved a name. It used to
        // fire unconditionally at the top, which meant a click landing on any
        // mesh in this GLB that doesn't walk up to a named node was swallowed:
        // nothing got selected, AND nothing behind it ever saw the click. From
        // the outside that reads as "clicking this tree does nothing".
        let node: THREE.Object3D | null = e.object;
        while (node) {
          // Duplicate clones carry their id as the top-level name; check that
          // first so a click on a duplicate selects the duplicate itself and
          // not the underlying source it was cloned from.
          if (node.name.startsWith(DUPLICATE_PREFIX)) {
            e.stopPropagation();
            onSelect(node.name);
            return;
          }
          if (namedNodes.has(node.name)) {
            // Clicks on the bonfire log route to the unified "campfire" object
            // (log + flame + sparks + glow) so it can be selected and dragged
            // as one thing. The individual bonfire override still handles
            // scale/rotation independently.
            e.stopPropagation();
            onSelect(node.name === "bonfire" ? "campfire" : node.name);
            return;
          }
          node = node.parent;
        }
      }}
    />
  );
}

interface FlameConeProps {
  color: string;
  opacity: number;
  radius: number;
  height: number;
  phase: number;
  y: number;
}

function FlameCone({ color, opacity, radius, height, phase, y }: FlameConeProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const time = clock.elapsedTime;
    const sway = Math.sin(time * 4.2 + phase) * 0.045;
    const pulse = 1 + Math.sin(time * 7.5 + phase) * 0.08 + Math.sin(time * 13.1 + phase) * 0.035;

    meshRef.current.rotation.z = sway;
    meshRef.current.scale.set(pulse, 1 + Math.sin(time * 5 + phase) * 0.08, pulse);
  });

  return (
    <mesh ref={meshRef} position={[0, y, 0]} rotation={[0, phase, 0]}>
      <coneGeometry args={[radius, height, 9, 1]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** One animated cone with knobs for how fast it sways and how big it pulses -
 *  the CandleFlame stack uses three of these to sell a lit wick from any
 *  angle. Split out from FlameCone so the campfire's timing constants aren't
 *  disturbed while the lab tunes the lantern flame. */
function AnimatedCone({
  color,
  opacity,
  radius,
  height,
  phase,
  y,
  speed,
  swayAmount,
  pulseAmount,
}: {
  color: string;
  opacity: number;
  radius: number;
  height: number;
  phase: number;
  y: number;
  speed: number;
  swayAmount: number;
  pulseAmount: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime * speed;
    m.rotation.z = Math.sin(t * 4.2 + phase) * swayAmount;
    const p = 1 + (Math.sin(t * 7.5 + phase) * 0.08 + Math.sin(t * 13.1 + phase) * 0.035) * pulseAmount;
    m.scale.set(p, 1 + Math.sin(t * 5 + phase) * 0.08 * pulseAmount, p);
  });
  return (
    <mesh ref={ref} position={[0, y, 0]} rotation={[0, phase, 0]}>
      <coneGeometry args={[radius, height, 9, 1]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/** Small animated candle flame - three nested AnimatedCones plus a soft halo,
 *  mirroring the campfire flame stack at tiny size. Additive blending on the
 *  cones plus a brightness multiplier make the wick read HOT even against a
 *  dark scene. Speed / sway / pulse come in as knobs so the lab can tune how
 *  the flame moves. */
function CandleFlame({
  position = [0, 0.25, 0] as [number, number, number],
  scale = 1,
  color,
  speed = 1,
  sway = 0.06,
  pulse = 1,
  brightness = 1.6,
}: {
  position?: [number, number, number];
  scale?: number;
  color?: THREE.Color;
  speed?: number;
  sway?: number;
  pulse?: number;
  brightness?: number;
}) {
  const base = color ?? new THREE.Color(1.0, 0.55, 0.15);
  // Lerp toward warm yellows/oranges (same palette CampfireFlame hard-codes:
  // #ff6b1a orange, #ffb431 gold, #fff06a pale yellow). Previously these
  // lerped toward pure white, which washed out `base` and made the flame
  // read as white regardless of the desk lantern color slider.
  const mid = base.clone().lerp(new THREE.Color("#ffb431"), 0.4);
  const tip = base.clone().lerp(new THREE.Color("#fff06a"), 0.6);
  const halo = base.clone().lerp(new THREE.Color("#ff7a1f"), 0.4);
  // Clamp opacity <= 1 (three ignores >1 with normal blending but AdditiveBlending
  // actually uses the value in the shader), so we let brightness push slightly
  // past 1 for a hotter core.
  const o1 = Math.min(1.4, 0.75 * brightness);
  const o2 = Math.min(1.5, 0.9  * brightness);
  const o3 = Math.min(1.6, 0.98 * brightness);
  return (
    <group position={position} scale={scale}>
      <AnimatedCone color={`#${base.getHexString()}`} opacity={o1} radius={0.02}  height={0.09} phase={0.4} y={0.045} speed={speed} swayAmount={sway} pulseAmount={pulse} />
      <AnimatedCone color={`#${mid.getHexString()}`}  opacity={o2} radius={0.014} height={0.07} phase={2.1} y={0.035} speed={speed} swayAmount={sway * 0.8} pulseAmount={pulse} />
      <AnimatedCone color={`#${tip.getHexString()}`}  opacity={o3} radius={0.008} height={0.05} phase={3.9} y={0.025} speed={speed} swayAmount={sway * 0.55} pulseAmount={pulse} />
      {/* Soft warm halo like CampfireFlame's inner sphere - reads as spill onto
          the surrounding glass. */}
      <mesh position={[0, 0.015, 0]}>
        <sphereGeometry args={[0.03, 12, 8]} />
        <meshBasicMaterial color={`#${halo.getHexString()}`} transparent opacity={Math.min(0.9, 0.35 * brightness)} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/**
 * Makes everything inside it unclickable, without changing how it renders.
 *
 * A fire is one small log pile wrapped in several very large decorative
 * layers: the ground glow is a plane up to 30 units across, the spark cloud's
 * bounding box matches its spread and height, and the flame halo is a sphere
 * scaled well past the logs. Raycasting hits all of them, so clicking
 * anywhere in that footprint selected the campfire - which is the "hitbox is
 * way too big" problem. Only the logs should be pickable.
 *
 * The traverse deliberately re-runs on EVERY render rather than once on
 * mount: Sparks remounts whenever its count changes (it is keyed on it), and
 * a freshly built Points object would come back with the default raycast.
 */
function NoPick({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    ref.current?.traverse((o) => {
      o.raycast = () => {};
    });
  });
  return <group ref={ref}>{children}</group>;
}

function CampfireFlame({
  x, y, z, scale, outerScale, innerScale, haloScale, dim = 1,
}: {
  x: number; y: number; z: number; scale: number;
  outerScale: number; innerScale: number; haloScale: number;
  /** Master fade on the flame's own emission, 0..1. The cones and halo are
   *  unlit additive material, so scene lighting cannot touch them - without
   *  this, turning the fire's point light to 0 left the flame just as bright
   *  and the fire still read as fully lit. */
  dim?: number;
}) {
  // Individual size multipliers on top of the whole-group scale, so the
  // orange outer sheath, yellow-orange mid tongue, pale-yellow inner tip, and
  // hot central halo can each be dialled independently. Mid follows outer so
  // it stays tucked inside the outer flame; outer/inner/halo each get their
  // own knob.
  const mid = (outerScale + innerScale) * 0.5;
  return (
    <group position={[x, y, z]} scale={scale}>
      <FlameCone color="#ff6b1a" opacity={0.82 * dim} radius={0.42 * outerScale} height={1.35 * outerScale} phase={0.3} y={0.62 * outerScale} />
      <FlameCone color="#ffb431" opacity={0.9 * dim}  radius={0.28 * mid}         height={1.05 * mid}         phase={2.2} y={0.58 * mid} />
      <FlameCone color="#fff06a" opacity={0.95 * dim} radius={0.17 * innerScale} height={0.78 * innerScale} phase={4.3} y={0.52 * innerScale} />
      <mesh position={[0, 0.16 * haloScale, 0]} scale={haloScale} visible={dim > 0.001}>
        <sphereGeometry args={[0.32, 16, 10]} />
        <meshBasicMaterial color="#ff7a1f" transparent opacity={0.45 * dim} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Radial falloff for the ground glow, painted WHITE so the disc can be tinted
 * from config instead of having one orange baked in.
 *
 * `falloff` is the exponent on (1 - t): higher pulls the light into a tighter
 * hot core, lower spreads it into a broad wash. 1.4 reproduces the original
 * hand-picked stops almost exactly (it hit 0.55 alpha at t=0.35 and 0.18 at
 * t=0.7; this curve gives 0.55 and 0.19), so the default look is unchanged.
 */
function createGlowTexture(falloff: number) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const p = Math.max(0.05, falloff);
  const STEPS = 12;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    gradient.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, p).toFixed(4)})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

interface FireGlowDiscProps {
  opacity: number; x: number; y: number; z: number; scale: number;
  colorR: number; colorG: number; colorB: number;
  width: number; length: number; rotY: number; falloff: number;
  flicker: number; breathe: number; offsetX: number; offsetZ: number;
  /**
   * Scale already baked into this disc's ancestors, divided back out so Width
   * and Length always mean the same thing in world units.
   *
   * The campfire's disc has no scaled ancestor, so it leaves this at 1. The
   * arcade's does: its whole fire is a Selectable carrying arcadeCampfireScale
   * AND an object override currently sitting at 0.22, so a Width of 8 was
   * landing as 8 x 0.49 x 0.22 = 0.86 world units - a sub-metre smudge on a
   * 39-unit ground, which is why the arcade sliders looked like they did
   * nothing. Shrinking the log pile should not shrink the pool of light it
   * throws, so the disc opts out of that scale.
   */
  worldScale?: number;
}

/**
 * The pool of firelight on the ground. Width and length are separate so the
 * pool can be stretched along the camp rather than forced circular; flicker and
 * breathe are multipliers on the two animations (0 = hold perfectly still).
 */
function FireGlowDisc(p: FireGlowDiscProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  // Only repaints when the falloff changes - not on every drag of the others.
  const texture = useMemo(() => createGlowTexture(p.falloff), [p.falloff]);
  useEffect(() => () => texture.dispose(), [texture]);
  const color = useMemo(
    () => new THREE.Color().setRGB(p.colorR, p.colorG, p.colorB),
    [p.colorR, p.colorG, p.colorB]
  );
  const paramsRef = useRef(p);
  paramsRef.current = p;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    const c = paramsRef.current;
    const t = clock.elapsedTime;
    const flicker = 1 + c.flicker * (
      Math.sin(t * 7.4) * 0.15 + Math.sin(t * 14.2) * 0.075 - 0.1);
    material.opacity = c.opacity * flicker;
    const breathe = 1 + c.breathe * Math.sin(t * 3.1) * 0.04;
    // NB: coalesce BEFORE using it. Testing `Math.abs(c.worldScale ?? 1)` but
    // then returning `c.worldScale` handed back undefined for any caller that
    // omits the prop (the campfire does), and width / undefined is NaN - which
    // set the mesh scale to NaN and made the whole disc disappear.
    const ws = typeof c.worldScale === "number" && Math.abs(c.worldScale) > 1e-4
      ? c.worldScale
      : 1;
    meshRef.current.scale.set(
      (c.width * c.scale * breathe) / ws,
      (c.length * c.scale * breathe) / ws,
      1
    );
  });

  return (
    <mesh
      ref={meshRef}
      position={[p.x + p.offsetX, p.y, p.z + p.offsetZ]}
      rotation={[-Math.PI / 2, 0, p.rotY]}
      renderOrder={2}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        color={color}
        transparent
        opacity={p.opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Sky and moon. These belong to the whole campsite, not to any one location.
 *
 *  The moon is the scene's ONE cheap shadow caster - a directional light only
 *  renders one depth pass per frame, versus six for a point light - so it's
 *  where any global shadow tuning happens. Sliders drive `moon*` config which
 *  we push through refs, updating `.shadow.map.dispose()` when mapSize changes
 *  and re-running `updateProjectionMatrix()` after any frustum edit. */
function WorldLights({ config }: { config: CampfireSceneConfig }) {
  const { gl } = useThree();

  // Master enable: flips gl.shadowMap.enabled so a slow client can drop shadow
  // renders entirely without unmounting the lights. The fire is the scene's
  // only shadow caster now - see CampfireLights.
  useEffect(() => {
    gl.shadowMap.enabled = config.shadowsEnabled >= 0.5;
  }, [gl, config.shadowsEnabled]);

  return (
    <>
      <ambientLight intensity={config.ambientIntensity} color="#1b2944" />
      <hemisphereLight intensity={config.ambientIntensity * 2.6} color="#49688f" groundColor="#160b10" />
      {/* Moon is a plain fill light: something to see by while developing, and
          a cool counterpoint to the fire. It deliberately casts NO shadow - a
          directional shadow map can't usefully cover a ring of locations
          15 units out, and the sliders for it were dead weight. */}
      <directionalLight
        position={[config.moonX, config.moonY, config.moonZ]}
        intensity={config.moonIntensity}
        color="#82aaff"
      />
    </>
  );
}

/**
 * Everything the fire throws. Lives INSIDE location 0, so its positions stay the
 * local offsets they always were and the whole rig travels with the campfire when
 * the ring radius changes.
 */
function CampfireLights({ config }: { config: CampfireSceneConfig }) {
  const fireLight = useRef<THREE.PointLight>(null);
  const farGlow = useRef<THREE.PointLight>(null);
  const warmSpot = useRef<THREE.SpotLight>(null);
  const warmTarget = useRef<THREE.Object3D>(null);
  // Every light here is placed RELATIVE TO THE FLAME (flameX/Y/Z), and the whole
  // rig now lives inside the "campfire" group, so dragging the campfire carries
  // the light, the glow and the shadows with it. Before this the lights were a
  // sibling of that group with absolute location-0 coordinates, so a drag moved
  // the log and the flame but left the light - and every shadow it threw -
  // behind at the old spot.
  const fx = config.flameX;
  const fy = config.flameY;
  const fz = config.flameZ;
  // The fire is the primary in-scene light source, so it's the natural
  // shadow caster. A point light does six cubemap renders per frame, so keep
  // the map modest (1024) and near/far tight (matched to fireLightReach).
  const fireCasts = config.fireCastShadow >= 0.5 && config.shadowsEnabled >= 0.5;
  const fireMapSize = Math.max(64, Math.round(config.fireShadowMapSize));
  // The spot is ONE depth pass, so it is six times cheaper per texel than the
  // point light above and can afford to stay the sharper of the two.
  const warmMapSize = Math.max(64, Math.round(config.warmShadowMapSize));
  useEffect(() => {
    fireLight.current?.shadow.camera.updateProjectionMatrix();
  }, [config.fireLightReach]);

  // A three.js SpotLight aims at `light.target`, which defaults to a bare
  // Object3D that is never added to the scene graph - so its world matrix stays
  // identity and the light points at WORLD origin. The location ring puts the
  // campfire at locationRadius (~15 units) away from world origin, so the shadow
  // light was firing almost horizontally past the camp toward the middle of the
  // ring, which is why its shadows pointed nowhere near the fire. Aim it at the
  // flame explicitly; the target sits in the campfire group so it tracks drags.
  useEffect(() => {
    if (!warmSpot.current || !warmTarget.current) return;
    warmSpot.current.target = warmTarget.current;
    warmSpot.current.target.updateMatrixWorld();
  }, []);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const flicker =
      1 +
      config.flickerAmount *
        (Math.sin(time * 8.1) * 0.12 + Math.sin(time * 15.7) * 0.08 + Math.sin(time * 23.3) * 0.035);

    if (fireLight.current) {
      fireLight.current.intensity = config.fireIntensity * flicker;
      fireLight.current.decay = config.fireDecay;
      fireLight.current.distance = config.fireLightReach;
      fireLight.current.position.x = fx + config.fireLightX + Math.sin(time * 3.3) * 0.05 * config.flickerAmount;
      fireLight.current.position.y = fy + config.fireLightY;
      fireLight.current.position.z = fz + config.fireLightZ + Math.cos(time * 2.7) * 0.05 * config.flickerAmount;
    }

    if (farGlow.current) {
      const slowFlicker = 1 + config.flickerAmount * (Math.sin(time * 2.3) * 0.06 + Math.sin(time * 4.1) * 0.03);
      farGlow.current.intensity = config.farGlowIntensity * slowFlicker;
      farGlow.current.decay = config.farGlowDecay;
      farGlow.current.distance = config.farGlowReach;
      farGlow.current.position.set(fx + config.fireLightX, fy + config.fireLightY, fz + config.fireLightZ);
    }

    if (warmSpot.current) {
      warmSpot.current.intensity = config.fireIntensity * 0.68 * flicker;
    }
  });

  return (
    <>
      <pointLight
        ref={fireLight}
        // Remount when the shadow map size changes so three re-allocates
        // the cubemap render target at the new resolution.
        key={`fire-${fireMapSize}`}
        position={[fx + config.fireLightX, fy + config.fireLightY, fz + config.fireLightZ]}
        color="#ff781f"
        intensity={config.fireIntensity}
        distance={config.fireLightReach}
        decay={config.fireDecay}
        castShadow={fireCasts}
        shadow-mapSize-width={fireMapSize}
        shadow-mapSize-height={fireMapSize}
        shadow-bias={config.fireShadowBias}
        shadow-normalBias={config.fireShadowNormalBias}
        shadow-intensity={config.fireShadowIntensity}
        shadow-camera-near={0.1}
        shadow-camera-far={Math.max(1, config.fireLightReach)}
      />
      <pointLight
        ref={farGlow}
        position={[fx + config.fireLightX, fy + config.fireLightY, fz + config.fireLightZ]}
        color="#ff9a45"
        intensity={config.farGlowIntensity}
        distance={config.farGlowReach}
        decay={config.farGlowDecay}
      />
      {/* What the shadow light aims at: the flame itself. */}
      <object3D ref={warmTarget} position={[fx, fy, fz]} />
      <spotLight
        ref={warmSpot}
        position={[fx + config.warmLightX, fy + config.warmLightY, fz + config.warmLightZ]}
        color="#ff8a2a"
        intensity={config.fireIntensity * 0.68}
        distance={config.warmLightReach}
        angle={config.warmLightAngle}
        penumbra={0.85}
        castShadow
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
        // three defaults to a 512x512 shadow map. Stretched over the whole camp that
        // is ~1cm per texel on the animals, which is what reads as blocky, pixelated
        // shading across their fur.
        shadow-mapSize-width={warmMapSize}
        shadow-mapSize-height={warmMapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={config.warmLightReach}
      />
    </>
  );
}

interface SparkState {
  bornAt: number;
  lifetime: number;
  x0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
  swayAmp: number;
  swayPhase: number;
  maxHeight: number;
  burst: boolean;
}

function Sparks({
  opacity,
  x,
  z,
  count,
  spread,
  maxHeight,
  speed,
  sway,
  burstChance,
  size,
  lifetime,
}: {
  opacity: number;
  x: number;
  z: number;
  count: number;
  spread: number;
  maxHeight: number;
  speed: number;
  sway: number;
  burstChance: number;
  size: number;
  lifetime: number;
}) {
  const SPARK_COUNT = Math.max(1, Math.min(2000, Math.round(count)));
  const pointsRef = useRef<THREE.Points>(null);
  const bufferRef = useRef<THREE.BufferAttribute>(null);
  const alphaBufferRef = useRef<THREE.BufferAttribute>(null);

  const { positions, alphas, sparks } = useMemo(() => {
    const random = seededRandom(31);
    const pos = new Float32Array(SPARK_COUNT * 3);
    const al = new Float32Array(SPARK_COUNT);
    const st: SparkState[] = [];
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      const angle = random() * Math.PI * 2;
      const r0 = random() * spread;
      const stagger = -random() * lifetime * 1.5;
      const burst = random() < burstChance;
      st.push({
        bornAt: stagger,
        lifetime: (burst ? lifetime * 1.4 : lifetime) * (0.7 + random() * 0.6),
        x0: Math.cos(angle) * r0,
        z0: Math.sin(angle) * r0,
        vx: (random() - 0.5) * (burst ? 1.6 : 0.4) * sway,
        vy: (burst ? 2.2 + random() * 1.8 : 1.0 + random() * 0.9) * speed,
        vz: (random() - 0.5) * (burst ? 1.6 : 0.4) * sway,
        swayAmp: (0.1 + random() * 0.6) * sway,
        swayPhase: random() * Math.PI * 2,
        maxHeight: (burst ? maxHeight * 1.6 : maxHeight) * (0.7 + random() * 0.6),
        burst,
      });
      pos[i * 3] = st[i].x0;
      pos[i * 3 + 1] = 0.3;
      pos[i * 3 + 2] = st[i].z0;
      al[i] = 0;
    }
    return { positions: pos, alphas: al, sparks: st };
    // deliberately depend on SPARK_COUNT so buffers resize when count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SPARK_COUNT]);

  // keep latest params in a ref so useFrame can pick them up without re-registering
  const paramsRef = useRef({ spread, maxHeight, speed, sway, burstChance, lifetime });
  paramsRef.current = { spread, maxHeight, speed, sway, burstChance, lifetime };

  const seedRef = useRef(seededRandom(97));

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const posAttr = bufferRef.current;
    const alphaAttr = alphaBufferRef.current;
    if (!posAttr || !alphaAttr) return;
    const posArr = posAttr.array as Float32Array;
    const alphaArr = alphaAttr.array as Float32Array;

    const p = paramsRef.current;
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      const s = sparks[i];
      let age = t - s.bornAt;
      if (age > s.lifetime) {
        const rand = seedRef.current;
        const burst = rand() < p.burstChance;
        s.bornAt = t;
        s.lifetime = (burst ? p.lifetime * 1.4 : p.lifetime) * (0.7 + rand() * 0.6);
        const angle = rand() * Math.PI * 2;
        const r0 = rand() * p.spread;
        s.x0 = Math.cos(angle) * r0;
        s.z0 = Math.sin(angle) * r0;
        s.vx = (rand() - 0.5) * (burst ? 1.6 : 0.4) * p.sway;
        s.vy = (burst ? 2.2 + rand() * 1.8 : 1.0 + rand() * 0.9) * p.speed;
        s.vz = (rand() - 0.5) * (burst ? 1.6 : 0.4) * p.sway;
        s.swayAmp = (0.1 + rand() * 0.6) * p.sway;
        s.swayPhase = rand() * Math.PI * 2;
        s.maxHeight = (burst ? p.maxHeight * 1.6 : p.maxHeight) * (0.7 + rand() * 0.6);
        s.burst = burst;
        age = 0;
      }

      const drag = 1 - Math.min(1, age * 0.55);
      const ax = s.x0 + s.vx * age * drag + Math.sin(age * 4.2 + s.swayPhase) * s.swayAmp * 0.35;
      const az = s.z0 + s.vz * age * drag + Math.cos(age * 3.9 + s.swayPhase) * s.swayAmp * 0.35;
      // ease-out rise
      const rise = Math.min(s.maxHeight, s.vy * age - 0.35 * age * age);
      posArr[i * 3] = ax;
      posArr[i * 3 + 1] = 0.3 + rise;
      posArr[i * 3 + 2] = az;

      // alpha: fade in fast, fade out slower; extra flicker
      const norm = age / s.lifetime;
      const fadeIn = Math.min(1, norm * 6);
      const fadeOut = 1 - Math.pow(norm, 1.8);
      const flick = 0.75 + 0.25 * Math.sin(age * 22 + s.swayPhase);
      alphaArr[i] = Math.max(0, fadeIn * fadeOut * flick) * (s.burst ? 1.15 : 1);
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    if (pointsRef.current) {
      (pointsRef.current.material as THREE.PointsMaterial).opacity = opacity;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute ref={bufferRef} attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute ref={alphaBufferRef} attach="attributes-alpha" args={[alphas, 1]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffc66d"
          size={size}
          sizeAttenuation
          transparent
          opacity={opacity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          onBeforeCompile={(shader) => {
            shader.vertexShader = shader.vertexShader
              .replace(
                "void main() {",
                "attribute float alpha;\nvarying float vAlpha;\nvoid main() {\n  vAlpha = alpha;"
              );
            shader.fragmentShader = shader.fragmentShader
              .replace(
                "void main() {",
                "varying float vAlpha;\nvoid main() {"
              )
              .replace(
                "vec4 diffuseColor = vec4( diffuse, opacity );",
                "vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );"
              );
          }}
        />
      </points>
    </group>
  );
}

function WoodLogBench({
  angle,
  name,
  config,
  onSelect,
  model,
}: {
  angle: number;
  name: string;
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
  model: BenchModel;
}) {
  const gltf = useGLTF(model.url) as unknown as { scene: THREE.Group };
  const groupRef = useRef<THREE.Group>(null);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  useFrame(() => {
    if (!groupRef.current) return;
    const c = cfgRef.current;
    const o = c.objectOverrides?.[name] ?? EMPTY_OVERRIDE;
    const x = Math.cos(angle) * c.benchRadius;
    const z = Math.sin(angle) * c.benchRadius;
    groupRef.current.position.set(x + o.dx, o.dy, z + o.dz);
    groupRef.current.rotation.set(o.rotX, -angle + c.benchAngleOffset + o.rotY, o.rotZ, "XZY");
    const s = c.benchScale * o.scale;
    groupRef.current.scale.set(s, s, s);
  });

  return (
    <group
      ref={groupRef}
      name={name}
      onClick={(e: THREE.Event & { stopPropagation: () => void }) => {
        e.stopPropagation();
        onSelect(name);
      }}
    >
      <group position={model.anchor}>
        <group scale={model.scale}>
          <Clone object={gltf.scene} deep="materialsOnly" castShadow receiveShadow />
        </group>
      </group>
    </group>
  );
}

/**
 * The camper diorama, parked behind the bench ring. Selectable and nudgeable in the
 * lab under the name "camper" like everything else, since the placement below is my
 * best guess from the model's bounds rather than something you picked.
 */
function Camper({
  config,
  onSelect,
  name = "camper",
  base = CAMPER_BASE,
}: {
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
  /** override row + click name; default "camper" (the campfire-location van).
   *  Pass a distinct name for a second instance so its transform is
   *  independent in objectOverrides. */
  name?: string;
  /** base placement in the location's local frame */
  base?: { x: number; y: number; z: number; rotY: number; scale: number };
}) {
  const gltf = useGLTF(CAMPER_URL) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] };
  const groupRef = useRef<THREE.Group>(null);
  const model = useMemo(() => skeletonClone(gltf.scene) as THREE.Group, [gltf.scene]);
  const { actions, names: actionNames, mixer } = useAnimations(gltf.animations || [], groupRef);

  const cfgRef = useRef(config);
  cfgRef.current = config;

  useEffect(() => {
    // 16.7s of gentle sway on the string lights and plants - not a turntable.
    const key = actionNames[0];
    if (!key || !actions?.[key]) return;
    // a re-cloned model after a dev hot reload: see rebindMixer.ts
    if (groupRef.current) rebindMixerRoot(mixer, groupRef.current);
    const action = actions[key];
    action.reset().fadeIn(0.5).play();
    return () => { action.fadeOut(0.3); };
  }, [actions, actionNames, mixer, model]);

  useEffect(() => {
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Two of its three materials ship as alphaMode BLEND, same trap as the animals:
      // renders see-through and stops writing depth.
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
        if (m.transparent) { m.transparent = false; m.needsUpdate = true; }
        if (!m.depthWrite) { m.depthWrite = true; m.needsUpdate = true; }
      });
    });
  }, [model]);

  useFrame(() => {
    if (!groupRef.current) return;
    const o = cfgRef.current.objectOverrides?.[name] ?? EMPTY_OVERRIDE;
    groupRef.current.position.set(base.x + o.dx, base.y + o.dy, base.z + o.dz);
    groupRef.current.rotation.set(o.rotX, base.rotY + o.rotY, o.rotZ, "XZY");
    const s = base.scale * o.scale;
    groupRef.current.scale.set(s, s, s);
  });

  return (
    <group
      ref={groupRef}
      name={name}
      onClick={(e: THREE.Event & { stopPropagation: () => void }) => {
        e.stopPropagation();
        onSelect(name);
      }}
    >
      <group position={[-CAMPER_ANCHOR[0], -CAMPER_ANCHOR[1], -CAMPER_ANCHOR[2]]}>
        <primitive object={model} />
        {/* Warm point light inside the van body, plus flat emissive panels behind
         *  the window openings so the glass reads as lit even at night. The van
         *  interior spans roughly X ±2.5, Y 1-5, Z -4 to 4 in model units. */}
        <pointLight position={[0, 2.8, 1.4]} intensity={3.5} distance={6} decay={1.6} color="#ffd08a" />
        {/* Right-side windows */}
        <mesh position={[2.55, 3.1, -0.6]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[2.4, 1.1]} />
          <meshBasicMaterial color="#ffd88a" transparent opacity={0.95} toneMapped={false} />
        </mesh>
        {/* Left-side windows */}
        <mesh position={[-2.55, 3.1, -0.6]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[2.4, 1.1]} />
          <meshBasicMaterial color="#ffd88a" transparent opacity={0.95} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * The replacement tent. Driven by the same tentX/Y/Z/RotationY/Scale config the old
 * built-in one used, so nothing you'd already tuned changes meaning.
 */
/**
 * Loads and clones a GLB, turning every mesh into a shadow-caster. Used for
 * the vehicles - they have no per-instance state so a Selectable wrapper
 * carries the transform and click handling.
 */
/**
 * Rolls the rocking chair - and the bear sitting in it - forward and back on
 * its runners. Sits inside the chair's Selectable, so dragging/turning the
 * chair from the lab still works; this only adds the rock on top, in the
 * chair GLB's own space. See rockingChair.ts for the measured geometry.
 */
function RockingChairRig({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) applyChairRock(ref.current, rockAngle(clock.elapsedTime, ROCKING_CHAIR_ROCK));
  });
  return <group ref={ref}>{children}</group>;
}

function GLBModel({ url }: { url: string }) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  useEffect(() => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }, [model]);
  return <primitive object={model} />;
}

/**
 * Same as GLBModel, but forces every material to DoubleSide so a parent group
 * with a negative-axis scale (used to mirror the mesh visually) still gets
 * raycast hits. Under FrontSide + negative scale, three's mesh.raycast fails
 * because the effective triangle winding is inverted vs what the culling
 * expects, and pointer events go through the model instead of selecting it.
 */


/**
 * The arcade's wooden cabin, with its lantern actually lit.
 *
 * The GLB already ships a "lattern-light" material carrying an emissiveFactor,
 * but at default intensity and with tone mapping applied it just reads as pale
 * yellow paint. Boosting emissiveIntensity and opting out of tone mapping is
 * what makes the glass read as a lamp that is ON; the point light beside it is
 * what makes the cabin wall around it agree.
 *
 * Lamp coordinates are in the GLB's OWN space (its cabin spans ~140 units), so
 * the numbers are large - they are divided down by the Selectable's 0.1 base
 * scale and the object override on top. Measured off the model: the lantern
 * bulb sits at (16.05, 33.04, 47.62).
 */
function LitWoodenCabin({ config }: { config: CampfireSceneConfig }) {
  const gltf = useGLTF(WOODEN_CABIN_URL) as unknown as { scene: THREE.Group };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useEffect(() => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      // DoubleSide for the same reason MirroredGLBModel does it: the parent
      // group has a negative X scale, which flips triangle winding, and
      // FrontSide culling would make the raycaster miss the cabin entirely.
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const swapped = mats.map((mat) => {
        if (!mat) return mat;
        const std = mat as THREE.MeshStandardMaterial;
        // The bulb AND the glass around it. Cloned first - Object3D.clone()
        // shares materials, so editing in place would leak the glow into any
        // other user of this GLB.
        if (std.name === "lattern-light" || std.name === "glass") {
          const lit = std.clone();
          lit.side = THREE.DoubleSide;
          lit.toneMapped = false;
          if (lit.name === "glass") {
            // The bulb is a 1.3-unit cylinder buried inside the lantern, mostly
            // hidden behind the frame's bars - lighting it alone leaves the
            // lamp reading as a dark box with a bright wall behind it. Making
            // the GLASS carry the glow is what sells "on", because the glass is
            // the surface you can actually see from outside.
            lit.transparent = true;
            lit.opacity = 0.55;
            // Its baked baseColorTexture is a dim grey that drags the glow
            // down; drop it so the emissive is what reads.
            lit.map = null;
            // Transparent + depthWrite would let the near pane hide the far
            // one and the bulb between them.
            lit.depthWrite = false;
          }
          lit.needsUpdate = true;
          return lit;
        }
        std.side = THREE.DoubleSide;
        std.needsUpdate = true;
        return std;
      });
      m.material = Array.isArray(m.material) ? swapped : swapped[0]!;
    });
  }, [model]);

  // Glass colour AND strength are live, so the lab sliders work without a
  // reload. The colour is set explicitly rather than left at the GLB's baked
  // emissiveFactor - that ships a muddy yellow-green, which reads as painted-on
  // rather than lit. One colour drives both the glass and the light it throws,
  // so a lamp can't end up glowing one colour and lighting the wall another.
  useEffect(() => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material])) {
        const std = mat as THREE.MeshStandardMaterial;
        const isBulb = std?.name === "lattern-light";
        const isGlass = std?.name === "glass";
        if (!isBulb && !isGlass) continue;
        std.emissive.setRGB(
          config.arcadeCabinLampColorR,
          config.arcadeCabinLampColorG,
          config.arcadeCabinLampColorB
        );
        // Glass sits a little under the bulb so there's still a visible hot
        // core behind it rather than one flat slab of colour.
        std.emissiveIntensity = config.arcadeCabinLampEmissive * (isGlass ? 0.55 : 1);
        if (isBulb) {
          // Base colour was a neutral grey, which muddied the tint.
          std.color.setRGB(
            config.arcadeCabinLampColorR,
            config.arcadeCabinLampColorG,
            config.arcadeCabinLampColorB
          );
        }
        std.needsUpdate = true;
      }
    });
  }, [
    model,
    config.arcadeCabinLampEmissive,
    config.arcadeCabinLampColorR,
    config.arcadeCabinLampColorG,
    config.arcadeCabinLampColorB,
  ]);

  const lampColor = useMemo(
    () => new THREE.Color().setRGB(
      config.arcadeCabinLampColorR, config.arcadeCabinLampColorG, config.arcadeCabinLampColorB),
    [config.arcadeCabinLampColorR, config.arcadeCabinLampColorG, config.arcadeCabinLampColorB]
  );
  const bugColor = useMemo(
    () => new THREE.Color().setRGB(config.deskBugR, config.deskBugG, config.deskBugB),
    [config.deskBugR, config.deskBugG, config.deskBugB]
  );

  return (
    <>
      <primitive object={model} />
      {/* Moths at the porch light. Same swarm as the camp lamps, in the
          cabin's frame: baseScale 0.1 on the Selectable times its override, so
          the world-unit knobs come out the same size here as they do out at
          the signpost even though one cabin unit is 5.6x smaller than one camp
          unit. The mirror group above only flips X, so magnitude is all that
          matters. */}
      {config.arcadeCabinLampBugs >= 0.5 && (
        <BugSwarm
          origin={[config.arcadeCabinLampX, config.arcadeCabinLampY, config.arcadeCabinLampZ]}
          frameScale={0.1 * (config.objectOverrides?.["arcade_wooden_cabin"]?.scale ?? 1)}
          {...bugSwarmProps(config, bugColor, "arcadeCabinLamp")}
        />
      )}
      {/* Sits in the model's frame so it tracks the lantern through the mirror
          and every scale above it. `distance` stays in WORLD units - three does
          not scale light falloff by the parent transform. */}
      <pointLight
        position={[config.arcadeCabinLampX, config.arcadeCabinLampY, config.arcadeCabinLampZ]}
        color={lampColor}
        intensity={config.arcadeCabinLampIntensity}
        distance={config.arcadeCabinLampDistance}
        decay={config.arcadeCabinLampDecay}
        castShadow={false}
      />
    </>
  );
}

function MirroredGLBModel({ url }: { url: string }) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  useEffect(() => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (!mat) continue;
        (mat as THREE.Material).side = THREE.DoubleSide;
        (mat as THREE.Material).needsUpdate = true;
      }
    });
  }, [model]);
  return <primitive object={model} />;
}

/**
 * Kenney laptop with a subtle screen glow. Any material whose name reads
 * "screen"/"display"/"monitor" gets a cool-white emissive boost; a small
 * pointLight sits just above the deck so the light spills onto whatever the
 * laptop is set on even when the screen mesh itself can't be identified.
 */
/** Path to the Twilio artwork the laptop screen displays. Web-root relative,
 *  double-l because that's how the file is on disk. */
const TWILIO_SCREEN_URL = "/twillio.png";

function LaptopWithScreenGlow({ config }: { config: CampfireSceneConfig }) {
  const gltf = useGLTF(LAPTOP_URL) as unknown as { scene: THREE.Group };
  // Track the screen materials so slider tweaks retune the existing model
  // instead of remounting a whole cloned scene per frame — remounts would
  // wipe any user-side pose animations and thrash the material cache.
  const screenMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  // Load the Twilio artwork straight from /public. drei's useTexture handles
  // suspense + caching, so hot reloads reuse the same GPU texture. Force sRGB
  // color space so the artwork's whites and reds render true through the
  // scene's tone-mapping pipeline (three.js defaults to Linear for loaded
  // images, which crushes the whites into gray).
  const twilioTextureRaw = useTexture(TWILIO_SCREEN_URL);
  const twilioTexture = useMemo(() => {
    twilioTextureRaw.colorSpace = THREE.SRGBColorSpace;
    twilioTextureRaw.anisotropy = 8;
    twilioTextureRaw.flipY = true;
    twilioTextureRaw.needsUpdate = true;
    return twilioTextureRaw;
  }, [twilioTextureRaw]);
  const model = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    // Kenney's laptop doesn't name its screen material "screen" — it uses
    // generic names like `metal` / `metalDark` / `metalMedium`, and glTF's
    // primitive splitter turns each material into a separate THREE.Mesh. The
    // *screen* is always the sub-mesh with just a couple of triangles and a
    // relatively large surface area (one big flat rectangle). Detect it by
    // that shape signature rather than by name — that way this component
    // stays working if we swap the model for another low-poly laptop later.
    type Candidate = { mesh: THREE.Mesh; triCount: number; area: number };
    const candidates: Candidate[] = [];
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const geom = mesh.geometry;
      const pos = geom.getAttribute("position");
      if (!pos) return;
      const triCount = geom.index ? geom.index.count / 3 : pos.count / 3;
      // Surface area = bounding box footprint on its two biggest axes; cheap
      // proxy for "is this a large flat rectangle rather than a tiny chip".
      geom.computeBoundingBox();
      const bb = geom.boundingBox;
      let area = 0;
      if (bb) {
        const sx = bb.max.x - bb.min.x;
        const sy = bb.max.y - bb.min.y;
        const sz = bb.max.z - bb.min.z;
        const sizes = [sx, sy, sz].sort((a, b) => b - a);
        area = sizes[0] * sizes[1];
      }
      candidates.push({ mesh, triCount, area });
    });

    // Screen = smallest tri count (rules out chassis / body) tie-broken by
    // largest area (rules out tiny detail meshes like keyboard chiclets).
    let screenMesh: THREE.Mesh | null = null;
    if (candidates.length > 0) {
      const minTris = Math.min(...candidates.map((c) => c.triCount));
      const smallSet = candidates.filter((c) => c.triCount === minTris);
      smallSet.sort((a, b) => b.area - a.area);
      screenMesh = smallSet[0]?.mesh ?? null;
    }

    const collected: THREE.MeshStandardMaterial[] = [];
    if (screenMesh) {
      // The Kenney atlas uses UVs way outside 0..1 (screen quad lands at
      // roughly U 1.6→22, V 8.6→20 — a specific pixel inside the shared
      // colormap). Rewriting THIS mesh's UVs to 0..1 makes the full canvas
      // texture display edge-to-edge across the screen rectangle. Safe
      // because the primitive-split gives us a private UV attribute for the
      // screen mesh only.
      const uv = screenMesh.geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
      if (uv) {
        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i);
          const v = uv.getY(i);
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        const uRange = maxU - minU || 1;
        const vRange = maxV - minV || 1;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(
            i,
            (uv.getX(i) - minU) / uRange,
            (uv.getY(i) - minV) / vRange,
          );
        }
        uv.needsUpdate = true;
      }

      const mats = Array.isArray(screenMesh.material) ? screenMesh.material : [screenMesh.material];
      const nextMats = mats.map((m) => {
        const std = m as THREE.MeshStandardMaterial;
        const clone = std.clone();
        // Base color to black so the Kenney color-atlas paint underneath
        // can't tint the canvas texture. The canvas's own pixels + emissive
        // are what light the screen up.
        clone.color = new THREE.Color(0, 0, 0);
        if (twilioTexture) {
          clone.map = twilioTexture;
          clone.emissiveMap = twilioTexture;
        }
        clone.emissive = new THREE.Color(1, 1, 1);
        clone.emissiveIntensity = 1;
        clone.needsUpdate = true;
        collected.push(clone);
        return clone;
      });
      screenMesh.material = Array.isArray(screenMesh.material) ? nextMats : nextMats[0];
    }
    screenMatsRef.current = collected;
    return cloned;
  }, [gltf.scene, twilioTexture]);

  // Live-tune the screen material every frame it changes so the sliders
  // read WYSIWYG. Cheap — only fires on config changes, not per frame. With
  // an emissive MAP set, the material's `emissive` acts as a multiplicative
  // tint on the texture — keep it (1,1,1) if you want the VSCode UI to
  // render its real dark-theme colors, or push it toward the config's
  // laptop color for a sepia/blue wash across the whole screen.
  useEffect(() => {
    for (const mat of screenMatsRef.current) {
      mat.emissive.setRGB(config.laptopScreenColorR, config.laptopScreenColorG, config.laptopScreenColorB);
      mat.emissiveIntensity = config.laptopScreenBrightness * 1.6;
      mat.needsUpdate = true;
    }
  }, [config.laptopScreenColorR, config.laptopScreenColorG, config.laptopScreenColorB, config.laptopScreenBrightness]);

  const lightColor = useMemo(
    () => new THREE.Color(config.laptopScreenColorR, config.laptopScreenColorG, config.laptopScreenColorB),
    [config.laptopScreenColorR, config.laptopScreenColorG, config.laptopScreenColorB],
  );

  return (
    <>
      <primitive object={model} />
      {/* Screen-face spill. Positioned just above the keyboard deck (~15 cm
       *  off the base) and slightly forward, so it lands on the ground/prop
       *  in front of the laptop without shining into its own chassis. Uses
       *  the same tint as the emissive; intensity scales off the brightness
       *  knob at ~1/5 the strength so the spill stays subtle relative to the
       *  panel itself. */}
      <pointLight
        position={[0, 0.16, 0.05]}
        color={lightColor}
        intensity={config.laptopScreenBrightness * 0.35}
        distance={1.6}
        decay={2}
      />
    </>
  );
}

/**
 * Caravan with its two side windows lit from within. The Poly-by-Google GLB
 * packs the whole trailer into a single mesh with per-material sub-primitives;
 * `02___Default` (the teal window pane material, verified in Blender by
 * isolating each material) is cloned into a warm emissive so it reads as "lit"
 * without recoloring the rest of the caravan. A tiny warm point light sits
 * inside so the glow spills onto nearby geometry at night.
 */
function LitCaravan({ url, config }: { url: string; config: CampfireSceneConfig }) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  // Clone the scene and replace the window material with an emissive copy in
  // a single memo. Doing setup as a separate useEffect races with the update
  // effect during fast slider scrubs (the material sometimes remounts after
  // React has already flushed the update), which read like "brightness
  // resets when you change it". A single memo means the bright material
  // exists by the time any render runs.
  const { model, windowMats } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const collected: THREE.MeshStandardMaterial[] = [];
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const swapped = mats.map((m) => {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat || mat.name !== "02___Default") return mat;
        const bright = mat.clone();
        bright.toneMapped = false;
        // needsUpdate is only set here (initial shader compile). Setting it
        // again on every intensity/color change forces the whole material
        // shader to re-link, which can reset uniform state mid-drag.
        bright.needsUpdate = true;
        collected.push(bright);
        return bright;
      });
      mesh.material = Array.isArray(mesh.material) ? swapped : swapped[0];
    });
    return { model: cloned, windowMats: collected };
  }, [gltf.scene]);
  // Apply live values in render. Writing to a three.js material outside a
  // useEffect is safe (it's not React state), and doing it here removes the
  // deferred-effect timing hole that caused the "reset" behavior.
  const r = config.deskCaravanWindowColorR;
  const g = config.deskCaravanWindowColorG;
  const b = config.deskCaravanWindowColorB;
  for (const mat of windowMats) {
    mat.color.setRGB(r, g, b);
    mat.emissive.setRGB(r, g, b);
    mat.emissiveIntensity = config.deskCaravanWindowIntensity;
  }
  return (
    <group>
      <primitive object={model} />
      {/* Warm interior spill. Caravan is authored at ~80 local units long, so
          the light position is in that same pre-parent-scale space. */}
      <pointLight
        position={[
          config.deskCaravanWindowLightX,
          config.deskCaravanWindowLightY,
          config.deskCaravanWindowLightZ,
        ]}
        color={new THREE.Color(
          config.deskCaravanWindowColorR,
          config.deskCaravanWindowColorG,
          config.deskCaravanWindowColorB,
        )}
        intensity={config.deskCaravanWindowLightIntensity}
        distance={config.deskCaravanWindowLightDistance}
        decay={config.deskCaravanWindowLightDecay}
      />
    </group>
  );
}

/** Raw GLB placer with no material rewiring - just clones and drops it in. */
function RawGLB({ url }: { url: string }) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={model} />;
}

/** Loads the camping GLB and yanks each tree out into its own Selectable so
 *  they can be individually clicked/dragged/scaled/hidden.
 *
 *  Tree detection heuristic — the source diorama gives every tree a parent
 *  transform named "Cylinder.NNN_MM" (trunks modeled as cylinders in Blender)
 *  or "Icosphere.NNN_MM" (spherical bush groups), and their descendants
 *  include a mesh whose material's base color is a foliage green. Anything
 *  matching both is peeled off the base scene, has its world transform baked
 *  into its local so a Selectable at basePosition=[0,0,0] renders it in the
 *  right place, and gets a stable name (`camping_tree_<parentNodeName>`) so
 *  the dx/dy/dz/scale/hide overrides persist through save/load. */
/**
 * The real light fixtures inside camping.glb, keyed by MESH NAME.
 *
 * A fixture can own MORE THAN ONE mesh, and the camper van is exactly why:
 * Object_335 and Object_337 are its left and right headlights - two meshes,
 * 1.64 apart at the same height, each with its own grey housing below it and
 * the van's bumper (Object_433, 2.47 wide) spanning both. They are one lamp
 * with two bulbs, so they share one set of config keys. Giving them a block
 * each meant "the headlights config" only ever moved one of them.
 *
 * Measured out of the file - world positions in the GLB's own space:
 *   Object_335  (-2.28, 2.60,  4.41)  van headlight, left
 *   Object_337  (-0.64, 2.60,  4.16)  van headlight, right
 *   Object_133  ( 6.98, 1.47, -0.40)  small lamp, near the fire pit
 *   Object_131  (10.94, 1.58,  5.57)  small lamp, far side of camp
 *   Object_455  (-3.99, 3.92,  6.85)  hooded lantern on the signpost
 *
 * Material name cannot be used to pick these out: the van's headlights share
 * the bare "Lamp" material with all 26 string bulbs. The `id` is what the
 * config keys are built from - `deskLamp<id>Intensity` and friends - so
 * renaming an id orphans its saved values.
 */
type DeskCampLamp = {
  id: string;
  /** The emissive glass. Gets a point light and the Emissive slider. */
  meshes: readonly string[];
  /** Housing, shade, bracket - no light of its own, but it has to travel with
   *  the glass or moving a fixture leaves its body behind.
   *
   *  These were first gathered by proximity - every mesh within 0.45 of the
   *  glass - and that is NOT sufficient on its own. It swept the van's two
   *  grey trim squares in as if they were headlight housings, and they then
   *  slid about under the lights whenever the fixture moved. Check what a
   *  mesh actually is before listing it here: the lantern bodies below are
   *  four-part assemblies that really do belong to their lamp; the van's
   *  headlight is just the glass. */
  body?: readonly string[];
  /** Fixtures that throw a BEAM rather than glowing in all directions get a
   *  forward direction here, in camp space. Only the van's headlights have
   *  one - a point light at a headlight reads as a glowing ball, not as a
   *  vehicle with its lights on.
   *
   *  Measured, not guessed: the van's chassis (Object_341) centres at blender
   *  (-1.82, -1.86) and the headlight midpoint is (-1.46, -4.29), so nose-
   *  forward is (0.148, -0.989) in blender xy = (0.148, 0, 0.989) in camp
   *  space. The perpendicular to the line joining the two headlights comes
   *  out at (0.151, 0, 0.989) independently, which agrees.
   *
   *  Y is 0 here: this is the HORIZONTAL heading only. The downward tilt is
   *  deskLamp<id>BeamTilt so it can be dialled without editing the table, and
   *  both lights take the same direction from their own positions - which is
   *  what keeps the two pools parallel instead of converging. */
  beam?: readonly [number, number, number];
  label: string;
};
const DESK_CAMP_LAMPS: readonly DeskCampLamp[] = [
  // No `body`: the van's headlight IS the round glass, nothing else. The two
  // grey squares below them (Object_399/401) are NOT housings - they are
  // generic trim in Material.002, the same material as the little caps on the
  // posts up by the camp (Object_312/322), and they belong to the van's face,
  // not to the lamp. Bundling them made them slide around under the
  // headlights whenever the lamp was nudged.
  { id: "VanHeads", meshes: ["Object_335", "Object_337"],
    beam: [0.148, 0, 0.989],
    label: "Camper van headlights (both)" },
  { id: "SmallA", meshes: ["Object_133"],
    body: ["Object_446", "Object_447", "Object_448", "Object_449"], label: "Small lamp · near the fire pit" },
  { id: "SmallB", meshes: ["Object_131"],
    body: ["Object_460", "Object_461", "Object_462", "Object_463"], label: "Lantern · on the dock" },
  { id: "Hood", meshes: ["Object_455"],
    body: ["Object_36", "Object_456"], label: "Hooded lantern · on the signpost" },
];
const DESK_CAMP_LAMP_MESHES = new Set(DESK_CAMP_LAMPS.flatMap((l) => l.meshes));
/** Every mesh that moves with a fixture -> which fixture it belongs to. */
const DESK_CAMP_LAMP_PARTS = new Map<string, string>(
  DESK_CAMP_LAMPS.flatMap((l) => [...l.meshes, ...(l.body ?? [])].map((m) => [m, l.id] as const))
);

const WATER_MATERIALS = new Set(["Material.057"]);

/**
 * Shadow opt-in for the desk diorama.
 *
 * Nothing in camping.glb sets castShadow or receiveShadow, so every mesh
 * defaults to false and no lamp in that scene could cast onto anything - the
 * flags have to be turned on explicitly before any of this works.
 *
 * Kept to the smallest set that gives the dock a shadow on the water: a point
 * light's shadow is a CUBE map, six depth passes a frame, and restricting the
 * casters to the dock's three planks means those passes render three meshes
 * rather than the whole camp. That is also why the toggles below default to
 * on for the dock lantern only.
 */
// Object_378 is the WHOLE dock in one mesh - 270 verts, 44 horizontal
// triangles (the deck surface) and 92 vertical (posts and sides). So the deck
// is a caster, not just the posts. Object_379/380 are the two flat boards
// lying on top of it.
const DESK_SHADOW_CASTERS = new Set(["Object_378", "Object_379", "Object_380"]);
const DESK_SHADOW_RECEIVER_MATERIALS = new Set([
  "Material.057",                                  // the river
  "Material.108", "Material.045", "Material.077",  // ground it may fall on
]);

/**
 * Push the shared shadow-quality settings onto a light.
 *
 * near/far are the part that decides whether this works AT ALL. They are in
 * WORLD units, and the camp is scaled to ~0.17, so the distances involved are
 * tiny: the dock lantern sits 0.24 camp units above the deck, which is 0.042
 * world units, and 1.02 above the water, which is 0.176. three's default
 * PointLightShadow near is 0.5 - both are well inside it, so at the defaults
 * the dock never enters the shadow camera and no shadow is produced at all.
 * Hence a near of 0.01.
 */
function applyDeskShadow(light: THREE.Light & { shadow?: THREE.LightShadow }, c: Record<string, number>) {
  const sh = light.shadow;
  if (!sh) return;
  const size = Math.max(128, Math.round(c.deskShadowMapSize ?? 512));
  if (sh.mapSize.width !== size) {
    sh.mapSize.set(size, size);
    // The old depth target has to go, or three keeps rendering at the old size.
    sh.map?.dispose();
    sh.map = null;
  }
  sh.bias = c.deskShadowBias ?? -0.0015;
  sh.radius = c.deskShadowRadius ?? 3;
  const cam = sh.camera as THREE.PerspectiveCamera;
  cam.near = Math.max(0.001, c.deskShadowNear ?? 0.01);
  cam.far = Math.max(cam.near + 0.01, c.deskShadowFar ?? 2);
  cam.updateProjectionMatrix();
  sh.needsUpdate = true;
}

/**
 * The dock's shadow, baked into something JS can ask questions of.
 *
 * The lantern already throws a real shadow on the water - DESK_SHADOW_CASTERS
 * above turns the deck into a caster and the river into a receiver. But a
 * shadow map only darkens PIXELS. It cannot tell the fish component "you are
 * in the dark right now", and a fish lit exactly as brightly under the deck as
 * out in the open is what gave the shoal away.
 *
 * So the same occlusion is solved a second time, analytically. Two facts out
 * of the file make that cheap:
 *
 *  - the deck is near-planar. Its 44 upward-facing triangles sit between y
 *    1.131 and 1.361, over a 2.69 x 2.75 footprint, so treating them as one
 *    plane at their area-weighted mean height is well inside the softness of
 *    the edge.
 *  - the lantern is a POINT. A point light's shadow of a plane onto another
 *    plane below is just the footprint scaled out from the light's XZ. So the
 *    whole test is 2-D: project the fish back UP onto the deck plane along the
 *    ray to the lantern, and ask whether it lands on the deck.
 *
 * The footprint is not a rectangle. The dock is two planks crossing at an
 * angle and covers ~34% of its own bounding box, so a box test would black out
 * fish swimming through the open corners. It is rasterised once into a SIGNED
 * DISTANCE FIELD instead - positive inside the deck, negative outside, in camp
 * units. Distance rather than a 0/1 mask because it buys a soft edge for free,
 * and one the panel can widen or tighten live without rebuilding the grid.
 */
type DeskShadeField = {
  x0: number; z0: number; cell: number; w: number; h: number;
  deckY: number; sdf: Float32Array;
};
// 0.03 camp units puts ~90x92 cells on the deck - finer than the shadow map
// resolves once it has been thrown 4x outward. The pad is room for the field
// to keep going negative past the edge, so Soft has something to ramp across.
const SHADE_CELL = 0.03;
const SHADE_PAD = 0.6;

function buildDockShade(root: THREE.Object3D): DeskShadeField | null {
  const tris: number[][] = [];
  let yWeighted = 0, areaTotal = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !DESK_SHADOW_CASTERS.has(mesh.name)) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute("position");
    if (!pos) return;
    const idx = geo.getIndex();
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
      ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
      const len = n.length();
      if (len < 1e-9) continue;
      // Deck surface only. The posts and the sides face sideways; they block
      // nothing the deck above them is not already blocking, and including
      // them would smear the footprint out to the bounding box.
      if (Math.abs(n.y) / len < 0.85) continue;
      tris.push([a.x, a.z, b.x, b.z, c.x, c.z]);
      yWeighted += ((a.y + b.y + c.y) / 3) * len; areaTotal += len;
    }
  });
  if (!tris.length || areaTotal <= 0) return null;

  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const t of tris) {
    for (let k = 0; k < 6; k += 2) {
      if (t[k] < x0) x0 = t[k];
      if (t[k] > x1) x1 = t[k];
      if (t[k + 1] < z0) z0 = t[k + 1];
      if (t[k + 1] > z1) z1 = t[k + 1];
    }
  }
  x0 -= SHADE_PAD; x1 += SHADE_PAD; z0 -= SHADE_PAD; z1 += SHADE_PAD;
  const w = Math.max(8, Math.ceil((x1 - x0) / SHADE_CELL));
  const h = Math.max(8, Math.ceil((z1 - z0) / SHADE_CELL));

  // Scan-convert the triangle soup. Overlaps are fine - this is a union, and
  // a cell already set stays set.
  const inside = new Uint8Array(w * h);
  for (const [ax, az, bx, bz, cx, cz] of tris) {
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / SHADE_CELL));
    const gx1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / SHADE_CELL));
    const gz0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / SHADE_CELL));
    const gz1 = Math.min(h - 1, Math.ceil((Math.max(az, bz, cz) - z0) / SHADE_CELL));
    for (let gz = gz0; gz <= gz1; gz++) {
      const pz = z0 + (gz + 0.5) * SHADE_CELL;
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = x0 + (gx + 0.5) * SHADE_CELL;
        const u = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
        const v = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
        if (u >= 0 && v >= 0 && u + v <= 1) inside[gz * w + gx] = 1;
      }
    }
  }

  // Two-pass chamfer distance transform, run once from the inside cells and
  // once from the outside ones; the difference is the signed distance. Exact
  // Euclidean would cost more and buy nothing - the error is a few percent of
  // a cell, and Soft is measured in whole camp units.
  const BIG = 1e6, D1 = 1, D2 = Math.SQRT2;
  const transform = (want: number) => {
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = inside[i] === want ? 0 : BIG;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x; let m = d[i];
        if (x > 0) m = Math.min(m, d[i - 1] + D1);
        if (y > 0) {
          m = Math.min(m, d[i - w] + D1);
          if (x > 0) m = Math.min(m, d[i - w - 1] + D2);
          if (x < w - 1) m = Math.min(m, d[i - w + 1] + D2);
        }
        d[i] = m;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x; let m = d[i];
        if (x < w - 1) m = Math.min(m, d[i + 1] + D1);
        if (y < h - 1) {
          m = Math.min(m, d[i + w] + D1);
          if (x < w - 1) m = Math.min(m, d[i + w + 1] + D2);
          if (x > 0) m = Math.min(m, d[i + w - 1] + D2);
        }
        d[i] = m;
      }
    }
    return d;
  };
  const toInside = transform(1);
  const toOutside = transform(0);
  const sdf = new Float32Array(w * h);
  for (let i = 0; i < sdf.length; i++) sdf[i] = (toOutside[i] - toInside[i]) * SHADE_CELL;

  return { x0, z0, cell: SHADE_CELL, w, h, deckY: yWeighted / areaTotal, sdf };
}

/** Everything a fish needs to know about being in the dark. */
type FishShade = {
  field: DeskShadeField;
  light: [number, number, number];
  amount: number;
  fade: number;
  soft: number;
  /** The lantern's reach, converted into CAMP units.
   *
   *  The config value is what goes on pointLight.distance, and three keeps
   *  that in WORLD units - it does not scale light falloff by the parent
   *  transform. The fish positions this is compared against are camp-local, so
   *  handing the raw number straight over compared 5 against distances that
   *  run to 28.9, and blacked out every fish more than a few units from the
   *  lamp. Divided by the camp's scale at the point it is read. */
  reach: number;
  /** How much of the distance falloff shows on the fish. 0 = occlusion only. */
  dark: number;
};

/**
 * How deep in the dock's shadow the point (x, y, z) is. 0 = fully lit, 1 =
 * fully blocked, with a smoothstep across the edge.
 */
function shadeAt(s: FishShade, x: number, y: number, z: number): number {
  /*
   * Two ways for a fish to be dark, and the second one was missing.
   *
   * The deck can block the lantern - that is the signed-distance lookup below.
   * But a fish can also simply be too far away to be lit at all, and that case
   * used to return 0, i.e. "fully lit", which left fish swimming at full
   * brightness through water that had already fallen off to black. Group B
   * spends 10% of its lap beyond the lantern's reach entirely, and at its
   * median distance the lamp is about six times dimmer than at group A's
   * closest approach - none of which the fish were showing.
   *
   * The falloff is quadratic against the lamp's OWN reach rather than a
   * separate curve, so the fish dim on the same schedule as the water they
   * are swimming over. Whichever darkness is deeper wins; they do not stack,
   * because a fish in shadow AND out of range should not go blacker than
   * black.
   */
  const dx0 = x - s.light[0], dy0 = y - s.light[1], dz0 = z - s.light[2];
  const dist = Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0);
  const lit = s.reach > 1e-4
    ? Math.max(0, Math.min(1, 1 - (dist / s.reach) * (dist / s.reach)))
    : 1;
  const byDistance = (1 - lit) * s.dark;

  const f = s.field;
  const drop = s.light[1] - f.deckY;
  if (drop <= 1e-4) return byDistance;                 // lantern is at or below the deck
  const k = (s.light[1] - y) / drop;          // how far the shadow has spread
  if (k <= 1) return byDistance;                       // the point is not below the deck
  // Back up the ray to the lantern until it meets the deck plane.
  const dx = s.light[0] + (x - s.light[0]) / k;
  const dz = s.light[2] + (z - s.light[2]) / k;
  const gx = (dx - f.x0) / f.cell - 0.5;
  const gz = (dz - f.z0) / f.cell - 0.5;
  if (gx < 0 || gz < 0 || gx > f.w - 1 || gz > f.h - 1) return byDistance;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const tx = gx - ix, tz = gz - iz;
  const ix1 = Math.min(ix + 1, f.w - 1), iz1 = Math.min(iz + 1, f.h - 1);
  const d =
    f.sdf[iz * f.w + ix] * (1 - tx) * (1 - tz) + f.sdf[iz * f.w + ix1] * tx * (1 - tz) +
    f.sdf[iz1 * f.w + ix] * (1 - tx) * tz + f.sdf[iz1 * f.w + ix1] * tx * tz;
  // Soft is authored at the FISH's depth, but the field is in the deck plane -
  // and the projection between them shrinks everything by k. Without this the
  // edge would visibly tighten as the fish swims deeper.
  const width = Math.max(1e-4, s.soft / k);
  const u = 0.5 + d / (2 * width);
  const occl = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
  return Math.max(occl, byDistance);
}




/**
 * One long skinny light hanging over the camp's string-light run.
 *
 * A RectAreaLight rather than a point or spot, because the thing being
 * imitated is a 6.8-unit line of 26 bulbs, and a point light at its centre
 * reads as a single hot spot instead of an even wash along the run.
 *
 * Defaults are fitted to the actual bulbs, not eyeballed. Their centroid is
 * (1.520, 3.366, -1.171) in camp space, they top out at y 4.05, and the
 * principal axis through them in the XZ plane runs at 44.9 degrees - hence
 * rotY 0.783. The run is 6.81 camp units end to end (it snakes, with 1.68 of
 * sideways spread), which is 1.41 WORLD units at the diorama's current scale.
 *
 * Two things about RectAreaLight worth knowing before touching this:
 *
 *  - width/height are WORLD units. three builds the light's extent from
 *    `matrix42.extractRotation(matrix4)` (WebGLLights.js:524), and
 *    extractRotation normalises the basis, so the parent's 0.207 scale is
 *    thrown away. Same trap as pointLight.distance. The visible proxy below
 *    therefore has to divide the camp scale back OUT to match the light.
 *  - it emits along local -Z. Object3D.lookAt on a light builds z = position
 *    - target, so -Z is the aimed axis; rotX -PI/2 stands +Z up and points
 *    the emitting face at the ground.
 *
 * RectAreaLight also needs RectAreaLightUniformsLib.init() before any material
 * that receives it compiles, and it only lights MeshStandard/MeshPhysical -
 * which is what the whole GLB imports as.
 */
/**
 * The fish shoals. Each is an independent group with its own centre, path
 * shape and population - which is what stops the whole thing reading as one
 * carousel. Ids build the config keys (`deskFish<id><field>`), so renaming an
 * id orphans its saved values.
 */
type DeskFishGroup = { id: string; label: string };
const DESK_FISH_GROUPS: readonly DeskFishGroup[] = [
  { id: "A", label: "Shoal · milling under the dock" },
  { id: "B", label: "Loop · long lap past the lantern" },
  { id: "C", label: "Spare shoal (off by default)" },
];

type FishParams = {
  count: number; x: number; y: number; z: number;
  rx: number; rz: number; rot: number; twist: number; scatter: number;
  speed: number; scale: number; bob: number;
  eight: number; wander: number; depthSpread: number; bank: number; yaw: number;
  // Shared by every shoal - how the fish MOVES, as opposed to where it goes.
  wiggle: number; beat: number; sway: number; waves: number; turnBend: number;
};
function readFishParams(config: CampfireSceneConfig, id: string): FishParams {
  const c = config as unknown as Record<string, number>;
  const v = (f: string, d: number) => c[`deskFish${id}${f}`] ?? d;
  return {
    count: v("On", 0) < 0.5 ? 0 : Math.max(0, Math.min(40, Math.round(v("Count", 0)))),
    x: v("X", 0), y: v("Y", 0), z: v("Z", 0),
    rx: v("RadiusX", 1), rz: v("RadiusZ", 1),
    rot: v("Rotate", 0), twist: v("Twist", 1), scatter: v("Scatter", 0),
    speed: v("Speed", 0.5), scale: v("Scale", 0.09), bob: v("Bob", 0.04),
    eight: v("Eight", 0), wander: v("Wander", 0), depthSpread: v("DepthSpread", 0),
    bank: v("Bank", 0.5), yaw: v("YawOffset", 0),
    wiggle: c.deskFishWiggle ?? 1, beat: c.deskFishBeat ?? 1, sway: c.deskFishSway ?? 0,
    waves: c.deskFishWaves ?? 0.75, turnBend: c.deskFishTurnBend ?? 0.35,
  };
}

const PHI = 0.6180339887;
const PLASTIC = 0.7548776662;

/**
 * Where fish `i` of `n` is at time `t`, in camp units.
 *
 * The first version of this was one shared circle and it showed - from a
 * fixed camera a ring of concentric paths, all with their long axis on X,
 * reads as fish shuttling back and forth rather than swimming. Four things
 * break that up, and the last two are what actually fixed it:
 *
 *  - Half the shoal traces a figure-eight rather than a loop (z advances at
 *    twice the rate of x - Lissajous 1:2). `g` is a golden-ratio sequence, so
 *    which half a fish is in is fixed but scattered.
 *  - Every other fish swims the opposite way round, so they meet and pass.
 *  - `twist` rotates EACH fish's path by its own angle, from a second
 *    low-discrepancy sequence (the plastic number, independent of the golden
 *    one). Without this every eight lay on the same axis, which is the
 *    back-and-forth.
 *  - `scatter` moves each fish's path CENTRE off the group's, so the paths
 *    interleave instead of sitting concentric.
 *
 * `rot` then turns the whole group as one - group B uses it to lay its long
 * ellipse along the shoreline, which runs diagonally here.
 *
 * Pure in t on purpose: the caller samples either side of now and gets
 * heading and turn rate by finite difference, which works whatever shape the
 * knobs produce. An analytic tangent would need rederiving every time.
 */
function fishPathAt(i: number, n: number, t: number, P: FishParams): [number, number, number] {
  const p = (2 * Math.PI * i) / n;
  const g = (i * PHI) % 1;
  const h = (i * PLASTIC) % 1;
  const dir = i % 2 ? -1 : 1;
  const jitter = 0.72 + 0.56 * g;
  const eightMul = 1 + (g >= 0.5 ? P.eight : 0);
  const theta = P.rot + 2 * Math.PI * ((g + h) % 1) * P.twist;
  const tt = t * (0.85 + 0.3 * g) + p;

  const bx = Math.cos(tt * dir) * P.rx * jitter;
  const bz = Math.sin(tt * dir * eightMul) * P.rz * jitter;
  const ct = Math.cos(theta), st = Math.sin(theta);

  // The per-fish centre offset turns with the GROUP (rot) but not with the
  // fish's own twist - otherwise twisting a path would also fling its centre.
  const ox = P.scatter * P.rx * Math.cos(2 * Math.PI * h) * (0.4 + 0.6 * g);
  const oz = P.scatter * P.rz * Math.sin(2 * Math.PI * h) * (0.4 + 0.6 * g);
  const cr = Math.cos(P.rot), sr = Math.sin(P.rot);

  return [
    P.x + (ox * cr - oz * sr) + bx * ct - bz * st
      + P.wander * P.rx * 0.45 * Math.sin(tt * 0.41 + p * 1.7),
    P.y + P.depthSpread * (g - 0.5) + P.bob * Math.sin(tt * 2.1 + p),
    P.z + (ox * sr + oz * cr) + bx * st + bz * ct
      + P.wander * P.rz * 0.33 * Math.sin(tt * 0.33 + p * 2.3),
  ];
}


/**
 * What "Armature|Swim" actually animates - measured out of fish.glb, because
 * the reason the shoal read as stiff is not obvious from watching it.
 *
 * The clip is 1.292s and touches FIVE bones:
 *
 *   Tail      25.5 deg    about bone-local -Z
 *   Spine3    12.3 deg    about bone-local -Z, in phase with the tail
 *   Bone.001   7.3 deg    a pectoral fin, in ANTIphase with the tail
 *   Bone       5.9 deg    the other fin
 *   Root       2.5 deg    a whole-body nod
 *
 * Spine1 and Spine2 have no tracks at all. So the fish does not swim - it
 * holds a rigid body and flicks its back third, and Spine3 and Tail peak at
 * the same instant, which is a hinge rather than a wave. At the size these
 * are on screen (0.063 fish scale under the camp's 0.207, so ~13mm of world)
 * a hinge in the last third is close to invisible.
 *
 * Two fixes, both driven off Wiggle:
 *
 *  - the bones the clip DOES move get their rotation stretched about the
 *    clip's own mean pose, so the motion keeps its authored axis and phase
 *    and only grows.
 *  - Spine1 and Spine2 get a bend the clip never gave them, LEADING the tail,
 *    which turns the hinge into a wave running head to tail. They are safe to
 *    drive on local Z: their rest rotations are within 0.5 deg of identity
 *    relative to Spine3, so the whole chain shares one bend plane.
 */
const SWIM_PEAK_PHASE = 0.774;   // where in the cycle the tail is fully over
const SWIM_BEND_AXIS = new THREE.Vector3(0, 0, -1);
// Only the pectoral fins still come from the clip. The spine is driven
// entirely below, because the clip moves Spine3 and Tail IN PHASE - the back
// third swings as one rigid piece, which is what read as "only the tail tip is
// flicking". A hinge cannot be fixed by scaling it; it has to be replaced.
const SWIM_AMPLIFY: Record<string, number> = { Bone: 0.5, "Bone.001": 0.5 };

/*
 * The spine as a travelling wave.
 *
 * `amp` is the joint angle in radians at Wiggle 1; `lead` is how far ahead of
 * the tail that joint runs, in cycles. The lead is the important half - four
 * joints bending in phase is a hinge, the same four staggered is a fish.
 *
 * The angles rise toward the tail, but the visible sweep does NOT rise with
 * them, because a joint's effect compounds down everything behind it. Measured
 * against this rig, one degree at each joint moves the tail tip by:
 *
 *   Spine1  0.108      Spine2  0.080      Spine3  0.051      Tail  0.021
 *
 * So the nose joint is five times more powerful per degree than the tail
 * joint. Weighting purely by angle is what buried the front of the body: at
 * the old numbers the tail turned 36 degrees while Spine1 managed 4.4, an 8:1
 * ratio that put every visible bit of motion in the last segment. These
 * angles keep the back half leading, but by a margin you can read as a body
 * bending rather than a tip twitching.
 */
/*
 * `pos` is where the joint sits along the body, 1 at the head and 0 at the
 * tail. The lead is not baked in any more - it is `pos * deskFishWaves`, so
 * that one slider says how much of a wavelength the body carries. At 0.25 the
 * fish sweeps almost as one piece; at 0.75 an S is visible along it at any
 * instant; past 1 it starts to fold back on itself and reads as an eel.
 *
 * The angles are flatter than they look. Tail is no longer the largest -
 * driving it hardest is what flung the tip out, and it is the joint with the
 * LEAST leverage on the tip anyway (0.021 per degree against Spine1's 0.108).
 */
const SWIM_WAVE: readonly { name: string; amp: number; pos: number }[] = [
  { name: "Spine1", amp: 0.13, pos: 1.000 },
  { name: "Spine2", amp: 0.17, pos: 0.667 },
  { name: "Spine3", amp: 0.20, pos: 0.333 },
  { name: "Tail",   amp: 0.20, pos: 0.000 },
];

/**
 * Each animated bone's NEUTRAL pose, taken as the mean of its track rather
 * than from the bone itself.
 *
 * Reading bone.quaternion at mount would be simpler and wrong: the source
 * scene is drei's shared cache, and the desk's pet fish attaches its mixer
 * straight to it, so by the time a shoal clones the model those bones may be
 * sitting anywhere in a flop. The clip's own average is the fish swimming
 * straight, whatever the cache is doing.
 *
 * Quaternions are summed in the hemisphere of the first key - q and -q are the
 * same rotation, so without the flip a swing either side of straight cancels
 * itself out.
 */
const swimNeutralCache = new WeakMap<THREE.AnimationClip, Map<string, THREE.Quaternion>>();
function swimNeutrals(clip: THREE.AnimationClip): Map<string, THREE.Quaternion> {
  const hit = swimNeutralCache.get(clip);
  if (hit) return hit;
  const out = new Map<string, THREE.Quaternion>();
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf(".");
    if (dot < 0 || track.name.slice(dot + 1) !== "quaternion") continue;
    const v = track.values;
    const n = Math.floor(v.length / 4);
    if (!n) continue;
    let x = 0, y = 0, z = 0, w = 0;
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      const s = v[k] * v[0] + v[k+1] * v[1] + v[k+2] * v[2] + v[k+3] * v[3] < 0 ? -1 : 1;
      x += s * v[k]; y += s * v[k+1]; z += s * v[k+2]; w += s * v[k+3];
    }
    out.set(track.name.slice(0, dot), new THREE.Quaternion(x, y, z, w).normalize());
  }
  swimNeutralCache.set(clip, out);
  return out;
}

/**
 * One fish. fish.glb ships its own skeletal clip - "Armature|Swim" - so the
 * tail motion is the model's; only the path is procedural.
 *
 * skeletonClone, NOT scene.clone(true): a plain clone of a SkinnedMesh keeps a
 * reference to the SOURCE skeleton, so every copy would bend to whichever
 * mixer ran last and the whole shoal would flex in lockstep. SkeletonUtils
 * rebuilds the bone hierarchy per copy and rebinds the skin to it.
 *
 * The model's long axis is Z (1.15 x 2.67 x 7.98), so yawing to the travel
 * direction points it along its own length. Which END is the nose is the
 * model's business - that is what YawOffset is for.
 */
function SwimFish({
  index, count, params, shade,
}: {
  index: number; count: number; params: FishParams; shade: FishShade | null;
}) {
  const gltf = useGLTF(FISH_URL) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] };
  const scene = useMemo(() => skeletonClone(gltf.scene), [gltf.scene]);

  // Each fish gets its OWN materials. SkeletonUtils.clone rebuilds the bone
  // hierarchy per copy but SHARES materials with the source, so darkening one
  // fish in place would darken the entire shoal - and, because the source is
  // drei's cached fish.glb, every fish this page ever loads, surviving a
  // remount. Cached by source uuid so parts of one fish that shared a material
  // still share its clone and only get written once a frame.
  const tint = useMemo(() => {
    const out: { mat: THREE.MeshStandardMaterial; base: THREE.Color }[] = [];
    const seen = new Map<string, THREE.MeshStandardMaterial>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = src.map((m) => {
        let clone = seen.get(m.uuid);
        if (!clone) {
          clone = (m as THREE.MeshStandardMaterial).clone();
          seen.set(m.uuid, clone);
          out.push({ mat: clone, base: clone.color.clone() });
        }
        return clone;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    return out;
  }, [scene]);
  const { actions } = useAnimations(gltf.animations, scene);
  const grp = useRef<THREE.Group>(null);
  const swim = useRef<THREE.AnimationAction | null>(null);

  // The bones this fish will push around, resolved once against ITS OWN clone.
  const rig = useMemo(() => {
    const clip = gltf.animations.find((a) => /swim/i.test(a.name)) ?? gltf.animations[0];
    const neutrals = clip ? swimNeutrals(clip) : new Map<string, THREE.Quaternion>();
    const amplify: { obj: THREE.Object3D; neutral: THREE.Quaternion; weight: number }[] = [];
    for (const [name, weight] of Object.entries(SWIM_AMPLIFY)) {
      const obj = scene.getObjectByName(name);
      const neutral = neutrals.get(name);
      if (obj && neutral) amplify.push({ obj, neutral, weight });
    }
    const wave: { obj: THREE.Object3D; rest: THREE.Quaternion; amp: number; pos: number }[] = [];
    for (const { name, amp, pos } of SWIM_WAVE) {
      const obj = scene.getObjectByName(name);
      if (!obj) continue;
      // Neutral first, bind pose only as a fallback. Spine3 and Tail ARE in
      // the clip, so reading their live quaternion here would capture whatever
      // pose drei's shared cache happens to be holding; the clip's own mean is
      // the fish swimming straight. Spine1/Spine2 have no track at all, so for
      // those the bind pose IS the neutral.
      wave.push({ obj, rest: (neutrals.get(name) ?? obj.quaternion).clone(), amp, pos });
    }
    return { amplify, wave, duration: clip?.duration || 1 };
  }, [scene, gltf.animations]);

  // Scratch, so a shoal of forty does not allocate 200 quaternions a frame.
  const scratch = useMemo(
    () => ({ a: new THREE.Quaternion(), b: new THREE.Quaternion() }), []);

  useEffect(() => {
    const action = actions["Armature|Swim"] ?? Object.values(actions)[0];
    if (!action) return;
    action.reset();
    // Stagger the tail beat so the shoal doesn't pulse as one animal.
    action.time = (index / Math.max(1, count)) * (action.getClip().duration || 1);
    // Beat with the swimming, not against it. This used to be a flat 0.85-1.15
    // whatever the Speed slider said, so a shoal dawdling at Speed 0.32 still
    // thrashed its tail at full rate. 0.4 is group A's authored speed, i.e.
    // the rate the clip is scaled to look right at; the floor keeps a parked
    // fish idling rather than freezing solid.
    const travel = Math.max(0.3, Math.min(3, params.speed / 0.4));
    action.timeScale = params.beat * travel * (0.85 + 0.3 * ((index * PHI) % 1));
    action.setEffectiveWeight(1);
    action.play();
    swim.current = action;
    return () => { action.stop(); swim.current = null; };
  }, [actions, index, count, params.beat, params.speed]);

  useFrame(({ clock }) => {
    const g = grp.current;
    if (!g) return;
    const t = clock.elapsedTime * params.speed;
    // Sample either side of now: the middle point is where the fish IS, the
    // forward pair gives heading, and the spread of the two headings gives
    // how hard it is turning - which is what it banks into.
    const dt = 0.08;
    const [xb, , zb] = fishPathAt(index, count, t - dt, params);
    const [x, y, z] = fishPathAt(index, count, t, params);
    const [xf, , zf] = fishPathAt(index, count, t + dt, params);
    g.position.set(x, y, z);

    // Heading first, because the spine below needs to know which way the fish
    // is turning before it can lean into it.
    const yaw = Math.atan2(xf - x, zf - z) + params.yaw;
    const yawBack = Math.atan2(x - xb, z - zb) + params.yaw;
    // Wrap before differencing, or the roll snaps whenever heading crosses +-PI.
    let turn = yaw - yawBack;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const turnRate = turn / dt;

    /*
     * A fish going round a corner does not stay straight and pivot - it holds
     * a curve through its whole body for as long as the turn lasts. That is a
     * steady offset on every spine joint, riding under the travelling wave.
     *
     * tanh, not a clamp. Measured over the actual paths these shoals swim, the
     * turn rate is 0.85 rad/s at the median but 3.4 at the 90th percentile and
     * 8.8 at its worst - a 10x spread. Anything linear enough to read at the
     * median folds the fish in half at the top end, and anything gentle enough
     * to survive the top end is invisible most of the time. tanh gives 7 deg
     * at the median, 18 at p90, and never more than TurnBend however hard the
     * corner.
     *
     * On the sign: the tail curls toward the INSIDE of the turn, which is the
     * opposite of what it feels like it should do. For a body following a
     * circle of radius R, with the tail a small arc d behind the head, the
     * tail's offset in the head's own frame expands to
     *
     *     tail - head  =  -R*d*(forward)  -  R*d^2/2*(outward radial)
     *
     * and that second term points INWARD. A body conforming to an arc trails
     * its back end toward the centre of the turn, not away from it. The model
     * faces +Z, so a rising yaw turns it toward its own +X, and a positive
     * bend angle carries the tail that same way - which is the inside. So the
     * sign is positive, and TurnBend negative in the panel mirrors it.
     */
    const bend = params.turnBend * Math.tanh(turnRate * 0.45);

    // --- body ------------------------------------------------------------
    //
    // Runs after drei's mixer: useAnimations is called above this hook, so its
    // useFrame is registered first and has already written the clip's pose by
    // the time this reads it.
    const action = swim.current;
    if (action) {
      // Stretch what the clip animates. slerp extrapolates past t = 1 - it is
      // a formula along the great circle, not a clamped blend - so this is the
      // authored motion made bigger, on the authored axis, not a new one.
      for (const { obj, neutral, weight } of rig.amplify) {
        const factor = 1 + (params.wiggle - 1) * weight;
        if (Math.abs(factor - 1) < 0.001) continue;
        scratch.a.copy(obj.quaternion);
        obj.quaternion.copy(neutral).slerp(scratch.a, factor);
      }
      // Drive the whole spine. Written absolutely from each bone's neutral
      // rather than read-modify-write, so this cannot compound frame to frame
      // whatever order the mixer's useFrame happens to run in.
      if (rig.wave.length && Math.abs(params.wiggle) > 0.001) {
        const cycle = (action.time / rig.duration) - SWIM_PEAK_PHASE;
        // A fish putting on speed does not just beat faster, it throws more of
        // its body into each beat. The tail-beat RATE already tracks Speed
        // through the clip's timeScale; this is the amplitude half of it, on
        // the same 0.4 reference so the two stay in step.
        const travel = Math.max(0.3, Math.min(3, params.speed / 0.4));
        const gain = params.wiggle * (0.7 + 0.3 * travel);
        for (const { obj, rest, amp, pos } of rig.wave) {
          // The turn curve is carried a little harder at the back than the
          // front - the head leads into a corner, the body follows it round.
          const lean = bend * (0.55 + 0.45 * (1 - pos));
          const a = amp * gain * Math.cos(2 * Math.PI * (cycle + pos * params.waves)) + lean;
          obj.quaternion.copy(rest).multiply(scratch.b.setFromAxisAngle(SWIM_BEND_AXIS, a));
        }
      }
    }

    // The nose sweeps with the beat. The bones bend the fish; this swings the
    // whole animal, which is what carries at the distance these are viewed
    // from. Locked to the clip's phase so it never drifts against the tail.
    //
    // Added at the END, not to `yaw`: `turn` below is the difference between
    // this heading and the one a moment ago, and a sway inside it would read
    // as a hard turn and roll the fish onto its side twice a beat.
    const sway = action && params.sway
      ? params.sway * Math.sin(2 * Math.PI * ((action.time / rig.duration) - SWIM_PEAK_PHASE))
      : 0;
    const roll = Math.max(-0.7, Math.min(0.7, turnRate * 0.12 * params.bank));
    g.rotation.set(0, yaw + sway, -roll);

    // Into the dark under the dock. At Shade 0 and Fade 0 this writes the
    // material's own colour back every frame, which is what restores a fish
    // that swims out again - and what makes turning the sliders down a real
    // reset rather than something that needs a remount.
    if (!shade) return;
    const s = shadeAt(shade, x, y, z);
    const k = 1 - s * shade.amount;
    const o = 1 - s * shade.fade;
    const clear = o < 0.999;
    for (const { mat, base } of tint) {
      mat.color.copy(base).multiplyScalar(k);
      mat.opacity = o;
      // Safe to drive opacity absolutely: all three of fish.glb's materials
      // (Bottom, Top, Fins) are alphaMode OPAQUE with a baseColorFactor alpha
      // of 1 and no texture, so there is no authored transparency to trample.
      //
      // transparent flips the material between render passes, which needs a
      // shader recompile - so only touch it when it actually changes, not on
      // every frame of a fish crossing the edge.
      if (mat.transparent !== clear) {
        mat.transparent = clear;
        mat.depthWrite = !clear;
        mat.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={grp} scale={params.scale}>
      <primitive object={scene} />
    </group>
  );
}

/** One shoal. Count remounts its fish, which is fine - it is a lab knob. */
function DeskFishShoal({
  config, id, shade,
}: { config: CampfireSceneConfig; id: string; shade: FishShade | null }) {
  const params = readFishParams(config, id);
  return (
    <>
      {Array.from({ length: params.count }, (_, i) => (
        <SwimFish key={i} index={i} count={params.count} params={params} shade={shade} />
      ))}
    </>
  );
}

function DeskWaterFish({
  config, shade,
}: { config: CampfireSceneConfig; shade: FishShade | null }) {
  return (
    <>
      {DESK_FISH_GROUPS.map((g) => (
        <DeskFishShoal key={g.id} config={config} id={g.id} shade={shade} />
      ))}
    </>
  );
}

let rectAreaLightReady = false;
function DeskStringLight({ config, campScale }: { config: CampfireSceneConfig; campScale: number }) {
  if (!rectAreaLightReady) {
    RectAreaLightUniformsLib.init();
    rectAreaLightReady = true;
  }
  const color = useMemo(
    () => new THREE.Color().setRGB(
      config.deskStringLightColorR, config.deskStringLightColorG, config.deskStringLightColorB),
    [config.deskStringLightColorR, config.deskStringLightColorG, config.deskStringLightColorB]
  );
  if (config.deskStringLightOn < 0.5) return null;
  const ws = Math.abs(campScale) > 1e-6 ? campScale : 1;
  const rot: [number, number, number] = [
    config.deskStringLightRotX, config.deskStringLightRotY, config.deskStringLightRotZ,
  ];
  const pos: [number, number, number] = [
    config.deskStringLightX, config.deskStringLightY, config.deskStringLightZ,
  ];
  return (
    <group position={pos} rotation={rot}>
      <rectAreaLight
        width={config.deskStringLightWidth}
        height={config.deskStringLightHeight}
        color={color}
        intensity={config.deskStringLightIntensity}
      />
      {/* Positioning aid, not scenery - flip "Show the bar" off when placed.
          Unlit and untoneMapped so it reads as the light itself, and pushed a
          hair along -Z so it never z-fights the light plane. The geometry is
          divided by the camp scale so the bar you drag is exactly the size of
          the light you get. */}
      {config.deskStringLightShow >= 0.5 && (
        <mesh position={[0, 0, -0.001]} renderOrder={3}>
          <planeGeometry args={[config.deskStringLightWidth / ws, config.deskStringLightHeight / ws]} />
          <meshBasicMaterial color={color} toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.65} />
        </mesh>
      )}
    </group>
  );
}


/**
 * A few dozen insects orbiting a lamp.
 *
 * Rendered exactly like Sparks - one <points> with a per-vertex alpha
 * attribute patched into PointsMaterial - because that is already the cheapest
 * way to get dozens of independently-fading motes on screen here. Everything
 * about the MOTION is different, and that difference is the whole effect:
 *
 *  - A spark is born at the ground, rises, and dies. A bug never leaves. Each
 *    one holds its own orbit around the bulb - its own radius, height, plane
 *    tilt, speed and DIRECTION, with every other bug going round the other
 *    way, so the swarm reads as a cloud instead of a carousel.
 *  - Insects at a lamp do not glide, they snap. Each axis gets a wobble at its
 *    own frequency (7.3, 9.1, 6.1) on top of the orbit - deliberately
 *    incommensurate, so the path never visibly repeats.
 *  - Every so often one lunges at the bulb and pulls back out. That is the
 *    behaviour the eye reads as alive. It is sin() raised to the 8th, which
 *    holds near zero and spikes briefly; a plain sine would look like the
 *    whole swarm breathing in and out together.
 *  - Alpha flickers fast and per-bug, the way wings catch the light, and
 *    brightens through the lunge, when the bug is closest to the bulb.
 *
 * Every knob is in WORLD units, and `frameScale` is what makes that true.
 *
 * The swarm gets hung on lamps in wildly different frames - the camp diorama
 * runs at 0.173 world units per unit, the arcade cabin at 0.0307, so one camp
 * unit is 5.64 cabin units. Left in local units, one set of sliders would give
 * a swarm 5.6x smaller on the cabin than on the signpost. So Radius and Height
 * are divided by the accumulated scale of whatever frame the swarm is mounted
 * in, and one set of numbers describes the same real swarm everywhere.
 *
 * `size` is the exception that needs NO conversion, because three assigns
 * gl_PointSize straight from the uniform and only then divides by view depth
 * (points.glsl.js:34-40) - the model matrix never reaches it. Same trap as
 * RectAreaLight's width/height and pointLight.distance, except here it works
 * in our favour.
 *
 * frustumCulled is off because the geometry's bounding sphere is computed once
 * from the initial buffer - all zeros - and never recomputed, so three would
 * cull the whole swarm against a sphere of radius 0 at the camp origin.
 */
type BugSwarmProps = {
  origin: [number, number, number];
  /** World units per unit of the frame this swarm is mounted in. */
  frameScale: number;
  count: number; radius: number; spread: number; height: number;
  speed: number; jitter: number; dive: number;
  size: number; opacity: number; color: THREE.Color;
  // --- shape: these regenerate the per-bug constants when they change -------
  seed: number; speedVary: number; twoWay: number; tilt: number;
  lungeRate: number; flickerRate: number;
  /** Per-bug size spread. 0 = every mote identical (what PointsMaterial gives
   *  you on its own); 1 = sizes range from half to one-and-a-half. Needs the
   *  shader tweak below, because pointsMaterial.size is a single global. */
  sizeVary: number;
  // --- motion: read live every frame ---------------------------------------
  lungeSharp: number; lungeDepth: number; jitterSpeed: number;
  flickerDepth: number; lungeFlare: number; drift: number; additive: number;
  /** Exponent on where bugs sit in the column / the radius band. 1 is the
   *  even scatter this always had; >1 crowds them low / inward, <1 high /
   *  outward. Applied per frame off the raw random, so dragging re-shapes the
   *  swarm instead of reshuffling which bug is which. */
  heightBias: number; radiusBias: number;
  /** Orbit shape: Z radius as a fraction of X, so 1 is the circle it was and
   *  0.3 is a flattened ellipse. `swarmRotY` spins that ellipse. */
  oval: number; swarmRotY: number;
  /** A faster vertical bob than `drift`, in column heights. */
  wobbleY: number;
  /** Nudge the whole swarm off its anchor, in the frame's own units. */
  offsetX: number; offsetY: number; offsetZ: number;
};

/** Everything the two mounting points hand a swarm, built once from config. */
/**
 * The shared swarm design, with one site's own block applied on top.
 *
 * Everything that describes HOW the bugs behave - lunge, flicker, jitter,
 * drift, tilt - stays global on purpose: that is the species, and it should
 * look like the same insect at every lamp. What varies per site is the shape
 * and placement of the cloud, so those are the knobs that take a multiplier.
 *
 * `scope` is the config prefix, and it is the same string the fixture's other
 * keys are built from (deskLampSmallA and friends), so a lamp's swarm block
 * lives with the rest of that lamp's settings rather than in a table of its
 * own that could fall out of step with DESK_CAMP_LAMPS.
 */
function bugSwarmProps(config: CampfireSceneConfig, color: THREE.Color, scope: BugSwarmScope) {
  const c = config as unknown as Record<string, number>;
  const tweak = (knob: BugSwarmTweak) => c[`${scope}${knob}`] ?? BUG_SWARM_TWEAK_DEFAULTS[knob];
  return {
    // Count is rounded here rather than in BugSwarm, so the multiplier reads
    // as a real number of bugs on the panel instead of silently truncating.
    count: Math.max(0, Math.round(config.deskBugCount * tweak("BugCountMul"))),
    radius: config.deskBugRadius * tweak("BugRadiusMul"),
    spread: config.deskBugSpread * tweak("BugSpreadMul"),
    height: config.deskBugHeight * tweak("BugHeightMul"),
    speed: config.deskBugSpeed * tweak("BugSpeedMul"),
    size: config.deskBugSize * tweak("BugSizeMul"),
    opacity: Math.max(0, Math.min(1, config.deskBugOpacity * tweak("BugOpacityMul"))),
    jitter: config.deskBugJitter,
    dive: config.deskBugDive, color,
    seed: config.deskBugSeed + tweak("BugSeedShift"), speedVary: config.deskBugSpeedVary,
    twoWay: config.deskBugTwoWay, tilt: config.deskBugTilt,
    lungeRate: config.deskBugLungeRate, flickerRate: config.deskBugFlickerRate,
    lungeSharp: config.deskBugLungeSharp, lungeDepth: config.deskBugLungeDepth,
    jitterSpeed: config.deskBugJitterSpeed, flickerDepth: config.deskBugFlickerDepth,
    lungeFlare: config.deskBugLungeFlare,
    drift: config.deskBugDrift, additive: config.deskBugAdditive,
    sizeVary: config.deskBugSizeVary,
    heightBias: config.deskBugHeightBias, radiusBias: config.deskBugRadiusBias,
    oval: config.deskBugOval, swarmRotY: config.deskBugRotY,
    wobbleY: config.deskBugWobbleY,
    // Added to the shared offset, not replacing it: the global is "where a
    // swarm sits relative to its bulb" in general, this is this fixture's
    // correction to that.
    offsetX: config.deskBugOffsetX + tweak("BugOffX"),
    offsetY: config.deskBugOffsetY + tweak("BugOffY"),
    offsetZ: config.deskBugOffsetZ + tweak("BugOffZ"),
  };
}

function BugSwarm({
  origin, frameScale, count, radius, spread, height, speed, jitter, dive,
  size, opacity, color, seed, speedVary, twoWay, tilt, lungeRate, flickerRate,
  lungeSharp, lungeDepth, jitterSpeed, flickerDepth, lungeFlare, drift, additive,
  sizeVary, heightBias, radiusBias, oval, swarmRotY, wobbleY,
  offsetX, offsetY, offsetZ,
}: BugSwarmProps) {
  // Radius and Height are authored in world units; the orbit is built in the
  // parent's units, so divide the frame's scale back out.
  const s = Math.abs(frameScale) > 1e-6 ? Math.abs(frameScale) : 1;
  const localRadius = radius / s;
  const localHeight = height / s;
  const N = Math.max(1, Math.min(400, Math.round(count)));
  const posRef = useRef<THREE.BufferAttribute>(null);
  const alphaRef = useRef<THREE.BufferAttribute>(null);

  // One fixed set of per-bug constants, from a seeded generator: a reload
  // gives back the same swarm, and dragging a slider re-shapes it rather than
  // reshuffling which bug is which.
  const { positions, alphas, sizes, bugs } = useMemo(() => {
    const rand = seededRandom(Math.round(seed));
    const made = Array.from({ length: N }, () => ({
      ru: rand(),                                           // raw draw; radiusBias shapes it per frame
      phase: rand() * Math.PI * 2,
      // Orbit speed, and which way round. TwoWay is the probability of going
      // the other way, so 0 is a carousel, 0.5 a cloud, 1 a carousel again in
      // reverse - the interesting values are in the middle.
      w: (1 - speedVary * 0.5 + rand() * speedVary) * (rand() < twoWay ? -1 : 1),
      yu: rand(),                                           // raw draw; heightBias shapes it per frame
      tilt: (rand() - 0.5) * 2 * tilt,                      // how tipped its orbit plane is
      tiltPhase: rand() * Math.PI * 2,
      jp: rand() * Math.PI * 2,                             // wobble phase
      dw: lungeRate * (0.35 + rand()),                      // how often this one lunges
      dphase: rand() * Math.PI * 2,
      ff: flickerRate * (0.6 + rand() * 0.9),               // wing flicker rate
      fp: rand() * Math.PI * 2,
      // Drawn LAST on purpose: appending keeps every draw above it unchanged,
      // so adding per-bug size did not reshuffle anyone's existing swarm.
      su: rand(),
    }));
    // These six decide who each bug IS, so changing one has to regenerate the
    // set - unlike radius or speed, which only reshape a swarm that already
    // exists. Reshuffling on a Radius drag would be maddening; not reshuffling
    // on a Seed drag would make the knob do nothing.
    const sizes = new Float32Array(N);
    for (let i = 0; i < N; i += 1) sizes[i] = 1 - sizeVary * 0.5 + made[i].su * sizeVary;
    return { positions: new Float32Array(N * 3), alphas: new Float32Array(N), sizes, bugs: made };
  }, [N, seed, speedVary, twoWay, tilt, lungeRate, flickerRate, sizeVary]);

  const live = {
    origin, radius: localRadius, spread, height: localHeight, speed, jitter, dive,
    lungeSharp, lungeDepth, jitterSpeed, flickerDepth, lungeFlare, drift,
    heightBias, radiusBias, oval, swarmRotY, wobbleY,
    offsetX: offsetX / s, offsetY: offsetY / s, offsetZ: offsetZ / s,
  };
  const p = useRef(live);
  p.current = live;
  // The swarm's OWN clock, advanced by real time scaled by Speed - not
  // clock.elapsedTime read straight. Orbit angle already multiplied Speed
  // in on its own below, but jitter, drift, wobble, the lunge and the
  // wing-flicker all used to read the wall clock regardless of it, so a
  // swarm dialed down to a crawl on Speed still jittered and flickered at
  // full tempo - "slower" bottomed out well short of still. Scaling the
  // swarm's clock by Speed instead means every one of those follows it
  // down too, all the way to frozen at 0.
  const swarmClock = useRef(0);

  useFrame((_state, delta) => {
    const posAttr = posRef.current, alphaAttr = alphaRef.current;
    if (!posAttr || !alphaAttr) return;
    const P = posAttr.array as Float32Array;
    const A = alphaAttr.array as Float32Array;
    const c = p.current;
    swarmClock.current += delta * Math.max(0, c.speed);
    const t = swarmClock.current;
    for (let i = 0; i < N; i += 1) {
      const b = bugs[i];
      // Bias 1 reproduces the even scatter exactly (pow(x,1) === x), so these
      // knobs default to the swarm this always drew.
      const rf = 0.35 + Math.pow(b.ru, c.radiusBias);
      const yf = Math.pow(b.yu, c.heightBias) - 0.5;
      const r0 = c.radius * (1 - c.spread * 0.5 + c.spread * rf);
      // Brief lunge at the bulb, not a pulse - see the note above about ^8.
      // LungeSharp is the exponent: high holds near zero and spikes, low
      // rounds it out into the whole swarm breathing together.
      const d = Math.pow(0.5 + 0.5 * Math.sin(t * b.dw + b.dphase), c.lungeSharp) * c.dive;
      const r = r0 * (1 - c.lungeDepth * d);
      // Speed is already baked into `t` above - not reapplied here.
      const a = b.phase + t * b.w;
      const j = c.jitter * r0;
      const js = c.jitterSpeed;
      // Ellipse, then spin it about Y. oval 1 + swarmRotY 0 is the old circle.
      const ex = Math.cos(a) * r;
      const ez = Math.sin(a) * r * c.oval;
      const cy = Math.cos(c.swarmRotY), sy = Math.sin(c.swarmRotY);
      P[i * 3] = c.origin[0] + c.offsetX + ex * cy + ez * sy
        + j * 0.5 * Math.sin(t * 7.3 * js + b.jp);
      P[i * 3 + 1] = c.origin[1] + c.offsetY + c.height * yf
        + Math.sin(a + b.tiltPhase) * c.height * 0.5 * b.tilt
        - d * c.height * 0.55 * c.lungeDepth
        + c.height * c.drift * Math.sin(t * 0.23 + b.jp * 1.3)
        + c.height * c.wobbleY * Math.sin(t * 1.9 * js + b.jp * 2.1)
        + j * 0.35 * Math.sin(t * 9.1 * js + b.jp * 1.7);
      P[i * 3 + 2] = c.origin[2] + c.offsetZ - ex * sy + ez * cy
        + j * 0.5 * Math.cos(t * 6.1 * js + b.jp * 2.3);
      const flick = 0.5 + 0.5 * Math.sin(t * b.ff + b.fp);
      /*
       * Two things move a bug's brightness, and BOTH are knobs now.
       *
       * FlickerDepth is the wing blink: 0 is a steady mote, 1 blinks all the
       * way to dark. LungeFlare is the flare on the dive at the bulb, which
       * used to be a hardcoded 0.6 - so a swarm turned all the way down on
       * flicker still pulsed, with nothing in the panel to explain why. At 0
       * a lunging bug is exactly as bright as a circling one and the only
       * thing the lunge changes is where it is.
       */
      A[i] = Math.min(1, (1 - c.flickerDepth) + c.flickerDepth * flick + d * c.lungeFlare);
    }
    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute ref={posRef} attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute ref={alphaRef} attach="attributes-alpha" args={[alphas, 1]} />
        {/* Static per-bug size multiplier - never rewritten per frame, so no ref. */}
        <bufferAttribute attach="attributes-ascale" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={additive >= 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending}
        toneMapped={false}
        onBeforeCompile={(shader) => {
          shader.vertexShader = shader.vertexShader
            .replace(
              "void main() {",
              "attribute float alpha;\nattribute float ascale;\nvarying float vAlpha;\nvoid main() {\n  vAlpha = alpha;"
            )
            // three sets gl_PointSize from the material's single `size`, then
            // applies attenuation to it - folding the per-bug multiplier in
            // here keeps sizeAttenuation working on top.
            .replace("gl_PointSize = size;", "gl_PointSize = size * ascale;");
          shader.fragmentShader = shader.fragmentShader
            .replace("void main() {", "varying float vAlpha;\nvoid main() {")
            .replace(
              "vec4 diffuseColor = vec4( diffuse, opacity );",
              "vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );"
            );
        }}
      />
    </points>
  );
}

/** One camp lamp's point light. Split into its own component so each lamp
 *  reads only its own config keys - a scrub of one lamp's slider re-renders
 *  that light, not all five. */
function DeskCampLampLight({
  lamp,
  position,
  config,
}: {
  lamp: DeskCampLamp;
  position: THREE.Vector3;
  config: CampfireSceneConfig;
}) {
  const c = config as unknown as Record<string, number>;
  const on = c[`deskLamp${lamp.id}On`] ?? 1;
  const r = c[`deskLamp${lamp.id}R`] ?? 1;
  const g = c[`deskLamp${lamp.id}G`] ?? 0.72;
  const b = c[`deskLamp${lamp.id}B`] ?? 0.35;
  const color = useMemo(() => new THREE.Color().setRGB(r, g, b), [r, g, b]);
  const bugColor = useMemo(
    () => new THREE.Color().setRGB(config.deskBugR, config.deskBugG, config.deskBugB),
    [config.deskBugR, config.deskBugG, config.deskBugB]
  );

  const bulb = useRef<THREE.PointLight>(null);
  const shadowOn = (c[`deskLamp${lamp.id}Shadow`] ?? 0) >= 0.5;
  useEffect(() => {
    if (!shadowOn) return;
    if (bulb.current) applyDeskShadow(bulb.current, c);
    if (spot.current) applyDeskShadow(spot.current, c);
  });

  const spot = useRef<THREE.SpotLight>(null);
  const spotTarget = useRef<THREE.Object3D>(null);
  // A SpotLight's target defaults to a DETACHED Object3D, which three reads as
  // target.matrixWorld = target.matrix - i.e. its position is taken as WORLD
  // space, not local. Every beam would aim at the world origin, which for a
  // camp sitting 15 units off it means the headlights point at nothing. The
  // <object3D> below is a real child, so it inherits the camp's transform.
  useEffect(() => {
    if (spot.current && spotTarget.current) spot.current.target = spotTarget.current;
  }, []);

  // Where the light actually emits from. The LENS is placed separately, by
  // the lampParts effect off deskLamp<id>Off*, and this component no longer
  // reads that at all - the two used to share one offset, so nudging a lamp's
  // look dragged its light with it and vice versa.
  const lightPos: [number, number, number] = [
    position.x + (c[`deskLamp${lamp.id}LightX`] ?? 0),
    position.y + (c[`deskLamp${lamp.id}LightY`] ?? 0),
    position.z + (c[`deskLamp${lamp.id}LightZ`] ?? 0),
  ];

  // Bugs orbit the EMITTER, so they follow Light X/Y/Z. Beam fixtures push
  // their spot source forward out of the bodywork; the swarm deliberately
  // stays on lightPos, because insects gather at the bulb, not out in the
  // cone ahead of it.
  const bugs = (c[`deskLamp${lamp.id}Bugs`] ?? 0) >= 0.5 ? (
    <BugSwarm
      origin={lightPos}
      // baseScale on the camping Selectable is 1, so the accumulated scale IS
      // its override - the same reasoning DeskStringLight uses for its bar.
      frameScale={config.objectOverrides?.["old_bear_camping"]?.scale ?? 1}
      {...bugSwarmProps(config, bugColor, `deskLamp${lamp.id}` as BugSwarmScope)}
    />
  ) : null;
  const intensity = c[`deskLamp${lamp.id}Intensity`] ?? 0.2;
  const reach = c[`deskLamp${lamp.id}Reach`] ?? 4.5;
  const decay = c[`deskLamp${lamp.id}Decay`] ?? 2;

  if (on < 0.5) return null;

  const beamOn = lamp.beam && (c[`deskLamp${lamp.id}Beam`] ?? 1) >= 0.5;
  if (beamOn && lamp.beam) {
    const aim = Math.max(0.1, reach);
    // Normalise the authored direction so Push is in real camp units.
    // Horizontal heading from the table, downward tilt from config. Both
    // headlights use the SAME direction from their own positions, so the two
    // cones are parallel by construction and lay down two parallel pools
    // rather than crossing.
    const tilt = c[`deskLamp${lamp.id}BeamTilt`] ?? -0.28;
    const bx = lamp.beam[0], bz = lamp.beam[2];
    const bl = Math.hypot(bx, tilt, bz) || 1;
    const dir: [number, number, number] = [bx / bl, tilt / bl, bz / bl];
    // Push the source OUT of the bodywork before it emits. A spot sitting
    // flush in the lens lights the van's own face at point-blank range, and
    // with decay 2 a panel a few centimetres away receives intensity/d^2 -
    // enormous - so the surrounds and trim squares blew out to flat white
    // while the rest of the van stayed black. Ahead of the bumper the cone
    // opens onto the ground instead, and the face falls behind the light
    // where it belongs. The van's frontmost geometry sits about 0.33 ahead
    // of the lens centre, so the default clears it.
    // Push runs along the HORIZONTAL heading, never along the tilted beam.
    // Pushing along `dir` coupled the two knobs: dir's Y comes from Tilt, so
    // tilting the beam also dragged the source down and back, and the lit
    // circle at the origin slid instead of the cone simply pivoting. Push is
    // "get clear of the bodywork", which is a horizontal concern; Tilt is
    // aim. Kept apart, Tilt rotates the cone about a fixed source.
    const push = c[`deskLamp${lamp.id}BeamPush`] ?? 0;
    const hl = Math.hypot(bx, bz) || 1;
    // A BEAM fixture's light is placed independently of its lens. It starts
    // from the same anchor the mesh does, but takes its own Beam X/Y/Z rather
    // than the lens's Move X/Y/Z, so the two can be dialled in without either
    // dragging the other about. `position` is the anchor, deliberately NOT
    // `pos` - reading pos here is what tied them together before.
    const src: [number, number, number] = [
      lightPos[0] + (bx / hl) * push, lightPos[1], lightPos[2] + (bz / hl) * push,
    ];
    return (
      <>
        {bugs}
        <spotLight
          ref={spot}
          position={src}
          color={color}
          intensity={intensity}
          distance={reach}
          decay={decay}
          angle={c[`deskLamp${lamp.id}BeamAngle`] ?? 0.6}
          penumbra={c[`deskLamp${lamp.id}BeamPenumbra`] ?? 0.5}
          castShadow={shadowOn}
        />
        <object3D
          ref={spotTarget}
          position={[src[0] + dir[0] * aim, src[1] + dir[1] * aim, src[2] + dir[2] * aim]}
        />
      </>
    );
  }
  return (
    <>
      {bugs}
      <pointLight
        ref={bulb}
        position={lightPos}
        color={color}
        intensity={intensity}
        distance={reach}
        decay={decay}
        castShadow={shadowOn}
      />
    </>
  );
}

/**
 * The two camp chairs, lifted out of camping.glb so each can be moved on its own.
 *
 * Nothing in that file is named - every node is Object_N and every material is
 * Material.NNN - so these were found by clustering instead: build a bbox for
 * every mesh under 6 units, union any pair whose boxes come within 0.05, and
 * two components fall out that are the same size (1.48 x 1.26 x 1.39 and
 * 1.44 x 1.26 x 1.15), carry the same four materials, and stand 2.5 apart on
 * the terrain surface at y 1.14. A matching pair of chairs, in other words.
 *
 * The small lamp between them (Object_133 + Object_446-449) comes out too,
 * but not here - see CAMP_LANTERNS. It is a FIXTURE as well as a prop, so
 * lifting it means carrying its point light, lens offsets and bug swarm along
 * with the meshes.
 */
const CAMP_CHAIRS: readonly { name: string; meshes: readonly string[] }[] = [
  { name: "camping_chair_1", meshes: ["Object_369", "Object_370", "Object_371", "Object_372"] },
  { name: "camping_chair_2", meshes: ["Object_364", "Object_365", "Object_366", "Object_367"] },
];

/**
 * The two standing lanterns, lifted out so each can be dragged on its own.
 *
 * Both are the SAME model twice over - Object_133 and Object_131 index the
 * identical POSITION accessors, as do their four body meshes each - so what
 * tells them apart is where they stand: one on the ground by the fire pit,
 * one out on the dock. They are the SmallA and SmallB fixtures in
 * DESK_CAMP_LAMPS, and the `lampId` here is the wire back to that table: it
 * is what keeps the existing deskLampSmallA / deskLampSmallB knobs - colour,
 * reach, lens offset, bugs, the dock's fish shading - pointed at the right
 * lamp after the meshes have moved out of the diorama.
 *
 * Moving one is therefore two things at once, and both have to happen or the
 * lantern leaves its own light behind: the meshes go into a Selectable, and
 * the fixture's point light is rendered INSIDE that Selectable rather than as
 * a sibling of the diorama.
 */
const CAMP_LANTERNS: readonly {
  name: string;
  /** The DESK_CAMP_LAMPS id whose config block drives this fixture. */
  lampId: string;
  meshes: readonly string[];
}[] = [
  { name: "camping_lantern_firepit", lampId: "SmallA",
    meshes: ["Object_133", "Object_446", "Object_447", "Object_448", "Object_449"] },
  { name: "camping_lantern_dock", lampId: "SmallB",
    meshes: ["Object_131", "Object_460", "Object_461", "Object_462", "Object_463"] },
];

function CampingWithSelectableTrees({
  url,
  config,
  onSelect,
}: {
  url: string;
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
}) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const { base, trees, chairs, lanterns, lampAnchors, lampParts, bulbMats, bulbGlow, waterMeshes, dockShade } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const treeParentPattern = /^(Cylinder|Icosphere)\.\d+_\d+$/;

    /** "Leans green" test — g has to clearly beat both r and b. What matters is
     *  the MARGIN, not the brightness: the brightness floor is only there to
     *  stop near-black neutrals sneaking through.
     *
     *  Measured against camping.glb rather than guessed. The floor used to be
     *  0.12, which silently dropped four trees whose foliage is Material.086,
     *  linear (0.051, 0.114, 0.035) — an obvious forest green with a +0.063
     *  margin, rejected purely for being dark. Each of those four is a brown
     *  Material.044 trunk under dark green foliage, i.e. unmistakably a tree.
     *
     *  0.05 recovers exactly those four and nothing else: the next-nearest
     *  candidates are the grey/mauve rocks (Material.058 at -0.032 and
     *  Material.077 at -0.016) and the near-neutral Material.061 (+0.002), all
     *  of which fail on margin no matter how low the floor goes. Dropping to
     *  0.03 or 0.01 adds nothing further, so 0.05 sits safely below the cliff. */
    const isGreenish = (m: THREE.Material | THREE.Material[] | undefined) => {
      const mats = Array.isArray(m) ? m : m ? [m] : [];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        const c = std?.color;
        if (!c) continue;
        if (c.g > c.r && c.g > c.b && c.g > 0.05 && c.g - Math.max(c.r, c.b) > 0.03) return true;
      }
      return false;
    };

    /** Any descendant that uses a "Lamp" material — treat as a lantern, not
     *  a tree, even if its cylinder parent name matches the tree pattern
     *  (e.g. `Cylinder.022_118` with material `Lamp` is the dock lantern). */
    const hasLampMaterial = (o: THREE.Object3D) => {
      let found = false;
      o.traverse((child) => {
        if (found) return;
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const mat of mats) {
          const name = (mat as { name?: string })?.name ?? "";
          if (name === "Lamp" || name.startsWith("Lamp.")) { found = true; return; }
        }
      });
      return found;
    };

    // First pass: collect every Cylinder.NN_NN / Icosphere.NN_NN parent whose
    // subtree has at least one greenish material and NO Lamp material. Trunk
    // meshes come along for the ride because they are siblings under the
    // same parent group. Don't detach yet — the traversal relies on the tree
    // still being in the scene graph.
    const treeParents: THREE.Object3D[] = [];
    cloned.traverse((o) => {
      if (!treeParentPattern.test(o.name)) return;
      if (hasLampMaterial(o)) return;
      let hasFoliage = false;
      o.traverse((child) => {
        if (hasFoliage) return;
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (isGreenish(mesh.material)) hasFoliage = true;
      });
      if (hasFoliage) treeParents.push(o);
    });

    // Detach and bake world→local so each Selectable can render at origin.
    const trees: { name: string; group: THREE.Object3D }[] = [];
    for (const tp of treeParents) {
      tp.updateWorldMatrix(true, false);
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      tp.matrixWorld.decompose(worldPos, worldQuat, worldScale);
      if (tp.parent) tp.parent.remove(tp);
      tp.position.copy(worldPos);
      tp.quaternion.copy(worldQuat);
      tp.scale.copy(worldScale);
      trees.push({ name: `camping_tree_${tp.name.replace(/[^A-Za-z0-9_]/g, "_")}`, group: tp });
    }

    // --- lift the chairs out, same idea as the trees -------------------------
    //
    // The file's hierarchy is flat, so unlike a tree a chair has no parent node
    // to grab - its four meshes are siblings. Each gets a fresh Group whose
    // origin sits at the cluster's base centre (middle in X/Z, lowest point in
    // Y), so the lab's rotate and scale turn the chair about its own feet
    // rather than about the camp's origin.
    const chairs: { name: string; group: THREE.Object3D }[] = [];
    const chairBox = new THREE.Box3();
    for (const spec of CAMP_CHAIRS) {
      const parts = spec.meshes
        .map((n) => cloned.getObjectByName(n))
        .filter((o): o is THREE.Object3D => !!o);
      if (parts.length !== spec.meshes.length) continue;   // model changed - skip rather than half-build
      chairBox.makeEmpty();
      for (const p of parts) {
        p.updateWorldMatrix(true, true);
        chairBox.expandByObject(p);
      }
      const pivot = new THREE.Vector3(
        (chairBox.min.x + chairBox.max.x) / 2,
        chairBox.min.y,
        (chairBox.min.z + chairBox.max.z) / 2
      );
      const group = new THREE.Group();
      group.position.copy(pivot);
      const toLocal = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
      for (const p of parts) {
        p.updateWorldMatrix(true, false);
        const world = p.matrixWorld.clone();
        p.parent?.remove(p);
        group.add(p);
        p.matrix.copy(toLocal.clone().multiply(world));
        p.matrix.decompose(p.position, p.quaternion, p.scale);
        const mesh = p as THREE.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      }
      chairs.push({ name: spec.name, group });
    }

    // --- lift the two lanterns out -------------------------------------------
    //
    // Same cluster-into-a-group move as the chairs, with one extra wire to
    // run: a lantern is a LIGHT as well as a prop. Its point light, bug swarm
    // and emissive glass are all resolved further down by looking its meshes
    // up - so this has to happen BEFORE those passes, and those passes have to
    // walk `lampRoots` rather than `cloned`, or the fixture would be found in
    // a scene it no longer belongs to and its light would stay behind.
    //
    // Unlike a chair, the group is left AT THE ORIGIN and the pivot is handed
    // to the Selectable as its basePosition. That is what makes the lab's
    // rotate and scale turn the lantern about its own base: a group parked at
    // the pivot would still swing around the camp's origin when the Selectable
    // rotated, because the rotation applies to that offset too.
    const lanterns: { name: string; lampId: string; group: THREE.Object3D; pivot: THREE.Vector3 }[] = [];
    /** mesh name -> the lantern Selectable it now lives under. */
    const lampOwner = new Map<string, string>();
    const lanternBox = new THREE.Box3();
    for (const spec of CAMP_LANTERNS) {
      const parts = spec.meshes
        .map((n) => cloned.getObjectByName(n))
        .filter((o): o is THREE.Object3D => !!o);
      if (parts.length !== spec.meshes.length) continue;   // model changed - leave it in the diorama
      lanternBox.makeEmpty();
      for (const p of parts) {
        p.updateWorldMatrix(true, true);
        lanternBox.expandByObject(p);
      }
      const pivot = new THREE.Vector3(
        (lanternBox.min.x + lanternBox.max.x) / 2,
        lanternBox.min.y,
        (lanternBox.min.z + lanternBox.max.z) / 2
      );
      const group = new THREE.Group();
      const toLocal = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
      for (const p of parts) {
        p.updateWorldMatrix(true, false);
        const world = p.matrixWorld.clone();
        p.parent?.remove(p);
        group.add(p);
        p.matrix.copy(toLocal.clone().multiply(world));
        p.matrix.decompose(p.position, p.quaternion, p.scale);
      }
      // The lamp passes below read world positions straight off these meshes.
      // The group sits at identity, so a world position here is already
      // PIVOT-RELATIVE - which is exactly the frame the light needs once it is
      // rendered inside the Selectable.
      group.updateMatrixWorld(true);
      for (const m of spec.meshes) lampOwner.set(m, spec.name);
      lanterns.push({ name: spec.name, lampId: spec.lampId, group, pivot });
    }
    /** Where the lamp passes look for fixture meshes: the diorama, plus every
     *  lantern just lifted out of it. */
    const lampRoots: THREE.Object3D[] = [cloned, ...lanterns.map((l) => l.group)];

    // --- flatten the landscape above a ceiling -------------------------------
    //
    // The mountains are GONE FROM THE MODEL now, not hidden at runtime. The
    // shipped camping.glb was opened in Blender and edited there: the 12 tree
    // groups and 4 bushes were deleted outright, the two big Material.077 /
    // Material.058 boulders behind the caravan (Object_139, top z 7.6, and
    // Object_163, 5.3) went with them, and every remaining landscape vertex
    // above z 2.0 was compressed to 15% of its height. The peaks that used to
    // reach 11.3 now top out at 3.4, so the horizon behind the van is clear.
    // art-backup/camping_original.glb is the pre-edit file.
    //
    // This pass survives as a trim: any landscape vertex above the ceiling is
    // pulled DOWN to it. At the default 4.0 it is a no-op against the cleaned
    // model (max 3.4) - drop the slider to shave the remaining rises flat.
    //
    // Geometry MUST be cloned first: Object3D.clone() shares geometry with the
    // cached GLTF, so clamping in place would corrupt the model for every other
    // consumer and survive a remount.
    const LANDSCAPE_MATERIALS = new Set(["Material.108", "Material.077"]);
    const ceiling = config.deskCampGroundMaxY;
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const ms = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      if (!ms.some((m) => LANDSCAPE_MATERIALS.has((m as { name?: string })?.name ?? ""))) return;
      const src = mesh.geometry.getAttribute("position");
      if (!src) return;
      let touched = false;
      const geom = mesh.geometry.clone();
      const pos = geom.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > ceiling) { pos.setY(i, ceiling); touched = true; }
      }
      if (!touched) { geom.dispose(); return; }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
      geom.computeBoundingBox();
      geom.computeBoundingSphere();
      mesh.geometry = geom;
    });

    // --- which Lamp meshes get a real light ---------------------------------
    //
    // 31 meshes in this GLB use a Lamp* material and only FIVE of them are
    // real fixtures. The other 26 are the string-light run - bare-"Lamp"
    // bulbs plus Lamp.005-.012, every one of them 0.127 across and strung at
    // y 3.0-4.05. Those stay emissive-only: a light each was measured at
    // about 4x the fragment cost, and a strung bulb throwing its own pool of
    // light would look wrong anyway.
    //
    // Matching is by MESH NAME, not material, and that is deliberate. The two
    // bollard posts in front of the van (Object_335/337) carry the SAME bare
    // "Lamp" material as the string bulbs, so the old material-based filter
    // could not tell them apart and simply left them dark. Mesh names are
    // stable across the Blender round-trips this GLB has been through.
    // See DESK_CAMP_LAMPS for the table and where each one sits.
    cloned.updateMatrixWorld(true);
    const byMesh = new Map<string, { position: THREE.Vector3; glass: THREE.Material[]; owner?: string }>();
    for (const root of lampRoots) root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !DESK_CAMP_LAMP_MESHES.has(mesh.name)) return;
      // Each fixture gets its OWN copy of its head material. Two reasons:
      // clone(true) copies material references, so writing emissiveIntensity
      // straight on would leak into drei's cache; and the bare "Lamp"
      // material is shared with all 26 string bulbs, so brightening a bollard
      // would brighten the whole string run with it. Lamp.001 is likewise
      // shared between the two small lamps.
      const glass = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        .map((m) => (m as THREE.Material).clone());
      mesh.material = Array.isArray(mesh.material) ? glass : glass[0];
      // Every root here sits at identity, so a world position IS the local
      // position its pointLight needs: camp-space for a fixture still in the
      // diorama, pivot-relative for one that has moved into a lantern group.
      // `owner` is which of the two, and decides where the light is rendered.
      byMesh.set(mesh.name, {
        position: mesh.getWorldPosition(new THREE.Vector3()),
        glass,
        owner: lampOwner.get(mesh.name),
      });
    });
    // One anchor per BULB, but the lamp (and therefore the config block) is
    // shared - so the van's two headlights get a light each off one set of
    // sliders.
    // Everything that travels when a fixture is nudged: glass AND housing.
    // Offsets are authored in CAMP units but written to mesh.position, which
    // is in the mesh's own scaled parent - so the parent's world scale is
    // captured here to divide back out. Same correction the river needs.
    const lampParts: { id: string; mesh: THREE.Object3D; base: THREE.Vector3; pscale: THREE.Vector3 }[] = [];
    for (const root of lampRoots) root.traverse((o) => {
      const id = DESK_CAMP_LAMP_PARTS.get(o.name);
      if (!id) return;
      lampParts.push({
        id,
        mesh: o,
        base: o.position.clone(),
        pscale: o.parent ? o.parent.getWorldScale(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1),
      });
    });

    const lampAnchors = DESK_CAMP_LAMPS
      .flatMap((lamp) => lamp.meshes.map((mesh) => ({ lamp, mesh, ...(byMesh.get(mesh) ?? {}) })))
      .filter((a): a is {
        lamp: DeskCampLamp; mesh: string; position: THREE.Vector3;
        glass: THREE.Material[]; owner?: string;
      } => !!a.position);

    // --- the string-light bulbs ---------------------------------------------
    //
    // The 26 bulbs on the overhead run. These get no light of their own - the
    // RectAreaLight bar does that - so these knobs are purely how bright and
    // how warm the bulbs LOOK at the source.
    //
    // Selected by mesh name, not material, because the bare "Lamp" material is
    // shared between 18 of these bulbs AND the van's two headlights. Worse,
    // Material.clone() copies the NAME too, so the headlights' own clones are
    // also called "Lamp" and cannot be told apart that way. Skipping the
    // fixture mesh names is the only reliable split.
    //
    // Materials are cached per SOURCE uuid so the 18 bulbs sharing "Lamp" end
    // up sharing one clone - one slider then moves the whole run, and the
    // per-bulb strengths the file authors (2.06 to 4.25 across the nine
    // materials) survive because Brightness is a multiplier on each material's
    // own value rather than an absolute.
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (DESK_SHADOW_CASTERS.has(mesh.name)) mesh.castShadow = true;
      const ms = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      if (ms.some((m) => DESK_SHADOW_RECEIVER_MATERIALS.has((m as { name?: string })?.name ?? ""))) {
        mesh.receiveShadow = true;
      }
    });

    // Same three meshes, read a second way: the shadow map above darkens the
    // water, this darkens the fish swimming under it. Built here because it
    // needs the deck's world transform, which only exists inside this memo.
    const dockShade = buildDockShade(cloned);

    const bulbMats: { mat: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number }[] = [];
    const bulbClones = new Map<string, THREE.MeshStandardMaterial>();
    /* Where each bulb hangs, for the halo sprites. Gathered in this pass
     * rather than a second traversal because this loop already knows exactly
     * which meshes are string bulbs - the ones carrying a Lamp* material that
     * are not one of the five real fixtures. `cloned` sits at identity, so a
     * world position here is camp-local, which is the frame the points are
     * drawn in. */
    const bulbSpots: number[] = [];
    const bulbAt = new THREE.Vector3();
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || DESK_CAMP_LAMP_MESHES.has(mesh.name)) return;
      const src = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      let isBulb = false;
      const next = src.map((m) => {
        const name = (m as { name?: string })?.name ?? "";
        if (name !== "Lamp" && !name.startsWith("Lamp.")) return m;
        isBulb = true;
        const key = m.uuid;
        let clone = bulbClones.get(key);
        if (!clone) {
          clone = (m as THREE.MeshStandardMaterial).clone();
          bulbClones.set(key, clone);
          bulbMats.push({
            mat: clone,
            emissive: clone.emissive.clone(),
            intensity: clone.emissiveIntensity,
          });
        }
        return clone;
      });
      if (next.some((m, i) => m !== src[i])) {
        mesh.material = Array.isArray(mesh.material) ? next : next[0];
      }
      if (isBulb) {
        mesh.getWorldPosition(bulbAt);
        bulbSpots.push(bulbAt.x, bulbAt.y, bulbAt.z);
      }
    });
    const bulbGlow = new Float32Array(bulbSpots);

    // --- the river ----------------------------------------------------------
    //
    // One mesh, "Object_119" under the River_35 node, material "Material.057"
    // (a deep blue 0.01/0.05/0.47). It is a solid slab, not a plane: y -1.63
    // to 0.56, so raising it lifts the whole body of water and its surface
    // together. Nothing else in the GLB uses that material.
    //
    // Materials MUST be cloned here. clone(true) copies material REFERENCES,
    // so writing opacity straight onto them would turn the water transparent
    // in drei's cached GLTF - i.e. for every other consumer of this file, and
    // it would survive a remount.
    //
    // The offset ALSO has to be divided by the scale stacked above the mesh,
    // or the slider is wildly over-sensitive. Object_119 has no transform of
    // its own; it hangs under "River_35" at scale 12.569, itself under
    // "Sketchfab_model" at 1.178 - so one unit of mesh.position.y is 14.8
    // units of camp space. (The two +-90 degree X rotations in that chain
    // cancel, so River_35's local +Y really is camp +Y - otherwise this would
    // need the full basis, not just the scale.) `cloned` sits at identity in
    // this memo, so the parent's world scale IS that accumulated factor.
    const waterMeshes: { mesh: THREE.Mesh; baseY: number; scaleY: number }[] = [];
    const wsv = new THREE.Vector3();
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const ms = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      if (!ms.some((m) => WATER_MATERIALS.has((m as { name?: string })?.name ?? ""))) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : (mesh.material as THREE.Material).clone();
      const parentScaleY = mesh.parent ? mesh.parent.getWorldScale(wsv).y : 1;
      waterMeshes.push({
        mesh,
        baseY: mesh.position.y,
        scaleY: Math.abs(parentScaleY) > 1e-6 ? parentScaleY : 1,
      });
    });

    return { base: cloned, trees, chairs, lanterns, lampAnchors, lampParts, bulbMats, bulbGlow, waterMeshes, dockShade };
  }, [gltf.scene, config.deskCampGroundMaxY]);

  // Height and opacity are applied OUTSIDE that memo on purpose. Putting them
  // in its dependency list would re-clone all 198 meshes and re-clamp the
  // landscape geometry on every frame of a slider drag; this just writes two
  // numbers onto one mesh.
  // The glow ON the lamp itself, separate from the light it throws. camping.glb
  // authors these unevenly - KHR_materials_emissive_strength is 4.01 on the
  // bollards and 3.80 on the small lamps, but only 1.94 on the lamppost's
  // hood, so the post read as unlit next to everything else even before its
  // point light was turned up.
  const cfgRec = config as unknown as Record<string, number>;
  // Warmth blends each bulb from near-white toward the amber the file authors,
  // and past it: 0 is white, 1 is exactly as authored, 2 pushes further into
  // the amber. Channels are clamped because extrapolating can overshoot.
  useEffect(() => {
    const w = config.deskStringBulbWarmth;
    const seeThrough = config.deskStringBulbOpacity < 0.999;
    for (const { mat, emissive, intensity } of bulbMats) {
      mat.emissive.setRGB(
        Math.min(1, Math.max(0, 0.98 + (emissive.r - 0.98) * w)),
        Math.min(1, Math.max(0, 0.95 + (emissive.g - 0.95) * w)),
        Math.min(1, Math.max(0, 0.90 + (emissive.b - 0.90) * w)),
      );
      mat.emissiveIntensity = intensity * config.deskStringBulbBrightness;
      mat.opacity = config.deskStringBulbOpacity;
      mat.transparent = seeThrough;
      mat.depthWrite = !seeThrough;
      mat.needsUpdate = true;
    }
  }, [bulbMats, config.deskStringBulbWarmth, config.deskStringBulbBrightness, config.deskStringBulbOpacity]);

  const offsetSignature = DESK_CAMP_LAMPS
    .map((l) => `${cfgRec[`deskLamp${l.id}OffX`] ?? 0},${cfgRec[`deskLamp${l.id}OffY`] ?? 0},${cfgRec[`deskLamp${l.id}OffZ`] ?? 0}`)
    .join("|");
  useEffect(() => {
    for (const { id, mesh, base, pscale } of lampParts) {
      const sx = Math.abs(pscale.x) > 1e-6 ? pscale.x : 1;
      const sy = Math.abs(pscale.y) > 1e-6 ? pscale.y : 1;
      const sz = Math.abs(pscale.z) > 1e-6 ? pscale.z : 1;
      mesh.position.set(
        base.x + (cfgRec[`deskLamp${id}OffX`] ?? 0) / sx,
        base.y + (cfgRec[`deskLamp${id}OffY`] ?? 0) / sy,
        base.z + (cfgRec[`deskLamp${id}OffZ`] ?? 0) / sz
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lampParts, offsetSignature]);

  const emissiveSignature = DESK_CAMP_LAMPS
    .map((l) => cfgRec[`deskLamp${l.id}Emissive`] ?? 4)
    .join(",");
  useEffect(() => {
    for (const { lamp, glass } of lampAnchors) {
      const e = cfgRec[`deskLamp${lamp.id}Emissive`] ?? 4;
      for (const m of glass) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.emissive) std.emissiveIntensity = e;
      }
    }
    // Keys are read dynamically, so the dep is a joined signature of the five
    // values rather than a spread - a spread would make the dep array change
    // length if the table ever did, which React forbids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lampAnchors, emissiveSignature]);

  useEffect(() => {
    for (const { mesh, baseY, scaleY } of waterMeshes) {
      // deskWaterHeight is in CAMP units; mesh.position is in its scaled
      // parent's units, so divide the scale back out.
      mesh.position.y = baseY + config.deskWaterHeight / scaleY;
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of ms) {
        const mat = m as THREE.Material;
        // Below 1 the slab joins the transparent pass, which is drawn after
        // all opaque geometry - so the riverbed underneath is already in the
        // buffer to blend against. depthWrite has to come off with it, or the
        // water still occludes anything transparent behind it (the campfire's
        // glow disc and sparks) even while you can see through it.
        const seeThrough = config.deskWaterOpacity < 0.999;
        mat.transparent = seeThrough;
        mat.opacity = config.deskWaterOpacity;
        mat.depthWrite = !seeThrough;
        mat.needsUpdate = true;
      }
    }
  }, [waterMeshes, config.deskWaterHeight, config.deskWaterOpacity]);

  // The lantern the fish are shaded FROM. SmallB is the one standing on the
  // dock (Object_131), and it is the only light over this stretch of water -
  // the van and the signpost are up on the bank behind the camp. Its emitter,
  // not its lens: Light X/Y/Z is where the light actually leaves, and moving
  // it has to move the shadow with it or the two drift apart.
  //
  // With that lamp switched off there is no light here to be blocked, so
  // Shade and Fade go to zero and the fish render as the file authors them.
  const fishShade = useMemo<FishShade | null>(() => {
    if (!dockShade) return null;
    const anchor = lampAnchors.find((a) => a.lamp.id === "SmallB");
    if (!anchor) return null;
    const cr = config as unknown as Record<string, number>;
    const lit = config.deskCampLampEnabled >= 0.5 && (cr.deskLampSmallBOn ?? 1) >= 0.5;
    /*
     * That bulb IN CAMP SPACE.
     *
     * The dock lantern is its own Selectable now, so its anchor is measured
     * from that object's pivot rather than from the camp - and the pivot plus
     * whatever the lab has done to the object has to be added back, or
     * dragging the lantern off the dock would leave the water still shaded as
     * though it were standing there. Order is the Selectable's own: scale the
     * local offset, then place it.
     *
     * rotY is deliberately not applied. The glass sits within 0.01 of the
     * pivot's vertical axis, so spinning the lantern moves the emitter by far
     * less than this shading can resolve.
     */
    const lant = lanterns.find((l) => l.name === anchor.owner);
    const lo = (lant ? config.objectOverrides?.[lant.name] : undefined) ?? EMPTY_OVERRIDE;
    const at = anchor.position.clone();
    if (lant) {
      at.multiplyScalar(lo.scale)
        .add(lant.pivot)
        .add(new THREE.Vector3(lo.dx, lo.dy, lo.dz));
    }
    return {
      field: dockShade,
      light: [
        at.x + (cr.deskLampSmallBLightX ?? 0),
        at.y + (cr.deskLampSmallBLightY ?? 0),
        at.z + (cr.deskLampSmallBLightZ ?? 0),
      ],
      // baseScale on the camping Selectable is 1, so its override IS the
      // accumulated scale - the same reasoning DeskStringLight and BugSwarm use.
      reach: ((config as unknown as Record<string, number>).deskLampSmallBReach ?? 5)
        / Math.max(1e-4, config.objectOverrides?.["old_bear_camping"]?.scale ?? 1),
      dark: config.deskFishDark,
      amount: lit ? config.deskFishShade : 0,
      fade: lit ? config.deskFishShadeFade : 0,
      soft: config.deskFishShadeSoft,
    };
  }, [dockShade, lampAnchors, lanterns, config]);

  return (
    <>
      <primitive object={base} />
      {/* Halos on the string bulbs. Inside the camp's own frame, so they ride
          the diorama's transform; the sprite size is in world units either
          way, since three writes gl_PointSize from the uniform and only then
          divides by view depth - no model matrix ever reaches it. */}
      <StringBulbBloom positions={bulbGlow} config={config} />
      {/* Fixtures still IN the diorama. The lanterns' own lights are rendered
          inside their Selectables below, so they travel with them. */}
      {config.deskCampLampEnabled >= 0.5 && lampAnchors.filter((a) => !a.owner).map(({ lamp, mesh, position }) => (
        <DeskCampLampLight key={`${lamp.id}-${mesh}`} lamp={lamp} position={position} config={config} />
      ))}
      {/* Sits in the camp's own frame alongside the lamps, so it tracks the
          diorama when that is dragged, spun or resized. baseScale on the
          camping Selectable is 1, so the accumulated scale IS its override. */}
      <DeskStringLight
        config={config}
        campScale={config.objectOverrides?.["old_bear_camping"]?.scale ?? 1}
      />
      {/* Fish under the river surface. Camp-local like the lamps, so they
          stay in the water when the diorama is moved. They swim BELOW y
          0.561 (the surface), so they only read once deskWaterOpacity is
          under 1 - and they sit in the open-water pocket NEAR the lamppost
          rather than at it, because the post stands on the bank and terrain
          covers the river directly under it. See the deskFish block in
          sceneConfig.ts. */}
      <DeskWaterFish config={config} shade={fishShade} />
      {chairs.map((c) => (
        <Selectable
          key={c.name}
          name={c.name}
          onSelect={onSelect}
          config={config}
          basePosition={[0, 0, 0]}
          baseRotationY={0}
          baseScale={1}
        >
          <primitive object={c.group} />
        </Selectable>
      ))}
      {/* The lanterns. The fixture's point light (and its bug swarm, which
          hangs off the same component) is a CHILD here rather than a sibling
          of the diorama - that is what makes the pool of light, and the moths
          in it, come along when the lantern is dragged. Hiding the object
          takes its light with it too, which is the behaviour you want from a
          lamp that is no longer in the scene. */}
      {lanterns.map((l) => (
        <Selectable
          key={l.name}
          name={l.name}
          onSelect={onSelect}
          config={config}
          basePosition={[l.pivot.x, l.pivot.y, l.pivot.z]}
          baseRotationY={0}
          baseScale={1}
        >
          <primitive object={l.group} />
          {config.deskCampLampEnabled >= 0.5 && lampAnchors
            .filter((a) => a.owner === l.name)
            .map(({ lamp, mesh, position }) => (
              <DeskCampLampLight key={`${lamp.id}-${mesh}`} lamp={lamp} position={position} config={config} />
            ))}
        </Selectable>
      ))}
      {trees.map((t) => (
        <Selectable
          key={t.name}
          name={t.name}
          onSelect={onSelect}
          config={config}
          basePosition={[0, 0, 0]}
          baseRotationY={0}
          baseScale={1}
        >
          <primitive object={t.group} />
        </Selectable>
      ))}
    </>
  );
}

/**
 * The halo sprite every bulb wears: one 64px radial falloff, built once and
 * shared by all of them.
 *
 * Lazy rather than module-level because it touches `document` - this file is a
 * client component, but a module-scope canvas would still run during the
 * server render of anything that imports it.
 */
let bulbGlowTexture: THREE.CanvasTexture | null = null;
function bulbGlowSprite(): THREE.CanvasTexture {
  if (bulbGlowTexture) return bulbGlowTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // A hot core with a long tail. Stopping at 0.5 halfway out is what makes it
  // read as glow rather than as a disc with a soft edge.
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.62)");
  g.addColorStop(0.5, "rgba(255,255,255,0.16)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  bulbGlowTexture = new THREE.CanvasTexture(canvas);
  bulbGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return bulbGlowTexture;
}

/**
 * Bloom on the string lights, for the price of one draw call.
 *
 * A sprite per bulb in a single <points>, additive, no depth write and no
 * per-frame work - the positions never change, so this uploads once and then
 * costs the GPU a few hundred blended pixels a frame and the CPU nothing.
 *
 * The honest alternative is a post-processing bloom pass, and it was the wrong
 * trade here: it re-renders the scene into extra targets and blurs them
 * several times, it costs that whether one bulb is lit or the whole camp is,
 * and it would bloom every bright thing in frame - the CRT, the fire, the
 * moon - not the lights that were asked for.
 *
 * Strength splits at 1 on purpose. Below it, the halo fades in on opacity.
 * Above it, opacity is pinned and the COLOUR is overdriven instead, because a
 * blend factor is clamped at 1 by the hardware and more alpha buys nothing;
 * an over-bright colour with toneMapped off does keep going.
 */
function StringBulbBloom({
  positions,
  config,
}: {
  positions: Float32Array;
  config: CampfireSceneConfig;
}) {
  const strength = config.deskStringBulbBloom;
  const sprite = useMemo(() => bulbGlowSprite(), []);
  // Same buffer, nudged up/down. Kept as its own copy rather than mutating
  // `positions` in place - that array is also the one CampFireScene's own
  // memo holds onto, and a plain assignment here would leak the offset back
  // into it the moment the slider moved back to 0 having already been baked
  // into the source.
  const offsetPositions = useMemo(() => {
    const dy = config.deskStringBulbBloomOffsetY;
    if (Math.abs(dy) < 1e-6) return positions;
    const out = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      out[i] = positions[i];
      out[i + 1] = positions[i + 1] + dy;
      out[i + 2] = positions[i + 2];
    }
    return out;
  }, [positions, config.deskStringBulbBloomOffsetY]);
  const color = useMemo(() => {
    // Same warmth ramp the bulbs themselves use, so the halo is the colour of
    // the thing it is coming off rather than a decorator's guess.
    const w = config.deskStringBulbWarmth;
    const c = new THREE.Color(
      Math.min(1, Math.max(0, 0.98 + (1 - 0.98) * w)),
      Math.min(1, Math.max(0, 0.95 + (0.86 - 0.95) * w)),
      Math.min(1, Math.max(0, 0.9 + (0.62 - 0.9) * w)),
    );
    return c.multiplyScalar(Math.max(1, strength));
  }, [config.deskStringBulbWarmth, strength]);

  if (strength <= 0.001 || positions.length === 0) return null;
  return (
    <points frustumCulled={false} renderOrder={2}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[offsetPositions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        color={color}
        size={config.deskStringBulbBloomSize}
        sizeAttenuation
        transparent
        opacity={Math.min(1, strength)}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

/**
 * The screen face of low_poly_computer_with_devices.glb.
 *
 * Picked by MESH, not by material: the file ships a single "base" material for
 * the entire machine - tower, keyboard, mouse mat and all - so there is no
 * "screen" material to look for. Object_20 is the only flat quad in the file
 * (0.994 x 0.785 x 0.0) and it stands at the monitor's front face, z -0.257,
 * against the case's own -1.5..-0.17. That is the screen.
 */
const COMPUTER_SCREEN_MESH = "Object_20";

/*
 * Where that quad sits in the model's own frame, read out of the GLB: its
 * node is translated to (-0.0993, 0.8842, -0.2574), scaled 1.0021, and the
 * quad itself spans +-0.4958 x +-0.3916 facing +Z. (The file's two root
 * nodes rotate X by -90 and +90 degrees, which cancel.) The desktop's
 * picture plane goes 4mm proud of it, so it is always the nearer hit.
 */
const PC_SCREEN_CENTER: [number, number, number] = [-0.0993, 0.8842, -0.2574 + 0.004];
const PC_SCREEN_SIZE: [number, number] = [0.4958 * 2 * 1.0021, 0.3916 * 2 * 1.0021];

/** What the cabin sector needs to put the desktop on the monitor. */
type PcGlassProps = {
  stateRef: React.MutableRefObject<PcState>;
  onClick: (uv: { x: number; y: number } | null) => void;
  onHover: (uv: { x: number; y: number } | null) => void;
  /** Idle hover anywhere on the machine (hand cursor). */
  onOver: (over: boolean) => void;
  /** Idle and clickable: the glass lifts under the pointer. */
  hot: boolean;
  /** Zoomed in: only the glass takes clicks then. */
  focused: boolean;
  /** Off in the lab's config mode, where the computer is just a prop. */
  enabled: boolean;
  /** The picture plane, for the close-up camera to aim at. */
  screenRef: React.MutableRefObject<THREE.Mesh | null>;
};

/**
 * The desktop on the monitor's glass - see RetroDesktop.tsx.
 *
 * Unlit, like the CRT's picture, so the cabin's lighting never dims it.
 * It carries NO r3f pointer handlers: clicks and hovers come from
 * useComputerPointer, which casts against the computer alone, because r3f
 * hands a click to the nearest thing under the pointer and the cabin's
 * walls and props were swallowing it before it reached the screen.
 */
function PcGlass({ pc, body, brightness = 1 }: { pc: PcGlassProps; body: THREE.Object3D; brightness?: number }) {
  const [over, setOver] = useState(false);
  const bodyRef = useRef<THREE.Object3D | null>(body);
  bodyRef.current = body;
  const onOver = pc.onOver;
  useComputerPointer({
    enabled: pc.enabled,
    focused: pc.focused,
    screenRef: pc.screenRef,
    bodyRef,
    onClick: pc.onClick,
    onHover: pc.onHover,
    onOver: useCallback((o: boolean) => { setOver(o); onOver(o); }, [onOver]),
  });
  const texture = useRetroDesktopTexture(pc.stateRef, pc.hot && over);
  return (
    <mesh ref={pc.screenRef} position={PC_SCREEN_CENTER}>
      <planeGeometry args={PC_SCREEN_SIZE} />
      {/* colour multiplies the picture: >1 brightens the glass (not tone
          mapped, so it can go past white), <1 dims it */}
      <meshBasicMaterial map={texture} toneMapped={false} color={new THREE.Color().setScalar(Math.max(0, brightness))} />
    </mesh>
  );
}

function LitComputer({ config, pc }: { config: CampfireSceneConfig; pc?: PcGlassProps }) {
  const gltf = useGLTF(OLD_BEAR_COMPUTER_URL) as unknown as { scene: THREE.Group };
  const { model, screens } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    // Collected into an array rather than a `let` the traversal assigns to:
    // TS narrows a closure-assigned local to `never` and the callers would
    // stop typechecking.
    const found: THREE.MeshStandardMaterial[] = [];
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (mesh.name !== COMPUTER_SCREEN_MESH) return;
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const lit = (src as THREE.MeshStandardMaterial).clone();
      mesh.material = lit;
      found.push(lit);
    });
    if (!found.length) {
      // Worth saying out loud: the model was re-exported and the screen is
      // now called something else, so its knobs silently do nothing.
      console.warn(`[scene] computer: no "${COMPUTER_SCREEN_MESH}" mesh - screen knobs are inert`);
    }
    return { model: cloned, screens: found };
  }, [gltf.scene]);

  useEffect(() => {
    const on = config.deskComputerScreenOn >= 0.5;
    for (const mat of screens) {
      mat.emissive.setRGB(
        config.deskComputerScreenR,
        config.deskComputerScreenG,
        config.deskComputerScreenB,
      );
      mat.emissiveIntensity = on ? config.deskComputerScreenBrightness : 0;
      mat.needsUpdate = true;
    }
  }, [
    screens,
    config.deskComputerScreenOn,
    config.deskComputerScreenBrightness,
    config.deskComputerScreenR,
    config.deskComputerScreenG,
    config.deskComputerScreenB,
  ]);

  return (
    <>
      <primitive object={model} />
      {pc ? <PcGlass pc={pc} body={model} brightness={Number.isFinite(config.deskComputerGlassBrightness) ? config.deskComputerGlassBrightness : 1} /> : null}
    </>
  );
}

/** camping.glb loaded raw, but every emissive lamp mesh (materials named
 *  `Lamp`, `Lamp.001` .. `Lamp.012`) gets a THREE.PointLight parented to it
 *  so the lamps actually cast light onto their surroundings — the way the
 *  main campfire, desk lantern and computer glow do. All lamps share the
 *  same config knobs (intensity/distance/decay/color) so the whole diorama
 *  can be dimmed or warmed with one slider each. */
function CampingWithLamps({
  url,
  intensity,
  distance,
  decay,
  color,
}: {
  url: string;
  intensity: number;
  distance: number;
  decay: number;
  color: THREE.Color;
}) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const { model, lampAnchors } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const anchors: THREE.Object3D[] = [];
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const isLamp = mats.some((m) => {
        const name = (m as { name?: string })?.name ?? "";
        return name === "Lamp" || name.startsWith("Lamp.");
      });
      if (isLamp) anchors.push(mesh);
    });
    return { model: cloned, lampAnchors: anchors };
  }, [gltf.scene]);

  return (
    <>
      <primitive object={model} />
      {lampAnchors.map((anchor, i) => (
        <LampPointLight
          key={i}
          anchor={anchor}
          intensity={intensity}
          distance={distance}
          decay={decay}
          color={color}
        />
      ))}
    </>
  );
}

/** Parents a pointLight onto an existing scene node so it inherits that
 *  node's world transform without us having to compute matrices manually. */
function LampPointLight({
  anchor,
  intensity,
  distance,
  decay,
  color,
}: {
  anchor: THREE.Object3D;
  intensity: number;
  distance: number;
  decay: number;
  color: THREE.Color;
}) {
  const lightRef = useRef<THREE.PointLight>(null);
  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    anchor.add(light);
    return () => {
      anchor.remove(light);
    };
  }, [anchor]);
  return (
    <pointLight
      ref={lightRef}
      intensity={intensity}
      distance={distance}
      decay={decay}
      color={color}
    />
  );
}

/** Raw GLB rendered unlit: every material swapped to MeshBasicMaterial with the
 *  original base color/map preserved, so vertex colors read the same regardless
 *  of scene lighting (the campfire scene is night-lit and crushes PBR colors).
 *  Matches the flat low-poly aesthetic that these assets are authored for. */
function UnlitGLB({ url }: { url: string }) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const model = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const flat = mats.map((m) => {
        const src = m as THREE.MeshStandardMaterial;
        if (!src) return m;
        const basic = new THREE.MeshBasicMaterial({
          color: src.color?.clone() ?? new THREE.Color(0xffffff),
          map: src.map ?? null,
          transparent: src.transparent,
          opacity: src.opacity,
          alphaTest: src.alphaTest,
          side: THREE.DoubleSide,
          vertexColors: src.vertexColors,
        });
        basic.name = src.name;
        return basic;
      });
      mesh.material = Array.isArray(mesh.material) ? flat : flat[0];
    });
    return cloned;
  }, [gltf.scene]);
  return <primitive object={model} />;
}

/**
 * Hollow variant of the caravan. The GLB itself carries the transparent window
 * material and doubleSided flags, so we just render the scene as-is - no
 * material cloning, no emissive swap (that would recolor the glass and kill the
 * transparency). A warm interior point-light still spills so the inside reads.
 */
function HollowCaravan({ url, config }: { url: string; config: CampfireSceneConfig }) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const model = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat) continue;
        // Blender exports doubleSided into glTF, but re-assert here in case a
        // downstream tweak flips it. Windows also need depthWrite off so the
        // back interior wall isn't punched out by the transparent quad.
        mat.side = THREE.DoubleSide;
        if (mat.name === "02___Default") {
          mat.transparent = true;
          mat.depthWrite = false;
        }
      }
    });
    return cloned;
  }, [gltf.scene]);
  return (
    <group>
      <primitive object={model} />
      <pointLight
        position={[
          config.deskCaravanWindowLightX,
          config.deskCaravanWindowLightY,
          config.deskCaravanWindowLightZ,
        ]}
        color={new THREE.Color(
          config.deskCaravanWindowColorR,
          config.deskCaravanWindowColorG,
          config.deskCaravanWindowColorB,
        )}
        intensity={config.deskCaravanWindowLightIntensity}
        distance={config.deskCaravanWindowLightDistance}
        decay={config.deskCaravanWindowLightDecay}
      />
    </group>
  );
}

/**
 * The pickup truck, lit for the arcade.
 *
 * IMPORTANT: this model has NO headlight geometry of its own. The shipped
 * pickup_truck.glb carries six materials - Black, Bumpers, License, Main,
 * Metal, Window - and that is all. The "Headlights" and "BrakeLight"
 * materials this component used to clone into emissive copies live only in
 * _pickup_truck_ORIGINAL.glb / _pickup_truck_MODIFIED.glb / pickup_truck_lit
 * .glb, none of which are loaded any more, so those two branches matched
 * nothing and have been deleted rather than left looking load-bearing.
 *
 * Every lamp you can see is therefore procedural, built in TruckLamps:
 *   front pair  <LampPair> off truckHeadLamp*  (lens shape/placement)
 *   rear pair   <LampPair> off truckTailLamp*
 * and each LampPair draws BOTH sides, mirroring across the model's x=0 -
 * which is the truck's real centreline, measured: its bounding box runs
 * x -0.955..0.955.
 *
 * The light those lamps appear to cast is separate again: two spotLights off
 * truckHeadLight* (positioned at +-truckHeadLightX) and one pointLight off
 * truckTailLight*. So "the headlights" are three config groups, not one -
 * lens shape, lens colour/glow, and the beam.
 *
 * Local coordinates (untransformed model space):
 *   front bumper strip     ~ (0, 0.96, +2.54)
 *   tail-light strip       ~ (0, 0.97, -2.43)
 *   local +Z is forward; ArcadeSector rotates the truck 180 deg so the
 *   open bed faces the camera.
 */
/**
 * Runtime wall extension for the pickup truck's bed. Adds three panels (left
 * inner wall, right inner wall, cab-side front wall) rising above the authored
 * top rail. Each panel is a Selectable so it participates in the standard
 * object-override system — click it in the scene lab, then use the position /
 * rotation / scale sliders (or drag) to expand or reposition that panel
 * individually. Global config (height, thickness, color) sets the base size /
 * look; per-panel overrides layer offsets on top.
 *
 * Truck local frame (after glTF Y-up load of the yellow Sketchfab truck):
 *   - X: left/right of truck, bed inside walls at X = ±0.65
 *   - Y: up, bed floor top at Y = 0.656, top rail top at Y = 1.198
 *   - Z: front(+)/back(-), bed spans Z = -2.28 (rear opening) to -0.34 (cab)
 */
function BedWallExtension({
  config,
  onSelect,
}: {
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
}) {
  const height = Math.max(0, config.truckBedWallHeight);
  const thickness = Math.max(0.005, config.truckBedWallThickness);
  if (height <= 0) return null;
  const wallInnerX = 0.65;
  const yBase = 1.198;
  const zBackOpening = -2.28;
  const zCabWall = -0.34;
  const bedLengthZ = zCabWall - zBackOpening;
  const bedCenterZ = (zCabWall + zBackOpening) / 2;
  const yCenter = yBase + height / 2;
  const colorR = config.truckBedWallColorR;
  const colorG = config.truckBedWallColorG;
  const colorB = config.truckBedWallColorB;
  return (
    <group>
      <Selectable
        name="truck_bed_wall_left"
        onSelect={onSelect}
        config={config}
        basePosition={[-wallInnerX, yCenter, bedCenterZ]}
        baseRotationY={0}
        baseScale={1}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[thickness, height, bedLengthZ]} />
          <meshStandardMaterial color={new THREE.Color(colorR, colorG, colorB)} roughness={0.7} metalness={0.05} />
        </mesh>
      </Selectable>
      <Selectable
        name="truck_bed_wall_right"
        onSelect={onSelect}
        config={config}
        basePosition={[+wallInnerX, yCenter, bedCenterZ]}
        baseRotationY={0}
        baseScale={1}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[thickness, height, bedLengthZ]} />
          <meshStandardMaterial color={new THREE.Color(colorR, colorG, colorB)} roughness={0.7} metalness={0.05} />
        </mesh>
      </Selectable>
      <Selectable
        name="truck_bed_wall_front"
        onSelect={onSelect}
        config={config}
        basePosition={[0, yCenter, zCabWall]}
        baseRotationY={0}
        baseScale={1}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[wallInnerX * 2, height, thickness]} />
          <meshStandardMaterial color={new THREE.Color(colorR, colorG, colorB)} roughness={0.7} metalness={0.05} />
        </mesh>
      </Selectable>
    </group>
  );
}

/**
 * Body colour for the pickup, in LINEAR space (three's working space, which is
 * what Color.setRGB writes into by default - same convention the bed-wall
 * colour sliders already use).
 *
 * The GLB ships "Main" at linear (0.82, 0.12, 0.12) = sRGB #ea6161, a pale
 * salmon. Its green channel is the problem: sRGB 0x61 is a lot of green, and
 * under the campfire's orange key light (#ff781f) that lifts the whole body
 * into orange. Dropping green and blue hard is what actually makes it read red
 * at night rather than just darker.
 */
const TRUCK_BODY_COLOR_LINEAR: [number, number, number] = [0.55, 0.025, 0.02];

/** What goes on the pickup's plates. */
const TRUCK_PLATE_TEXT = "TWLO";

/**
 * The two plate slabs inside pickup_truck.glb's "License_Plate-material" mesh,
 * measured off the file. Both slabs live in that one mesh, so there is no node
 * per plate to hang a transform on - these are their centres in the mesh's own
 * local space. That space is Z-up (the Sketchfab root carries the -90deg X
 * conversion), so the plates face along local Y and local +Z is world up.
 * Each slab is 0.2836 wide x 0.1423 tall x 0.0061 thick.
 */
const TRUCK_PLATE_W = 0.2836;
const TRUCK_PLATE_H = 0.1423;
const TRUCK_PLATE_T = 0.0061;
const TRUCK_PLATES: { centre: [number, number, number]; outward: [number, number, number] }[] = [
  { centre: [0, -2.1628, 0.3019], outward: [0, -1, 0] },
  { centre: [-0.0004, 2.5455, 0.578], outward: [0, 1, 0] },
];

/** First descendant with this exact name, or null. The cast is what keeps
 *  TS from narrowing the closure-assigned local to `never`. */
function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => { if (!hit && o.name === name) hit = o; });
  return hit as THREE.Object3D | null;
}

/** Paints a plate face: pale ground, dark border, evenly spaced glyphs. */
function makePlateTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;               // 2:1, matching the slab's 0.2836 x 0.1423
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#e6e4dc";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = "#16325c";
  g.lineWidth = 12;
  g.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
  g.fillStyle = "#16325c";
  g.font = "bold 132px Arial, Helvetica, sans-serif";
  g.textBaseline = "middle";
  // Glyph by glyph: ctx.letterSpacing isn't supported across all browsers we
  // ship to, and a plate with no gaps between characters reads wrong.
  const gap = 16;
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = (canvas.width - total) / 2;
  chars.forEach((ch, i) => {
    g.fillText(ch, x, canvas.height / 2 + 4);
    x += widths[i] + gap;
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function LitPickupTruck({ config, onSelect }: { config: CampfireSceneConfig; onSelect: (name: string) => void }) {
  const gltf = useGLTF(PICKUP_TRUCK_URL) as unknown as { scene: THREE.Group };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  // The GLB ships the tailgate already dropped open - a flat panel lying
  // horizontally off the back at body height - which at this truck's pose read
  // as a slab hanging under the tray. Detached from the clone outright rather
  // than hidden, so it is not rendered, raycast or traversed at all. The GLB on
  // disk is untouched, so /scene-lab/truck-editor still sees the node.
  useEffect(() => {
    const tg = findByName(model, "Tailgate") ?? findByName(model, "Tailgate.002");
    tg?.parent?.remove(tg);
  }, [model]);

  // Built once by the effect below, then resized every frame from config so the
  // lab's plate sliders respond live instead of rebuilding the geometry.
  const plateQuads = useRef<THREE.Mesh[]>([]);

  // Stamp TRUCK_PLATE_TEXT onto both plates. The GLB's "License" material is a
  // flat colour with no texture, and one mesh carries both slabs, so instead of
  // fighting its UVs we lay a thin textured quad just proud of each face.
  useEffect(() => {
    if (typeof document === "undefined") return;       // never runs under SSR
    const plate = findByName(model, "License_Plate-material");
    if (!plate) return;
    const tex = makePlateTexture(TRUCK_PLATE_TEXT);
    if (!tex) return;

    const up = new THREE.Vector3(0, 0, 1);   // local +Z is up in this mesh
    const added: THREE.Mesh[] = [];
    plateQuads.current = added;
    for (const spec of TRUCK_PLATES) {
      const outward = new THREE.Vector3(...spec.outward);
      // right = up x outward keeps the basis right-handed, which is what makes
      // the text read the correct way round when viewed from OUTSIDE each end -
      // the front and rear plates face opposite ways, so a fixed rotation would
      // have mirrored one of them.
      const right = new THREE.Vector3().crossVectors(up, outward);
      const quad = new THREE.Mesh(
        new THREE.PlaneGeometry(TRUCK_PLATE_W * 0.84, TRUCK_PLATE_H * 0.78),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 })
      );
      quad.name = "truck_plate_text";
      quad.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, up, outward)
      );
      quad.position
        .set(...spec.centre)
        .addScaledVector(outward, TRUCK_PLATE_T / 2 + 0.002);
      quad.castShadow = false;
      quad.receiveShadow = true;
      plate.add(quad);
      added.push(quad);
    }
    return () => {
      plateQuads.current = [];
      for (const q of added) {
        plate.remove(q);
        q.geometry.dispose();
        (q.material as THREE.Material).dispose();
      }
      tex.dispose();
    };
  }, [model]);

  // Separate from the tailgate loop below, which bails early when the model has
  // no Tailgate node - the plates should still resize in that case.
  useFrame(() => {
    const c = cfgRef.current;
    for (const q of plateQuads.current) {
      q.scale.set(c.truckPlateScaleX, c.truckPlateScaleY, 1);
    }
  });

  useEffect(() => {
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const swapped = mats.map((m) => {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat) return mat;
        if (mat.name === "Main") {
          // The body panels - and Tailgate_mesh.001, which shares this
          // material. Deliberately the ONLY material recoloured: Black,
          // Bumpers, Metal, Window and License stay exactly as authored.
          // Keeps DoubleSide for the same reason as the fallback below.
          const body = mat.clone();
          body.color.setRGB(...TRUCK_BODY_COLOR_LINEAR);
          body.side = THREE.DoubleSide;
          body.needsUpdate = true;
          return body;
        }
        // Force every truck material to render both sides. The tail
        // housing (and other shells on this model) has ~150 boundary
        // edges per side - it's not watertight. Without DoubleSide the
        // camera looking into a gap sees a pitch-black "inside" between
        // the housing box and the body. DoubleSide makes the back of the
        // neighboring textured face render, so the seam picks up the
        // outside texture instead of showing raw interior.
        if (mat.side !== THREE.DoubleSide) {
          const dbl = mat.clone();
          dbl.side = THREE.DoubleSide;
          dbl.needsUpdate = true;
          return dbl;
        }
        return mat;
      });
      mesh.material = Array.isArray(mesh.material) ? swapped : swapped[0];
    });
  }, [model]);

  // Subtle flicker so the lights read as *on* rather than as texture bake.
  const headlightL = useRef<THREE.SpotLight>(null);
  const headlightR = useRef<THREE.SpotLight>(null);
  const headlightLTarget = useRef<THREE.Object3D>(null);
  const headlightRTarget = useRef<THREE.Object3D>(null);
  const brake = useRef<THREE.PointLight>(null);

  const headLightColor = useMemo(
    () => new THREE.Color().setRGB(
      config.truckHeadLightColorR, config.truckHeadLightColorG, config.truckHeadLightColorB),
    [config.truckHeadLightColorR, config.truckHeadLightColorG, config.truckHeadLightColorB]
  );
  const tailLightColor = useMemo(
    () => new THREE.Color().setRGB(
      config.truckTailLightColorR, config.truckTailLightColorG, config.truckTailLightColorB),
    [config.truckTailLightColorR, config.truckTailLightColorG, config.truckTailLightColorB]
  );

  // Wire each spot's target to a real Object3D in the group. Without this,
  // three defaults `light.target` to a bare Object3D with no scene parent —
  // three then reads target.matrixWorld = target.matrix, which treats
  // target.position as WORLD space rather than local. That was making both
  // beams shoot toward the world origin regardless of the truck's rotation,
  // producing splayed, off-axis headlights that ignored the truck's 180° Y
  // spin. The <object3D> children below inherit the group's transform, so
  // their world position tracks the truck.
  useEffect(() => {
    if (headlightL.current && headlightLTarget.current) {
      headlightL.current.target = headlightLTarget.current;
    }
    if (headlightR.current && headlightRTarget.current) {
      headlightR.current.target = headlightRTarget.current;
    }
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const c = cfgRef.current;
    const f = c.truckHeadLightFlicker;
    const jitter = 1 + f * (Math.sin(t * 13.1) * 0.05 + Math.sin(t * 27.3) * 0.03 - 0.1);
    if (headlightL.current) headlightL.current.intensity = c.truckHeadLightIntensity * jitter;
    if (headlightR.current) headlightR.current.intensity = c.truckHeadLightIntensity * jitter;
    if (brake.current) {
      brake.current.intensity = c.truckTailLightIntensity + Math.sin(t * 2.7) * 0.15;
    }
  });

  return (
    <group>
      <primitive object={model} />

      {/* Headlights — two forward-facing spots. Forward is local +Z after the
          glTF Y-up conversion. Each target is placed at the light's OWN x/y
          plus the aim offset, so leaving aim X/Y at 0 keeps the two beams
          parallel and road-flat instead of splayed toward a shared point. */}
      <spotLight
        ref={headlightL}
        position={[config.truckHeadLightX, config.truckHeadLightY, config.truckHeadLightZ]}
        color={headLightColor}
        intensity={config.truckHeadLightIntensity}
        distance={config.truckHeadLightDistance}
        decay={config.truckHeadLightDecay}
        angle={config.truckHeadLightAngle}
        penumbra={config.truckHeadLightPenumbra}
        castShadow={false}
      />
      <object3D
        ref={headlightLTarget}
        position={[
          config.truckHeadLightX + config.truckHeadLightAimX,
          config.truckHeadLightY + config.truckHeadLightAimY,
          config.truckHeadLightZ + config.truckHeadLightAimZ,
        ]}
      />
      <spotLight
        ref={headlightR}
        position={[-config.truckHeadLightX, config.truckHeadLightY, config.truckHeadLightZ]}
        color={headLightColor}
        intensity={config.truckHeadLightIntensity}
        distance={config.truckHeadLightDistance}
        decay={config.truckHeadLightDecay}
        angle={config.truckHeadLightAngle}
        penumbra={config.truckHeadLightPenumbra}
        castShadow={false}
      />
      <object3D
        ref={headlightRTarget}
        position={[
          -config.truckHeadLightX - config.truckHeadLightAimX,
          config.truckHeadLightY + config.truckHeadLightAimY,
          config.truckHeadLightZ + config.truckHeadLightAimZ,
        ]}
      />

      {/* Tail-light glow — red wash that spills back into the open bed. */}
      <pointLight
        ref={brake}
        position={[config.truckTailLightX, config.truckTailLightY, config.truckTailLightZ]}
        color={tailLightColor}
        intensity={config.truckTailLightIntensity}
        distance={config.truckTailLightDistance}
        decay={config.truckTailLightDecay}
      />

      {/* The lamps themselves — extruded from config so the lens shape is
          adjustable in the lab rather than baked into the GLB. */}
      <TruckLamps config={config} />

      {/* Optional wall extension raising the inside bed walls above the top
          rail. Driven entirely by config so no GLB edit is needed to try
          different heights. Lives in the truck's local frame so it inherits
          the truck's placement rotation and scale. */}
      <BedWallExtension config={config} onSelect={onSelect} />

      {/* User-controllable patch shapes. Each is a Selectable box that
          inherits the truck's local frame - so drag/scale/rotate in the
          scene lab (via the existing object-override sliders) move the
          patch relative to the truck body, not the world. Use these to
          plug any peek-through in the model (e.g. above the taillights)
          or add any small proxy geometry you need. Hide unused patches
          via the object list drawer. Base positions seeded above each
          taillight; adjust freely. */}
      <TruckPatch name="truck_patch_1" config={config} onSelect={onSelect}
        basePosition={[+0.92, 1.10, -2.38]} baseSize={[0.28, 0.14, 0.02]} />
      <TruckPatch name="truck_patch_2" config={config} onSelect={onSelect}
        basePosition={[-0.92, 1.10, -2.38]} baseSize={[0.28, 0.14, 0.02]} />
      <TruckPatch name="truck_patch_3" config={config} onSelect={onSelect}
        basePosition={[0, 1.30, -2.30]} baseSize={[0.3, 0.15, 0.02]} />
      <TruckPatch name="truck_patch_4" config={config} onSelect={onSelect}
        basePosition={[0, 0.60, -2.30]} baseSize={[0.3, 0.15, 0.02]} />
    </group>
  );
}

/**
 * A single user-controllable patch shape inside the pickup truck's local
 * frame. Renders a small box textured with a body-matching material,
 * wrapped in a Selectable so it plugs into the scene lab's drag/scale/hide
 * pipeline. Note: patch coords are in the truck's LOCAL frame - the truck
 * itself is rotated 180 deg by the arcade sector, so what looks like "back
 * of the truck from the camera" is actually the truck's local -Z.
 */
function TruckPatch({
  name, config, onSelect, basePosition, baseSize,
}: {
  name: string;
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
  basePosition: [number, number, number];
  baseSize: [number, number, number];
}) {
  return (
    <Selectable
      name={name}
      onSelect={onSelect}
      config={config}
      basePosition={basePosition}
      baseRotationY={0}
      baseScale={1}
    >
      <mesh>
        <boxGeometry args={baseSize} />
        <meshStandardMaterial color="#4a5560" roughness={0.75} metalness={0.05} />
      </mesh>
    </Selectable>
  );
}

function Tent({
  config,
  onSelect,
}: {
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
}) {
  const gltf = useGLTF(TENT_URL) as unknown as { scene: THREE.Group };
  const groupRef = useRef<THREE.Group>(null);
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  useEffect(() => {
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
        if (m.transparent) { m.transparent = false; m.needsUpdate = true; }
        if (!m.depthWrite) { m.depthWrite = true; m.needsUpdate = true; }
      });
    });
  }, [model]);

  useFrame(() => {
    if (!groupRef.current) return;
    const c = cfgRef.current;
    const o = c.objectOverrides?.["tent"] ?? EMPTY_OVERRIDE;
    groupRef.current.position.set(
      TENT_BASE.x + c.tentX + o.dx,
      TENT_BASE.y + c.tentY + o.dy,
      TENT_BASE.z + c.tentZ + o.dz
    );
    groupRef.current.rotation.set(o.rotX, c.tentRotationY + o.rotY, o.rotZ, "XZY");
    const s = c.tentScale * o.scale;
    groupRef.current.scale.set(s, s, s);
  });

  return (
    <group
      ref={groupRef}
      name="tent"
      onClick={(e: THREE.Event & { stopPropagation: () => void }) => {
        e.stopPropagation();
        onSelect("tent");
      }}
    >
      <group position={TENT_ANCHOR}>
        <group rotation={TENT_UPRIGHT}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}

function Benches({
  config,
  onSelect,
}: {
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
}) {
  return (
    <>
      {BENCH_ANGLES.map((angle, index) => {
        const name = `bench_${index}`;
        // Unmounted, not hidden: the component never enters the scene graph.
        if ((config.objectOverrides?.[name]?.hide ?? 0) >= 0.5) return null;
        return (
          <WoodLogBench
            key={`bench-${index}`}
            name={name}
            angle={angle}
            config={config}
            onSelect={onSelect}
            model={BENCH_MODELS[index] ?? OLD_LOG}
          />
        );
      })}
    </>
  );
}

/**
 * Parents a prop to the rig's "Food" socket bone. The sit_log clip keys that bone
 * to the right paw's grip point every frame, so the prop inherits the breathing
 * and the moving-hold drift for free.
 */
function SocketProp({
  root,
  prop,
  ready,
  config,
  heads,
  name,
}: {
  root: RefObject<THREE.Group | null>;
  prop: PropAttachment;
  ready: unknown;
  config: CampfireSceneConfig;
  heads?: RefObject<HeadRegistry>;
  name?: string;
}) {
  const gltf = useGLTF(prop.url) as unknown as { scene: THREE.Group };
  // Live handle so useFrame can re-apply the config-driven transform without
  // remounting the prop every time a slider moves.
  const propRef = useRef<THREE.Object3D | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const headsRegistry = heads?.current;
    if (!root.current) return;
    let socket: THREE.Object3D | null = null;
    root.current.traverse((o) => {
      if (!socket && (o.name === "Food" || o.name === "food")) socket = o;
    });
    if (!socket) return;
    const attached = socket as THREE.Object3D;
    // Skinned models need SkeletonUtils to rebind bones -> the SkinnedMesh's
    // .skeleton reference. Plain Object3D.clone leaves the SkinnedMesh pointing
    // at the source's bones, which either freezes the clone at bind pose or
    // makes it deform in lockstep with any other consumer of the same source.
    let hasSkinned = false;
    gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasSkinned = true; });
    const obj = (hasSkinned ? skeletonClone(gltf.scene) : gltf.scene.clone(true)) as THREE.Object3D;
    obj.scale.setScalar(prop.scale);
    // sit_log already aims the socket down the stick axis, so the prop needs no
    // correction of its own.
    const [rx, ry, rz] = prop.rotation ?? [0, 0, 0];
    obj.rotation.set(rx, ry, rz);
    const [px, py, pz] = prop.position ?? [0, 0, 0];
    obj.position.set(px, py, pz);
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    attached.add(obj);
    propRef.current = obj;

    // Optional wooden roasting stick, added as a sibling of the prop under the
    // same socket. Cylinder geometry runs along +Y by default, so a rotation of
    // 90 deg on X lays it along the socket's +Z axis (the stick line the sit_log
    // clip already keys the socket to). Lab-authored stickPosition/stickRotation
    // add on top of that baseline so the stick can move independently of the fish.
    let stick: THREE.Mesh | null = null;
    if (prop.stickLength && prop.stickLength > 0) {
      const radius = prop.stickRadius ?? 0.015;
      const geo = new THREE.CylinderGeometry(radius, radius, prop.stickLength, 8);
      const mat = new THREE.MeshStandardMaterial({ color: "#6b4423", roughness: 0.9 });
      stick = new THREE.Mesh(geo, mat);
      const [spx, spy, spz] = prop.stickPosition ?? [0, 0, 0];
      const [srx, sry, srz] = prop.stickRotation ?? [0, 0, 0];
      stick.position.set(spx, spy, spz);
      stick.rotation.set(Math.PI / 2 + srx, sry, srz);
      stick.castShadow = true;
      stick.receiveShadow = true;
      attached.add(stick);
    }

    return () => {
      attached.remove(obj);
      propRef.current = null;
      if (headsRegistry && name) {
        const entry = headsRegistry.get(name);
        if (entry) entry.fishPosition = undefined;
      }
      if (stick) {
        attached.remove(stick);
        stick.geometry.dispose();
        (stick.material as THREE.Material).dispose();
      }
    };
  }, [gltf.scene, prop.url, prop.scale, prop.rotation, prop.position, prop.stickLength, prop.stickRadius, prop.stickPosition, prop.stickRotation, root, ready, heads, name]);

  // Live config-driven overrides: re-apply each frame on top of the baseline
  // transform so sliders in the lab move the banjo without rebuilding it.
  useFrame(() => {
    const obj = propRef.current;
    if (!obj) return;
    if (heads?.current && name && prop.url === FISH_STICK_URL) {
      const entry = heads.current.get(name);
      if (entry) {
        entry.fishPosition ??= new THREE.Vector3();
        obj.getWorldPosition(entry.fishPosition);
      }
    }
    if (!prop.configKey) return;
    const c = configRef.current;
    if (prop.configKey === "banjoProp") {
      const [px, py, pz] = prop.position ?? [0, 0, 0];
      const [rx, ry, rz] = prop.rotation ?? [0, 0, 0];
      obj.position.set(px + c.banjoPropX, py + c.banjoPropY, pz + c.banjoPropZ);
      obj.rotation.set(rx + c.banjoPropRotX, ry + c.banjoPropRotY, rz + c.banjoPropRotZ);
      obj.scale.setScalar(prop.scale * c.banjoPropScale);
    }
  });

  return null;
}

/**
 * A prop carried between two bones, for rigs with no socket to hang one from.
 *
 * Sits at the live midpoint of the pair, recomputed each frame - the same fix the
 * bears' roasting stick needed, where anchoring to one paw made it orbit that wrist.
 * Also publishes where the prop's cord leaves it, so a wire can find that point.
 */
function PawProp({
  root,
  spec,
  ready,
  name,
  cords,
}: {
  root: RefObject<THREE.Group | null>;
  spec: HandheldAttachment;
  ready: unknown;
  name: string;
  /** where this prop's cord exits, in world space, published for the wire */
  cords?: RefObject<CordRegistry>;
}) {
  const gltf = useGLTF(spec.url) as unknown as { scene: THREE.Group };
  const objRef = useRef<THREE.Object3D | null>(null);
  const bonesRef = useRef<THREE.Object3D[]>([]);
  const cordRef = useRef<THREE.Object3D | null>(null);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const parent = root.current;
    if (!parent) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targets = spec.bones.map(norm);
    const found = new Map<string, THREE.Object3D>();
    parent.traverse((o) => {
      const idx = targets.indexOf(norm(o.name));
      if (idx >= 0 && !found.has(spec.bones[idx])) found.set(spec.bones[idx], o);
    });
    const pair = spec.bones.map((n) => found.get(n)).filter(Boolean) as THREE.Object3D[];
    if (pair.length < 2) {
      console.warn(`[scene] "${name}": could not find paw bones ${spec.bones.join(" / ")}`);
      return;
    }
    bonesRef.current = pair;

    const obj = gltf.scene.clone(true);
    obj.scale.setScalar(spec.scale);
    const [rx, ry, rz] = spec.rotation ?? [0, 0, 0];
    obj.rotation.set(rx, ry, rz);
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      }
    });
    // An empty marker at the cord exit, so the wire endpoint rides the prop exactly
    // instead of being re-derived from the prop's transform every frame.
    const cordPoint = new THREE.Object3D();
    cordPoint.position.copy(CONTROLLER_CORD_EXIT);
    obj.add(cordPoint);
    cordRef.current = cordPoint;

    parent.add(obj);
    objRef.current = obj;
    // Snapshot cords.current NOW - by the time this cleanup runs, the ref's
    // .current may have swapped to a different map (or be null), and cleaning
    // the wrong one silently leaks the entry. This is what the react-hooks
    // rule warns about.
    const cordsAtMount = cords?.current;
    return () => {
      parent.remove(obj);
      objRef.current = null;
      cordRef.current = null;
      cordsAtMount?.delete(name);
    };
  }, [gltf.scene, spec, root, ready, name, cords]);

  useFrame(() => {
    const obj = objRef.current;
    const parent = root.current;
    const pair = bonesRef.current;
    if (!obj || !parent || pair.length < 2) return;

    pair[0].getWorldPosition(a);
    pair[1].getWorldPosition(b);
    a.add(b).multiplyScalar(0.5);
    parent.worldToLocal(a);
    obj.position.set(a.x + spec.offset[0], a.y + spec.offset[1], a.z + spec.offset[2]);

    if (cords?.current && cordRef.current) {
      obj.updateMatrixWorld(true);
      cordRef.current.getWorldPosition(b);
      const store = cords.current.get(name) ?? new THREE.Vector3();
      cords.current.set(name, store.copy(b));
    }
  });

  return null;
}

/**
 * The GameCube. Publishes its four port positions in world space each frame so the
 * wires can find them wherever the config sliders have put it.
 */
function GameCubeConsole({
  config,
  onSelect,
  ports,
}: {
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
  ports: RefObject<PortRegistry>;
}) {
  const gltf = useGLTF(GAMECUBE_URL) as unknown as { scene: THREE.Group };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const groupRef = useRef<THREE.Group>(null);
  const cfg = useRef(config);
  cfg.current = config;
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [model]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const c = cfg.current;
    const o = c.objectOverrides?.["gamecube"] ?? EMPTY_OVERRIDE;
    group.position.set(CONSOLE_BASE.x + o.dx, CONSOLE_BASE.y + o.dy, CONSOLE_BASE.z + o.dz);
    group.rotation.set(o.rotX, CONSOLE_BASE.rotY + o.rotY, o.rotZ, "XZY");
    const s = CONSOLE_BASE.scale * o.scale;
    group.scale.set(s, s, s);

    group.updateMatrixWorld(true);
    for (let i = 0; i < CONSOLE_PORTS.length; i++) {
      tmp.set(...CONSOLE_PORTS[i]);
      group.localToWorld(tmp);
      const store = ports.current.get(i) ?? new THREE.Vector3();
      ports.current.set(i, store.copy(tmp));
    }
  });

  return (
    <group
      ref={groupRef}
      name="gamecube"
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect("gamecube");
      }}
    >
      <primitive object={model} />
    </group>
  );
}

/**
 * One controller lead, hung off the socket it plugs into.
 *
 * THE END THAT MATTERS IS NOT COMPUTED. This mesh is a child of the port's own
 * group, so the socket end of the curve is the origin - (0,0,0) - and no
 * amount of dragging, spinning or rescaling the console can put the cord
 * anywhere else. That is the whole reason it was moved here.
 *
 * The version before this one passed port positions through a world-space
 * registry: the console published where its sockets were, the lead read that
 * back and converted it into its own frame. Both ends were then at the mercy
 * of two different matrices being up to date in the same tick - and the ring
 * that carries a whole site re-seats itself inside the frame loop, so
 * `matrixWorld` is a frame stale exactly when it matters. A cord that lands
 * near the console but not in it is what that looks like from the outside.
 *
 * Only the controller end crosses frames now, and it is allowed to be a frame
 * behind: the cub holding it is breathing, not teleporting.
 *
 * Everything here is in MODEL units, because that is the frame this mesh
 * lives in - the console is drawn at 0.014, so a 6mm cord is 0.43 units of
 * this space. `scale` divides the world-unit constants back out.
 */
function ControllerWire({
  index,
  cords,
  cubName,
  count = ARCADE_CONSOLE_PORTS.length,
  radius = ARCADE_WIRE_RADIUS,
  floorY,
}: {
  index: number;
  cords: RefObject<CordRegistry>;
  cubName: string;
  /** How many leads fan out, which is what decides this one's bow. */
  count?: number;
  /** Cord gauge in WORLD units. Divided by the frame's scale on use. */
  radius?: number;
  /** Where the ground is in this frame, so a lead can rest on it instead of
   *  sinking through. In model units, measured down from the socket. */
  floorY: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const a = useMemo(() => new THREE.Vector3(), []);
  const mid = useMemo(() => new THREE.Vector3(), []);
  const worldScale = useMemo(() => new THREE.Vector3(), []);
  const lastA = useRef(new THREE.Vector3(NaN, NaN, NaN));

  /* A degenerate tube: zero radius, so a lead that has never been placed
   * draws nothing. The previous version shipped a full-size placeholder that
   * ran one unit along +Z, and four of them stacked into a single black rod
   * lying across the set - which looked exactly like a cord that had missed. */
  const initial = useMemo(
    () =>
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(),
          new THREE.Vector3(),
          new THREE.Vector3()
        ),
        1,
        0,
        3,
        false
      ),
    []
  );

  useEffect(() => () => { meshRef.current?.geometry?.dispose(); }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    const parent = mesh?.parent;
    if (!mesh || !parent) return;
    const from = cords.current?.get(cubName);
    if (!from) {
      // No controller: the cub is hidden, or its paw bones never resolved.
      mesh.visible = false;
      return;
    }
    // This lead's own matrices, brought up to date before anything is read
    // through them - the console may have been dragged this very frame.
    parent.updateWorldMatrix(true, false);
    a.copy(from);
    parent.worldToLocal(a);

    // 2mm of movement, in world units, is below anything you could see.
    const s = Math.abs(parent.getWorldScale(worldScale).x) || 1;
    const still = a.distanceToSquared(lastA.current) * s * s < 4e-6;
    if (still && mesh.visible) return;
    lastA.current.copy(a);

    const r = radius / s;
    const bow = ((index - (count - 1) / 2) * 0.06) / s;
    // Halfway between the controller and the socket, which is the origin.
    mid.copy(a).multiplyScalar(0.5);
    const len = Math.hypot(a.x, a.z) || 1;
    mid.x += (-a.z / len) * bow;
    mid.z += (a.x / len) * bow;
    /*
     * A cord sags below the line between its ends and cannot sink through the
     * floor. Both cases are live here: cubs sitting on the ground give a
     * near-flat lead that rests on the carpet, cubs up on a chair give one
     * that drapes. The clamp is what turns the same rule into both.
     */
    mid.y = Math.max(floorY + r * 1.2, a.y / 2 - len * 0.15);

    mesh.geometry.dispose();
    mesh.geometry = new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(a.clone(), mid.clone(), new THREE.Vector3()),
      20,
      r,
      6,
      false
    );
    mesh.visible = true;
  });

  return (
    <mesh ref={meshRef} geometry={initial} castShadow>
      <meshStandardMaterial color={ARCADE_WIRE_COLOR} roughness={0.9} metalness={0} />
    </mesh>
  );
}

/** The wrapper group the console model hangs in re-centres it and drops its
 *  base onto the floor: [0, -0.061, 1.107]. The y term is what tells a lead
 *  where the ground is relative to a socket, so it is named rather than
 *  repeated. */
const ARCADE_CONSOLE_LIFT = -0.061;

/**
 * The console's four sockets: a plug in each, and the lead that runs out of it.
 *
 * Both hang off a group positioned AT the port, which is the point. The plug
 * and the cord end then share one transform, so they cannot disagree about
 * where the socket is, and neither can drift from the mesh - the wrapper's
 * re-centring offset is applied to all three by the same parent.
 *
 * It also means no registry and no world-space hand-off between two frame
 * callbacks, which is what the previous version got wrong.
 */
function ConsolePorts({
  cords,
  cubNames,
}: {
  cords: RefObject<CordRegistry>;
  /** Which cub plugs into which socket, in socket order. A null leaves that
   *  socket empty - no plug, no lead. */
  cubNames: readonly (string | null)[];
}) {
  // Which lead this is among the ones actually in use, so two cords fan apart
  // evenly instead of both bowing off to one side as though there were four.
  const used = ARCADE_CONSOLE_PORTS.map((_, i) => cubNames[i]).filter(Boolean).length;
  let rank = -1;
  return (
    <>
      {ARCADE_CONSOLE_PORTS.map(([x, y, z], i) => {
        const cub = cubNames[i];
        if (!cub) return null;
        rank += 1;
        const fan = rank;
        return (
          <group key={i} position={[x, y, z]}>
            {/*
              The plug, seated in the socket. Sized off the socket itself: the
              measured pieces are 0.998 across, so a 0.36 radius sits inside
              the rim, pushed 0.18 back into the hole.
            */}
            <mesh position={[0, 0, -0.18]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.36, 0.36, 0.36, 10]} />
              <meshStandardMaterial color={ARCADE_WIRE_COLOR} roughness={0.85} metalness={0.05} />
            </mesh>
            <ControllerWire
              index={fan}
              cords={cords}
              cubName={cub}
              count={used}
              // The floor, measured down from THIS socket: the wrapper puts
              // the model's base at its own origin, so the drop is the port's
              // own height plus that lift.
              floorY={-(y + ARCADE_CONSOLE_LIFT)}
            />
          </group>
        );
      })}
    </>
  );
}

/**
 * Bolted onto a bone so it rides the animation. The bone bases were measured off the
 * rig, so a model authored Y-up / +Z-forward lands the right way round on its own.
 */
function BearAccessory({
  root,
  kind,
  ready,
  config,
  bearId,
}: {
  root: RefObject<THREE.Group | null>;
  kind: "glasses" | "tie";
  ready: unknown;
  config: CampfireSceneConfig;
  /** Which bear this accessory is on. Some bears (e.g. the banjo bear on
   *  back_left_log) carry a per-bear glasses offset stacked on top of the
   *  shared glasses config so their fit can be dialled independently. */
  bearId?: "front_log" | "back_left_log" | "back_right_log" | "table";
}) {
  const attached = useRef<THREE.Object3D | null>(null);
  const cfgRef = useRef(config);
  cfgRef.current = config;
  // Glasses come from a file; the tie is built here, since there wasn't one.
  const glassesGltf = useGLTF(GLASSES_URL) as unknown as { scene: THREE.Group };

  const tie = useMemo(() => {
    if (kind !== "tie") return null;
    const group = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: "#8c2f39", roughness: 0.82, metalness: 0 });
    const knotMat = new THREE.MeshStandardMaterial({ color: "#71242d", roughness: 0.85, metalness: 0 });

    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.1, 0.07), knotMat);
    knot.position.set(0, 0, 0);
    group.add(knot);

    // blade: wide at the shoulders, flaring, then down to a point
    const shape = new THREE.Shape();
    shape.moveTo(-0.052, -0.04);
    shape.lineTo(0.052, -0.04);
    shape.lineTo(0.075, -0.16);
    shape.lineTo(0, -0.46);
    shape.lineTo(-0.075, -0.16);
    shape.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false }), cloth);
    blade.position.z = -0.022;
    group.add(blade);

    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; }
    });
    return group;
  }, [kind]);

  useEffect(() => {
    if (!root.current) return;
    const boneName = kind === "glasses" ? "head" : "chest";
    let bone: THREE.Object3D | null = null;
    root.current.traverse((o) => { if (!bone && o.name === boneName) bone = o; });
    if (!bone) return;
    const parent = bone as THREE.Object3D;

    let obj: THREE.Object3D;
    if (kind === "glasses") {
      obj = glassesGltf.scene.clone(true);
      // Model is 33 units wide with its centre at [0, 4.6, -11.5] and the arms
      // trailing to -Z. Re-anchor onto the lens plane, then scale to a ~0.45-wide
      // pair against the bear's 0.252 eye separation.
      const inner = new THREE.Group();
      obj.position.set(0, -4.596, -0.94);
      inner.add(obj);
      inner.scale.setScalar(0.0136);
      inner.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; }
      });
      // placement is applied per-frame below so the lab sliders are live
      obj = inner;
    } else {
      if (!tie) return;
      obj = tie;
      // just under the chin, on the chest surface measured at chest-local z ~0.52
      obj.position.set(0, 0.2, 0.5);
      obj.quaternion.copy(boneBasis(CHEST_FWD_LOCAL, CHEST_UP_LOCAL));
    }

    parent.add(obj);
    attached.current = obj;
    return () => { parent.remove(obj); attached.current = null; };
  }, [root, kind, ready, glassesGltf.scene, tie]);

  // Height and nose-ride are deliberately separate axes: the bears have a long muzzle,
  // so how high the lenses sit and how far down the nose they perch are independent.
  useFrame(() => {
    const obj = attached.current;
    if (!obj || kind !== "glasses") return;
    const c = cfgRef.current;
    // Additive per-bear offset. Banjo bear (back_left_log) has its own quartet
    // so its glasses can be nudged without dragging the other bears' fits
    // along. Anything else falls through with all zeros.
    const isBanjo = bearId === "back_left_log";
    const heightOffset = isBanjo ? c.banjoBearGlassesHeight : 0;
    const noseOffset = isBanjo ? c.banjoBearGlassesNoseRide : 0;
    const tiltOffset = isBanjo ? c.banjoBearGlassesTilt : 0;
    const scaleMul = isBanjo ? c.banjoBearGlassesScale : 1;
    obj.position
      .set(0, 0.3615, 0.0943)
      .addScaledVector(FACE_UP_LOCAL, c.glassesHeight + heightOffset)
      .addScaledVector(FACE_FWD_LOCAL, 0.052 + c.glassesNoseRide + noseOffset);
    obj.quaternion
      .copy(boneBasis(FACE_FWD_LOCAL, FACE_UP_LOCAL))
      .multiply(new THREE.Quaternion().setFromAxisAngle(FACE_RIGHT_LOCAL, c.glassesTilt + tiltOffset));
    obj.scale.setScalar(0.0136 * c.glassesScale * scaleMul);
  });

  useEffect(() => () => {
    tie?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      }
    });
  }, [tie]);

  return null;
}

function Animal({
  placement,
  name,
  config,
  onSelect,
  heads,
  cords,
  bearVoiceRef,
  fishReactionRef,
  banjoTimeRef,
  seed = 0,
}: {
  placement: AnimalPlacement;
  name: string;
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
  /** shared live head positions, so bears can find each other without prop drilling */
  heads?: RefObject<HeadRegistry>;
  /** shared cord-exit positions, so the wires can find the controllers */
  cords?: RefObject<CordRegistry>;
  bearVoiceRef?: BearVoiceStateRef;
  fishReactionRef?: MutableRefObject<FishReaction>;
  banjoTimeRef?: MutableRefObject<number>;
  seed?: number;
}) {
  const gltf = useGLTF(placement.url) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] };
  const groupRef = useRef<THREE.Group>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const [x, y, z] = placement.position;

  // Skinned meshes must be cloned with SkeletonUtils. drei's <Clone> shares the
  // skeleton, so three bears sharing one GLB would share one set of bones and
  // their three mixers would fight over it.
  const model = useMemo(() => skeletonClone(gltf.scene) as THREE.Group, [gltf.scene]);
  // The old grey bear (rocking chair): coat, glasses, brows and beard from
  // the lab's "Old bear" knobs - see oldBear.ts.
  useOldBearLook(
    placement.url === BEAR_OLD_URL ? model : null,
    oldBearLookFromConfig(config as unknown as Record<string, unknown>),
  );

  // Cub idle: procedural head bob + ear twitch. The cub GLB has no clip,
  // so the site animates it at runtime. Rests are captured once so we
  // add small deltas each frame rather than clobbering baked pose.
  const cubHeadBoneRef = useRef<THREE.Object3D | null>(null);
  const cubEarLRef = useRef<THREE.Object3D | null>(null);
  const cubEarRRef = useRef<THREE.Object3D | null>(null);
  const cubHeadRestQ = useRef<THREE.Quaternion | null>(null);
  const cubEarLRestQ = useRef<THREE.Quaternion | null>(null);
  const cubEarRRestQ = useRef<THREE.Quaternion | null>(null);
  const cubIdleTime = useRef(seed * 0.73);
  const mouthBoneRef = useRef<THREE.Bone | null>(null);
  const mouthMixerQRef = useRef(new THREE.Quaternion());
  const mouthJawQRef = useRef(new THREE.Quaternion());
  const mouthEnvelopeRef = useRef(0);
  // Face morphs authored in Blender (scripts/bear-mouth/bear_mouth_shapes.blend,
  // injected by scripts/add_bear_mouth_morphs.py): jawOpen / mouthWide /
  // mouthRound / eyeBlink. Null on a GLB that predates them - the jaw-bone
  // path below is the fallback.
  // Mouth skeleton added by scripts/add_bear_mouth_rig.py (jaw -> lip_lower,
  // lip_upper, lip_corner_L/R, all under head). These bones have no clip
  // channels, so they're set ABSOLUTELY every frame from their cached rest
  // transform - never accumulated - which is what keeps them from drifting.
  const mouthRigRef = useRef<{
    bones: Record<"jaw" | "lip_lower" | "lip_upper" | "lip_corner_L" | "lip_corner_R", THREE.Object3D>;
    restPos: Record<string, THREE.Vector3>;
    restQ: Record<string, THREE.Quaternion>;
  } | null>(null);
  const faceMeshRef = useRef<{
    influences: number[];
    jaw: number; wide: number; round: number; blink: number;
  } | null>(null);
  // Per-bear talking state: smoothed mouth channels, the syllable-driven nod
  // spring, blink scheduling. One object, mutated in place every frame.
  const talkRef = useRef({
    open: 0, wide: 0, round: 0,
    openPre: 0, widePre: 0, roundPre: 0,   // first stage of the two-pole smoothing
    gain: 1,
    lastSyllable: -1,
    nod: 0, nodVel: 0,
    speak: 0,            // 0..1 eased "is speaking" blend for sway
    t: seed * 1.37,
    blinkClock: 1.5 + ((seed * 0.618) % 1) * 3,
    blinkT: -1,          // <0 = not blinking; else seconds into the blink
    doubleBlink: false,
    // secondary motion
    wasSpeaking: false,
    silentFor: 10,       // seconds since this bear last spoke
    ear: 0,              // 1 -> 0 after an accent: ear flick
    listen: 0, listenVel: 0, listenClock: 1.5,   // slow "mm-hm" nods while the other bear talks
    lastAccent: -1,
    backchannelIn: -1,   // >0: seconds until a listener nod answers the speaker's accent
    headLift: 0,         // smoothed pitch-follow (rad, +down)
  });
  const talkRng = useMemo(() => seededRandom(311 + seed * 29), [seed]);
  const mouthTmpQ = useMemo(() => new THREE.Quaternion(), []);
  const mouthTmpV = useMemo(() => new THREE.Vector3(), []);

  // Banjo-bear arm override: eight arm bones + their rest quaternions, so the
  // picking loop can compose `rest * userEuler` each frame and hard-replace
  // whatever the base clip wrote for arms.
  const banjoBonesRef = useRef<Partial<Record<string, THREE.Bone>>>({});
  const banjoRestQRef = useRef<Partial<Record<string, THREE.Quaternion>>>({});
  const banjoFingerRRef = useRef<THREE.Bone | null>(null);
  const banjoFingerLRef = useRef<THREE.Bone | null>(null);
  const banjoFingerRRestQRef = useRef<THREE.Quaternion | null>(null);
  const banjoFingerLRestQRef = useRef<THREE.Quaternion | null>(null);
  // Rocking-chair bear: whole-skeleton pose cache (rotation AND scale rest
  // values, so scale sliders can stretch/shrink a bone relative to its own
  // authored length rather than to an arbitrary 1).
  const chairBonesRef = useRef<Partial<Record<string, THREE.Bone>>>({});
  const postureRef = useRef<PostureState>(makePostureState());
  // rocking-chair bear: legs held still (no sit_log kick), and this frame's
  // posture with the rock's lean / hunch folded in
  const legLockRef = useRef<LegLock | null>(null);
  const rockPostureRef = useRef<RockingPosture>({ ...ROCKING_CHAIR_POSTURE });
  const chairRestQRef = useRef<Partial<Record<string, THREE.Quaternion>>>({});
  const chairRestSRef = useRef<Partial<Record<string, THREE.Vector3>>>({});
  // Banjo-bear Food-socket freeze: sit_log animates Food to trace the right paw
  // over the loop. The lab pauses the clip at a single frame so Food (and any
  // parented banjo) stays put; on the site the clip runs unpaused, so we sample
  // the Food tracks at the lab's authored frame once and pin Food there every
  // useFrame. Without this the banjo drifts along the paw path instead of
  // sitting in the paw.
  const banjoFoodRef = useRef<THREE.Object3D | null>(null);
  const banjoFoodPos = useRef<THREE.Vector3 | null>(null);
  const banjoFoodQuat = useRef<THREE.Quaternion | null>(null);
  const banjoFoodScale = useRef<THREE.Vector3 | null>(null);

  // Per-bear pose is now baked directly into per-bear GLBs by
  // /api/dev/bake-bear-pose (invoked when the lab saves). Site loads the
  // baked GLB via placement.url and the mixer plays sit_log; the baked
  // bones sit at `rest * delta` for every frame thanks to constant
  // fcurves in the clip. No runtime overlay needed - see BEAR_URL_FRONT_LOG.
  // BEAR_POSES is still consumed below for the socket-prop transform merge.
  //
  // Food-rotation damping: when foodRotationScale < 1 the socket bone is
  // slerped back toward rest each frame so the fish doesn't swing with the
  // paw. Populated once per model swap and read in useFrame below.
  const foodBoneRef = useRef<THREE.Object3D | null>(null);
  const foodRestQRef = useRef<THREE.Quaternion | null>(null);
  // Same trick for both wrists - handRotationScale in the pose config slerps
  // hand_L / hand_R back toward rest.
  const handLRef = useRef<THREE.Object3D | null>(null);
  const handLRestQRef = useRef<THREE.Quaternion | null>(null);
  const handRRef = useRef<THREE.Object3D | null>(null);
  const handRRestQRef = useRef<THREE.Quaternion | null>(null);

  useEffect(() => {
    // Banjo-bear arm bone discovery. Cheap, fires once per model swap.
    banjoBonesRef.current = {};
    banjoRestQRef.current = {};
    banjoFingerRRef.current = null;
    banjoFingerLRef.current = null;
    banjoFingerRRestQRef.current = null;
    banjoFingerLRestQRef.current = null;
    banjoFoodRef.current = null;
    banjoFoodPos.current = null;
    banjoFoodQuat.current = null;
    banjoFoodScale.current = null;
    foodBoneRef.current = null;
    foodRestQRef.current = null;
    handLRef.current = null;
    handLRestQRef.current = null;
    handRRef.current = null;
    handRRestQRef.current = null;
    mouthBoneRef.current = null;
    faceMeshRef.current = null;
    mouthRigRef.current = null;
    {
      const want = ["jaw", "lip_lower", "lip_upper", "lip_corner_L", "lip_corner_R"] as const;
      const found: Partial<Record<(typeof want)[number], THREE.Object3D>> = {};
      model.traverse((o) => {
        if ((want as readonly string[]).includes(o.name) && (o as THREE.Bone).isBone) {
          found[o.name as (typeof want)[number]] = o;
        }
      });
      if (want.every((n) => found[n])) {
        const bones = found as Record<(typeof want)[number], THREE.Object3D>;
        const restPos: Record<string, THREE.Vector3> = {};
        const restQ: Record<string, THREE.Quaternion> = {};
        for (const n of want) { restPos[n] = bones[n].position.clone(); restQ[n] = bones[n].quaternion.clone(); }
        mouthRigRef.current = { bones, restPos, restQ };
      }
    }

    // Every bear GLB carrying the Blender face morphs gets them wired up -
    // the blink runs on all of them, the mouth only moves on voice bears.
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      const dict = m.morphTargetDictionary;
      if (faceMeshRef.current || !m.isMesh || !dict || dict.jawOpen === undefined || !m.morphTargetInfluences) return;
      faceMeshRef.current = {
        influences: m.morphTargetInfluences,
        jaw: dict.jawOpen,
        wide: dict.mouthWide ?? -1,
        round: dict.mouthRound ?? -1,
        blink: dict.eyeBlink ?? -1,
      };
    });

    // The model has no shared skeleton between placements; cache its jaw once
    // so voice motion can layer over the mixer's current jaw pose each frame.
    if (placement.bearId === "back_left_log" || placement.bearId === "back_right_log") {
      model.traverse((o) => {
        const bone = o as THREE.Bone;
          const normalizedName = o.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!mouthBoneRef.current && bone.isBone && (normalizedName.includes("jaw") || normalizedName.includes("mouth"))) {
            mouthBoneRef.current = bone;
          }
      });
    }

    // Cache Food socket + hand_L/hand_R + their rest quaternions for the
    // fish-holder path. Skipped for banjo bears - banjo hard-overrides both
    // wrists and pins Food to a sampled frame every tick, so the damping
    // would fight it.
    if (placement.bearId && !placement.banjoPlayer) {
      model.traverse((o) => {
        if (!foodBoneRef.current && (o.name === "Food" || o.name === "food")) {
          foodBoneRef.current = o;
          foodRestQRef.current = (o as THREE.Bone).quaternion.clone();
        }
        if (!handLRef.current && o.name === "hand_L") {
          handLRef.current = o;
          handLRestQRef.current = (o as THREE.Bone).quaternion.clone();
        }
        if (!handRRef.current && o.name === "hand_R") {
          handRRef.current = o;
          handRRestQRef.current = (o as THREE.Bone).quaternion.clone();
        }
      });
    }

    if (placement.banjoPlayer) {
      const armNames = new Set([
        "shoulder_L", "upperarm_L", "arm_L", "hand_L",
        "shoulder_R", "upperarm_R", "arm_R", "hand_R",
      ]);
      let food: THREE.Object3D | null = null;
      model.traverse((o) => {
        const b = o as THREE.Bone;
        if (b.isBone && armNames.has(o.name)) {
          banjoBonesRef.current[o.name] = b;
          banjoRestQRef.current[o.name] = b.quaternion.clone();
        }
        if (b.isBone && o.name === "fingers_R") {
          banjoFingerRRef.current = b;
          banjoFingerRRestQRef.current = b.quaternion.clone();
        }
        if (b.isBone && o.name === "fingers_L") {
          banjoFingerLRef.current = b;
          banjoFingerLRestQRef.current = b.quaternion.clone();
        }
        if (!food && (o.name === "Food" || o.name === "food")) {
          food = o;
        }
      });
      banjoFoodRef.current = food;

      // Sample the sit_log clip's Food tracks at the lab-authored frame so the
      // banjo sits where the lab shows it.
      const clip = gltf.animations?.find((c) => c.name === "sit_log");
      if (clip && food) {
        const foodObj = food as THREE.Object3D;
        const frame = BANJO_BEAR_POSE.frame ?? 30;
        const sampleTime = Math.max(0, Math.min(clip.duration, frame / BANJO_BEAR_FPS));
        const foodName = foodObj.name;
        const sampleTrack = (kind: "position" | "quaternion" | "scale") => {
          const track = clip.tracks.find((t) => t.name === `${foodName}.${kind}`);
          if (!track) return null;
          const interp = (track as unknown as {
            createInterpolant: (r?: Float32Array) => { evaluate: (t: number) => ArrayLike<number> };
          }).createInterpolant();
          return interp.evaluate(sampleTime);
        };
        const posV = sampleTrack("position");
        banjoFoodPos.current = posV
          ? new THREE.Vector3(posV[0], posV[1], posV[2])
          : foodObj.position.clone();
        const quatV = sampleTrack("quaternion");
        banjoFoodQuat.current = quatV
          ? new THREE.Quaternion(quatV[0], quatV[1], quatV[2], quatV[3])
          : foodObj.quaternion.clone();
        const scaleV = sampleTrack("scale");
        banjoFoodScale.current = scaleV
          ? new THREE.Vector3(scaleV[0], scaleV[1], scaleV[2])
          : foodObj.scale.clone();
      }
    }

    cubHeadBoneRef.current = null;
    cubEarLRef.current = null;
    cubEarRRef.current = null;
    if (placement.url !== CUB_URL) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    model.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      const n = norm(o.name);
      if (!cubHeadBoneRef.current && n === "headx") {
        cubHeadBoneRef.current = b;
        cubHeadRestQ.current = b.quaternion.clone();
      } else if (!cubEarLRef.current && n === "cear01l") {
        cubEarLRef.current = b;
        cubEarLRestQ.current = b.quaternion.clone();
      } else if (!cubEarRRef.current && n === "cear01r") {
        cubEarRRef.current = b;
        cubEarRRestQ.current = b.quaternion.clone();
      }
    });
    if (placement.rockingChairPose) {
      const want = (placement.animation ?? "").toLowerCase();
      const clip = gltf.animations?.find((c) => c.name.toLowerCase() === want)
        ?? gltf.animations?.find((c) => want && c.name.toLowerCase().includes(want));
      legLockRef.current = makeLegLock(model, clip);
      const partNames = new Set<string>(ROCKING_CHAIR_BONE_NAMES);
      model.traverse((o) => {
        const b = o as THREE.Bone;
        if (b.isBone && partNames.has(o.name)) {
          chairBonesRef.current[o.name] = b;
          chairRestQRef.current[o.name] = b.quaternion.clone();
          chairRestSRef.current[o.name] = b.scale.clone();
        }
      });
    }

  }, [model, placement.url, placement.bearId, placement.banjoPlayer, placement.rockingChairPose, placement.animation, gltf.animations, seed]);

  const { actions, names: actionNames, mixer } = useAnimations(gltf.animations || [], groupRef);
  // Which model the mixer's bindings were made against (see the play effect).
  const boundModelRef = useRef<THREE.Object3D | null>(null);

  // Track the currently-playing action so the animation useEffect can idempotently
  // "start once, keep running". Without this the effect's cleanup fadeOut() +
  // re-play() ran whenever anything upstream re-rendered (autosave HMR, config
  // slider drag, etc.), and the mixer's 0.3s fadeIn from weight 0 was long enough
  // to flash a T-pose on the bears every reload. We now skip repeats entirely
  // when the target action is the same instance already running.
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  // ---- social glances --------------------------------------------------------
  // Only the bears take part; everything else ignores all of this.
  const social = placement.animation === "sit_log";
  const headRef = useRef<THREE.Object3D | null>(null);
  const earLRef = useRef<THREE.Object3D | null>(null);
  const earRRef = useRef<THREE.Object3D | null>(null);
  const glance = useRef({ t: 0, next: 2.5 + seed * 1.7, phase: "wait" as "wait" | "turn" | "hold" | "back", w: 0, target: "" });
  // voice bears' conversational gaze: smoothed world-space look target
  const lookRef = useRef({
    target: new THREE.Vector3(),
    init: false,
    hold: 0,
    otherDelay: 0,
    partnerRequested: false,
    wantOther: false,
    wantFish: false,
    fishHold: 0,
    fishCooldown: 3.5 + seed * 1.4,
  });
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const tmpV2 = useMemo(() => new THREE.Vector3(), []);
  const fishLookEnd = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpQ2 = useMemo(() => new THREE.Quaternion(), []);
  const rng = useMemo(() => seededRandom(97 + seed * 13), [seed]);

  useEffect(() => {
    if (!social) return;
    let head: THREE.Object3D | null = null;
    let earL: THREE.Object3D | null = null;
    let earR: THREE.Object3D | null = null;
    model.traverse((o) => {
      if (o.name === "head") head = o;
      else if (o.name === "ear01_L") earL = o;
      else if (o.name === "ear01_R") earR = o;
    });
    headRef.current = head;
    earLRef.current = earL;
    earRRef.current = earR;
  }, [social, model]);

  useEffect(() => {
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      // Animals cast onto the ground and the logs, but do NOT receive. A ~1000-triangle
      // body self-shadowing from a shadow map produces hard-edged patches across the
      // fur that read as faceting, and in a scene lit almost entirely by one close
      // firelight there is nothing meaningful for them to receive anyway.
      mesh.receiveShadow = false;
      if (!mesh.material) return;

      const apply = (m: THREE.Material) => {
        const mat = m as THREE.Material & { flatShading?: boolean; map?: THREE.Texture | null };
        let dirty = false;

        // The Wild Poly textures carry a junk alpha channel (~40% of pixels below
        // full opacity). Any material exported with alphaMode BLEND therefore renders
        // the animal semi-transparent, AND glTF's BLEND path sets depthWrite=false,
        // so the mesh stops occluding itself - faces show through each other and
        // props sink into limbs. Force opaque; nothing in this scene needs per-pixel
        // alpha on an animal.
        if (mat.transparent) { mat.transparent = false; dirty = true; }
        if (!mat.depthWrite) { mat.depthWrite = true; dirty = true; }
        if (mat.alphaTest !== 0) { mat.alphaTest = 0; dirty = true; }

        // The pack's texture holds LINEAR values but the glTF tags it sRGB, so three
        // decodes it a second time and the animal comes out dark red-brown instead of
        // its real tan. Measured against the vendor render: as-sRGB gives an R:G:B
        // ratio of 1:0.35:0.21, as-linear 1:0.60:0.47, reference 1:0.69:0.58.
        if (mat.map && mat.map.colorSpace !== THREE.LinearSRGBColorSpace) {
          mat.map.colorSpace = THREE.LinearSRGBColorSpace;
          mat.map.needsUpdate = true;
          dirty = true;
        }

        if (placement.flatShading && mat.flatShading !== true) {
          mat.flatShading = true;
          dirty = true;
        }
        if (dirty) mat.needsUpdate = true;
      };

      if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
      else apply(mesh.material);
    });
  }, [model, placement.flatShading]);

  useEffect(() => {
    if (!placement.animation || !actions) return;
    const target = placement.animation;
    const key =
      (actions[target] ? target : undefined) ??
      actionNames.find((n) => n.toLowerCase().endsWith("|" + target.toLowerCase())) ??
      actionNames.find((n) => n.toLowerCase().includes(target.toLowerCase())) ??
      actionNames[0];
    if (!key) return;
    const action = actions[key];
    if (!action) return;
    const bearPose = placement.bearId ? BEAR_POSES[placement.bearId] : undefined;
    const holdFrame = placement.animationHoldFrame ?? (bearPose?.paused ? bearPose.frame ?? 0 : null);

    // A different model object under the same mixer root (a dev hot reload
    // re-clones it): drei's cached bindings still point at the OLD
    // skeleton's bones, so the mixer would animate an invisible model and
    // leave this one in its bind pose - the T-pose after every lab slider
    // change. Make them look their bones up again. See rebindMixer.ts.
    const root = groupRef.current;
    if (boundModelRef.current && boundModelRef.current !== model && root) {
      rebindMixerRoot(mixer, root);
    }
    boundModelRef.current = model;

    // Same action already running - keep playing, don't restart. Prevents the
    // T-pose flash that comes from fadeIn(0.3) starting at weight=0 whenever
    // an unrelated dep (autosave HMR, config change) re-fires this effect.
    if (currentActionRef.current === action && action.isRunning()) {
      if (holdFrame != null) {
        action.time = holdFrame / 24;
        action.timeScale = 0;
        action.paused = true;
      } else {
        action.paused = false;
        action.timeScale = placement.animationSpeed ?? 1;
        action.setEffectiveWeight(1);
      }
      return;
    }

    // Different action (or first mount): swap without fading. Instant weight=1
    // keeps the mixer at full authority frame-to-frame; no windows where the
    // mixer output is partial and the bones drift toward bind pose.
    const previous = currentActionRef.current;
    if (previous && previous !== action) previous.stop();

    action.reset();
    // Whether a bear holds one frame is the LAB's call, not the placement's.
    // /scene-lab/bear-pose stores `paused` + `frame` per bear and previews the
    // pose at exactly that frame (mixer.setTime(frame / 24)). The site was
    // ignoring both and free-running the clip, so a pose authored against a
    // held frame looked nothing like the lab once sit_log swung the arms on.
    // animationHoldFrame stays as an explicit override for non-bear animals.
    if (holdFrame != null) {
      // Freeze on a single frame - assume 24 fps like the lab, evaluate the
      // clip once, then park timeScale at 0 so the mixer keeps writing but
      // never advances. That's cheaper than stop() + setTime dance and
      // survives HMR without falling back to bind pose.
      action.time = holdFrame / 24;
      action.timeScale = 0;
      action.setEffectiveWeight(1);
      action.play();
      action.paused = true;
    } else {
      action.time = placement.animationOffset ?? 0;
      action.timeScale = placement.animationSpeed ?? 1;
      action.setEffectiveWeight(1);
      action.play();
    }
    currentActionRef.current = action;
    // No cleanup fadeOut - if this effect re-fires with the same action it
    // will hit the "already running" fast path above and leave state alone.
    // The mixer/action are owned by useAnimations and torn down on unmount.
  }, [actions, actionNames, mixer, model, placement.animation, placement.animationOffset, placement.animationSpeed, placement.animationHoldFrame, placement.bearId]);

  // Publish this animal's clips + chosen clip to the duplicate registry so a
  // clone of this bear can keep animating instead of freezing on snapshot.
  useEffect(() => {
    if (!placement.animation || !gltf.animations?.length) return;
    registerDuplicateAnimation(name, {
      clips: gltf.animations,
      clipName: placement.animation,
      offset: placement.animationOffset,
      speed: placement.animationSpeed,
    });
    return () => { unregisterDuplicateAnimation(name); };
  }, [name, gltf.animations, placement.animation, placement.animationOffset, placement.animationSpeed]);

  useFrame((frameState, delta) => {
    if (!groupRef.current) return;
    const c = configRef.current;
    const o = c.objectOverrides?.[name] ?? EMPTY_OVERRIDE;
    const s = placement.scale * c.animalScale * o.scale;
    const seat = BENCH_MODELS[placement.bench ?? 0] ?? OLD_LOG;
    const baseY = placement.sitOnBench ? seat.top * c.benchScale : y;
    groupRef.current.position.set(
      x * c.animalSpread + c.animalX + o.dx,
      baseY + c.animalY + o.dy,
      z + c.animalZ + o.dz
    );
    groupRef.current.rotation.set(o.rotX, placement.rotationY + o.rotY, o.rotZ, "XZY");
    groupRef.current.scale.set(s, s, s);

    // Cub idle: subtle head bob + ear twitch. Multiplies onto the baked rest quaternion
    // so it composes with any pose baked into cub.glb.
    if (placement.url === CUB_URL) {
      cubIdleTime.current += 1 / 60;
      const t = cubIdleTime.current;
      const head = cubHeadBoneRef.current;
      const headRest = cubHeadRestQ.current;
      if (head && headRest) {
        const bobPitch = Math.sin(t * 0.9) * 0.06;
        const bobYaw = Math.sin(t * 0.55 + 1.7) * 0.08;
        const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(bobPitch, bobYaw, 0, "XYZ"));
        head.quaternion.copy(headRest).multiply(dq);
      }
      const twitch = (base: THREE.Object3D | null, rest: THREE.Quaternion | null, phase: number) => {
        if (!base || !rest) return;
        // Occasional flick: mostly still, brief jerk
        const cycle = ((t + phase) % 4.5) / 4.5;
        const jerk = cycle < 0.06 ? Math.sin(cycle / 0.06 * Math.PI) * 0.25 : 0;
        const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(jerk, 0, 0, "XYZ"));
        base.quaternion.copy(rest).multiply(dq);
      };
      twitch(cubEarLRef.current, cubEarLRestQ.current, 0);
      twitch(cubEarRRef.current, cubEarRRestQ.current, 2.1);
    }

    // Bear pose no longer applied at runtime - baked into per-bear GLBs
    // by /api/dev/bake-bear-pose. The mixer plays sit_log; posed bones sit
    // at their rest*delta value for every frame thanks to constant fcurves.

    // Food socket damping - fish-holder bears can dial down how much the
    // socket rotates with sit_log's paw wag. The prop is parented to Food,
    // so slerping Food's quaternion back toward rest steadies the fish
    // without touching the rest of the bear's animation.
    if (placement.bearId && !placement.banjoPlayer) {
      const prop = BEAR_POSES[placement.bearId]?.prop;
      const foodScale = prop?.foodRotationScale;
      if (foodScale != null && foodScale !== 1 && foodBoneRef.current && foodRestQRef.current) {
        const s = Math.max(0, Math.min(1, foodScale));
        (foodBoneRef.current as THREE.Bone).quaternion.slerp(foodRestQRef.current, 1 - s);
      }
      // Damp the wrists toward their AUTHORED pose (rest * delta), not toward
      // raw bind. bake_bear_pose.py layers each hand_L / hand_R delta into
      // every sit_log keyframe, so slerping to bind here pulled
      // (1 - handRotationScale) of that angle back out and the wrist could
      // never hold a pose unless the slider sat at exactly 1. Mirrors the same
      // fix in BearPoseLab so the lab preview and the site agree.
      const handScale = prop?.handRotationScale;
      if (handScale != null && handScale !== 1) {
        const t = 1 - Math.max(0, Math.min(1, handScale));
        const poseBones = BEAR_POSES[placement.bearId]?.bones;
        const dampWrist = (
          bone: THREE.Object3D | null,
          rest: THREE.Quaternion | null,
          name: string
        ) => {
          if (!bone || !rest) return;
          HAND_TARGET_Q.copy(rest);
          const adj = poseBones?.[name];
          if (adj) {
            HAND_DELTA_E.set(adj.rx, adj.ry, adj.rz, "XYZ");
            HAND_TARGET_Q.multiply(HAND_DELTA_Q.setFromEuler(HAND_DELTA_E));
          }
          (bone as THREE.Bone).quaternion.slerp(HAND_TARGET_Q, t);
        };
        dampWrist(handLRef.current, handLRestQRef.current, "hand_L");
        dampWrist(handRRef.current, handRRestQRef.current, "hand_R");
      }
    }

    // Banjo-bear arm pose. Runs after drei's mixer for the same reason cub
    // idle does - useAnimations subscribes first, so our per-bone writes here
    // land on top and hard-replace whatever the sit_log clip put on the arms.
    // Pose comes from /scene-lab/banjo-bear (banjoBearPose.json) so what the
    // lab authors is what the site renders.
    if (placement.banjoPlayer) {
      // Freeze Food (banjo socket) to the sampled sit_log frame so the banjo
      // stays in the paw instead of tracing sit_log's paw path.
      const food = banjoFoodRef.current;
      if (food && banjoFoodPos.current && banjoFoodQuat.current && banjoFoodScale.current) {
        food.position.copy(banjoFoodPos.current);
        food.quaternion.copy(banjoFoodQuat.current);
        food.scale.copy(banjoFoodScale.current);
      }
      const applyArm = (name: BanjoBearArmName) => {
        const b = banjoBonesRef.current[name];
        const rest = banjoRestQRef.current[name];
        if (!b || !rest) return;
        const r = BANJO_BEAR_POSE.arms[name];
        const eu = new THREE.Euler(r.x, r.y, r.z, "XYZ");
        const dq = new THREE.Quaternion().setFromEuler(eu);
        b.quaternion.copy(rest).multiply(dq);
      };

      applyArm("shoulder_L");
      applyArm("upperarm_L");
      applyArm("arm_L");
      applyArm("hand_L");
      applyArm("shoulder_R");
      applyArm("upperarm_R");
      applyArm("arm_R");
      applyArm("hand_R");

      // Every performance control composes from the authored pose. At zero,
      // the manually placed paws, wrists, and hands are unchanged.
      const bpm = Number.isFinite(configRef.current.banjoPickingBpm)
        ? configRef.current.banjoPickingBpm
        : 96;
      const performanceTime = banjoTimeRef && banjoTimeRef.current > 0
        ? banjoTimeRef.current
        : performance.now() / 1000;
      const phase = performanceTime * bpm / 60 * Math.PI * 2;
      const { fretPressure: fretPress, pickCurl } = getBanjoFingerPhase(performanceTime, bpm);
      const pickAmount = Number.isFinite(configRef.current.banjoPickingAmount)
        ? configRef.current.banjoPickingAmount
        : 0;
      const wristPitch = Number.isFinite(configRef.current.banjoPickingWristPitch)
        ? configRef.current.banjoPickingWristPitch
        : 0;
      const wristRoll = Number.isFinite(configRef.current.banjoPickingWristRoll)
        ? configRef.current.banjoPickingWristRoll
        : 0;
      const fretAmount = Number.isFinite(configRef.current.banjoFretFingerAmount)
        ? configRef.current.banjoFretFingerAmount
        : 0;
      const handR = banjoBonesRef.current.hand_R;
      if (handR && (pickAmount > 0 || wristPitch > 0 || wristRoll > 0)) {
        HAND_DELTA_E.set(
          -pickCurl * (0.055 * pickAmount + 0.028 * wristPitch),
          Math.sin(phase) * 0.025 * pickAmount,
          Math.sin(phase) * (0.045 * pickAmount + 0.014 * wristRoll),
          "XYZ",
        );
        handR.quaternion.multiply(HAND_DELTA_Q.setFromEuler(HAND_DELTA_E));
      }
      const pickFinger = banjoFingerRRef.current;
      const pickFingerRest = banjoFingerRRestQRef.current;
      if (pickFinger && pickFingerRest && pickAmount > 0) {
        HAND_DELTA_E.set(-pickCurl * 0.34 * pickAmount, 0, pickCurl * 0.12 * pickAmount, "XYZ");
        pickFinger.quaternion.copy(pickFingerRest).multiply(HAND_DELTA_Q.setFromEuler(HAND_DELTA_E));
      }
      const fretFinger = banjoFingerLRef.current;
      const fretFingerRest = banjoFingerLRestQRef.current;
      if (fretFinger && fretFingerRest && fretAmount > 0) {
        HAND_DELTA_E.set(-fretPress * 0.08 * fretAmount, 0, 0, "XYZ");
        fretFinger.quaternion.copy(fretFingerRest).multiply(HAND_DELTA_Q.setFromEuler(HAND_DELTA_E));
      }

    }

    // Rocking-chair bear full-body pose. Unlike the banjo arms above (which
    // hard-replace, freezing those bones dead still), this layers a RELATIVE
    // delta on top of whatever sit_log's mixer already wrote this frame:
    // quaternion.multiply (not copy-then-multiply-from-rest), so a bone left
    // at rx=ry=rz=0 keeps animating normally. Scale is set directly against
    // this bone's own rest scale (component-wise, so scale-1 is also a true
    // no-op) - sy is the one that actually changes a limb's LENGTH, since
    // every child joint in this rig sits at a fixed offset along its parent's
    // local +Y; sx/sz just thicken it. Gated on the JSON's own `enabled` flag
    // so flipping it off in rockingChairBearPose.json (or from the lab) drops
    // straight back to whatever sit_log does natively, no code change needed.
    // Rocking-chair bear keeps his feet planted: put the legs back to one
    // frame of sit_log before any pose layer goes on (rockingChair.ts).
    if (placement.rockingChairPose && legLockRef.current) applyLegLock(legLockRef.current);
    if (placement.rockingChairPose && ROCKING_CHAIR_BEAR_POSE.enabled) {
      const applyPart = (name: RockingChairBoneName) => {
        const b = chairBonesRef.current[name];
        const restS = chairRestSRef.current[name];
        const r = ROCKING_CHAIR_BEAR_POSE.parts[name];
        if (!b || !restS || !r) return;
        const eu = new THREE.Euler(r.rx, r.ry, r.rz, "XYZ");
        const dq = new THREE.Quaternion().setFromEuler(eu);
        b.quaternion.multiply(dq);
        b.scale.set(restS.x * r.sx, restS.y * r.sy, restS.z * r.sz);
      };
      for (const name of ROCKING_CHAIR_BONE_NAMES) applyPart(name);
    }
    // How he sits (recline / hunch / head), from the rocking-chair lab's
    // "Posture" section - see rockingPosture.ts - swaying with the chair:
    // leaning back as it tips back, hunching forward as it comes forward.
    // Same clock as RockingChairRig, so he and the chair stay in step.
    if (placement.rockingChairPose) {
      const body = rockState(frameState.clock.elapsedTime, ROCKING_CHAIR_ROCK).body;
      const p = rockPosture(ROCKING_CHAIR_POSTURE, body, ROCKING_CHAIR_ROCK, rockPostureRef.current);
      applyRockingPosture(model, p, postureRef.current);
    }

    // ---- talking ------------------------------------------------------------
    // Mouth: three continuous channels (open / wide / round) from the shared
    // lip-sync analyser (src/lib/bearLipSync.ts), each eased with its own
    // attack/release - jaw snaps open and closes a bit slower, lip SHAPE lags
    // the jaw - plus a little per-syllable size variation.
    // Body (research notes in bearLipSync.ts): the head follows voice PITCH
    // (visual prosody), nods and torso beats fire only on ACCENTED syllables
    // with size scaled by prominence, the torso springs slower than the head
    // so it overlaps rather than moving in lockstep, a breath swells the chest
    // at phrase starts, and the listening bear answers accents with delayed
    // "mm-hm" nods. Every amount is a bearTalk* knob in the lab ("Bear
    // talking" group). All of it writes after the mixer, so sit_log keeps
    // playing underneath.
    const voice = bearVoiceRef?.current;
    const talk = talkRef.current;
    const face = faceMeshRef.current;
    const k = configRef.current;
    const knob = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);
    const dtTalk = Math.min(delta, 0.1);
    talk.t += dtTalk;
    const isVoiceBear = placement.bearId === "back_left_log" || placement.bearId === "back_right_log";
    const speaking = Boolean(isVoiceBear && voice?.isRemoteSpeaking && placement.bearId === voice.activeBearId);
    const listening = Boolean(isVoiceBear && voice?.isRemoteSpeaking && placement.bearId !== voice.activeBearId);
    const ease = (cur: number, target: number, up: number, down: number) =>
      cur + (target - cur) * (1 - Math.exp(-(target > cur ? up : down) * dtTalk));

    // every syllable: size variation + a tiny beat on the head
    const syl = voice?.syllable ?? 0;
    if (speaking && talk.lastSyllable >= 0 && syl !== talk.lastSyllable) {
      const strength = voice?.syllableStrength ?? 0.5;
      talk.gain = 0.82 + talkRng() * 0.3 + strength * 0.18;
      talk.nodVel += (0.15 + strength * 0.2) * knob(k.bearTalkBeat, 1);
    }
    talk.lastSyllable = syl; // also resyncs while silent so a stale count never fires a burst

    // accented syllables only: the real nod, a torso beat, maybe a blink / ear
    // flick - and a delayed backchannel nod from whoever is listening
    const acc = voice?.accent ?? 0;
    if (talk.lastAccent >= 0 && acc !== talk.lastAccent && voice?.isRemoteSpeaking) {
      const a = voice.accentStrength ?? 0.5;
      if (speaking) {
        talk.nodVel += (0.55 + 1.3 * a) * knob(k.bearTalkNod, 1);
        if (a > 0.5 && talk.blinkT < 0 && talkRng() < 0.35) { talk.blinkT = 0; talk.doubleBlink = false; }
        if (a > 0.4 && talk.ear < 0.2) talk.ear = 1;
      } else if (listening && talk.backchannelIn < 0 && talkRng() < 0.4) {
        talk.backchannelIn = 0.35 + talkRng() * 0.35;
      }
    }
    talk.lastAccent = acc;
    if (talk.backchannelIn >= 0) {
      talk.backchannelIn -= dtTalk;
      if (talk.backchannelIn < 0) talk.listenVel += (0.3 + talkRng() * 0.2) * knob(k.bearTalkListener, 1);
    }

    talk.silentFor = speaking ? 0 : talk.silentFor + dtTalk;
    talk.wasSpeaking = speaking;
    talk.ear = Math.max(0, talk.ear - dtTalk / 0.28);

    // listener: occasional slow nods of its own, on a softer ~0.9Hz spring
    if (listening) {
      talk.listenClock -= dtTalk;
      if (talk.listenClock <= 0) {
        talk.listenVel += (0.2 + talkRng() * 0.18) * knob(k.bearTalkListener, 1);
        talk.listenClock = 3 + talkRng() * 4;
      }
    } else {
      talk.listenClock = 1 + talkRng() * 1.5;
    }

    // mouth channels
    let rawOpen = 0, rawWide = 0, rawRound = 0;
    const fishReaction = fishReactionRef?.current;
    if (isVoiceBear && (fishReaction?.phase === "fire" || fishReaction?.phase === "partner")) {
      rawOpen = Math.max(0, knob(k.bearFishJawAmount, 1));
      rawWide = 0.35;
    } else if (speaking && voice) {
      if (voice.mouthOpen !== undefined) {
        rawOpen = voice.mouthOpen;
        rawWide = voice.mouthWide ?? 0;
        rawRound = voice.mouthRound ?? 0;
      } else {
        const rms = voice.remoteAudioLevel ?? 0;   // older hook: loudness only
        rawOpen = rms > 0.01 ? Math.min(1, (rms - 0.01) / 0.045) : 0;
      }
    }
    const openUp = knob(k.bearTalkOpenSpeed, 32), openDown = knob(k.bearTalkCloseSpeed, 15);
    const shapeSpeed = knob(k.bearTalkShapeSpeed, 12);
    // small deadzone: breath/noise-floor flicker shouldn't buzz the jaw
    const openIn = rawOpen < 0.04 ? 0 : rawOpen;
    // Two-pole (cascaded) smoothing: the analyser's wide/round jump by up to
    // ~1.0 frame to frame on real speech, and a single exponential passes that
    // straight through as a lip-corner shiver. Measured on recorded speech,
    // the cascade cuts peak frame-to-frame acceleration ~2.5-3x on wide/round
    // (~25% on the jaw) with the same peaks and the same syllable closures.
    // Stage rates are 1.6x the knob so the overall speed still matches it.
    const c2 = 1.6;
    talk.openPre = ease(talk.openPre, Math.min(1, openIn * talk.gain * knob(k.bearTalkJawGain, 1)), openUp * c2, openDown * c2);
    talk.open = ease(talk.open, talk.openPre, openUp * c2, openDown * c2);
    talk.widePre = ease(talk.widePre, rawWide, shapeSpeed * c2, shapeSpeed * 0.66 * c2);
    talk.wide = ease(talk.wide, talk.widePre, shapeSpeed * c2, shapeSpeed * 0.66 * c2);
    talk.roundPre = ease(talk.roundPre, rawRound, shapeSpeed * c2, shapeSpeed * 0.66 * c2);
    talk.round = ease(talk.round, talk.roundPre, shapeSpeed * c2, shapeSpeed * 0.66 * c2);
    talk.speak = ease(talk.speak, speaking ? 1 : 0, 4, 2);

    // head: pitch-follow (higher voice -> chin up; research says F0 is what
    // head motion tracks most), eased so it glides rather than jitters
    const liftTarget = speaking
      ? -Math.max(-0.5, Math.min(1, (voice?.pitch ?? 0) / 8)) * 0.07 * knob(k.bearTalkPitchHead, 1)
      : 0;
    talk.headLift = ease(talk.headLift, liftTarget, 7, 4);

    const nodSpring = clampSpring(stepSpring({ value: talk.nod, velocity: talk.nodVel }, 0, 90, 11, dtTalk), -0.12, 0.22);
    const listenSpring = clampSpring(stepSpring({ value: talk.listen, velocity: talk.listenVel }, 0, 30, 6, dtTalk), -0.08, 0.14);
    talk.nod = nodSpring.value;
    talk.nodVel = Math.max(-6, Math.min(6, nodSpring.velocity));
    talk.listen = listenSpring.value;
    talk.listenVel = Math.max(-4, Math.min(4, listenSpring.velocity));
    talk.headLift = Number.isFinite(talk.headLift) ? Math.max(-0.1, Math.min(0.06, talk.headLift)) : 0;
    talk.open = Number.isFinite(talk.open) ? Math.max(0, Math.min(1, talk.open)) : 0;
    talk.wide = Number.isFinite(talk.wide) ? Math.max(0, Math.min(1, talk.wide)) : 0;
    talk.round = Number.isFinite(talk.round) ? Math.max(0, Math.min(1, talk.round)) : 0;

    // blink: idle rhythm every ~2.5-7s (a touch faster while talking),
    // occasionally a double blink. 60ms close, 30ms hold, 90ms open.
    let blink = 0;
    const blinkRate = Math.max(0, knob(k.bearBlinkRate, 1));
    if (talk.blinkT < 0 && blinkRate > 0) {
      talk.blinkClock -= dtTalk * blinkRate;
      if (talk.blinkClock <= 0) {
        talk.blinkT = 0;
        talk.doubleBlink = talkRng() < 0.15;
        talk.blinkClock = speaking ? 1.8 + talkRng() * 2.8 : 2.5 + talkRng() * 4.5;
      }
    }
    if (talk.blinkT >= 0) {
      const b = talk.blinkT;
      blink = b < 0.06 ? b / 0.06 : b < 0.09 ? 1 : b < 0.18 ? 1 - (b - 0.09) / 0.09 : 0;
      talk.blinkT += dtTalk;
      if (talk.blinkT >= 0.18) {
        if (talk.doubleBlink) { talk.doubleBlink = false; talk.blinkT = -0.0001; talk.blinkClock = 0.08; }
        else talk.blinkT = -1;
      }
    }

    const rig = mouthRigRef.current;
    if (rig) {
      // Bone-driven mouth (rig research in scripts/add_bear_mouth_rig.py):
      //  jaw        - hinge rotation about the head's right axis + a small
      //               forward/down slide coupled to it (the condyle translates
      //               as well as rotates when a real jaw opens)
      //  lip_lower  - rides the jaw; held sealed up against the upper lip at
      //               rest ("lip seal"), releasing as the jaw opens; pouts
      //               forward for oo/w
      //  lip_upper  - lifts a touch on open/ee vowels, pushes forward on oo
      //  corners    - out/back/up for ee/s (wide), in/forward for oo (round);
      //               they also follow ~50% of the jaw through their weights
      const openShape = Math.min(1, talk.open * 1.5);
      let wide = talk.wide * (0.35 + 0.65 * openShape) * knob(k.bearTalkWide, 1);
      let round = talk.round * (0.45 + 0.55 * openShape) * knob(k.bearTalkRound, 1);
      if (wide + round > 1) { const n = 1 / (wide + round); wide *= n; round *= n; }
      wide = Math.min(1, wide); round = Math.min(1, round);
      const lips = Math.max(0, knob(k.bearTalkLips, 1));
      const sealStart = Math.max(0, Math.min(0.8, knob(k.bearMouthSealStart, 0.04)));
      const sealEnd = Math.max(sealStart + 0.01, Math.min(1, knob(k.bearMouthSealEnd, 0.48)));
      const sealT = Math.max(0, Math.min(1, (talk.open - sealStart) / (sealEnd - sealStart)));
      const sealRelease = sealT * sealT * (3 - 2 * sealT);
      const seal = Math.max(0, knob(k.bearMouthRestSeal, 1)) * (1 - sealRelease);
      const jawAngle = Math.max(-0.03,
        talk.open * 0.35 * knob(k.bearTalkJawMax, 0.9) * (1 - 0.25 * round) - 0.015 * seal);
      const R = rig.restPos, Q = rig.restQ, b = rig.bones;
      const q = mouthTmpQ, v = mouthTmpV;

      b.jaw.quaternion.copy(Q.jaw).multiply(q.setFromAxisAngle(FACE_RIGHT_LOCAL, jawAngle));
      b.jaw.position.copy(R.jaw)
        .addScaledVector(FACE_FWD_LOCAL, 0.006 * talk.open)
        .addScaledVector(FACE_UP_LOCAL, -0.003 * talk.open);

      b.lip_lower.quaternion.copy(Q.lip_lower).multiply(q.setFromAxisAngle(FACE_RIGHT_LOCAL, -0.10 * seal - 0.05 * round * lips));
      b.lip_lower.position.copy(R.lip_lower).addScaledVector(FACE_FWD_LOCAL, 0.012 * round * lips);

      b.lip_upper.quaternion.copy(Q.lip_upper);
      b.lip_upper.position.copy(R.lip_upper)
        .addScaledVector(FACE_UP_LOCAL, (0.005 * talk.open + 0.003 * wide) * lips)
        .addScaledVector(FACE_FWD_LOCAL, 0.013 * round * lips);

      for (const side of [1, -1] as const) {
        const cb = side > 0 ? b.lip_corner_L : b.lip_corner_R;
        const rp = side > 0 ? R.lip_corner_L : R.lip_corner_R;
        const rq = side > 0 ? Q.lip_corner_L : Q.lip_corner_R;
        cb.quaternion.copy(rq);
        cb.position.copy(rp)
          .addScaledVector(v.copy(FACE_RIGHT_LOCAL), side * (0.026 * wide - 0.028 * round) * lips)
          .addScaledVector(FACE_UP_LOCAL, 0.006 * wide * lips)
          .addScaledVector(FACE_FWD_LOCAL, (-0.012 * wide + 0.015 * round) * lips);
      }
      if (face) {
        // Bones provide the primary motion; the authored shapes restore soft
        // muzzle volume and lip contours that a rigid jaw cannot provide alone.
        const corrective = knob(k.bearTalkJawCorrective, 0.2);
        const shapeCorrective = knob(k.bearTalkShapeCorrective, 0.35);
        const openShape = Math.min(1, talk.open * 1.5);
        face.influences[face.jaw] = Math.min(1, openShape * knob(k.bearTalkJawMax, 0.9) * corrective);
        if (face.wide >= 0) face.influences[face.wide] = Math.min(1, wide * shapeCorrective);
        if (face.round >= 0) face.influences[face.round] = Math.min(1, round * shapeCorrective);
        if (face.blink >= 0) face.influences[face.blink] = blink;
      }
    } else if (face) {
      const inf = face.influences;
      const openShape = Math.min(1, talk.open * 1.5);
      let wide = talk.wide * (0.35 + 0.65 * openShape) * knob(k.bearTalkWide, 1);
      let round = talk.round * (0.45 + 0.55 * openShape) * knob(k.bearTalkRound, 1);
      if (wide + round > 1) { const n = 1 / (wide + round); wide *= n; round *= n; }
      // jawMax caps the authored jawOpen shape (1 = the full Blender roar);
      // a pucker pulls the jaw in a little (lips round over a narrower opening).
      inf[face.jaw] = Math.min(1, talk.open * knob(k.bearTalkJawMax, 0.9) * (1 - 0.25 * round));
      if (face.wide >= 0) inf[face.wide] = Math.min(1, wide);
      if (face.round >= 0) inf[face.round] = Math.min(1, round);
      if (face.blink >= 0) inf[face.blink] = blink;
    } else {
      // Fallback for a GLB without the face morphs: the old jaw-bone tilt,
      // with a usable range this time (the mouth bone only owns the 31-vertex
      // lower-lip flap, so 0.075rad was invisible).
      const mouth = mouthBoneRef.current;
      if (mouth) {
        mouthEnvelopeRef.current = talk.open;
        mouthMixerQRef.current.copy(mouth.quaternion);
        mouthJawQRef.current.setFromAxisAngle(FACE_RIGHT_LOCAL, mouthEnvelopeRef.current * 0.35 * knob(k.bearTalkJawMax, 0.9) / 0.9);
        mouth.quaternion.copy(mouthMixerQRef.current).multiply(mouthJawQRef.current);
      }
    }
  });

  // Runs after drei's mixer update - useAnimations subscribes its useFrame before
  // this one, and R3F runs same-priority callbacks in subscription order - so this
  // layers on top of the clip instead of being overwritten by it.
  useFrame((state, delta) => {
    if (!social || !groupRef.current || !headRef.current || !heads?.current) return;
    const head = headRef.current;
    const reg = heads.current;
    const dt = Math.min(delta, 1 / 20);

    groupRef.current.updateMatrixWorld(true);
    head.getWorldPosition(tmpV);
    const entry = reg.get(name) ?? { position: new THREE.Vector3() };
    entry.bearId = placement.bearId;
    entry.position.copy(tmpV);
    reg.set(name, entry);

    const g = glance.current;
    const voice = bearVoiceRef?.current;
    const isVoiceBear = placement.bearId === "back_left_log" || placement.bearId === "back_right_log";
    let tgt: THREE.Vector3 | undefined;
    let targetWeight = 0;

    const fishReaction = fishReactionRef?.current;
    const reactingToFish = isVoiceBear && fishReaction && fishReaction.phase !== "idle";
    if (reactingToFish) {
      // The fish gag, in order: eyes follow the fish through the air, snap to
      // the fire where it lands, the jaws drop, they turn and stare at EACH
      // OTHER, then look back at you. Every target is a real world position
      // (the fish, the impact point, the other bear's head, the camera); the
      // lab's X/Y/Z knobs only nudge the first two.
      g.phase = "wait"; g.t = 0; g.w = 0; g.target = "";
      const kc0 = configRef.current;
      const kn0 = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);
      const me = placement.bearId;
      const other = me === "back_left_log" ? "back_right_log" : "back_left_log";
      const otherHead = [...reg.values()].find((entry) => entry.bearId === other)?.position;
      let desired: THREE.Vector3;
      if (fishReaction.phase === "partner" && otherHead) {
        desired = otherHead;
      } else if (fishReaction.phase === "return") {
        desired = tmpV2.copy(state.camera.position);
        desired.y += kn0(kc0.bearLookUserYOffset, -0.2);
      } else if (fishReaction.phase === "flying") {
        // each bear has its own nudge - they sit on opposite sides of the fire
        desired = tmpV2.copy(fishReaction.target).add(me === "back_right_log"
          ? fishLookEnd.set(kn0(kc0.bearFishFlightLookRX, 0), kn0(kc0.bearFishFlightLookRY, 0), kn0(kc0.bearFishFlightLookRZ, 0))
          : fishLookEnd.set(kn0(kc0.bearFishFlightLookX, 0), kn0(kc0.bearFishFlightLookY, 0), kn0(kc0.bearFishFlightLookZ, 0)));
      } else {
        // impact-delay and fire: the spot it went in
        desired = tmpV2.copy(fishReaction.target).add(me === "back_right_log"
          ? fishLookEnd.set(kn0(kc0.bearFishFireLookRX, 0), kn0(kc0.bearFishFireLookRY, -0.2), kn0(kc0.bearFishFireLookRZ, 0))
          : fishLookEnd.set(kn0(kc0.bearFishFireLookX, 0), kn0(kc0.bearFishFireLookY, -0.2), kn0(kc0.bearFishFireLookZ, 0)));
      }
      if (!lookRef.current.init) {
        lookRef.current.target.copy(desired);
        lookRef.current.init = true;
      }
      // The gaze POINT glides (so heads turn instead of snapping); the head
      // then aims fully at that point every frame. The old code instead eased
      // the head itself by ~2% a frame - but the clip rewrites the head every
      // frame, so that never added up and they barely moved.
      const turn = Math.max(0.03, fishReaction.phase === "flying"
        ? kn0(kc0.bearFishFlightTurnTime, 0.12)
        : kn0(kc0.bearFishFireTurnTime, 0.3));
      lookRef.current.target.lerp(desired, 1 - Math.exp(-dt / turn));
      tgt = lookRef.current.target;
      targetWeight = 1;
    } else if (isVoiceBear) {
      // Scripted conversational gaze for the two voice bears (replaces their
      // random social glances):
      //   Smokey (back_left_log): faces the user; looks over at Maple while
      //     Maple is talking.
      //   Maple (back_right_log): looks at Smokey while Smokey talks AND while
      //     replying; faces the user the rest of the time.
      // A conversational look is held ~1.2s through the short gaps between
      // sentences so heads don't ping-pong on every pause, and the target
      // point itself glides (bearLookTurnTime) so the head turns rather than
      // snaps.
      g.phase = "wait"; g.t = 0; g.w = 0; g.target = "";
      const kc0 = configRef.current;
      const me = placement.bearId;
      const other = me === "back_left_log" ? "back_right_log" : "back_left_log";
      const speakerId = voice?.isRemoteSpeaking ? voice.activeBearId : null;
      const look = lookRef.current;
      const partnerDelay = Math.max(0, Number.isFinite(kc0.bearLookPartnerDelay) ? kc0.bearLookPartnerDelay : 0.08);
      let wantOther: boolean;
      let wantFish = false;
      if (speakerId) {
        const wantsOther = speakerId === other || (speakerId === me && me === "back_right_log");
        if (wantsOther && !look.partnerRequested) {
          look.partnerRequested = true;
          look.otherDelay = partnerDelay;
        }
        if (!wantsOther) {
          look.partnerRequested = false;
          look.otherDelay = 0;
        }
        if (look.otherDelay > 0) {
          look.otherDelay = Math.max(0, look.otherDelay - dt);
          wantOther = false;
        } else {
          wantOther = wantsOther;
        }
        look.hold = wantOther ? 1.2 : 0;
        look.fishHold = 0;
      } else if (look.hold > 0) {
        look.hold -= dt;
        wantOther = look.wantOther;
        wantFish = look.wantFish;
      } else {
        look.partnerRequested = false;
        look.otherDelay = 0;
        wantOther = false;
        if (me === "back_right_log") {
          look.fishCooldown -= dt;
          if (look.fishHold <= 0 && look.fishCooldown <= 0) {
            look.fishHold = Math.max(0.2, Number.isFinite(kc0.bearFishIdleLookTime) ? kc0.bearFishIdleLookTime : 2);
            look.fishCooldown = Math.max(1, Number.isFinite(kc0.bearFishIdleInterval) ? kc0.bearFishIdleInterval : 6);
          }
          if (look.fishHold > 0) {
            look.fishHold -= dt;
            wantFish = true;
          }
        }
      }
      look.wantOther = wantOther;
      look.wantFish = wantFish;
      const otherHead = wantOther
        ? [...reg.values()].find((c) => c.bearId === other)?.position
        : undefined;
      const fishPosition = wantFish ? reg.get(name)?.fishPosition : undefined;
      const desired = otherHead
        ?? (fishPosition
          ? tmpV2.copy(fishPosition).setY(
            fishPosition.y + (Number.isFinite(kc0.bearFishIdleGazeYOffset) ? kc0.bearFishIdleGazeYOffset : -1.2),
          )
          : tmpV2.copy(state.camera.position));
      if (!otherHead && !fishPosition) {
        desired.y += Number.isFinite(kc0.bearLookUserYOffset) ? kc0.bearLookUserYOffset : -0.2;
      }
      if (!look.init) { look.target.copy(desired); look.init = true; }
      const turn = Math.max(0.05, Number.isFinite(kc0.bearLookTurnTime) ? kc0.bearLookTurnTime : 0.35);
      look.target.lerp(desired, 1 - Math.exp(-dt / turn));
      tgt = look.target;
      targetWeight = Math.max(0, Math.min(1, Number.isFinite(kc0.bearLookAmount) ? kc0.bearLookAmount : 0.85));
    } else {
      g.t += dt;
      if (g.phase === "wait" && g.t >= g.next) {
        const others = [...reg.keys()].filter((k) => k !== name);
        if (others.length) {
          g.target = others[Math.floor(rng() * others.length)];
          g.phase = "turn";
          g.t = 0;
        } else {
          g.t = 0;
        }
      }
      else if (g.phase === "turn" && g.t >= 0.85) { g.phase = "hold"; g.t = 0; }
      else if (g.phase === "hold" && g.t >= 1.6 + rng() * 2.2) { g.phase = "back"; g.t = 0; }
      else if (g.phase === "back" && g.t >= 1.1) {
        g.phase = "wait"; g.t = 0; g.next = 4 + rng() * 6; g.target = "";
      }
      const smooth = (u: number) => u * u * (3 - 2 * u);
      const want =
        g.phase === "turn" ? smooth(Math.min(g.t / 0.85, 1)) :
        g.phase === "hold" ? 1 :
        g.phase === "back" ? 1 - smooth(Math.min(g.t / 1.1, 1)) : 0;
      g.w += (want - g.w) * Math.min(1, dt * 8);
      tgt = g.target ? reg.get(g.target)?.position : undefined;
      targetWeight = g.w;
    }

    if (tgt && targetWeight > 0.001) {
      // Rotate the face-forward vector onto the target, done in the head's PARENT
      // space so it is independent of however the clip has posed the head.
      const parent = head.parent;
      if (parent) {
        parent.updateMatrixWorld(true);
        parent.getWorldQuaternion(tmpQ);          // parent world rotation
        tmpQ.invert();

        head.getWorldPosition(tmpV);
        tmpV2.copy(tgt).sub(tmpV).normalize();     // desired forward, world
        tmpV2.applyQuaternion(tmpQ);               // -> parent space

        const cur = tmpV.copy(FACE_FWD_LOCAL).applyQuaternion(head.quaternion);
        const ang = cur.angleTo(tmpV2);
        // the fish gag gets a wider neck - they have to see each other
        const maxTurn = reactingToFish
          ? THREE.MathUtils.degToRad(Number.isFinite(configRef.current.bearFishMaxTurn) ? configRef.current.bearFishMaxTurn : 80)
          : MAX_GLANCE;
        if (ang > maxTurn) {
          // too far round to be plausible - only go as far as the neck allows
          tmpV2.copy(cur).lerp(tmpV2, maxTurn / ang).normalize();
        }
        tmpQ2.setFromUnitVectors(cur, tmpV2).multiply(head.quaternion);
        head.quaternion.slerp(tmpQ2, targetWeight);
      }
    }
    // Talking head and facial motion layer. Torso motion is intentionally disabled
    // until the rig has a dedicated upper-body control bone.
    const talk = talkRef.current;
    const speaking = Boolean(isVoiceBear && voice?.isRemoteSpeaking && placement.bearId === voice.activeBearId);
    const listening = Boolean(isVoiceBear && voice?.isRemoteSpeaking && placement.bearId !== voice.activeBearId);
    const kc = configRef.current;
    const kn = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);
    const tt = talk.t;
    const sway = talk.speak * kn(kc.bearTalkSway, 1);

    // Head: accent nods + tiny syllable beats (nod spring), pitch-follow lift,
    // listener nods, and a slow never-repeating drift while speaking
    // (incommensurate sines, so it never settles into a visible loop).
    if (talk.speak > 0.001 || Math.abs(talk.nod) > 1e-4 || Math.abs(talk.listen) > 1e-4 || Math.abs(talk.headLift) > 1e-4) {
      tmpQ.setFromAxisAngle(FACE_RIGHT_LOCAL, talk.nod + talk.listen + talk.headLift + sway * 0.012 * Math.sin(tt * 1.7 + 0.4));
      head.quaternion.multiply(tmpQ);
      tmpQ.setFromAxisAngle(FACE_UP_LOCAL, sway * (0.045 * Math.sin(tt * 0.83 + seed) + 0.02 * Math.sin(tt * 2.21)));
      head.quaternion.multiply(tmpQ);
      tmpQ.setFromAxisAngle(FACE_FWD_LOCAL, sway * 0.025 * Math.sin(tt * 1.31 + 1.1));
      head.quaternion.multiply(tmpQ);
    }

    // Quiet voice bears keep a small amount of life between lines without
    // changing the authored hands, prop, or torso pose.
    if (isVoiceBear && !speaking && !listening) {
      tmpQ.setFromAxisAngle(FACE_RIGHT_LOCAL, 0.012 * Math.sin(tt * 0.47 + seed));
      head.quaternion.multiply(tmpQ);
      tmpQ.setFromAxisAngle(FACE_UP_LOCAL, 0.014 * Math.sin(tt * 0.31 + seed * 1.7));
      head.quaternion.multiply(tmpQ);
    }

    // Ear flick on accents - direction doesn't matter much for a twitch, so
    // both ears tip the same way about their own local X.
    const earAmt = kn(kc.bearTalkEars, 1);
    if (talk.ear > 0 && earAmt > 0) {
      const flick = 0.22 * earAmt * Math.sin(Math.PI * (1 - talk.ear));
      tmpQ.setFromAxisAngle(FACE_RIGHT_LOCAL, flick);
      earLRef.current?.quaternion.multiply(tmpQ);
      earRRef.current?.quaternion.multiply(tmpQ);
    }
  });

  return (
    <group
      ref={groupRef}
      name={name}
      onClick={(e: THREE.Event & { stopPropagation: () => void }) => {
        e.stopPropagation();
        onSelect(name);
      }}
    >
      {placement.modelRotation ? (
        <group rotation={placement.modelRotation}>
          <primitive object={model} />
        </group>
      ) : (
        <primitive object={model} />
      )}
      {placement.prop ? (
        <SocketProp
          root={groupRef}
          prop={mergeBearPoseProp(placement.prop, placement.bearId ? BEAR_POSES[placement.bearId]?.prop : undefined)}
          ready={model}
          config={config}
          heads={heads}
          name={name}
        />
      ) : null}
      {placement.handheld ? (
        <PawProp root={groupRef} spec={placement.handheld} ready={model} name={name} cords={cords} />
      ) : null}
      {(placement.accessories ?? []).map((kind) => (
        <BearAccessory key={kind} root={groupRef} kind={kind} ready={model} config={config} bearId={placement.bearId} />
      ))}
    </group>
  );
}

/**
 * A fish laid on its side near the fire, exaggerating the "Swim" clip that
 * shipped with the model. The clip is played at a cranked timeScale so the tail
 * wags like a desperate flop rather than a lazy swim, and the mixer is toggled
 * between "flopping" and "still" phases so the fish rests between bursts. We
 * also add a small vertical bounce during flop phases - the swim clip only
 * moves the tail, so an extra hop sells the "trying to get back to water" read.
 *
 * Bursts and rests vary in duration (mutually non-integer) so the rhythm never
 * feels metronomic. Position, rotation, and scale are placement-only; no lab
 * sliders yet - if we want to tune them, expose them through sceneConfig later.
 */
/** Imperative handle on an <EmberBurst>. */
type EmberBurstHandle = { fire: () => void };

type EmberBurstProps = {
  /** Emitter origin, in the parent's frame. */
  x: number; y: number; z: number;
  count: number;
  speed: number;
  /** Width of the cone. 0 is a vertical column. */
  spread: number;
  /** Ceiling, shared with the ambient sparks so both rise to the same place. */
  maxHeight: number;
  /** Sideways drift, shared with the ambient sparks. */
  sway: number;
  lifetime: number;
  size: number;
  opacity: number;
  flashIntensity: number;
  flashDuration: number;
  flashReach: number;
};

/**
 * A one-shot shower of embers, fired imperatively.
 *
 * Deliberately NOT the ambient <Sparks> rig with its count cranked: that one is
 * a steady-state emitter whose particles respawn forever on a stagger, and
 * borrowing it would have meant teaching it about bursts that end. This owns a
 * fixed pool, fires them all on the same frame, and parks itself the moment the
 * last one dies - `visible = false`, no per-frame work, nothing uploaded.
 *
 * The trigger is a ref rather than a prop, so setting one off costs no React
 * render at all: the two call sites (a fish landing, a click on the fire) are
 * both deep inside a scene tree whose re-render is thousands of elements wide.
 *
 * Same material recipe as the ambient sparks (additive, #ffc66d, per-point
 * alpha injected into PointsMaterial) so the two read as the same fire.
 */
const EmberBurst = forwardRef<EmberBurstHandle, EmberBurstProps>(function EmberBurst(p, ref) {
  const COUNT = Math.max(1, Math.min(800, Math.round(p.count)));
  const pointsRef = useRef<THREE.Points>(null);
  const posAttrRef = useRef<THREE.BufferAttribute>(null);
  const alphaAttrRef = useRef<THREE.BufferAttribute>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const ageRef = useRef(Infinity);
  // Live copy of the tuning, so the frame loop and fire() read current slider
  // values without either of them being rebuilt when a slider moves.
  const cfg = useRef(p);
  cfg.current = p;

  const { positions, alphas, vel, hvar } = useMemo(() => ({
    positions: new Float32Array(COUNT * 3),
    alphas: new Float32Array(COUNT),
    vel: new Float32Array(COUNT * 3),
    /** per-ember multiplier on the ceiling, so they do not all stop in a plane */
    hvar: new Float32Array(COUNT),
  }), [COUNT]);

  useImperativeHandle(ref, () => ({
    fire() {
      const c = cfg.current;
      // Math.random, not the seeded PRNG the ambient sparks use - two bursts in
      // a row looking identical would give the trick away.
      for (let i = 0; i < COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        // sqrt keeps the cone's cross-section evenly filled instead of clumping
        // everything around the axis.
        const r = Math.sqrt(Math.random()) * c.spread;
        const sp = c.speed * (0.45 + Math.random() * 0.95);
        vel[i * 3] = Math.cos(a) * r * sp;
        vel[i * 3 + 1] = sp * (0.75 + Math.random() * 0.75);
        vel[i * 3 + 2] = Math.sin(a) * r * sp;
        hvar[i] = 0.7 + Math.random() * 0.6;   // matches the ambient spread
        positions[i * 3] = 0; positions[i * 3 + 1] = 0; positions[i * 3 + 2] = 0;
        alphas[i] = 0;
      }
      ageRef.current = 0;
      if (pointsRef.current) pointsRef.current.visible = true;
    },
  }), [COUNT, vel, positions, alphas, hvar]);

  useFrame((_, dt) => {
    const c = cfg.current;
    const life = Math.max(0.05, c.lifetime);
    if (ageRef.current > life) {
      if (pointsRef.current?.visible) pointsRef.current.visible = false;
      if (lightRef.current && lightRef.current.intensity !== 0) lightRef.current.intensity = 0;
      return;
    }
    ageRef.current += dt;
    const age = ageRef.current;

    // Flash: a hard spike on impact, then a fast decay. The light is mounted
    // ALWAYS, at intensity 0 when idle, because three keys its shader program
    // cache on the number of lights in the scene - mounting one on the click
    // would recompile every material in the scene at exactly the wrong moment.
    if (lightRef.current) {
      const f = Math.max(0, 1 - age / Math.max(0.05, c.flashDuration));
      lightRef.current.intensity = c.flashIntensity * f * f;
    }

    const pa = posAttrRef.current, aa = alphaAttrRef.current;
    if (!pa || !aa) return;
    const pos = pa.array as Float32Array;
    const al = aa.array as Float32Array;
    /*
     * Rise exactly the way the ambient sparks rise.
     *
     * This used to be pure exponential drag, y = v0(1 - e^-kt)/k, which
     * ASYMPTOTES at v0/k: the embers decelerate and park in mid-air. Next to
     * the ambient sparks - which climb steadily to their ceiling and fade out
     * still moving - the click burst read as a different substance. So it now
     * uses the ambient law, and takes its ceiling and its sway from the same
     * config, so the two are the same fire.
     *
     * `tCap` clamps the age at the parabola's vertex, which is what makes it
     * monotonic: the ambient formula would eventually turn over and rain the
     * embers back down, and embers from a fire do not fall.
     */
    const maxH = Math.max(0.05, c.maxHeight);
    const swayAmp = c.sway * 0.35;
    for (let i = 0; i < COUNT; i++) {
      const vy = vel[i * 3 + 1];
      const latDrag = 1 - Math.min(1, age * 0.55);
      const tCap = vy / 0.7;
      const a2 = Math.min(age, tCap);
      const rise = Math.min(maxH * (hvar[i] || 1), vy * a2 - 0.35 * a2 * a2);
      pos[i * 3] = vel[i * 3] * age * latDrag + Math.sin(age * 4.2 + i) * swayAmp;
      pos[i * 3 + 1] = rise;
      pos[i * 3 + 2] = vel[i * 3 + 2] * age * latDrag + Math.cos(age * 3.9 + i * 1.7) * swayAmp;
      const norm = age / life;
      const fadeIn = Math.min(1, norm * 10);
      const fadeOut = 1 - Math.pow(Math.min(1, norm), 1.6);
      const flick = 0.72 + 0.28 * Math.sin(age * 26 + i);
      al[i] = Math.max(0, fadeIn * fadeOut * flick);
    }
    pa.needsUpdate = true;
    aa.needsUpdate = true;
  });

  return (
    <group position={[p.x, p.y, p.z]}>
      <pointLight ref={lightRef} intensity={0} distance={p.flashReach} decay={2} color="#ffb257" />
      <points ref={pointsRef} visible={false} raycast={() => null} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute ref={posAttrRef} attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute ref={alphaAttrRef} attach="attributes-alpha" args={[alphas, 1]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffc66d"
          size={p.size}
          sizeAttenuation
          transparent
          opacity={p.opacity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          onBeforeCompile={(shader) => {
            shader.vertexShader = shader.vertexShader.replace(
              "void main() {",
              "attribute float alpha;\nvarying float vAlpha;\nvoid main() {\n  vAlpha = alpha;"
            );
            shader.fragmentShader = shader.fragmentShader
              .replace("void main() {", "varying float vAlpha;\nvoid main() {")
              .replace(
                "vec4 diffuseColor = vec4( diffuse, opacity );",
                "vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );"
              );
          }}
        />
      </points>
    </group>
  );
});

function FloppingFish({
  config,
  onClickSound,
  onImpactSound,
  onLaunch,
  onImpact,
  onSelect,
  replayOnTune = false,
}: {
  config: CampfireSceneConfig;
  onClickSound?: () => void;
  /** Fired the instant the throw lands - the fish "hits" the fire. */
  onImpactSound?: () => void;
  onLaunch?: (target: THREE.Vector3, progress: number) => void;
  onImpact?: (target: THREE.Vector3) => void;
  onSelect?: (name: string) => void;
  /** Lab only: re-throw the fish whenever its settings change, so tuning
   *  can be watched. On the site the fish flies ONLY when clicked. */
  replayOnTune?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(FISH_URL) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] };
  const [hovered, setHovered] = useState(false);

  /*
   * Click-to-cook. idle -> flying -> gone, with an optional trip back to idle
   * if fishRespawnDelay is set.
   *
   * The flight is driven from a ref rather than state so the frame loop never
   * waits on a re-render; only the three PHASE changes go through setState,
   * because they are the only things React actually has to draw differently.
   */
  const [phase, setPhase] = useState<"idle" | "flying" | "gone">("idle");
  const burstRef = useRef<EmberBurstHandle>(null);
  const flight = useRef<{
    t: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    rot: THREE.Euler;
    spinAxis: THREE.Vector3;
  } | null>(null);

  const ov = config.objectOverrides?.["fish"] ?? EMPTY_OVERRIDE;

  /*
   * Where the fire actually is, in the fish's own parent frame.
   *
   * FloppingFish and the "campfire" group are SIBLINGS, so the flame's local
   * (flameX, flameY, flameZ) has to have the campfire group's own drag offset
   * added to it before the fish can aim at it. Reading it live means dragging
   * either one in the lab keeps the throw honest.
   */
  const campOv = config.objectOverrides?.["campfire"] ?? EMPTY_OVERRIDE;
  const fireTarget = useMemo(
    () => new THREE.Vector3(
      campOv.dx + config.flameX,
      campOv.dy + config.flameY + config.fishLaunchTargetY,
      campOv.dz + config.flameZ,
    ),
    [campOv.dx, campOv.dy, campOv.dz, config.flameX, config.flameY, config.flameZ, config.fishLaunchTargetY],
  );

  const launch = useCallback(() => {
    const g = groupRef.current;
    if (!g) return;
    flight.current = {
      t: 0,
      from: g.position.clone(),
      to: fireTarget.clone(),
      rot: g.rotation.clone(),
      // Tumble end-over-end about the axis across the direction of travel, so
      // it reads as a thrown fish rather than a spinning top.
      //
      // The fallback matters: setFromAxisAngle takes the axis on trust, and a
      // zero-length one yields (0,0,0,cos) - a quaternion of length < 1, which
      // three applies as a SCALE. Park the fish exactly on the flame in the lab
      // and, without this, clicking it would shrink it instead of throwing it.
      spinAxis: (() => {
        const a = new THREE.Vector3(fireTarget.z - g.position.z, 0, g.position.x - fireTarget.x);
        return a.lengthSq() < 1e-8 ? new THREE.Vector3(1, 0, 0) : a.normalize();
      })(),
    };
    onLaunch?.(g.getWorldPosition(new THREE.Vector3()), 0);
    setPhase("flying");
  }, [fireTarget, onLaunch]);

  const fishReplayKey = [
    config.fishX, config.fishY, config.fishZ,
    config.fishLaunchDuration, config.fishLaunchArc, config.fishLaunchSpin,
    config.fishLaunchTargetY, config.fishLaunchFlail, config.fishLaunchOn,
    config.bearFishFlightLookX, config.bearFishFlightLookY, config.bearFishFlightLookZ,
    config.bearFishFireLookX, config.bearFishFireLookY, config.bearFishFireLookZ,
    config.bearFishFlightTurnTime, config.bearFishFireTurnTime, config.bearFishMaxTurn,
    config.bearFishImpactDelay, config.bearFishFireLookTime, config.bearFishMouthHoldTime,
    config.bearFishReturnTime, config.bearFishJawAmount,
    config.bearFishFlightLookRX, config.bearFishFlightLookRY, config.bearFishFlightLookRZ,
    config.bearFishFireLookRX, config.bearFishFireLookRY, config.bearFishFireLookRZ,
  ].join(":");
  // Compared against the last key rather than a "skip the first run" flag:
  // React dev mode runs every effect twice on mount, so the flag was already
  // set by the second run and the fish flew the moment the page loaded.
  const lastFishReplayKey = useRef(fishReplayKey);
  useEffect(() => {
    if (lastFishReplayKey.current === fishReplayKey) return;
    lastFishReplayKey.current = fishReplayKey;
    if (!replayOnTune) return;
    if (config.fishLaunchOn < 0.5) return;
    setPhase("idle");
    const frame = requestAnimationFrame(launch);
    return () => cancelAnimationFrame(frame);
  }, [fishReplayKey, replayOnTune, config.fishLaunchOn, launch]);

  // Respawn is opt-in: fishRespawnDelay 0 means the fish is gone for the rest
  // of the visit, which is the point of the gag.
  useEffect(() => {
    if (phase !== "gone" || config.fishRespawnDelay <= 0) return;
    const id = window.setTimeout(() => setPhase("idle"), config.fishRespawnDelay * 1000);
    return () => window.clearTimeout(id);
  }, [phase, config.fishRespawnDelay]);

  // Every mesh on the fish needs to cast shadows, or the fire's point-light
  // shadow map won't include it and the fish sits shadowless on the ground.
  // useGLTF returns a raw scene - unlike GLBModel, nothing else sets these
  // flags for us here. The per-object "no shadow" override is applied by
  // ShadowLayer at the scene level, so we only set the default here.
  useEffect(() => {
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.isHoverOutline) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }, [gltf.scene]);

  // Cache every material on the fish along with its original emissive so hover
  // can nudge each one a shade brighter and restore it cleanly on unhover.
  // A low-intensity white emissive lifts every pixel uniformly without shifting
  // the diffuse color - basically "the whole fish gets a touch of ambient glow".
  const emissiveTargets = useMemo(() => {
    type Target = {
      mat: THREE.MeshStandardMaterial;
      originalColor: THREE.Color;
      originalIntensity: number;
    };
    const targets: Target[] = [];
    gltf.scene.traverse((o) => {
      const anyO = o as THREE.Object3D & { isMesh?: boolean; material?: unknown };
      if (!anyO.isMesh || !anyO.material) return;
      const mats = Array.isArray(anyO.material) ? anyO.material : [anyO.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (std && "emissive" in std) {
          targets.push({
            mat: std,
            originalColor: std.emissive.clone(),
            originalIntensity: std.emissiveIntensity ?? 1,
          });
        }
      }
    });
    return targets;
  }, [gltf.scene]);

  useEffect(() => {
    const HOVER_COLOR = new THREE.Color(1, 1, 1);
    const HOVER_INTENSITY = 0.15;
    for (const t of emissiveTargets) {
      if (hovered) {
        t.mat.emissive.copy(HOVER_COLOR);
        t.mat.emissiveIntensity = HOVER_INTENSITY;
      } else {
        t.mat.emissive.copy(t.originalColor);
        t.mat.emissiveIntensity = t.originalIntensity;
      }
      t.mat.needsUpdate = true;
    }
  }, [hovered, emissiveTargets]);

  // Swap to the interactive cursor while pointed at the fish. Restores whatever
  // was there before if the fish unmounts mid-hover so we never leak state.
  useEffect(() => {
    if (!hovered) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "url('/cursors/pointer.svg') 14 14, pointer";
    return () => { document.body.style.cursor = prev; };
  }, [hovered]);
  // Attach the mixer to the actual scene root - not a clone. THREE.Object3D.clone
  // does NOT rebind SkinnedMesh -> Skeleton, so a cloned fish just sits still.
  // Since we only place one fish, using the original is fine.
  const { actions } = useAnimations(gltf.animations || [], gltf.scene);

  // Cache the spine bones and their BIND-POSE quaternions so we can amplify the
  // swim clip's rotation without changing its axis. The mixer writes each
  // frame's quaternion; we re-express that as "bind * delta" and stretch delta
  // by an angle factor. Result: the exact motion the clip already plays, just
  // bigger. Multiplier cascades down the chain so the tail whips harder than
  // the head, matching how a real fish flops - anchored middle, snapping tail.
  //
  // Grabbed via useMemo() at first render, before the mixer's useFrame has run,
  // so bone.quaternion is still the bind pose.
  const bones = useMemo(() => {
    const found: { obj: THREE.Object3D; bind: THREE.Quaternion; mul: number }[] = [];
    const table: Record<string, number> = {
      // extra multiplier applied to the swim clip's angle at peak flop.
      // Middle spine bulges the most - a real flopping fish arches its belly
      // more than its tail, which reads as a "C" shape rather than a whip.
      Spine1: 1.20,
      Spine2: 1.90,
      Spine3: 2.20,
      Tail:   1.90,
    };
    gltf.scene.traverse((o) => {
      const mul = table[o.name];
      if (mul !== undefined) {
        found.push({ obj: o, bind: o.quaternion.clone(), mul });
      }
    });
    return found;
  }, [gltf.scene]);

  // Reusable scratch quaternion so we don't allocate 4 per frame.
  const scratchQ = useMemo(() => new THREE.Quaternion(), []);
  // The fish's WORLD position, handed to the bears every frame of the throw.
  const fishWorld = useMemo(() => new THREE.Vector3(), []);

  /** Seconds the fish takes to slump flat once a flop burst ends. */
  const FISH_SETTLE_TIME = 0.45;

  // Alternating flop / rest phases. Durations picked to feel like the fish is
  // gathering itself between attempts. Kept mutually irrational so the pattern
  // doesn't lock into a beat.
  const PHASES = useMemo(
    () => [
      { flopping: true,  dur: 1.35 },
      { flopping: false, dur: 1.60 },
      { flopping: true,  dur: 0.90 },
      { flopping: false, dur: 2.10 },
      { flopping: true,  dur: 1.75 },
      { flopping: false, dur: 1.20 },
    ],
    []
  );

  const t = useRef(0);

  useEffect(() => {
    if (!actions) return;
    // The clip comes in as "Swim" or "Armature|Swim" depending on exporter. Pick
    // whichever key exists so we don't hardcode the exporter's naming.
    const key = Object.keys(actions).find((k) => /swim/i.test(k));
    if (!key) return;
    const action = actions[key];
    if (!action) return;
    action.reset().play();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.timeScale = 0; // start still; the frame loop cranks it during flops
  }, [actions]);

  useFrame((_, dt) => {
    /*
     * FLIGHT. Takes over the whole frame while it runs: the flop bounce below
     * writes position.y every frame, so letting both run would have the fish
     * hopping along its own arc.
     */
    if (phase === "flying" && flight.current) {
      const f = flight.current;
      f.t += dt;
      const dur = Math.max(0.05, config.fishLaunchDuration);
      const u = Math.min(1, f.t / dur);
      const g = groupRef.current;
      if (g) {
        // Constant speed across the ground, parabola on top. A single eased
        // lerp in all three axes would float; this throws.
        g.position.x = f.from.x + (f.to.x - f.from.x) * u;
        g.position.z = f.from.z + (f.to.z - f.from.z) * u;
        g.position.y = f.from.y + (f.to.y - f.from.y) * u
          + Math.sin(u * Math.PI) * config.fishLaunchArc;

        // Tumble, applied on top of the resting orientation rather than
        // replacing it, so it starts from exactly the pose it was lying in.
        scratchQ.setFromAxisAngle(f.spinAxis, u * Math.PI * 2 * config.fishLaunchSpin);
        g.quaternion.setFromEuler(f.rot).premultiply(scratchQ);
        // world position, so the bears (in another part of the tree) can
        // look straight at it
        onLaunch?.(g.getWorldPosition(fishWorld), u);
      }

      // Thrash for real on the way in.
      const swimKey = actions ? Object.keys(actions).find((k) => /swim/i.test(k)) : undefined;
      if (swimKey && actions?.[swimKey]) {
        actions[swimKey]!.timeScale = config.fishFlopSpeed * config.fishLaunchFlail;
      }

      if (u >= 1) {
        flight.current = null;
        burstRef.current?.fire();
        onImpactSound?.();
        onImpact?.(g?.parent ? g.parent.localToWorld(fishWorld.copy(f.to)) : f.to);
        setPhase("gone");
      }
      return;
    }
    if (phase === "gone") return;

    t.current += dt;

    // Walk through phases based on cumulative time. Sum durations = one full cycle.
    let cycle = 0;
    for (const p of PHASES) cycle += p.dur;
    const local = t.current % cycle;

    let acc = 0;
    let current = PHASES[0];
    for (const p of PHASES) {
      if (local < acc + p.dur) { current = p; break; }
      acc += p.dur;
    }
    const phaseT = local - acc;

    // Crank timeScale WAY up during flopping phases; on rest, hold at 0 so the
    // tail freezes mid-wag (reads as the fish giving up for a beat).
    const key = actions ? Object.keys(actions).find((k) => /swim/i.test(k)) : undefined;
    if (key && actions) {
      const action = actions[key];
      if (action) action.timeScale = current.flopping ? config.fishFlopSpeed : 0;
    }

    // Vertical bounce + small yaw wobble while flopping.
    const g = groupRef.current;
    const baseY = config.fishY;
    if (g) {
      if (current.flopping) {
        const norm = phaseT / current.dur;
        const hop = Math.max(0, Math.sin(norm * Math.PI)) * 0.09;
        const wobble = Math.sin(t.current * 22) * 0.02;
        g.position.y = baseY + hop + wobble;
        g.rotation.y = config.fishRotationY + Math.sin(t.current * 14) * 0.15;
      } else {
        g.position.y += (baseY - g.position.y) * Math.min(1, dt * 6);
        g.rotation.y += (config.fishRotationY - g.rotation.y) * Math.min(1, dt * 6);
      }
    }

    // Amplify the swim clip's own bend during flop bursts. For each spine bone:
    //   delta = bindInv * currentAnimatedQuat     (whatever the mixer put there)
    //   angle *= (1 + (mul - 1) * envelope)       (stretch the same rotation)
    //   currentQuat = bind * newDelta
    // Envelope fades in and out over the burst so the exaggeration ramps up
    // rather than popping on. Rest phases pass through untouched (factor = 1).
    const norm = current.flopping ? phaseT / current.dur : 0;
    const envelope = current.flopping
      ? Math.sin(Math.min(1, norm * 6.5) * Math.PI / 2)          // fast attack
        * Math.sin(Math.min(1, (1 - norm) * 6.5) * Math.PI / 2)  // fast decay
      : 0;

    // Between flops, RELAX the spine back to its bind pose instead of freezing
    // it wherever the clip happened to stop.
    //
    // The rest phase parks the mixer at timeScale 0, which held the tail cocked
    // at whatever angle the frame it stopped on had - so the fish lay still
    // with its tail up in the air, and the fire threw a bent, floating shadow
    // that didn't match a fish lying on the dirt. Easing the delta to zero puts
    // the tail flat on the ground between attempts, and the shadow settles with
    // it. Smoothstep so it slumps rather than snapping straight.
    const settleT = Math.min(1, phaseT / FISH_SETTLE_TIME);
    const settle = current.flopping ? 1 : 1 - settleT * settleT * (3 - 2 * settleT);

    for (const b of bones) {
      // delta from bind to current (post-mixer).
      scratchQ.copy(b.bind).invert().multiply(b.obj.quaternion);
      // Extract axis-angle.
      let w = scratchQ.w;
      if (w > 1) w = 1; else if (w < -1) w = -1;
      const angle = 2 * Math.acos(w);
      if (angle < 1e-4) continue;                     // essentially no rotation
      const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
      const inv = sinHalf > 1e-6 ? 1 / sinHalf : 0;
      const ax = scratchQ.x * inv;
      const ay = scratchQ.y * inv;
      const az = scratchQ.z * inv;
      // Multiplier: up to b.mul at peak flop, easing to 0 (= bind pose, tail
      // flat) once the fish gives up and rests.
      const factor = current.flopping ? 1 + (b.mul - 1) * envelope : settle;
      const newAngle = angle * factor;
      const half = newAngle * 0.5;
      const s = Math.sin(half);
      scratchQ.set(ax * s, ay * s, az * s, Math.cos(half));
      b.obj.quaternion.copy(b.bind).multiply(scratchQ);
    }
  });

  // Layer objectOverrides on top of the fish sliders so the fish is draggable
  // through the same ObjectDragLayer path as every other named object. Naming
  // the outer group "fish" is what makes drag work at all - the drag layer
  // walks up from the hit target looking for a node with `name === selectedObject`.
  return (
    <>
      {phase !== "gone" ? (
        <group
          ref={groupRef}
          name="fish"
          position={[config.fishX + ov.dx, config.fishY + ov.dy, config.fishZ + ov.dz]}
          rotation={[config.fishRotationX + ov.rotX, config.fishRotationY + ov.rotY, 0]}
          scale={ov.scale}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(false); }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onClickSound?.();
            // fishLaunchOn exists so the lab can still pick the fish up and
            // position it. With this on, one click and it is in the fire.
            if (config.fishLaunchOn >= 0.5) {
              // Deliberately NOT onSelect: selecting it would leave
              // selectedObject pointing at a node that is about to unmount, and
              // OrbitControls are disabled for as long as anything is selected
              // - so the throw would end with a camera that cannot be moved.
              if (phase === "idle") {
                setHovered(false);
                launch();
              }
              return;
            }
            onSelect?.("fish");
          }}
        >
          {/* Inner group holds the "lay on side" roll so the outer group's Y-rotation
              (the wobble) stays as heading rather than mixing with the flop tilt. */}
          <group rotation={[0, 0, config.fishRotationZ + ov.rotZ]} scale={config.fishScale}>
            <primitive object={gltf.scene} />
          </group>
        </group>
      ) : null}
      {/* Sibling, not a child: the embers belong to the FIRE, and parenting them
          to the fish would have taken them away with it when it unmounts. */}
      <EmberBurst
        ref={burstRef}
        x={fireTarget.x}
        y={fireTarget.y}
        z={fireTarget.z}
        count={config.fishBurstCount}
        speed={config.fishBurstSpeed}
        spread={config.fishBurstSpread}
        maxHeight={config.sparkMaxHeight}
        sway={config.sparkSway}
        lifetime={config.fishBurstLifetime}
        size={config.fishBurstSize}
        opacity={config.fishBurstOpacity}
        flashIntensity={config.fishFlashIntensity}
        flashDuration={config.fishFlashDuration}
        flashReach={config.fishFlashReach}
      />
    </>
  );
}

function CampfireAnimals({
  config,
  onSelect,
  bearVoiceRef,
  banjoPanRef,
  banjoGainRef,
  banjoTimeRef,
  fishReactionRef,
}: {
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
  bearVoiceRef?: BearVoiceStateRef;
  /** -1 (hard left) .. 1 (hard right), written every frame from the banjo
   *  bear's live head position relative to the camera - read by the outer
   *  CampfireScene's banjo useCampsiteAudioLoop call via the same ref. */
  banjoPanRef?: React.MutableRefObject<number>;
  /** Loudness multiplier for the banjo from how close the camera is to him
   *  (1 = at scene 1's normal shot). Written here, read by the audio loop. */
  banjoGainRef?: React.MutableRefObject<number>;
  banjoTimeRef?: React.MutableRefObject<number>;
  fishReactionRef?: MutableRefObject<FishReaction>;
}) {
  // Live head positions, written and read by the bears each frame, so they can find
  // each other wherever the config sliders have put them.
  const heads = useRef<HeadRegistry>(new Map());

  // Stereo-pans the banjo loop to whichever side the banjo bear (back_left_log)
  // is actually on, from the CAMERA's point of view - not a fixed "he's on
  // the left" assumption, since the camera orbits/reframes between locations
  // and in the lab. heads already tracks his live head position (every
  // sit_log bear registers there - see the Animal component's social-glance
  // effect), so this just reads it back and projects it onto the camera's
  // own right axis: lateral/dist is sin(the angle off dead ahead), 0 =
  // centered, +-1 = hard left/right. No bear registered yet (first frame,
  // or he's hidden/deleted) leaves the pan wherever it last was rather than
  // snapping to center.
  const panToBearVec = useRef(new THREE.Vector3());
  const panRightVec = useRef(new THREE.Vector3());
  const shotPos = useRef(new THREE.Vector3());
  const shotTgt = useRef(new THREE.Vector3());
  useFrame(({ camera }, delta) => {
    if (!banjoPanRef) return;
    let bearPos: THREE.Vector3 | null = null;
    for (const entry of heads.current.values()) {
      if (entry.bearId === "back_left_log") { bearPos = entry.position; break; }
    }
    if (!bearPos) return;
    const toBear = panToBearVec.current.copy(bearPos).sub(camera.position);
    const dist = toBear.length();
    if (dist < 0.001) return;
    const right = panRightVec.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const pan = toBear.dot(right) / dist;
    banjoPanRef.current = Math.max(-1, Math.min(1, pan));

    // Loudness by distance: sound falls off as 1/distance (rolloff 1), so it
    // is measured against scene 1's own saved shot - there the banjo plays at
    // exactly the Banjo volume knob, it swells as the camera flies in from
    // the title / another scene, and gets louder still if you push in closer
    // (up to banjoMaxBoost). Smoothed so a camera cut does not click.
    if (banjoGainRef) {
      locationCamera(LOCATION_CAMPFIRE, config, shotPos.current, shotTgt.current);
      const refDist = Math.max(0.5, shotPos.current.distanceTo(bearPos));
      const rolloff = Number.isFinite(config.banjoDistanceRolloff) ? Math.max(0, config.banjoDistanceRolloff) : 1;
      const maxBoost = Number.isFinite(config.banjoMaxBoost) ? Math.max(1, config.banjoMaxBoost) : 1.8;
      const want = Math.min(maxBoost, Math.pow(refDist / Math.max(0.05, dist), rolloff));
      const k = 1 - Math.exp(-Math.min(delta, 0.1) / 0.15);
      banjoGainRef.current += (want - banjoGainRef.current) * k;
    }
  });

  // Cache-bust versions for the baked pose GLBs. Poll /api/dev/bake-bear-pose
  // so that when the pose lab triggers a rebake, useGLTF sees a new URL
  // (?v={mtime}) and reloads the model automatically. In prod the endpoint
  // 403s and versions stay {}.
  const [bakeVersions, setBakeVersions] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    let last = "";
    const refresh = () => {
      if (cancelled || (typeof document !== "undefined" && document.hidden)) return;
      fetch("/api/dev/bake-bear-pose")
        .then((r) => (r.ok ? r.text() : null))
        .then((text) => {
          if (cancelled || !text || text === last) return;
          last = text;
          try {
            const data = JSON.parse(text);
            if (data && typeof data.versions === "object") {
              setBakeVersions(data.versions as Record<string, number>);
            }
          } catch { /* keep last good */ }
        })
        .catch(() => { /* keep last good */ });
    };
    refresh();
    const interval = window.setInterval(refresh, 1500);
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <>
      {ANIMALS.map((a, i) => {
        const name = `animal_${a.label.replace(/[^a-z0-9]+/gi, "_")}_${i}`;
        // Unmounting also tears down its AnimationMixer and useFrame work, which
        // visible=false left running every frame.
        if ((config.objectOverrides?.[name]?.hide ?? 0) >= 0.5) return null;
        const version = a.bearId ? bakeVersions[a.bearId] : undefined;
        // For baked bears append ?v={mtime} so useGLTF re-fetches after every
        // rebake. Non-baked bears (banjo/table) keep their raw url.
        const placement = version ? { ...a, url: `${a.url}?v=${version}` } : a;
        // Include version in the key so Animal remounts when the URL changes.
        // Without this, useAnimations keeps its mixer bound to the OLD model's
        // bones after useGLTF swaps in the new GLB - three.js sees dead bone
        // references, doesn't drive them, and the bear renders in T-pose.
        return (
          <Animal
            key={`animal-${i}-${version ?? 0}`}
            name={name}
            placement={placement}
            config={config}
            onSelect={onSelect}
            heads={heads}
            bearVoiceRef={bearVoiceRef}
            fishReactionRef={fishReactionRef}
            banjoTimeRef={banjoTimeRef}
            seed={i}
          />
        );
      })}
    </>
  );
}

/**
 * Location 1 - the arcade, redone.
 *
 * Four little_tv CRTs stacked into a 2x2 wall along the -X flank, each running a
 * different project GIF so the wall reads as live screens. Four adult bears
 * sitting criss-cross on the ground in profile at +X, facing the wall - camera
 * comes in from +Z and reads the row of faces. Truck stays on-scene as a
 * background prop but is nudged behind the bears so it isn't fighting the TVs
 * for the shot.
 *
 * Composed around its own origin; the ring puts it where it belongs, and every
 * piece is wrapped in a Selectable so the object panel can drag/rotate/scale
 * each independently.
 */
/**
 * A second campfire for the arcade sector. Mirrors the primary campfire fully:
 * flame cones, glow disc, sparks, warm point light, AND the rocks-and-logs
 * pile - all driven off the same config values so tuning the main fire in
 * the lab keeps both fires in sync visually. The pile is a fresh clone of the
 * "bonfire" node inside CAMPFIRE_SCENE_URL (same source the primary campfire
 * uses); useGLTF caches the GLB so this is essentially free. Placement lives
 * on `arcadeCampfire*`, which drive the outer Selectable transform. The
 * bonfire clone is intentionally NOT wired to `bonfireX/Y/Z/Scale` - those
 * are dialed for the primary fire's frame and applying them again here would
 * double-offset the pile away from the flames.
 */
function ArcadeCampfire({ config }: { config: CampfireSceneConfig }) {
  const gltf = useGLTF(CAMPFIRE_SCENE_URL) as unknown as { scene: THREE.Group };
  const bonfire = useMemo(() => {
    let found: THREE.Object3D | null = null;
    gltf.scene.traverse((obj) => {
      if (!found && (obj.name || "").toLowerCase() === "bonfire") found = obj;
    });
    if (!found) return null;
    const clone = (found as THREE.Object3D).clone(true);
    // The source node carries its own local transform inside the scene GLB;
    // strip that so the pile drops on the arcade fire's local origin.
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        if (Array.isArray(m.material)) m.material = m.material.map((mat) => mat.clone());
        else if (m.material) m.material = (m.material as THREE.Material).clone();
      }
    });
    return clone;
  }, [gltf.scene]);

  /*
   * How lit this fire is, 0..1.
   *
   * "Intensity is as low as it goes and the fire is still too bright" was not
   * a tuning problem - it was five independent brightness sources with only
   * one of them on that slider. arcadeFireIntensity drove the point light
   * ONLY; the flame cones, ground glow and sparks are unlit additive material
   * that no light setting can reach, so at intensity 0 the fire cast nothing
   * and still burned at full opacity.
   *
   * Normalising against the config's own default (not a magic number) makes
   * the slider mean "how lit is this fire": at the default it looks the way
   * it always did, and at 0 the fire is actually out. arcadeFireDim rides on
   * top as a master fade.
   */
  const lit = Math.max(0, Math.min(1,
    config.arcadeFireIntensity / Math.max(1e-4, DEFAULT_CAMPFIRE_CONFIG.arcadeFireIntensity)));
  const fireVis = lit * config.arcadeFireDim;

  // Arcade fire lights are separate from the campfire's — its own flicker,
  // its own intensity, its own reach, its own color. Kept as refs so slider
  // scrubs update in place without unmounting the lights.
  const arcadeFire = useRef<THREE.PointLight>(null);
  const arcadeFarGlow = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker = 1 + config.arcadeFlickerAmount * (
      Math.sin(t * 8.1) * 0.12 + Math.sin(t * 15.7) * 0.08 + Math.sin(t * 23.3) * 0.035
    );
    if (arcadeFire.current) {
      arcadeFire.current.intensity = config.arcadeFireIntensity * flicker * config.arcadeFireDim;
      arcadeFire.current.decay = config.arcadeFireDecay;
      arcadeFire.current.distance = config.arcadeFireLightReach;
      arcadeFire.current.position.set(config.arcadeFireLightX, config.arcadeFireLightY, config.arcadeFireLightZ);
      arcadeFire.current.color.setRGB(config.arcadeFireLightColorR, config.arcadeFireLightColorG, config.arcadeFireLightColorB);
    }
    if (arcadeFarGlow.current) {
      const slow = 1 + config.arcadeFlickerAmount * (Math.sin(t * 2.3) * 0.06 + Math.sin(t * 4.1) * 0.03);
      // The far glow is the fire's ambient spill, so it dies with the fire -
      // otherwise a fire at intensity 0 still washed the whole sector.
      arcadeFarGlow.current.intensity = config.arcadeFarGlowIntensity * slow * fireVis;
      arcadeFarGlow.current.decay = config.arcadeFarGlowDecay;
      arcadeFarGlow.current.distance = config.arcadeFarGlowReach;
      arcadeFarGlow.current.position.set(config.arcadeFireLightX, config.arcadeFireLightY, config.arcadeFireLightZ);
    }
  });

  return (
    <group>
      {/* Only the log pile is clickable - everything below is decoration
          spread over tens of units, and picking it is what made the fire's
          hitbox swallow the scene. */}
      {bonfire && <primitive object={bonfire} />}
      <NoPick>
      <CampfireFlame
        x={config.arcadeFlameX} y={config.arcadeFlameY} z={config.arcadeFlameZ}
        scale={config.arcadeFlameScale}
        outerScale={config.arcadeFlameOuterScale}
        innerScale={config.arcadeFlameInnerScale}
        haloScale={config.arcadeFlameHaloScale}
        dim={fireVis}
      />
      <FireGlowDisc
        opacity={config.arcadeGlowOpacity * fireVis}
        x={config.arcadeFlameX}
        y={config.arcadeGlowY}
        z={config.arcadeFlameZ}
        scale={config.arcadeGlowScale}
        colorR={config.arcadeGlowColorR} colorG={config.arcadeGlowColorG} colorB={config.arcadeGlowColorB}
        width={config.arcadeGlowWidth} length={config.arcadeGlowLength}
        rotY={config.arcadeGlowRotY} falloff={config.arcadeGlowFalloff}
        flicker={config.arcadeGlowFlicker} breathe={config.arcadeGlowBreathe}
        offsetX={config.arcadeGlowOffsetX} offsetZ={config.arcadeGlowOffsetZ}
        worldScale={
          config.arcadeCampfireScale *
          (config.objectOverrides?.["arcade_campfire"]?.scale ?? 1)
        }
      />
      <Sparks
        key={`arcade-sparks-${Math.max(1, Math.round(config.arcadeSparkCount))}`}
        opacity={config.arcadeSparkOpacity * fireVis}
        x={config.arcadeFlameX}
        z={config.arcadeFlameZ}
        count={config.arcadeSparkCount}
        spread={config.arcadeSparkSpread}
        maxHeight={config.arcadeSparkMaxHeight}
        speed={config.arcadeSparkSpeed}
        sway={config.arcadeSparkSway}
        burstChance={config.arcadeSparkBurstChance}
        size={config.arcadeSparkSize}
        lifetime={config.arcadeSparkLifetime}
      />
      </NoPick>
      <pointLight ref={arcadeFire}
        position={[config.arcadeFireLightX, config.arcadeFireLightY, config.arcadeFireLightZ]}
        color={new THREE.Color(config.arcadeFireLightColorR, config.arcadeFireLightColorG, config.arcadeFireLightColorB)}
        intensity={config.arcadeFireIntensity * config.arcadeFireDim}
        distance={config.arcadeFireLightReach}
        decay={config.arcadeFireDecay}
      />
      <pointLight ref={arcadeFarGlow}
        position={[config.arcadeFireLightX, config.arcadeFireLightY, config.arcadeFireLightZ]}
        color="#ff9a45"
        intensity={config.arcadeFarGlowIntensity}
        distance={config.arcadeFarGlowReach}
        decay={config.arcadeFarGlowDecay}
      />
    </group>
  );
}

/**
 * The desk sector's campfire - the third and last copy of the same fire.
 *
 * camping.glb shipped its own: `Object_121`, a 484-vertex blob using the
 * flat orange material "Lamp.004", sitting on a small log (`Object_353`,
 * material "Material.075") inside a ring of 15 stone icospheres. It did not
 * animate, it did not flicker, and it did not cast light - the only reason
 * that corner of the diorama glowed at all was that "Lamp.004" was in
 * LIT_LAMP_MATERIALS, so CampingWithSelectableTrees hung a pointLight off it.
 *
 * All 17 of those objects were deleted from the GLB in Blender (the pre-edit
 * file is art-backup/camping_original.glb) and replaced by this component,
 * which is the arcade fire's structure exactly: the "bonfire" rocks-and-logs
 * node cloned out of CAMPFIRE_SCENE_URL, the three-cone CampfireFlame stack,
 * a FireGlowDisc on the ground, Sparks, and two point lights - a tight
 * flickering one for the pit and a slow wide one for the surroundings.
 *
 * The difference from ArcadeCampfire is that this fire does NOT borrow the
 * primary campfire's flame/glow/spark numbers. The diorama is authored at a
 * much larger unit scale than the two hero campsites, so every knob here is
 * its own `desk*` config key - see the block in sceneConfig.ts.
 */
function DeskCampfire({ config }: { config: CampfireSceneConfig }) {
  const gltf = useGLTF(CAMPFIRE_SCENE_URL) as unknown as { scene: THREE.Group };
  const bonfire = useMemo(() => {
    let found: THREE.Object3D | null = null;
    gltf.scene.traverse((obj) => {
      if (!found && (obj.name || "").toLowerCase() === "bonfire") found = obj;
    });
    if (!found) return null;
    const clone = (found as THREE.Object3D).clone(true);
    // Drop the source node's own placement inside campfire_scene.glb so the
    // pile lands on this fire's local origin instead of the hero campsite's.
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    // clone() SHARES materials with the cached GLTF, so they must be cloned
    // before anything here touches them - otherwise the primary campfire's
    // pile changes too, and the change survives a remount.
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        if (Array.isArray(m.material)) m.material = m.material.map((mat) => mat.clone());
        else if (m.material) m.material = (m.material as THREE.Material).clone();
      }
    });
    return clone;
  }, [gltf.scene]);

  // Refs rather than props so scrubbing a slider updates the lights in place
  // instead of unmounting and remounting them every frame.
  const deskFire = useRef<THREE.PointLight>(null);
  const deskFarGlow = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker = 1 + config.deskFlickerAmount * (
      Math.sin(t * 8.1) * 0.12 + Math.sin(t * 15.7) * 0.08 + Math.sin(t * 23.3) * 0.035
    );
    if (deskFire.current) {
      deskFire.current.intensity = config.deskFireIntensity * flicker;
      deskFire.current.decay = config.deskFireDecay;
      deskFire.current.distance = config.deskFireLightReach;
      deskFire.current.position.set(config.deskFireLightX, config.deskFireLightY, config.deskFireLightZ);
      deskFire.current.color.setRGB(config.deskFireLightColorR, config.deskFireLightColorG, config.deskFireLightColorB);
    }
    if (deskFarGlow.current) {
      const slow = 1 + config.deskFlickerAmount * (Math.sin(t * 2.3) * 0.06 + Math.sin(t * 4.1) * 0.03);
      deskFarGlow.current.intensity = config.deskFarGlowIntensity * slow;
      deskFarGlow.current.decay = config.deskFarGlowDecay;
      deskFarGlow.current.distance = config.deskFarGlowReach;
      deskFarGlow.current.position.set(config.deskFireLightX, config.deskFireLightY, config.deskFireLightZ);
    }
  });

  return (
    <group>
      {/* Logs are the only clickable part - see NoPick. */}
      {bonfire && config.deskCampfirePileVisible >= 0.5 && <primitive object={bonfire} />}
      <NoPick>
      <CampfireFlame
        x={config.deskFlameX} y={config.deskFlameY} z={config.deskFlameZ}
        scale={config.deskFlameScale}
        outerScale={config.deskFlameOuterScale}
        innerScale={config.deskFlameInnerScale}
        haloScale={config.deskFlameHaloScale}
      />
      <FireGlowDisc
        opacity={config.deskGlowOpacity}
        x={config.deskFlameX}
        y={config.deskGlowY}
        z={config.deskFlameZ}
        scale={config.deskGlowScale}
        colorR={config.deskGlowColorR} colorG={config.deskGlowColorG} colorB={config.deskGlowColorB}
        width={config.deskGlowWidth} length={config.deskGlowLength}
        rotY={config.deskGlowRotY} falloff={config.deskGlowFalloff}
        flicker={config.deskGlowFlicker} breathe={config.deskGlowBreathe}
        offsetX={config.deskGlowOffsetX} offsetZ={config.deskGlowOffsetZ}
        // The disc sizes itself in WORLD units, so it has to be told about
        // EVERY scale sitting above it: the camping diorama's own override
        // (0.207 today), this fire's config scale, and this fire's override.
        // Miss any one of them and Glow width stops meaning world units -
        // at 0.207 alone a width of 9 lands as 1.9, which is the shape the
        // arcade bug took before.
        worldScale={
          (config.objectOverrides?.["old_bear_camping"]?.scale ?? 1) *
          config.deskCampfireScale *
          (config.objectOverrides?.["desk_campfire"]?.scale ?? 1)
        }
      />
      <Sparks
        key={`desk-sparks-${Math.max(1, Math.round(config.deskSparkCount))}`}
        opacity={config.deskSparkOpacity}
        x={config.deskFlameX}
        z={config.deskFlameZ}
        count={config.deskSparkCount}
        spread={config.deskSparkSpread}
        maxHeight={config.deskSparkMaxHeight}
        speed={config.deskSparkSpeed}
        sway={config.deskSparkSway}
        burstChance={config.deskSparkBurstChance}
        size={config.deskSparkSize}
        lifetime={config.deskSparkLifetime}
      />
      </NoPick>
      <pointLight ref={deskFire}
        position={[config.deskFireLightX, config.deskFireLightY, config.deskFireLightZ]}
        color={new THREE.Color(config.deskFireLightColorR, config.deskFireLightColorG, config.deskFireLightColorB)}
        intensity={config.deskFireIntensity}
        distance={config.deskFireLightReach}
        decay={config.deskFireDecay}
      />
      <pointLight ref={deskFarGlow}
        position={[config.deskFireLightX, config.deskFireLightY, config.deskFireLightZ]}
        color="#ff9a45"
        intensity={config.deskFarGlowIntensity}
        distance={config.deskFarGlowReach}
        decay={config.deskFarGlowDecay}
      />
    </group>
  );
}

/*
 * ============================================================================
 *  RING SLOT 2  =  SCENE 3  ("Cabin")
 * ============================================================================
 * The wooden cabin and the bear's study inside it: table, chair, computer,
 * books, mug, papers, post-it, boxes. The cabin's wall lanterns (and the owl
 * perched on one) stay with it.
 *
 * The arcade - CRTs, cubs, consoles, picnic set, truck - is NOT here any more;
 * it moved to ArcadeSector (ring slot 1 / scene 2). Config keys here still
 * carry the historical `arcade*` prefix for the same reason the other sector
 * keeps `desk*`: renaming them would orphan saved values.
 */

/** The OnlyBears gag's lab knobs, out of the scene config. */
function onlyBearsTune(c: CampfireSceneConfig): OnlyBearsTune {
  return {
    speed: c.onlyBearsSpeed,
    pawScale: c.onlyBearsPawScale,
    scale: c.onlyBearsScale,
    x: c.onlyBearsX,
    y: c.onlyBearsY,
    z: c.onlyBearsZ,
    lean: c.onlyBearsLean,
    look: c.onlyBearsLook,
    breath: c.onlyBearsBreath,
  };
}

function CabinSector({ config, onSelect, pc, onlyBears }: {
  config: CampfireSceneConfig;
  onSelect: (n: string) => void;
  /** The cabin computer's desktop. Unset = a plain lit monitor. */
  pc?: PcGlassProps;
  /** The OnlyBears gag bear, mounted behind the computer while it plays. */
  onlyBears?: {
    mounted: boolean;
    stateRef: React.MutableRefObject<OnlyBearsState>;
    onPawLand: () => void;
    onGone: () => void;
  };
}) {
  // Top surface of the code-built Table is at y ≈ 0.62. GLB props that live on
  // the table start there; drag/scale in the lab.
  const TABLE_TOP_Y = 0.62;
  return (
    <group name="sector_cabin">
      {/* --- the cabin and its lighting -------------------------------- */}
      {/* Cool fill above the scene so unlit sides of things don't disappear.
          Kept low; the screens and the truck lamps do most of the work. */}
      <pointLight position={[0, 2.0, 1.8]} color="#8fa8c8" intensity={1.0} distance={7} decay={2} />
      {/* Wooden cabin backdrop. The cubs it was placed against have since
          moved to the old-bear camp; it stayed. Placement/scale are
          rough defaults - drag it around in the lab to line it up with the
          cubs and TVs. */}
      <Selectable
        name="arcade_wooden_cabin"
        onSelect={onSelect}
        config={config}
        basePosition={[0, 0, -2.5]}
        baseRotationY={0}
        baseScale={0.1}
      >
        {/* Inner group with negative X-scale mirrors the cabin left-to-right
            so the garage sits on the opposite side. MirroredGLBModel forces
            every material to DoubleSide - without that, three's raycaster
            misses because negative scale flips triangle winding vs the
            material's FrontSide culling, so clicks on the cabin would pass
            through instead of selecting it. */}
        <group scale={[-1, 1, 1]}>
          <SafeAsset label="wooden cabin">
            <LitWoodenCabin config={config} />
          </SafeAsset>
        </group>
      </Selectable>
      {/* Two lanterns, moved over from the desk scene. Each carries its own
          warm pointLight so it acts as a real light source. The source GLB is
          authored at about 1.3M units tall (Poly by Google), so a normalization
          group re-centers X/Z and drops it onto y=0, then scales it to ~0.5m.
          They still read the deskLantern* config keys - the objects moved
          scenes, the knobs kept their historical names. */}
      <Selectable name="old_bear_lantern" onSelect={onSelect} config={config} basePosition={[1.35, 0, 1.15]} baseRotationY={0}>
        <group scale={3.7e-7}>
          <group position={[-1090023.625, 1442.25, -159882.85]}>
            <SafeAsset label="old-bear lantern">
              <GLBModel url={OLD_BEAR_LANTERN_URL} />
            </SafeAsset>
          </group>
        </group>
        {/* Tiny candle flame inside the lantern body. Position and size come
            from config (Desk lights section) so it can be nudged onto the
            actual candle. Color follows the lantern's warm tint. */}
        <CandleFlame
          position={[config.deskLanternFlameX, config.deskLanternFlameY, config.deskLanternFlameZ]}
          scale={config.deskLanternFlameScale}
          color={new THREE.Color(config.deskLanternFlameColorR, config.deskLanternFlameColorG, config.deskLanternFlameColorB)}
          speed={config.deskLanternFlameSpeed}
          sway={config.deskLanternFlameSway}
          pulse={config.deskLanternFlamePulse}
          brightness={config.deskLanternFlameBrightness}
        />
        <pointLight
          position={[config.deskLanternLightX, config.deskLanternLightY, config.deskLanternLightZ]}
          color={new THREE.Color(config.deskLanternColorR, config.deskLanternColorG, config.deskLanternColorB)}
          intensity={config.deskLanternIntensity}
          distance={config.deskLanternDistance}
          decay={2}
        />
      </Selectable>
      <Selectable name="old_bear_lantern_2" onSelect={onSelect} config={config} basePosition={[-1.75, 0, 1.35]} baseRotationY={0.6}>
        <group scale={3.7e-7}>
          <group position={[-1090023.625, 1442.25, -159882.85]}>
            <SafeAsset label="old-bear lantern 2">
              <GLBModel url={OLD_BEAR_LANTERN_URL} />
            </SafeAsset>
          </group>
        </group>
        <CandleFlame
          position={[config.deskLanternFlameX, config.deskLanternFlameY, config.deskLanternFlameZ]}
          scale={config.deskLanternFlameScale}
          color={new THREE.Color(config.deskLanternFlameColorR, config.deskLanternFlameColorG, config.deskLanternFlameColorB)}
          speed={config.deskLanternFlameSpeed}
          sway={config.deskLanternFlameSway}
          pulse={config.deskLanternFlamePulse}
          brightness={config.deskLanternFlameBrightness}
        />
        <pointLight
          position={[config.deskLanternLightX, config.deskLanternLightY, config.deskLanternLightZ]}
          color={new THREE.Color(config.deskLanternColorR, config.deskLanternColorG, config.deskLanternColorB)}
          intensity={config.deskLanternIntensity}
          distance={config.deskLanternDistance}
          decay={2}
        />
      </Selectable>

      {/* --- the bear's study, moved here from the camping scene -------
          These override rows were dialled in while the study lived in the
          camping scene, and they are BIG - dx 4.8..8.4, dz 8.1..15.1. Carried
          over as-is that put the desk seven to fifteen units out from the
          cabin, which on a 15.2-radius ring lands it over by the camp: the
          props were in scene 3, but nowhere near the thing that defines it.

          Same treatment as the arcade set - one offset group, so the desk
          keeps its arrangement (mug on the table, books beside it) and slides
          to the cabin as a unit. Per-prop dragging still works through it. */}
      <group position={[config.cabinSetX, config.cabinSetY, config.cabinSetZ]}>
      <Selectable name="contact_table" onSelect={onSelect} config={config} basePosition={[0.15, 0, 0]} baseRotationY={0}>
        <Table />
      </Selectable>
      <Selectable name="contact_chair" onSelect={onSelect} config={config} basePosition={[-0.95, 0, 0]} baseRotationY={Math.PI / 2}>
        <Chair />
      </Selectable>
      {/* Real GLB table + chair, added alongside the code-built ones so the
          object panel can pick whichever reads better. Hide the code versions
          in the lab once you've dialled these in. */}
      <Selectable name="old_bear_table" onSelect={onSelect} config={config} basePosition={[0.15, 0, 0]} baseRotationY={0}>
        <SafeAsset label="old-bear table">
          <GLBModel url={OLD_BEAR_TABLE_URL} />
        </SafeAsset>
      </Selectable>
      <Selectable name="old_bear_chair" onSelect={onSelect} config={config} basePosition={[-0.95, 0, 0]} baseRotationY={Math.PI / 2}>
        <SafeAsset label="old-bear chair">
          <GLBModel url={OLD_BEAR_CHAIR_URL} />
        </SafeAsset>
      </Selectable>
      {/* On-table props. Base positions place them on the top surface of the
          code-built table (y = 0.62) around the bear's writing spot. */}
      <Selectable name="old_bear_computer" onSelect={onSelect} config={config} basePosition={[0.35, TABLE_TOP_Y, -0.15]} baseRotationY={Math.PI} interactive={!!pc?.hot}>
        <SafeAsset label="old-bear computer">
          <LitComputer config={config} pc={pc} />
        </SafeAsset>
        {/* The OnlyBears bear stands behind the monitor - in the computer's
            own frame, so he follows it wherever it is dragged - and only
            exists while the gag is playing. */}
        {onlyBears?.mounted ? (
          <SafeAsset label="onlybears bear">
            <OnlyBearsBear
              url={BEAR_OLD_URL}
              tune={onlyBearsTune(config)}
              look={oldBearLookFromConfig(config as unknown as Record<string, unknown>)}
              stateRef={onlyBears.stateRef}
              onPawLand={onlyBears.onPawLand}
              onGone={onlyBears.onGone}
            />
          </SafeAsset>
        ) : null}
        {/* Screen glow: bluish spill from the monitor face. Spot-light so
            it only shines out the FRONT of the screen (a pointLight was
            lighting the back of the case too). Target sits 1 unit further
            along local +Z from the light itself, so the beam extends outward
            in the direction the screen is placed - if the beam ends up
            pointing into the case instead, flip the Z offset in the light
            position slider. Angle is wide (~80 deg) with strong penumbra so
            it reads as diffuse screen wash, not a torch. */}
        {/* every knob lives in the lab's "3 · Cabin — computer screen light" group */}
        <spotLight
          visible={(config.deskComputerLightOn ?? 1) >= 0.5}
          position={[config.deskComputerLightX, config.deskComputerLightY, config.deskComputerLightZ]}
          target-position={[
            config.deskComputerLightX,
            config.deskComputerLightY + (Number.isFinite(config.deskComputerAimY) ? config.deskComputerAimY : 0),
            config.deskComputerLightZ + 1,
          ]}
          color={new THREE.Color(config.deskComputerColorR, config.deskComputerColorG, config.deskComputerColorB)}
          intensity={config.deskComputerIntensity}
          distance={config.deskComputerDistance}
          angle={THREE.MathUtils.degToRad(Math.max(1, Math.min(89, Number.isFinite(config.deskComputerAngle) ? config.deskComputerAngle : 77)))}
          penumbra={Math.max(0, Math.min(1, Number.isFinite(config.deskComputerPenumbra) ? config.deskComputerPenumbra : 0.7))}
          decay={2}
          castShadow={(config.deskComputerShadow ?? 0) >= 0.5}
          shadow-mapSize-width={512}
          shadow-mapSize-height={512}
          shadow-bias={-0.0005}
        />
      </Selectable>
      <Selectable name="old_bear_books" onSelect={onSelect} config={config} basePosition={[-0.15, TABLE_TOP_Y, -0.25]} baseRotationY={0.3}>
        <SafeAsset label="old-bear books">
          <GLBModel url={OLD_BEAR_BOOKS_URL} />
        </SafeAsset>
      </Selectable>
      <Selectable name="old_bear_mug" onSelect={onSelect} config={config} basePosition={[-0.3, TABLE_TOP_Y, 0.1]} baseRotationY={0}>
        <SafeAsset label="old-bear mug">
          <GLBModel url={OLD_BEAR_MUG_URL} />
        </SafeAsset>
      </Selectable>
      <Selectable name="old_bear_papers" onSelect={onSelect} config={config} basePosition={[-0.45, TABLE_TOP_Y, -0.05]} baseRotationY={-0.4}>
        <SafeAsset label="old-bear papers">
          <GLBModel url={OLD_BEAR_PAPERS_URL} />
        </SafeAsset>
      </Selectable>
      <Selectable name="old_bear_postit" onSelect={onSelect} config={config} basePosition={[-0.55, TABLE_TOP_Y, 0.25]} baseRotationY={0.5}>
        <SafeAsset label="old-bear post-it">
          <GLBModel url={OLD_BEAR_POSTIT_URL} />
        </SafeAsset>
      </Selectable>
      <Selectable name="old_bear_debris" onSelect={onSelect} config={config} basePosition={[0.55, TABLE_TOP_Y, 0.2]} baseRotationY={0.9}>
        <SafeAsset label="old-bear debris papers">
          <GLBModel url={OLD_BEAR_DEBRIS_URL} />
        </SafeAsset>
      </Selectable>
      {/* Floor props next to the desk. */}
      <Selectable name="old_bear_boxes" onSelect={onSelect} config={config} basePosition={[1.2, 0, -0.4]} baseRotationY={-0.2}>
        <SafeAsset label="old-bear boxes">
          <GLBModel url={OLD_BEAR_BOXES_URL} />
        </SafeAsset>
      </Selectable>
      <Selectable name="old_bear_toilet_paper" onSelect={onSelect} config={config} basePosition={[1.1, 0, 0.4]} baseRotationY={0}>
        <SafeAsset label="old-bear toilet paper">
          <GLBModel url={OLD_BEAR_TOILET_URL} />
        </SafeAsset>
      </Selectable>
      <Animal
        name="bear_contact"
        placement={CONTACT_BEAR}
        config={config}
        onSelect={onSelect}
      />
      {/* Rocking chair + its bear, tied together: both live inside the SAME
          Selectable so the chair's own drawer (name "cabin_rocking_chair")
          drags/rotates/scales the pair as one unit. The bear also keeps its
          own name ("bear_rocking_chair") for a separate seat-position nudge
          on top of that - click it directly in the lab to adjust just it.
          First-pass placement only; expect to redo it from the lab. */}
      <Selectable
        name="cabin_rocking_chair"
        onSelect={onSelect}
        config={config}
        basePosition={[1.6, 1.0, 0.9]}
        baseRotationY={0}
      >
        {/* GLB's bbox is roughly a symmetric -1..1 cube (centered pivot), so
            +1 on Y is a guess at lifting its base onto the floor rather than
            burying half of it - first thing to check/fix from the lab. */}
        <RockingChairRig>
          <SafeAsset label="rocking chair">
            <GLBModel url={ROCKING_CHAIR_URL} />
          </SafeAsset>
          <Animal
            name="bear_rocking_chair"
            placement={ROCKING_CHAIR_BEAR}
            config={config}
            onSelect={onSelect}
          />
        </RockingChairRig>
      </Selectable>
      </group>
    </group>
  );
}

/*
 * ============================================================================
 *  RING SLOT 1  =  SCENE 2  ("Arcade")
 * ============================================================================
 * The camping diorama (old_bear_camping - tent, dock, fish) with the gaming
 * cubs' arcade built around it: the CRTs, the consoles, the picnic set and the
 * truck. Anything the lab labels "2 - Arcade" is in here.
 *
 * The bear's desk - table, chair, computer, books, mug, papers - is NOT here
 * any more; it moved to CabinSector (ring slot 2 / scene 3). Config keys in
 * this sector still carry the historical `desk*` prefix (deskAmbient*,
 * deskCampfire*, deskFish*, deskBug*, deskLantern*) because renaming them
 * would orphan every saved value in campfireScene.json - the prefix is a name,
 * not a location.
 */

function ArcadeSector({ config, onSelect, crtMenu, onCrtClick, onCrtHover, crtHot = false }: {
  config: CampfireSceneConfig;
  onSelect: (n: string) => void;
  crtMenu?: CrtMenu;
  onCrtClick?: (uv: { x: number; y: number } | null) => void;
  onCrtHover?: (uv: { x: number; y: number } | null) => void;
  /** True while clicking the live tube would pull the camera into it - i.e.
   *  while it is still a prop you can walk up to. Once you are inside the
   *  close-up the SCREEN is the affordance and the chassis lighting up behind
   *  the menu would be noise. */
  crtHot?: boolean;
}) {
  const cords = useRef<CordRegistry>(new Map());
  // One colour for every CRT's throw, the way arcadeCrtGlow is one brightness
  // for all of them. It overrides each screen's own `tint` - those were sampled
  // from the artwork each tube used to play, which stopped meaning much once
  // crt_0 started drawing a menu instead.
  const crtLightColor = `#${[config.arcadeCrtLightR, config.arcadeCrtLightG, config.arcadeCrtLightB]
    .map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0"))
    .join("")}`;

  /*
   * How the tube's shadow map is shaped.
   *
   * Quality comes from the camp's own shadow settings - one set of knobs for
   * every shadow in this sector, so the lanterns and the television cannot
   * disagree about softness or bias.
   *
   * The FAR PLANE does not. It is taken from this light's own reach, because
   * the shared default is 2 world units and the tube throws further than that
   * - a caster past the far plane is simply not in the shadow camera, so the
   * chair would light up and drop no shadow at all, which looks like the
   * feature is broken rather than mis-tuned.
   */
  const tuneCrtShadow = (light: THREE.SpotLight) => {
    applyDeskShadow(light, config as unknown as Record<string, number>);
    const cam = light.shadow.camera as THREE.PerspectiveCamera;
    cam.far = Math.max(cam.near + 0.01, config.arcadeCrtLightDistance || 4);
    cam.updateProjectionMatrix();
  };

  /* Truck sits centred in front of the camera with the open bed pointed at the
     viewer. The camera lives at local +Z looking at -Z, so we point the truck's
     rear at +Z by rotating 180 deg. Scale 0.4 keeps the whole truck under 2m
     long in world space. The GLB (public/vehicles/pickup_truck.glb) has its
     rear bed wall removed - no tailgate, open bed - so the TVs sit INSIDE the
     bed rather than on a folded-down door.
     Landmark positions in world units after scale + position:
       front bumper       z ~ -1.58
       cab / bed seam     z ~ -0.14   (bed front wall, closes cab from view)
       bed rear (open)    z ~ +0.46
       bed floor Y        ~ +0.36
       bed rim top Y      ~ +0.52 */
  const TRUCK_POS: [number, number, number] = [0, 0, -0.5];
  const TRUCK_ROT_Y = Math.PI;
  const TRUCK_SCALE = 0.4;

  return (
    <group name="sector_arcade">
      {/* --- the camping diorama this scene is built around ------------- */}
      {/* Warm hemisphere fill scoped to the desk sector - sky color is the
          amber lantern tint, ground is a cool complement, kept dim so the
          lanterns/computer still do most of the lighting. */}
      <hemisphereLight
        intensity={config.deskAmbientIntensity}
        color={new THREE.Color(config.deskAmbientColorR, config.deskAmbientColorG, config.deskAmbientColorB)}
        groundColor="#1a1420"
      />
      {/* Two campers parked at the desk scene - separate instances with their
          own override rows ("desk_camper" and "desk_camper_2"), so each can
          be dragged/scaled independently in the lab. */}
      {(config.objectOverrides?.["desk_camper"]?.hide ?? 0) < 0.5 && (
        <SafeAsset label="desk camper">
          <Camper
            config={config}
            onSelect={onSelect}
            name="desk_camper"
            base={{ x: -4, y: 0, z: -2, rotY: Math.PI / 2, scale: 0.4 }}
          />
        </SafeAsset>
      )}
      {(config.objectOverrides?.["desk_camper_2"]?.hide ?? 0) < 0.5 && (
        <SafeAsset label="desk camper 2">
          <Camper
            config={config}
            onSelect={onSelect}
            name="desk_camper_2"
            base={{ x: 4, y: 0, z: -2, rotY: -Math.PI / 2, scale: 0.4 }}
          />
        </SafeAsset>
      )}
      {/* Caravan parked behind the bear (bear sits at x=-0.95 facing +X, so
          "behind" = further -X). Caravan model is authored huge (~80 units
          long), so scale is tiny; drag/scale in the lab to place. */}
      <Selectable name="caravan" onSelect={onSelect} config={config} basePosition={[-2.8, 0, 0.5]} baseRotationY={Math.PI / 2} baseScale={0.03}>
        <SafeAsset label="caravan">
          <LitCaravan url={CARAVAN_URL} config={config} />
        </SafeAsset>
      </Selectable>
      {/* Hollow-window variant parked next to the original for side-by-side
          comparison. Same base scale so the sizes match. */}
      <Selectable name="caravan_hollow" onSelect={onSelect} config={config} basePosition={[-2.8, 0, 3.5]} baseRotationY={Math.PI / 2} baseScale={0.03}>
        <SafeAsset label="caravan hollow">
          <HollowCaravan url={CARAVAN_HOLLOW_URL} config={config} />
        </SafeAsset>
      </Selectable>
      {/* Raw camping scene GLB — the lamps glow via their emissive materials
          alone, no THREE.PointLight per Lamp mesh (attaching point lights
          onto all 32 Lamp-material meshes was ~4x slowing every fragment
          shader). Trees are peeled out of the base scene and wrapped in
          their own Selectables so they can be individually clicked, dragged,
          scaled, or hidden in the object lab. */}
      <Selectable name="old_bear_camping" onSelect={onSelect} config={config} basePosition={[0, 0, -6]} baseRotationY={0} baseScale={1}>
        <SafeAsset label="old-bear camping">
          <CampingWithSelectableTrees url={OLD_BEAR_CAMPING_URL} config={config} onSelect={onSelect} />
        </SafeAsset>
      </Selectable>
      {/* The diorama's own fire was deleted from camping.glb; this is the
          same procedural fire the campfire and arcade sectors run.

          It is parented to an ANCHOR that mirrors the camping Selectable's
          resolved transform, so the fire lives in camping.glb's own
          coordinate system rather than the sector's. That matters because
          the diorama is not sitting at identity - right now it carries a
          0.207 scale and a -2.71 rad heading from its override row. Placed
          as a plain sibling, deskCampfireY 1.3 put the fire more than a
          metre above a camp whose ground had been scaled down to y ~0.5, so
          the ground-glow disc hung in mid-air with nothing under it to light
          - which is exactly what "I can't control the glow" looks like.

          Anchored, deskCampfireX/Y/Z are measured straight off the GLB (the
          old fire pit is at 4.25, 1.30, -0.07 in camping.glb) and STAY right
          when the camp is dragged, spun or resized. The Selectable is still
          nested inside, so the fire keeps its own override row and can be
          nudged off the pit; ObjectDragLayer resolves drags through
          `parent.worldToLocal`, so those nudges land in camp-local units and
          the anchor is transparent to it. */}
      {(config.objectOverrides?.["desk_campfire"]?.hide ?? 0) < 0.5 && (() => {
        const camp = config.objectOverrides?.["old_bear_camping"] ?? EMPTY_OVERRIDE;
        return (
          <group
            position={[0 + camp.dx, 0 + camp.dy, -6 + camp.dz]}
            rotation={new THREE.Euler(camp.rotX, camp.rotY, camp.rotZ, "XZY")}
            scale={camp.scale}
          >
            <Selectable
              name="desk_campfire"
              onSelect={onSelect}
              config={config}
              basePosition={[config.deskCampfireX, config.deskCampfireY, config.deskCampfireZ]}
              baseRotationY={config.deskCampfireRotationY}
              baseScale={config.deskCampfireScale}
            >
              <SafeAsset label="desk campfire">
                <DeskCampfire config={config} />
              </SafeAsset>
            </Selectable>
          </group>
        );
      })()}
      {/* Poly-by-Google caravan added to the old-bear folder. Source is ~80
          units long, so a normalization group centers X/Z and sinks the min
          Y to zero, then scales to ~2 m long. Drag/scale via its Selectable. */}
      <Selectable name="old_bear_caravan" onSelect={onSelect} config={config} basePosition={[3, 0, -2]} baseRotationY={-Math.PI / 2}>
        <group scale={0.025}>
          <group position={[1.3357, 1, -6.5707]}>
            <SafeAsset label="old-bear caravan">
              <LitCaravan url={OLD_BEAR_CARAVAN_URL} config={config} />
            </SafeAsset>
          </group>
        </group>
      </Selectable>

      {/* --- the arcade proper, moved here from the cabin scene ---------
          Every base position in here was laid out around the CABIN's origin,
          so carrying the set over dropped it at z -2.6..-1.3 - which in this
          scene is right at the camera's feet (it stands at z -2.56 looking
          toward +0.35), hence the row of snacks across the foreground.

          Rather than rewrite twenty override rows and lose the arrangement,
          the whole set hangs off ONE offset group. Everything inside keeps its
          relative layout - the CRT stays on the picnic table - and the three
          arcadeSet* sliders slide the set around the camp as a unit.
          ObjectDragLayer resolves drags through `parent.worldToLocal`, so
          per-prop dragging still lands in the prop's own frame and this group
          is transparent to it. */}
      <group position={[config.arcadeSetX, config.arcadeSetY, config.arcadeSetZ]}>
      {/* Truck: backed in to camera, open bed pointed at the viewer, headlights
          + tail lights burning. Still Selectable so the panel can move it. */}
      <Selectable
        name="truck"
        onSelect={onSelect}
        config={config}
        basePosition={TRUCK_POS}
        baseRotationY={TRUCK_ROT_Y}
        baseScale={TRUCK_SCALE}
      >
        <SafeAsset label="pickup truck">
          <LitPickupTruck config={config} onSelect={onSelect} />
        </SafeAsset>
      </Selectable>
      {/* Everything that had drifted into the old-bear camp, brought back and
          grouped around the cabin: the CRTs, the cubs and their consoles, and
          the picnic set. The cord registry travels with the cubs - it is the
          ref their controller wires resolve against. Positions below are
          derived from the cabin's own placement, so moving the cabin makes
          them stale; re-derive rather than nudging each one. */}
      {/* The CRTs, sitting over the camper van in the old-bear camp.
          The van has no group of its own in camping.glb - every mesh hangs off
          one flat root - so its roof was found from a landmark instead: the
          headlights, which measure x -1.46, z 4.29, topping out at y 2.71 in
          camping.glb units. Through that diorama's own transform (basePosition
          z -6, offset 0.73/0.80/5.59, scale 0.173) they land at (0.47, 1.27,
          0.33) here, which is what the crt_0 override below is written
          against. Move the camp and the saved override goes stale - re-derive
          rather than nudging blind.
          crt_1..3 stay hidden; crt_0 is the live one. */}
      {ARCADE_SCREENS.map((screen, i) => {
        const col = i % 2;                 // 0 left, 1 right
        const row = Math.floor(i / 2);     // 0 bottom, 1 top
        const x = (col - 0.5) * 2 * 0.19;
        const y = row === 0 ? 0.365 : 0.365 + 0.28 * 0.72;
        const z = row === 0 ? 0.36 : 0.02;
        // Multiply each screen's baked-in glow by the shared arcadeCrtGlow
        // knob so one slider moves all four together.
        const scaledScreen = {
          ...screen,
          glow: (screen.glow ?? 1) * config.arcadeCrtGlow,
          // Only crt_0 is driven; the rest keep whatever they were given.
          ...(i === 0 && crtMenu ? { menu: crtMenu } : {}),
        };
        return (
          <Selectable
            key={i}
            name={`crt_${i}`}
            onSelect={onSelect}
            config={config}
            // Only crt_0 does anything - the other three are scenery.
            interactive={i === 0 && crtHot}
            basePosition={[x, y, z]}
            baseRotationY={0}
            baseScale={0.72}
          >
            <RetroCrtTv
              screen={scaledScreen}
              seed={i}
              hot={i === 0 && crtHot}
              onScreenClick={i === 0 ? onCrtClick : undefined}
              onScreenHover={i === 0 ? onCrtHover : undefined}
              light={{
                forwardOffset: config.arcadeCrtLightForwardOffset,
                angle: config.arcadeCrtLightAngle,
                penumbra: config.arcadeCrtLightPenumbra,
                distance: config.arcadeCrtLightDistance,
                decay: config.arcadeCrtLightDecay,
                intensityScale: config.arcadeCrtLightIntensity,
                offsetX: config.arcadeCrtLightOffsetX,
                offsetY: config.arcadeCrtLightOffsetY,
                color: crtLightColor,
                // Only the live tube. The other three are hidden, and a depth
                // pass each would be paid for nothing.
                castShadow: i === 0
                  && config.shadowsEnabled >= 0.5
                  && config.arcadeCrtShadow >= 0.5,
                tuneShadow: tuneCrtShadow,
              }}
            />
          </Selectable>
        );
      })}
      {/* The arcade set, moved over from the truck. Parked in a row ABOVE
          the camp so it is impossible to miss - these are find-me values, not
          final ones. The cord registry came with the cubs: it is the ref their
          controller wires resolve against, and it was declared in
          ArcadeSector, so leaving it behind would have snapped every wire. */}
      <Selectable
        name="arcade_honey_wand"
        onSelect={onSelect}
        config={config}
        basePosition={[0.75, 0.02, 1.7]}
        baseRotationY={0}
        baseScale={0.2}
      >
        <SafeAsset label="honey wand">
          <GLBModel url={HONEY_WAND_URL} />
        </SafeAsset>
      </Selectable>
      {/* Four cubs on the ground between the TVs and the camera, facing back
          toward the truck - viewer sees the backs of their heads and the
          glowing screens beyond, classic "kids on the floor" arcade shot. */}
      {ARCADE_CUBS.map((placement, i) => {
        const name = `arcade_cub_${i}`;
        if ((config.objectOverrides?.[name]?.hide ?? 0) >= 0.5) return null;
        return (
          <SafeAsset key={name} label={`arcade cub ${i}`}>
            <Animal
              name={name}
              placement={placement}
              config={config}
              onSelect={onSelect}
              cords={cords}
              seed={i + 20}
            />
          </SafeAsset>
        );
      })}
      {/* Extra consoles added to /public/bear/cub. Each source has wildly
          different authoring units, so the wrapper groups anchor min-Y to 0
          and re-center X/Z; the baseScale then sets the console's final size.
          All three are Selectable, so drag/scale in the drawer to place them
          around the cubs. */}
      <Selectable
        name="arcade_xbox360"
        onSelect={onSelect}
        config={config}
        basePosition={[-1.2, 0, 0.9]}
        baseRotationY={0}
        baseScale={0.02}
      >
        <group position={[8.179, 1.495, 0.977]}>
          <SafeAsset label="xbox 360">
            <GLBModel url={XBOX360_URL} />
          </SafeAsset>
        </group>
      </Selectable>
      <Selectable
        name="arcade_gamecube_console"
        onSelect={onSelect}
        config={config}
        basePosition={[0.0, 0, 0.9]}
        baseRotationY={0}
        baseScale={0.014}
      >
        <group position={[0, ARCADE_CONSOLE_LIFT, 1.107]}>
          <SafeAsset label="gamecube console">
            <GLBModel url={GAMECUBE_CONSOLE_URL} />
          </SafeAsset>
          {/* Plugs and leads live with the sockets - see ConsolePorts. */}
          <ConsolePorts cords={cords} cubNames={ARCADE_PORT_CUBS} />
        </group>
      </Selectable>
      {/* The picnic set, moved over with the CRTs. Same block as before -
          only the sector changed, so every prop keeps its own Selectable and
          its scale/rotation overrides. Their dx/dz were rewritten to sit under
          the CRT rather than carried across: the old ones put eleven of them
          in a heap out at (-3.7, -2.0) and the pretzel at z 13.8, which is
          what "the middle of nowhere" was. */}
      {ARCADE_CUB_PROPS.map((prop) => (
        <Selectable
          key={prop.name}
          name={prop.name}
          onSelect={onSelect}
          config={config}
          basePosition={prop.position}
          baseRotationY={prop.rotationY ?? 0}
          baseScale={prop.scale}
        >
          <SafeAsset label={prop.label}>
            <GLBModel url={prop.url} />
          </SafeAsset>
        </Selectable>
      ))}
      {/* Second campfire, off to one side of the truck so the arcade scene
          has its own light source and reads as a lit-up hangout at night.
          Selectable so it drags with the object drawer. */}
      <Selectable
        name="arcade_campfire"
        onSelect={onSelect}
        config={config}
        basePosition={[config.arcadeCampfireX, config.arcadeCampfireY, config.arcadeCampfireZ]}
        baseRotationY={config.arcadeCampfireRotationY}
        baseScale={config.arcadeCampfireScale}
      >
        <ArcadeCampfire config={config} />
      </Selectable>
      </group>
    </group>
  );
}

/**
 * One continuous circle of ground under the whole campsite.
 *
 * Sized off the ring so it always reaches well past the outermost location - grow the
 * ring and the ground grows with it, instead of the locations walking off the edge.
 * The rim is left out beyond the fog rather than being drawn as a hard line.
 */
/**
 * The three inter-camp paths and the forest of pines that surround the
 * campsite. Paths are straight strips on the ground between camp centres;
 * the forest fills the ring outside `forestClearRadius`, excluding a
 * corridor of half-width `pathCorridorHalfWidth` around each path so the
 * camera at any camp keeps a clear sight-line to the other two. Every tree
 * is an instance of one shared trunk cylinder + cone foliage, so hundreds
 * cost only two draw calls. Tree Y grows from the ground (geometry is
 * pre-translated so uniform scale keeps the base at y=0), which means
 * `forestTreeHeight` scales without floating or sinking.
 */
const FOREST_TREE_PREFIX = "forest_tree_";

function ForestAndPaths({ config, onSelect }: { config: CampfireSceneConfig; onSelect: (name: string) => void }) {
  const camps = useMemo(() => {
    const arr: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < LOCATION_COUNT; i++) {
      const a = LOCATION_AZIMUTH(i, config);
      arr.push({ x: Math.sin(a) * config.locationRadius, z: Math.cos(a) * config.locationRadius });
    }
    return arr;
  }, [config]);

  const paths = useMemo(() => (
    [
      [camps[0], camps[1]] as const,
      [camps[1], camps[2]] as const,
      [camps[2], camps[0]] as const,
    ]
  ), [camps]);

  const trees = useMemo(() => {
    const distToSegment = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((px - ax) * dx + (pz - az) * dz) / len2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = ax + t * dx, cz = az + t * dz;
      return Math.hypot(px - cx, pz - cz);
    };

    type Tree = { x: number; z: number; scale: number; rotY: number };
    const out: Tree[] = [];
    const rand = seededRandom(1729);
    const target = Math.max(0, Math.round(config.forestTreeCount));
    const inner = Math.max(1, config.locationRadius - config.forestClearRadius * 0.3);
    const outer = Math.max(inner + 1, config.forestOuterRadius);

    let attempts = 0;
    const maxAttempts = target * 20;
    while (out.length < target && attempts < maxAttempts) {
      attempts++;
      const theta = rand() * Math.PI * 2;
      const r = inner + rand() * (outer - inner);
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      let skip = false;
      for (const c of camps) {
        if (Math.hypot(x - c.x, z - c.z) < config.forestClearRadius) { skip = true; break; }
      }
      if (skip) continue;
      for (const [a, b] of paths) {
        if (distToSegment(x, z, a.x, a.z, b.x, b.z) < config.pathCorridorHalfWidth) { skip = true; break; }
      }
      if (skip) continue;

      out.push({ x, z, scale: 0.75 + rand() * 0.7, rotY: rand() * Math.PI * 2 });
    }

    const spacing = Math.max(0.4, config.pathFlankSpacing);
    for (const [a, b] of paths) {
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const ux = dx / len, uz = dz / len;
      const nx = -uz, nz = ux;
      const steps = Math.floor(len / spacing);
      for (let i = 1; i < steps; i++) {
        const t = i * spacing;
        const cx = a.x + ux * t;
        const cz = a.z + uz * t;
        let nearCamp = false;
        for (const c of camps) {
          if (Math.hypot(cx - c.x, cz - c.z) < config.forestClearRadius) { nearCamp = true; break; }
        }
        if (nearCamp) continue;
        const flank = config.pathCorridorHalfWidth + 0.4 + rand() * 1.4;
        out.push({ x: cx + nx * flank, z: cz + nz * flank, scale: 0.8 + rand() * 0.6, rotY: rand() * Math.PI * 2 });
        out.push({ x: cx - nx * flank, z: cz - nz * flank, scale: 0.8 + rand() * 0.6, rotY: rand() * Math.PI * 2 });
      }
    }

    return out;
  }, [camps, paths, config.forestTreeCount, config.forestClearRadius, config.forestOuterRadius, config.pathCorridorHalfWidth, config.pathFlankSpacing, config.locationRadius]);

  // Real pine model, flattened into (geometry, material) pairs so each mesh in
  // the template becomes one InstancedMesh. World matrices are baked into the
  // cloned geometries so an instance matrix (position+rotation+scale) alone
  // places the tree correctly; the bounding-box translate re-anchors the base
  // to y=0 so uniform scale keeps every trunk rooted to the ground.
  const pineGltf = useGLTF(PINE_TREE_URL) as unknown as { scene: THREE.Group };
  const templates = useMemo(() => {
    const out: Array<{
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
    }> = [];
    if (!pineGltf?.scene) return out;
    const root = pineGltf.scene;
    root.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) meshes.push(m);
    });
    if (meshes.length === 0) return out;
    // Compute the union bounding box across ALL meshes in world space so a
    // multi-mesh pine still anchors as a whole rather than each part
    // independently.
    const union = new THREE.Box3();
    for (const mesh of meshes) {
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      g.computeBoundingBox();
      if (g.boundingBox) union.union(g.boundingBox);
      g.dispose();
    }
    const offsetX = -(union.min.x + union.max.x) / 2;
    const offsetY = -union.min.y;
    const offsetZ = -(union.min.z + union.max.z) / 2;
    for (const mesh of meshes) {
      const geom = mesh.geometry.clone();
      geom.applyMatrix4(mesh.matrixWorld);
      geom.translate(offsetX, offsetY, offsetZ);
      // applyMatrix4/translate leave the cached bounds stale. Mesh.raycast uses
      // the bounding sphere as its broad phase, so a stale one can reject hits
      // on trees that are really there.
      geom.computeBoundingBox();
      geom.computeBoundingSphere();
      out.push({ geometry: geom, material: mesh.material });
    }
    return out;
  }, [pineGltf]);

  useEffect(() => {
    return () => {
      for (const t of templates) t.geometry.dispose();
    };
  }, [templates]);

  const instRefs = useRef<Array<THREE.InstancedMesh | null>>([]);

  /*
   * Every tree, always. The forest was distance-culled for a while; it is not
   * worth it and it is not free. A pine here is 264 TRIANGLES, so all 356 of
   * them together are ~94k triangles in two draw calls - next to nothing, and
   * far less than one face of a shadow cube. Any cut-off, however generous,
   * buys frames you cannot measure in exchange for trees that vanish, which is
   * the one thing you actually notice. Slot i is tree i; keep it that way.
   */
  useEffect(() => {
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const eul = new THREE.Euler();
    const overrides = config.objectOverrides ?? {};
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      // Per-instance override: dx/dy/dz nudge, scale multiplier, hide flag.
      // Stored under `forest_tree_<i>` so the panel's slider updates land in
      // the same objectOverrides bucket as every other Selectable prop.
      // Indexing is stable as long as the seed inputs (forestTreeCount,
      // forestClearRadius, forestOuterRadius, pathCorridorHalfWidth,
      // pathFlankSpacing, locationRadius) don't change — those are the ones
      // that would shuffle the seeded RNG walk.
      const ov = overrides[`${FOREST_TREE_PREFIX}${i}`];
      const hidden = (ov?.hide ?? 0) >= 0.5;
      const s = hidden ? 0 : t.scale * config.forestTreeHeight * config.treeScale * (ov?.scale ?? 1);
      pos.set(t.x + (ov?.dx ?? 0), config.treeY + (ov?.dy ?? 0), t.z + (ov?.dz ?? 0));
      eul.set(0, t.rotY + (ov?.rotY ?? 0), 0);
      q.setFromEuler(eul);
      scl.set(s, s, s);
      mat.compose(pos, q, scl);
      for (const inst of instRefs.current) {
        if (!inst) continue;
        inst.setMatrixAt(i, mat);
      }
    }
    for (const inst of instRefs.current) {
      if (!inst) continue;
      inst.count = trees.length;
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
    }
  }, [trees, templates, config.forestTreeHeight, config.treeScale, config.treeY, config.objectOverrides]);

  const forestOn = config.forestEnabled >= 0.5 && trees.length > 0 && templates.length > 0;
  const pathsOn = config.pathVisible >= 0.5;

  return (
    <group>
      {forestOn
        ? templates.map((tpl, idx) => (
            <instancedMesh
              key={`forest-${idx}`}
              ref={(node) => { instRefs.current[idx] = node; }}
              args={[tpl.geometry, tpl.material, Math.max(1, trees.length)]}
              /*
               * Off by default, and it is the single biggest saving here.
               * The scene's only shadow casters are the campfires - a point
               * light (SIX cube faces) plus a spot light each. Because the
               * forest is frustumCulled={false}, WebGLShadowMap's own frustum
               * test is skipped and every one of those faces re-renders the
               * whole forest. What it buys is the shadow of whichever pine
               * happens to fall between the clear radius (6) and the fire's
               * reach (8.9), thrown outward onto ground you are not looking
               * at. forestCastShadow puts it back if that trade ever changes.
               */
              castShadow={config.forestCastShadow >= 0.5}
              receiveShadow
              frustumCulled={false}
              // Per-instance selection: r3f fills in `instanceId` on hits
              // against an InstancedMesh, so we route it back through the same
              // onSelect stream the Selectables use. Downstream the object
              // sliders and the "don't cast shadow" toggle key off
              // `forest_tree_<i>` in objectOverrides.
              onClick={(e: ThreeEvent<MouseEvent> & { instanceId?: number }) => {
                const id = e.instanceId;
                if (id == null) return;
                e.stopPropagation();
                onSelect(`${FOREST_TREE_PREFIX}${id}`);
              }}
            />
          ))
        : null}
      {pathsOn ? paths.map(([a, b], i) => {
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
        // Plane is authored in XY; after rotation.x = -π/2 it lies flat with
        // its length (Y) pointing along world -Z. Rotation.z then swings around
        // world +Y (intrinsic XYZ ordering means the third rotation is around
        // the plane's own normal, which after the flatten is world +Y).
        // Rotating (0,0,-1) around +Y by θ gives (-sin θ, 0, -cos θ), so to
        // align with direction (dx, dz) we need sin θ = -dx/L, cos θ = -dz/L,
        // i.e. θ = atan2(-dx, -dz). The plane is symmetric so a 180° flip is
        // invisible, meaning atan2(dx, dz) works just as well — but the point
        // is: no minus sign in front. The previous formula (-atan2(dx, dz))
        // mirrored the plane across the Z axis, which read as correct only
        // for paths with dz = 0 (arcade ↔ desk) and wrong for the other two.
        const angleY = Math.atan2(-dx, -dz);
        return (
          <mesh
            key={`path-${i}`}
            position={[cx, 0.005, cz]}
            rotation={[-Math.PI / 2, 0, angleY]}
          >
            <planeGeometry args={[Math.max(0.02, config.pathWidth), len]} />
            <meshBasicMaterial color="#f4f4ee" transparent opacity={0.85} depthWrite={false} />
          </mesh>
        );
      }) : null}
    </group>
  );
}

/** Deterministic PRNG. The patch outlines have to be identical on every
 *  reload - Math.random() would reshuffle them each refresh. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One irregular ground patch: a flat polygon lying in XZ, triangulated as a
 * fan from its centre.
 *
 * This is how the desk diorama does it, and it is worth writing down because
 * the first two attempts at this feature painted a canvas gradient instead
 * and it never read. In camping.glb the camp's dirt is NOT a texture on the
 * terrain - it is "Object_222", its own 300-triangle mesh in a separate
 * material (Material.045, 0.227/0.133/0.063) laid over the tan ground
 * (Material.108, 0.316/0.197/0.076). Raycasting anywhere near that camp hits
 * Object_222 first and the terrain 3.5 units below. Its outline is 844 short
 * straight segments, median 0.95 units long across a patch ~27 units wide -
 * so the edge is hard, angular and jagged, never a fade.
 *
 * `jag` pulls each boundary vertex in by a random fraction of the radius.
 * Because it is per-vertex and uncorrelated, neighbouring vertices differ a
 * lot and the silhouette comes out spiky rather than a wobbly circle.
 *
 * Normals are written explicitly as +Y instead of computed: the fan's winding
 * decides which way computeVertexNormals points them, and a patch lit from
 * below is invisible. DoubleSide then covers the winding for the raster side.
 */
function makeGroundPatch(
  sides: number, radius: number, jag: number, spin: number, round: number, seed: number,
) {
  const rnd = mulberry32(seed >>> 0);
  const n = Math.max(3, Math.round(sides));

  // Two ways to vary the radius, blended by `round`:
  //
  //  spiky  - an independent random per vertex. Neighbours are uncorrelated,
  //           so the outline jumps in and out and reads as torn.
  //  smooth - three low harmonics around the circle. sin(k*a) is exactly
  //           periodic in a, so vertex 0 and vertex n-1 still meet cleanly,
  //           and because it is low frequency the radius drifts across many
  //           vertices instead of per vertex - broad lobes, a rounded
  //           silhouette, still made of straight segments.
  //
  // The harmonics are drawn BEFORE the per-vertex values and always in the
  // same quantity, so turning Round up and down reshapes the same outline
  // rather than reshuffling it.
  const harm: { a: number; phi: number }[] = [];
  for (let k = 0; k < 3; k++) harm.push({ a: 0.4 + rnd() * 0.6, phi: rnd() * Math.PI * 2 });
  const ampSum = harm.reduce((t, h) => t + h.a, 0) || 1;

  const pos: number[] = [0, 0, 0];
  const nor: number[] = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2;
    let h = 0;
    for (let k = 0; k < 3; k++) h += harm[k].a * Math.sin((k + 2) * a + harm[k].phi);
    const smooth = (h / ampSum + 1) / 2;               // 0..1, low frequency
    const spiky = rnd();                                // 0..1, per vertex
    const mix = spiky + (smooth - spiky) * Math.max(0, Math.min(1, round));
    const r = radius * (1 - jag * mix);
    pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    nor.push(0, 1, 0);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * The two trodden-ground patches around the campfire: a broader mid patch and
 * a smaller, lighter core, stacked on the ground disc the way the diorama
 * stacks its dirt on its terrain.
 *
 * Both sit at the CAMPFIRE camp, which is location 0 on the ring at world
 * (sin a, cos a) * locationRadius - about (0.18, -15.20) - NOT at the world
 * origin, which is the ring's hub 15 units away.
 *
 * Placement is two-tier: the group carries the shared Offset X/Z, and each
 * patch then carries its own Offset X/Z inside it. So the pair can be moved
 * together without losing however they were arranged relative to each other,
 * and the inner patch can be pushed off-centre from the outer - which is what
 * makes the two rings read as worn ground rather than as a target.
 *
 * Radii have to stay small. The ground reads only where the fire lights it,
 * and the fire's point light reaches about 8.9 units; anything authored
 * beyond that is drawn in the dark.
 */
function GroundPatches({ config, centreX, centreZ }: { config: CampfireSceneConfig; centreX: number; centreZ: number }) {
  const layers = useMemo(() => {
    // A PRNG each, seeded from the shared seed plus the layer index. Sharing
    // one stream meant the vertex count of one patch shifted the sequence the
    // other drew from, so nudging the inner Sides silently reshuffled the
    // outer outline underneath it.
    const seed = Math.max(1, Math.round(config.groundPatchSeed));
    const outer = makeGroundPatch(config.groundPatchOuterSides, config.groundPatchOuterRadius,
                                  config.groundPatchOuterJag, config.groundPatchOuterSpin,
                                  config.groundPatchOuterRound, seed * 2654435761);
    const inner = makeGroundPatch(config.groundPatchInnerSides, config.groundPatchInnerRadius,
                                  config.groundPatchInnerJag, config.groundPatchInnerSpin,
                                  config.groundPatchInnerRound, seed * 40503 + 917);
    return { outer, inner };
  }, [config.groundPatchSeed,
      config.groundPatchOuterSides, config.groundPatchOuterRadius, config.groundPatchOuterJag,
      config.groundPatchOuterSpin, config.groundPatchOuterRound,
      config.groundPatchInnerSides, config.groundPatchInnerRadius, config.groundPatchInnerJag,
      config.groundPatchInnerSpin, config.groundPatchInnerRound]);
  useEffect(() => () => { layers.outer.dispose(); layers.inner.dispose(); }, [layers]);

  const outerColor = useMemo(() => new THREE.Color(
    config.groundPatchOuterR, config.groundPatchOuterG, config.groundPatchOuterB),
    [config.groundPatchOuterR, config.groundPatchOuterG, config.groundPatchOuterB]);
  const innerColor = useMemo(() => new THREE.Color(
    config.groundPatchInnerR, config.groundPatchInnerG, config.groundPatchInnerB),
    [config.groundPatchInnerR, config.groundPatchInnerG, config.groundPatchInnerB]);

  if (config.groundPatchOn < 0.5) return null;
  return (
    <group position={[centreX, 0, centreZ]}>
      {/* renderOrder is explicit because these two are near coplanar. Three
          sorts the transparent pass back-to-front by distance, and at a few
          millimetres apart that ordering can flip as the camera swings -
          which would show as the inner patch blinking behind the outer one.
          depthWrite comes off with transparency for the same reason it does
          on the fire's glow disc: a see-through decal that still writes depth
          occludes whatever is meant to show through it. */}
      <mesh
        geometry={layers.outer}
        position={[config.groundPatchOuterOffsetX, -0.02 + config.groundPatchOuterY, config.groundPatchOuterOffsetZ]}
        renderOrder={1}
        receiveShadow
      >
        <meshStandardMaterial
          color={outerColor} roughness={0.97} metalness={0} flatShading side={THREE.DoubleSide}
          transparent={config.groundPatchOuterOpacity < 0.999}
          opacity={config.groundPatchOuterOpacity}
          depthWrite={config.groundPatchOuterOpacity >= 0.999}
        />
      </mesh>
      <mesh
        geometry={layers.inner}
        position={[config.groundPatchInnerOffsetX, -0.02 + config.groundPatchInnerY, config.groundPatchInnerOffsetZ]}
        renderOrder={2}
        receiveShadow
      >
        <meshStandardMaterial
          color={innerColor} roughness={0.97} metalness={0} flatShading side={THREE.DoubleSide}
          transparent={config.groundPatchInnerOpacity < 0.999}
          opacity={config.groundPatchInnerOpacity}
          depthWrite={config.groundPatchInnerOpacity >= 0.999}
        />
      </mesh>
    </group>
  );
}

/**
 * The visibility half of <Location>, on its own. For world-space things that
 * belong to one camp but must NOT inherit the ring transform: the dirt patches
 * are already positioned in world coordinates, so parenting them under
 * <Location> would rotate and translate them off the camp entirely.
 */
function SiteGate({
  index,
  config,
  gate,
  children,
}: {
  index: number;
  config: CampfireSceneConfig;
  gate: boolean;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const cfg = useRef(config);
  cfg.current = config;
  const gateRef = useRef(gate);
  gateRef.current = gate;
  useFrame(({ camera }) => {
    if (!ref.current) return;
    if (!gateRef.current) {
      ref.current.visible = true;
      return;
    }
    const a = LOCATION_AZIMUTH(index, cfg.current);
    const camAngle = Math.atan2(camera.position.x, camera.position.z);
    ref.current.visible = Math.abs(shortestTurn(camAngle, a)) < LOCATION_VISIBLE_ARC;
  });
  return <group ref={ref}>{children}</group>;
}

function CampfireGround({ config, gate = false }: { config: CampfireSceneConfig; gate?: boolean }) {
  const radius = Math.max(30, config.locationRadius + 24);
  // Location 0 IS the campfire camp. Same placement ringMatrix uses, so the
  // patches track the camp if the ring is rotated or resized.
  const centreA = LOCATION_AZIMUTH(0, config);
  const centreX = Math.sin(centreA) * config.locationRadius + config.groundPatchOffsetX;
  const centreZ = Math.cos(centreA) * config.locationRadius + config.groundPatchOffsetZ;
  // Same placement math, at the cabin's own slot (location 2) instead - see
  // cabinGroundPatchOn in sceneConfig.ts for why this is a second GroundPatches
  // mount rather than a third layer bolted onto the existing one.
  const cabinA = LOCATION_AZIMUTH(LOCATION_CABIN, config);
  const cabinCentreX = Math.sin(cabinA) * config.locationRadius + config.cabinGroundPatchOffsetX;
  const cabinCentreZ = Math.cos(cabinA) * config.locationRadius + config.cabinGroundPatchOffsetZ;
  const color = useMemo(
    () => new THREE.Color(config.groundColorR, config.groundColorG, config.groundColorB),
    [config.groundColorR, config.groundColorG, config.groundColorB],
  );
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[radius, 96]} />
        <meshStandardMaterial color={color} roughness={0.96} metalness={0} />
      </mesh>
      {/* The patches are the campfire's dirt clearing, and nothing else's.
          Gated with location 0 for the same reason the camp itself is: without
          this the tent, fire and props blink off as you swing away and leave a
          bare scorched circle sitting on the grass with nothing in it. */}
      <SiteGate index={LOCATION_CAMPFIRE} config={config} gate={gate}>
        <GroundPatches config={config} centreX={centreX} centreZ={centreZ} />
      </SiteGate>
      {/* Same clearing, same shape/colour knobs, parked outside the cabin
          instead - cabinGroundPatchOn is its own switch on top of
          GroundPatches' internal groundPatchOn check, so this ring can be
          hidden without also hiding the campfire's. */}
      {config.cabinGroundPatchOn >= 0.5 && (
        <SiteGate index={LOCATION_CABIN} config={config} gate={gate}>
          <GroundPatches config={config} centreX={cabinCentreX} centreZ={cabinCentreZ} />
        </SiteGate>
      )}
    </>
  );
}

/**
 * Dev-only instrumentation, mounted at ?perf. Reports what the renderer ACTUALLY
 * did last frame rather than what we assume it did - draw calls, triangles, how
 * many lights are live, and how many shadow maps are being fed. Every number
 * here is read off three itself.
 */
function PerfProbe({ onSample }: { onSample: (s: PerfSample) => void }) {
  const frames = useRef(0);
  const since = useRef(0);
  useFrame(({ gl, scene, clock }) => {
    frames.current++;
    const now = clock.elapsedTime;
    if (since.current === 0) since.current = now;
    if (now - since.current < 0.5) return;
    const fps = frames.current / (now - since.current);
    frames.current = 0;
    since.current = now;
    let lights = 0;
    let shadowMaps = 0;
    let shadowTexels = 0;
    scene.traverse((o) => {
      const l = o as THREE.Light;
      if (!l.isLight || !l.visible) return;
      lights++;
      if (!l.castShadow || !l.shadow) return;
      // A point light's shadow is a CUBE: six faces off one map size.
      const faces = (l as THREE.PointLight).isPointLight ? 6 : 1;
      shadowMaps += faces;
      shadowTexels += faces * l.shadow.mapSize.x * l.shadow.mapSize.y;
    });
    const size = new THREE.Vector2();
    gl.getSize(size);
    const dpr = gl.getPixelRatio();
    onSample({
      fps,
      calls: gl.info.render.calls,
      tris: gl.info.render.triangles,
      progs: gl.info.programs?.length ?? 0,
      geoms: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      lights,
      shadowMaps,
      shadowTexels,
      screenTexels: size.x * dpr * size.y * dpr,
    });
  });
  return null;
}

type PerfSample = {
  fps: number; calls: number; tris: number; progs: number;
  geoms: number; textures: number; lights: number;
  shadowMaps: number; shadowTexels: number; screenTexels: number;
};

/**
 * Keeps the fog honest when the camera pulls back.
 *
 * config.fogFar is tuned for a camera parked at a camp, a few units off the
 * fire. The title card is not that: IntroFlight hauls the camera tens of units
 * out, and at that range a fogFar of ~40 puts the ENTIRE campsite past the far
 * plane of the gradient, so every pixel resolves to pure sky colour and the
 * screen goes black. (titleFlyFogSquash was meant to cover this and was wired
 * to IntroFlight as a prop, but nothing ever read it - grep for scene.fog and
 * there was no writer at all.)
 *
 * So the far plane never goes below what the current shot needs: whichever is
 * larger of the tuned value and the camera's own distance from the nearest camp
 * times a multiplier. Parked, the distance term is the smaller of the two and
 * the fog is exactly as tuned - the close-up look is untouched. Pulled back, it
 * opens up, and the fog rolls in again as you fly down into the camp. near
 * rides along on the same ratio so the gradient keeps its shape.
 */
function FogRig({ config }: { config: CampfireSceneConfig }) {
  const cfg = useRef(config);
  cfg.current = config;
  const farRef = useRef(0);
  useFrame(({ scene, camera }, delta) => {
    const fog = scene.fog as THREE.Fog | null;
    if (!fog || !(fog as THREE.Fog).isFog) return;
    const c = cfg.current;

    let d2 = Infinity;
    for (let i = 0; i < LOCATION_COUNT; i++) {
      const a = LOCATION_AZIMUTH(i, c);
      const dx = camera.position.x - Math.sin(a) * c.locationRadius;
      const dy = camera.position.y;
      const dz = camera.position.z - Math.cos(a) * c.locationRadius;
      const v = dx * dx + dy * dy + dz * dz;
      if (v < d2) d2 = v;
    }
    const need = Math.sqrt(d2) * Math.max(0, c.fogPullbackMul);
    const target = Math.max(c.fogFar, need);

    // Ease, so a cut between shots does not snap the horizon.
    if (farRef.current === 0) farRef.current = target;
    const k = 1 - Math.exp(-delta * Math.max(0.001, c.fogPullbackEase));
    farRef.current += (target - farRef.current) * k;

    fog.far = farRef.current;
    // Same ratio on near, so the gradient stretches rather than collapsing.
    fog.near = c.fogNear * (farRef.current / Math.max(0.001, c.fogFar));
  });
  return null;
}

function BackgroundGlow() {
  return (
    <mesh position={[0, 6, -16]} scale={[18, 7, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#063743" transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

/** crt_0's base position, straight out of the CRT block: col 0, row 0. */
const CRT0_BASE: [number, number, number] = [-0.19, 0.365, 0.36];
/** RetroCrtTv's picture, in ITS OWN local frame: centre, then width/height.
 *  Mirrors SCREEN_CENTER / SCREEN_SIZE in CampProps - the close-up frames the
 *  glass, not the chassis, so if those move this has to move with them. */
const CRT_SCREEN_LOCAL: [number, number, number] = [0, 0.1625, 0.129];
const CRT_SCREEN_H = 0.20;
/** The scale the CRT block gives every tube before its own override. */
const CRT_BASE_SCALE = 0.72;
/*
 * The three ring slots, by name. The lab numbers scenes from 1, so a slot's
 * scene number is its index + 1:
 *
 *   slot 0  =  scene 1  "Campfire"
 *   slot 1  =  scene 2  "Arcade"   - camping diorama + CRTs, cubs, picnic set
 *   slot 2  =  scene 3  "Cabin"    - wooden cabin + the bear's study
 *
 * Use these instead of bare numbers: the contents of slots 1 and 2 have been
 * traded once already, and a literal 2 sitting in a file is exactly what goes
 * stale when that happens.
 */
const LOCATION_CAMPFIRE = 0;
const LOCATION_ARCADE = 1;
const LOCATION_CABIN = 2;
/** The extra plate the focused screen grows. Selecting it lets the camera go. */
const CRT_BACK_ITEM: CrtMenu["items"][number] = {
  label: "Back",
  lines: ["Leave the screen"],
  subtitle: "Back to the Campfire",
  icon: "back",
  caption: "Exit",
};

function CampfireWorld({
  config,
  onCameraChange,
  onSelect: onSelectProp,
  selectedObject,
  dragPlaneMode,
  onObjectTranslate,
  flying,
  onIntroDone,
  panel = null,
  editing = false,
  onLocationViewChange,
  titleHeld = false,
  onFishClickSound,
  onFireWhooshSound,
  onHoverSound,
  onCrtEnterSound,
  onCrtExitSound,
  onCrtBackSound,
  onCrtSelectSound,
  onCrtFocusChange,
  crtZoomRef,
  banjoPanRef,
  banjoGainRef,
  banjoTimeRef,
  cameraSnapSignal,
  onlyBearsPlaySignal,
  cameraLivePoseRef,
  bearVoiceRef,
  onFishImpact,
}: {
  config: CampfireSceneConfig;
  onCameraChange: (pos: [number, number, number], tgt: [number, number, number]) => void;
  onSelect: (name: string) => void;
  selectedObject: string | null;
  dragPlaneMode: DragPlaneMode;
  onObjectTranslate: (name: string, next: Pick<ObjectOverride, "dx" | "dy" | "dz">) => void;
  flying: boolean;
  onIntroDone: () => void;
  panel?: number | null;
  /** panelled, but still orbitable and clickable - the lab previewing the real site */
  editing?: boolean;
  onLocationViewChange?: (index: number, view: LocationView) => void;
  /** Increment to imperatively snap the camera back to config.cameraX/Y/Z +
   *  targetX/Y/Z. Used by the "Reset camera" button in the lab. */
  cameraSnapSignal?: number;
  /** Lab: play the OnlyBears gag in place (or send him away). */
  onlyBearsPlaySignal?: number;
  /** while true, freeze IntroFlight at its pulled-back start pose */
  titleHeld?: boolean;
  onFishClickSound?: () => void;
  /** Fired when the campfire ignites its whoosh - clicking it directly (with
   *  its own cooldown, applied where this fires), or the flopping fish
   *  landing in it at the end of its throw. */
  onFireWhooshSound?: () => void;
  /** Fired once each time the pointer enters a fresh named object anywhere in
   *  the scene. Used to play hover.mp3. */
  onHoverSound?: () => void;
  /** Fired when the camera flies IN onto the CRT close-up. */
  onCrtEnterSound?: () => void;
  /** Fired when the camera pulls OUT of the CRT close-up (Back plate, or
   *  ringing away from the arcade panel). */
  onCrtExitSound?: () => void;
  /** Fired specifically for the CRT menu's Back plate. Plays alongside the
   *  zoom-out cue so the "leave the screen" click has its own tick. */
  onCrtBackSound?: () => void;
  /** Fired when a CRT menu plate other than Back is picked. */
  onCrtSelectSound?: () => void;
  /** Reports CRT focus state changes upward so the parent can loop background
   *  music while the close-up is held. */
  onCrtFocusChange?: (focused: boolean) => void;
  /** Written every frame by CrtFocusCamera with 0..1 progress through the
   *  close-up flight - read outside the canvas to ramp CRT_MUSIC's volume
   *  with the actual dolly rather than snapping it at the endpoints. */
  crtZoomRef?: React.MutableRefObject<number>;
  /** -1..1, written every frame by CampfireAnimals from the banjo bear's
   *  live position relative to the camera - read outside the canvas to pan
   *  the banjo loop. */
  banjoPanRef?: React.MutableRefObject<number>;
  /** Banjo loudness from camera distance - see CampfireAnimals. */
  banjoGainRef?: React.MutableRefObject<number>;
  banjoTimeRef?: React.MutableRefObject<number>;
  cameraLivePoseRef?: React.MutableRefObject<
    { pos: [number, number, number]; tgt: [number, number, number] } | null
  >;
  /** Live remote-audio state for the two scene-one bears. */
  bearVoiceRef?: BearVoiceStateRef;
  onFishImpact?: () => void;
}) {
  /*
   * Clicking the fire throws embers up out of it.
   *
   * Hooked at the onSelect SEAM rather than on a click handler, because the
   * fire has two independent routes to being picked: the <group name="campfire">
   * wrapper, and the bonfire log itself, which lives over in CampfireSceneModel
   * and calls onSelect("campfire") directly with the event stopped - so a
   * handler on the group alone would miss the most obvious thing to click. One
   * wrapper here catches both, and any route added later.
   *
   * The burst is fired through a ref, so a click costs no re-render of a scene
   * tree that is thousands of elements wide. Selection still happens as before;
   * this is purely additive, so the lab can still drag the fire around.
   */
  const fireBurstRef = useRef<EmberBurstHandle>(null);
  const playLeftBagFall = useCampsiteOneShot(LEFT_BAG_FALL_URL);
  const playRightBagFall = useCampsiteOneShot(RIGHT_BAG_FALL_URL);
  const playFishingRodFall = useCampsiteOneShot(FISHING_ROD_FALL_URL);
  const tipSoundVolume = clampUnit(config.masterVolume) * clampUnit(config.clickVolume);
  const handleLeftBagContact = useCallback(() => playLeftBagFall(tipSoundVolume), [playLeftBagFall, tipSoundVolume]);
  const handleRightBagContact = useCallback(() => {
    setRodPlay((n) => n + 1);
  }, []);
  const handleRightBagLand = useCallback(() => playRightBagFall(tipSoundVolume), [playRightBagFall, tipSoundVolume]);
  const handleRodContact = useCallback(() => playFishingRodFall(tipSoundVolume), [playFishingRodFall, tipSoundVolume]);
  const fishReactionRef = useRef<FishReaction>({ phase: "idle", target: new THREE.Vector3(), phaseStartedAt: 0, flightProgress: 0 });
  const handleFishLaunch = useCallback((target: THREE.Vector3, progress: number) => {
    fishReactionRef.current.phase = "flying";
    fishReactionRef.current.target.copy(target);
    fishReactionRef.current.phaseStartedAt = performance.now();
    fishReactionRef.current.flightProgress = progress;
  }, []);
  const handleFishImpact = useCallback((target: THREE.Vector3) => {
    fishReactionRef.current.phase = "impact-delay";
    fishReactionRef.current.target.copy(target);
    fishReactionRef.current.phaseStartedAt = performance.now();
    fishReactionRef.current.flightProgress = 1;
  }, []);
  useFrame(() => {
    const reaction = fishReactionRef.current;
    const now = performance.now();
    const elapsed = (now - reaction.phaseStartedAt) / 1000;
    if (reaction.phase === "impact-delay" && elapsed >= Math.max(0, config.bearFishImpactDelay)) {
      reaction.phase = "fire";
      reaction.phaseStartedAt = now;
    } else if (reaction.phase === "fire" && elapsed >= Math.min(
      Math.max(0, config.bearFishFireLookTime),
      Math.max(0.1, config.bearFishMouthHoldTime),
    )) {
      reaction.phase = "partner";
      reaction.phaseStartedAt = now;
    } else if (reaction.phase === "partner" && elapsed >= Math.max(
      0,
      Math.max(0.1, config.bearFishMouthHoldTime) - Math.max(0, config.bearFishFireLookTime),
    )) {
      reaction.phase = "return";
      reaction.phaseStartedAt = now;
    } else if (reaction.phase === "return" && elapsed >= Math.max(0, config.bearFishReturnTime)) {
      reaction.phase = "idle";
      reaction.phaseStartedAt = now;
      onFishImpact?.();
    }
  });
  const fireBurstOn = config.fireClickBurstOn >= 0.5;
  // Repeat-clicking the fire used to stack the burst (and would have stacked
  // the whoosh too) - one timestamp, checked before either fires.
  const lastFireClickAtRef = useRef(0);

  /*
   * Click-to-topple, plus the one scripted animal that is left.
   *
   * Both bags fall forward under their own weight (see TipOver), and the right
   * one takes the fishing rod down with it. Each is one-shot: the same flag
   * that runs the fall also drops the hover affordance, so a prop already lying
   * on the ground does not look clickable.
   *
   * Routed through the onSelect seam for the same reason the fire's embers are:
   * the props have more than one path to being picked, and one wrapper catches
   * them all.
   */
  const [act, setAct] = useState<ActName | null>(null);
  const [bagDown, setBagDown] = useState(false);
  const [hikeBagDown, setHikeBagDown] = useState(false);
  /* A counter, not a flag: re-tuning the bag replays its fall, which fires the
   * knock again, and the rod has to go over again with it. A boolean that was
   * already true would leave the rod lying there through every replay. */
  const [rodPlay, setRodPlay] = useState(0);
  const crittersOn = config.critterActsOn >= 0.5;
  const onSelect = useCallback((name: string) => {
    if (name === "campfire" && fireBurstOn) {
      const now = performance.now();
      if (now - lastFireClickAtRef.current >= FIRE_CLICK_COOLDOWN_MS) {
        lastFireClickAtRef.current = now;
        fireBurstRef.current?.fire();
        onFireWhooshSound?.();
      }
    }
    if (crittersOn && act === null) {
      // Deliberately NOT falling through to onSelectProp: selecting an object
      // that is about to be carried away strands selectedObject on a node that
      // unmounts, and OrbitControls stay disabled while anything is selected.
      // critterActsOn = 0 gives the plain click-to-select behaviour back.
      if (name === "campfire_hiking_backpack" && !hikeBagDown) {
        setHikeBagDown(true); return;
      }
      // The right-hand bag is not an animal cue any more: it simply topples
      // forward, and TipOver's contact callback is what knocks the rod down -
      // at the angle the meshes actually touch, not on a timer.
      if (name === "campfire_backpack" && !bagDown) { setBagDown(true); return; }
    }
    onSelectProp(name);
  }, [onSelectProp, fireBurstOn, onFireWhooshSound, crittersOn, act, bagDown, hikeBagDown]);

  /*
   * Click the tube to pull the camera in; the screen's last plate lets it go.
   *
   * The close-up is a LocationView in the arcade's own frame - the same shape
   * locationView() returns - so LocationCamera needed no new mode, only
   * something else to aim at, and the turn easing carries the move in and back
   * out for free.
   *
   * The aim point is read from crt_0's LIVE override rather than pinned, so
   * dragging the CRT in the lab drags the close-up with it.
   */
  /*
   * The tube runs in three stages, not two:
   *
   *   0  idle      - attract video, camera out on the ring
   *   1  close-up  - camera flown in, STILL the attract video, no buttons
   *   2  buttons   - the menu plates over their own video
   *   3  section   - one plate's own screen, with its Back plate
   *
   * A click steps 0 -> 1 -> 2, picking a plate opens 3, and Back walks it
   * back one level at a time (3 -> 2, 2 -> 0). Stage 1 is the point of the
   * whole thing: you get to see the screen properly before the UI arrives on
   * top of it.
   */
  const [crtStage, setCrtStage] = useState<0 | 1 | 2 | 3>(0);
  const crtFocus = crtStage > 0;

  /*
   * The cabin computer: a '95-style desktop on its monitor (RetroDesktop).
   * Click the computer and the camera flies in, the way it does for the
   * CRT; Back, Shut Down or Escape flies it back out.
   *
   * Its sounds are its own, and they are the HARDWARE of the era rather than
   * any OS jingle - a ball mouse's microswitch, a buckling-spring keyboard,
   * hard-drive head chatter, the monitor's degauss thunk as it wakes, the
   * heads parking, and PC-speaker beeps. All synthesized; see
   * lib/retroPcSounds. Levels: master x pcSoundVolume (the lab's "Cabin
   * computer sounds"). Read through a ref so the handlers stay stable.
   */
  const pcVolRef = useRef(0);
  pcVolRef.current = clampUnit(config.masterVolume) * clampUnit(config.pcSoundVolume ?? 0.8);
  const pcSounds = useMemo<PcSounds>(() => ({
    click: () => pcMouseClick(pcVolRef.current),
    key: () => pcKey(pcVolRef.current * 0.85),
    seek: () => pcSeek(pcVolRef.current * 0.9, 5 + Math.floor(Math.random() * 4)),
    wake: () => { pcMouseClick(pcVolRef.current); pcWake(pcVolRef.current); },
    park: () => pcPark(pcVolRef.current),
    error: () => pcBeep(pcVolRef.current),
    done: () => pcChirp(pcVolRef.current),
  }), []);
  /*
   * OnlyBears: clicking it on the desktop plays the bear gag instead of
   * opening a window (see OnlyBearsBear). The bear is only mounted while it
   * plays; its timeline and the camera's reveal share obStateRef.
   */
  const obStateRef = useRef<OnlyBearsState>(makeOnlyBearsState());
  const [obMounted, setObMounted] = useState(false);
  const startOnlyBears = useCallback(() => {
    const st = obStateRef.current;
    if (st.mode === "in") return;
    // coming back mid-retreat picks up from where the paw is
    st.mode = "in";
    st.reveal = false;
    setObMounted(true);
  }, []);
  const endOnlyBears = useCallback(() => {
    const st = obStateRef.current;
    if (st.mode === "in") { st.mode = "out"; st.reveal = false; }
  }, []);
  const obGone = useCallback(() => {
    obStateRef.current = makeOnlyBearsState();
    setObMounted(false);
  }, []);
  const obPawLand = useCallback(() => { pcPawThud(pcVolRef.current); }, []);
  const pc = useRetroDesktop({
    enabled: !editing,
    sounds: pcSounds,
    onOnlyBears: startOnlyBears,
    busy: () => obStateRef.current.mode !== "off",
    onBusyEscape: endOnlyBears,
  });
  const pcScreenRef = useRef<THREE.Mesh | null>(null);
  const pcFocus = pc.focused;
  const pcExit = pc.exit;
  const pcGlass = useMemo<PcGlassProps>(() => ({
    stateRef: pc.stateRef,
    onClick: pc.onScreenClick,
    onHover: pc.onScreenHover,
    onOver: pc.onComputerOver,
    hot: !pcFocus && !editing,
    focused: pcFocus,
    enabled: !editing,
    screenRef: pcScreenRef,
  }), [pc.stateRef, pc.onScreenClick, pc.onScreenHover, pc.onComputerOver, pcFocus, editing]);
  const [crtIndex, setCrtIndex] = useState(0);
  /** Back plate lit on a section screen. The menu's own plates need no flag:
   *  hovering one simply makes it the active plate, which already lights. */
  const [crtBackHot, setCrtBackHot] = useState(false);
  /** Tile under the pointer on the Projects board; its diagram fills the
   *  band along the bottom. -1 until something is pointed at. */
  const [crtTile, setCrtTile] = useState(0);

  const crtFocusView = useMemo<LocationView | null>(() => {
    if (!crtFocus) return null;
    const o = config.objectOverrides?.["crt_0"] ?? EMPTY_OVERRIDE;
    const s = CRT_BASE_SCALE * o.scale;

    // The tube is turned on the ring (crt_0 currently sits at rotY -137 deg),
    // so "in front of the screen" is +Z ROTATED BY THAT HEADING, not +Z. Aiming
    // at the group origin would also be wrong: the glass is up and forward of
    // it, and at this range that offset is most of the frame.
    const c = Math.cos(o.rotY), sn = Math.sin(o.rotY);
    const [lx, ly, lz] = CRT_SCREEN_LOCAL;
    // crt_0 hangs off the arcade set's offset group, so its base position is
    // NOT where it ends up - miss this and the close-up flies at the empty
    // patch of camp the set used to sit on.
    const tx = config.arcadeSetX + CRT0_BASE[0] + o.dx + (lx * c + lz * sn) * s;
    const ty = config.arcadeSetY + CRT0_BASE[1] + o.dy + ly * s;
    const tz = config.arcadeSetZ + CRT0_BASE[2] + o.dz + (-lx * sn + lz * c) * s;

    // Standoff in SCREEN HEIGHTS, so the framing survives rescaling the tube.
    // At fov 50 a screen fills the view vertically at (h/2)/tan(25 deg) = 1.07
    // screen heights; the default leaves a little room around it.
    const d = config.crtFocusBack * CRT_SCREEN_H * s;
    return {
      cx: tx + sn * d,
      cy: ty + config.crtFocusHeight * CRT_SCREEN_H * s,
      cz: tz + c * d,
      tx, ty, tz,
    };
  }, [crtFocus, config.objectOverrides, config.crtFocusHeight, config.crtFocusBack,
      config.arcadeSetX, config.arcadeSetY, config.arcadeSetZ]);

  // Turning config mode on while the close-up is held drops it, rather than
  // leaving the camera locked somewhere the lab cannot drive it from.
  useEffect(() => {
    if (!editing) return;
    setCrtStage((was) => {
      if (was > 0) onCrtExitSound?.();
      return 0;
    });
    setCrtIndex(0);
    setCrtTile(0);
  }, [editing, onCrtExitSound]);

  // Ringing away to another campsite drops the close-up. Without this the
  // camera would keep aiming at a shot written in the arcade's local frame
  // while the ring angle had already swung somewhere else.
  useEffect(() => {
    if (panel !== LOCATION_ARCADE) {
      setCrtStage((was) => {
        if (was > 0) onCrtExitSound?.();
        return 0;
      });
      setCrtIndex(0);
    }
  }, [panel, onCrtExitSound]);

  // Ringing away from the cabin backs out of the computer too.
  useEffect(() => {
    if (panel !== LOCATION_CABIN) pcExit();
  }, [panel, pcExit]);

  // Leaving the computer while the bear is up sends him away at once. Only
  // on the way OUT of the close-up - the lab's Play button runs him with no
  // close-up at all.
  const pcFocusWas = useRef(pcFocus);
  useEffect(() => {
    if (pcFocusWas.current && !pcFocus && obMounted) obGone();
    pcFocusWas.current = pcFocus;
  }, [pcFocus, obMounted, obGone]);

  // The lab's Play button: run the gag in place, or send him away.
  const obSignalWas = useRef(onlyBearsPlaySignal);
  useEffect(() => {
    if (obSignalWas.current === onlyBearsPlaySignal) return;
    obSignalWas.current = onlyBearsPlaySignal;
    if (obStateRef.current.mode === "in") endOnlyBears();
    else startOnlyBears();
  }, [onlyBearsPlaySignal, startOnlyBears, endOnlyBears]);

  const onlyBearsMount = useMemo(() => ({
    mounted: obMounted,
    stateRef: obStateRef,
    onPawLand: obPawLand,
    onGone: obGone,
  }), [obMounted, obPawLand, obGone]);

  // Report focus changes upward so the parent can loop CRT background music
  // while the close-up is held.
  useEffect(() => {
    onCrtFocusChange?.(crtFocus);
  }, [crtFocus, onCrtFocusChange]);

  /*
   * What crt_0 shows, which is two different screens.
   *
   * Idle: the attract video, full frame, no UI over it - `hideUi` stops the
   * plates being drawn at all, so the first thing you see is just the video.
   * Clicked: the plates, on the still. Clearing `backgroundVideo` is what
   * picks the still, and the Back plate is appended so there is a way out.
   */
  const crtMenu = useMemo<CrtMenu>(() => (
    crtStage === 3
      ? {
          ...PORTFOLIO_MENU,
          backgroundVideo: CRT_BUTTONS_VIDEO,
          page: {
            ...(SECTION_PAGES[crtIndex] ?? SECTION_PAGES[0]),
            activeRow: crtTile,
          },
          /*
           * Board art is pulled in only once the board is open, and only the
           * diagram actually being looked at.
           *
           * The 21 icons are 0.9MB and the 21 diagrams are 4.6MB; loading
           * either up front would charge every visitor for a screen most of
           * them never open. The icons all have to arrive together - the board
           * shows them at once - but the diagrams are one at a time, so only
           * the pointed-at one joins the list. Moving off it drops it again;
           * coming back is an HTTP cache hit.
           */
          preloadMedia: [
            ...(PORTFOLIO_MENU.preloadMedia ?? []),
            ...(SECTION_PAGES[crtIndex]?.grid
              ? (SECTION_PAGES[crtIndex]?.rows ?? [])
                  .map((r) => r.icon)
                  .filter((u): u is string => !!u)
              : []),
            ...(crtTile >= 0
              ? [SECTION_PAGES[crtIndex]?.rows[crtTile]?.diagram]
                  .filter((u): u is string => !!u)
              : []),
          ],
          // Only the selected tile's gif animates - see liveImage.
          liveImage: SECTION_PAGES[crtIndex]?.rows[crtTile]?.icon,
          pageBackHover: crtBackHot,
          tagline: PORTFOLIO_MENU.items[crtIndex]?.subtitle,
        }
      : crtStage === 2
      ? {
          ...PORTFOLIO_MENU,
          backgroundVideo: CRT_BUTTONS_VIDEO,
          items: [...PORTFOLIO_MENU.items, CRT_BACK_ITEM],
          activeIndex: crtIndex,
        }
      // stages 0 and 1 are the same screen - the attract video, no UI. Only
      // the camera moves between them.
      //
      // Contain-fit, unlike every other screen: this video is a title card,
      // and cover-fit cropped 160 source pixels off each side - enough to eat
      // the end of the wordmark. See CrtMenu.backgroundFit.
      : { ...PORTFOLIO_MENU, hideUi: true, backgroundFit: "contain" as const }
  ), [crtStage, crtIndex, crtBackHot, crtTile]);

  /*
   * Pointer over the glass.
   *
   * On the menu, hovering a plate MOVES the selection to it, the way the
   * cursor does in the original - so the sub-list and the jut follow the
   * mouse and a click just commits whatever is already lit. On a section
   * screen there is only Back to light. The cursor turns into a pointer over
   * anything clickable so the screen reads as live rather than as a picture.
   */
  /*
   * The cursor is NOT set here.
   *
   * While the tube is open the P1 hand is the cursor everywhere, the way it
   * is in the menus this screen is copying - the plates light to say what is
   * under it, the pointer itself does not change shape. It is held by the
   * effect below instead, because this callback only fires while the pointer
   * is over the glass: driving the cursor from here meant it flipped back to
   * an arrow the moment you drifted a pixel off the screen, mid-menu.
   */
  const onCrtHover = useCallback((uv: { x: number; y: number } | null) => {
    if (editing) return;
    if (!uv || crtStage < 2) {
      if (crtBackHot) setCrtBackHot(false);
      return;
    }
    if (crtStage === 3) {
      const on = meleePageBackHit(uv.x, uv.y);
      setCrtBackHot(on);
      // On the Projects board, pointing at a tile fills the diagram band.
      const pg = SECTION_PAGES[crtIndex];
      const tile = pg?.grid ? meleeGridHit(uv.x, uv.y, pg) : null;
      // Keep the last pick when the pointer wanders off the tiles - the band
      // holding its last diagram beats it blanking every time you move.
      if (tile !== null) setCrtTile(tile);
      return;
    }
    const back = PORTFOLIO_MENU.items.length;
    const hit = meleeMenuHit(uv.x, uv.y, back + 1, crtIndex);
    /*
     * Back lights like any other plate.
     *
     * It used to be held out of the selection on the grounds that it would
     * "steal the sub-list" - but it carries its own line ("Leave the
     * screen"), so the panel has something to say for it, and a plate you can
     * click but never light reads as broken. The index is safe to leave
     * parked on it: every path that resolves a SECTION out of crtIndex runs
     * on stage 3, and Back cannot open one - it exits instead.
     */
    if (hit !== null) setCrtIndex(hit);
  }, [editing, crtStage, crtIndex, crtBackHot]);

  /*
   * The P1 hand, held from the moment the camera starts into the tube until
   * it backs out again.
   *
   * Keyed on the STAGE rather than on hover, so it covers the whole viewport:
   * once you are in the close-up there is nothing else to point at, and a
   * cursor that reverted to an arrow between the plates would give the game
   * away. Config mode is exempt - the tube is just a prop being positioned
   * there, and the lab's own cursors belong to the lab.
   */
  useEffect(() => {
    if (editing || crtStage < 1) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = CRT_CURSOR;
    return () => { document.body.style.cursor = prev; };
  }, [editing, crtStage]);

  // Never leave a cursor behind on unmount.
  useEffect(() => () => { document.body.style.cursor = ""; }, []);

  const onCrtClick = useCallback((uv: { x: number; y: number } | null) => {
    /*
     * In config mode the tube is just another prop.
     *
     * The click still bubbles to the Selectable, so it selects the CRT for
     * dragging and the object drawer opens - but the camera stays where it
     * is. Flying into a close-up is the last thing you want while you are
     * positioning the thing, and it fights the lab's own camera, which
     * LocationCamera drives from the panel's saved shot.
     */
    if (editing) return;
    // The menu's own plates are the buttons: the click is hit-tested against
    // the same layout the canvas draws with, so pointing at a plate picks that
    // plate rather than just stepping to the next one.
    const back = PORTFOLIO_MENU.items.length;
    if (crtStage === 0) {
      // Anywhere on the glass pulls the camera in. No plates are up yet, so
      // there is nothing to hit-test - the video just keeps playing.
      setCrtStage(1);
      onCrtEnterSound?.();
      return;
    }
    if (crtStage === 1) {
      // Second click brings the buttons up over their own background.
      setCrtIndex(0);
      setCrtStage(2);
      onCrtSelectSound?.();
      return;
    }
    // crtIndex is passed so the hit test knows which plate is jutting out.
    if (crtStage === 3) {
      // Back first: it sits over the board's top-right corner, so whichever
      // is hit there, leaving beats opening something.
      if (uv && meleePageBackHit(uv.x, uv.y)) {
        onCrtBackSound?.();
        setCrtBackHot(false);
        setCrtTile(0);
        setCrtStage(2);
        return;
      }
      /*
       * A tile with an href is a button: clicking a project opens its repo.
       *
       * A NEW TAB, always. This is a 3D scene with a camera part-way into a
       * close-up and a menu state machine behind it - navigating the page
       * away would throw all of that out, and coming back would land you at
       * the start of the flight rather than on the board you were reading.
       *
       * The click also commits the selection, so a tile that was never
       * hovered - a touch screen, or the pointer arriving straight onto it -
       * still opens the thing under the finger rather than whatever the
       * board happened to be showing.
       */
      const pg = SECTION_PAGES[crtIndex];
      const tile = uv && pg?.grid ? meleeGridHit(uv.x, uv.y, pg) : null;
      if (tile === null) return;
      setCrtTile(tile);
      const href = pg?.rows[tile]?.href;
      if (!href) return;
      onCrtSelectSound?.();
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    const hit = uv ? meleeMenuHit(uv.x, uv.y, back + 1, crtIndex) : null;
    if (hit === null) return;            // missed the plates - leave it alone
    if (hit >= back) {
      // Back plate: its own tick, then the pull-out cue. Straight to idle -
      // stopping at the close-up would strand you on a screen with no way out.
      onCrtBackSound?.();
      onCrtExitSound?.();
      setCrtStage(0);
      setCrtIndex(0);
      return;
    }
    // A plate opens its own screen.
    onCrtSelectSound?.();
    setCrtIndex(hit);
    setCrtStage(3);
  }, [editing, crtStage, crtIndex, onCrtEnterSound, onCrtExitSound, onCrtBackSound, onCrtSelectSound]);
  // Track the last named object under the cursor. r3f fires onPointerMove for
  // every hovered mesh; we only want a sound when the resolved "top-level
  // named ancestor" actually changes.
  const hoveredNameRef = useRef<string>("");
  /*
   * A model with several meshes under one named group fires a pointerout
   * (from the sub-mesh you're leaving) immediately followed by a pointermove
   * (onto the sub-mesh you're entering) as the cursor crosses the seam
   * between them - same named object the whole time, as far as the visitor
   * is concerned, but handleScenePointerOut had already cleared
   * hoveredNameRef by the time the move handler re-resolved the same name,
   * so it read as a fresh hover and replayed the cue. A straight cooldown on
   * the SOUND rather than trying to out-think that event ordering: once
   * played, hover.wav won't fire again for HOVER_SOUND_COOLDOWN_MS, so
   * crossing internal seams while sitting on one object stays silent.
   */
  const lastHoverSoundAtRef = useRef(0);
  const resolveHoverName = (obj: THREE.Object3D | null): string => {
    let node: THREE.Object3D | null = obj;
    while (node) {
      const n = node.name || "";
      // Ignore anonymous GLB-import names ("", "Object_12", "Scene", "mesh_0",
      // "Empty*") so only authored/named groups trigger hover feedback.
      if (n && !/^(?:Object_?\d|Scene$|mesh_\d|Empty)/i.test(n)) return n;
      node = node.parent;
    }
    return "";
  };
  const handleScenePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const name = resolveHoverName(e.object);
    if (name && name !== hoveredNameRef.current) {
      hoveredNameRef.current = name;
      const now = performance.now();
      if (now - lastHoverSoundAtRef.current >= HOVER_SOUND_COOLDOWN_MS) {
        lastHoverSoundAtRef.current = now;
        onHoverSound?.();
      }
    }
  };
  const handleScenePointerOut = () => {
    hoveredNameRef.current = "";
  };

  const panelled = panel != null;
  // The fly-in lands on the campfire, which is location 0 - not on the free-look
  // camera, which in panelled mode is never where the scene actually settles.
  const intro = useMemo(() => {
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    if (panelled) locationCamera(0, config, p, t);
    else {
      p.set(config.cameraX, config.cameraY, config.cameraZ);
      t.set(config.targetX, config.targetY, config.targetZ);
    }
    return { to: [p.x, p.y, p.z] as [number, number, number], target: [t.x, t.y, t.z] as [number, number, number] };
  }, [panelled, config]);

  // Orbit has to pivot around whatever the current location is looking at, not the
  // free-look target, or dragging in preview swings the camera around the wrong point.
  const orbitTarget = useMemo(() => {
    if (!panelled) return [config.targetX, config.targetY, config.targetZ] as [number, number, number];
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    locationCamera(panel, config, p, t);
    return [t.x, t.y, t.z] as [number, number, number];
  }, [panelled, panel, config]);

  return (
    <>
      {(() => {
        // Base night-sky hex #03040a, scaled by skyBrightness. Same value goes
        // into fog so distant silhouettes keep blending into the horizon.
        const sky = new THREE.Color("#03040a").multiplyScalar(config.skyBrightness);
        return (
          <>
            <color attach="background" args={[sky]} />
            <fog attach="fog" args={[sky, config.fogNear, config.fogFar]} />
          </>
        );
      })()}
      <FogRig config={config} />
      <CameraRig config={config} paused={flying || panelled} />
      {panelled ? (
        <LocationCamera config={config} panel={panel} active={!flying} editing={editing} suspended={crtFocus || pcFocus} />
      ) : null}
      {/* Mounted whether or not a location owns the camera - see CrtFocusCamera. */}
      <CrtFocusCamera active={crtFocus} view={crtFocusView} config={config} handoff={panelled} zoomRef={crtZoomRef} />
      <PcFocusCamera active={pcFocus} screenRef={pcScreenRef} config={config} handoff={panelled} revealRef={obStateRef} />
      {flying ? (
        <IntroFlight
          to={intro.to}
          target={intro.target}
          duration={config.titleFlyDuration}
          distanceMultiplier={config.titleCameraDistance}
          skyHeight={config.titleCameraHeight}
          extraDistance={config.titleFlyExtraDistance}
          cameraPitch={config.titleFlyCameraPitch}
          fovBoost={config.titleFlyFovBoost}
          fogSquash={config.titleFlyFogSquash}
          held={titleHeld}
          onDone={onIntroDone}
        />
      ) : null}
      <OrbitCameraSaver
        target={orbitTarget}
        onChange={(pos, tgt) => {
          // While previewing a location, orbiting IS how you frame that location:
          // fold the result back into its own space so it survives the ring moving.
          if (panelled && editing && onLocationViewChange) {
            onLocationViewChange(panel, worldToLocationView(panel, config, pos, tgt));
          } else if (!panelled) {
            onCameraChange(pos, tgt);
          }
        }}
        // !crtFocus: while the CRT close-up holds the camera, orbiting would
        // both fight it and - because onEnd writes the pose back - overwrite
        // this location's saved shot with the close-up. Back releases it.
        enabled={!flying && !selectedObject && !crtFocus && !pcFocus && (!panelled || editing)}
        livePoseRef={cameraLivePoseRef}
        snapTo={(() => {
          // Reset target is per-campsite: in panelled mode, snap to that
          // location's saved view (locationViews[panel]); in free-look mode,
          // snap to the global cameraX/Y/Z + targetX/Y/Z.
          if (panelled) {
            const p = new THREE.Vector3();
            const t = new THREE.Vector3();
            locationCamera(panel, config, p, t);
            return { pos: [p.x, p.y, p.z], tgt: [t.x, t.y, t.z] };
          }
          return {
            pos: [config.cameraX, config.cameraY, config.cameraZ],
            tgt: [config.targetX, config.targetY, config.targetZ],
          };
        })()}
        snapSignal={cameraSnapSignal}
      />
      <WorldLights config={config} />
      <Stars radius={55} depth={20} count={Math.round(config.starCount)} factor={config.starBrightness} saturation={0} fade speed={0.12} />

      <CampfireGround config={config} gate={panelled && !flying} />
      {/* Non-visual: nulls out raycasting for any name listed in
          config.lockedObjects. Lets clicks pass through locked props. */}
      <LockLayer config={config} />
      <ShadowLayer config={config} />
      {/* Scene-wide pointer wrapper: catches bubbled onPointerMove/onPointerOut
          from every clickable descendant so we can play hover.mp3 the first
          time the pointer enters each fresh named object. r3f events bubble to
          parent groups unless a child stopPropagation()s them; hover trackers
          don't, so this covers Selectables, animals, benches, camper, tent,
          gamecube, fish and captured GLB nodes uniformly. */}
      <group onPointerMove={handleScenePointerMove} onPointerOut={handleScenePointerOut}>
      <ObjectDragLayer
        selectedObject={selectedObject}
        mode={dragPlaneMode}
        config={config}
        onTranslate={onObjectTranslate}
      >
        {/* The forest lives INSIDE the drag layer. It used to sit outside it,
            next to CampfireGround, which meant its 320 instanced pines could be
            selected but never dragged - ObjectDragLayer only sees pointer
            events from its own descendants. Both wrapper groups are transform
            free, so moving it in here changes nothing about where trees land. */}
        <ForestAndPaths config={config} onSelect={onSelect} />
        {/* Duplicate clones live under the drag layer so their bubbled pointer
            events reach the drag handlers - moving DuplicatesLayer outside made
            duplicates selectable but not draggable. */}
        <DuplicatesLayer config={config} onSelect={onSelect} />
        {/* Location 0 - the campfire. Everything here was already composed around the
            origin with the camera off at +Z, so it moves onto the ring untouched and
            keeps every slider meaning exactly what it did. */}
        <Location index={LOCATION_CAMPFIRE} config={config} gate={panelled && !flying}>
          <CampfireSceneModel config={config} onSelect={onSelect} />
          {(config.objectOverrides?.["camper"]?.hide ?? 0) < 0.5 && (
            <SafeAsset label="camper"><Camper config={config} onSelect={onSelect} /></SafeAsset>
          )}
          {(config.objectOverrides?.["tent"]?.hide ?? 0) < 0.5 && (
            <SafeAsset label="tent"><Tent config={config} onSelect={onSelect} /></SafeAsset>
          )}
          <Benches config={config} onSelect={onSelect} />
          <CampfireAnimals config={config} onSelect={onSelect} bearVoiceRef={bearVoiceRef} banjoPanRef={banjoPanRef} banjoGainRef={banjoGainRef} banjoTimeRef={banjoTimeRef} fishReactionRef={fishReactionRef} />
          {/* Wood pile near the bonfire, as if stacked ready to feed the fire. */}
          <Selectable
            name="campfire_wood_pile"
            onSelect={onSelect}
            config={config}
            basePosition={[2.6, 0, 1.2]}
            baseRotationY={-0.4}
            baseScale={0.4}
          >
            <SafeAsset label="wood pile">
              <GLBModel url={WOOD_PILE_URL} />
            </SafeAsset>
          </Selectable>
          <Selectable
            name="campfire_banjo"
            onSelect={onSelect}
            config={config}
            basePosition={[-2.2, 0.05, 1.4]}
            baseRotationY={0.6}
            baseScale={0.18}
          >
            <SafeAsset label="banjo">
              <GLBModel url={BANJO_URL} />
            </SafeAsset>
          </Selectable>
          {/* Chopping-block log with axe stuck in it. Source ~30 cm across
              already, so baseScale=1.65 gets it to ~50 cm (a plausible splitting
              log). Small anchor cancels the model's tiny origin offset. */}
          <Selectable
            name="campfire_log_axe"
            onSelect={onSelect}
            config={config}
            basePosition={[-1.9, 0, 1.6]}
            baseRotationY={0.3}
            baseScale={1.65}
          >
            <group position={[-0.013, 0.075, 0.008]}>
              <SafeAsset label="log & axe">
                <GLBModel url={LOG_AXE_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Second tent, across the fire from the low-poly one. Placed out at
              x 4.6 / z -4.2 so it clears the wood pile (2.6, 1.2) and sits well
              inside the camper at z -6; baseRotationY turns its opening back
              toward the fire. Anchor is in SOURCE units - it's inside the
              Selectable, so baseScale applies to it too. */}
          <Selectable
            name="campfire_tent"
            onSelect={onSelect}
            config={config}
            /* Not an affordance: nothing happens when a visitor clicks the
               tent. It stays selectable so the lab can still drag it. */
            interactive={false}
            basePosition={[4.6, 0, -4.2]}
            baseRotationY={-0.83}
            baseScale={0.16}
          >
            <group position={[0, 0.176, 0]}>
              <SafeAsset label="a-frame tent">
                <GLBModel url={TENT_AFRAME_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Camera on tripod. Source is ~3.8 m tall sitting on y=0, so
              baseScale=0.26 lands it around 1 m. */}
          <Selectable
            name="campfire_camera"
            onSelect={onSelect}
            config={config}
            basePosition={[2.2, 0, 0.4]}
            baseRotationY={2.2}
            baseScale={0.26}
          >
            <SafeAsset label="camera">
              <GLBModel url={CAMERA_URL} />
            </SafeAsset>
          </Selectable>
          {/* Stool tucked next to the front log. Poly-by-Google source is
              ~3.1 m tall with min-Y at -2.0, so anchor drops the bottom to
              y=0 and baseScale=0.16 gets it to ~50 cm. */}
          <Selectable
            name="campfire_stool"
            onSelect={onSelect}
            config={config}
            basePosition={[1.4, 0, 1.9]}
            baseRotationY={0.4}
            baseScale={0.16}
          >
            <group position={[0, 2.0, 0]}>
              <SafeAsset label="stool">
                <GLBModel url={STOOL_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Soju bottle floating just above the fish so it lands clearly in
              the current camera view. Drag/scale in the drawer to place it
              wherever ends up looking right. */}
          <Selectable
            name="campfire_soju"
            onSelect={onSelect}
            config={config}
            basePosition={[1.05, 0.5, 1.4]}
            baseRotationY={0.6}
            baseScale={0.22}
          >
            <group position={[0.114, 0.327, -0.012]}>
              <SafeAsset label="soju">
                <GLBModel url={SOJU_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Wooden beer mug floating just above the fish. The GLB has three
              nested matrix transforms (Sketchfab_model / BeerMug.fbx /
              BeerMug) that combine to a final world extent of ~3.8 x 3.15 x
              2.64. The anchor + baseScale below normalize that to ~15 cm. */}
          <Selectable
            name="campfire_beer_mug"
            onSelect={onSelect}
            config={config}
            basePosition={[1.35, 0.5, 1.4]}
            baseRotationY={-0.3}
            baseScale={0.05}
          >
            <group position={[-0.378, 1.914, 0.027]}>
              <SafeAsset label="beer mug">
                <GLBModel url={BEER_MUG_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Kettle sitting on the ground near the fire. Source is ~6 units
              wide, so a normalization group centers X/Z and drops the min Y
              to zero, then baseScale=0.04 lands it around 25 cm. */}
          <Selectable
            name="campfire_kettle"
            onSelect={onSelect}
            config={config}
            basePosition={[1.1, 0, 1.2]}
            baseRotationY={-0.5}
            baseScale={0.04}
          >
            <group position={[-0.6624, 2.258, 0]}>
              <SafeAsset label="kettle">
                <GLBModel url={KETTLE_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Keg parked near the back-left log. The GLB carries a hidden
              internal transform on its "Big keg" node (translation +2.34 X,
              scale 100), so we cancel that offset in a wrapper group before
              applying baseScale - otherwise the keg lands ~93 units offset
              and hundreds of units tall, i.e. off-camera. */}
          <Selectable
            name="campfire_keg"
            onSelect={onSelect}
            config={config}
            basePosition={[-2.6, 0, 0.9]}
            baseRotationY={0.3}
            baseScale={0.4}
          >
            <group position={[-2.338, 0, 0.059]}>
              <SafeAsset label="keg">
                <GLBModel url={KEG_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Fish bone on the ground near the fire - scraps from the flopping
              fish. Source ~9 mm long, so baseScale=22 gets it to ~20 cm. */}
          <Selectable
            name="campfire_fish_bone"
            onSelect={onSelect}
            config={config}
            basePosition={[0.9, 0.02, 0.7]}
            baseRotationY={1.3}
            baseScale={22}
          >
            <SafeAsset label="fish bone">
              <GLBModel url={FISH_BONE_URL} />
            </SafeAsset>
          </Selectable>
          {/* Kenney laptop, dropped near the book/backpack cluster. Kenney
              props ship at real-world-ish size (~30 cm), so baseScale=1 is
              usually about right — tune from the panel once you can see it.
              Name is `campfire_laptop_kenney` (not `campfire_laptop`) so a
              stale offset left over in objectOverrides from an earlier drag
              doesn't teleport the fresh instance out of view. The old
              `campfire_laptop` key in the JSON is orphaned and harmless. */}
          <Selectable
            name="campfire_laptop_kenney"
            onSelect={onSelect}
            config={config}
            basePosition={[-1.1, 0, 1.5]}
            baseRotationY={0.3}
            baseScale={1}
          >
            <SafeAsset label="laptop">
              <LaptopWithScreenGlow config={config} />
            </SafeAsset>
          </Selectable>
          {/* Book on the ground - Quaternius, 0.81 m tall, anchor drops the
              bottom to y=0; baseScale=0.25 lands it at ~20 cm. */}
          <Selectable
            name="campfire_book"
            onSelect={onSelect}
            config={config}
            basePosition={[-1.4, 0, 1.4]}
            baseRotationY={0.2}
            baseScale={0.25}
          >
            <group position={[0.028, 0.407, -0.019]}>
              <SafeAsset label="book">
                <GLBModel url={BOOK_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Second Quaternius backpack (symmetric authoring, real world size);
              anchor drops the bottom to y=0, baseScale sets the size. */}
          <Selectable
            name="campfire_backpack_q2"
            onSelect={onSelect}
            config={config}
            basePosition={[-1.7, 0, 1.2]}
            baseRotationY={-0.4}
            baseScale={0.42}
          >
            <group position={[0, 0.475, 0]}>
              <SafeAsset label="backpack (Quaternius v2)">
                <GLBModel url={BACKPACK_Q2_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* J-Toastie backpack, already sitting on y=0. Light anchor cancels
              the tiny X/Z offset. */}
          <Selectable
            name="campfire_backpack_toastie"
            onSelect={onSelect}
            config={config}
            basePosition={[-0.6, 0, 1.9]}
            baseRotationY={0.9}
            baseScale={0.4}
          >
            <group position={[-0.0002, -0.003, 0.076]}>
              <SafeAsset label="backpack (J-Toastie)">
                <GLBModel url={BACKPACK_TOASTIE_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Voxel hiking backpack on the ground. Source is real-world sized
              (~1 m tall) but authored 20 units off in -X, so anchor group
              re-centers X/Z and drops the min-Y to zero; baseScale=0.4 lands
              it around 40 cm. */}
          <Selectable
            name="campfire_hiking_backpack"
            onSelect={onSelect}
            config={config}
            interactive={crittersOn && !hikeBagDown}
            basePosition={[-0.9, 0, 1.8]}
            baseRotationY={0.5}
            baseScale={0.4}
          >
            <TipOver
              active={hikeBagDown}
              table={TIP_TABLES.hikeBag}
              heading={config.hikeBagTipHeading}
              groundY={config.critterGroundY}
              shove={config.hikeBagTipShove}
              fall={config.hikeBagTipFall}
              tilt={config.hikeBagTipTilt}
              lift={config.hikeBagTipLift}
              restitution={config.tipRestitution}
              rattleAmp={config.hikeBagRattleAmp}
              rattleFreq={config.hikeBagRattleFreq}
              rattleDamp={config.hikeBagRattleDamp}
              onLand={handleLeftBagContact}
            >
            <group position={[20.07, 0.005, 0.069]}>
              <SafeAsset label="hiking backpack">
                <GLBModel url={HIKING_BACKPACK_URL} />
              </SafeAsset>
            </group>
            </TipOver>
          </Selectable>
          {/* Backpack slumped near the front log. Source model is ~1.6 cm
              across, so baseScale=20 gets it to ~30 cm. Slider tunes further. */}
          <Selectable
            name="campfire_backpack"
            onSelect={onSelect}
            config={config}
            interactive={crittersOn && !bagDown}
            basePosition={[-1.3, 0, 1.6]}
            baseRotationY={0.4}
            baseScale={20}
          >
            <TipOver
              active={bagDown}
              table={TIP_TABLES.bag}
              heading={config.bagTipHeading}
              groundY={config.critterGroundY}
              shove={config.bagTipShove}
              fall={config.bagTipFall}
              tilt={config.bagTipTilt}
              lift={config.bagTipLift}
              restitution={config.tipRestitution}
              rattleAmp={config.bagRattleAmp}
              rattleFreq={config.bagRattleFreq}
              rattleDamp={config.bagRattleDamp}
              contactAngle={config.bagTipContact}
              onContact={handleRightBagContact}
              onLand={handleRightBagLand}
            >
              <SafeAsset label="backpack">
                <GLBModel url={BACKPACK_URL} />
              </SafeAsset>
            </TipOver>
          </Selectable>
          {/* Fishing rod leaned against the front log. Source model is ~6 cm
              long, so baseScale=3 lands it around 18 cm and the slider takes
              it up or down from there. */}
          <Selectable
            name="campfire_fishing_rod"
            onSelect={onSelect}
            config={config}
            basePosition={[1.6, 0.05, 1.5]}
            baseRotationY={-0.4}
            baseScale={3}
          >
            <TipOver
              active={rodPlay > 0}
              replay={rodPlay}
              table={TIP_TABLES.rod}
              heading={config.rodTipHeading}
              groundY={config.critterGroundY}
              shove={config.rodTipShove}
              fall={config.rodTipFall}
              tilt={config.rodTipTilt}
              lift={config.rodTipLift}
              restitution={config.tipRestitution}
              rattleAmp={config.rodRattleAmp}
              rattleFreq={config.rodRattleFreq}
              rattleDamp={config.rodRattleDamp}
              onLand={handleRodContact}
            >
              <SafeAsset label="fishing rod">
                <GLBModel url={FISHING_ROD_URL} />
              </SafeAsset>
            </TipOver>
          </Selectable>
          {(config.objectOverrides?.["fish"]?.hide ?? 0) < 0.5 && (
            <SafeAsset label="flopping fish">
              <FloppingFish
                config={config}
                onClickSound={onFishClickSound}
                onImpactSound={onFireWhooshSound}
                onLaunch={handleFishLaunch}
                onImpact={handleFishImpact}
                onSelect={onSelect}
                replayOnTune={editing || panel == null}
              />
            </SafeAsset>
          )}
          {/* Named "campfire" group so ObjectDragLayer can pick it up as the
              drag target when the user clicks any of the fire pieces (flame,
              sparks, glow disc, or the bonfire log routed here via onSelect).
              Its dx/dy/dz translates the whole group; the same offset is added
              to the bonfire node inside CampfireSceneModel so the log tracks. */}
          <group
            name="campfire"
            position={[
              config.objectOverrides?.["campfire"]?.dx ?? 0,
              config.objectOverrides?.["campfire"]?.dy ?? 0,
              config.objectOverrides?.["campfire"]?.dz ?? 0,
            ]}
            onClick={(e) => { e.stopPropagation(); onSelect("campfire"); }}
          >
            {/* Inside the campfire group so the fire light and the shadow light
                ride along with the log, flame, sparks and glow on every drag. */}
            <CampfireLights config={config} />
            {/* The group's onClick above used to be reachable by clicking any
                of these, which meant the glow disc - a plane up to 30 units
                across - was the campfire's hitbox. The bonfire LOG is routed
                to onSelect("campfire") from inside CampfireSceneModel, so
                selection still works; only the oversized decoration stops
                being a click target. */}
            <NoPick>
            <FireGlowDisc
              opacity={config.glowOpacity} x={config.flameX} y={config.glowY} z={config.flameZ}
              scale={config.glowScale}
              colorR={config.glowColorR} colorG={config.glowColorG} colorB={config.glowColorB}
              width={config.glowWidth} length={config.glowLength}
              rotY={config.glowRotY} falloff={config.glowFalloff}
              flicker={config.glowFlicker} breathe={config.glowBreathe}
              offsetX={config.glowOffsetX} offsetZ={config.glowOffsetZ}
            />
            <CampfireFlame
              x={config.flameX} y={config.flameY} z={config.flameZ}
              scale={config.flameScale}
              outerScale={config.flameOuterScale}
              innerScale={config.flameInnerScale}
              haloScale={config.flameHaloScale}
            />
            {/* Inside the campfire group and positioned off flameX/Y/Z, so it
                stays on the fire however the fire is dragged. */}
            <EmberBurst
              ref={fireBurstRef}
              x={config.flameX}
              y={config.flameY + config.fireBurstY}
              z={config.flameZ}
              count={config.fireBurstCount}
              speed={config.fireBurstSpeed}
              spread={config.fireBurstSpread}
              maxHeight={config.sparkMaxHeight}
              sway={config.sparkSway}
              lifetime={config.fireBurstLifetime}
              size={config.fireBurstSize}
              opacity={config.fireBurstOpacity}
              flashIntensity={config.fireFlashIntensity}
              flashDuration={config.fireFlashDuration}
              flashReach={config.fireFlashReach}
            />
            <Sparks
              key={`sparks-${Math.max(1, Math.round(config.sparkCount))}`}
              opacity={config.sparkOpacity}
              x={config.flameX}
              z={config.flameZ}
              count={config.sparkCount}
              spread={config.sparkSpread}
              maxHeight={config.sparkMaxHeight}
              speed={config.sparkSpeed}
              sway={config.sparkSway}
              burstChance={config.sparkBurstChance}
              size={config.sparkSize}
              lifetime={config.sparkLifetime}
            />
            </NoPick>
          </group>

          {/* The scripted animals live INSIDE location 0, so every waypoint is
              written in the same local frame the campfire props use and the
              whole performance travels with the ring. */}
          <CampCritters
            config={config}
            act={act}
            onDone={() => setAct(null)}
          />
        </Location>

        {/* Ring slot -> scene number is just +1: slot 0 is scene 1, and so on.
            The slots themselves never moved. What moved is what is IN them:
            the arcade (CRTs, cubs, consoles, picnic set, truck) came here to
            join the camping diorama, and the bear's study (table, computer,
            books) went the other way to join the cabin. The two anchors -
            old_bear_camping and arcade_wooden_cabin - stayed exactly where
            they were, so both saved camera views still frame the right thing
            and cameraDefaults.json needed no change. */}
        <Location index={LOCATION_ARCADE} config={config} gate={panelled && !flying}>
          <SafeAsset label="arcade">
            <ArcadeSector
              config={config}
              onSelect={onSelect}
              crtMenu={crtMenu}
              onCrtClick={onCrtClick}
              onCrtHover={onCrtHover}
              crtHot={crtStage === 0 && !editing}
            />
          </SafeAsset>
        </Location>

        <Location index={LOCATION_CABIN} config={config} gate={panelled && !flying}>
          <SafeAsset label="cabin">
            <CabinSector config={config} onSelect={onSelect} pc={pcGlass} onlyBears={onlyBearsMount} />
          </SafeAsset>
        </Location>
      </ObjectDragLayer>
      </group>

    </>
  );
}

export default function CampfireScene({
  config,
  onCameraChange,
  onSelect,
  selectedObject = null,
  dragPlaneMode = "xz",
  onObjectTranslate,
  intro = true,
  panel = null,
  editing = false,
  onLocationViewChange,
  titleHeld = false,
  cameraSnapSignal,
  onlyBearsPlaySignal,
  cameraLivePoseRef,
  bearVoiceRef,
  onFishImpact,
}: {
  config: CampfireSceneConfig;
  onCameraChange?: (pos: [number, number, number], tgt: [number, number, number]) => void;
  onSelect?: (name: string) => void;
  selectedObject?: string | null;
  dragPlaneMode?: DragPlaneMode;
  onObjectTranslate?: (name: string, next: Pick<ObjectOverride, "dx" | "dy" | "dz">) => void;
  /** play the fly-in on load. Set false in the lab if it gets in the way of tuning. */
  intro?: boolean;
  /** 0-2 puts the scene on that location, framed by its saved shot. null (the
   *  default) is free-look, for the lab. */
  panel?: number | null;
  /** With `panel` set, keep orbit and picking live so a location can be framed and
   *  its props moved while you look at the real site camera. */
  editing?: boolean;
  onLocationViewChange?: (index: number, view: LocationView) => void;
  /** while true, hold IntroFlight at its pulled-back start pose. Used by the title
   *  card, so the visitor sees the campsite diorama behind the letters. */
  titleHeld?: boolean;
  /** Bumped by the lab's "Reset camera" button to snap back to the saved pose. */
  cameraSnapSignal?: number;
  /** Bumped by the lab's OnlyBears Play button: play the gag, or send him away. */
  onlyBearsPlaySignal?: number;
  /** Populated by the OrbitControls-managed camera every "change" event, so the
   *  lab can commit whatever is on screen right now via Save without needing a
   *  drag first. */
  cameraLivePoseRef?: React.MutableRefObject<
    { pos: [number, number, number]; tgt: [number, number, number] } | null
  >;
  /** Optional because the scene lab has no voice client. */
  bearVoiceRef?: BearVoiceStateRef;
  onFishImpact?: () => void;
}) {
  const cameraChangeHandler = onCameraChange ?? (() => {});
  const selectHandler = onSelect ?? (() => {});
  const translateHandler = onObjectTranslate ?? (() => {});
  const [flying, setFlying] = useState(intro);

  // ?perf turns on the readout. Nothing is measured, or mounted, without it.
  const [perfOn, setPerfOn] = useState(false);
  const [perf, setPerf] = useState<PerfSample | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setPerfOn(new URLSearchParams(window.location.search).has("perf"));
  }, []);
  /*
   * Both of these are resolved SYNCHRONOUSLY, on the very first render, and
   * that matters more than it looks.
   *
   * The first version put them in useState with a placeholder and corrected
   * them from an effect. antialias is a WebGL context attribute, so the canvas
   * is keyed on it - which meant the correction remounted the whole Canvas one
   * frame after mount, tearing down the scene and restarting the intro flight
   * on top of itself. That is what blanked the title screen.
   *
   * So: read matchMedia during render (it is a synchronous, side-effect-free
   * query), and let the key change ONLY when the config value actually changes
   * later, i.e. when someone moves the slider in the lab.
   */
  const gfxRef = useRef<{ dpr: number; aa: boolean } | null>(null);
  const resolveGfx = () => {
    const coarse =
      typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
    return {
      dpr: coarse ? config.maxPixelRatioMobile : config.maxPixelRatio,
      aa: (coarse ? config.antialiasMobile : config.antialias) >= 0.5,
    };
  };
  if (gfxRef.current === null) gfxRef.current = resolveGfx();
  const maxDpr = gfxRef.current.dpr;
  const aaOn = gfxRef.current.aa;
  // Starts at 0 on both server and client, so the first mount is never a
  // remount; only a real toggle bumps it.
  const [aaEpoch, setAaEpoch] = useState(0);
  useEffect(() => {
    const next = resolveGfx();
    if (gfxRef.current && next.aa !== gfxRef.current.aa) {
      gfxRef.current = next;
      setAaEpoch((e) => e + 1);
    } else if (gfxRef.current) {
      gfxRef.current.dpr = next.dpr; // dpr changes in place, no remount needed
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.antialias, config.antialiasMobile, config.maxPixelRatio, config.maxPixelRatioMobile]);

  // Ambience: fire crackling and banjo, both ONLY at the campfire (scene 1)
  // - they used to play everywhere, which meant they were still going
  // underneath the arcade's own music (or just droning on with nothing
  // burning on screen) the moment you rang away. Volumes come from config;
  // the master multiplier at the front lets a single knob quiet the whole
  // scene without touching per-track balance. Autoplay unlocks on the first
  // click anywhere (browsers require a gesture).
  const master = clampUnit(config.masterVolume);
  useCampsiteAudioLoop(FIRE_CRACKLING_URL, {
    volume: master * clampUnit(config.fireCracklingVolume),
    enabled: panel === LOCATION_CAMPFIRE,
  });
  // -1..1, written every frame inside the canvas (CampfireAnimals) from the
  // banjo bear's live head position relative to the camera - makes the loop
  // genuinely space-aware instead of centered: orbit around him and he
  // audibly moves across the stereo field like the rest of the scene does
  // visually.
  const banjoPanRef = useRef(0);
  // Louder the closer the camera is to him (see CampfireAnimals); starts
  // quiet so the fly-in swells up rather than starting at full volume.
  const banjoGainRef = useRef(0.2);
  const banjoTimeRef = useRef(0);
  useCampsiteAudioLoop(BANJO_URL_SOUND, {
    volume: master * clampUnit(config.banjoVolume),
    enabled: panel === LOCATION_CAMPFIRE,
    liveMultiplier: banjoGainRef,
    panRef: banjoPanRef,
    timeRef: banjoTimeRef,
  });
  const playClick = useCampsiteOneShot(CLICK_URL);
  const playHover = useCampsiteOneShot(HOVER_URL);
  const playBack = useCampsiteOneShot(BACK_URL);
  const playSelect = useCampsiteOneShot(SELECT_URL);
  const playFishFlop = useCampsiteOneShot(FISH_FLOP_URL);
  const playFireWhoosh = useCampsiteOneShot(FIRE_WHOOSH_URL);
  const playCrtZoomIn = useCampsiteOneShot(CRT_ZOOM_IN_URL);
  const playCrtZoomOut = useCampsiteOneShot(CRT_ZOOM_OUT_URL);
  const onFishClickSound = () => playFishFlop(master * clampUnit(config.clickVolume));
  // Shared by both ways of landing in the fire: clicking it directly, and the
  // fish's own throw completing on it. The click side additionally cools down
  // (see FIRE_CLICK_COOLDOWN_MS, applied where this is called) - the fish
  // throw is already paced by its own multi-second flight, so it doesn't
  // need one.
  const onFireWhooshSound = () => playFireWhoosh(master * clampUnit(config.clickVolume));
  const playClickCue = () => playClick(master * clampUnit(config.clickVolume));
  const playHoverCue = () => playHover(master * clampUnit(config.hoverVolume));
  const playBackCue = () => playBack(master * clampUnit(config.clickVolume));
  // The CRT's own select/back/zoom cues, kept apart from the general
  // playClickCue every other clickable object in the scene uses - the CRT is
  // its own little device with its own sound set.
  const playCrtSelectCue = () => playSelect(master * clampUnit(config.clickVolume));
  const playCrtEnterCue = () => playCrtZoomIn(master * clampUnit(config.swooshVolume));
  const playCrtExitCue = () => playCrtZoomOut(master * clampUnit(config.swooshVolume));

  // Ambient arcade music. Loops only on the arcade panel (scene 2) -
  // `enabled` drops it the moment you ring away to another campsite. Its
  // volume itself starts at CRT_MUSIC_FAR_MULT and rises to
  // CRT_MUSIC_FOCUS_BOOST as crtMusicMultiplierRef climbs, which
  // CrtFocusCamera (inside the canvas) writes every frame in step with the
  // actual camera flight onto the
  // glass - so the loop is felt getting closer, not switched at the door.
  const crtMusicActive = panel === LOCATION_ARCADE;
  const crtMusicBase = master * clampUnit(config.swooshVolume);
  // CrtFocusCamera (inside the canvas) writes the resolved FAR..BOOST
  // multiplier into this ref every frame, in step with the actual camera
  // flight onto the glass - see its own comment for why that lives there
  // rather than the raw 0..1 progress being remapped out here.
  const crtMusicMultiplierRef = useRef(CRT_MUSIC_FAR_MULT);
  useCampsiteAudioLoop(CRT_MUSIC_URL, {
    volume: crtMusicBase,
    enabled: crtMusicActive,
    liveMultiplier: crtMusicMultiplierRef,
  });
  // Route selection through the click cue so every clickable object plays
  // click.mp3 in the LAB, where clicking something has a real purpose (it
  // opens the object drawer) and an audible confirmation earns its keep.
  //
  // On the main site there is no drawer, no drag - editing is false there -
  // so a "click" on a huge Selectable like old_bear_camping (which is most
  // of the ground the whole diorama stands on) fired the same click.mp3 as
  // actually picking a real object, with nothing to tell them apart. That
  // read as noise on every random tap, not feedback. The genuinely
  // interactive things on the site - the fish, the fire, the CRT - already
  // play their own dedicated cue regardless of this flag, so gating the
  // generic one to `editing` loses nothing there and stops it firing for
  // everything else.
  //
  // The CRT screen mesh also deliberately does NOT stop its click from
  // bubbling (see the comment on it in CampProps.tsx) - the Selectable
  // wrapping the tube needs that bubble to pick the tube in the lab. Every
  // click on the glass reaches here as a "crt_0" selection too, on top of
  // whatever CRT-specific cue onCrtClick already played for it - excluded
  // here for the same reason (its own sound set already covers it).
  const selectWithSound = (name: string) => {
    if (editing && name && !name.startsWith("crt_")) playClickCue();
    selectHandler(name);
  };

  // `resize={{ offsetSize: true }}` below: the landscape wrapper rotates this
  // canvas's container 90deg in portrait, and R3F measures with
  // getBoundingClientRect(), which returns the SCREEN-ALIGNED bounding box of a
  // rotated element - 375x812 where the container is really 812x375. It then
  // sized the canvas to those swapped axes and left the rest of the container
  // empty, which showed up as a black band across the bottom of the phone.
  // offsetSize switches the measurement to offsetWidth/offsetHeight, which are
  // untransformed layout dimensions and so come back the right way round.
  return (
    <>
    <Canvas
      /*
       * antialias is a CONTEXT attribute: WebGL fixes it when the drawing
       * buffer is created and there is no way to change it afterwards. So the
       * toggle has to remount the canvas, which is what keying on it does.
       * Fine for an A/B in the lab, and the GLB cache survives the remount, so
       * it comes back immediately.
       */
      key={`aa-${aaEpoch}`}
      className="absolute inset-0"
      resize={{ offsetSize: true }}
      /*
       * Every fragment of the colour pass is paid for at dpr^2. A phone
       * reporting 3 was being clamped to 2, i.e. four times the pixels of a
       * 1x render, to draw a scene whose whole readable content is firelight
       * and silhouettes. Capping coarse-pointer devices lower is the single
       * cheapest frame you can buy here, and it costs almost nothing visible.
       */
      dpr={[1, maxDpr]}
      shadows
      camera={{ position: [config.cameraX, config.cameraY, config.cameraZ], fov: config.fov, near: 0.01, far: 500 }}
      gl={{ antialias: aaOn, alpha: false, powerPreference: "high-performance" }}
      onPointerMissed={() => selectHandler("")}
    >
      <Matte />
      <CampfireWorld
        config={config}
        onCameraChange={cameraChangeHandler}
        onSelect={selectWithSound}
        selectedObject={selectedObject}
        dragPlaneMode={dragPlaneMode}
        onObjectTranslate={translateHandler}
        flying={flying}
        onIntroDone={() => setFlying(false)}
        panel={panel}
        editing={editing}
        onLocationViewChange={onLocationViewChange}
        titleHeld={titleHeld}
        onFishClickSound={onFishClickSound}
        onFireWhooshSound={onFireWhooshSound}
        onHoverSound={playHoverCue}
        onCrtEnterSound={playCrtEnterCue}
        onCrtExitSound={playCrtExitCue}
        onCrtBackSound={playBackCue}
        onCrtSelectSound={playCrtSelectCue}
        crtZoomRef={crtMusicMultiplierRef}
        banjoPanRef={banjoPanRef}
        banjoGainRef={banjoGainRef}
        banjoTimeRef={banjoTimeRef}
        cameraSnapSignal={cameraSnapSignal}
        onlyBearsPlaySignal={onlyBearsPlaySignal}
        cameraLivePoseRef={cameraLivePoseRef}
        bearVoiceRef={bearVoiceRef}
        onFishImpact={onFishImpact}
      />
      {perfOn ? <PerfProbe onSample={setPerf} /> : null}
    </Canvas>
    {perfOn && perf ? (
      <div className="pointer-events-none absolute left-2 top-2 z-50 rounded bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-lime-300">
        <div>{perf.fps.toFixed(0)} fps &middot; {perf.calls} calls &middot; {(perf.tris / 1000).toFixed(0)}k tris</div>
        <div>{perf.lights} lights &middot; {perf.shadowMaps} shadow passes</div>
        <div>shadow {(perf.shadowTexels / 1e6).toFixed(1)}M px &middot; screen {(perf.screenTexels / 1e6).toFixed(2)}M px</div>
        <div>= {(perf.shadowTexels / Math.max(1, perf.screenTexels)).toFixed(1)}x the screen, per frame</div>
        <div>{perf.progs} programs &middot; {perf.geoms} geom &middot; {perf.textures} tex</div>
      </div>
    ) : null}
    </>
  );
}

useGLTF.preload(CAMPFIRE_SCENE_URL);
useGLTF.preload(PINE_TREE_URL);
useGLTF.preload(WOOD_LOG_URL);
useGLTF.preload(NEW_LOG_URL);
useGLTF.preload(WHITE_OWL_URL);
useGLTF.preload(RED_OWL_URL);
useGLTF.preload(TOUCAN_URL);
useGLTF.preload(DEER_URL);
useGLTF.preload(DOE_URL);
useGLTF.preload(BEAR_URL);
useGLTF.preload(BEAR_OLD_URL);
useGLTF.preload(BEAR_URL_FRONT_LOG);
useGLTF.preload(BEAR_URL_BACK_RIGHT_LOG);
useGLTF.preload(FISH_URL);
useGLTF.preload(FISH_STICK_URL);
useGLTF.preload(PICKUP_TRUCK_URL);
useGLTF.preload(CARAVAN_URL);
useGLTF.preload(CAMPER_URL);
useGLTF.preload(CUB_URL);
useGLTF.preload(WOODEN_CABIN_URL);
useGLTF.preload(GAMECUBE_URL);
useGLTF.preload(XBOX360_URL);
useGLTF.preload(GAMECUBE_CONSOLE_URL);
useGLTF.preload(CONTROLLER_URL);
useGLTF.preload(GLASSES_URL);
useGLTF.preload(TENT_URL);
useGLTF.preload(HONEY_WAND_URL);
useGLTF.preload(WOOD_PILE_URL);
useGLTF.preload(FISHING_ROD_URL);
useGLTF.preload(RACCOON2_URL);
useGLTF.preload(BACKPACK_URL);
useGLTF.preload(HIKING_BACKPACK_URL);
useGLTF.preload(BOOK_URL);
useGLTF.preload(BACKPACK_Q2_URL);
useGLTF.preload(BACKPACK_TOASTIE_URL);
useGLTF.preload(FISH_BONE_URL);
useGLTF.preload(KEG_URL);
useGLTF.preload(KETTLE_URL);
useGLTF.preload(BEER_MUG_URL);
useGLTF.preload(SOJU_URL);
useGLTF.preload(STOOL_URL);
useGLTF.preload(CAMERA_URL);
useGLTF.preload(LOG_AXE_URL);
useGLTF.preload(LAPTOP_URL);
useGLTF.preload(BANJO_URL);
useGLTF.preload(OLD_BEAR_TABLE_URL);
useGLTF.preload(OLD_BEAR_CHAIR_URL);
useGLTF.preload(OLD_BEAR_COMPUTER_URL);
useGLTF.preload(OLD_BEAR_BOOKS_URL);
useGLTF.preload(OLD_BEAR_MUG_URL);
useGLTF.preload(OLD_BEAR_BOXES_URL);
useGLTF.preload(OLD_BEAR_PAPERS_URL);
useGLTF.preload(OLD_BEAR_TOILET_URL);
useGLTF.preload(OLD_BEAR_POSTIT_URL);
useGLTF.preload(OLD_BEAR_DEBRIS_URL);
useGLTF.preload(OLD_BEAR_LANTERN_URL);
useGLTF.preload(OLD_BEAR_CARAVAN_URL);
useGLTF.preload(OLD_BEAR_CAMPING_URL);
useGLTF.preload(CARAVAN_HOLLOW_URL);
for (const prop of ARCADE_CUB_PROPS) {
  useGLTF.preload(prop.url);
}

// Retained scene components that aren't mounted right now but that we want
// to keep on hand for the next iteration (gamecube setup, extra lighting
// helpers, camping variant). Referencing them here silences the eslint
// no-unused-vars rule without deleting working code.
void RawGLB;
void CampingWithLamps;
void UnlitGLB;
void MirroredGLBModel;
void GameCubeConsole;
void BackgroundGlow;
