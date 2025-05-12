/* ------------------------------------------------------------------
   AirplaneGLB.tsx  – self-contained airplane tracker
-------------------------------------------------------------------*/
"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/* ========= CONFIG – tweak any value =========== */
const CONFIG = {
  /* model & sizing */
  modelPath:     "/models/airplane.glb",
  visibleSize:   0.3,      // world-units plane width
  modelScale:    1,
  zLayer:        0,

  /* follow behaviour */
  followSpeed:   0.06,
  rotateSmooth:  0.08,
  bankIntensity: 0.4,
  followRadius:  0.3,

  /* idle orbit */
  idleDelay:     0.8,     // seconds mouse must stay still
  idleRPM:       0.25,     // revolutions per second

  /* fly-off + comeback */
  exitThreshold:   -.95,  // pointer.y (−1…1) below which exit starts
  exitSpeed:       8,      // units / second to the right
  exitBank:        -Math.PI / 10,
  returnThreshold: -.9,  // pointer.y above which plane resets
  returnX:         -6      // x-coord where it re-enters from left
} as const;
/* ============================================= */

useGLTF.preload(CONFIG.modelPath);

export default function AirplaneGLB() {
  const plane = useRef<THREE.Group>(null);
  const exitMode = useRef(false);
  const { camera } = useThree();
  const { scene: airplane } = useGLTF(CONFIG.modelPath);

  /* ---- normalize once ---- */
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(airplane);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    airplane.scale.setScalar(
      (CONFIG.visibleSize / maxDim) * CONFIG.modelScale
    );
    airplane.position.sub(box.getCenter(new THREE.Vector3()));
  }, [airplane]);

  /* helpers */
  const target  = useMemo(() => new THREE.Vector3(), []);
  const tmpMat  = useMemo(() => new THREE.Matrix4(), []);
  const qLook   = useMemo(() => new THREE.Quaternion(), []);
  const qBank   = useMemo(() => new THREE.Quaternion(), []);
  const prevPos = useRef(new THREE.Vector3());
  const prevMouse = useRef(new THREE.Vector2());
  const idleTimer = useRef(0);
  const up = new THREE.Vector3(0, 1, 0);

  useFrame((state, delta) => {
    if (!plane.current) return;

    /* canvas-relative pointer (scroll-safe) */
    const { x: mx, y: my } = state.pointer;

    /* -------- exit / comeback handling -------- */
    if (!exitMode.current && my < CONFIG.exitThreshold) exitMode.current = true;

    if (exitMode.current) {
      // fly right
      plane.current.position.x += CONFIG.exitSpeed * delta;
      plane.current.quaternion.slerp(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, 0, CONFIG.exitBank)
        ),
        CONFIG.rotateSmooth
      );

      // reset when pointer back in range
      if (my > CONFIG.returnThreshold) {
        exitMode.current = false;
        plane.current.position.set(CONFIG.returnX, 0, CONFIG.zLayer);
        prevPos.current.copy(plane.current.position);
      }
      return; // skip normal logic until comeback
    }

    /* -------- normal follow / idle -------- */

    /* detect mouse movement */
    const dx = mx - prevMouse.current.x;
    const dy = my - prevMouse.current.y;
    const moved = dx * dx + dy * dy > 1e-6;
    prevMouse.current.set(mx, my);
    moved ? (idleTimer.current = 0) : (idleTimer.current += delta);

    /* world point under mouse at zLayer */
    const ndc = new THREE.Vector3(mx, my, 0.5).unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const dist = (CONFIG.zLayer - camera.position.z) / dir.z;
    const baseTarget = camera.position.clone().add(dir.multiplyScalar(dist));

    const pos = plane.current.position;

    if (idleTimer.current < CONFIG.idleDelay) {
      /* ---- follow ---- */
      const toMouse = baseTarget.clone().sub(pos);
      const d = toMouse.length();

      d > CONFIG.followRadius
        ? target.copy(baseTarget).sub(
            toMouse.normalize().multiplyScalar(CONFIG.followRadius)
          )
        : target.copy(pos);

      pos.lerp(target, CONFIG.followSpeed);

      /* orientation & bank */
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

        plane.current.quaternion.slerp(
          qLook.multiply(qBank),
          CONFIG.rotateSmooth
        );
      }
    } else {
      /* ---- idle orbit ---- */
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

      plane.current.quaternion.slerp(
        qLook.multiply(qBank),
        CONFIG.rotateSmooth
      );
    }
  });

  return (
    <primitive
      ref={plane}
      object={airplane}
      position={[0, 0, CONFIG.zLayer]}
    />
  );
}
