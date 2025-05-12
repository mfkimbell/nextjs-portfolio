/* ------------------------------------------------------------------
   AirplaneGLB.tsx  – self-contained airplane tracker
   Simplified scaling: use `rawScale` only (no bounding‐box math)
-------------------------------------------------------------------*/
"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/* ========= CONFIG – tweak only rawScale for size =========== */
const CONFIG = {
  modelPath: "/models/airplane.glb",

  // Raw uniform scale factor. 1 = model’s native size,
  // <1 shrinks, >1 enlarges. Tweak this until it looks right.
  rawScale: 2.5,

  zLayer: 0,

  /* follow behaviour */
  followSpeed: 0.06,
  rotateSmooth: 0.08,
  bankIntensity: 0.4,
  followRadius: 0.3,

  /* idle orbit */
  idleDelay: 0.8,
  idleRPM: 0.25,

  /* fly-off + comeback */
  exitThreshold: -0.95,
  exitSpeed: 8,
  exitBank: -Math.PI / 10,
  returnThreshold: -0.9,
  returnX: -6,
} as const;
/* ============================================= */

useGLTF.preload(CONFIG.modelPath);

export default function AirplaneGLB() {
  const planeRef = useRef<THREE.Group>(null);
  const exitMode = useRef(false);
  const { camera } = useThree();
  const { scene: airplane } = useGLTF(CONFIG.modelPath);

  // CLEANUP: dispose geometries & materials on unmount
  useEffect(() => {
    return () => {
      airplane.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    };
  }, [airplane]);

  // SIMPLE SCALE & CENTER: runs once on mount
  useEffect(() => {
    // 1) apply raw uniform scale
    airplane.scale.setScalar(CONFIG.rawScale);

    // 2) center model origin
    const box = new THREE.Box3().setFromObject(airplane);
    const center = box.getCenter(new THREE.Vector3());
    airplane.position.sub(center);

    // 3) initial off-screen spawn
    if (planeRef.current) {
      planeRef.current.position.set(
        CONFIG.returnX,
        0,
        CONFIG.zLayer
      );
    }
  }, [airplane]);

  /* ───── HELPERS ───── */
  const target    = useMemo(() => new THREE.Vector3(), []);
  const tmpMat    = useMemo(() => new THREE.Matrix4(), []);
  const qLook     = useMemo(() => new THREE.Quaternion(), []);
  const qBank     = useMemo(() => new THREE.Quaternion(), []);
  const prevPos   = useRef(new THREE.Vector3());
  const prevMouse = useRef(new THREE.Vector2());
  const idleTimer = useRef(0);
  const up        = new THREE.Vector3(0, 1, 0);

  useFrame((state, delta) => {
    if (!planeRef.current) return;
    const { x: mx, y: my } = state.pointer;

    /* ---- exit / comeback ---- */
    if (!exitMode.current && my < CONFIG.exitThreshold) {
      exitMode.current = true;
    }
    if (exitMode.current) {
      // fly right offscreen
      planeRef.current.position.x += CONFIG.exitSpeed * delta;
      planeRef.current.quaternion.slerp(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, 0, CONFIG.exitBank)
        ),
        CONFIG.rotateSmooth
      );
      // reset when pointer back up
      if (my > CONFIG.returnThreshold) {
        exitMode.current = false;
        planeRef.current.position.set(
          CONFIG.returnX,
          0,
          CONFIG.zLayer
        );
        prevPos.current.copy(planeRef.current.position);
      }
      return;
    }

    /* ---- normal follow / idle ---- */
    const dx = mx - prevMouse.current.x;
    const dy = my - prevMouse.current.y;
    const moved = dx * dx + dy * dy > 1e-6;
    prevMouse.current.set(mx, my);
    idleTimer.current = moved ? 0 : idleTimer.current + delta;

    // project pointer into world at zLayer
    const ndc = new THREE.Vector3(mx, my, 0.5).unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const dist = (CONFIG.zLayer - camera.position.z) / dir.z;
    const baseTarget = camera.position.clone().add(dir.multiplyScalar(dist));
    const pos = planeRef.current.position;

    if (idleTimer.current < CONFIG.idleDelay) {
      // follow mouse
      const toMouse = baseTarget.clone().sub(pos);
      const d = toMouse.length();
      if (d > CONFIG.followRadius) {
        target.copy(baseTarget).sub(
          toMouse.normalize().multiplyScalar(CONFIG.followRadius)
        );
      } else {
        target.copy(pos);
      }
      pos.lerp(target, CONFIG.followSpeed);

      // orient & bank
      const vel = pos.clone().sub(prevPos.current);
      prevPos.current.copy(pos);
      if (vel.lengthSq() > 1e-7) {
        const lookPt = pos.clone().add(vel);
        tmpMat.lookAt(pos, lookPt, up);
        qLook.setFromRotationMatrix(tmpMat);

        const bank = THREE.MathUtils.clamp(
          -vel.y * CONFIG.bankIntensity,
          -Math.PI / 4,
          Math.PI / 4
        );
        const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(qLook);
        qBank.setFromAxisAngle(fwd, bank);

        planeRef.current.quaternion.slerp(
          qLook.multiply(qBank),
          CONFIG.rotateSmooth
        );
      }
    } else {
      // idle orbit
      const t = state.clock.getElapsedTime();
      const angle = t * CONFIG.idleRPM * Math.PI * 2;
      target
        .copy(baseTarget)
        .add(
          new THREE.Vector3(
            CONFIG.followRadius * Math.cos(angle),
            CONFIG.followRadius * Math.sin(angle),
            0
          )
        );
      pos.lerp(target, CONFIG.followSpeed);

      const tangent = new THREE.Vector3(
        -CONFIG.followRadius * Math.sin(angle),
        CONFIG.followRadius * Math.cos(angle),
        0
      ).normalize();
      const lookPt = pos.clone().add(tangent);
      tmpMat.lookAt(pos, lookPt, up);
      qLook.setFromRotationMatrix(tmpMat);

      const bank = Math.sin(angle) * CONFIG.bankIntensity;
      const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(qLook);
      qBank.setFromAxisAngle(fwd, bank);

      planeRef.current.quaternion.slerp(
        qLook.multiply(qBank),
        CONFIG.rotateSmooth
      );
    }
  });

  return (
    <primitive
      ref={planeRef}
      object={airplane}
      className="z-60"
    />
  );
}
