"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

import Matte from "@/components/Matte";
const CUB_URL = "/bear/2/cub.glb";

useGLTF.preload(CUB_URL);

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function BoneAwareCub({
  rx,
  ry,
  rz,
  px,
  py,
  pz,
  ox,
  oy,
  oz,
  boneName,
  onBonesFound,
  onBoneStatus,
}: {
  rx: number;
  ry: number;
  rz: number;
  px: number;
  py: number;
  pz: number;
  ox: number;
  oy: number;
  oz: number;
  boneName: string;
  onBonesFound?: (names: string[]) => void;
  onBoneStatus?: (found: boolean, actualName: string | null) => void;
}) {
  const gltf = useGLTF(CUB_URL);
  const scene = useMemo(() => skeletonClone(gltf.scene) as THREE.Object3D, [gltf.scene]);
  const boneRef = useRef<THREE.Bone | null>(null);
  const restPosRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    const names: string[] = [];
    scene.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone) names.push(o.name);
    });
    if (onBonesFound) onBonesFound(names);
  }, [scene, onBonesFound]);

  useEffect(() => {
    boneRef.current = null;
    restPosRef.current = null;
    const target = normalize(boneName);
    scene.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      if (!boneRef.current && normalize(o.name) === target) {
        boneRef.current = b;
        restPosRef.current = b.position.clone();
      }
    });
    if (onBoneStatus) onBoneStatus(!!boneRef.current, boneRef.current?.name ?? null);
  }, [scene, boneName, onBoneStatus]);

  useFrame(() => {
    const b = boneRef.current;
    const rest = restPosRef.current;
    if (!b || !rest) return;

    const worldQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
    const parent = b.parent;
    if (parent) {
      const parentWorldQ = new THREE.Quaternion();
      parent.getWorldQuaternion(parentWorldQ);
      const localQ = parentWorldQ.clone().invert().multiply(worldQ);
      b.quaternion.copy(localQ);
    } else {
      b.quaternion.copy(worldQ);
    }

    const worldDelta = new THREE.Vector3(px, py, pz);
    if (parent) {
      const parentWorldQ = new THREE.Quaternion();
      parent.getWorldQuaternion(parentWorldQ);
      const localDelta = worldDelta.clone().applyQuaternion(parentWorldQ.clone().invert());
      b.position.set(rest.x + localDelta.x, rest.y + localDelta.y, rest.z + localDelta.z);
    } else {
      b.position.set(rest.x + worldDelta.x, rest.y + worldDelta.y, rest.z + worldDelta.z);
    }
  });

  return <primitive object={scene} scale={1.5} position={[ox, oy, oz]} />;
}

function Slider({
  label,
  value,
  setValue,
  min,
  max,
  unit = "deg",
  step = 0.005,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  unit?: "deg" | "m";
  step?: number;
}) {
  const display =
    unit === "deg"
      ? `${((value * 180) / Math.PI).toFixed(1)}°`
      : `${value.toFixed(3)}`;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span>{label}</span>
        <span>{display}</span>
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

export default function CubHeadLab() {
  const [rx, setRx] = useState(0);
  const [ry, setRy] = useState(0);
  const [rz, setRz] = useState(0);
  const [px, setPx] = useState(0);
  const [py, setPy] = useState(0);
  const [pz, setPz] = useState(0);
  const [ox, setOx] = useState(0);
  const [oy, setOy] = useState(0);
  const [oz, setOz] = useState(0);
  const [boneNames, setBoneNames] = useState<string[]>([]);
  const [selectedBone, setSelectedBone] = useState("head.x");
  const [boneFound, setBoneFound] = useState<boolean>(false);
  const [actualName, setActualName] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string>("");
  const hydrated = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    fetch("/api/dev/cub-head-pose")
      .then((r) => r.json())
      .then((d) => {
        if (dirty.current) return; // user already interacted, don't clobber
        if (typeof d.rx === "number") setRx(d.rx);
        if (typeof d.ry === "number") setRy(d.ry);
        if (typeof d.rz === "number") setRz(d.rz);
        if (typeof d.px === "number") setPx(d.px);
        if (typeof d.py === "number") setPy(d.py);
        if (typeof d.pz === "number") setPz(d.pz);
        if (typeof d.ox === "number") setOx(d.ox);
        if (typeof d.oy === "number") setOy(d.oy);
        if (typeof d.oz === "number") setOz(d.oz);
        if (typeof d.bone === "string") setSelectedBone(d.bone);
        hydrated.current = true;
      })
      .catch(() => {});
  }, []);

  const markDirty = <T,>(setter: (v: T) => void) => (v: T) => {
    dirty.current = true;
    setter(v);
  };

  const save = async () => {
    const payload = { bone: selectedBone, rx, ry, rz, px, py, pz, ox, oy, oz };
    console.log("[cub-head] POST", payload);
    setSaveMsg("saving…");
    try {
      const res = await fetch("/api/dev/cub-head-pose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("[cub-head] save failed", res.status, text);
        setSaveMsg(`error ${res.status}: ${text.slice(0, 40)}`);
        return;
      }
      const body = await res.json();
      console.log("[cub-head] save response", body);
      const bakeOk = body?.bake?.ok === true;
      setSaveMsg(
        bakeOk
          ? `saved + baked cub.glb ✓  rx=${((rx * 180) / Math.PI).toFixed(1)}° ry=${((ry * 180) / Math.PI).toFixed(1)}°`
          : `saved JSON but bake failed — check server console`,
      );
      setTimeout(() => setSaveMsg(""), 6000);
    } catch (e) {
      console.error("[cub-head] save exception", e);
      setSaveMsg(`error: ${e}`);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#111",
        color: "#eee",
        fontFamily: "monospace",
      }}
    >
      <div style={{ flex: 1 }}>
        <Canvas camera={{ position: [1.2, 0.6, 1.2], fov: 45 }}>
          <Matte />
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 5, 3]} intensity={1.2} />
          <gridHelper args={[4, 20, "#444", "#222"]} />
          <BoneAwareCub
            rx={rx}
            ry={ry}
            rz={rz}
            px={px}
            py={py}
            pz={pz}
            ox={ox}
            oy={oy}
            oz={oz}
            boneName={selectedBone}
            onBonesFound={setBoneNames}
            onBoneStatus={(f, n) => {
              setBoneFound(f);
              setActualName(n);
            }}
          />
          <OrbitControls target={[0, 0.3, 0]} />
        </Canvas>
      </div>
      <div
        style={{
          width: 340,
          padding: 16,
          borderLeft: "1px solid #333",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Cub Head Lab</h2>
        <div style={{ marginBottom: 12 }}>
          <label>Bone: </label>
          <select
            value={selectedBone}
            onChange={(e) => setSelectedBone(e.target.value)}
            style={{
              background: "#222",
              color: "#eee",
              border: "1px solid #444",
              padding: 4,
              width: "100%",
            }}
          >
            {boneNames.length === 0 && <option>{selectedBone}</option>}
            {boneNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>rotation</div>
        <Slider label="rotX (pitch)" value={rx} setValue={markDirty(setRx)} min={-Math.PI} max={Math.PI} />
        <Slider label="rotY (yaw)" value={ry} setValue={markDirty(setRy)} min={-Math.PI} max={Math.PI} />
        <Slider label="rotZ (roll)" value={rz} setValue={markDirty(setRz)} min={-Math.PI} max={Math.PI} />
        <div style={{ fontSize: 11, opacity: 0.7, margin: "10px 0 4px" }}>
          position offset (world, meters)
        </div>
        <Slider label="posX (left/right)" value={px} setValue={markDirty(setPx)} min={-0.3} max={0.3} unit="m" step={0.001} />
        <Slider label="posY (up/down)" value={py} setValue={markDirty(setPy)} min={-0.3} max={0.3} unit="m" step={0.001} />
        <Slider label="posZ (forward/back)" value={pz} setValue={markDirty(setPz)} min={-0.3} max={0.3} unit="m" step={0.001} />
        <div
          style={{
            fontSize: 11,
            opacity: 0.7,
            margin: "12px 0 4px",
            borderTop: "1px solid #333",
            paddingTop: 10,
          }}
        >
          whole-object translate (world, meters)
        </div>
        <Slider label="objX (left/right)" value={ox} setValue={markDirty(setOx)} min={-2} max={2} unit="m" step={0.01} />
        <Slider label="objY (up/down)" value={oy} setValue={markDirty(setOy)} min={-2} max={2} unit="m" step={0.01} />
        <Slider label="objZ (forward/back)" value={oz} setValue={markDirty(setOz)} min={-2} max={2} unit="m" step={0.01} />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => {
              setRx(0);
              setRy(0);
              setRz(0);
              setPx(0);
              setPy(0);
              setPz(0);
              setOx(0);
              setOy(0);
              setOz(0);
            }}
            style={{
              padding: "6px 10px",
              background: "#333",
              color: "#eee",
              border: "1px solid #555",
              cursor: "pointer",
            }}
          >
            Reset
          </button>
          <button
            onClick={save}
            style={{
              padding: "6px 10px",
              background: "#2a5a2a",
              color: "#eee",
              border: "1px solid #4a8a4a",
              cursor: "pointer",
            }}
          >
            Save
          </button>
          <span style={{ alignSelf: "center", fontSize: 12, opacity: 0.8 }}>{saveMsg}</span>
        </div>
        <div style={{ marginTop: 20, fontSize: 12, opacity: 0.8, lineHeight: 1.6 }}>
          <div style={{ color: boneFound ? "#7c7" : "#d55" }}>
            {boneFound ? `✓ bone found: ${actualName}` : "✗ bone NOT found — pick a bone from dropdown"}
          </div>
          <div>
            Selected: <b>{selectedBone}</b>
          </div>
          <div>
            rx: {((rx * 180) / Math.PI).toFixed(1)}°  ry: {((ry * 180) / Math.PI).toFixed(1)}°  rz: {((rz * 180) / Math.PI).toFixed(1)}°
          </div>
          <div style={{ marginTop: 8 }}>
            px: {px.toFixed(3)}  py: {py.toFixed(3)}  pz: {pz.toFixed(3)}
          </div>
          <div>
            ox: {ox.toFixed(3)}  oy: {oy.toFixed(3)}  oz: {oz.toFixed(3)}
          </div>
        </div>
      </div>
    </div>
  );
}
