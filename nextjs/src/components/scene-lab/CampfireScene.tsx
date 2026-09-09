"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentRef, ReactNode, RefObject } from "react";
import IntroFlight from "@/components/scene-lab/IntroFlight";
import SafeAsset from "@/components/scene-lab/SafeAsset";
import { RetroCrtTv, Table, Chair, type CrtScreen } from "@/components/scene-lab/CampProps";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Clone, OrbitControls, Stars, useAnimations, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { CampfireSceneConfig, LocationView, ObjectOverride } from "@/components/scene-lab/sceneConfig";
import { defaultLocationView, DUPLICATE_PREFIX, EMPTY_OVERRIDE } from "@/components/scene-lab/sceneConfig";
import banjoBearPoseRaw from "@/config/banjoBearPose.json";
import bearPosesRaw from "@/config/bearPoses.json";
import { useCampsiteAudioLoop, useCampsiteOneShot } from "@/lib/campsiteSounds";

import Matte from "@/components/Matte";
const FIRE_CRACKLING_URL = "/sound/fire_crackling.mp3";
const BANJO_URL_SOUND = "/sound/banjo.mp3";
const CLICK_URL = "/sound/click.mp3";
const HOVER_URL = "/sound/hover.mp3";

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
const RACCOON_URL = "/wildpoly/raccoon.glb";
const BEAR_URL = "/wildpoly/bear_sit_fixed.glb";
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

/** Where the cord leaves the controller shell, in controller-local metres. */
const CONTROLLER_CORD_EXIT = new THREE.Vector3(-0.00668, -0.00142, -0.03165);

/** Measured off the original cord: 15 mm radius at model scale, ~1.3 mm for real. */
const WIRE_RADIUS = 0.0042;
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
const ARCADE_SCREENS: CrtScreen[] = [
  // Right CRT. Tint sampled off the artwork itself: melee.png averages a
  // warm tan once the near-black letterbox pixels are ignored, scaled up
  // to something a lit tube would actually throw.
  { content: "/bear/2/melee.png", tint: "#e6cd8f", glow: 1.0 },
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
function Location({
  index,
  config,
  children,
}: {
  index: number;
  config: CampfireSceneConfig;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const cfg = useRef(config);
  cfg.current = config;
  useFrame(() => {
    if (!ref.current) return;
    const c = cfg.current;
    const a = LOCATION_AZIMUTH(index, c);
    ref.current.position.set(Math.sin(a) * c.locationRadius, 0, Math.cos(a) * c.locationRadius);
    ref.current.rotation.set(0, a + Math.PI + c.locationSpin, 0);
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

type HeadRegistry = Map<string, THREE.Vector3>;

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
}

const ANIMALS: AnimalPlacement[] = [
  { url: WHITE_OWL_URL, position: [-1.6, 0.55, 2.4], rotationY: Math.PI, scale: 0.5, label: "white owl on front log" },
  { url: RED_OWL_URL, position: [-0.8, 0.55, 2.4], rotationY: Math.PI, scale: 0.5, label: "red owl on front log" },
  { url: TOUCAN_URL, position: [0, 0.55, 2.4], rotationY: Math.PI, scale: 3.6, label: "toucan on front log" },
  { url: DEER_URL, position: [0.8, 0, 2.4], rotationY: Math.PI, scale: 1.5, label: "deer next to front log", flatShading: true },
  { url: DOE_URL, position: [1.6, 0, 2.4], rotationY: Math.PI, scale: 1.45, label: "doe next to front log", flatShading: true },
  { url: RACCOON_URL, position: [-0.2, 0.55, 2.4], rotationY: Math.PI, scale: 0.35, label: "raccoon on front log", animation: "idle" },
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
  editing = false,
}: {
  config: CampfireSceneConfig;
  panel: number;
  active: boolean;
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

  useFrame((_, delta) => {
    if (!active) return;
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
function Selectable({
  name,
  onSelect,
  config,
  basePosition = [0, 0, 0],
  baseRotationY = 0,
  baseScale = 1,
  children,
}: {
  name: string;
  onSelect: (name: string) => void;
  config: CampfireSceneConfig;
  basePosition?: [number, number, number];
  baseRotationY?: number;
  baseScale?: number;
  children: ReactNode;
}) {
  const o = config.objectOverrides?.[name] ?? EMPTY_OVERRIDE;
  if (o.hide >= 0.5) return null;
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
    >
      {children}
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

  return (
    <primitive
      object={scene}
      position={[config.sceneX, config.sceneY, config.sceneZ]}
      rotation={[0, config.sceneRotationY, 0]}
      scale={config.sceneScale}
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

function CampfireFlame({
  x, y, z, scale, outerScale, innerScale, haloScale,
}: {
  x: number; y: number; z: number; scale: number;
  outerScale: number; innerScale: number; haloScale: number;
}) {
  // Individual size multipliers on top of the whole-group scale, so the
  // orange outer sheath, yellow-orange mid tongue, pale-yellow inner tip, and
  // hot central halo can each be dialled independently. Mid follows outer so
  // it stays tucked inside the outer flame; outer/inner/halo each get their
  // own knob.
  const mid = (outerScale + innerScale) * 0.5;
  return (
    <group position={[x, y, z]} scale={scale}>
      <FlameCone color="#ff6b1a" opacity={0.82} radius={0.42 * outerScale} height={1.35 * outerScale} phase={0.3} y={0.62 * outerScale} />
      <FlameCone color="#ffb431" opacity={0.9}  radius={0.28 * mid}         height={1.05 * mid}         phase={2.2} y={0.58 * mid} />
      <FlameCone color="#fff06a" opacity={0.95} radius={0.17 * innerScale} height={0.78 * innerScale} phase={4.3} y={0.52 * innerScale} />
      <mesh position={[0, 0.16 * haloScale, 0]} scale={haloScale}>
        <sphereGeometry args={[0.32, 16, 10]} />
        <meshBasicMaterial color="#ff7a1f" transparent opacity={0.45} depthWrite={false} />
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
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
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
  const { actions, names: actionNames } = useAnimations(gltf.animations || [], groupRef);

  const cfgRef = useRef(config);
  cfgRef.current = config;

  useEffect(() => {
    // 16.7s of gentle sway on the string lights and plants - not a turntable.
    const key = actionNames[0];
    if (!key || !actions?.[key]) return;
    const action = actions[key];
    action.reset().fadeIn(0.5).play();
    return () => { action.fadeOut(0.3); };
  }, [actions, actionNames]);

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
 * An owl perched on the cabin's lantern beam.
 *
 * WHERE it sits comes out of the cabin, not out of guesswork. The lantern
 * hangs off a wooden bracket - Cube.004_wood_0 - which measures x[15.1, 16.7]
 * y[37.1, 38.8] z[36.6, 48.6] in the cabin's own space, and the lantern body
 * occupies z[45.2, 50.0] of it. So the beam's top face is y 38.8, its centre
 * line x 15.9, and the free run of beam beside the lantern is z 36.6 to 45.2.
 * The defaults put the owl at (15.9, 38.8, 43) - stood on the beam, just clear
 * of the lantern, right in its pool of light.
 *
 * Coordinates are in the SAME cabin-local units as arcadeCabinLampX/Y/Z, so
 * the owl's 15.9 / 38.8 / 41.5 reads directly against the lamp's 16.05 /
 * 33.04 / 47.62 - and the lamp's config lands dead on the lantern mesh's own
 * centre (16.05, 33.05, 47.65), which is how the frame was confirmed.
 *
 * One world unit is 32.6 cabin units at the cabin's current scale (0.1
 * baseScale x 0.307 override), so the default 9.8-unit owl is 30 cm tall -
 * deliberately the same size as the two owls already on the front log, which
 * sit at ANIMALS scale 0.5 against a 0.5986 bind height.
 *
 * Perched and idling it occupies 6.6 x 9.8 x 9.1 cabin units, which is why Z
 * is 41.5 rather than 43: half its depth is 4.5, so it reaches z 46 at 43 and
 * clips into the lantern. At 41.5 it spans 37.0 to 46.0... turned across the
 * beam by the default pi/2 spin it spans z 38.2 to 44.8, clear of the
 * lantern's 45.2 with room to spare, and inside the beam's 36.6 to 48.6.
 *
 * Two things this rides for free by living inside the cabin's model frame:
 * it tracks the cabin through the mirror group and every scale above it, and
 * three flips the winding for the mirror's negative determinant on its own
 * (WebGLRenderer.js:1100), so no DoubleSide fixup is needed - unlike
 * MirroredGLBModel, which forces it for RAYCASTING, which Mesh.raycast does
 * not compensate for.
 */
const CABIN_OWL_CLIPS = ["idle", "sleep", "headtwist"] as const;
/*
 * Sizing a SKINNED mesh: do NOT measure the POSITION attribute.
 *
 * white_owl.glb's raw POSITION data, with every node transform applied, boxes
 * up at 0.015006 x 0.006080 x 0.006450. That number is meaningless. The mesh
 * is skinned, so what actually reaches the screen is each vertex pushed
 * through sum(w_j * boneWorld_j * inverseBind_j) - and for this file the bind
 * matrices carry a ~98x scale. Skinning the vertices properly gives a bind
 * pose of 1.32912 x 0.59861 x 0.76330. Normalising against the raw box made
 * the owl ninety-eight times too big.
 *
 * And the bind pose is wings-OUT, which is not how it will ever be seen. The
 * numbers below come from evaluating the idle clip itself across its 9.13s
 * cycle, which folds the wings:
 *
 *            width    height   depth    feet y
 *   bind     1.3291   0.5986   0.7633   -0.0633
 *   idle     0.4459   0.6579   0.6079   -0.0219 .. -0.0086
 *
 * So: normalise to one unit tall on the IDLE height, and lift by the lowest
 * the feet get in the cycle, so they never sink into the beam. The Y knob then
 * means "the surface it stands on" and Scale means "how tall it is", both in
 * cabin units.
 */
const CABIN_OWL_NORMALIZE = 1 / 0.6579;
const CABIN_OWL_FEET_LIFT = 0.0219 / 0.6579;

function CabinOwl({ config }: { config: CampfireSceneConfig }) {
  const gltf = useGLTF(WHITE_OWL_URL) as unknown as {
    scene: THREE.Group; animations: THREE.AnimationClip[];
  };
  // skeletonClone, not the cached scene: this same white owl is already
  // perched on the front log by CampfireAnimals, and a plain reference would
  // leave both birds sharing one skeleton - whichever mixer ran last would
  // pose them together. No new download either, the file is already preloaded.
  const owl = useMemo(() => skeletonClone(gltf.scene), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, owl);

  useEffect(() => {
    owl.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
  }, [owl]);

  const clip = CABIN_OWL_CLIPS[
    Math.max(0, Math.min(CABIN_OWL_CLIPS.length - 1, Math.round(config.arcadeCabinOwlClip)))
  ];
  useEffect(() => {
    // The two owl files prefix their clips with different rig names -
    // "EagleOwl_Rig|EagleOwl_Rig|idle" here, "Bird1009_Rig|..." in the red one
    // - so match the verb at the end rather than the whole key.
    const key = Object.keys(actions).find((k) => k.toLowerCase().endsWith(clip));
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    return () => { action.stop(); };
  }, [actions, clip]);

  return (
    <group
      position={[config.arcadeCabinOwlX, config.arcadeCabinOwlY, config.arcadeCabinOwlZ]}
      rotation={[0, config.arcadeCabinOwlRotY, 0]}
      scale={config.arcadeCabinOwlScale}
    >
      {/* Feet on the beam. The lift is in owl-heights, so the outer scale
          carries it into cabin units along with everything else. */}
      <group position={[0, CABIN_OWL_FEET_LIFT, 0]}>
        <group scale={CABIN_OWL_NORMALIZE}>
          <primitive object={owl} />
        </group>
      </group>
    </group>
  );
}

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
      {config.arcadeCabinOwlOn >= 0.5 && <CabinOwl config={config} />}
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
          count={config.deskBugCount}
          radius={config.deskBugRadius}
          spread={config.deskBugSpread}
          height={config.deskBugHeight}
          speed={config.deskBugSpeed}
          jitter={config.deskBugJitter}
          dive={config.deskBugDive}
          size={config.deskBugSize}
          opacity={config.deskBugOpacity}
          color={bugColor}
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
};

/**
 * How deep in the dock's shadow the point (x, y, z) is. 0 = fully lit, 1 =
 * fully blocked, with a smoothstep across the edge.
 */
function shadeAt(s: FishShade, x: number, y: number, z: number): number {
  const f = s.field;
  const drop = s.light[1] - f.deckY;
  if (drop <= 1e-4) return 0;                 // lantern is at or below the deck
  const k = (s.light[1] - y) / drop;          // how far the shadow has spread
  if (k <= 1) return 0;                       // the point is not below the deck
  // Back up the ray to the lantern until it meets the deck plane.
  const dx = s.light[0] + (x - s.light[0]) / k;
  const dz = s.light[2] + (z - s.light[2]) / k;
  const gx = (dx - f.x0) / f.cell - 0.5;
  const gz = (dz - f.z0) / f.cell - 0.5;
  if (gx < 0 || gz < 0 || gx > f.w - 1 || gz > f.h - 1) return 0;
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
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
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
  wiggle: number; beat: number; sway: number;
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
const SWIM_AMPLIFY: Record<string, number> = {
  Tail: 1, Spine3: 0.8, Bone: 0.5, "Bone.001": 0.5,
};
// Amplitude in radians at Wiggle 1, and how far each bone leads the tail, in
// cycles. Spine2 bends about twice as far as Spine1 - the body arches most
// behind the head, not at the nose.
const SWIM_WAVE: readonly { name: string; amp: number; lead: number }[] = [
  { name: "Spine1", amp: 0.055, lead: 0.30 },
  { name: "Spine2", amp: 0.105, lead: 0.15 },
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
    const wave: { obj: THREE.Object3D; rest: THREE.Quaternion; amp: number; lead: number }[] = [];
    for (const { name, amp, lead } of SWIM_WAVE) {
      const obj = scene.getObjectByName(name);
      // Safe to read the bone here: nothing animates Spine1/Spine2, in this
      // clip or in the pet fish's, so they are still at their bind pose.
      if (obj) wave.push({ obj, rest: obj.quaternion.clone(), amp, lead });
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
      // Bend the two bones the clip forgot, ahead of the tail, so the flick
      // becomes a wave travelling from the head back.
      if (rig.wave.length && Math.abs(params.wiggle) > 0.001) {
        const cycle = (action.time / rig.duration) - SWIM_PEAK_PHASE;
        for (const { obj, rest, amp, lead } of rig.wave) {
          const a = amp * params.wiggle * Math.cos(2 * Math.PI * (cycle + lead));
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
    const yaw = Math.atan2(xf - x, zf - z) + params.yaw;
    const yawBack = Math.atan2(x - xb, z - zb) + params.yaw;
    // Wrap before differencing, or the roll snaps whenever heading crosses +-PI.
    let turn = yaw - yawBack;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const roll = Math.max(-0.7, Math.min(0.7, (turn / dt) * 0.12 * params.bank));
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
};

function BugSwarm({
  origin, frameScale, count, radius, spread, height, speed, jitter, dive,
  size, opacity, color,
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
  const { positions, alphas, bugs } = useMemo(() => {
    const rand = seededRandom(0xb0c5);
    const made = Array.from({ length: N }, (_, i) => ({
      rf: 0.35 + rand(),                              // where it sits in the radius band
      phase: rand() * Math.PI * 2,
      w: (0.55 + rand() * 0.9) * (i % 2 ? -1 : 1),    // half of them orbit the other way
      yf: rand() - 0.5,                               // height within the column
      tilt: (rand() - 0.5) * 1.4,                     // how tipped its orbit plane is
      tiltPhase: rand() * Math.PI * 2,
      jp: rand() * Math.PI * 2,                       // wobble phase
      dw: 0.18 + rand() * 0.5,                        // how often this one lunges
      dphase: rand() * Math.PI * 2,
      ff: 9 + rand() * 14,                            // flicker rate
      fp: rand() * Math.PI * 2,
    }));
    // Buffers are sized by N, so this deliberately rebuilds when the count
    // changes and at no other time - a slider drag on radius or speed must not
    // reshuffle which bug is which.
    return { positions: new Float32Array(N * 3), alphas: new Float32Array(N), bugs: made };
  }, [N]);

  const p = useRef({
    origin, radius: localRadius, spread, height: localHeight, speed, jitter, dive,
  });
  p.current = {
    origin, radius: localRadius, spread, height: localHeight, speed, jitter, dive,
  };

  useFrame(({ clock }) => {
    const posAttr = posRef.current, alphaAttr = alphaRef.current;
    if (!posAttr || !alphaAttr) return;
    const P = posAttr.array as Float32Array;
    const A = alphaAttr.array as Float32Array;
    const t = clock.elapsedTime;
    const c = p.current;
    for (let i = 0; i < N; i += 1) {
      const b = bugs[i];
      const r0 = c.radius * (1 - c.spread * 0.5 + c.spread * b.rf);
      // Brief lunge at the bulb, not a pulse - see the note above about ^8.
      const d = Math.pow(0.5 + 0.5 * Math.sin(t * b.dw + b.dphase), 8) * c.dive;
      const r = r0 * (1 - 0.8 * d);
      const a = b.phase + t * b.w * c.speed;
      const j = c.jitter * r0;
      P[i * 3] = c.origin[0] + Math.cos(a) * r
        + j * 0.5 * Math.sin(t * 7.3 + b.jp);
      P[i * 3 + 1] = c.origin[1] + c.height * b.yf
        + Math.sin(a + b.tiltPhase) * c.height * 0.5 * b.tilt
        - d * c.height * 0.55
        + j * 0.35 * Math.sin(t * 9.1 + b.jp * 1.7);
      P[i * 3 + 2] = c.origin[2] + Math.sin(a) * r
        + j * 0.5 * Math.cos(t * 6.1 + b.jp * 2.3);
      const flick = 0.5 + 0.5 * Math.sin(t * b.ff + b.fp);
      A[i] = Math.min(1, 0.25 + 0.75 * flick + d * 0.6);
    }
    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute ref={posRef} attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute ref={alphaRef} attach="attributes-alpha" args={[alphas, 1]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
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
      count={config.deskBugCount}
      radius={config.deskBugRadius}
      spread={config.deskBugSpread}
      height={config.deskBugHeight}
      speed={config.deskBugSpeed}
      jitter={config.deskBugJitter}
      dive={config.deskBugDive}
      size={config.deskBugSize}
      opacity={config.deskBugOpacity}
      color={bugColor}
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
  const { base, trees, lampAnchors, lampParts, bulbMats, waterMeshes, dockShade } = useMemo(() => {
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
    const byMesh = new Map<string, { position: THREE.Vector3; glass: THREE.Material[] }>();
    cloned.traverse((o) => {
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
      // cloned sits at identity here, so its world position IS the local
      // position the pointLight needs alongside <primitive object={base} />.
      byMesh.set(mesh.name, { position: mesh.getWorldPosition(new THREE.Vector3()), glass });
    });
    // One anchor per BULB, but the lamp (and therefore the config block) is
    // shared - so the van's two headlights get a light each off one set of
    // sliders.
    // Everything that travels when a fixture is nudged: glass AND housing.
    // Offsets are authored in CAMP units but written to mesh.position, which
    // is in the mesh's own scaled parent - so the parent's world scale is
    // captured here to divide back out. Same correction the river needs.
    const lampParts: { id: string; mesh: THREE.Object3D; base: THREE.Vector3; pscale: THREE.Vector3 }[] = [];
    cloned.traverse((o) => {
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
      .filter((a): a is { lamp: DeskCampLamp; mesh: string; position: THREE.Vector3; glass: THREE.Material[] } => !!a.position);

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
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || DESK_CAMP_LAMP_MESHES.has(mesh.name)) return;
      const src = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      const next = src.map((m) => {
        const name = (m as { name?: string })?.name ?? "";
        if (name !== "Lamp" && !name.startsWith("Lamp.")) return m;
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
    });

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

    return { base: cloned, trees, lampAnchors, lampParts, bulbMats, waterMeshes, dockShade };
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
    return {
      field: dockShade,
      light: [
        anchor.position.x + (cr.deskLampSmallBLightX ?? 0),
        anchor.position.y + (cr.deskLampSmallBLightY ?? 0),
        anchor.position.z + (cr.deskLampSmallBLightZ ?? 0),
      ],
      amount: lit ? config.deskFishShade : 0,
      fade: lit ? config.deskFishShadeFade : 0,
      soft: config.deskFishShadeSoft,
    };
  }, [dockShade, lampAnchors, config]);

  return (
    <>
      <primitive object={base} />
      {config.deskCampLampEnabled >= 0.5 && lampAnchors.map(({ lamp, mesh, position }) => (
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
}: {
  root: RefObject<THREE.Group | null>;
  prop: PropAttachment;
  ready: unknown;
  config: CampfireSceneConfig;
}) {
  const gltf = useGLTF(prop.url) as unknown as { scene: THREE.Group };
  // Live handle so useFrame can re-apply the config-driven transform without
  // remounting the prop every time a slider moves.
  const propRef = useRef<THREE.Object3D | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
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
      if (stick) {
        attached.remove(stick);
        stick.geometry.dispose();
        (stick.material as THREE.Material).dispose();
      }
    };
  }, [gltf.scene, prop.url, prop.scale, prop.rotation, prop.position, prop.stickLength, prop.stickRadius, prop.stickPosition, prop.stickRotation, root, ready]);

  // Live config-driven overrides: re-apply each frame on top of the baseline
  // transform so sliders in the lab move the banjo without rebuilding it.
  useFrame(() => {
    const obj = propRef.current;
    if (!obj || !prop.configKey) return;
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
 * One controller lead. The ONLY thing in this scene that stretches - the console and
 * the controllers are rigid, and the slack between them is taken up here.
 *
 * It bows sideways rather than sagging, because both ends sit within a few centimetres
 * of the floor and a hanging curve would just clip through it; each lead bows by a
 * different amount so the four fan out across the ground instead of overlapping.
 *
 * The geometry is only rebuilt when an end actually moves - the cubs breathe, but a
 * couple of millimetres is not worth a new tube every frame.
 */
function ControllerWire({
  index,
  cords,
  ports,
  cubName,
}: {
  index: number;
  cords: RefObject<CordRegistry>;
  ports: RefObject<PortRegistry>;
  cubName: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const mid = useMemo(() => new THREE.Vector3(), []);
  const lastA = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const lastB = useRef(new THREE.Vector3(NaN, NaN, NaN));

  const initial = useMemo(
    () =>
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(),
          new THREE.Vector3(0, 0, 0.5),
          new THREE.Vector3(0, 0, 1)
        ),
        20,
        WIRE_RADIUS,
        6,
        false
      ),
    []
  );

  useEffect(() => () => { meshRef.current?.geometry?.dispose(); }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.parent) return;
    const from = cords.current?.get(cubName);
    const to = ports.current?.get(index);
    if (!from || !to) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    a.copy(from);
    b.copy(to);
    mesh.parent.worldToLocal(a);
    mesh.parent.worldToLocal(b);
    // 2mm of movement is below anything you could see on a 4mm cord
    if (a.distanceToSquared(lastA.current) < 4e-6 && b.distanceToSquared(lastB.current) < 4e-6) return;
    lastA.current.copy(a);
    lastB.current.copy(b);

    mid.copy(a).lerp(b, 0.5);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const bow = (index - (CONSOLE_PORTS.length - 1) / 2) * 0.06;
    mid.x += (-dz / len) * bow;
    mid.z += (dx / len) * bow;
    mid.y = WIRE_RADIUS * 1.2; // lying on the ground between the two ends

    mesh.geometry.dispose();
    mesh.geometry = new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(a.clone(), mid.clone(), b.clone()),
      20,
      WIRE_RADIUS,
      6,
      false
    );
  });

  return (
    <mesh ref={meshRef} geometry={initial} castShadow>
      <meshStandardMaterial color="#15171b" roughness={0.9} metalness={0} />
    </mesh>
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

  // Banjo-bear arm override: eight arm bones + their rest quaternions, so the
  // picking loop can compose `rest * userEuler` each frame and hard-replace
  // whatever the base clip wrote for arms.
  const banjoBonesRef = useRef<Partial<Record<string, THREE.Bone>>>({});
  const banjoRestQRef = useRef<Partial<Record<string, THREE.Quaternion>>>({});
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
  }, [model, placement.url, placement.bearId, placement.banjoPlayer, gltf.animations, seed]);

  const { actions, names: actionNames } = useAnimations(gltf.animations || [], groupRef);

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
  const glance = useRef({ t: 0, next: 2.5 + seed * 1.7, phase: "wait" as "wait" | "turn" | "hold" | "back", w: 0, target: "" });
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const tmpV2 = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpQ2 = useMemo(() => new THREE.Quaternion(), []);
  const rng = useMemo(() => seededRandom(97 + seed * 13), [seed]);

  useEffect(() => {
    if (!social) return;
    let head: THREE.Object3D | null = null;
    model.traverse((o) => { if (o.name === "head") head = o; });
    headRef.current = head;
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

    // Same action already running - keep playing, don't restart. Prevents the
    // T-pose flash that comes from fadeIn(0.3) starting at weight=0 whenever
    // an unrelated dep (autosave HMR, config change) re-fires this effect.
    if (currentActionRef.current === action && action.isRunning()) {
      action.timeScale = placement.animationSpeed ?? 1;
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
    const bearPose = placement.bearId ? BEAR_POSES[placement.bearId] : undefined;
    const holdFrame =
      placement.animationHoldFrame ?? (bearPose?.paused ? bearPose.frame ?? 0 : null);
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
  }, [actions, actionNames, placement.animation, placement.animationOffset, placement.animationSpeed, placement.animationHoldFrame, placement.bearId]);

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

  useFrame(() => {
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
    }
  });

  // Runs after drei's mixer update - useAnimations subscribes its useFrame before
  // this one, and R3F runs same-priority callbacks in subscription order - so this
  // layers on top of the clip instead of being overwritten by it.
  useFrame((_, delta) => {
    if (!social || !groupRef.current || !headRef.current || !heads?.current) return;
    const head = headRef.current;
    const reg = heads.current;
    const dt = Math.min(delta, 1 / 20);

    groupRef.current.updateMatrixWorld(true);
    head.getWorldPosition(tmpV);
    reg.set(name, (reg.get(name) ?? new THREE.Vector3()).copy(tmpV));

    const g = glance.current;
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
    } else if (g.phase === "turn" && g.t >= 0.85) { g.phase = "hold"; g.t = 0; }
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

    const tgt = g.target ? reg.get(g.target) : undefined;
    if (tgt && g.w > 0.001) {
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
        if (ang > MAX_GLANCE) {
          // too far round to be plausible - only go as far as the neck allows
          tmpV2.copy(cur).lerp(tmpV2, MAX_GLANCE / ang).normalize();
        }
        tmpQ2.setFromUnitVectors(cur, tmpV2).multiply(head.quaternion);
        head.quaternion.slerp(tmpQ2, g.w);
      }
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
function FloppingFish({
  config,
  onClickSound,
  onSelect,
}: {
  config: CampfireSceneConfig;
  onClickSound?: () => void;
  onSelect?: (name: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(FISH_URL) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] };
  const [hovered, setHovered] = useState(false);

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
  const ov = config.objectOverrides?.["fish"] ?? EMPTY_OVERRIDE;
  return (
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
        onSelect?.("fish");
      }}
    >
      {/* Inner group holds the "lay on side" roll so the outer group's Y-rotation
          (the wobble) stays as heading rather than mixing with the flop tilt. */}
      <group rotation={[0, 0, config.fishRotationZ + ov.rotZ]} scale={config.fishScale}>
        <primitive object={gltf.scene} />
      </group>
    </group>
  );
}

function CampfireAnimals({
  config,
  onSelect,
}: {
  config: CampfireSceneConfig;
  onSelect: (name: string) => void;
}) {
  // Live head positions, written and read by the bears each frame, so they can find
  // each other wherever the config sliders have put them.
  const heads = useRef<HeadRegistry>(new Map());

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
      arcadeFire.current.intensity = config.arcadeFireIntensity * flicker;
      arcadeFire.current.decay = config.arcadeFireDecay;
      arcadeFire.current.distance = config.arcadeFireLightReach;
      arcadeFire.current.position.set(config.arcadeFireLightX, config.arcadeFireLightY, config.arcadeFireLightZ);
      arcadeFire.current.color.setRGB(config.arcadeFireLightColorR, config.arcadeFireLightColorG, config.arcadeFireLightColorB);
    }
    if (arcadeFarGlow.current) {
      const slow = 1 + config.arcadeFlickerAmount * (Math.sin(t * 2.3) * 0.06 + Math.sin(t * 4.1) * 0.03);
      arcadeFarGlow.current.intensity = config.arcadeFarGlowIntensity * slow;
      arcadeFarGlow.current.decay = config.arcadeFarGlowDecay;
      arcadeFarGlow.current.distance = config.arcadeFarGlowReach;
      arcadeFarGlow.current.position.set(config.arcadeFireLightX, config.arcadeFireLightY, config.arcadeFireLightZ);
    }
  });

  return (
    <group>
      {bonfire && <primitive object={bonfire} />}
      <CampfireFlame
        x={config.arcadeFlameX} y={config.arcadeFlameY} z={config.arcadeFlameZ}
        scale={config.arcadeFlameScale}
        outerScale={config.arcadeFlameOuterScale}
        innerScale={config.arcadeFlameInnerScale}
        haloScale={config.arcadeFlameHaloScale}
      />
      <FireGlowDisc
        opacity={config.arcadeGlowOpacity}
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
        opacity={config.arcadeSparkOpacity}
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
      <pointLight ref={arcadeFire}
        position={[config.arcadeFireLightX, config.arcadeFireLightY, config.arcadeFireLightZ]}
        color={new THREE.Color(config.arcadeFireLightColorR, config.arcadeFireLightColorG, config.arcadeFireLightColorB)}
        intensity={config.arcadeFireIntensity}
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
      {bonfire && config.deskCampfirePileVisible >= 0.5 && <primitive object={bonfire} />}
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

function ArcadeSector({ config, onSelect }: { config: CampfireSceneConfig; onSelect: (n: string) => void }) {
  const cords = useRef<CordRegistry>(new Map());

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

  const BED_FRONT_Z = -0.14;        // cab-side wall of the bed
  const BED_REAR_Z = 0.46;          // open rear edge of the bed
  const BED_FLOOR_Y = 0.36;         // bed floor height in world

  // CRT layout: two rows, two columns, ALL FOUR INSIDE the open bed. Bottom row
  // sits on the bed floor near the rear opening, top row stacks on top and sits
  // a bit deeper into the bed. All face +Z so their screens speak to the camera.
  const TV_SCALE = 0.72;
  const TV_HEIGHT = 0.28 * TV_SCALE;
  const TV_COL_DX = 0.19;                       // half-spacing between columns
  const TV_FRONT_Z = BED_REAR_Z - 0.10;         // bottom row: just inside the rear opening
  const TV_BACK_Z  = BED_FRONT_Z + 0.16;        // top row: deeper toward cab wall
  const TV_BOTTOM_Y = BED_FLOOR_Y + 0.005;      // slight lift so it doesn't z-fight
  const TV_TOP_Y    = TV_BOTTOM_Y + TV_HEIGHT;

  return (
    <group name="sector_arcade">
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


      {/* Four TVs in a 2x2 grid inside the open truck bed, all facing +Z (the
          camera). i = 0 bottom-left, 1 bottom-right, 2 top-left, 3 top-right.
          Bottom row sits on the bed floor near the rear opening; top row stacks
          on top and sits a bit deeper toward the cab wall - reads as a
          staircase of screens seen through the tailgate opening. */}
      {ARCADE_SCREENS.map((screen, i) => {
        const col = i % 2;                 // 0 left, 1 right
        const row = Math.floor(i / 2);     // 0 bottom, 1 top
        const x = (col - 0.5) * 2 * TV_COL_DX;
        const y = row === 0 ? TV_BOTTOM_Y : TV_TOP_Y;
        const z = row === 0 ? TV_FRONT_Z : TV_BACK_Z;
        // Multiply each screen's baked-in glow by the shared arcadeCrtGlow
        // knob so a single slider brightens/dims all four TVs together and
        // their spill on the cubs and truck reads uniformly hotter/cooler.
        const scaledScreen = {
          ...screen,
          glow: (screen.glow ?? 1) * config.arcadeCrtGlow,
        };
        return (
          <Selectable
            key={i}
            name={`crt_${i}`}
            onSelect={onSelect}
            config={config}
            basePosition={[x, y, z]}
            baseRotationY={0}
            baseScale={TV_SCALE}
          >
            <RetroCrtTv
              screen={scaledScreen}
              seed={i}
              light={{
                forwardOffset: config.arcadeCrtLightForwardOffset,
                angle: config.arcadeCrtLightAngle,
                penumbra: config.arcadeCrtLightPenumbra,
                distance: config.arcadeCrtLightDistance,
                decay: config.arcadeCrtLightDecay,
                intensityScale: config.arcadeCrtLightIntensity,
                offsetX: config.arcadeCrtLightOffsetX,
                offsetY: config.arcadeCrtLightOffsetY,
              }}
            />
          </Selectable>
        );
      })}

      {/* Cool fill above the scene so unlit sides of things don't disappear.
          Kept low; the screens and the truck lamps do most of the work. */}
      <pointLight position={[0, 2.0, 1.8]} color="#8fa8c8" intensity={1.0} distance={7} decay={2} />

      {/* Wooden cabin backdrop for the cub arcade set. Placement/scale are
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

      {/* Honey wand on the ground next to the cubs - a little snack prop.
          Positioned to the side of the seated cubs; adjust in the lab. */}
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
        <group position={[0, -0.061, 1.107]}>
          <SafeAsset label="gamecube console">
            <GLBModel url={GAMECUBE_CONSOLE_URL} />
          </SafeAsset>
        </group>
      </Selectable>

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

      {/* Every non-console GLB from /public/bear/2/. Rendered as one
          Selectable each so the object drawer surfaces them and the user can
          drag/scale each into place; default positions are a rough grid
          behind the cubs. Hide unused ones via objectOverrides.*.hide. */}
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
    </group>
  );
}

/** Location 2 - contact. A bear writing at a table, in profile so the face reads. */
function ContactSector({ config, onSelect }: { config: CampfireSceneConfig; onSelect: (n: string) => void }) {
  // Top surface of the code-built Table is at y ≈ 0.62. GLB props that live on
  // the table start there; drag/scale in the lab.
  const TABLE_TOP_Y = 0.62;
  return (
    <group name="sector_contact">
      {/* Warm hemisphere fill scoped to the desk sector - sky color is the
          amber lantern tint, ground is a cool complement, kept dim so the
          lanterns/computer still do most of the lighting. */}
      <hemisphereLight
        intensity={config.deskAmbientIntensity}
        color={new THREE.Color(config.deskAmbientColorR, config.deskAmbientColorG, config.deskAmbientColorB)}
        groundColor="#1a1420"
      />
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
      <Selectable name="old_bear_computer" onSelect={onSelect} config={config} basePosition={[0.35, TABLE_TOP_Y, -0.15]} baseRotationY={Math.PI}>
        <SafeAsset label="old-bear computer">
          <GLBModel url={OLD_BEAR_COMPUTER_URL} />
        </SafeAsset>
        {/* Screen glow: bluish spill from the monitor face. Spot-light so
            it only shines out the FRONT of the screen (a pointLight was
            lighting the back of the case too). Target sits 1 unit further
            along local +Z from the light itself, so the beam extends outward
            in the direction the screen is placed - if the beam ends up
            pointing into the case instead, flip the Z offset in the light
            position slider. Angle is wide (~80 deg) with strong penumbra so
            it reads as diffuse screen wash, not a torch. */}
        <spotLight
          position={[config.deskComputerLightX, config.deskComputerLightY, config.deskComputerLightZ]}
          target-position={[config.deskComputerLightX, config.deskComputerLightY, config.deskComputerLightZ + 1]}
          color={new THREE.Color(config.deskComputerColorR, config.deskComputerColorG, config.deskComputerColorB)}
          intensity={config.deskComputerIntensity}
          distance={config.deskComputerDistance}
          angle={1.35}
          penumbra={0.7}
          decay={2}
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
      <Animal
        name="bear_contact"
        placement={CONTACT_BEAR}
        config={config}
        onSelect={onSelect}
      />
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
              castShadow
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

function CampfireGround({ config }: { config: CampfireSceneConfig }) {
  const radius = Math.max(30, config.locationRadius + 24);
  // Location 0 IS the campfire camp. Same placement ringMatrix uses, so the
  // patches track the camp if the ring is rotated or resized.
  const centreA = LOCATION_AZIMUTH(0, config);
  const centreX = Math.sin(centreA) * config.locationRadius + config.groundPatchOffsetX;
  const centreZ = Math.cos(centreA) * config.locationRadius + config.groundPatchOffsetZ;
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
      <GroundPatches config={config} centreX={centreX} centreZ={centreZ} />
    </>
  );
}

function BackgroundGlow() {
  return (
    <mesh position={[0, 6, -16]} scale={[18, 7, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#063743" transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

function CampfireWorld({
  config,
  onCameraChange,
  onSelect,
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
  onHoverSound,
  cameraSnapSignal,
  cameraLivePoseRef,
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
  /** while true, freeze IntroFlight at its pulled-back start pose */
  titleHeld?: boolean;
  onFishClickSound?: () => void;
  /** Fired once each time the pointer enters a fresh named object anywhere in
   *  the scene. Used to play hover.mp3. */
  onHoverSound?: () => void;
  cameraLivePoseRef?: React.MutableRefObject<
    { pos: [number, number, number]; tgt: [number, number, number] } | null
  >;
}) {
  // Track the last named object under the cursor. r3f fires onPointerMove for
  // every hovered mesh; we only want a sound when the resolved "top-level
  // named ancestor" actually changes.
  const hoveredNameRef = useRef<string>("");
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
      onHoverSound?.();
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
      <CameraRig config={config} paused={flying || panelled} />
      {panelled ? (
        <LocationCamera config={config} panel={panel} active={!flying} editing={editing} />
      ) : null}
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
        enabled={!flying && !selectedObject && (!panelled || editing)}
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

      <CampfireGround config={config} />
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
        <Location index={0} config={config}>
          <CampfireSceneModel config={config} onSelect={onSelect} />
          {(config.objectOverrides?.["camper"]?.hide ?? 0) < 0.5 && (
            <SafeAsset label="camper"><Camper config={config} onSelect={onSelect} /></SafeAsset>
          )}
          {(config.objectOverrides?.["tent"]?.hide ?? 0) < 0.5 && (
            <SafeAsset label="tent"><Tent config={config} onSelect={onSelect} /></SafeAsset>
          )}
          <Benches config={config} onSelect={onSelect} />
          <CampfireAnimals config={config} onSelect={onSelect} />
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
            basePosition={[-0.9, 0, 1.8]}
            baseRotationY={0.5}
            baseScale={0.4}
          >
            <group position={[20.07, 0.005, 0.069]}>
              <SafeAsset label="hiking backpack">
                <GLBModel url={HIKING_BACKPACK_URL} />
              </SafeAsset>
            </group>
          </Selectable>
          {/* Backpack slumped near the front log. Source model is ~1.6 cm
              across, so baseScale=20 gets it to ~30 cm. Slider tunes further. */}
          <Selectable
            name="campfire_backpack"
            onSelect={onSelect}
            config={config}
            basePosition={[-1.3, 0, 1.6]}
            baseRotationY={0.4}
            baseScale={20}
          >
            <SafeAsset label="backpack">
              <GLBModel url={BACKPACK_URL} />
            </SafeAsset>
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
            <SafeAsset label="fishing rod">
              <GLBModel url={FISHING_ROD_URL} />
            </SafeAsset>
          </Selectable>
          {(config.objectOverrides?.["fish"]?.hide ?? 0) < 0.5 && (
            <SafeAsset label="flopping fish">
              <FloppingFish config={config} onClickSound={onFishClickSound} onSelect={onSelect} />
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
          </group>
        </Location>

        <Location index={1} config={config}>
          <SafeAsset label="arcade"><ArcadeSector config={config} onSelect={onSelect} /></SafeAsset>
        </Location>

        <Location index={2} config={config}>
          <SafeAsset label="contact"><ContactSector config={config} onSelect={onSelect} /></SafeAsset>
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
  cameraLivePoseRef,
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
  /** Populated by the OrbitControls-managed camera every "change" event, so the
   *  lab can commit whatever is on screen right now via Save without needing a
   *  drag first. */
  cameraLivePoseRef?: React.MutableRefObject<
    { pos: [number, number, number]; tgt: [number, number, number] } | null
  >;
}) {
  const cameraChangeHandler = onCameraChange ?? (() => {});
  const selectHandler = onSelect ?? (() => {});
  const translateHandler = onObjectTranslate ?? (() => {});
  const [flying, setFlying] = useState(intro);

  // Ambience: fire crackling always, banjo layered on top. Volumes come from
  // config; the master multiplier at the front lets a single knob quiet the
  // whole scene without touching per-track balance. Autoplay unlocks on the
  // first click anywhere (browsers require a gesture).
  const master = clampUnit(config.masterVolume);
  useCampsiteAudioLoop(FIRE_CRACKLING_URL, {
    volume: master * clampUnit(config.fireCracklingVolume),
    enabled: true,
  });
  useCampsiteAudioLoop(BANJO_URL_SOUND, {
    volume: master * clampUnit(config.banjoVolume),
    enabled: true,
  });
  const playClick = useCampsiteOneShot(CLICK_URL);
  const playHover = useCampsiteOneShot(HOVER_URL);
  const onFishClickSound = () => playClick(master * clampUnit(config.clickVolume));
  const playClickCue = () => playClick(master * clampUnit(config.clickVolume));
  const playHoverCue = () => playHover(master * clampUnit(config.hoverVolume));
  // Route selection through the click cue so every clickable object plays
  // click.mp3, not just the fish. `selectHandler` still fires on empty-string
  // (deselect via onPointerMissed); the guard here keeps that silent.
  const selectWithSound = (name: string) => {
    if (name) playClickCue();
    selectHandler(name);
  };

  return (
    <Canvas
      className="absolute inset-0"
      dpr={[1, 2]}
      shadows
      camera={{ position: [config.cameraX, config.cameraY, config.cameraZ], fov: config.fov, near: 0.01, far: 500 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
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
        onHoverSound={playHoverCue}
        cameraSnapSignal={cameraSnapSignal}
        cameraLivePoseRef={cameraLivePoseRef}
      />
    </Canvas>
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
useGLTF.preload(RACCOON_URL);
useGLTF.preload(BEAR_URL);
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
void ControllerWire;
void BackgroundGlow;
