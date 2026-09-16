"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import IntroFlight from "@/components/scene-lab/IntroFlight";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { OceanFloorSceneConfig } from "@/components/scene-lab/sceneConfig";

import Matte from "@/components/Matte";
// The untouched pack file, not bear_sit_fixed.glb. No added clip, no prop.
const BEAR_URL = "/wildpoly/bear.glb";

const seededRandom = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
};

function CameraRig({ config, paused = false }: { config: OceanFloorSceneConfig; paused?: boolean }) {
  const { camera } = useThree();

  useFrame(() => {
    // While IntroFlight is flying it owns the camera; this rig lerps every frame and
    // would drag it straight back to the resting shot.
    if (paused) return;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, config.cameraX, 0.12);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, config.cameraY, 0.12);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, config.cameraZ, 0.12);

    if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - config.fov) > 0.01) {
      camera.fov = config.fov;
      camera.updateProjectionMatrix();
    }

    camera.lookAt(config.targetX, config.targetY, config.targetZ);
  });

  return null;
}

function OceanFloorGround() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(18, 18, 42, 42);
    const positions = geo.attributes.position as THREE.BufferAttribute;

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getY(index);
      const dune = Math.sin(x * 0.85 + z * 0.35) * 0.12 + Math.cos(z * 0.75 - x * 0.25) * 0.08;
      const trench = -Math.exp(-((x + 2.1) ** 2 * 0.18 + (z - 0.3) ** 2 * 0.08)) * 0.26;
      const frontRise = Math.max(0, z - 4.8) * 0.08;
      const rearFadeDrop = Math.max(0, -z - 5.5) * -0.13;

      positions.setZ(index, dune + trench + frontRise + rearFadeDrop - 0.16);
    }

    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color="#1a4350" roughness={1} metalness={0} flatShading />
    </mesh>
  );
}

interface RockProps {
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
}

function SeaRock({ position, scale, rotation = [0, 0, 0], color = "#203746" }: RockProps) {
  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} roughness={0.95} metalness={0} flatShading />
    </mesh>
  );
}

const ROCKS: RockProps[] = [
  { position: [-1.85, 0.06, 2.05], scale: [1.05, 0.34, 0.62], rotation: [0.12, 0.4, -0.18], color: "#1a2d3b" },
  { position: [1.75, 0.07, 1.95], scale: [0.98, 0.32, 0.62], rotation: [-0.2, -0.5, 0.16], color: "#2a4658" },
  { position: [-0.95, 0.04, 0.75], scale: [0.62, 0.22, 0.48], rotation: [0.1, 0.2, 0.45], color: "#1c3441" },
  { position: [1.25, 0.05, 0.95], scale: [0.76, 0.24, 0.5], rotation: [0.25, -0.9, -0.12], color: "#20313e" },
  { position: [0.15, 0.05, 2.45], scale: [0.72, 0.22, 0.46], rotation: [-0.1, 0.75, 0.2], color: "#34576a" },
];

interface OceanBeamProps {
  position: [number, number, number];
  rotation: [number, number, number];
  radius: number;
  height: number;
  opacity: number;
  phase: number;
}

function OceanBeam({ position, rotation, radius, height, opacity, phase }: OceanBeamProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const time = clock.elapsedTime;
    meshRef.current.rotation.x = rotation[0] + Math.sin(time * 0.35 + phase) * 0.035;
    meshRef.current.rotation.z = rotation[2] + Math.sin(time * 0.42 + phase) * 0.04;

    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = opacity * (0.78 + Math.sin(time * 0.75 + phase) * 0.16);
  });

  return (
    <mesh ref={meshRef} position={position} rotation={rotation} renderOrder={1}>
      <coneGeometry args={[radius, height, 36, 1, true]} />
      <meshBasicMaterial
        color="#8deeff"
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function UnderwaterLights({ config }: { config: OceanFloorSceneConfig }) {
  const mainTarget = useRef<THREE.Object3D>(null);
  const leftTarget = useRef<THREE.Object3D>(null);
  const mainLight = useRef<THREE.SpotLight>(null);
  const leftLight = useRef<THREE.SpotLight>(null);

  useEffect(() => {
    if (mainLight.current && mainTarget.current) mainLight.current.target = mainTarget.current;
    if (leftLight.current && leftTarget.current) leftLight.current.target = leftTarget.current;
  }, []);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const pulse = 1 + Math.sin(time * 0.65) * 0.08 + Math.sin(time * 1.13) * 0.035;

    if (mainLight.current) mainLight.current.intensity = 5.2 * config.beamIntensity * pulse;
    if (leftLight.current) leftLight.current.intensity = 2.6 * config.beamIntensity * (0.9 + Math.sin(time * 0.55 + 2) * 0.08);
  });

  return (
    <>
      <ambientLight intensity={config.ambientIntensity} color="#0a2932" />
      <object3D ref={mainTarget} position={[config.beamTargetX, config.beamTargetY, config.beamTargetZ]} />
      <object3D ref={leftTarget} position={[config.beamTargetX + config.sideLightX * 0.45, config.beamTargetY, config.beamTargetZ - 0.05]} />
      <spotLight
        ref={mainLight}
        position={[config.mainLightX, config.mainLightY, config.mainLightZ]}
        color="#9bf4ff"
        intensity={5.2 * config.beamIntensity}
        distance={config.mainLightReach}
        angle={config.mainLightAngle}
        penumbra={0.95}
        castShadow
        shadow-bias={-0.0006}
      />
      <spotLight
        ref={leftLight}
        position={[config.sideLightX, config.sideLightY, config.sideLightZ]}
        color="#76d9ff"
        intensity={2.6 * config.beamIntensity}
        distance={config.sideLightReach}
        angle={config.sideLightAngle}
        penumbra={1}
      />
    </>
  );
}

function LightPool({ position, scale, opacity, phase }: { position: [number, number, number]; scale: [number, number, number]; opacity: number; phase: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = opacity * (0.82 + Math.sin(clock.elapsedTime * 0.85 + phase) * 0.14);
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]} scale={scale} renderOrder={2}>
      <circleGeometry args={[1, 48]} />
      <meshBasicMaterial color="#82f2ff" transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

function SuspendedParticles({ opacity }: { opacity: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(41);
    const values = new Float32Array(210 * 3);

    for (let index = 0; index < 210; index += 1) {
      values[index * 3] = (random() - 0.5) * 12;
      values[index * 3 + 1] = 0.3 + random() * 4.8;
      values[index * 3 + 2] = -5.5 + random() * 9.5;
    }

    return values;
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    pointsRef.current.position.x = Math.sin(clock.elapsedTime * 0.22) * 0.16;
    pointsRef.current.position.y = Math.sin(clock.elapsedTime * 0.17) * 0.08;
    pointsRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.08;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#b8fbff" size={0.026} transparent opacity={opacity} depthWrite={false} />
    </points>
  );
}

function SeaweedBlade({ position, height, phase, rotation }: { position: [number, number, number]; height: number; phase: number; rotation: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.9 + phase) * 0.09;
  });

  return (
    <mesh ref={meshRef} position={[position[0], position[1] + height / 2, position[2]]} rotation={[0, rotation, 0]} castShadow>
      <planeGeometry args={[0.09, height, 1, 4]} />
      <meshStandardMaterial color="#123b33" roughness={0.8} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SeaweedClump({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <SeaweedBlade position={[-0.12, 0, 0]} height={0.72} phase={0.2} rotation={0.1} />
      <SeaweedBlade position={[0, 0, 0.04]} height={0.94} phase={1.4} rotation={0.4} />
      <SeaweedBlade position={[0.13, 0, -0.03]} height={0.62} phase={2.1} rotation={-0.25} />
      <SeaweedBlade position={[0.23, 0, 0.05]} height={0.78} phase={2.9} rotation={0.65} />
    </group>
  );
}

function CoralCluster({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const branches = [
    { x: 0, z: 0, h: 0.55, r: 0.04, rot: 0 },
    { x: 0.12, z: 0.02, h: 0.42, r: 0.032, rot: 0.45 },
    { x: -0.1, z: -0.03, h: 0.36, r: 0.03, rot: -0.55 },
  ];

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {branches.map((branch, index) => (
        <mesh key={index} position={[branch.x, branch.h / 2, branch.z]} rotation={[0.18, branch.rot, 0.12]} castShadow>
          <cylinderGeometry args={[branch.r * 0.72, branch.r, branch.h, 6]} />
          <meshStandardMaterial color={index === 0 ? "#2c4c55" : "#224653"} roughness={0.86} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function CausticLines({ opacity }: { opacity: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const lines = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        x: -5.5 + (index % 8) * 1.45,
        z: -2.8 + Math.floor(index / 8) * 2.7,
        length: 0.75 + (index % 3) * 0.38,
        angle: -0.35 + (index % 5) * 0.16,
        opacity: 0.06 + (index % 4) * 0.015,
      })),
    [],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.x = Math.sin(clock.elapsedTime * 0.32) * 0.18;
    groupRef.current.position.z = Math.cos(clock.elapsedTime * 0.26) * 0.12;
  });

  return (
    <group ref={groupRef} position={[0, 0.035, 0.75]} rotation={[-Math.PI / 2, 0, 0]}>
      {lines.map((line, index) => (
        <mesh key={index} position={[line.x, line.z, 0]} rotation={[0, 0, line.angle]} renderOrder={2}>
          <planeGeometry args={[line.length, 0.035]} />
          <meshBasicMaterial
            color="#7eefff"
            transparent
            opacity={line.opacity * opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function OceanBackdrop() {
  return (
    <>
      <mesh position={[0, 4.2, -9.5]} scale={[18, 7, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00364a" transparent opacity={0.42} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.1, -7.6]} scale={[16, 3.2, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#000b12" transparent opacity={0.72} depthWrite={false} />
      </mesh>
    </>
  );
}

/**
 * The stock bear, dropped in to be looked at. Plays its own shipped `idle` clip and
 * turns slowly, because CameraRig re-aims the camera every frame so OrbitControls
 * would just fight it.
 */
function DefaultBear({
  position = [0, 0.02, 1.35],
  scale = 0.55,
  spin = 0.22,
  clip = "idle",
}: {
  position?: [number, number, number];
  scale?: number;
  spin?: number;
  clip?: string;
}) {
  const gltf = useGLTF(BEAR_URL) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] };
  const group = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(gltf.animations || [], group);

  useEffect(() => {
    if (!actions) return;
    const key = actions[clip] ? clip : names.find((n) => n.toLowerCase().includes(clip.toLowerCase())) ?? names[0];
    const action = key ? actions[key] : null;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => { action.fadeOut(0.2); };
  }, [actions, names, clip]);

  useEffect(() => {
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // The pack exports this material as alphaMode BLEND over a texture with a junk
      // alpha channel, so out of the box it renders see-through and stops occluding
      // itself. Nothing else here is altered.
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
        if (m.transparent) { m.transparent = false; m.needsUpdate = true; }
        if (!m.depthWrite) { m.depthWrite = true; m.needsUpdate = true; }
        // The pack's texture holds LINEAR values but the glTF tags it sRGB, so three
        // decodes it a second time and the bear comes out dark red-brown instead of
        // tan. Measured against the vendor render: as-sRGB gives an R:G:B ratio of
        // 1:0.35:0.21, as-linear gives 1:0.60:0.47, and the reference is 1:0.69:0.58.
        const map = (m as THREE.MeshStandardMaterial).map;
        if (map && map.colorSpace !== THREE.LinearSRGBColorSpace) {
          map.colorSpace = THREE.LinearSRGBColorSpace;
          map.needsUpdate = true;
          m.needsUpdate = true;
        }
      });
    });
  }, [gltf.scene]);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * spin;
  });

  return (
    <group ref={group} position={position} scale={scale}>
      <primitive object={gltf.scene} />
    </group>
  );
}

function OceanFloorWorld({
  config,
  flying,
  onIntroDone,
}: {
  config: OceanFloorSceneConfig;
  flying: boolean;
  onIntroDone: () => void;
}) {
  return (
    <>
      <color attach="background" args={["#001018"]} />
      <fog attach="fog" args={["#001018", config.fogNear, config.fogFar]} />
      <CameraRig config={config} paused={flying} />
      {flying ? (
        <IntroFlight
          to={[config.cameraX, config.cameraY, config.cameraZ]}
          target={[config.targetX, config.targetY, config.targetZ]}
          duration={3.4}
          distanceMultiplier={3.0}
          skyHeight={7}
          fovBoost={14}
          fogSquash={0.5}
          onDone={onIntroDone}
        />
      ) : null}
      <UnderwaterLights config={config} />
      <OceanBackdrop />

      <OceanBeam
        position={[config.mainLightX * 0.45, Math.max(0.75, config.mainLightY - 1.55), config.mainLightZ - 1.37]}
        rotation={[0.08, 0.05, -0.1]}
        radius={2.7 * config.mainLightAngle * config.beamWidth}
        height={3.45 * config.beamLength}
        opacity={0.24 * config.beamOpacity}
        phase={0.2}
      />
      <OceanBeam
        position={[config.sideLightX * 0.62, Math.max(0.75, config.sideLightY - 1.43), config.sideLightZ - 1.28]}
        rotation={[0.1, 0.1, 0.22]}
        radius={2.25 * config.sideLightAngle * config.beamWidth}
        height={3.15 * config.beamLength}
        opacity={0.15 * config.beamOpacity}
        phase={1.6}
      />
      <OceanBeam
        position={[Math.abs(config.sideLightX) * 0.72, Math.max(0.65, config.sideLightY - 1.57), config.sideLightZ - 1.78]}
        rotation={[0.08, -0.08, -0.24]}
        radius={1.9 * config.sideLightAngle * config.beamWidth}
        height={2.85 * config.beamLength}
        opacity={0.1 * config.beamOpacity}
        phase={3.1}
      />

      <OceanFloorGround />
      <LightPool position={[config.beamTargetX, 0.045, config.beamTargetZ + 0.08]} scale={[2.25 * config.beamWidth, 1.18 * config.beamWidth, 1]} opacity={0.22 * config.beamOpacity} phase={0.1} />
      <LightPool position={[config.beamTargetX + config.sideLightX * 0.62, 0.046, config.beamTargetZ + 0.02]} scale={[1.55 * config.beamWidth, 0.9 * config.beamWidth, 1]} opacity={0.13 * config.beamOpacity} phase={1.4} />
      <LightPool position={[config.beamTargetX + Math.abs(config.sideLightX) * 0.55, 0.046, config.beamTargetZ - 0.5]} scale={[1.25 * config.beamWidth, 0.74 * config.beamWidth, 1]} opacity={0.09 * config.beamOpacity} phase={2.7} />
      <CausticLines opacity={config.causticsOpacity} />
      <SuspendedParticles opacity={config.particleOpacity} />

      {ROCKS.map((rock, index) => (
        <SeaRock key={index} {...rock} />
      ))}

      <SeaweedClump position={[-2.05, 0.02, 2.25]} rotation={0.4} />
      <SeaweedClump position={[2.05, 0.02, 1.85]} rotation={-0.45} />
      <SeaweedClump position={[1.25, 0.02, 0.8]} rotation={0.85} />
      <SeaweedClump position={[-1.15, 0.02, 0.72]} rotation={-0.2} />
      <CoralCluster position={[-1.55, 0.02, 1.15]} rotation={0.3} />
      <CoralCluster position={[1.35, 0.02, 2.25]} rotation={-0.7} />

      <DefaultBear />

      <ContactShadows position={[0, 0.025, 1.35]} opacity={0.3} scale={6.5} blur={2.8} far={3} color="#00151d" />
    </>
  );
}

export default function OceanFloorScene({
  config,
  intro = true,
}: {
  config: OceanFloorSceneConfig;
  /** play the fly-in on load */
  intro?: boolean;
}) {
  const [flying, setFlying] = useState(intro);
  return (
    <Canvas
      className="absolute inset-0"
      dpr={[1, 1.5]}
      shadows
      camera={{ position: [config.cameraX, config.cameraY, config.cameraZ], fov: config.fov, near: 0.05, far: 12 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
    >
      <Matte />
      <OceanFloorWorld config={config} flying={flying} onIntroDone={() => setFlying(false)} />
    </Canvas>
  );
}

useGLTF.preload(BEAR_URL);
