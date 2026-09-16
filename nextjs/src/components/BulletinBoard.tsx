// components/BulletinBoard.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate as mutateGlobal } from "swr";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { ThumbsUp, Trash2 } from "lucide-react";
import * as THREE from "three";
import { A4_PAPER_ASPECT_RATIO, BULLETIN_BOARD_CONFIG } from "@/config/signs";
import { drawPaintStroke, fillPaperTexture, PAPER_COLOR, type PaintPoint } from "@/lib/paint";

import Matte from "@/components/Matte";
/**
 * The contact board, in 3D.
 *
 *   board_envelope.glb  - a stack of envelopes  -> "Email Mitch"
 *   board_palette.glb   - paint palette + brush pot -> "Leave a sketch"
 *   bulletin_paper.glb  - pinned paper ("Paper" + "Pin" meshes) for user sketches
 *
 * All three were normalised in Blender: centred on their own origin, scaled to
 * roughly unit height, and rotated so the readable face points +Z (toward the
 * camera) after the glTF Y-up conversion. So nothing here needs magic rotations.
 *
 * The envelope and palette REST ON THE BOTTOM of the board and lean back against
 * it. Everything lifts and tilts toward the viewer on hover, with a contact
 * shadow that grows as it peels away.
 *
 * Submitted sketches come from /api/drawing-submissions as stroke arrays, not
 * images, so each is rasterised to a canvas here and used as the paper's map.
 */

const PAPER = "/models/bulletin_paper.glb";

/** Deterministic PRNG so the scatter is stable between renders. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PaperSpot = { x: number; y: number; z: number; rot: number };

type PaperLayout = {
  count: number;
  scale: number;
  spots: PaperSpot[];
};

/**
 * Scatter drawings like someone actually pinned them by hand. This uses seeded
 * random candidate placement instead of rows: papers spread across the whole
 * cork area, use small hand-pinned rotations, and barely overlap when needed.
 */
function layoutPapers(count: number, halfW: number, yLo: number, yHi: number): PaperLayout {
  const requested = Math.min(count, PAPER_CONFIG.maxSheets);
  if (requested <= 0) return { count: 0, scale: PAPER_CONFIG.maxScale, spots: [] };

  const paperW = 1.04;
  const paperH = 1.34 * PAPER_Y_SCALE;
  const areaW = halfW * 2 * 0.88;
  const areaH = Math.max(0.1, yHi - yLo);
  const rand = rng(4242 + requested * 97);

  // Size from a loose packing estimate, with enough breathing room that papers
  // mostly avoid each other and only barely overlap when the board gets full.
  const areaAspect = areaW / areaH;
  const cols = Math.max(1, Math.ceil(Math.sqrt(requested * areaAspect)));
  const rows = Math.max(1, Math.ceil(requested / cols));
  const scale = Math.max(
    PAPER_CONFIG.minScale,
    Math.min(
      PAPER_CONFIG.maxScale,
      areaW / (cols * paperW * 1.02),
      areaH / (rows * paperH * 0.94)
    )
  );

  const halfPaperW = (paperW * scale) / 2;
  const halfPaperH = (paperH * scale) / 2;
  const xLo = -areaW / 2 + halfPaperW;
  const xHi = areaW / 2 - halfPaperW;
  const yMin = yLo + halfPaperH;
  const yMax = yHi - halfPaperH;
  const pick = (lo: number, hi: number) => (hi <= lo ? (lo + hi) / 2 : lo + rand() * (hi - lo));
  const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
  const heightJitter = areaH * (PAPER_CONFIG.heightJitterPct / 100);
  const maxOverlap = Math.max(0, Math.min(0.2, PAPER_CONFIG.maxOverlapPct / 100));
  const requiredGap = 1 - maxOverlap;

  const spots: PaperSpot[] = [];
  for (let i = 0; i < requested; i++) {
    let best = { x: pick(xLo, xHi), y: pick(yMin, yMax), score: -Infinity };

    for (let attempt = 0; attempt < 180; attempt++) {
      const x = pick(xLo, xHi);
      const y = clamp(pick(yMin, yMax) + (rand() - 0.5) * heightJitter, yMin, yMax);
      let overlapArea = 0;
      let tooMuchOverlap = 0;
      const nearest = spots.reduce((min, spot) => {
        const dx = Math.abs((x - spot.x) / Math.max(0.001, paperW * scale));
        const dy = Math.abs((y - spot.y) / Math.max(0.001, paperH * scale));
        const overX = Math.max(0, 1 - dx);
        const overY = Math.max(0, 1 - dy);
        overlapArea += overX * overY;

        // If both axes overlap past the tiny configured allowance, this is the
        // kind of stacked-paper overlap we want to avoid unless the board is full.
        tooMuchOverlap += Math.max(0, requiredGap - dx) * Math.max(0, requiredGap - dy);
        return Math.min(min, Math.hypot(dx, dy));
      }, Infinity);
      const score =
        Math.min(nearest, 1.45) -
        tooMuchOverlap * 300 -
        overlapArea * 35 +
        rand() * 0.08;
      if (score > best.score) best = { x, y, score };
    }

    spots.push({
      x: best.x,
      y: best.y,
      z: PAPER_CONFIG.layerZ + i * PAPER_CONFIG.layerZStep,
      rot: (rand() - 0.5) * PAPER_CONFIG.maxTiltRad,
    });
  }

  return { count: requested, scale, spots };
}
const ENVELOPE = "/models/board_envelope.glb";
const PALETTE = "/models/board_palette.glb";
const MUG = "/models/mug_linkedin.glb";
const KEYCHAIN = "/models/keychain_github.glb";
// Normalised in Blender from racoon.glb — see BULLETIN_BOARD_CONFIG.objects.racoons.
const RACCOON = "/models/board_racoon.glb";

/**
 * ---------------------------------------------------------------------------
 * SMOKE - per-spiral tuning for the three plumes above the coffee.
 * ---------------------------------------------------------------------------
 * Entry N drives the model node named Steam_N. Every number is RELATIVE to the
 * cup: the cup model is exactly 1.0 unit tall and 1.11 wide, so 1.0 here means
 * "as authored in Blender" and 0.5 means half that.
 *
 *   width  scales coil radius AND tube thickness (x/z). 1.0 = as authored.
 *   height scales how far it rises (y). The base is pinned to the coffee, so
 *          changing this stretches the plume upward rather than lifting it off.
 *   lift   nudge up (+) or down (-), in cup heights. 0.1 = a tenth of the cup.
 *   x, z   shift across the coffee from where it was authored, in cup heights.
 *          +x is toward the handle, +z is toward the viewer.
 *   spin   radians per second about its own axis. NEGATIVE reads as rising,
 *          positive as sinking. Keep all three different or they visually lock.
 *
 * Headroom before a plume pokes through the cup wall. The coffee now sits just
 * under the brim, where the tapered cup is widest, so the inner radius there is
 * 0.497 and there is more room than when it sat lower:
 *   Steam_0 reaches 0.190 + width*0.211  -> width up to ~1.45
 *   Steam_1 reaches 0.191 + width*0.180  -> width up to ~1.70
 *   Steam_2 reaches 0.238 + width*0.154  -> width up to ~1.68
 * Past those it will clip through the ceramic, so raise `lift` too if you go big.
 */
const {
  papers: PAPER_CONFIG,
  objects: OBJECT_CONFIG,
  smoke: SMOKE_CONFIG,
} = BULLETIN_BOARD_CONFIG;
const SHADOW_CONFIG = OBJECT_CONFIG.shadows;

const GITHUB_URL = "https://github.com/mfkimbell";
const LINKEDIN_URL = "https://www.linkedin.com/in/kimbell151/";
const GALLERY_ENDPOINT = `/api/drawing-submissions?limit=${PAPER_CONFIG.fetchLimit}`;

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("Could not load bulletin drawings.");
    return response.json();
  });

type Point = PaintPoint;
type Stroke = { pts: Point[]; color: string; width: number; erase?: boolean };
type Submission = {
  id: string;
  name: string;
  strokes: Stroke[];
  canvasSize: number;
  canvasHeight: number | null;
  upvotes: number;
  createdAt: string;
};

type GalleryResponse = {
  drawings: Submission[];
  limit: number;
  weekWindowDays: number;
};

type VoteType = "upvote" | "downvote";
type HoverTitleChange = (title: string, active: boolean) => void;

const CONTACT_HOVER_TITLES = {
  email: "Email Mitch",
  sketch: "Sketch an Image",
  github: "GitHub",
  linkedin: "LinkedIn",
  paper: "View a Sketch",
} as const;

const PAPER_PX = 320;
const PAPER_HEIGHT_PX = Math.round(PAPER_PX / A4_PAPER_ASPECT_RATIO);
const PAPER_Y_SCALE =
  1 / A4_PAPER_ASPECT_RATIO / PAPER_CONFIG.modelHeightRatio;

function SoftShadow({
  size,
  inner,
}: {
  size: readonly [number, number];
  inner: React.RefObject<THREE.Mesh | null>;
}) {
  void size;
  void inner;
  return null;
}

type PropShadowConfig = {
  size: readonly [number, number];
  offset: { x: number; y: number };
};

/** Rasterise a submitted drawing onto a paper-shaped canvas. */
function sketchTexture(sub: Submission): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = PAPER_PX;
  c.height = PAPER_HEIGHT_PX;
  const g = c.getContext("2d");
  if (!g) return null;
  fillPaperTexture(g, c.width, c.height, sub.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 17));
  const srcW = sub.canvasSize || 1;
  const srcH = sub.canvasHeight || sub.canvasSize || 1;
  const pad = 16;
  const s = Math.min((c.width - pad * 2) / srcW, (c.height - pad * 2 - 30) / srcH);
  const ox = (c.width - srcW * s) / 2;
  const oy = pad + (c.height - 30 - pad * 2 - srcH * s) / 2;
  for (const st of sub.strokes ?? []) {
    if (!st?.pts?.length) continue;
    drawPaintStroke(
      g,
      {
        ...st,
        width: Math.max(1, (st.width || 3) * s),
        pts: st.pts.map((p) => ({
          x: ox + p.x * s,
          y: oy + p.y * s,
          pressure: p.pressure,
        })),
      },
      { eraseColor: PAPER_COLOR }
    );
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Shared hover behaviour: the object rises and pitches forward slightly.
 *
 * It deliberately does NOT move toward the camera - `hoverLiftZ` is 0 in config.
 * Z travel reads as the object swelling rather than lifting. The small negative
 * `hoverTiltX` adds just enough forward tip to make the hover feel physical.
 *
 * Annotated as `number` rather than inferred: the config is `as const`, so an
 * inferred default narrows to a literal and rejects caller overrides.
 */
function useHoverLift(
  restTilt: number,
  lift: number = BULLETIN_BOARD_CONFIG.objects.hoverLiftZ,
  tilt: number = BULLETIN_BOARD_CONFIG.objects.hoverTiltX,
  hideDelayMs = 0,
  rise: number = BULLETIN_BOARD_CONFIG.objects.hoverRiseY,
  straighten: number = BULLETIN_BOARD_CONFIG.objects.hoverStraighten
) {
  const grp = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hovered, setHoveredState] = useState(false);

  const setHovered = useCallback(
    (next: boolean) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }

      if (next || hideDelayMs <= 0) {
        setHoveredState(next);
        document.body.style.cursor = next ? "pointer" : "";
        return;
      }

      hideTimer.current = setTimeout(() => {
        setHoveredState(false);
        document.body.style.cursor = "";
        hideTimer.current = null;
      }, hideDelayMs);
    },
    [hideDelayMs]
  );

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      document.body.style.cursor = "";
    };
  }, []);
  useFrame((_, delta) => {
    const g = grp.current;
    if (!g) return;
    const k = 1 - Math.pow(0.0002, Math.min(delta, 0.05));
    g.position.z += ((hovered ? lift : 0) - g.position.z) * k;
    g.position.y += ((hovered ? rise : 0) - g.position.y) * k;
    g.rotation.x += ((hovered ? tilt : 0) - g.rotation.x) * k;
    g.rotation.z += ((hovered ? restTilt * straighten : restTilt) - g.rotation.z) * k;
    if (shadow.current) {
      const m = shadow.current.material as THREE.MeshBasicMaterial;
      m.opacity += ((hovered ? 0.95 : 0.5) - m.opacity) * k;
      const s = hovered ? 1.18 : 1.0;
      shadow.current.scale.x += (s - shadow.current.scale.x) * k;
      shadow.current.scale.y = shadow.current.scale.x;
    }
  });
  const bind = {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => {
      setHovered(false);
    },
  };
  return { grp, shadow, hovered, setHovered, bind };
}

function Prop3D({
  url,
  position,
  scale,
  restTilt,
  shadow: shadowConfig,
  onClick,
  bob,
  halfH,
  hiddenNodePrefixes,
  recenterVisible,
  hoverTitle,
  onHoverTitleChange,
}: {
  url: string;
  position: [number, number, number];
  scale: number;
  restTilt: { x: number; y: number; z: number };
  shadow: PropShadowConfig;
  onClick?: () => void;
  bob?: number;
  /** half the model's own height, so it can sit ON the ledge rather than centred */
  halfH: number;
  hiddenNodePrefixes?: readonly string[];
  recenterVisible?: boolean;
  hoverTitle?: string;
  onHoverTitleChange?: HoverTitleChange;
}) {
  const { scene } = useGLTF(url) as unknown as { scene: THREE.Group };
  const obj = useMemo(() => {
    const cloned = scene.clone(true);

    if (hiddenNodePrefixes?.length) {
      cloned.traverse((child) => {
        if (hiddenNodePrefixes.some((prefix) => child.name.startsWith(prefix))) {
          child.visible = false;
        }
      });
    }

    if (recenterVisible) {
      const box = new THREE.Box3();
      const meshBox = new THREE.Box3();
      const center = new THREE.Vector3();
      cloned.updateMatrixWorld(true);
      cloned.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
        mesh.geometry.computeBoundingBox();
        if (!mesh.geometry.boundingBox) return;
        meshBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
        box.union(meshBox);
      });

      if (!box.isEmpty()) {
        box.getCenter(center);
        cloned.position.x -= center.x;
        cloned.position.y -= box.min.y;
        cloned.position.z -= center.z;
      }
    }

    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Steam is translucent; casting from it would only smear grey over the cup.
      mesh.castShadow =
        SHADOW_CONFIG.enabled && !child.name.startsWith("Steam");
    });

    return cloned;
  }, [hiddenNodePrefixes, recenterVisible, scene]);
  const { grp, hovered, bind } = useHoverLift(restTilt.z);

  useEffect(() => {
    if (!hoverTitle || !onHoverTitleChange) return;
    onHoverTitleChange(hoverTitle, hovered);
    return () => {
      if (hovered) onHoverTitleChange(hoverTitle, false);
    };
  }, [hoverTitle, hovered, onHoverTitleChange]);
  const inner = useRef<THREE.Group>(null);
  const lastClickAt = useRef(0);
  /**
   * Each node named Steam_N is a helix built around its OWN local origin and
   * displaced by a node translation, so it spins on the spot like a top - it
   * does NOT travel around the cup. A rotating helix makes its coils appear to
   * climb, which is what reads as rising smoke: no vertical motion and no
   * opacity fade. Sizing and speed come from BULLETIN_BOARD_CONFIG.
   */
  const steam = useMemo(() => {
    const out: { node: THREE.Object3D; speed: number }[] = [];
    obj.traverse((child) => {
      if (!child.name.startsWith("Steam")) return;
      const mesh = child as THREE.Mesh;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mat.transparent = true;
      mat.opacity = SMOKE_CONFIG.opacity;
      mat.depthWrite = false;
      mat.needsUpdate = true;
      mesh.material = mat;
      const n = Number(child.name.match(/Steam_(\d+)/)?.[1] ?? out.length);
      const cfg = SMOKE_CONFIG.plumes[n] ?? SMOKE_CONFIG.fallback;
      /**
       * The helix sits above its own origin (its geometry starts at the coffee
       * surface, not at y = 0), so scaling y would drag the base up off the
       * drink. Measure that base and push the node back down by the amount the
       * scale moved it, which pins the plume to the coffee however tall it gets.
       */
      mesh.geometry.computeBoundingBox();
      const baseY = mesh.geometry.boundingBox?.min.y ?? 0;
      child.scale.set(cfg.width, cfg.height, cfg.width);
      child.position.set(
        child.position.x + cfg.x,
        child.position.y + baseY * (1 - cfg.height) + cfg.lift,
        child.position.z + cfg.z
      );
      out.push({ node: child, speed: cfg.spin });
    });
    return out;
  }, [obj]);
  useFrame((state) => {
    // Envelopes hang, so give them a slow sway; the palette just sits.
    if (inner.current && bob) {
      inner.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.9) * bob;
    }
    for (const s of steam) {
      s.node.rotation.y = state.clock.elapsedTime * s.speed;
    }
  });
  const seated: [number, number, number] = [
    position[0],
    position[1] + halfH * scale,
    position[2],
  ];
  const triggerClick = (event: { stopPropagation: () => void }) => {
    if (!onClick) return;
    event.stopPropagation();

    const now = performance.now();
    if (now - lastClickAt.current < 250) return;
    lastClickAt.current = now;
    onClick();
  };

  return (
    <group position={seated}>
      <group
        ref={grp}
        rotation={[0, 0, restTilt.z]}
        {...(onClick ? bind : {})}
        onClick={triggerClick}
      >
        <group rotation={[restTilt.x, restTilt.y, 0]}>
          {onClick && (
            <group scale={scale}>
              <mesh position={[0, 0, 0.18]}>
                <planeGeometry args={[shadowConfig.size[0] * 1.12, shadowConfig.size[1] * 1.12]} />
                <meshBasicMaterial
                  transparent
                  opacity={0}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  toneMapped={false}
                />
              </mesh>
            </group>
          )}
          <group ref={inner} scale={scale}>
            <primitive object={obj} />
          </group>
        </group>
      </group>
    </group>
  );
}

function SketchPaper({
  sub,
  position,
  scale,
  restTilt,
  onVote,
  isVoting,
  onHoverTitleChange,
}: {
  sub: Submission;
  position: [number, number, number];
  scale: number;
  restTilt: number;
  onVote: (id: string, type: VoteType) => void;
  isVoting: boolean;
  onHoverTitleChange?: HoverTitleChange;
}) {
  const { scene } = useGLTF(PAPER) as unknown as { scene: THREE.Group };
  const map = useMemo(() => sketchTexture(sub), [sub]);
  const parts = useMemo(() => {
    const p = (scene.getObjectByName("Paper") as THREE.Mesh | undefined)?.clone();
    if (p) {
      const mat = (p.material as THREE.MeshStandardMaterial).clone();
      if (map) mat.map = map;
      mat.needsUpdate = true;
      mat.roughness = 0.93;
      mat.metalness = 0;
      p.material = mat;
    }
    return { p };
  }, [scene, map]);
  const { grp, shadow, hovered, setHovered, bind } = useHoverLift(restTilt, undefined, undefined, 220);
  const [controlsHovered, setControlsHovered] = useState(false);
  const showControls = hovered || controlsHovered;

  useEffect(() => {
    if (!onHoverTitleChange) return;
    onHoverTitleChange(CONTACT_HOVER_TITLES.paper, showControls);
    return () => {
      if (showControls) onHoverTitleChange(CONTACT_HOVER_TITLES.paper, false);
    };
  }, [onHoverTitleChange, showControls]);

  const paperScale: [number, number, number] = [scale, scale * PAPER_Y_SCALE, scale];
  return (
    <group position={position}>
      <group scale={paperScale}>
        <SoftShadow size={[1.04, 1.34 * PAPER_Y_SCALE]} inner={shadow} />
      </group>
      <group ref={grp} scale={paperScale} rotation={[0, 0, restTilt]} {...bind}>
        {parts.p && <primitive object={parts.p} />}
        {showControls && (
          <Html
            transform
            position={[0, -0.43, 0.1]}
            distanceFactor={1.45}
            zIndexRange={[90, 40]}
            style={{ pointerEvents: "auto" }}
          >
            <div
              className="flex w-20 items-center justify-between text-amber-950"
              onPointerEnter={() => {
                setControlsHovered(true);
                setHovered(true);
              }}
              onPointerLeave={() => {
                setControlsHovered(false);
                setHovered(false);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                disabled={isVoting}
                className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-amber-950/20 bg-[#fff4cf]/95 px-1.5 py-1 text-[11px] font-black shadow-md backdrop-blur-sm transition hover:bg-white disabled:opacity-45"
                title="Upvote drawing"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onVote(sub.id, "upvote");
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2.4} />
                {sub.upvotes ?? 0}
              </button>
              <button
                type="button"
                disabled={isVoting}
                className="pointer-events-auto inline-flex items-center rounded-full border border-red-900/20 bg-[#fff4cf]/95 p-1 text-red-800 shadow-md backdrop-blur-sm transition hover:bg-red-50 disabled:opacity-45"
                title="Delete drawing"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onVote(sub.id, "downvote");
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.4} />
              </button>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

function Scene({
  subs,
  mailto,
  onSketch,
  onVote,
  votingId,
  onHoverTitleChange,
}: {
  subs: Submission[];
  mailto: string;
  onSketch: () => void;
  onVote: (id: string, type: VoteType) => void;
  votingId: string | null;
  onHoverTitleChange?: HoverTitleChange;
}) {
  // Accepted for API symmetry with the outer BulletinBoard component but not
  // forwarded to any child inside Scene yet - Bulletin and ContactPaper each
  // fire their own onHoverTitleChange from within. Referenced here to satisfy
  // no-unused-vars without deleting the prop from the public signature.
  void onHoverTitleChange;
  const { viewport } = useThree();
  const halfW = viewport.width / 2;
  const halfH = viewport.height / 2;

  const openMail = useCallback(() => {
    window.location.href = mailto;
  }, [mailto]);

  const paperBounds = PAPER_CONFIG.bounds;
  const paperLeft = -halfW + viewport.width * (paperBounds.leftPct / 100);
  const paperRight = halfW - viewport.width * (paperBounds.rightPct / 100);
  const paperTop = halfH - viewport.height * (paperBounds.topPct / 100);
  const paperBottom = -halfH + viewport.height * (paperBounds.bottomPct / 100);
  const paperCenterX = (paperLeft + paperRight) / 2;
  const paperHalfW = (paperRight - paperLeft) / 2;

  // Props rest on the bottom shelf. Keep their vertical placement and base
  // sizing tied to the full viewport as before; the frame inset is only for
  // fitting the pinned drawings into the open board area.
  const floorY = -halfH + OBJECT_CONFIG.shelfYFromViewportBottom;
  const propScale = Math.min(
    OBJECT_CONFIG.propScaleMax,
    halfW * OBJECT_CONFIG.propScaleWidthFactor
  );
  const paperYLo = paperBottom;
  const paperYHi = paperTop;

  /**
   * halfH is half of each model's own height in its normalised space, which is
   * what lets Prop3D seat it on the shelf. envelope 0.65 tall, palette 1.02,
   * mug 1.0 - all measured after normalisation in Blender. The GitHub keychain
   * is NOT here: it lies on its side on the shelf and is placed separately.
   */
  const SHELF = useMemo(
    () => [
      {
        key: "envelope",
        url: ENVELOPE,
        href: undefined as string | undefined,
        ...OBJECT_CONFIG.envelope,
      },
      {
        key: "palette",
        url: PALETTE,
        href: undefined as string | undefined,
        ...OBJECT_CONFIG.palette,
      },
      {
        key: "mug",
        url: MUG,
        href: LINKEDIN_URL,
        ...OBJECT_CONFIG.mug,
      },
    ],
    []
  );
  const paperLayout = useMemo(
    () => layoutPapers(subs.length, paperHalfW, paperYLo, paperYHi),
    [subs.length, paperHalfW, paperYLo, paperYHi]
  );
  const visibleSubs = subs.slice(0, paperLayout.count);

  return (
    <>
      <ambientLight intensity={1.05} />
      <directionalLight position={[1.4, 2.6, 3.6]} intensity={1.55} color="#fff1d2" />

      {SHADOW_CONFIG.enabled && (
        /* Shadow-only caster: intensity 0, so it changes no shading at all, but
           three.js still builds its shadow map and the catchers below pick it up.
           Only this one casts - a second caster would give every prop two
           shadows, which reads as fake immediately. */
        <directionalLight
          position={[
            SHADOW_CONFIG.light.x,
            SHADOW_CONFIG.light.y,
            SHADOW_CONFIG.light.z,
          ]}
          intensity={0}
          castShadow
          shadow-mapSize={[SHADOW_CONFIG.mapSize, SHADOW_CONFIG.mapSize]}
          shadow-bias={SHADOW_CONFIG.bias}
          shadow-normalBias={SHADOW_CONFIG.normalBias}
          shadow-camera-near={SHADOW_CONFIG.cameraNear}
          shadow-camera-far={SHADOW_CONFIG.cameraFar}
          shadow-camera-left={-SHADOW_CONFIG.cameraExtent}
          shadow-camera-right={SHADOW_CONFIG.cameraExtent}
          shadow-camera-top={SHADOW_CONFIG.cameraExtent}
          shadow-camera-bottom={-SHADOW_CONFIG.cameraExtent}
        />
      )}
      <directionalLight position={[-2.4, -0.4, 2.2]} intensity={0.45} color="#b9d4f0" />


      {SHADOW_CONFIG.enabled && (
        /* Single contact-shadow catcher. ShadowMaterial renders ONLY what is
           shadowed, so this plane stays invisible over the board art except
           where a prop blocks the caster. The old upright board-face catcher
           was removed because it created a second, misaligned shadow. */
        <mesh
          receiveShadow
          renderOrder={4}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            0,
            floorY + SHADOW_CONFIG.shelfYLift,
            OBJECT_CONFIG.layerZ + SHADOW_CONFIG.shelfZOffset,
          ]}
        >
          <planeGeometry
            args={[halfW * SHADOW_CONFIG.shelfWidthFactor, SHADOW_CONFIG.shelfDepth]}
          />
          <shadowMaterial transparent depthWrite={false} opacity={SHADOW_CONFIG.shelfOpacity} />
        </mesh>
      )}
      {visibleSubs.map((sub, i) => {
        const sp = paperLayout.spots[i];
        if (!sp) return null;
        return (
          <SketchPaper
            key={sub.id}
            sub={sub}
            position={[paperCenterX + sp.x, sp.y, sp.z]}
            scale={paperLayout.scale}
            restTilt={sp.rot}
            onVote={onVote}
            isVoting={votingId === sub.id}
          />
        );
      })}

      {/* Props stand on the shelf along the bottom of the board. Each is
          offset up by half its OWN height (halfH) so it rests on the shelf line
          instead of being centred on it - the artwork behind supplies the shelf. */}
      {SHELF.map((item, i) => {
        const span = halfW * OBJECT_CONFIG.shelfSpanFactor;
        const x = -span / 2 + (i * span) / (SHELF.length - 1);
        return (
          <Prop3D
            key={item.key}
            url={item.url}
            position={[
              x + item.offset.x,
              floorY + item.offset.y,
              OBJECT_CONFIG.layerZ + item.offset.z,
            ]}
            scale={propScale * item.scale}
            restTilt={item.tilt}
            shadow={item.shadow}
            halfH={item.halfH}
            bob={item.bob}
            onClick={
              item.key === "envelope"
                ? openMail
                : item.key === "palette"
                ? onSketch
                : () => window.open(item.href as string, "_blank", "noopener,noreferrer")
            }
          />
        );
      })}

      {/* The GitHub mark uses the keychain GLB with the chain/ring nodes hidden,
          then recenters the visible logo so it stands on its bottom edge. */}
      <Prop3D
        url={KEYCHAIN}
        position={[
          -halfW * 0.06 + OBJECT_CONFIG.keychain.offset.x,
          floorY + OBJECT_CONFIG.keychain.offset.y,
          OBJECT_CONFIG.frontLayerZ + OBJECT_CONFIG.keychain.offset.z,
        ]}
        scale={propScale * OBJECT_CONFIG.keychain.scale}
        restTilt={OBJECT_CONFIG.keychain.tilt}
        shadow={OBJECT_CONFIG.keychain.shadow}
        halfH={OBJECT_CONFIG.keychain.halfH}
        hiddenNodePrefixes={OBJECT_CONFIG.keychain.hiddenNodePrefixes}
        recenterVisible={OBJECT_CONFIG.keychain.recenterVisible}
        onClick={() =>
          window.open(GITHUB_URL, "_blank", "noopener,noreferrer")
        }
      />


      {/* Raccoons along the TOP beam of the board. Their feet sit on the beam's
          top edge, measured off the contactme.png artwork rather than guessed —
          see racoons.beamTopFrac. They are sized against the BEAM rather than
          propScale, which is capped and would let them drift relative to it.
          Passing no onClick is what keeps them
          decorative: Prop3D only binds pointer handlers when a handler exists,
          so they never take a hover lift or a pointer cursor. */}
      {OBJECT_CONFIG.racoons.spots.map((sp, i) => (
        <Prop3D
          key={`racoon-${i}`}
          url={RACCOON}
          position={[
            sp.x * halfW,
            halfH - viewport.height * OBJECT_CONFIG.racoons.beamTopFrac,
            OBJECT_CONFIG.frontLayerZ,
          ]}
          scale={
            viewport.height *
            (OBJECT_CONFIG.racoons.beamBottomFrac - OBJECT_CONFIG.racoons.beamTopFrac) *
            OBJECT_CONFIG.racoons.heightVsBeam *
            sp.scale
          }
          restTilt={{ x: sp.tilt.x, y: sp.faceLeft ? Math.PI : 0, z: sp.tilt.z }}
          shadow={OBJECT_CONFIG.racoons.shadow}
          halfH={OBJECT_CONFIG.racoons.halfH}
          bob={sp.bob}
        />
      ))}

    </>
  );
}

export default function BulletinBoard({
  mailto,
  onSketch,
  onHoverTitleChange,
  className = "",
}: {
  mailto: string;
  onSketch: () => void;
  onHoverTitleChange?: HoverTitleChange;
  className?: string;
}) {
  const { data, mutate } = useSWR<GalleryResponse>(GALLERY_ENDPOINT, fetcher, {
    refreshInterval: 5_000,
  });
  const [votingId, setVotingId] = useState<string | null>(null);
  const subs = data?.drawings ?? [];

  const vote = useCallback(
    async (id: string, type: VoteType) => {
      if (votingId) return;

      setVotingId(id);

      if (type === "upvote") {
        void mutate(
          (current) =>
            current
              ? {
                  ...current,
                  drawings: current.drawings.map((drawing) =>
                    drawing.id === id
                      ? { ...drawing, upvotes: (drawing.upvotes ?? 0) + 1 }
                      : drawing
                  ),
                }
              : current,
          false
        );
      } else {
        void mutate(
          (current) =>
            current
              ? {
                  ...current,
                  drawings: current.drawings.filter((drawing) => drawing.id !== id),
                }
              : current,
          false
        );
        void mutateGlobal("/api/drawings");
      }

      try {
        const response = await fetch(`/api/drawing-submissions/${id}/${type}`, {
          method: "POST",
        });
        if (!response.ok) throw new Error("Vote failed.");
        await mutate();
      } catch {
        await mutate();
      } finally {
        setVotingId(null);
      }
    },
    [mutate, votingId]
  );

  return (
    <div className={"absolute inset-0 " + className}>
      <Canvas
        shadows={SHADOW_CONFIG.enabled}
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
      >
        <Matte />
        <Scene
          subs={subs}
          mailto={mailto}
          onSketch={onSketch}
          onVote={vote}
          votingId={votingId}
          onHoverTitleChange={onHoverTitleChange}
        />
      </Canvas>
      <div className="sr-only">
        <a href={mailto}>Email Mitch</a>
        <button type="button" onClick={onSketch}>
          Leave a sketch
        </button>
        <a href="https://github.com/mfkimbell">GitHub</a>
        <a href="https://www.linkedin.com/in/kimbell151/">LinkedIn</a>
      </div>
    </div>
  );
}

useGLTF.preload(PAPER);
useGLTF.preload(ENVELOPE);
useGLTF.preload(PALETTE);
useGLTF.preload(MUG);
useGLTF.preload(KEYCHAIN);
useGLTF.preload(RACCOON);
