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
  exitTopThreshold: 0.92,
  exitBottomThreshold: -0.92,
  returnTopThreshold: 0.76,
  returnBottomThreshold: -0.76,
  exitSpeed: 8,
  exitVerticalDriftSpeed: 1.4,
  exitBank: Math.PI / 10,
  returnX: -6,
} as const;
/* ============================================= */

useGLTF.preload(CONFIG.modelPath);

export default function AirplaneGLB() {
  const planeRef = useRef<THREE.Group>(null);
  const exitMode = useRef(false);
  const exitVerticalDrift = useRef(0);
  const { camera, gl } = useThree();
  const pointer = useRef(new THREE.Vector2(-1.4, 0));
  const pointerInsideCanvas = useRef(false);
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

  useEffect(() => {
    const updatePointer = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const wasInside = pointerInsideCanvas.current;
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      pointerInsideCanvas.current = inside;

      // If the mouse leaves through the top/bottom of the Experience section,
      // trigger the same rightward fly-off instead of freezing at the edge.
      if (!inside) {
        if (wasInside && event.clientY < rect.top) {
          exitMode.current = true;
          exitVerticalDrift.current = 1;
        } else if (wasInside && event.clientY > rect.bottom) {
          exitMode.current = true;
          exitVerticalDrift.current = -1;
        }
        return;
      }

      pointer.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      );
    };

    window.addEventListener("pointermove", updatePointer, { passive: true });
    return () => window.removeEventListener("pointermove", updatePointer);
  }, [gl]);

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
    const isPointerHere = pointerInsideCanvas.current;
    const { x: mx, y: my } = pointer.current;

    /* ---- exit / comeback ---- */
    const tooHigh = my > CONFIG.exitTopThreshold;
    const tooLow = my < CONFIG.exitBottomThreshold;
    if (isPointerHere && !exitMode.current && (tooHigh || tooLow)) {
      exitMode.current = true;
      exitVerticalDrift.current = tooHigh ? 1 : -1;
    }
    if (exitMode.current) {
      // Fly right offscreen, with a small upward/downward drift matching the
      // edge that triggered the exit. It never comes back from the right.
      planeRef.current.position.x += CONFIG.exitSpeed * delta;
      planeRef.current.position.y += exitVerticalDrift.current * CONFIG.exitVerticalDriftSpeed * delta;
      planeRef.current.quaternion.slerp(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, 0, -exitVerticalDrift.current * CONFIG.exitBank)
        ),
        CONFIG.rotateSmooth
      );

      // Re-enter only when the pointer is back inside the safe middle band;
      // respawn from the left every time.
      const safeToReturn =
        isPointerHere &&
        my < CONFIG.returnTopThreshold &&
        my > CONFIG.returnBottomThreshold;
      if (safeToReturn) {
        exitMode.current = false;
        exitVerticalDrift.current = 0;
        planeRef.current.position.set(
          CONFIG.returnX,
          0,
          CONFIG.zLayer
        );
        prevPos.current.copy(planeRef.current.position);
        prevMouse.current.copy(pointer.current);
        idleTimer.current = 0;
      }
      return;
    }

    /* ---- normal follow / idle ---- */
    const dx = mx - prevMouse.current.x;
    const dy = my - prevMouse.current.y;
    const moved = isPointerHere && dx * dx + dy * dy > 1e-6;
    if (isPointerHere) prevMouse.current.set(mx, my);
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
