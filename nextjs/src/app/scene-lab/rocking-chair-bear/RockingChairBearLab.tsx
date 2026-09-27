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

import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

import Matte from "@/components/Matte";

const ROCKING_CHAIR_URL = "/rocking-chair.glb";
const BEAR_URL = "/wildpoly/bear_sit_fixed.glb";
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
};

function defaultPose(): PoseState {
  const parts = {} as Record<BoneName, BonePose>;
  for (const b of BONE_NAMES) parts[b] = { ...IDENTITY_POSE };
  return { enabled: true, parts };
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
};

const DEFAULT_CONFIG: LabConfig = { objectOverrides: {} };

// -- Live models --------------------------------------------------------

function ChairGLB() {
  const gltf = useGLTF(ROCKING_CHAIR_URL) as unknown as { scene: THREE.Object3D };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={model} />;
}

function BearGLB({ pose }: { pose: PoseState }) {
  const gltf = useGLTF(BEAR_URL) as unknown as { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
  const model = useMemo(() => skeletonClone(gltf.scene) as THREE.Object3D, [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, model);
  const boneRef = useRef<Partial<Record<BoneName, THREE.Bone>>>({});
  const restSRef = useRef<Partial<Record<BoneName, THREE.Vector3>>>({});
  const poseRef = useRef(pose);
  poseRef.current = pose;

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
  useFrame(() => {
    if (!poseRef.current.enabled) return;
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
  });

  return <primitive object={model} />;
}

function RockingChairAssembly({
  chairOverride,
  bearOverride,
  pose,
  onSelectChair,
  onSelectBear,
  selected,
}: {
  chairOverride: Override;
  bearOverride: Override;
  pose: PoseState;
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
            <BearGLB pose={pose} />
            {selected === "bear" && <SelectionRing radius={1.4} />}
          </group>
        )}
      </group>
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

function LabScene({
  chairOverride,
  bearOverride,
  pose,
  onSelectChair,
  onSelectBear,
  selected,
}: {
  chairOverride: Override;
  bearOverride: Override;
  pose: PoseState;
  onSelectChair: () => void;
  onSelectBear: () => void;
  selected: "chair" | "bear" | null;
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
        onSelectChair={onSelectChair}
        onSelectBear={onSelectBear}
        selected={selected}
      />
      <OrbitControls makeDefault target={[CHAIR_BASE_POS[0], CHAIR_BASE_POS[1] + 0.6, CHAIR_BASE_POS[2]]} />
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
  const [status, setStatus] = useState("Loading config...");
  const [poseStatus, setPoseStatus] = useState("Loading pose...");
  const poseDirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    fetch(CONFIG_URL)
      .then((r) => r.json())
      .then((d: Partial<LabConfig>) => {
        setCfg((prev) => ({ ...prev, objectOverrides: { ...prev.objectOverrides, ...(d.objectOverrides ?? {}) } }));
        hydrated.current = true;
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
          return { enabled: typeof d.enabled === "boolean" ? d.enabled : prev.enabled, parts };
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
      return { ...prev, parts };
    });
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
                  <Slider label="x" min={-3.14} max={3.14} step={0.01} value={pose.parts[bone].x} onChange={(v) => patchBone(bone, "x", v)} />
                  <Slider label="y" min={-3.14} max={3.14} step={0.01} value={pose.parts[bone].y} onChange={(v) => patchBone(bone, "y", v)} />
                  <Slider label="z" min={-3.14} max={3.14} step={0.01} value={pose.parts[bone].z} onChange={(v) => patchBone(bone, "z", v)} />
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
