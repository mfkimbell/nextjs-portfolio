// components/ProjectorRaccoonGLB.tsx
//
// The raccoon film crew for the Projects section.
//
// Three raccoons, all the same mesh from racoon.glb, each driven by its own
// 20-bone armature:
//
//   Racoon_Projectionist  up on its hind legs, eye to the projector's eyepiece
//   Racoon_Popcorn        sat back on its haunches with a bucket of popcorn
//   Racoon_Hanging        upside down off the branch by its hind feet
//
// The screen hangs free from that same branch, set back behind all three, and
// runs off the right edge to meet the right_tree.png artwork the page paints.
//
// THE BIND POSE IS THE POSED POSE.
// The GLB was exported with rest_position_armature off, so the raccoons look
// right the instant the file loads, before any clip is played. The idle clips
// layer on top of that; if animation is ever disabled the scene still reads.
//
// Each raccoon has its own looping idle at a deliberately different length —
// 11.04s / 9.04s / 13.04s. Nothing divides evenly, so the three never fall into
// step and the group never looks mechanical.
//
// Because the meshes are skinned, this file clones with SkeletonUtils rather
// than Object3D.clone — a plain clone shares the skeleton, so two mounts of
// this component would fight over one set of bones.
//
// Attribution: raccoon mesh is "Low poly raccoon" by clydehelder, CC-BY-4.0.
// https://sketchfab.com/3d-models/low-poly-raccoon-ad1dba65d5f847c79b653305cc0b7634
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import {
  PROJECTOR_SCENE_OBJECT_TRANSFORMS,
  degreesToRadians,
} from "@/config/projectorRaccoons";

const MODEL = "/models/projector_raccoon_scene.glb";
const SCREEN_MESH = "Screen_Fabric";
const BEAM_MESH = "Projection_Beam";

/**
 * The old projector screen (2.511 x 1.545) was swapped for a TV in Blender.
 * The TV's screen face is now the mesh renamed to Screen_Fabric; its authored
 * plane is 1.452 x 1.122 (aspect ~1.294). Kept as a fraction so the letterbox
 * math still lines up if the mesh gets swapped again.
 */
const SCREEN_ASPECT = 1.452 / 1.122;

/** Half the authored height — lifts the scene so its middle sits on y = 0. */
const CENTER_Y = 4.355 / 2;

// The popcorn bucket is a child of the Popcorn raccoon's Chest *bone*, so it
// rides the munching idle without needing anything driven from here.

/**
 * Fixed per-clip start offsets, in seconds. The clip lengths already guarantee
 * the loops drift apart, but without this all three start on frame 1 together
 * and the first few seconds after load look like a chorus line. Fixed rather
 * than random so a server render and a client render agree.
 */
const CLIP_OFFSET: Record<string, number> = {
  Idle_Projectionist: 0,
  Idle_Popcorn: 3.1,
  Idle_Hanging: 6.7,
};

type Props = {
  /** Public URL of the architecture PNG to project, e.g. /projects/saas_arch.png */
  archSrc?: string;
};

export default function ProjectorRaccoonGLB({ archSrc }: Props) {
  const { scene: source, animations } = useGLTF(MODEL) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };
  const { gl } = useThree();

  // useGLTF caches the parsed scene and hands every consumer the same object.
  // SkeletonUtils.clone rebuilds the bone hierarchy and rebinds each SkinnedMesh
  // to its own copy; the material clone below is separate, because this mount
  // mutates map/colour/opacity and must not reach into the shared cache.
  const scene = useMemo(() => {
    const root = cloneSkeleton(source) as THREE.Group;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
    });

    for (const t of PROJECTOR_SCENE_OBJECT_TRANSFORMS) {
      const node = root.getObjectByName(t.objectName);
      if (!node) {
        console.warn(
          `[ProjectorRaccoon] scene transform target "${t.objectName}" not found in GLB`
        );
        continue;
      }
      if (t.positionOffset) {
        node.position.x += t.positionOffset[0];
        node.position.y += t.positionOffset[1];
        node.position.z += t.positionOffset[2];
      }
      if (t.rotationOffsetDeg) {
        node.rotation.x += degreesToRadians(t.rotationOffsetDeg[0]);
        node.rotation.y += degreesToRadians(t.rotationOffsetDeg[1]);
        node.rotation.z += degreesToRadians(t.rotationOffsetDeg[2]);
      }
      if (t.scaleMultiplier !== undefined) {
        node.scale.multiplyScalar(t.scaleMultiplier);
      }
    }

    return root;
  }, [source]);

  // The mixer binds clip tracks to nodes by name, and SkeletonUtils.clone keeps
  // the names, so the clips drive this clone rather than the cached original.
  const group = useRef<THREE.Group>(null!);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const started: THREE.AnimationAction[] = [];
    Object.entries(actions).forEach(([name, action]) => {
      if (!action) return;
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.time = CLIP_OFFSET[name] ?? 0;
      action.play();
      started.push(action);
    });
    return () => started.forEach((a) => a.stop());
  }, [actions]);

  const screen = useMemo(
    () => scene.getObjectByName(SCREEN_MESH) as THREE.Mesh | null,
    [scene]
  );
  const beam = useMemo(
    () => scene.getObjectByName(BEAM_MESH) as THREE.Mesh | null,
    [scene]
  );

  // The screen's authored off-white. The bulb flash multiplies this rather than
  // overwriting it, so a blank screen stays cream instead of snapping to white.
  const screenBase = useRef(new THREE.Color(1, 1, 1));

  useEffect(() => {
    if (screen) {
      const mat = screen.material as THREE.MeshStandardMaterial;
      screenBase.current.copy(mat.color);
    }
    if (beam) {
      const mat = beam.material as THREE.MeshStandardMaterial;
      // The only transparent object in the scene, and it's a solid frustum that
      // always sits in front of the screen. Writing depth would let it occlude
      // the raccoons lying inside it.
      mat.depthWrite = false;
      mat.toneMapped = false;
    }
  }, [screen, beam]);

  /** Drives the bulb flash on project change: 1 right after a swap, decays to 0. */
  const flash = useRef(0);

  useEffect(() => {
    if (!screen || !archSrc) return;

    let cancelled = false;
    const loader = new THREE.TextureLoader();

    loader.load(
      archSrc,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }

        // glTF UVs put the origin at the top-left, which is why GLTFLoader
        // leaves its own textures unflipped. A texture we load by hand has to
        // match, or the diagram arrives upside down.
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());

        // Contain-fit rather than stretch: the diagrams are wider than the
        // screen and squashing them bends the boxes and arrows. Clamped
        // wrapping smears the outermost row of pixels into the letterbox bands,
        // which is invisible here because every diagram has a white margin.
        const img = tex.image as { width: number; height: number };
        const imgAspect = img.width / img.height;
        if (imgAspect > SCREEN_ASPECT) {
          const r = imgAspect / SCREEN_ASPECT;
          tex.repeat.set(1, r);
          tex.offset.set(0, (1 - r) / 2);
        } else {
          const r = SCREEN_ASPECT / imgAspect;
          tex.repeat.set(r, 1);
          tex.offset.set((1 - r) / 2, 0);
        }

        const mat = screen.material as THREE.MeshStandardMaterial;
        const previous = mat.map;
        mat.map = tex;
        mat.needsUpdate = true;
        previous?.dispose();

        flash.current = 1;
      },
      undefined,
      () => {
        // A missing *_arch.png shouldn't take the canvas down; the screen just
        // stays blank, which still reads as a projector screen.
        if (!cancelled) console.warn(`[ProjectorRaccoon] no diagram at ${archSrc}`);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [archSrc, screen, gl]);

  // Dispose the texture we own on unmount. The rest of the materials came from
  // clone() and carry no GPU resources of their own.
  useEffect(() => {
    return () => {
      if (!screen) return;
      (screen.material as THREE.MeshStandardMaterial).map?.dispose();
    };
  }, [screen]);

  useFrame((state, delta) => {
    // Accumulated decay rather than a clock read, so the flash doesn't fire
    // stale after the tab has been backgrounded mid-transition.
    flash.current = THREE.MathUtils.damp(flash.current, 0, 7, delta);

    if (screen) {
      const mat = screen.material as THREE.MeshStandardMaterial;
      mat.color.copy(screenBase.current).multiplyScalar(1 + flash.current * 1.5);
    }

    if (beam) {
      const mat = beam.material as THREE.MeshStandardMaterial;
      const t = state.clock.elapsedTime;
      // Two periods that don't divide evenly, so the bulb never visibly loops.
      const shimmer = Math.sin(t * 2.3) * 0.018 + Math.sin(t * 5.9) * 0.011;
      mat.opacity = 0.18 + shimmer + flash.current * 0.22;
    }
  });

  return (
    <group ref={group}>
      <primitive object={scene} position={[0, -CENTER_Y, 0]} />
    </group>
  );
}

useGLTF.preload(MODEL);
