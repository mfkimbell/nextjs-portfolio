// components/LeftTreeScene.tsx
//
// Renders left_tree.glb in the left page gutter, in the exact footprint the
// left_tree.png <img> used to occupy.
//
// WHY THE CANVAS IS FIXED AND THE CAMERA MOVES
// --------------------------------------------
// The tree strip is as tall as the whole document — routinely 8,000-12,000 CSS
// px. A canvas that size means a drawing buffer of the same height, which is
// wasteful everywhere and outright fails on mobile GPUs (many cap a canvas
// dimension at 4096). So the canvas is position:fixed and exactly one viewport
// tall, and an orthographic camera slides up the trunk as the page scrolls.
// Visually identical to a full-height image; the buffer never grows.
//
// REGISTRATION
// ------------
// An invisible anchor div is laid out exactly where the old <img> container
// was, using the same layout maths in HomeShell. Every frame we read its
// viewport rect and solve for the camera that puts the model's base and
// centreline where the PNG's drawn artwork used to sit. That way all the
// existing per-breakpoint tuning (treeVisiblePeekPx, the negative left offset,
// page-height scaling) keeps working untouched — this component never second
// guesses it, it just reads the resulting box.
"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import LeftTreeGLB from "./LeftTreeGLB";

import Matte from "@/components/Matte";
/* ── measurements of public/fauna/left_tree.png ────────────────────────────
 * The <img> was stretched with object-fill, so these are fractions of the
 * asset, not pixels, and stay correct at any rendered size. Taken from the
 * alpha channel of the 1880 x 17300 source:
 *
 *   drawn artwork spans y = 1912 .. 17250   (the top ~11% is empty padding)
 *   trunk centreline sits at x = 975.4
 *
 * If left_tree.png is ever re-exported at different proportions these three
 * numbers must be re-measured, or the model will drift off its old footprint.
 */
const ART_TOP_FRAC = 1912 / 17300;
const ART_BOTTOM_FRAC = 17250 / 17300;
const TRUNK_CX_FRAC = 975.4 / 1880;

/** Height of the trunk in left_tree.glb, in world units. */
const MODEL_HEIGHT = 9.2;

/** Camera distance. Only needs to clear the model's ~0.6 unit depth. */
const CAM_Z = 40;

/** Don't bother re-rendering once the strip is this far off screen. */
const OFFSCREEN_SLOP_PX = 64;

interface CameraFrame {
  zoom: number;
  x: number;
  y: number;
}

/**
 * Applies the solved camera each time a frame is requested. Kept as a child of
 * <Canvas> because that's the only place useThree can reach the camera.
 */
function CameraRig({ frameRef }: { frameRef: React.RefObject<CameraFrame> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;

  useFrame(() => {
    const f = frameRef.current;
    if (!f || f.zoom <= 0) return;

    // R3F points a fresh camera at the origin. Force identity rotation so the
    // ortho view stays axis-aligned once we move it off centre.
    camera.rotation.set(0, 0, 0);
    camera.position.set(f.x, f.y, CAM_Z);
    camera.zoom = f.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  });

  return null;
}

export interface LeftTreeSceneProps {
  /** Same values HomeShell used to feed the <img> container. */
  top: number;
  left: number;
  width: number;
  height: number | string;
  zIndex: number;
}

export default function LeftTreeScene({
  top,
  left,
  width,
  height,
  zIndex,
}: LeftTreeSceneProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<CameraFrame>({ zoom: 0, x: 0, y: 0 });
  const invalidateRef = useRef<(() => void) | null>(null);
  const scheduleRef = useRef<(() => void) | null>(null);
  const lastBox = useRef({ left: -1, width: -1, shown: false });

  // Position/size of the fixed holder is owned imperatively by `measure`, never
  // by React's inline style — otherwise a re-render (breakpoint change, page
  // growth) would stomp the measured values back to the raw props.
  useEffect(() => {
    const anchor = anchorRef.current;
    const holder = holderRef.current;
    if (!anchor || !holder) return;

    let queued = false;

    const measure = () => {
      queued = false;
      const rect = anchor.getBoundingClientRect();
      const vh = window.innerHeight;

      // Where the drawn artwork sits in viewport coordinates.
      const artTop = rect.top + ART_TOP_FRAC * rect.height;
      const artBottom = rect.top + ART_BOTTOM_FRAC * rect.height;
      const artHeight = artBottom - artTop;
      if (artHeight <= 0 || rect.width <= 0) return;

      const shown = artBottom > -OFFSCREEN_SLOP_PX && artTop < vh + OFFSCREEN_SLOP_PX;

      // The anchor deliberately hangs off the left edge (negative `left`) so
      // only a sliver of trunk peeks in. A fixed element that wide can provoke
      // a horizontal scrollbar, so the canvas covers just the on-screen part
      // and the camera absorbs the difference.
      const canvasLeft = Math.max(0, rect.left);
      const canvasWidth = Math.max(1, rect.width + Math.min(0, rect.left));

      if (canvasLeft !== lastBox.current.left || canvasWidth !== lastBox.current.width) {
        holder.style.left = `${canvasLeft}px`;
        holder.style.width = `${canvasWidth}px`;
        lastBox.current.left = canvasLeft;
        lastBox.current.width = canvasWidth;
      }
      if (shown !== lastBox.current.shown) {
        holder.style.visibility = shown ? "visible" : "hidden";
        lastBox.current.shown = shown;
      }
      if (!shown) return;

      // px per world unit — the model's 9.2 units span the drawn artwork.
      const zoom = artHeight / MODEL_HEIGHT;

      // Solve for the camera that lands world (0, 0) — the base of the trunk,
      // on its centreline — at the bottom-centre of where the artwork was:
      //   viewportX(w) = canvasLeft + canvasWidth/2 + (w - camX) * zoom
      //   viewportY(w) = vh/2 - (w - camY) * zoom
      const trunkCx = rect.left + TRUNK_CX_FRAC * rect.width;
      frameRef.current = {
        zoom,
        x: (canvasLeft + canvasWidth / 2 - trunkCx) / zoom,
        y: (artBottom - vh / 2) / zoom,
      };

      invalidateRef.current?.();
    };

    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    };

    scheduleRef.current = schedule;
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    // The page grows as sections load (images, the drawing gallery), which
    // moves the strip's bottom. Watch the anchor rather than trusting the
    // initial measurement.
    const ro = new ResizeObserver(schedule);
    ro.observe(anchor);

    return () => {
      scheduleRef.current = null;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
    };
  }, []);

  // Every render re-applies the React inline styles below, which overwrites the
  // measured left/width, and a ResizeObserver won't catch a pure `left` change
  // (a breakpoint flipping sideTreeEdgeOffsetPx). So re-measure after any
  // render — `schedule` coalesces into a single rAF, so this is nearly free.
  useEffect(() => {
    scheduleRef.current?.();
  });

  return (
    <>
      {/* Layout-only. Zero paint, but it inherits every bit of the existing
          per-breakpoint tree maths, which is what the camera reads. */}
      <div
        ref={anchorRef}
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{ top, left, width, height, visibility: "hidden" }}
      />

      {/* left/width/visibility are set by `measure` on the first frame. They
          start at 0/hidden so a negative `left` can never briefly widen the
          document, and so nothing paints before the camera is solved. */}
      <div
        ref={holderRef}
        aria-hidden="true"
        className="pointer-events-none fixed"
        style={{ top: 0, left: 0, width, height: "100vh", zIndex, visibility: "hidden" }}
      >
        <Canvas
          // Static geometry: render on scroll/resize only, never on a loop.
          frameloop="demand"
          orthographic
          dpr={[1, 2]}
          camera={{ position: [0, 0, CAM_Z], near: 0.1, far: CAM_Z * 4, zoom: 100 }}
          gl={{ alpha: true, antialias: true }}
          onCreated={({ invalidate }) => {
            invalidateRef.current = invalidate;
            invalidate();
          }}
        >
          <Matte />
          {/* Matched to the Projects scene, where the sign's logs read well.
              Ambient was 1.25 here against 0.85 there — 47% more flat fill,
              which is what was washing the trunk's facets into one tone. A
              faceted low-poly form needs a hard key and a restrained ambient;
              raise ambient and every facet converges on the same value no
              matter how many of them there are. */}
          <Environment preset="forest" environmentIntensity={0.45} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 10, 2]} intensity={2.4} color="#fff2cf" />
          {/* Bounce fill — keeps the shaded side readable without erasing it. */}
          <directionalLight position={[-4, 2, 3]} intensity={0.7} color="#b9d4f0" />
          <directionalLight position={[0, 3, -6]} intensity={0.4} color="#ffffff" />
          <CameraRig frameRef={frameRef} />
          <LeftTreeGLB />
        </Canvas>
      </div>
    </>
  );
}
