"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * The chevron that moves the site between its three scenes, as a real model
 * rather than an SVG path.
 *
 * arrow.glb is authored FLAT - 60 verts, 20 triangles, lying in the XZ plane
 * with 1 unit of thickness in Y, pointing along -Z, like something you would
 * paint on a road. Two rotations stand it up and turn it: X +90 tips the plane
 * upright so its thickness faces the camera, then Z turns the point left or
 * right. They are nested groups rather than one Euler triple because the ORDER
 * is the whole trick, and an Euler hides it.
 *
 * Everything else is measured off the model at runtime - its centre, and the
 * zoom that fits it to the button - so swapping arrow.glb for a different
 * shape re-centres and re-fits rather than needing these numbers edited.
 */
const ARROW_URL = "/CRT/arrow.glb";

/** Share of the box the arrow spans across its longest axis. With no plate
 *  behind it there is no rim to stay clear of, so it fills nearly the whole
 *  thing - the small margin is only there to keep the drop shadow from being
 *  clipped at the canvas edge. */
const ARROW_FILL = 0.94;

function ArrowModel({ direction }: { direction: "left" | "right" }) {
  const { scene } = useGLTF(ARROW_URL) as unknown as { scene: THREE.Group };
  const viewport = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  const model = useMemo(() => {
    const cloned = scene.clone(true);
    // The file ships one flat grey "default" material. This is a UI control on
    // a dark button, so it gets a light one with enough roughness to catch the
    // key light along one face and read as solid rather than as a sticker.
    const material = new THREE.MeshStandardMaterial({
      color: "#eef4ff",
      roughness: 0.42,
      metalness: 0.08,
    });
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = material;
    });
    return cloned;
  }, [scene]);

  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(centre);
    return { size, centre };
  }, [model]);

  // Zoom, not scale: an orthographic camera in r3f measures one unit per pixel
  // at zoom 1, so this is "how many pixels is one model unit" and it tracks the
  // button through its sm: breakpoint without a second constant to keep in step.
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    // x and z are the model's on-screen axes once it is stood up. y is its
    // thickness, pointing at the camera, and must not drive the fit.
    const span = Math.max(fit.size.x, fit.size.z) || 1;
    cam.zoom = (ARROW_FILL * Math.min(viewport.width, viewport.height)) / span;
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, viewport, fit, invalidate]);

  return (
    <group rotation={[0, 0, direction === "right" ? -Math.PI / 2 : Math.PI / 2]}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <group position={[-fit.centre.x, -fit.centre.y, -fit.centre.z]}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}

/**
 * Drop-in for the SVG chevrons: sized by its container, transparent, and
 * rendered ON DEMAND - the arrow never moves, so a render loop per arrow would
 * be two more animated canvases on a page that is already running the campsite.
 *
 * pointerEvents are off so the button behind it keeps every click, its hover
 * styling and its aria-label. This is artwork, not a control.
 */
export default function SceneArrow({ direction }: { direction: "left" | "right" }) {
  return (
    <Canvas
      frameloop="demand"
      orthographic
      camera={{ position: [0, 0, 10], near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
    >
      {/* Flat-on fill plus one raking key, so the chevron's bevel shows. */}
      <ambientLight intensity={1.5} />
      <directionalLight position={[-3, 4, 6]} intensity={2.2} />
      <Suspense fallback={null}>
        <ArrowModel direction={direction} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(ARROW_URL);
