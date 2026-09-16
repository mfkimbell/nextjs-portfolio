"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

import Matte from "@/components/Matte";
const BEAR_URL = "/wildpoly/bear_sit_fixed.glb";
// The fish-on-stick uses the byte-identical copy so it doesn't share materials
// with the flopping fish in the main scene - hover/highlight logic there would
// otherwise leak into whatever the pose lab is previewing.
const FISH_URL = "/animals/fish_stick.glb";
const BANJO_URL = "/bear/1/banjo_clean.glb";
useGLTF.preload(BEAR_URL);
useGLTF.preload(FISH_URL);
useGLTF.preload(BANJO_URL);

const API_URL = "/api/dev/bear-pose";

// -- Bear catalog ------------------------------------------------------------

type PropSpec = {
  url: string;
  hasStick: boolean;
  defaults: PropAdj;
};

/** Everything the lab tracks per bear, matching the shape the site consumes. */
type BoneAdj = { rx: number; ry: number; rz: number; px: number; py: number; pz: number };
const ZERO_ADJ: BoneAdj = { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 };

type PropAdj = {
  scale: number;
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number;
  stickLength: number;   // 0 = no stick
  stickRadius: number;
  // Stick offset in the socket frame. Applied on top of the built-in
  // "cylinder rotated 90 deg on X so it lies along +Z" pose, so the stick can
  // slide/tilt independently of the fish (or whichever prop is on it).
  stickPx: number; stickPy: number; stickPz: number;
  stickRx: number; stickRy: number; stickRz: number;
  // 1.0 = fish/prop follows the socket bone rotation fully (as sit_log wags
  // the bear's paw the fish spins). 0.0 = socket rotation is frozen at rest
  // and the fish holds steady. Between = linear slerp back toward rest.
  foodRotationScale: number;
  // Same idea for the hand bones themselves - 0 = wrists stop twisting with
  // sit_log, 1 = full sit_log motion. Slerps hand_L / hand_R local quaternion
  // toward their rest pose each frame.
  handRotationScale: number;
};

const FISH_DEFAULT: PropAdj = {
  scale: 0.04,
  // Fish sits near the tip of a 2.0 m stick (runs -1.0 to +1.0 along +Z), with
  // the mouth landing on the tip after the 0.04 scale offset.
  px: 0, py: 0, pz: 0.85,
  rx: -Math.PI / 2, ry: 0, rz: 0,
  stickLength: 2.0,
  stickRadius: 0.02,
  stickPx: 0, stickPy: 0, stickPz: 0,
  stickRx: 0, stickRy: 0, stickRz: 0,
  foodRotationScale: 1.0,
  handRotationScale: 1.0,
};

const BANJO_DEFAULT: PropAdj = {
  scale: 0.1892,
  px: 0.0699, py: 0.2702, pz: 0.1699,
  rx: -0.98, ry: -1.3978, rz: -2.1395,
  stickLength: 0,
  stickRadius: 0,
  stickPx: 0, stickPy: 0, stickPz: 0,
  stickRx: 0, stickRy: 0, stickRz: 0,
  foodRotationScale: 1.0,
  handRotationScale: 1.0,
};

const BEARS = [
  { id: "front_log",       label: "Front log (fish)",       prop: { url: FISH_URL,  hasStick: true,  defaults: FISH_DEFAULT }  },
  { id: "back_left_log",   label: "Back-left log (banjo)",  prop: { url: BANJO_URL, hasStick: false, defaults: BANJO_DEFAULT } },
  { id: "back_right_log",  label: "Back-right log (fish)",  prop: { url: FISH_URL,  hasStick: true,  defaults: FISH_DEFAULT }  },
  { id: "table",           label: "Table (no prop)",        prop: null as PropSpec | null                                     },
] as const;
type BearId = (typeof BEARS)[number]["id"];

type BearPose = {
  animation: string;
  paused: boolean;
  frame: number;
  speed: number;
  bones: Record<string, BoneAdj>;
  prop?: PropAdj;
};
type PoseMap = Partial<Record<BearId, BearPose>>;

function makeDefaultPose(bearId: BearId): BearPose {
  const spec = BEARS.find((b) => b.id === bearId)?.prop ?? null;
  return {
    animation: "sit_log",
    paused: true,
    frame: 30,
    speed: 1.0,
    bones: {},
    prop: spec ? { ...spec.defaults } : undefined,
  };
}

// -- Bone UI grouping --------------------------------------------------------

const GROUPS: { title: string; test: (n: string) => boolean }[] = [
  { title: "Root",         test: (n) => /^(root|center)$/i.test(n) },
  { title: "Torso",        test: (n) => /^(spine|chest|pelvis)$/i.test(n) },
  { title: "Head & face",  test: (n) => /^(head|jaw|mouth|nose|tongue)$/i.test(n) || /^(eye|ear)/i.test(n) },
  { title: "Left arm",     test: (n) => /_L$/i.test(n) && /^(shoulder|upperarm|arm)/i.test(n) },
  { title: "Right arm",    test: (n) => /_R$/i.test(n) && /^(shoulder|upperarm|arm)/i.test(n) },
  // Split out from arms so hand + finger bones are easy to find when the user
  // wants to curl fingers around a rod. Matches both hand_L/hand_R and any
  // finger-level bones (thumb, index, mid, ring, pinky, finger, palm).
  { title: "Left hand",    test: (n) => /_L$/i.test(n) && /^(hand|palm|thumb|index|mid|middle|ring|pinky|little|finger)/i.test(n) },
  { title: "Right hand",   test: (n) => /_R$/i.test(n) && /^(hand|palm|thumb|index|mid|middle|ring|pinky|little|finger)/i.test(n) },
  { title: "Left leg",     test: (n) => /_L$/i.test(n) && /^(thigh|leg|foot|toe)/i.test(n) },
  { title: "Right leg",    test: (n) => /_R$/i.test(n) && /^(thigh|leg|foot|toe)/i.test(n) },
  { title: "Tail",         test: (n) => /^tail/i.test(n) },
  { title: "Prop socket",  test: (n) => /^food$/i.test(n) },
];

// Bones that get pos X/Y/Z sliders open by default. Arm-chain bones are here
// so the user can slide the whole arm outward (shoulder/upperarm translation)
// rather than only rotating around the joint - that's what "extend the arm"
// wants when the sit_log clip has the paws tucked. Any bone not listed can
// still be translated via the "show position sliders" checkbox on the row.
const TRANSLATABLE = /^(root|center|pelvis|chest|spine|shoulder_L|shoulder_R|upperarm_L|upperarm_R|arm_L|arm_R|hand_L|hand_R)$/i;

// -- Bear rig ----------------------------------------------------------------

function BearRig({
  pose,
  propSpec,
  onBones,
  onClipInfo,
}: {
  pose: BearPose;
  propSpec: PropSpec | null;
  onBones: (names: string[]) => void;
  onClipInfo: (info: { duration: number; clipNames: string[]; fps: number }) => void;
}) {
  const gltf = useGLTF(BEAR_URL) as unknown as {
    scene: THREE.Object3D;
    animations: THREE.AnimationClip[];
  };
  const model = useMemo(() => skeletonClone(gltf.scene) as THREE.Object3D, [gltf.scene]);

  const boneRef = useRef<Record<string, THREE.Object3D>>({});
  const restQRef = useRef<Record<string, THREE.Quaternion>>({});
  const restPRef = useRef<Record<string, THREE.Vector3>>({});
  // Socket bone lives in state, not a ref: child effects run before parent
  // effects, so a ref set from this useEffect is still null when BearProp
  // first mounts. State forces a re-render once we find the bone, and
  // BearProp's effect re-runs with the actual socket.
  const [foodBone, setFoodBone] = useState<THREE.Object3D | null>(null);

  const { actions, mixer } = useAnimations(gltf.animations, model);

  useEffect(() => {
    boneRef.current = {};
    restQRef.current = {};
    restPRef.current = {};
    let food: THREE.Object3D | null = null;
    const names: string[] = [];
    model.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      boneRef.current[o.name] = b;
      restQRef.current[o.name] = b.quaternion.clone();
      restPRef.current[o.name] = b.position.clone();
      names.push(o.name);
      if (!food && (o.name === "Food" || o.name === "food")) {
        food = o;
      }
    });
    setFoodBone(food);
    onBones(names);
  }, [model, onBones]);

  useEffect(() => {
    for (const [n, a] of Object.entries(actions)) {
      if (n === pose.animation) a?.reset().play();
      else a?.stop();
    }
    const cur = actions[pose.animation];
    onClipInfo({
      duration: cur?.getClip().duration ?? 0,
      clipNames: Object.keys(actions),
      fps: 24,
    });
  }, [actions, pose.animation, onClipInfo]);

  useFrame((_s, delta) => {
    const clip = actions[pose.animation];
    if (!clip || !mixer) return;

    // Let the mixer drive non-authored bones normally. When paused we call
    // `setTime` to force a re-evaluation each frame (plain `update(0)` on a
    // paused action doesn't re-write bindings).
    if (pose.paused) {
      clip.paused = false;
      mixer.setTime(pose.frame / 24);
      clip.paused = true;
    } else {
      clip.paused = false;
      clip.setEffectiveTimeScale(pose.speed);
      mixer.update(delta);
    }

    // Layer the delta ON TOP of whatever the mixer just wrote for this frame,
    // so sliders at 0 leave the bone exactly where sit_log put it (paused at
    // frame 30 for the fish-holder bears). Doesn't compound frame to frame
    // because the mixer overwrites bone.quaternion each tick before we
    // multiply. Site does the same thing after the bake (see bake_bear_pose.py:
    // multiplies every clip keyframe by dq).
    const eul = new THREE.Euler();
    const dq = new THREE.Quaternion();
    for (const [name, adj] of Object.entries(pose.bones)) {
      const b = boneRef.current[name];
      if (!b) continue;
      eul.set(adj.rx, adj.ry, adj.rz, "XYZ");
      dq.setFromEuler(eul);
      b.quaternion.multiply(dq);
      b.position.x += adj.px;
      b.position.y += adj.py;
      b.position.z += adj.pz;
    }

    // Dampen the Food socket bone's animation-driven rotation. sit_log wags
    // the bear's paw so the fish spins with it - the user can dial this back
    // (0 = fish held rock steady, 1 = full paw swing) via the prop's
    // foodRotationScale slider.
    const foodScale = pose.prop?.foodRotationScale;
    if (foodScale != null && foodScale !== 1) {
      const food = boneRef.current["Food"] ?? boneRef.current["food"];
      const foodRest = restQRef.current["Food"] ?? restQRef.current["food"];
      if (food && foodRest) {
        food.quaternion.slerp(foodRest, 1 - Math.max(0, Math.min(1, foodScale)));
      }
    }

    // Same treatment for the wrist bones. sit_log flicks hand_L / hand_R over
    // the loop; users authoring a still pose can damp that without losing the
    // rest of the bear's motion.
    //
    // The damp target is the AUTHORED wrist pose (rest * delta), NOT raw bind.
    // Slerping to bind made this slider fight the hand_L / hand_R entries in
    // `bones`: the loop above multiplies the delta in, then this pulled
    // (1 - handRotationScale) of it straight back out, so a wrist angle could
    // never hold unless the slider sat exactly at 1. Now the two compose -
    // `bones` sets the angle, this sets how much sit_log wag plays on top.
    const handScale = pose.prop?.handRotationScale;
    if (handScale != null && handScale !== 1) {
      const t = 1 - Math.max(0, Math.min(1, handScale));
      const handTarget = new THREE.Quaternion();
      for (const name of ["hand_L", "hand_R"]) {
        const b = boneRef.current[name];
        const rest = restQRef.current[name];
        if (!b || !rest) continue;
        handTarget.copy(rest);
        const adj = pose.bones[name];
        if (adj) {
          eul.set(adj.rx, adj.ry, adj.rz, "XYZ");
          handTarget.multiply(dq.setFromEuler(eul));
        }
        b.quaternion.slerp(handTarget, t);
      }
    }
  });

  return (
    <>
      <primitive object={model} />
      {propSpec && pose.prop && foodBone && (
        <BearProp
          key={propSpec.url}
          spec={propSpec}
          adj={pose.prop}
          socket={foodBone}
        />
      )}
    </>
  );
}

/** Loads the prop GLB, parents to the Food bone once, then updates its local
 *  transform every frame from the current slider values. Optional stick is
 *  rebuilt on length/radius change (uncommon), positioned per slider values. */
function BearProp({
  spec,
  adj,
  socket,
}: {
  spec: PropSpec;
  adj: PropAdj;
  socket: THREE.Object3D;
}) {
  const gltf = useGLTF(spec.url) as unknown as { scene: THREE.Object3D };
  const propRef = useRef<THREE.Object3D | null>(null);
  const stickRef = useRef<THREE.Mesh | null>(null);
  const adjRef = useRef(adj);
  adjRef.current = adj;

  // Attach + detach.
  useEffect(() => {
    let hasSkinned = false;
    gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasSkinned = true; });
    const obj = (hasSkinned ? skeletonClone(gltf.scene) : gltf.scene.clone(true)) as THREE.Object3D;
    socket.add(obj);
    propRef.current = obj;

    return () => {
      socket.remove(obj);
      propRef.current = null;
    };
  }, [gltf.scene, socket]);

  // Rebuild stick only when length/radius or presence toggles - cheap since it
  // is a single cylinder, but not something to do every frame. Position and
  // rotation are re-applied per frame from the slider values so tweaking the
  // stick doesn't rebuild it.
  useEffect(() => {
    if (!spec.hasStick || adj.stickLength <= 0) return;
    const radius = Math.max(0.001, adj.stickRadius);
    const geo = new THREE.CylinderGeometry(radius, radius, adj.stickLength, 10);
    const mat = new THREE.MeshStandardMaterial({ color: "#6b4423", roughness: 0.9 });
    const stick = new THREE.Mesh(geo, mat);
    socket.add(stick);
    stickRef.current = stick;
    return () => {
      socket.remove(stick);
      geo.dispose();
      mat.dispose();
      stickRef.current = null;
    };
  }, [socket, spec.hasStick, adj.stickLength, adj.stickRadius]);

  useFrame(() => {
    const a = adjRef.current;
    const obj = propRef.current;
    if (obj) {
      obj.position.set(a.px, a.py, a.pz);
      obj.rotation.set(a.rx, a.ry, a.rz);
      obj.scale.setScalar(a.scale);
    }
    const stick = stickRef.current;
    if (stick) {
      // Baseline X=PI/2 rotates the cylinder from +Y (its native axis) to +Z
      // (the socket forward direction). stickR* adds an offset on top so the
      // stick can tilt/spin independently of the fish.
      stick.position.set(a.stickPx, a.stickPy, a.stickPz);
      stick.rotation.set(Math.PI / 2 + a.stickRx, a.stickRy, a.stickRz);
    }
  });

  return null;
}

// -- UI primitives -----------------------------------------------------------

function Slider({
  label, value, setValue, min, max, step = 0.005, fmt,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  fmt?: (v: number) => string;
}) {
  const display = fmt ? fmt(value) : value.toFixed(4);
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.8 }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

const deg = (v: number) => `${((v * 180) / Math.PI).toFixed(1)}°`;

function BoneRow({
  name, adj, translate, update, reset,
}: {
  name: string;
  adj: BoneAdj;
  translate: boolean;
  update: (name: string, patch: Partial<BoneAdj>) => void;
  reset: (name: string) => void;
}) {
  const dirty =
    adj.rx !== 0 || adj.ry !== 0 || adj.rz !== 0 ||
    adj.px !== 0 || adj.py !== 0 || adj.pz !== 0;

  return (
    <details style={{ marginTop: 3 }}>
      <summary style={{ cursor: "pointer", padding: "2px 0", fontSize: 11, fontWeight: 600 }}>
        <span style={{ color: dirty ? "#8f8" : "inherit" }}>{name}</span>
        {dirty && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>edited</span>}
      </summary>
      <div style={{ paddingLeft: 6 }}>
        <Slider label="rot X" min={-Math.PI} max={Math.PI} step={0.005} value={adj.rx} setValue={(v) => update(name, { rx: v })} fmt={deg} />
        <Slider label="rot Y" min={-Math.PI} max={Math.PI} step={0.005} value={adj.ry} setValue={(v) => update(name, { ry: v })} fmt={deg} />
        <Slider label="rot Z" min={-Math.PI} max={Math.PI} step={0.005} value={adj.rz} setValue={(v) => update(name, { rz: v })} fmt={deg} />
        {translate && (
          <>
            <Slider label="pos X" min={-0.5} max={0.5} step={0.001} value={adj.px} setValue={(v) => update(name, { px: v })} />
            <Slider label="pos Y" min={-0.5} max={0.5} step={0.001} value={adj.py} setValue={(v) => update(name, { py: v })} />
            <Slider label="pos Z" min={-0.5} max={0.5} step={0.001} value={adj.pz} setValue={(v) => update(name, { pz: v })} />
          </>
        )}
        <button onClick={() => reset(name)} style={{ ...btnStyle, marginTop: 2, padding: "2px 8px", fontSize: 10 }}>
          reset {name}
        </button>
      </div>
    </details>
  );
}

// -- Main --------------------------------------------------------------------

export default function BearPoseLab() {
  const [bearId, setBearId] = useState<BearId>("front_log");
  const [map, setMap] = useState<PoseMap>({});
  const [boneNames, setBoneNames] = useState<string[]>([]);
  const [clipInfo, setClipInfo] = useState<{ duration: number; clipNames: string[]; fps: number }>({
    duration: 6, clipNames: [], fps: 24,
  });
  const [showTranslate, setShowTranslate] = useState<Record<string, boolean>>({});
  const [saveMsg, setSaveMsg] = useState("");
  const [filter, setFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Torso: true, "Left arm": true, "Right arm": true });
  const hydrated = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    fetch(API_URL)
      .then((r) => r.json())
      .then((d: PoseMap) => {
        if (dirty.current) return;
        setMap(d ?? {});
        hydrated.current = true;
      })
      .catch(() => { hydrated.current = true; });
  }, []);

  const pose: BearPose = useMemo(
    () => map[bearId] ?? makeDefaultPose(bearId),
    [map, bearId],
  );
  const bearMeta = BEARS.find((b) => b.id === bearId)!;
  const propSpec = bearMeta.prop;
  // If the stored pose is missing prop, hydrate defaults for this bear. Also
  // backfill any new fields that were added later (e.g. stickPx/Py/Pz and
  // stickRx/Ry/Rz), which older bearPoses.json entries won't have.
  const activePose: BearPose = useMemo(() => {
    if (!propSpec) return pose;
    if (!pose.prop) return { ...pose, prop: { ...propSpec.defaults } };
    return { ...pose, prop: { ...propSpec.defaults, ...pose.prop } };
  }, [pose, propSpec]);

  const setPose = useCallback((patch: Partial<BearPose>) => {
    dirty.current = true;
    setMap((m) => ({
      ...m,
      [bearId]: { ...(m[bearId] ?? makeDefaultPose(bearId)), ...patch },
    }));
  }, [bearId]);

  const updateBone = useCallback((name: string, patch: Partial<BoneAdj>) => {
    dirty.current = true;
    setMap((m) => {
      const cur = m[bearId] ?? makeDefaultPose(bearId);
      const bone = { ...(cur.bones[name] ?? ZERO_ADJ), ...patch };
      return { ...m, [bearId]: { ...cur, bones: { ...cur.bones, [name]: bone } } };
    });
  }, [bearId]);

  const resetBone = useCallback((name: string) => {
    dirty.current = true;
    setMap((m) => {
      const cur = m[bearId] ?? makeDefaultPose(bearId);
      const bones = { ...cur.bones };
      delete bones[name];
      return { ...m, [bearId]: { ...cur, bones } };
    });
  }, [bearId]);

  const resetAllBones = useCallback(() => {
    dirty.current = true;
    setMap((m) => ({ ...m, [bearId]: { ...(m[bearId] ?? makeDefaultPose(bearId)), bones: {} } }));
  }, [bearId]);

  const updateProp = useCallback((patch: Partial<PropAdj>) => {
    if (!propSpec) return;
    dirty.current = true;
    setMap((m) => {
      const cur = m[bearId] ?? makeDefaultPose(bearId);
      const prop = { ...(cur.prop ?? propSpec.defaults), ...patch };
      return { ...m, [bearId]: { ...cur, prop } };
    });
  }, [bearId, propSpec]);

  const resetProp = useCallback(() => {
    if (!propSpec) return;
    dirty.current = true;
    setMap((m) => ({ ...m, [bearId]: { ...(m[bearId] ?? makeDefaultPose(bearId)), prop: { ...propSpec.defaults } } }));
  }, [bearId, propSpec]);

  const copyBearPose = useCallback((from: BearId) => {
    dirty.current = true;
    setMap((m) => {
      const src = m[from] ?? makeDefaultPose(from);
      const copied: BearPose = { ...src, bones: { ...src.bones }, prop: src.prop ? { ...src.prop } : undefined };
      // If source had no prop but target expects one, seed defaults.
      if (propSpec && !copied.prop) copied.prop = { ...propSpec.defaults };
      // If source had a prop but target should not, drop it.
      if (!propSpec) copied.prop = undefined;
      return { ...m, [bearId]: copied };
    });
  }, [bearId, propSpec]);

  const save = async () => {
    setSaveMsg("saving…");
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(map),
      });
      if (!res.ok) {
        setSaveMsg(`error ${res.status}`);
        return;
      }
      setSaveMsg("saved. baking GLB…");
      // Kick off a Blender bake so the site picks up the new pose. This
      // shells out to Blender in background mode and rewrites the per-bear
      // GLBs at public/wildpoly/bear_sit_<id>.glb. Takes ~5-10s.
      try {
        const bakeRes = await fetch("/api/dev/bake-bear-pose", { method: "POST" });
        if (!bakeRes.ok) {
          const body = await bakeRes.json().catch(() => ({}));
          setSaveMsg(`saved but bake failed: ${body.error ?? bakeRes.status}`);
          return;
        }
        const data = (await bakeRes.json()) as {
          baked?: { bear_id: string; applied: string[]; skipped: string[] }[];
        };
        const count = data.baked?.length ?? 0;
        setSaveMsg(`saved + baked ${count} bear${count === 1 ? "" : "s"} ✓`);
      } catch (e) {
        setSaveMsg(`saved but bake threw: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      setTimeout(() => setSaveMsg(""), 4000);
    } catch (e) {
      setSaveMsg(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const totalFrames = Math.max(1, Math.round(clipInfo.duration * clipInfo.fps));

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filteredNames = q ? boneNames.filter((n) => n.toLowerCase().includes(q)) : boneNames;
    const buckets: Record<string, string[]> = {};
    for (const g of GROUPS) buckets[g.title] = [];
    buckets["Other"] = [];
    for (const n of filteredNames) {
      const g = GROUPS.find((g) => g.test(n));
      buckets[g?.title ?? "Other"].push(n);
    }
    return buckets;
  }, [boneNames, filter]);

  const editedCount = Object.values(activePose.bones).filter(
    (a) => a.rx !== 0 || a.ry !== 0 || a.rz !== 0 || a.px !== 0 || a.py !== 0 || a.pz !== 0,
  ).length;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#111", color: "#eee", fontFamily: "monospace" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <Canvas camera={{ position: [2.2, 1.3, 2.4], fov: 40 }}>
          <Matte />
          {/* Bright and even so it's easy to spot pose issues. Pulled up from
              the previous 0.7/1.2/0.4 which read as evening light. */}
          <ambientLight intensity={1.8} />
          <directionalLight position={[3, 5, 3]} intensity={2.4} />
          <directionalLight position={[-2, 3, -2]} intensity={1.4} />
          <directionalLight position={[0, 3, -5]} intensity={0.8} />
          <gridHelper args={[8, 32, "#333", "#222"]} />
          <BearRig
            key={bearId}
            pose={activePose}
            propSpec={propSpec}
            onBones={setBoneNames}
            onClipInfo={setClipInfo}
          />
          <OrbitControls target={[0, 0.9, 0]} />
        </Canvas>
        <div style={{ position: "absolute", top: 12, left: 12, fontSize: 12, opacity: 0.85, background: "rgba(0,0,0,0.55)", padding: "6px 10px", borderRadius: 6 }}>
          <div><b>{bearMeta.label}</b></div>
          <div style={{ opacity: 0.75, marginTop: 2 }}>
            {editedCount} bone{editedCount === 1 ? "" : "s"} edited · {boneNames.length} total
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 12, left: 12, fontSize: 11, opacity: 0.65, pointerEvents: "none" }}>
          orbit: drag · pan: shift-drag · zoom: wheel
        </div>
      </div>

      <div style={{ width: 420, padding: 12, borderLeft: "1px solid #333", overflowY: "auto" }}>
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>Bear Pose Lab</h2>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
          Per-bear bone deltas AND per-bear prop transforms. Everything saves to
          <code> src/config/bearPoses.json</code>.
        </div>

        {/* Bear picker */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {BEARS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBearId(b.id)}
              style={{
                ...btnStyle,
                background: bearId === b.id ? "#2a5a2a" : "#333",
                borderColor: bearId === b.id ? "#4a8a4a" : "#555",
                fontSize: 11,
                padding: "4px 8px",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        <details style={{ marginBottom: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, opacity: 0.8 }}>Copy pose from another bear…</summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {BEARS.filter((b) => b.id !== bearId).map((b) => (
              <button key={b.id} onClick={() => copyBearPose(b.id)} style={{ ...btnStyle, fontSize: 10, padding: "3px 6px" }}>
                copy ← {b.label}
              </button>
            ))}
          </div>
        </details>

        {/* Animation */}
        <details open>
          <summary style={{ cursor: "pointer", padding: "4px 0", fontWeight: 600 }}>Animation</summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "4px 0" }}>
            {clipInfo.clipNames.map((c) => (
              <button
                key={c}
                onClick={() => setPose({ animation: c })}
                style={{
                  ...btnStyle,
                  fontSize: 10,
                  padding: "2px 6px",
                  background: activePose.animation === c ? "#2a5a2a" : "#333",
                  borderColor: activePose.animation === c ? "#4a8a4a" : "#555",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <button
              onClick={() => setPose({ paused: !activePose.paused })}
              style={{ ...btnStyle, background: activePose.paused ? "#8a5" : "#333", padding: "3px 10px" }}
            >
              {activePose.paused ? "▶ play" : "❚❚ pause"}
            </button>
            <span style={{ fontSize: 11 }}>frame {Math.round(activePose.frame)} / {totalFrames}</span>
          </div>
          <Slider label="frame (when paused)" min={0} max={totalFrames} step={1} value={activePose.frame} setValue={(v) => setPose({ frame: v })} fmt={(v) => `${Math.round(v)}`} />
          <Slider label="speed" min={0.1} max={2.0} step={0.05} value={activePose.speed} setValue={(v) => setPose({ speed: v })} fmt={(v) => `${v.toFixed(2)}×`} />
        </details>

        {/* Prop */}
        {propSpec && activePose.prop && (
          <details open style={{ marginTop: 10, borderTop: "1px solid #2a2a2a", paddingTop: 6 }}>
            <summary style={{ cursor: "pointer", padding: "4px 0", fontWeight: 600 }}>
              Prop ({propSpec.url.split("/").pop()})
            </summary>
            <div style={{ fontSize: 10, opacity: 0.6, margin: "2px 0 4px" }}>
              transform in the Food-socket frame - the bone the sit_log clip keys to the right paw
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2 }}>scale</div>
            <Slider label="scale" min={0.005} max={1.0} step={0.001} value={activePose.prop.scale} setValue={(v) => updateProp({ scale: v })} />
            <div style={{ fontSize: 10, opacity: 0.6, margin: "6px 0 2px" }}>position</div>
            <Slider label="pos X" min={-4} max={4} step={0.001} value={activePose.prop.px} setValue={(v) => updateProp({ px: v })} />
            <Slider label="pos Y" min={-4} max={4} step={0.001} value={activePose.prop.py} setValue={(v) => updateProp({ py: v })} />
            <Slider label="pos Z" min={-4} max={4} step={0.001} value={activePose.prop.pz} setValue={(v) => updateProp({ pz: v })} />
            <div style={{ fontSize: 10, opacity: 0.6, margin: "6px 0 2px" }}>rotation</div>
            <Slider label="rot X" min={-Math.PI} max={Math.PI} step={0.005} value={activePose.prop.rx} setValue={(v) => updateProp({ rx: v })} fmt={deg} />
            <Slider label="rot Y" min={-Math.PI} max={Math.PI} step={0.005} value={activePose.prop.ry} setValue={(v) => updateProp({ ry: v })} fmt={deg} />
            <Slider label="rot Z" min={-Math.PI} max={Math.PI} step={0.005} value={activePose.prop.rz} setValue={(v) => updateProp({ rz: v })} fmt={deg} />
            <div style={{ fontSize: 10, opacity: 0.6, margin: "6px 0 2px" }}>
              how much the bear turns the fish (socket rotation follow)
            </div>
            <Slider
              label="food rot scale (0=held steady, 1=full swing)"
              min={0}
              max={1}
              step={0.01}
              value={activePose.prop.foodRotationScale ?? 1}
              setValue={(v) => updateProp({ foodRotationScale: v })}
            />
            <Slider
              label="hand rot scale (0=wrists locked, 1=full swing)"
              min={0}
              max={1}
              step={0.01}
              value={activePose.prop.handRotationScale ?? 1}
              setValue={(v) => updateProp({ handRotationScale: v })}
            />
            {propSpec.hasStick && (
              <>
                <div style={{ fontSize: 10, opacity: 0.6, margin: "6px 0 2px" }}>roasting stick (0 length = off)</div>
                <Slider label="length" min={0} max={2.5} step={0.01} value={activePose.prop.stickLength} setValue={(v) => updateProp({ stickLength: v })} />
                <Slider label="radius" min={0.005} max={0.1} step={0.001} value={activePose.prop.stickRadius} setValue={(v) => updateProp({ stickRadius: v })} />
                <div style={{ fontSize: 10, opacity: 0.6, margin: "6px 0 2px" }}>stick offset (independent of fish)</div>
                <Slider label="stick pos X" min={-4} max={4} step={0.001} value={activePose.prop.stickPx} setValue={(v) => updateProp({ stickPx: v })} />
                <Slider label="stick pos Y" min={-4} max={4} step={0.001} value={activePose.prop.stickPy} setValue={(v) => updateProp({ stickPy: v })} />
                <Slider label="stick pos Z" min={-4} max={4} step={0.001} value={activePose.prop.stickPz} setValue={(v) => updateProp({ stickPz: v })} />
                <Slider label="stick rot X (+PI/2 baseline)" min={-Math.PI} max={Math.PI} step={0.005} value={activePose.prop.stickRx} setValue={(v) => updateProp({ stickRx: v })} fmt={deg} />
                <Slider label="stick rot Y" min={-Math.PI} max={Math.PI} step={0.005} value={activePose.prop.stickRy} setValue={(v) => updateProp({ stickRy: v })} fmt={deg} />
                <Slider label="stick rot Z" min={-Math.PI} max={Math.PI} step={0.005} value={activePose.prop.stickRz} setValue={(v) => updateProp({ stickRz: v })} fmt={deg} />
              </>
            )}
            <button onClick={resetProp} style={{ ...btnStyle, marginTop: 6 }}>Reset prop</button>
          </details>
        )}

        {/* Bone filter */}
        <div style={{ margin: "10px 0 4px" }}>
          <input
            type="text"
            placeholder="filter bones…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "4px 6px",
              background: "#1a1a1a",
              color: "#eee",
              border: "1px solid #444",
              fontFamily: "monospace",
              fontSize: 11,
              boxSizing: "border-box",
            }}
          />
        </div>

        {Object.entries(grouped).map(([title, names]) => {
          if (names.length === 0) return null;
          const isOpen = openGroups[title] ?? false;
          return (
            <details
              key={title}
              open={isOpen}
              onToggle={(e) => setOpenGroups((g) => ({ ...g, [title]: (e.target as HTMLDetailsElement).open }))}
              style={{ marginTop: 8, borderTop: "1px solid #2a2a2a", paddingTop: 4 }}
            >
              <summary style={{ cursor: "pointer", padding: "3px 0", fontSize: 12, fontWeight: 600 }}>
                {title} <span style={{ opacity: 0.5, fontWeight: 400 }}>({names.length})</span>
              </summary>
              <div style={{ paddingLeft: 4 }}>
                {names.map((name) => {
                  const adj = activePose.bones[name] ?? ZERO_ADJ;
                  const translate = TRANSLATABLE.test(name) || showTranslate[name] === true;
                  return (
                    <div key={name}>
                      <BoneRow
                        name={name}
                        adj={adj}
                        translate={translate}
                        update={updateBone}
                        reset={resetBone}
                      />
                      {!TRANSLATABLE.test(name) && (
                        <label style={{ fontSize: 10, opacity: 0.55, paddingLeft: 6, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={showTranslate[name] === true}
                            onChange={(e) => setShowTranslate((s) => ({ ...s, [name]: e.target.checked }))}
                            style={{ marginRight: 4, verticalAlign: "middle" }}
                          />
                          show position sliders
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}

        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
          <button onClick={save} style={btnStyleGreen}>Save to disk</button>
          <button onClick={resetAllBones} style={btnStyle}>Reset all bones</button>
          <span style={{ fontSize: 11, opacity: 0.85 }}>{saveMsg}</span>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "5px 10px",
  background: "#333",
  color: "#eee",
  border: "1px solid #555",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: 11,
};
const btnStyleGreen: React.CSSProperties = {
  ...btnStyle,
  background: "#2a5a2a",
  border: "1px solid #4a8a4a",
};
