"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

import Matte from "@/components/Matte";
const BEAR_URL = "/wildpoly/bear_sit_fixed.glb";
const BANJO_URL = "/bear/1/banjo_clean.glb";
useGLTF.preload(BEAR_URL);
useGLTF.preload(BANJO_URL);

const API_URL = "/api/dev/banjo-bear-pose";

/**
 * Bones we override each frame. We use their REST local rotation as the base and
 * add user-controlled Euler deltas on top, so sliders at 0 mean "leave bone
 * exactly as the sit_log body pose has it".
 */
const ARM_BONES = [
  "shoulder_R", "upperarm_R", "arm_R", "hand_R",
  "shoulder_L", "upperarm_L", "arm_L", "hand_L",
] as const;
type ArmBoneName = (typeof ARM_BONES)[number];

/** Which animation to use as body pose baseline (arms are overridden). */
const BASE_CLIP = "sit_log";

type ArmRot = { x: number; y: number; z: number };

type State = {
  bpx: number; bpy: number; bpz: number;
  brx: number; bry: number; brz: number;
  bsc: number;
  arms: Record<ArmBoneName, ArmRot>;
  paused: boolean;
  frame: number;
  speed: number;
};

const zeroArms: Record<ArmBoneName, ArmRot> = ARM_BONES.reduce((acc, n) => {
  acc[n] = { x: 0, y: 0, z: 0 };
  return acc;
}, {} as Record<ArmBoneName, ArmRot>);

const DEFAULT_STATE: State = {
  bpx: 0.0699, bpy: 0.2702, bpz: 0.1699,
  brx: -0.98,  bry: -1.3978, brz: -2.1395,
  bsc: 0.1892,
  arms: JSON.parse(JSON.stringify(zeroArms)),
  paused: false,
  frame: 30,
  speed: 1.0,
};

function BanjoBear({
  state,
  onDurationKnown,
}: {
  state: State;
  onDurationKnown: (durationSec: number, fps: number, clipNames: string[]) => void;
}) {
  const bearGltf = useGLTF(BEAR_URL) as unknown as { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
  const banjoGltf = useGLTF(BANJO_URL) as unknown as { scene: THREE.Object3D };

  const bearScene = useMemo(() => skeletonClone(bearGltf.scene) as THREE.Object3D, [bearGltf.scene]);
  const banjoScene = useMemo(() => banjoGltf.scene.clone(true) as THREE.Object3D, [banjoGltf.scene]);

  const banjoRef = useRef<THREE.Object3D | null>(null);
  const foodRef = useRef<THREE.Object3D | null>(null);
  const armBonesRef = useRef<Partial<Record<ArmBoneName, THREE.Bone>>>({});
  /** Rest local quaternion per arm bone, captured at mount. */
  const restQuatRef = useRef<Partial<Record<ArmBoneName, THREE.Quaternion>>>({});

  const { actions, mixer } = useAnimations(bearGltf.animations, bearScene);

  useEffect(() => {
    // Locate socket + arm bones, capture rest local quats
    bearScene.traverse((o) => {
      if (o.name === "Food" || o.name === "food") foodRef.current = o;
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      if ((ARM_BONES as readonly string[]).includes(o.name)) {
        const name = o.name as ArmBoneName;
        armBonesRef.current[name] = b;
        restQuatRef.current[name] = b.quaternion.clone();
      }
    });

    // Attach banjo to Food socket
    if (foodRef.current && banjoRef.current == null) {
      foodRef.current.add(banjoScene);
      banjoRef.current = banjoScene;
    }

    // Play the body-pose clip. sit_log gives the natural sit; arms will be
    // overridden per-frame below so anything in the arm curves is ignored.
    const clip = actions[BASE_CLIP];
    if (clip) {
      clip.reset().play();
      clip.setEffectiveTimeScale(state.speed);
    }
    const dur = clip?.getClip().duration ?? 0;
    onDurationKnown(dur, 24, Object.keys(actions));

    return () => {
      if (foodRef.current && banjoRef.current) {
        foodRef.current.remove(banjoRef.current);
        banjoRef.current = null;
      }
      clip?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, bearScene, banjoScene]);

  useFrame((_state, delta) => {
    const clip = actions[BASE_CLIP];
    if (clip) {
      if (state.paused) {
        clip.paused = true;
        clip.time = state.frame / 24;
      } else {
        clip.paused = false;
        clip.setEffectiveTimeScale(state.speed);
      }
    }
    mixer?.update(state.paused ? 0 : delta);

    // Banjo transform (Food-local)
    const banjo = banjoRef.current;
    if (banjo) {
      banjo.position.set(state.bpx, state.bpy, state.bpz);
      banjo.rotation.set(state.brx, state.bry, state.brz);
      banjo.scale.setScalar(state.bsc);
    }

    // Arm bones: hard-override to rest + user Euler. This wipes out whatever the
    // animation just wrote for each bone, so the arms are pure user pose.
    const scratch = new THREE.Quaternion();
    const scratchEul = new THREE.Euler();
    for (const name of ARM_BONES) {
      const b = armBonesRef.current[name];
      const rest = restQuatRef.current[name];
      if (!b || !rest) continue;
      const r = state.arms[name];
      scratchEul.set(r.x, r.y, r.z, "XYZ");
      scratch.setFromEuler(scratchEul);
      b.quaternion.copy(rest).multiply(scratch);
    }
  });

  return <primitive object={bearScene} />;
}

function Slider({
  label,
  value,
  setValue,
  min,
  max,
  step = 0.001,
  fmt,
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
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.9 }}>{display}</span>
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

function ArmGroup({
  title,
  bone,
  rot,
  update,
  reset,
}: {
  title: string;
  bone: ArmBoneName;
  rot: ArmRot;
  update: (bone: ArmBoneName, axis: "x" | "y" | "z", v: number) => void;
  reset: (bone: ArmBoneName) => void;
}) {
  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: "pointer", padding: "3px 0", fontSize: 12, fontWeight: 600 }}>
        {title}  <span style={{ opacity: 0.55, fontWeight: 400 }}>[{bone}]</span>
      </summary>
      <div style={{ paddingLeft: 6 }}>
        <Slider label="rot X" min={-Math.PI} max={Math.PI} step={0.005} value={rot.x} setValue={(v) => update(bone, "x", v)} fmt={deg} />
        <Slider label="rot Y" min={-Math.PI} max={Math.PI} step={0.005} value={rot.y} setValue={(v) => update(bone, "y", v)} fmt={deg} />
        <Slider label="rot Z" min={-Math.PI} max={Math.PI} step={0.005} value={rot.z} setValue={(v) => update(bone, "z", v)} fmt={deg} />
        <button onClick={() => reset(bone)} style={{ ...btnStyle, marginTop: 2, padding: "2px 8px", fontSize: 11 }}>
          reset {bone}
        </button>
      </div>
    </details>
  );
}

export default function BanjoBearLab() {
  const [s, setS] = useState<State>(DEFAULT_STATE);
  const [dur, setDur] = useState<number>(287 / 24);
  const [copied, setCopied] = useState<string>("");
  const [saveMsg, setSaveMsg] = useState<string>("");
  const hydrated = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    fetch(API_URL)
      .then((r) => r.json())
      .then((d: Partial<State>) => {
        if (dirty.current) return;
        setS((prev) => {
          const next: State = { ...prev, arms: { ...prev.arms } };
          for (const [k, v] of Object.entries(d)) {
            if (k === "arms" && v && typeof v === "object") {
              // merge arms per-bone
              const armsIn = v as Partial<Record<ArmBoneName, Partial<ArmRot>>>;
              for (const bn of ARM_BONES) {
                const r = armsIn[bn];
                if (r) {
                  next.arms[bn] = {
                    x: typeof r.x === "number" ? r.x : prev.arms[bn].x,
                    y: typeof r.y === "number" ? r.y : prev.arms[bn].y,
                    z: typeof r.z === "number" ? r.z : prev.arms[bn].z,
                  };
                }
              }
            } else if (k in prev && typeof v === typeof (prev as unknown as Record<string, unknown>)[k]) {
              (next as unknown as Record<string, unknown>)[k] = v as unknown;
            }
          }
          return next;
        });
        hydrated.current = true;
      })
      .catch(() => {});
  }, []);

  const setScalar = <K extends keyof State>(key: K) => (v: State[K]) => {
    dirty.current = true;
    setS((p) => ({ ...p, [key]: v }));
  };

  const updateArm = (bone: ArmBoneName, axis: "x" | "y" | "z", v: number) => {
    dirty.current = true;
    setS((p) => ({
      ...p,
      arms: { ...p.arms, [bone]: { ...p.arms[bone], [axis]: v } },
    }));
  };

  const resetArm = (bone: ArmBoneName) => {
    dirty.current = true;
    setS((p) => ({
      ...p,
      arms: { ...p.arms, [bone]: { x: 0, y: 0, z: 0 } },
    }));
  };

  const save = async () => {
    setSaveMsg("saving…");
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!res.ok) {
        const text = await res.text();
        setSaveMsg(`error ${res.status}: ${text.slice(0, 60)}`);
        return;
      }
      setSaveMsg(`saved → src/config/banjoBearPose.json ✓`);
      setTimeout(() => setSaveMsg(""), 4000);
    } catch (e) {
      setSaveMsg(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const copyBanjo = () => {
    const snippet = `prop: {
  url: BANJO_URL,
  scale: ${s.bsc.toFixed(4)},
  position: [${s.bpx.toFixed(4)}, ${s.bpy.toFixed(4)}, ${s.bpz.toFixed(4)}],
  rotation: [${s.brx.toFixed(4)}, ${s.bry.toFixed(4)}, ${s.brz.toFixed(4)}],
  configKey: "banjoProp",
},`;
    navigator.clipboard.writeText(snippet).then(
      () => { setCopied("copied banjo baseline"); setTimeout(() => setCopied(""), 3000); },
      () => setCopied("copy failed"),
    );
  };

  const copyArms = () => {
    const lines = ARM_BONES.map((n) => {
      const r = s.arms[n];
      return `  ${n}: { x: ${r.x.toFixed(4)}, y: ${r.y.toFixed(4)}, z: ${r.z.toFixed(4)} },`;
    }).join("\n");
    const snippet = `// Arm rotation overrides (local Euler XYZ radians, added to bone rest).
// Apply in a useFrame AFTER mixer.update, on the back-left bear.
const BANJO_ARM_ROTS = {
${lines}
};`;
    navigator.clipboard.writeText(snippet).then(
      () => { setCopied("copied arm rotations"); setTimeout(() => setCopied(""), 3000); },
      () => setCopied("copy failed"),
    );
  };

  const resetBanjo = () => setS((p) => ({
    ...p,
    bpx: DEFAULT_STATE.bpx, bpy: DEFAULT_STATE.bpy, bpz: DEFAULT_STATE.bpz,
    brx: DEFAULT_STATE.brx, bry: DEFAULT_STATE.bry, brz: DEFAULT_STATE.brz,
    bsc: DEFAULT_STATE.bsc,
  }));
  const resetAllArms = () => setS((p) => ({ ...p, arms: JSON.parse(JSON.stringify(zeroArms)) }));
  const resetAll = () => setS(DEFAULT_STATE);

  const totalFrames = Math.max(1, Math.round(dur * 24));

  return (
    <div style={{ display: "flex", height: "100vh", background: "#111", color: "#eee", fontFamily: "monospace" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <Canvas camera={{ position: [1.8, 1.1, 2.0], fov: 40 }}>
          <Matte />
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 3]} intensity={1.2} />
          <directionalLight position={[-2, 3, -2]} intensity={0.4} />
          <gridHelper args={[6, 24, "#333", "#222"]} />
          <BanjoBear state={s} onDurationKnown={(d) => setDur(d)} />
          <OrbitControls target={[0, 0.9, 0]} />
        </Canvas>
        <div style={{ position: "absolute", bottom: 12, left: 12, fontSize: 12, opacity: 0.75, pointerEvents: "none" }}>
          orbit: drag · pan: shift-drag · zoom: wheel
        </div>
      </div>
      <div style={{ width: 400, padding: 14, borderLeft: "1px solid #333", overflowY: "auto" }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Banjo Bear Lab</h2>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 10 }}>
          Body pose is <code>{BASE_CLIP}</code>. All 4 arm bones per side are
          overridden by the sliders below (0° = bone rest rotation, add rotation
          to swing/bend). Save writes JSON to disk. Copy buttons emit code.
        </div>

        <details open>
          <summary style={{ cursor: "pointer", padding: "6px 0", fontWeight: 600 }}>Animation</summary>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <button
              onClick={() => setScalar("paused")(!s.paused)}
              style={{ padding: "4px 10px", background: s.paused ? "#8a5" : "#333", color: "#eee", border: "1px solid #555", cursor: "pointer" }}
            >
              {s.paused ? "▶ play" : "❚❚ pause"}
            </button>
            <span style={{ fontSize: 11 }}>frame {Math.round(s.frame)} / {totalFrames}</span>
          </div>
          <Slider label="frame (when paused)" min={0} max={totalFrames} step={1} value={s.frame} setValue={setScalar("frame")} fmt={(v) => `${Math.round(v)}`} />
          <Slider label="speed" min={0.1} max={2.0} step={0.05} value={s.speed} setValue={setScalar("speed")} fmt={(v) => `${v.toFixed(2)}×`} />
        </details>

        <details open style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", padding: "6px 0", fontWeight: 600 }}>Banjo transform (Food-local)</summary>
          <div style={{ fontSize: 10, opacity: 0.6, margin: "2px 0 4px" }}>position (m)</div>
          <Slider label="pos X" min={-0.6} max={0.6} value={s.bpx} setValue={setScalar("bpx")} />
          <Slider label="pos Y" min={-0.6} max={0.6} value={s.bpy} setValue={setScalar("bpy")} />
          <Slider label="pos Z" min={-0.6} max={0.6} value={s.bpz} setValue={setScalar("bpz")} />
          <div style={{ fontSize: 10, opacity: 0.6, margin: "6px 0 4px" }}>rotation</div>
          <Slider label="rot X" min={-Math.PI} max={Math.PI} step={0.005} value={s.brx} setValue={setScalar("brx")} fmt={deg} />
          <Slider label="rot Y" min={-Math.PI} max={Math.PI} step={0.005} value={s.bry} setValue={setScalar("bry")} fmt={deg} />
          <Slider label="rot Z" min={-Math.PI} max={Math.PI} step={0.005} value={s.brz} setValue={setScalar("brz")} fmt={deg} />
          <div style={{ fontSize: 10, opacity: 0.6, margin: "6px 0 4px" }}>scale</div>
          <Slider label="scale" min={0.02} max={0.5} step={0.001} value={s.bsc} setValue={setScalar("bsc")} />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={resetBanjo} style={btnStyle}>Reset banjo</button>
            <button onClick={copyBanjo} style={btnStyleGreen}>Copy banjo</button>
          </div>
        </details>

        <details open style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", padding: "6px 0", fontWeight: 600 }}>Right arm (strumming)</summary>
          <ArmGroup title="Shoulder R" bone="shoulder_R" rot={s.arms.shoulder_R} update={updateArm} reset={resetArm} />
          <ArmGroup title="Upperarm R (swing from body)" bone="upperarm_R" rot={s.arms.upperarm_R} update={updateArm} reset={resetArm} />
          <ArmGroup title="Elbow R (bend)" bone="arm_R" rot={s.arms.arm_R} update={updateArm} reset={resetArm} />
          <ArmGroup title="Wrist R" bone="hand_R" rot={s.arms.hand_R} update={updateArm} reset={resetArm} />
        </details>

        <details open style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", padding: "6px 0", fontWeight: 600 }}>Left arm (fretting)</summary>
          <ArmGroup title="Shoulder L" bone="shoulder_L" rot={s.arms.shoulder_L} update={updateArm} reset={resetArm} />
          <ArmGroup title="Upperarm L (swing from body)" bone="upperarm_L" rot={s.arms.upperarm_L} update={updateArm} reset={resetArm} />
          <ArmGroup title="Elbow L (bend)" bone="arm_L" rot={s.arms.arm_L} update={updateArm} reset={resetArm} />
          <ArmGroup title="Wrist L" bone="hand_L" rot={s.arms.hand_L} update={updateArm} reset={resetArm} />
        </details>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={resetAllArms} style={btnStyle}>Reset all arms</button>
          <button onClick={copyArms} style={btnStyleGreen}>Copy arm rotations</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button onClick={save} style={btnStyleGreen}>Save to disk</button>
          <button onClick={resetAll} style={btnStyle}>Reset all</button>
          <span style={{ fontSize: 11, opacity: 0.85 }}>{saveMsg}</span>
        </div>
        <div style={{ marginTop: 8, minHeight: 18, fontSize: 12, color: "#7c7" }}>{copied}</div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "#333",
  color: "#eee",
  border: "1px solid #555",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: 12,
};
const btnStyleGreen: React.CSSProperties = {
  ...btnStyle,
  background: "#2a5a2a",
  border: "1px solid #4a8a4a",
};
