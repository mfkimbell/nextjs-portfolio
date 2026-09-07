"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

import Matte from "@/components/Matte";
/**
 * Alphabet is composed from GLB letter meshes exported per-glyph from
 * simple_alphabet.glb (see nextjs/public/letters/*.glb).
 */
const LETTER_WIDTHS: Record<string, number> = {
  A: 0.9283, B: 0.7235, C: 0.7754, D: 0.7541, E: 0.7035, F: 0.6799,
  G: 0.8095, H: 0.8271, I: 0.3877, J: 0.8007, K: 0.8278, L: 0.6947,
  M: 1.1188, N: 0.8807, O: 0.7677, P: 0.7310, Q: 0.7296, R: 0.7643,
  S: 0.6939, T: 0.8147, U: 0.8737, V: 1.0351, W: 1.2705, X: 0.9308,
  Y: 0.7535, Z: 0.7854,
};

const LETTERS = Object.keys(LETTER_WIDTHS);
const LETTER_URL = (c: string) => `/letters/${c}.glb`;

const LETTER_SPACING = 0.08;
const SPACE_WIDTH    = 0.55;
const HYPHEN_WIDTH   = 0.45;
const PAREN_WIDTH    = 0.4;

const IDLE_Y_AMP   = 0.025;
const IDLE_ROT_AMP = 0.035;
const IDLE_FREQ    = 1.6;

// Slide distance and Z travel are now driven by TitleIntroTiming so the
// lab can tune them live — see titleExitSlideDistance / titleExitZDistance.

type GlyphKind = "letter" | "hyphen" | "paren-left" | "paren-right";

interface Placement {
  key: string;
  kind: GlyphKind;
  x: number;
  char?: string;
  width: number;
  glyphIndex: number;
}

function layoutWord(text: string): { placements: Placement[]; totalWidth: number } {
  const placements: Placement[] = [];
  let cursor = 0;
  let glyphIndex = 0;
  for (let i = 0; i < text.length; i++) {
    const raw = text[i];
    if (raw === " ") { cursor += SPACE_WIDTH; continue; }
    if (raw === "-") {
      placements.push({
        key: `${i}-h`,
        kind: "hyphen",
        x: cursor + HYPHEN_WIDTH / 2,
        width: HYPHEN_WIDTH,
        glyphIndex: glyphIndex++,
      });
      cursor += HYPHEN_WIDTH + LETTER_SPACING;
      continue;
    }
    if (raw === "(" || raw === ")") {
      placements.push({
        key: `${i}-${raw}`,
        kind: raw === "(" ? "paren-left" : "paren-right",
        x: cursor + PAREN_WIDTH / 2,
        width: PAREN_WIDTH,
        glyphIndex: glyphIndex++,
      });
      cursor += PAREN_WIDTH + LETTER_SPACING;
      continue;
    }
    const c = raw.toUpperCase();
    const w = LETTER_WIDTHS[c];
    if (w === undefined) continue;
    placements.push({
      key: `${i}-${c}`,
      kind: "letter",
      x: cursor + w / 2,
      width: w,
      char: c,
      glyphIndex: glyphIndex++,
    });
    cursor += w + LETTER_SPACING;
  }
  return { placements, totalWidth: Math.max(cursor - LETTER_SPACING, 0) };
}

function smoothstep(x: number) {
  const c = Math.min(Math.max(x, 0), 1);
  return c * c * (3 - 2 * c);
}

function useIdle(
  ref: React.MutableRefObject<THREE.Group | null>,
  glyphIndex: number,
  idleAmountRef: React.MutableRefObject<number>,
  wavinessRef: React.MutableRefObject<number>
) {
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const amp = idleAmountRef.current;
    // Phase is (glyphIndex × waviness) — waviness is live so slider drags
    // update the wave-through-the-row feel in real time.
    const phase = glyphIndex * wavinessRef.current;
    ref.current.position.y = Math.sin(t * IDLE_FREQ + phase) * IDLE_Y_AMP * amp;
    ref.current.rotation.z = Math.sin(t * IDLE_FREQ * 0.85 + phase * 1.3) * IDLE_ROT_AMP * amp;
  });
}

function LetterGlyph({
  char,
  x,
  material,
  glyphIndex,
  idleAmountRef,
  wavinessRef,
}: {
  char: string;
  x: number;
  material: THREE.Material;
  glyphIndex: number;
  idleAmountRef: React.MutableRefObject<number>;
  wavinessRef: React.MutableRefObject<number>;
}) {
  const { scene } = useGLTF(LETTER_URL(char));
  // Swap materials inline during clone. Doing it in a useEffect meant the
  // very first render used each glyph's ORIGINAL GLB material — under the
  // warm #ffd28a fill light that read as an orange flash before the shared
  // transparent white material took over on the next tick.
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((n) => {
      const m = n as THREE.Mesh;
      if (m.isMesh) {
        m.material = material;
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    return c;
  }, [scene, material]);
  const ref = useRef<THREE.Group>(null);

  useIdle(ref, glyphIndex, idleAmountRef, wavinessRef);

  return (
    <group position={[x, 0, 0]}>
      <group ref={ref}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

function HyphenBar({
  x,
  width,
  material,
  glyphIndex,
  idleAmountRef,
  wavinessRef,
}: {
  x: number;
  width: number;
  material: THREE.Material;
  glyphIndex: number;
  idleAmountRef: React.MutableRefObject<number>;
  wavinessRef: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Group>(null);
  useIdle(ref, glyphIndex, idleAmountRef, wavinessRef);
  return (
    <group position={[x, 0.5, 0]}>
      <group ref={ref}>
        <mesh material={material}>
          <boxGeometry args={[width, 0.12, 0.25]} />
        </mesh>
      </group>
    </group>
  );
}

function ParenArc({
  x,
  dir,
  material,
  glyphIndex,
  idleAmountRef,
  wavinessRef,
}: {
  x: number;
  dir: "left" | "right";
  material: THREE.Material;
  glyphIndex: number;
  idleAmountRef: React.MutableRefObject<number>;
  wavinessRef: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const arc = Math.PI * 0.8;
    const g = new THREE.TorusGeometry(0.4, 0.055, 8, 22, arc);
    const center = dir === "left" ? Math.PI : 0;
    g.rotateZ(center - arc / 2);
    return g;
  }, [dir]);
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useIdle(ref, glyphIndex, idleAmountRef, wavinessRef);
  return (
    <group position={[x, 0.5, 0]}>
      <group ref={ref}>
        <mesh geometry={geometry} material={material} />
      </group>
    </group>
  );
}

interface LineSpec {
  text: string;
  size: number;
  y: number;
}

/**
 * One title line — reads its opacity every frame from the shared opacityRef
 * (which is driven by the parent's RAF-driven phase machine). Adds a pulse
 * on top of that opacity during the waiting phase for hint lines, so the
 * "(SOUND ON)" prompt breathes.
 */
function TitleLine({
  text,
  size,
  y,
  opacityRef,
  waitingRef,
  idleAmountRef,
  wavinessRef,
  isHint = false,
}: LineSpec & {
  opacityRef: React.MutableRefObject<number>;
  waitingRef: React.MutableRefObject<boolean>;
  idleAmountRef: React.MutableRefObject<number>;
  wavinessRef: React.MutableRefObject<number>;
  isHint?: boolean;
}) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.55,
        metalness: 0.0,
        transparent: true,
        opacity: 0,
      }),
    []
  );
  useEffect(() => () => { material.dispose(); }, [material]);

  useFrame((state) => {
    let alpha = opacityRef.current;
    if (isHint && waitingRef.current) {
      const t = state.clock.elapsedTime;
      alpha *= 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2.4));
    }
    material.opacity = alpha;
  });

  const { placements, totalWidth } = useMemo(() => layoutWord(text), [text]);

  return (
    <group position={[0, y, 0]} scale={size}>
      <group position={[-totalWidth / 2, -0.5, 0]}>
        {placements.map((p) => {
          if (p.kind === "hyphen") {
            return (
              <HyphenBar
                key={p.key}
                x={p.x}
                width={p.width}
                material={material}
                glyphIndex={p.glyphIndex}
                idleAmountRef={idleAmountRef}
                wavinessRef={wavinessRef}
              />
            );
          }
          if (p.kind === "paren-left" || p.kind === "paren-right") {
            return (
              <ParenArc
                key={p.key}
                x={p.x}
                dir={p.kind === "paren-left" ? "left" : "right"}
                material={material}
                glyphIndex={p.glyphIndex}
                idleAmountRef={idleAmountRef}
                wavinessRef={wavinessRef}
              />
            );
          }
          return (
            <LetterGlyph
              key={p.key}
              char={p.char!}
              x={p.x}
              material={material}
              glyphIndex={p.glyphIndex}
              idleAmountRef={idleAmountRef}
              wavinessRef={wavinessRef}
            />
          );
        })}
      </group>
    </group>
  );
}

export interface TitleIntroTiming {
  /** Seconds of pure black at start before the letters begin fading in. */
  blackHoldDuration: number;
  fadeInDuration: number;
  /** Seconds the letters take to slide up and off screen after a click.
   *  Drives the slide animation only. */
  exitSlideDuration: number;
  /** Extra seconds to keep the overlay mounted after the slide finishes,
   *  before firing onEnter (which tears down the Canvas + letter GLBs).
   *  Lower this to reclaim the browser's render cost sooner. */
  exitUnmountDelay: number;
  /** World units the letters travel UP during the exit slide. */
  exitSlideDistance: number;
  /** Signed Z travel during the exit. >0 zooms toward viewer, <0 recedes. */
  exitZDistance: number;
  idleAmount: number;
  /** Radians of phase offset per letter — controls the wave-through-the-row
   *  feel. 0 = lockstep, ~0.3 = subtle wave, ~0.8 = strong wave. */
  waviness: number;
}

const DEFAULT_TIMING: TitleIntroTiming = {
  blackHoldDuration: 1.0,
  fadeInDuration: 2.8,
  exitSlideDuration: 0.9,
  exitUnmountDelay: 0.05,
  exitSlideDistance: 14,
  exitZDistance: 0,
  idleAmount: 2.2,
  waviness: 0.32,
};

const LINE_TEMPLATES: LineSpec[] = [
  { text: "MEET THE",            size: 0.65, y:  4.4 },
  { text: "SOFT-BEAR ENGINEERS", size: 1.10, y:  2.4 },
];

const HINT_LINE: LineSpec = { text: "(SOUND ON)", size: 0.32, y: 0.4 };

function FitToViewport({ children, worldWidth = 17 }: { children: React.ReactNode; worldWidth?: number }) {
  const { viewport } = useThree();
  const scale = Math.min(1, (viewport.width * 0.92) / worldWidth);
  return <group scale={scale}>{children}</group>;
}

/**
 * Translates its children upward by exitYOffsetRef.current every frame —
 * used to slide the whole title off the top of the viewport during exit.
 */
function ExitSlider({
  exitYOffsetRef,
  exitZOffsetRef,
  children,
}: {
  exitYOffsetRef: React.MutableRefObject<number>;
  exitZOffsetRef: React.MutableRefObject<number>;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.y = exitYOffsetRef.current;
    ref.current.position.z = exitZOffsetRef.current;
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * Title card overlay.
 *
 * Timing values are read live via a ref, so slider changes update the running
 * preview without a remount. Phase progression is computed from elapsed time
 * every frame — no setTimeout — so bumping fadeInDuration mid-fade extends
 * the fade in place.
 *
 * Transition into the scene is seamless: on click, `onUnmute` fires
 * IMMEDIATELY (parent releases the intro flight from its held pose) and the
 * letters + moon fade to transparent while the flight swoops in behind them.
 * No black curtain during fade-out — the campfire scene's own stars stay
 * visible the whole time. When the fade-out completes, `onDone` fires so
 * the parent can unmount.
 */
export default function CampsiteTitleIntro({
  onEnter,
  onUnmute,
  timing,
  previewMode = false,
}: {
  /** Called once the letters have fully faded out. Parent unmounts here. */
  onEnter: () => void;
  /** Called the moment the visitor clicks (SOUND ON). Parent should release
   *  the intro flight now so it starts swooping while letters fade. Falls
   *  back to onEnter if not provided. */
  onUnmute?: () => void;
  timing?: Partial<TitleIntroTiming>;
  /**
   * When true, the title is a non-blocking preview: it stays on the left
   * side of the viewport (leaving the right side clear for config sliders),
   * never becomes clickable, and never advances past the waiting phase.
   * Click the parent's "Title" button again to remount + replay the fade-in.
   */
  previewMode?: boolean;
}) {
  const t: TitleIntroTiming = { ...DEFAULT_TIMING, ...(timing ?? {}) };

  // All timing values are read live via a ref so slider changes hit the
  // running preview loop next frame without a remount.
  const timingRef = useRef(t);
  timingRef.current = t;

  const idleAmountRef = useRef(t.idleAmount);
  idleAmountRef.current = t.idleAmount;

  const wavinessRef = useRef(t.waviness);
  wavinessRef.current = t.waviness;

  // Shared 0-1 alpha for letters and moon, written by the RAF loop.
  const opacityRef = useRef(0);
  // Y offset (world units) applied to the whole title group during fade-out
  // so the letters slide UP off screen as the camera swoops down — reads as
  // parallax past a foreground element instead of a cross-fade.
  const exitYOffsetRef = useRef(0);
  // Signed Z offset applied during exit alongside the upward slide. Positive
  // pushes the title toward the viewer (zoom past camera); negative recedes
  // away. 0 keeps the original pure-vertical whoosh.
  const exitZOffsetRef = useRef(0);
  // True while we're in the waiting phase (hint line pulses).
  const waitingRef = useRef(false);

  const mountedAtRef = useRef<number>(0);
  const clickedAtRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const [hintClickable, setHintClickable] = useState(false);

  const previewModeRef = useRef(previewMode);
  previewModeRef.current = previewMode;

  // Hold the caller's callbacks in refs so the RAF loop below can depend on
  // NOTHING and run exactly once. Otherwise every render (e.g. a slider drag
  // upstream that re-passes a new inline arrow) re-fires the effect and
  // resets mountedAtRef — the visible symptom is the title flashing back to
  // pure black the moment you touch a slider.
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  useEffect(() => {
    mountedAtRef.current = performance.now() / 1000;
    let raf = 0;
    let running = true;

    const tick = () => {
      if (!running) return;
      const now = performance.now() / 1000;
      const elapsed = now - mountedAtRef.current;
      const tim = timingRef.current;

      let alpha: number;
      let overlay: number;
      let waiting: boolean;
      let clickable: boolean;

      if (clickedAtRef.current !== null) {
        // Exit phase. Two independent knobs:
        //   exitSlideDuration — how long the upward slide takes
        //   exitUnmountDelay  — extra hold after the slide before we call
        //                       onEnter and let the parent tear down this
        //                       overlay (Canvas + all letter GLBs).
        // Letters stay at full opacity for most of the slide and only fade
        // in the last 15% so nothing lingers at the viewport edge — the
        // campfire flight is swooping in behind them, so this reads as the
        // letters whooshing past the camera rather than a cross-fade.
        const local = now - clickedAtRef.current;
        const slide = Math.max(0.01, tim.exitSlideDuration);
        const p = smoothstep(local / slide);
        alpha = 1 - smoothstep((p - 0.85) / 0.15);
        exitYOffsetRef.current = p * tim.exitSlideDistance;
        exitZOffsetRef.current = p * tim.exitZDistance;
        overlay = 0;
        waiting = false;
        clickable = false;
        const totalExit = tim.exitSlideDuration + Math.max(0, tim.exitUnmountDelay);
        if (!finishedRef.current && local >= totalExit) {
          finishedRef.current = true;
          onEnterRef.current();
          running = false;
        }
      } else if (elapsed < tim.blackHoldDuration) {
        // Pure black hold — no letters yet, overlay fully opaque. Clickable
        // during this phase too, so an impatient visitor can skip past it.
        alpha = 0;
        overlay = 1;
        waiting = false;
        clickable = !previewModeRef.current;
      } else if (elapsed < tim.blackHoldDuration + tim.fadeInDuration) {
        // Fade-in. Black overlay 1 -> 0, letters 0 -> 1.
        const local = elapsed - tim.blackHoldDuration;
        const p = smoothstep(local / Math.max(0.01, tim.fadeInDuration));
        alpha = p;
        overlay = 1 - p;
        waiting = false;
        clickable = !previewModeRef.current;
      } else {
        // Waiting for click. Clickable immediately in prod, never in preview.
        alpha = 1;
        overlay = 0;
        waiting = true;
        clickable = !previewModeRef.current;
      }

      opacityRef.current = alpha;
      waitingRef.current = waiting;
      setOverlayOpacity((prev) => (Math.abs(prev - overlay) > 0.002 ? overlay : prev));
      setHintClickable((prev) => (prev !== clickable ? clickable : prev));

      if (running) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    // Intentionally empty deps: mount-once. Callbacks read from onEnterRef so
    // parent re-renders (e.g. slider drags) don't tear down the RAF loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activate = () => {
    if (finishedRef.current || clickedAtRef.current !== null || !hintClickable) return;
    clickedAtRef.current = performance.now() / 1000;
    setHintClickable(false);

    // Request mic permission (best effort — we mainly need the user gesture
    // for browser autoplay). Fire-and-forget so the fade-out isn't blocked.
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // denied or unsupported — the gesture still counts
      }
    })();

    // Prime any ambient audio.
    try {
      const w = window as typeof window & { __campsiteAmbient?: HTMLAudioElement };
      const a = w.__campsiteAmbient;
      if (a) {
        a.muted = false;
        a.volume = a.volume || 0.6;
        void a.play().catch(() => {});
      }
    } catch {
      // ignore
    }

    // Release the intro flight NOW — the flight animates in behind the
    // fading letters, so the visitor sees stars → flight lands, no gap.
    (onUnmute ?? onEnter)();
  };

  const pointerActive = !previewMode && hintClickable && clickedAtRef.current === null;

  // Preview mode: full viewport (so letters center IDENTICALLY to production)
  // but everything below the wrapper is pointer-events-none — including the
  // R3F <canvas>, which browsers default to pointer-events: auto and which
  // otherwise silently swallows every click. The `[&_*]:pointer-events-none`
  // Tailwind arbitrary variant forces the rule onto every descendant.
  const wrapperClass = previewMode
    ? "pointer-events-none [&_*]:pointer-events-none fixed inset-0 z-40"
    : `fixed inset-0 z-40 ${pointerActive ? "cursor-pointer pointer-events-auto" : "pointer-events-none"}`;

  return (
    <div
      className={wrapperClass}
      style={previewMode ? { pointerEvents: "none" } : undefined}
      onClick={previewMode ? undefined : activate}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ pointerEvents: "none" }}
      >
        <Canvas
          style={{ pointerEvents: "none" }}
          dpr={[1, 2]}
          camera={{ position: [0, 0, 17], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
        >
          <Matte />
          <ambientLight intensity={0.6} />
          <directionalLight position={[3, 4, 6]} intensity={1.2} />
          <directionalLight position={[-4, -2, 3]} intensity={0.35} color="#ffd28a" />
          <FitToViewport>
            <ExitSlider exitYOffsetRef={exitYOffsetRef} exitZOffsetRef={exitZOffsetRef}>
              {LINE_TEMPLATES.map((line) => (
                <TitleLine
                  key={line.text}
                  {...line}
                  opacityRef={opacityRef}
                  waitingRef={waitingRef}
                  idleAmountRef={idleAmountRef}
                  wavinessRef={wavinessRef}
                />
              ))}
              <TitleLine
                {...HINT_LINE}
                opacityRef={opacityRef}
                waitingRef={waitingRef}
                idleAmountRef={idleAmountRef}
                wavinessRef={wavinessRef}
                isHint
              />
            </ExitSlider>
          </FitToViewport>
        </Canvas>
      </div>
      {/* Painted AFTER the canvas so it stacks on top: while it's opaque, any
       *  first-frame R3F content (letters mid-material-swap, GLB pop-in) is
       *  hidden. Fades to 0 as the letters fade up, then never appears again. */}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{
          opacity: overlayOpacity,
          // Very short transition so React state changes look continuous;
          // the real animation is in the RAF loop above.
          transition: "opacity 0.05s linear",
        }}
      />
    </div>
  );
}

// Preload every glyph so nothing pops in mid-fade.
LETTERS.forEach((c) => useGLTF.preload(LETTER_URL(c)));
