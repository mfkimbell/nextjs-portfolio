"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * One-shot cinematic camera move: STRAIGHT LINE from a pulled-back sky pose
 * to the campsite's landing camera. That's it. No arcs, no descent-then-fly-in,
 * no aim tilting. The camera always looks in a single user-configurable
 * direction (pitch angle above/below horizontal) so there is no on-flight
 * camera tilt — position eases in, angle stays put.
 *
 * Runs once on mount, then hands the camera back. Click, tap, or any key
 * skips the rest of the move.
 */

export interface IntroFlightProps {
  /** Where the camera ends up — the scene's configured landing pose. */
  to: [number, number, number];
  /** The point that pose was framing. Used to compute the start pose. */
  target: [number, number, number];
  /** Seconds. */
  duration?: number;
  /** How far back the start sits, as a multiplier of the natural landing distance. */
  distanceMultiplier?: number;
  /** Extra height added to the start pose, in world units. */
  skyHeight?: number;
  /** Additive back-distance (world units), on top of distanceMultiplier. */
  extraDistance?: number;
  /**
   * The single camera angle knob. Pitch above horizontal, in degrees.
   * -20 = looking slightly down toward the campsite. +30 = looking up
   * at the sky. Held FIXED across the whole flight so the pitch never
   * changes — the camera flies in a straight line at a constant angle.
   */
  cameraPitch?: number;
  /** Degrees of extra FOV at the very start, eased away — adds punch. */
  fovBoost?: number;
  /** Multiplier that pulls fog IN at the start. 1 = no effect. */
  fogSquash?: number;
  /** Hold at the start pose without advancing. Used by the title screen. */
  held?: boolean;
  onDone?: () => void;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smoothstep = (x: number) => {
  const c = Math.min(Math.max(x, 0), 1);
  return c * c * (3 - 2 * c);
};

/**
 * Fraction of the flight over which the aim eases from the fixed-pitch
 * straight-line direction into the campsite's true target framing. Keeps the
 * middle of the flight tilt-free while eliminating the "snap" that used to
 * happen when CampfireScene took the camera back and immediately re-aimed at
 * `target`. Widen for a longer, softer arrival; shrink for a snappier one.
 */
const AIM_BLEND_START = 0.55;

export default function IntroFlight({
  to,
  target,
  duration = 3.6,
  distanceMultiplier = 3.4,
  skyHeight = 13,
  extraDistance = 0,
  cameraPitch = -15,
  fovBoost = 16,
  fogSquash = 0.45,
  held = false,
  onDone,
}: IntroFlightProps) {
  const { camera, scene } = useThree();
  const elapsed = useRef(0);
  const finished = useRef(false);
  const baseFov = useRef<number | null>(null);
  const baseFog = useRef<{ near: number; far: number } | null>(null);

  const path = useMemo(() => {
    const end = new THREE.Vector3(...to);
    const tgt = new THREE.Vector3(...target);
    const offset = end.clone().sub(tgt);
    const dist = Math.max(offset.length(), 0.001);
    const dir = offset.clone().normalize();

    // Sky start: pulled back from the target along the away-from-target
    // direction, plus extraDistance absolute, plus skyHeight up.
    const start = tgt.clone().addScaledVector(dir, dist * distanceMultiplier + extraDistance);
    start.y += skyHeight;

    // Look direction: horizontal forward (from start toward campsite in XZ),
    // tilted up/down by the cameraPitch angle. This vector is FIXED for the
    // whole flight — camera stays pointing this way as it moves straight
    // toward the landing pose. Zero tilt during the move.
    const horizForward = new THREE.Vector3(tgt.x - start.x, 0, tgt.z - start.z);
    if (horizForward.lengthSq() < 1e-6) horizForward.set(0, 0, -1);
    horizForward.normalize();
    const pitchRad = (cameraPitch * Math.PI) / 180;
    const lookDir = new THREE.Vector3(
      horizForward.x * Math.cos(pitchRad),
      Math.sin(pitchRad),
      horizForward.z * Math.cos(pitchRad)
    ).normalize();

    return { start, end, tgt, lookDir };
  }, [to, target, distanceMultiplier, skyHeight, extraDistance, cameraPitch]);

  // Skip on any input — but not while held (that would warp the camera
  // on the very tap that releases the title).
  useEffect(() => {
    if (held) return;
    const skip = () => { elapsed.current = duration; };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    window.addEventListener("wheel", skip, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("wheel", skip);
    };
  }, [duration, held]);

  useFrame((_, delta) => {
    if (finished.current) return;

    if (camera instanceof THREE.PerspectiveCamera && baseFov.current === null) {
      baseFov.current = camera.fov;
    }
    const fog = scene.fog as THREE.Fog | null;
    if (fog && baseFog.current === null) {
      baseFog.current = { near: fog.near, far: fog.far };
    }

    // Guard against a huge first delta after a slow model load.
    if (!held) elapsed.current += Math.min(delta, 1 / 20);
    const t = Math.min(elapsed.current / duration, 1);

    // Position: straight line from start to end with easeInOutCubic.
    const p = easeInOutCubic(t);
    const pos = path.start.clone().lerp(path.end, p);

    // Aim: fixed-pitch straight-line direction for most of the flight, then
    // eased into the campsite's real target framing over the final approach.
    // At t=1 the aim is exactly `path.tgt`, so when CampfireScene takes the
    // camera back there is no re-aim snap — the pose we hand over already
    // matches the pose the scene expects.
    const aimStraight = pos.clone().addScaledVector(path.lookDir, 10);
    const aimBlend = smoothstep((t - AIM_BLEND_START) / (1 - AIM_BLEND_START));
    const aim = aimStraight.lerp(path.tgt, aimBlend);

    camera.position.copy(pos);
    camera.lookAt(aim);

    if (camera instanceof THREE.PerspectiveCamera && baseFov.current !== null) {
      camera.fov = baseFov.current + fovBoost * (1 - easeOutCubic(t));
      camera.updateProjectionMatrix();
    }

    if (fog && baseFog.current) {
      const k = THREE.MathUtils.lerp(fogSquash, 1, easeOutCubic(t));
      fog.near = baseFog.current.near * k;
      fog.far = baseFog.current.far * k;
    }

    if (t >= 1) {
      finished.current = true;
      if (camera instanceof THREE.PerspectiveCamera && baseFov.current !== null) {
        camera.fov = baseFov.current;
        camera.updateProjectionMatrix();
      }
      if (fog && baseFog.current) {
        fog.near = baseFog.current.near;
        fog.far = baseFog.current.far;
      }
      onDone?.();
    }
  });

  return null;
}
