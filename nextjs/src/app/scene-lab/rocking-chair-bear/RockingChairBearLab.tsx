"use client";

// Focused lab for the cabin's rocking-chair bear (scene 3 / cabin study).
// The chair and bear are tied together in the real scene - the bear renders
// as a CHILD of the chair's Selectable group in CabinSector (CampfireScene.tsx)
// so moving the chair moves the bear with it. This page mirrors that exact
// nesting with just the two of them, so you can see the pairing in isolation
// instead of hunting for two small objects inside the full cabin scene.
//
// Sliders write straight to campfireScene.json's objectOverrides, keyed by
// the SAME names ("cabin_rocking_chair" / "bear_rocking_chair") the real
// scene reads - so anything dialled in here shows up on the site and in the
// main Scene Lab's object drawer too. Base position/rotation/scale (the
// numbers these overrides are added on top of) are hardcoded in CampfireScene.tsx
// and duplicated below for the preview; if those ever change there, update
// CHAIR_BASE_POS/BEAR_BASE_POS here to match.

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

import Matte from "@/components/Matte";
import {
  hexToRgb, OLD_BEAR_COLORS, OLD_BEAR_LOOK_DEFAULTS, OLD_BEAR_SLIDERS, oldBearConfigKey, oldBearLookFromConfig,
  rgbToHex, useOldBearLook, type OldBearLook,
} from "@/components/scene-lab/oldBear";
import {
  applyRockingPosture, makePostureState, readRockingPosture,
  ROCKING_POSTURE_DEFAULT, type RockingPosture,
} from "@/components/scene-lab/rockingPosture";
import {
  applyChairRock, applyLegLock, makeLegLock, readRockMotion, rockPosture, rockState,
  ROCK_MOTION_DEFAULT, type LegLock, type RockEnd, type RockHold, type RockMotion,
} from "@/components/scene-lab/rockingChair";

const ROCKING_CHAIR_URL = "/rocking-chair.glb";
// the old grey bear - same model the site's rocking-chair bear uses
const BEAR_URL = "/wildpoly/bear_old_grey.glb";
const BEAR_CLIP = "sit_log";
const CONFIG_URL = "/api/dev/scene-config";
const POSE_API_URL = "/api/dev/rocking-chair-bear-pose";

// Every posable bone in the rig (torso, both arms, both legs, tail) - same
// set + the same "relative layer on top of whatever sit_log's mixer wrote
// this frame" technique CampfireScene.tsx's Animal component uses for
// placement.rockingChairPose - kept in sync by hand, same as
// CHAIR_BASE_POS/BEAR_BASE_POS above. Saving here writes
// src/config/rockingChairBearPose.json, which that code reads directly.
//
// Each bone gets rotation (rx/ry/rz) AND scale (sx/sy/sz). Scale is what
// gives LENGTH control: every child joint in this rig sits at a fixed offset
// along its parent's local +Y (confirmed from the GLB's own bind-pose data),
// so a bone's sy stretches its entire downstream chain - shoulder_L's sy
// lengthens the whole arm, not just the shoulder stub. sx/sz thicken it.
// rx=ry=rz=0, sx=sy=sz=1 is an exact no-op (multiplies onto the animated
// pose, doesn't replace it), so an unopened bone group costs nothing.
type BoneName =
  | "center" | "spine" | "chest" | "pelvis" | "head"
  | "shoulder_L" | "upperarm_L" | "arm_L" | "hand_L" | "fingers_L"
  | "shoulder_R" | "upperarm_R" | "arm_R" | "hand_R" | "fingers_R"
  | "thigh_L" | "leg_L" | "foot_L" | "toe_L"
  | "thigh_R" | "leg_R" | "foot_R" | "toe_R"
  | "tail_01";

const BONE_NAMES: BoneName[] = [
  "center", "spine", "chest", "pelvis", "head",
  "shoulder_L", "upperarm_L", "arm_L", "hand_L", "fingers_L",
  "shoulder_R", "upperarm_R", "arm_R", "hand_R", "fingers_R",
  "thigh_L", "leg_L", "foot_L", "toe_L",
  "thigh_R", "leg_R", "foot_R", "toe_R",
  "tail_01",
];

// Grouped for the right-rail layout only - BONE_NAMES above is what actually
// gets applied/saved.
const BONE_GROUPS: { title: string; bones: BoneName[] }[] = [
  { title: "Torso / head", bones: ["center", "spine", "chest", "pelvis", "head"] },
  { title: "Left arm", bones: ["shoulder_L", "upperarm_L", "arm_L", "hand_L", "fingers_L"] },
  { title: "Right arm", bones: ["shoulder_R", "upperarm_R", "arm_R", "hand_R", "fingers_R"] },
  { title: "Left leg", bones: ["thigh_L", "leg_L", "foot_L", "toe_L"] },
  { title: "Right leg", bones: ["thigh_R", "leg_R", "foot_R", "toe_R"] },
  { title: "Tail", bones: ["tail_01"] },
];

type BonePose = { rx: number; ry: number; rz: number; sx: number; sy: number; sz: number };
const IDENTITY_POSE: BonePose = { rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };

type PoseState = {
  enabled: boolean;
  parts: Record<BoneName, BonePose>;
  /** How he sits - recline / hunch / head, in degrees (rockingPosture.ts). */
  posture: RockingPosture;
  /** How the chair rocks and how his body goes with it (rockingChair.ts). */
  rock: RockMotion;
};

function defaultPose(): PoseState {
  const parts = {} as Record<BoneName, BonePose>;
  for (const b of BONE_NAMES) parts[b] = { ...IDENTITY_POSE };
  return { enabled: true, parts, posture: { ...ROCKING_POSTURE_DEFAULT }, rock: { ...ROCK_MOTION_DEFAULT } };
}

const CHAIR_NAME = "cabin_rocking_chair";
const BEAR_NAME = "bear_rocking_chair";

// Matches Selectable's basePosition/baseRotationY for cabin_rocking_chair.
const CHAIR_BASE_POS: [number, number, number] = [1.6, 1.0, 0.9];
const CHAIR_BASE_ROT_Y = 0;
// Matches ROCKING_CHAIR_BEAR's placement.position/rotationY/scale - a LOCAL
// offset inside the chair's own group, not a world position.
const BEAR_BASE_POS: [number, number, number] = [0, 0.4, 0];
const BEAR_BASE_ROT_Y = 0;
const BEAR_BASE_SCALE = 0.5;

type Override = {
  dx: number; dy: number; dz: number;
  rotX: number; rotY: number; rotZ: number;
  scale: number; hide: number; noShadow: number;
};

const DEFAULT_OVERRIDE: Override = { dx: 0, dy: 0, dz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1, hide: 0, noShadow: 0 };

type LabConfig = {
  objectOverrides: Record<string, Override>;
  /** The old bear's look - coat, beard colour, glasses - saved as the same
   *  oldBear* keys in campfireScene.json the site and the main lab use. */
  look: OldBearLook;
};

const DEFAULT_CONFIG: LabConfig = { objectOverrides: {}, look: { ...OLD_BEAR_LOOK_DEFAULTS } };

function lookToConfig(look: OldBearLook): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(look) as (keyof OldBearLook)[]) out[oldBearConfigKey(k)] = look[k];
  return out;
}

// -- Live models --------------------------------------------------------

function ChairGLB() {
  const gltf = useGLTF(ROCKING_CHAIR_URL) as unknown as { scene: THREE.Object3D };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={model} />;
}

function BearGLB({ pose, hold, look }: { pose: PoseState; hold: RockHold; look: OldBearLook }) {
  const gltf = useGLTF(BEAR_URL) as unknown as { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
  const model = useMemo(() => skeletonClone(gltf.scene) as THREE.Object3D, [gltf.scene]);
  // coat, beard colour, glasses - the saved look, live from this page's sliders
  useOldBearLook(model, look);
  const { actions } = useAnimations(gltf.animations, model);
  const boneRef = useRef<Partial<Record<BoneName, THREE.Bone>>>({});
  const restSRef = useRef<Partial<Record<BoneName, THREE.Vector3>>>({});
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const postureRef = useRef(makePostureState());
  const livePosture = useRef<RockingPosture>({ ...ROCKING_POSTURE_DEFAULT });
  // legs held at one frame of sit_log - no log-bear kick in the rocking chair
  const legLock = useMemo<LegLock>(
    () => makeLegLock(model, gltf.animations.find((c) => c.name === BEAR_CLIP)),
    [model, gltf.animations],
  );

  useEffect(() => {
    const action = actions[BEAR_CLIP];
    action?.reset().play();
    return () => { action?.stop(); };
  }, [actions]);

  useEffect(() => {
    const names = new Set<string>(BONE_NAMES);
    boneRef.current = {};
    restSRef.current = {};
    model.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone && names.has(o.name)) {
        boneRef.current[o.name as BoneName] = b;
        restSRef.current[o.name as BoneName] = b.scale.clone();
      }
    });
  }, [model]);

  // Registered after useAnimations above, so this lands on top of whatever
  // the mixer just wrote for sit_log this tick - same ordering BearPoseLab
  // and CampfireScene.tsx's Animal rely on. RELATIVE layer (quaternion
  // .multiply, scale set against this bone's own rest scale) so rx=ry=rz=0,
  // sx=sy=sz=1 is a true no-op and leaves sit_log's own motion untouched.
  useFrame(({ clock }) => {
    applyLegLock(legLock);
    // posture (swaying with the rock) runs whether or not the per-bone deltas are on
    const { rock } = poseRef.current;
    const body = rockState(clock.elapsedTime, rock, holdRef.current).body;
    const live = rockPosture(poseRef.current.posture, body, rock, livePosture.current);
    if (!poseRef.current.enabled) {
      applyRockingPosture(model, live, postureRef.current);
      return;
    }
    const eu = new THREE.Euler();
    const dq = new THREE.Quaternion();
    for (const name of BONE_NAMES) {
      const b = boneRef.current[name];
      const restS = restSRef.current[name];
      const r = poseRef.current.parts[name];
      if (!b || !restS || !r) continue;
      eu.set(r.rx, r.ry, r.rz, "XYZ");
      dq.setFromEuler(eu);
      b.quaternion.multiply(dq);
      b.scale.set(restS.x * r.sx, restS.y * r.sy, restS.z * r.sz);
    }
    applyRockingPosture(model, live, postureRef.current);
  });

  return <primitive object={model} />;
}

/** Rolls the chair (and the bear in it) on its runners - same as the site's
 *  RockingChairRig in CampfireScene.tsx, same clock, same numbers. */
function RockRig({ rock, hold, children }: { rock: RockMotion; hold: RockHold; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const rockRef = useRef({ rock, hold });
  rockRef.current = { rock, hold };
  useFrame(({ clock }) => {
    const r = rockRef.current;
    if (ref.current) applyChairRock(ref.current, rockState(clock.elapsedTime, r.rock, r.hold).theta);
  });
  return <group ref={ref}>{children}</group>;
}

function RockingChairAssembly({
  chairOverride,
  bearOverride,
  pose,
  hold,
  look,
  onSelectChair,
  onSelectBear,
  selected,
}: {
  chairOverride: Override;
  bearOverride: Override;
  pose: PoseState;
  hold: RockHold;
  look: OldBearLook;
  onSelectChair: () => void;
  onSelectBear: () => void;
  selected: "chair" | "bear" | null;
}) {
  return (
    <group
      name={CHAIR_NAME}
      position={[
        CHAIR_BASE_POS[0] + chairOverride.dx,
        CHAIR_BASE_POS[1] + chairOverride.dy,
        CHAIR_BASE_POS[2] + chairOverride.dz,
      ]}
      rotation={new THREE.Euler(chairOverride.rotX, CHAIR_BASE_ROT_Y + chairOverride.rotY, chairOverride.rotZ, "XZY")}
      scale={chairOverride.scale}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelectChair(); }}
    >
      <RockRig rock={pose.rock} hold={hold}>
      {chairOverride.hide < 0.5 && (
        <group>
          <ChairGLB />
          {selected === "chair" && <SelectionRing radius={1.1} />}
        </group>
      )}
      <group
        name={BEAR_NAME}
        position={[
          BEAR_BASE_POS[0] + bearOverride.dx,
          BEAR_BASE_POS[1] + bearOverride.dy,
          BEAR_BASE_POS[2] + bearOverride.dz,
        ]}
        rotation={new THREE.Euler(bearOverride.rotX, BEAR_BASE_ROT_Y + bearOverride.rotY, bearOverride.rotZ, "XZY")}
        scale={BEAR_BASE_SCALE * bearOverride.scale}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelectBear(); }}
      >
        {bearOverride.hide < 0.5 && (
          <group>
            <BearGLB pose={pose} hold={hold} look={look} />
            {selected === "bear" && <SelectionRing radius={1.4} />}
          </group>
        )}
      </group>
      </RockRig>
    </group>
  );
}

function SelectionRing({ radius }: { radius: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={() => null}>
      <ringGeometry args={[radius * 0.92, radius, 48]} />
      <meshBasicMaterial color="#ff8f2f" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

/**
 * Points the camera at wherever the chair actually is (base + its saved
 * offset - on the site it has been dragged well away from its base spot, so
 * a camera aimed at the base missed it), from its side (to watch the rock)
 * or its front. Re-runs whenever `view.n` ticks.
 */
function FrameChair({ chairOverride, view }: { chairOverride: Override; view: { n: number; side: boolean } }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const o = chairOverride;
  useEffect(() => {
    const c = new THREE.Vector3(CHAIR_BASE_POS[0] + o.dx, CHAIR_BASE_POS[1] + o.dy + 0.4 * o.scale, CHAIR_BASE_POS[2] + o.dz);
    const yaw = CHAIR_BASE_ROT_Y + o.rotY;
    // chair's own +X (its right, the rocking axis) and -Z (the way it faces)
    const dir = view.side
      ? new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
      : new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    camera.position.copy(c).addScaledVector(dir, 3.2 * o.scale).add(new THREE.Vector3(0, 0.5 * o.scale, 0));
    if (controls) { controls.target.copy(c); controls.update(); } else camera.lookAt(c);
    // only on a view request, or the first time real offsets arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.n, controls]);
  return null;
}

function LabScene({
  chairOverride,
  bearOverride,
  pose,
  onSelectChair,
  onSelectBear,
  selected,
  view,
  hold,
  look,
}: {
  chairOverride: Override;
  bearOverride: Override;
  pose: PoseState;
  hold: RockHold;
  look: OldBearLook;
  onSelectChair: () => void;
  onSelectBear: () => void;
  selected: "chair" | "bear" | null;
  view: { n: number; side: boolean };
}) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} castShadow />
      <directionalLight position={[-4, 3, -3]} intensity={0.4} />
      <gridHelper args={[10, 20, "#444", "#333"]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={(e: ThreeEvent<MouseEvent>) => e.stopPropagation()}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#1a1a1a" roughness={1} />
      </mesh>
      <RockingChairAssembly
        chairOverride={chairOverride}
        bearOverride={bearOverride}
        pose={pose}
        hold={hold}
        look={look}
        onSelectChair={onSelectChair}
        onSelectBear={onSelectBear}
        selected={selected}
      />
      <OrbitControls makeDefault target={[CHAIR_BASE_POS[0], CHAIR_BASE_POS[1] + 0.6, CHAIR_BASE_POS[2]]} />
      <FrameChair chairOverride={chairOverride} view={view} />
    </>
  );
}

// -- UI primitives -------------------------------------------------------

function Slider({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.75 }}>{value.toFixed(3)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open style={{ marginBottom: 10, borderTop: "1px solid #333", paddingTop: 6 }}>
      <summary style={{ cursor: "pointer", padding: "4px 0", fontWeight: 600, fontSize: 11 }}>{title}</summary>
      <div style={{ padding: "4px 2px" }}>{children}</div>
    </details>
  );
}

function OverridePanel({
  label, override, onPatch, onReset,
}: {
  label: string; override: Override; onPatch: (o: Partial<Override>) => void; onReset: () => void;
}) {
  return (
    <>
      <Slider label="dx (left/right)" min={-2} max={2} step={0.005} value={override.dx} onChange={(v) => onPatch({ dx: v })} />
      <Slider label="dy (up/down)" min={-2} max={2} step={0.005} value={override.dy} onChange={(v) => onPatch({ dy: v })} />
      <Slider label="dz (fwd/back)" min={-2} max={2} step={0.005} value={override.dz} onChange={(v) => onPatch({ dz: v })} />
      <Slider label="rotX (tilt fwd/back)" min={-3.14} max={3.14} step={0.005} value={override.rotX} onChange={(v) => onPatch({ rotX: v })} />
      <Slider label="rotY (heading)" min={-3.14} max={3.14} step={0.005} value={override.rotY} onChange={(v) => onPatch({ rotY: v })} />
      <Slider label="rotZ (tilt left/right)" min={-3.14} max={3.14} step={0.005} value={override.rotZ} onChange={(v) => onPatch({ rotZ: v })} />
      <Slider label="scale" min={0.1} max={3} step={0.01} value={override.scale} onChange={(v) => onPatch({ scale: v })} />
      <label style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
        <input type="checkbox" checked={override.hide >= 0.5} onChange={(e) => onPatch({ hide: e.target.checked ? 1 : 0 })} />
        <span>hide {label.toLowerCase()}</span>
      </label>
      <button
        onClick={onReset}
        style={{ marginTop: 6, background: "#2a2a2a", color: "#eee", border: "1px solid #444", padding: "4px 8px", cursor: "pointer" }}
      >
        Reset {label.toLowerCase()}
      </button>
    </>
  );
}

// -- Main component --------------------------------------------------------

export default function RockingChairBearLab() {
  const [cfg, setCfg] = useState<LabConfig>(DEFAULT_CONFIG);
  const [pose, setPose] = useState<PoseState>(defaultPose());
  const [selected, setSelected] = useState<"chair" | "bear" | null>("chair");
  const [view, setView] = useState({ n: 0, side: true });
  // preview only, never saved: hold the chair at one end to pose him there
  const [hold, setHold] = useState<RockHold>("rock");
  const [status, setStatus] = useState("Loading config...");
  const [poseStatus, setPoseStatus] = useState("Loading pose...");
  const poseDirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    fetch(CONFIG_URL)
      .then((r) => r.json())
      .then((d: Partial<LabConfig> & Record<string, unknown>) => {
        setCfg((prev) => ({
          ...prev,
          objectOverrides: { ...prev.objectOverrides, ...(d.objectOverrides ?? {}) },
          look: oldBearLookFromConfig(d),
        }));
        hydrated.current = true;
        setView((v) => ({ ...v, n: v.n + 1 }));
        setStatus("Config loaded.");
      })
      .catch(() => { setStatus("Config load failed."); hydrated.current = true; });

    fetch(POSE_API_URL)
      .then((r) => r.json())
      .then((d: Partial<PoseState>) => {
        if (poseDirty.current) return;
        setPose((prev) => {
          const parts = { ...prev.parts };
          if (d.parts) {
            for (const b of BONE_NAMES) {
              const r = (d.parts as Partial<Record<BoneName, Partial<BonePose>>>)[b];
              if (r) {
                parts[b] = {
                  rx: r.rx ?? parts[b].rx, ry: r.ry ?? parts[b].ry, rz: r.rz ?? parts[b].rz,
                  sx: r.sx ?? parts[b].sx, sy: r.sy ?? parts[b].sy, sz: r.sz ?? parts[b].sz,
                };
              }
            }
          }
          return {
            enabled: typeof d.enabled === "boolean" ? d.enabled : prev.enabled,
            parts,
            posture: d.posture ? readRockingPosture(d.posture) : prev.posture,
            rock: readRockMotion((d as { rock?: unknown }).rock),
          };
        });
        setPoseStatus("Pose loaded.");
      })
      .catch(() => setPoseStatus("Pose load failed - using defaults."));
  }, []);

  // Same debounced merge-and-save shape as TruckEditor/BearPoseLab's config
  // save: re-fetch what's on disk right before writing so unrelated fields
  // (fire settings, other objects' overrides, etc.) survive.
  const doSaveConfig = useCallback(async (next: LabConfig) => {
    try {
      const existing = await fetch(CONFIG_URL).then((r) => r.json()).catch(() => ({}));
      const merged = {
        ...existing,
        ...lookToConfig(next.look),
        objectOverrides: { ...(existing.objectOverrides ?? {}), ...next.objectOverrides },
      };
      const res = await fetch(CONFIG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campfire: merged }),
      });
      setStatus(res.ok ? `Saved ${new Date().toLocaleTimeString()}` : `Save failed: ${res.status}`);
    } catch (err) {
      setStatus(`Save error: ${(err as Error).message}`);
    }
  }, []);

  const scheduleSave = useCallback((next: LabConfig) => {
    if (!hydrated.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void doSaveConfig(next); }, 400);
  }, [doSaveConfig]);

  const patchOverride = useCallback((name: string, o: Partial<Override>) => {
    setCfg((prev) => {
      const existing = prev.objectOverrides[name] ?? DEFAULT_OVERRIDE;
      const next = { ...prev, objectOverrides: { ...prev.objectOverrides, [name]: { ...existing, ...o } } };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const patchLook = useCallback((patch: Partial<OldBearLook>) => {
    setCfg((prev) => {
      const next = { ...prev, look: { ...prev.look, ...patch } };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const resetOverride = useCallback((name: string) => {
    patchOverride(name, { ...DEFAULT_OVERRIDE });
  }, [patchOverride]);

  // Position/rotation/scale save right now, no 400ms debounce wait - the
  // explicit button next to the status text.
  const saveNow = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus("Saving...");
    void doSaveConfig(cfg);
  }, [cfg, doSaveConfig]);

  // Pose is LOCAL-only until this runs - same "Save to disk" button pattern
  // as BanjoBearLab/BearPoseLab, not auto-saved on every slider drag, so a
  // pose you're still fighting with never lands on the live site by accident.
  const savePose = useCallback(async () => {
    setPoseStatus("saving...");
    try {
      const res = await fetch(POSE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pose),
      });
      if (!res.ok) {
        const text = await res.text();
        setPoseStatus(`error ${res.status}: ${text.slice(0, 80)}`);
        return;
      }
      setPoseStatus(`saved -> src/config/rockingChairBearPose.json (${new Date().toLocaleTimeString()})`);
    } catch (err) {
      setPoseStatus(`error: ${(err as Error).message}`);
    }
  }, [pose]);

  const patchBone = useCallback((bone: BoneName, field: keyof BonePose, v: number) => {
    poseDirty.current = true;
    setPose((prev) => ({ ...prev, parts: { ...prev.parts, [bone]: { ...prev.parts[bone], [field]: v } } }));
  }, []);

  const resetBone = useCallback((bone: BoneName) => {
    poseDirty.current = true;
    setPose((prev) => ({ ...prev, parts: { ...prev.parts, [bone]: { ...IDENTITY_POSE } } }));
  }, []);

  const resetAllBones = useCallback(() => {
    poseDirty.current = true;
    setPose((prev) => {
      const parts = { ...prev.parts };
      for (const b of BONE_NAMES) parts[b] = { ...IDENTITY_POSE };
      return { ...prev, parts, posture: { ...ROCKING_POSTURE_DEFAULT }, rock: { ...ROCK_MOTION_DEFAULT } };
    });
  }, []);

  const patchPosture = useCallback((field: keyof RockingPosture, v: number) => {
    poseDirty.current = true;
    setPose((prev) => ({ ...prev, posture: { ...prev.posture, [field]: v } }));
  }, []);

  const patchRock = useCallback((patch: Partial<RockMotion>) => {
    poseDirty.current = true;
    setPose((prev) => ({ ...prev, rock: { ...prev.rock, ...patch } }));
  }, []);

  const patchRockEnd = useCallback((end: "front" | "back", field: keyof RockEnd, v: number) => {
    poseDirty.current = true;
    setPose((prev) => ({ ...prev, rock: { ...prev.rock, [end]: { ...prev.rock[end], [field]: v } } }));
  }, []);

  const setPoseEnabled = useCallback((enabled: boolean) => {
    poseDirty.current = true;
    setPose((prev) => ({ ...prev, enabled }));
  }, []);

  const chairOverride = cfg.objectOverrides[CHAIR_NAME] ?? DEFAULT_OVERRIDE;
  const bearOverride = cfg.objectOverrides[BEAR_NAME] ?? DEFAULT_OVERRIDE;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#111", color: "#eee", fontFamily: "system-ui" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <Canvas camera={{ position: [CHAIR_BASE_POS[0] + 3, CHAIR_BASE_POS[1] + 2, CHAIR_BASE_POS[2] + 3.5], fov: 45 }}>
          <Matte />
          <LabScene
            chairOverride={chairOverride}
            bearOverride={bearOverride}
            pose={pose}
            onSelectChair={() => setSelected("chair")}
            onSelectBear={() => setSelected("bear")}
            selected={selected}
            view={view}
            hold={hold}
            look={cfg.look}
          />
        </Canvas>
        <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
          <strong style={{ marginRight: 6 }}>Rocking Chair Bear</strong>
          <span style={{ opacity: 0.55 }}>|</span>
          <button onClick={() => setSelected("chair")} style={{ fontSize: 10, background: selected === "chair" ? "#333" : "#1a1a1a", color: "#eee", border: "1px solid #444", padding: "3px 8px", cursor: "pointer" }}>
            chair
          </button>
          <button onClick={() => setSelected("bear")} style={{ fontSize: 10, background: selected === "bear" ? "#333" : "#1a1a1a", color: "#eee", border: "1px solid #444", padding: "3px 8px", cursor: "pointer" }}>
            bear
          </button>
          <button onClick={() => setView((v) => ({ n: v.n + 1, side: true }))} style={{ fontSize: 10, background: "#1a1a1a", color: "#eee", border: "1px solid #444", padding: "3px 8px", cursor: "pointer" }}>
            side view
          </button>
          <button onClick={() => setView((v) => ({ n: v.n + 1, side: false }))} style={{ fontSize: 10, background: "#1a1a1a", color: "#eee", border: "1px solid #444", padding: "3px 8px", cursor: "pointer" }}>
            front view
          </button>
          <button onClick={saveNow} style={{ fontSize: 10, background: "#2a5a2a", color: "#eee", border: "1px solid #4a8a4a", padding: "3px 8px", cursor: "pointer" }}>
            Save position now
          </button>
          <span style={{ marginLeft: "auto", opacity: 0.75 }}>{status}</span>
        </div>
        <div style={{ position: "absolute", bottom: 12, left: 12, fontSize: 11, opacity: 0.75, maxWidth: 480 }}>
          Click the chair or the bear directly in the viewport, or use the buttons above - the right panel edits whichever is selected. Moving/rotating/scaling the chair moves the bear with it, same as on the site; the bear&apos;s own sliders nudge just his seat on top of that.
        </div>
      </div>

      <aside style={{ width: 340, borderLeft: "1px solid #333", overflowY: "auto", padding: 12, fontSize: 11 }}>
        <Section title={`Chair (${CHAIR_NAME})`}>
          <OverridePanel label="Chair" override={chairOverride} onPatch={(o) => patchOverride(CHAIR_NAME, o)} onReset={() => resetOverride(CHAIR_NAME)} />
        </Section>
        <Section title={`Bear position (${BEAR_NAME})`}>
          <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 4 }}>
            Offsets here are on top of the bear&apos;s LOCAL seat position inside the chair - moving the chair moves this too. Position/rotation/scale save automatically (~0.4s after you stop dragging), or use &quot;Save position now&quot; above.
          </div>
          <OverridePanel label="Bear" override={bearOverride} onPatch={(o) => patchOverride(BEAR_NAME, o)} onReset={() => resetOverride(BEAR_NAME)} />
        </Section>

        <Section title="Bear look (coat, beard, glasses)">
          <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 6, lineHeight: 1.4 }}>
            Shared with the OnlyBears bear and the main Scene Lab&apos;s &quot;Old
            bear&quot; group - same saved settings. Saves automatically (~0.4s
            after you stop dragging). &quot;Recolour&quot; blends from his original
            brown to the coat colour.
          </div>
          {OLD_BEAR_COLORS.map(({ label, keys }) => {
            const hex = rgbToHex(cfg.look[keys[0]], cfg.look[keys[1]], cfg.look[keys[2]]);
            return (
              <label key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, fontSize: 10 }}>
                <span>{label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ opacity: 0.7, fontFamily: "monospace" }}>{hex}</span>
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) => {
                      const [r, g, b] = hexToRgb(e.target.value);
                      patchLook({ [keys[0]]: r, [keys[1]]: g, [keys[2]]: b });
                    }}
                    style={{ width: 40, height: 22, border: "1px solid #444", background: "transparent", cursor: "pointer" }}
                  />
                </span>
              </label>
            );
          })}
          {OLD_BEAR_SLIDERS.map(({ key, label, min, max, step }) => (
            <Slider key={key} label={label} min={min} max={max} step={step} value={cfg.look[key]} onChange={(v) => patchLook({ [key]: v })} />
          ))}
          <button
            onClick={() => patchLook({ ...OLD_BEAR_LOOK_DEFAULTS })}
            style={{ marginTop: 6, background: "#2a2a2a", color: "#eee", border: "1px solid #444", padding: "4px 8px", cursor: "pointer" }}
          >
            Reset look
          </button>
        </Section>

        <Section title="Bear pose (arms + legs)">
          <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 6, lineHeight: 1.4 }}>
            A first attempt at getting his arms onto the armrests and his legs
            hanging instead of the log-sitting pose - authored blind (no way
            to render this and look at it while writing the code), so treat
            every number below as a guess to redo by eye. Deltas are on top of
            the bear&apos;s bind pose and hard-replace whatever sit_log
            animates for these bones, so nothing here fights the loop.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <input type="checkbox" checked={pose.enabled} onChange={(e) => setPoseEnabled(e.target.checked)} />
            <span>enabled (off = plain sit_log, no custom pose)</span>
          </label>
          <details open style={{ marginBottom: 8, borderTop: "1px solid #2a2a2a", paddingTop: 4 }}>
            <summary style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 600, padding: "3px 0" }}>Posture (how he sits)</summary>
            <div style={{ fontSize: 10, opacity: 0.55, margin: "4px 0 6px", lineHeight: 1.4 }}>
              Degrees. Lean tips the whole upper body back into the chair (legs
              stay put); hunch curls his back forward like an old man; the head
              sliders turn his head from its own joint. Applied after the
              per-bone deltas below. Save pose to disk to put it on the site.
            </div>
            <Slider label="lean back (+) / forward (-)" min={-40} max={40} step={0.5} value={pose.posture.recline} onChange={(v) => patchPosture("recline", v)} />
            <Slider label="hunch over" min={-30} max={45} step={0.5} value={pose.posture.hunch} onChange={(v) => patchPosture("hunch", v)} />
            <Slider label="head nod down (+) / up (-)" min={-45} max={45} step={0.5} value={pose.posture.headPitch} onChange={(v) => patchPosture("headPitch", v)} />
            <Slider label="head turn" min={-60} max={60} step={0.5} value={pose.posture.headYaw} onChange={(v) => patchPosture("headYaw", v)} />
            <Slider label="head tilt" min={-35} max={35} step={0.5} value={pose.posture.headRoll} onChange={(v) => patchPosture("headRoll", v)} />
          </details>
          <details open style={{ marginBottom: 8, borderTop: "1px solid #2a2a2a", paddingTop: 4 }}>
            <summary style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 600, padding: "3px 0" }}>Rocking (chair + body)</summary>
            <div style={{ fontSize: 10, opacity: 0.55, margin: "4px 0 6px", lineHeight: 1.4 }}>
              The chair rolls forward and back on its runners with him in it; his
              legs stay planted. The posture above is how he sits in the MIDDLE
              of the swing. Below, set how his body changes at each END - hold
              the chair there with the buttons to see exactly what you are
              posing. Save pose to disk to put it on the site.
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
              <input type="checkbox" checked={pose.rock.enabled} onChange={(e) => patchRock({ enabled: e.target.checked })} />
              <span>rocking</span>
            </label>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {(["rock", "front", "middle", "back"] as RockHold[]).map((h) => (
                <button
                  key={h}
                  onClick={() => setHold(h)}
                  style={{ flex: 1, fontSize: 10, background: hold === h ? "#5a3a1a" : "#1a1a1a", color: "#eee", border: `1px solid ${hold === h ? "#c07a30" : "#444"}`, padding: "3px 4px", cursor: "pointer" }}
                >
                  {h === "rock" ? "rocking" : `hold ${h}`}
                </button>
              ))}
            </div>
            <Slider label="chair tip each way (deg)" min={0} max={20} step={0.5} value={pose.rock.amount} onChange={(v) => patchRock({ amount: v })} />
            <Slider label="seconds per rock" min={1} max={6} step={0.05} value={pose.rock.period} onChange={(v) => patchRock({ period: v })} />
            <Slider label="body leads chair by (deg of phase)" min={-90} max={90} step={1} value={pose.rock.lead} onChange={(v) => patchRock({ lead: v })} />
            {(["front", "back"] as const).map((end) => (
              <div key={end} style={{ marginTop: 8, paddingLeft: 4, borderLeft: `2px solid ${hold === end ? "#c07a30" : "#2a2a2a"}` }}>
                <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.85, marginBottom: 3 }}>
                  {end === "front" ? "Chair tipped FORWARD" : "Chair tipped BACK"}
                  <span style={{ fontWeight: 400, opacity: 0.6 }}> (added to the posture)</span>
                </div>
                <Slider label="lean back (+) / forward (-)" min={-30} max={30} step={0.5} value={pose.rock[end].lean} onChange={(v) => patchRockEnd(end, "lean", v)} />
                <Slider label="hunch more (+) / sit up (-)" min={-30} max={30} step={0.5} value={pose.rock[end].hunch} onChange={(v) => patchRockEnd(end, "hunch", v)} />
                <Slider label="head nod down (+) / up (-)" min={-30} max={30} step={0.5} value={pose.rock[end].head} onChange={(v) => patchRockEnd(end, "head", v)} />
              </div>
            ))}
          </details>
          {BONE_GROUPS.map((group) => (
            <details key={group.title} style={{ marginBottom: 8, borderTop: "1px solid #2a2a2a", paddingTop: 4 }}>
              <summary style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 600, padding: "3px 0" }}>{group.title}</summary>
              {group.bones.map((bone) => (
                <div key={bone} style={{ marginTop: 6, marginBottom: 6, paddingLeft: 4, borderLeft: "2px solid #2a2a2a" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontSize: 10, opacity: 0.8 }}>{bone}</span>
                    <button
                      onClick={() => resetBone(bone)}
                      style={{ fontSize: 9, background: "#1a1a1a", color: "#aaa", border: "1px solid #333", padding: "1px 5px", cursor: "pointer" }}
                    >
                      reset
                    </button>
                  </div>
                  <Slider label="rotate x" min={-3.14} max={3.14} step={0.01} value={pose.parts[bone].rx} onChange={(v) => patchBone(bone, "rx", v)} />
                  <Slider label="rotate y" min={-3.14} max={3.14} step={0.01} value={pose.parts[bone].ry} onChange={(v) => patchBone(bone, "ry", v)} />
                  <Slider label="rotate z" min={-3.14} max={3.14} step={0.01} value={pose.parts[bone].rz} onChange={(v) => patchBone(bone, "rz", v)} />
                  <Slider label="length (scale y)" min={0.1} max={3} step={0.01} value={pose.parts[bone].sy} onChange={(v) => patchBone(bone, "sy", v)} />
                  <Slider label="thickness (scale x)" min={0.1} max={3} step={0.01} value={pose.parts[bone].sx} onChange={(v) => patchBone(bone, "sx", v)} />
                  <Slider label="thickness (scale z)" min={0.1} max={3} step={0.01} value={pose.parts[bone].sz} onChange={(v) => patchBone(bone, "sz", v)} />
                </div>
              ))}
            </details>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={savePose} style={{ flex: 1, background: "#2a5a2a", color: "#eee", border: "1px solid #4a8a4a", padding: "6px 8px", cursor: "pointer", fontWeight: 600 }}>
              Save pose to disk
            </button>
            <button onClick={resetAllBones} style={{ background: "#2a2a2a", color: "#eee", border: "1px solid #444", padding: "6px 8px", cursor: "pointer" }}>
              Reset all
            </button>
          </div>
          <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75 }}>{poseStatus}</div>
        </Section>
      </aside>
    </div>
  );
}

useGLTF.preload(ROCKING_CHAIR_URL);
useGLTF.preload(BEAR_URL);
