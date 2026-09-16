"use client";

// One-stop truck workshop. Loads pickup_truck.glb, applies the same runtime
// additions the arcade scene uses (Tailgate node offsets, three bed-wall
// extension panels), and exposes every knob as a slider on the right rail.
// Sliders write directly to campfireScene.json via /api/dev/scene-config so
// the arcade scene picks up the same values.
// Face-picker (click a face -> flood-fill flat patch -> Queue delete) is still
// here for surgical GLB cuts via Blender MCP.

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import Matte from "@/components/Matte";
const TRUCK_URL = "/vehicles/pickup_truck.glb";
const CONFIG_URL = "/api/dev/scene-config";

// Subset of CampfireSceneConfig this editor cares about. Kept lightly typed so
// the file doesn't have to import the giant campfire config shape.
type TruckConfig = {
  truckTailgateX: number; truckTailgateY: number; truckTailgateZ: number;
  truckTailgateRotX: number; truckTailgateRotY: number; truckTailgateRotZ: number;
  truckTailgateScaleX: number; truckTailgateScaleY: number; truckTailgateScaleZ: number;
  truckBedWallHeight: number; truckBedWallThickness: number;
  truckBedWallColorR: number; truckBedWallColorG: number; truckBedWallColorB: number;
  objectOverrides: Record<string, {
    dx: number; dy: number; dz: number;
    rotX: number; rotY: number; rotZ: number;
    scale: number; hide: number; noShadow: number;
  }>;
};

const DEFAULT_OVERRIDE = { dx: 0, dy: 0, dz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1, hide: 0, noShadow: 0 };

const DEFAULT_CONFIG: TruckConfig = {
  truckTailgateX: 0, truckTailgateY: 0, truckTailgateZ: 0,
  truckTailgateRotX: 0, truckTailgateRotY: 0, truckTailgateRotZ: 0,
  truckTailgateScaleX: 1, truckTailgateScaleY: 1, truckTailgateScaleZ: 1,
  // Start with visible walls so per-panel sliders have something to move.
  // Set to 0 to hide all extensions.
  truckBedWallHeight: 0.35, truckBedWallThickness: 0.04,
  truckBedWallColorR: 0.85, truckBedWallColorG: 0.6, truckBedWallColorB: 0.29,
  objectOverrides: {},
};

const WALL_NAMES = ["truck_bed_wall_left", "truck_bed_wall_right", "truck_bed_wall_front"] as const;
type WallName = (typeof WALL_NAMES)[number];

// -- Face-picker helpers -----------------------------------------------------

type SelectionState = {
  meshUuid: string;
  meshName: string;
  triIndices: Set<number>;
};

type PickResult = { mesh: THREE.Mesh; triIndex: number };

function buildAdjacency(geom: THREE.BufferGeometry): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  const index = geom.getIndex();
  if (!index) return adj;
  const arr = index.array as ArrayLike<number>;
  const triCount = arr.length / 3;
  const edgeToTris = new Map<string, number[]>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < triCount; t++) {
    const a = arr[t * 3];
    const b = arr[t * 3 + 1];
    const c = arr[t * 3 + 2];
    for (const [x, y] of [[a, b], [b, c], [c, a]] as const) {
      const k = edgeKey(x, y);
      let list = edgeToTris.get(k);
      if (!list) { list = []; edgeToTris.set(k, list); }
      list.push(t);
    }
  }
  for (const list of edgeToTris.values()) {
    if (list.length < 2) continue;
    for (const t of list) {
      let neighbours = adj.get(t);
      if (!neighbours) { neighbours = []; adj.set(t, neighbours); }
      for (const u of list) if (u !== t) neighbours.push(u);
    }
  }
  return adj;
}

function triNormal(geom: THREE.BufferGeometry, t: number, out: THREE.Vector3): THREE.Vector3 {
  const index = geom.getIndex()!;
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  const ia = index.getX(t * 3), ib = index.getX(t * 3 + 1), ic = index.getX(t * 3 + 2);
  const a = new THREE.Vector3().fromBufferAttribute(pos, ia);
  const b = new THREE.Vector3().fromBufferAttribute(pos, ib);
  const c = new THREE.Vector3().fromBufferAttribute(pos, ic);
  return out.copy(b.clone().sub(a)).cross(c.clone().sub(a)).normalize();
}

function triCentroidWorld(mesh: THREE.Mesh, t: number, out: THREE.Vector3): THREE.Vector3 {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const index = geom.getIndex()!;
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  const ia = index.getX(t * 3), ib = index.getX(t * 3 + 1), ic = index.getX(t * 3 + 2);
  const a = new THREE.Vector3().fromBufferAttribute(pos, ia);
  const b = new THREE.Vector3().fromBufferAttribute(pos, ib);
  const c = new THREE.Vector3().fromBufferAttribute(pos, ic);
  mesh.updateWorldMatrix(true, false);
  a.applyMatrix4(mesh.matrixWorld);
  b.applyMatrix4(mesh.matrixWorld);
  c.applyMatrix4(mesh.matrixWorld);
  return out.copy(a).add(b).add(c).multiplyScalar(1 / 3);
}

function floodFillPatch(mesh: THREE.Mesh, seedTri: number, normalThresh: number): Set<number> {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const adj = buildAdjacency(geom);
  const seedNormal = triNormal(geom, seedTri, new THREE.Vector3());
  const scratch = new THREE.Vector3();
  const visited = new Set<number>();
  const queue: number[] = [seedTri];
  while (queue.length > 0) {
    const t = queue.pop()!;
    if (visited.has(t)) continue;
    visited.add(t);
    for (const n of adj.get(t) ?? []) {
      if (visited.has(n)) continue;
      const nn = triNormal(geom, n, scratch);
      if (nn.dot(seedNormal) >= normalThresh) queue.push(n);
    }
  }
  return visited;
}

function SelectionOverlay({ mesh, triIndices }: { mesh: THREE.Mesh; triIndices: Set<number> }) {
  const geom = useMemo(() => {
    if (triIndices.size === 0) return null;
    const src = mesh.geometry as THREE.BufferGeometry;
    const srcIndex = src.getIndex()!;
    const overlay = new THREE.BufferGeometry();
    overlay.setAttribute("position", src.getAttribute("position"));
    const idx = new Uint32Array(triIndices.size * 3);
    let i = 0;
    for (const t of triIndices) {
      idx[i++] = srcIndex.getX(t * 3);
      idx[i++] = srcIndex.getX(t * 3 + 1);
      idx[i++] = srcIndex.getX(t * 3 + 2);
    }
    overlay.setIndex(new THREE.BufferAttribute(idx, 1));
    return overlay;
  }, [mesh, triIndices]);
  if (!geom) return null;
  return (
    <mesh geometry={geom} matrix={mesh.matrixWorld} matrixAutoUpdate={false}>
      <meshBasicMaterial color="#ff2f2f" transparent opacity={0.55} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// -- Live truck rendering ----------------------------------------------------

function TruckModel({
  onPick,
  version,
  cfg,
}: {
  onPick: (r: PickResult) => void;
  version: number;
  cfg: TruckConfig;
}) {
  const url = version === 0 ? TRUCK_URL : `${TRUCK_URL}?v=${version}`;
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  // Find the Tailgate node and apply the same live offsets the arcade scene
  // applies via useFrame - here we just apply them once and re-apply on cfg
  // change so the preview matches the site.
  useEffect(() => {
    let tailgate: THREE.Object3D | null = null;
    model.traverse((o) => {
      if (tailgate) return;
      if (o.name === "Tailgate" || o.name === "Tailgate.002") tailgate = o;
    });
    if (!tailgate) return;
    // Reset to zero-offset before applying - we don't know the "base" here,
    // so we treat the GLB's authored transform as the base and offset from it.
    // Grab it once per model load. (Body of this effect is handled by the
    // matching useMemo below; this effect exists purely for the model-swap
    // rebind side effect.)
  }, [model]);

  const tailgateBase = useMemo(() => {
    let tailgate: THREE.Object3D | null = null;
    model.traverse((o) => {
      if (tailgate) return;
      if (o.name === "Tailgate" || o.name === "Tailgate.002") tailgate = o;
    });
    if (!tailgate) return null;
    return {
      pos: (tailgate as THREE.Object3D).position.clone(),
      rot: (tailgate as THREE.Object3D).rotation.clone(),
      scl: (tailgate as THREE.Object3D).scale.clone(),
      node: tailgate as THREE.Object3D,
    };
  }, [model]);

  useEffect(() => {
    if (!tailgateBase) return;
    const { node, pos, rot, scl } = tailgateBase;
    node.position.set(pos.x + cfg.truckTailgateX, pos.y + cfg.truckTailgateY, pos.z + cfg.truckTailgateZ);
    node.rotation.set(rot.x + cfg.truckTailgateRotX, rot.y + cfg.truckTailgateRotY, rot.z + cfg.truckTailgateRotZ);
    node.scale.set(scl.x * cfg.truckTailgateScaleX, scl.y * cfg.truckTailgateScaleY, scl.z * cfg.truckTailgateScaleZ);
  }, [tailgateBase, cfg.truckTailgateX, cfg.truckTailgateY, cfg.truckTailgateZ, cfg.truckTailgateRotX, cfg.truckTailgateRotY, cfg.truckTailgateRotZ, cfg.truckTailgateScaleX, cfg.truckTailgateScaleY, cfg.truckTailgateScaleZ]);

  return (
    <primitive
      object={model}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const obj = e.object;
        const faceIndex = e.faceIndex;
        if (obj instanceof THREE.Mesh && typeof faceIndex === "number") {
          onPick({ mesh: obj, triIndex: faceIndex });
        }
      }}
    />
  );
}

function WallPanel({
  cfg,
  name,
  basePosition,
  size,
  onSelect,
  selectedWall,
}: {
  cfg: TruckConfig;
  name: WallName;
  basePosition: [number, number, number];
  size: [number, number, number];
  onSelect: (n: WallName) => void;
  selectedWall: WallName | null;
}) {
  const o = cfg.objectOverrides[name] ?? DEFAULT_OVERRIDE;
  if ((o.hide ?? 0) >= 0.5) return null;
  const selected = selectedWall === name;
  return (
    <group
      name={name}
      position={[basePosition[0] + o.dx, basePosition[1] + o.dy, basePosition[2] + o.dz]}
      rotation={new THREE.Euler(o.rotX, o.rotY, o.rotZ, "XZY")}
      scale={o.scale}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(name); }}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={new THREE.Color(cfg.truckBedWallColorR, cfg.truckBedWallColorG, cfg.truckBedWallColorB)}
          roughness={0.7}
          metalness={0.05}
          emissive={selected ? new THREE.Color("#ff8f2f") : new THREE.Color("#000000")}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>
    </group>
  );
}

function BedWallExtension({
  cfg,
  onSelect,
  selectedWall,
}: {
  cfg: TruckConfig;
  onSelect: (n: WallName) => void;
  selectedWall: WallName | null;
}) {
  const h = Math.max(0, cfg.truckBedWallHeight);
  const t = Math.max(0.005, cfg.truckBedWallThickness);
  if (h <= 0) return null;
  const innerX = 0.65;
  const yBase = 1.198;
  const zBack = -2.28;
  const zCab = -0.34;
  const bedLen = zCab - zBack;
  const bedCenterZ = (zCab + zBack) / 2;
  const yCenter = yBase + h / 2;
  return (
    <group>
      <WallPanel cfg={cfg} name="truck_bed_wall_left" onSelect={onSelect} selectedWall={selectedWall}
        basePosition={[-innerX, yCenter, bedCenterZ]} size={[t, h, bedLen]} />
      <WallPanel cfg={cfg} name="truck_bed_wall_right" onSelect={onSelect} selectedWall={selectedWall}
        basePosition={[+innerX, yCenter, bedCenterZ]} size={[t, h, bedLen]} />
      <WallPanel cfg={cfg} name="truck_bed_wall_front" onSelect={onSelect} selectedWall={selectedWall}
        basePosition={[0, yCenter, zCab]} size={[innerX * 2, h, t]} />
    </group>
  );
}

function EditorScene({
  cfg,
  selection,
  setSelection,
  normalThresh,
  version,
  selectedWall,
  setSelectedWall,
}: {
  cfg: TruckConfig;
  selection: SelectionState | null;
  setSelection: (s: SelectionState | null) => void;
  normalThresh: number;
  version: number;
  selectedWall: WallName | null;
  setSelectedWall: (n: WallName | null) => void;
}) {
  const handlePick = ({ mesh, triIndex }: PickResult) => {
    const patch = floodFillPatch(mesh, triIndex, normalThresh);
    setSelection({ meshUuid: mesh.uuid, meshName: mesh.name || "(unnamed)", triIndices: patch });
    setSelectedWall(null);
  };
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.1} castShadow />
      <gridHelper args={[10, 10, "#444", "#333"]} />
      <TruckModel key={version} onPick={handlePick} version={version} cfg={cfg} />
      <BedWallExtension cfg={cfg} onSelect={setSelectedWall} selectedWall={selectedWall} />
      {selection && <SelectionMounter selection={selection} />}
      <OrbitControls makeDefault />
    </>
  );
}

function SelectionMounter({ selection }: { selection: SelectionState }) {
  const { scene } = useThree();
  const mesh = useMemo(() => {
    let found: THREE.Mesh | null = null;
    scene.traverse((o) => {
      if (found) return;
      if (o.uuid === selection.meshUuid && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
    });
    return found;
  }, [scene, selection.meshUuid]);
  if (!mesh) return null;
  return <SelectionOverlay mesh={mesh} triIndices={selection.triIndices} />;
}

// -- UI primitives -----------------------------------------------------------

function Slider({
  label, value, min, max, step, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.75 }}>{value.toFixed(3)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open style={{ marginBottom: 10, borderTop: "1px solid #333", paddingTop: 6 }}>
      <summary style={{ cursor: "pointer", padding: "4px 0", fontWeight: 600, fontSize: 11 }}>
        {title}
      </summary>
      <div style={{ padding: "4px 2px" }}>{children}</div>
    </details>
  );
}

// -- Main component ----------------------------------------------------------

export default function TruckEditor() {
  const [cfg, setCfg] = useState<TruckConfig>(DEFAULT_CONFIG);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [selectedWall, setSelectedWall] = useState<WallName | null>(null);
  const [normalThresh, setNormalThresh] = useState(0.98);
  const [status, setStatus] = useState<string>("Loading config...");
  const [version, setVersion] = useState(0);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  // Load campfireScene.json on mount.
  useEffect(() => {
    fetch(CONFIG_URL)
      .then((r) => r.json())
      .then((d: Partial<TruckConfig>) => {
        setCfg((prev) => ({ ...prev, ...d, objectOverrides: { ...prev.objectOverrides, ...(d.objectOverrides ?? {}) } }));
        hydrated.current = true;
        setStatus("Config loaded.");
      })
      .catch(() => { setStatus("Config load failed."); hydrated.current = true; });
  }, []);

  // Debounced save to campfireScene.json. Endpoint expects the body wrapped as
  // { campfire: {...} } and it merges into the on-disk file itself.
  const scheduleSave = useCallback((next: TruckConfig) => {
    if (!hydrated.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        // Merge our fields with the current on-disk config so unrelated keys
        // (fire settings, animals, etc.) aren't dropped by the sanitizer.
        const existing = await fetch(CONFIG_URL).then((r) => r.json()).catch(() => ({}));
        const merged = {
          ...existing,
          ...next,
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
    }, 400);
  }, []);

  const patch = useCallback((p: Partial<TruckConfig>) => {
    setCfg((prev) => {
      const next = { ...prev, ...p, objectOverrides: { ...prev.objectOverrides, ...(p.objectOverrides ?? {}) } };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const patchOverride = useCallback((name: string, o: Partial<typeof DEFAULT_OVERRIDE>) => {
    setCfg((prev) => {
      const existing = prev.objectOverrides[name] ?? DEFAULT_OVERRIDE;
      const next = {
        ...prev,
        objectOverrides: { ...prev.objectOverrides, [name]: { ...existing, ...o } },
      };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const resetOverride = useCallback((name: string) => {
    patchOverride(name, { ...DEFAULT_OVERRIDE });
  }, [patchOverride]);

  // -- Face-picker actions ---------------------------------------------------

  const queueDelete = async () => {
    if (!selection || selection.triIndices.size === 0) { setStatus("Nothing selected."); return; }
    let mesh: THREE.Mesh | null = null;
    sceneRef.current?.traverse((o) => {
      if (mesh) return;
      if (o.uuid === selection.meshUuid && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) { setStatus("Picked mesh not found."); return; }
    const scratch = new THREE.Vector3();
    const worldCentroids: { x: number; y: number; z: number }[] = [];
    for (const t of selection.triIndices) {
      const c = triCentroidWorld(mesh, t, scratch);
      worldCentroids.push({ x: c.x, y: c.y, z: c.z });
    }
    setStatus("Queueing...");
    const res = await fetch("/api/dev/truck-delete-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meshName: selection.meshName, worldCentroids }),
    });
    if (!res.ok) { setStatus(`Queue failed: ${res.status}`); return; }
    const data = (await res.json()) as { queued: number; total: number };
    setStatus(`Queued ${data.queued} face(s) on "${selection.meshName}". Total: ${data.total}. Ask Claude to apply.`);
    setSelection(null);
  };

  const clearQueue = async () => {
    await fetch("/api/dev/truck-delete-queue", { method: "DELETE" });
    setStatus("Delete queue cleared.");
  };

  const reloadGLB = () => {
    setSelection(null);
    setVersion((v) => v + 1);
    setStatus("Reloaded truck GLB.");
  };

  const wallOverride = selectedWall ? (cfg.objectOverrides[selectedWall] ?? DEFAULT_OVERRIDE) : null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#111", color: "#eee", fontFamily: "system-ui" }}>
      {/* 3D canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <Canvas
          camera={{ position: [3, 2.5, 4], fov: 45 }}
          onCreated={({ scene }) => { sceneRef.current = scene; }}
        >
          <Matte />
          <EditorScene
            cfg={cfg}
            selection={selection}
            setSelection={setSelection}
            normalThresh={normalThresh}
            version={version}
            selectedWall={selectedWall}
            setSelectedWall={setSelectedWall}
          />
        </Canvas>
        <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
          <strong style={{ marginRight: 6 }}>Truck Editor</strong>
          <span style={{ opacity: 0.55 }}>|</span>
          <label>
            Face threshold: {normalThresh.toFixed(3)}{" "}
            <input type="range" min={0.5} max={1} step={0.005} value={normalThresh} onChange={(e) => setNormalThresh(Number(e.target.value))} />
          </label>
          <button onClick={() => setSelection(null)} disabled={!selection}>Clear pick</button>
          <button onClick={queueDelete} disabled={!selection || selection.triIndices.size === 0}>
            Queue delete ({selection?.triIndices.size ?? 0})
          </button>
          <button onClick={clearQueue}>Clear queue</button>
          <button onClick={reloadGLB}>Reload GLB</button>
          <span style={{ marginLeft: "auto", opacity: 0.75 }}>{status}</span>
        </div>
        {selectedWall && (
          <div style={{ position: "absolute", bottom: 12, left: 12, fontSize: 11, opacity: 0.75 }}>
            Selected: <strong style={{ color: "#ff8f2f" }}>{selectedWall}</strong> — use the right panel to move / rotate / scale it.
          </div>
        )}
      </div>

      {/* Right control rail */}
      <aside style={{ width: 340, borderLeft: "1px solid #333", overflowY: "auto", padding: 12, fontSize: 11 }}>
        <Section title="Bed wall extension (global)">
          {cfg.truckBedWallHeight <= 0 && (
            <div style={{ padding: 6, background: "#4a2020", border: "1px solid #8a3535", borderRadius: 3, fontSize: 10, marginBottom: 6, lineHeight: 1.4 }}>
              <strong>Walls hidden.</strong> Global height is 0, so all three
              panels render at zero size and per-panel sliders have no visible
              effect. Raise height above 0 to make them appear.
              <button
                onClick={() => patch({ truckBedWallHeight: 0.35 })}
                style={{ marginTop: 6, background: "#8a3535", color: "#fff", border: "1px solid #b04040", padding: "3px 8px", cursor: "pointer", fontSize: 10 }}
              >
                Set height to 0.35
              </button>
            </div>
          )}
          <Slider label="height" min={0} max={1.5} step={0.005} value={cfg.truckBedWallHeight} onChange={(v) => patch({ truckBedWallHeight: v })} />
          <Slider label="thickness" min={0.005} max={0.2} step={0.001} value={cfg.truckBedWallThickness} onChange={(v) => patch({ truckBedWallThickness: v })} />
          <Slider label="color R" min={0} max={1} step={0.005} value={cfg.truckBedWallColorR} onChange={(v) => patch({ truckBedWallColorR: v })} />
          <Slider label="color G" min={0} max={1} step={0.005} value={cfg.truckBedWallColorG} onChange={(v) => patch({ truckBedWallColorG: v })} />
          <Slider label="color B" min={0} max={1} step={0.005} value={cfg.truckBedWallColorB} onChange={(v) => patch({ truckBedWallColorB: v })} />
          <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4 }}>
            Click a panel in the viewport to select it, then use the per-panel section below.
          </div>
        </Section>

        <Section title={`Selected panel: ${selectedWall ?? "(none)"}`}>
          {selectedWall && wallOverride ? (
            <>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                {WALL_NAMES.map((n) => (
                  <button key={n} onClick={() => setSelectedWall(n)} style={{ fontSize: 10, background: selectedWall === n ? "#333" : "#1a1a1a", color: "#eee", border: "1px solid #444", padding: "3px 6px", cursor: "pointer" }}>
                    {n.replace("truck_bed_wall_", "")}
                  </button>
                ))}
              </div>
              <Slider label="dx" min={-1} max={1} step={0.005} value={wallOverride.dx} onChange={(v) => patchOverride(selectedWall, { dx: v })} />
              <Slider label="dy" min={-1} max={1} step={0.005} value={wallOverride.dy} onChange={(v) => patchOverride(selectedWall, { dy: v })} />
              <Slider label="dz" min={-2} max={2} step={0.005} value={wallOverride.dz} onChange={(v) => patchOverride(selectedWall, { dz: v })} />
              <Slider label="rotX" min={-3.14} max={3.14} step={0.005} value={wallOverride.rotX} onChange={(v) => patchOverride(selectedWall, { rotX: v })} />
              <Slider label="rotY" min={-3.14} max={3.14} step={0.005} value={wallOverride.rotY} onChange={(v) => patchOverride(selectedWall, { rotY: v })} />
              <Slider label="rotZ" min={-3.14} max={3.14} step={0.005} value={wallOverride.rotZ} onChange={(v) => patchOverride(selectedWall, { rotZ: v })} />
              <Slider label="scale (uniform)" min={0.1} max={5} step={0.01} value={wallOverride.scale} onChange={(v) => patchOverride(selectedWall, { scale: v })} />
              <label style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                <input type="checkbox" checked={wallOverride.hide >= 0.5} onChange={(e) => patchOverride(selectedWall, { hide: e.target.checked ? 1 : 0 })} />
                <span>hide</span>
              </label>
              <button onClick={() => resetOverride(selectedWall)} style={{ marginTop: 6, background: "#2a2a2a", color: "#eee", border: "1px solid #444", padding: "4px 8px", cursor: "pointer" }}>
                Reset panel
              </button>
            </>
          ) : (
            <div style={{ opacity: 0.55, fontSize: 10 }}>Click a panel in the viewport or pick one:
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {WALL_NAMES.map((n) => (
                  <button key={n} onClick={() => setSelectedWall(n)} style={{ fontSize: 10, background: "#1a1a1a", color: "#eee", border: "1px solid #444", padding: "3px 6px", cursor: "pointer" }}>
                    {n.replace("truck_bed_wall_", "")}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="Tailgate node">
          <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 4 }}>
            Offsets applied on top of the GLB&apos;s Tailgate node transform.
          </div>
          <Slider label="pos X" min={-0.5} max={0.5} step={0.001} value={cfg.truckTailgateX} onChange={(v) => patch({ truckTailgateX: v })} />
          <Slider label="pos Y" min={-0.3} max={0.3} step={0.001} value={cfg.truckTailgateY} onChange={(v) => patch({ truckTailgateY: v })} />
          <Slider label="pos Z" min={-0.5} max={0.5} step={0.001} value={cfg.truckTailgateZ} onChange={(v) => patch({ truckTailgateZ: v })} />
          <Slider label="rot X" min={-3.14} max={3.14} step={0.005} value={cfg.truckTailgateRotX} onChange={(v) => patch({ truckTailgateRotX: v })} />
          <Slider label="rot Y" min={-3.14} max={3.14} step={0.005} value={cfg.truckTailgateRotY} onChange={(v) => patch({ truckTailgateRotY: v })} />
          <Slider label="rot Z" min={-3.14} max={3.14} step={0.005} value={cfg.truckTailgateRotZ} onChange={(v) => patch({ truckTailgateRotZ: v })} />
          <Slider label="scale X (width)" min={0.1} max={2} step={0.005} value={cfg.truckTailgateScaleX} onChange={(v) => patch({ truckTailgateScaleX: v })} />
          <Slider label="scale Y (thick)" min={0.1} max={5} step={0.01} value={cfg.truckTailgateScaleY} onChange={(v) => patch({ truckTailgateScaleY: v })} />
          <Slider label="scale Z (depth)" min={0.1} max={3} step={0.005} value={cfg.truckTailgateScaleZ} onChange={(v) => patch({ truckTailgateScaleZ: v })} />
        </Section>

        <Section title="Face-cut workflow">
          <div style={{ fontSize: 10, opacity: 0.7, lineHeight: 1.4 }}>
            <div>1. Click a face on the truck body. Flood-fill picks the flat patch it belongs to.</div>
            <div style={{ marginTop: 4 }}>2. Adjust <em>Face threshold</em> (top bar) to grow / shrink the patch.</div>
            <div style={{ marginTop: 4 }}>3. Press <em>Queue delete</em> to enqueue those centroids to <code>truck_delete_queue.json</code>.</div>
            <div style={{ marginTop: 4 }}>4. Tell Claude &quot;apply the queue&quot; — Blender MCP cuts the faces and re-exports the GLB.</div>
            <div style={{ marginTop: 4 }}>5. Press <em>Reload GLB</em> to see the result.</div>
          </div>
        </Section>
      </aside>
    </div>
  );
}

useGLTF.preload(TRUCK_URL);
