// components/ToucanGLB.tsx
//
// One perched toucan. Four layers drive it, in this order every frame:
//
//   1. BODY IDLE   a looping clip on Body/Chest/Tail/Wings/Feet. Always on.
//   2. TALK        beak + chest, faded in only while the agent is producing
//                  audio. Silent birds do not move their beaks.
//   3. ONE-SHOTS   wing settle / rouse / puff / foot shift, fired at random
//                  gaps. Two of them (preen, yawn) own the head, so procedural
//                  tracking yields to those for their duration.
//   4. HEAD        procedural: mouse tracking plus rotational saccades. Runs
//                  last and writes the Head bone directly.
//
// Three structural notes, all of which have bitten this component before:
//
//   * The beak is long and only reads side-on, so the bird is presented turned
//     away from the camera (see FACING in src/config/toucan.ts). Head-on, the
//     beak is foreshortened to nothing and the open jaw looks broken.
//   * The bones carry real rest rotations. Head tracking composes a world-space
//     swing ON TOP of rest rather than assigning euler angles, which would wipe
//     the rest out and skew the two beak halves apart.
//   * useGLTF caches and SHARES its scene. We mutate bones every frame, so the
//     scene is cloned per bird and "rest" is read from the untouched cached
//     original — reading it from the clone compounds on every hot reload.
//
"use client";

import React, { useEffect, useMemo, useRef, RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import {
  toucanConfig,
  toucan2Config,
  CLIP_BONES,
  CLIP_IDLE_BODY_QUIET,
  CLIP_IDLE_BODY_FALLBACK,
  CLIP_POSITION_BONES,
  CLIP_TALK_SOFT,
  CLIP_TALK_EXCITED,
  CLIP_FLY_LOOP,
  CLIP_LAND_APPROACH,
  CLIP_LAND_SETTLE,
  BODY_TRAVEL_CLIPS,
  DEBUG_FORCE_ONE_SHOT,
  DEBUG_FORCE_INTERVAL,
  HEAD_OWNING_CLIPS,
  IDLE_DUCK,
  INTENTIONAL_DROPS,
  MORPHS,
  ONE_SHOTS,
  PUFF_CLIPS,
  type BirdSettings,
  type OneShotClip,
} from "@/config/toucan";
import { filterClips, auditClips } from "@/lib/toucanClips";

const deg = THREE.MathUtils.degToRad;

/**
 * Live voice state, passed as a ref rather than as props on purpose.
 *
 * useToucanVoiceAgent calls setState on the audio level every animation frame.
 * Threading that down as a prop would re-render the whole canvas subtree 60
 * times a second; a ref keeps the identity stable so nothing re-renders and
 * useFrame simply reads the current value.
 */
export type VoiceState = {
  isAgentSpeaking: boolean;
  agentAudioLevel: number;
};

interface ToucanGLBProps {
  containerRef: RefObject<HTMLDivElement>;
  /** which bird to render — defaults to bird 1. See src/config/toucan.ts */
  config?: BirdSettings;
  voiceRef?: RefObject<VoiceState>;
}

/** Weighted pick from the one-shot table. */
function pickOneShot(weights: Readonly<Record<string, number>>): OneShotClip | null {
  const entries = ONE_SHOTS.map((n) => [n, weights[n] ?? 0] as const).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [name, w] of entries) {
    r -= w;
    if (r <= 0) return name;
  }
  return entries[entries.length - 1][0];
}

export default function ToucanGLB({
  containerRef,
  config = toucanConfig,
  voiceRef,
}: ToucanGLBProps) {
  const CFG = config;
  const gltf = useGLTF(CFG.MODEL) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  const scene = useMemo(() => cloneSkeleton(gltf.scene) as THREE.Group, [gltf.scene]);

  // Rest pose read from the pristine cached scene, never from our clone.
  const restQuat = useMemo(() => {
    const h = gltf.scene.getObjectByName("Head");
    return h ? h.quaternion.clone() : new THREE.Quaternion();
  }, [gltf.scene]);

  // Strip every clip down to the bones it is allowed to touch. Blender
  // force-sampled the export, so without this the flat Head/beak tracks riding
  // along in every clip would pin those bones and silently kill both mouse
  // tracking and the talk layer.
  const clips = useMemo(
    () => filterClips(gltf.animations, CLIP_BONES, CLIP_POSITION_BONES),
    [gltf.animations]
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    for (const p of auditClips(
      gltf.animations,
      CLIP_BONES,
      INTENTIONAL_DROPS,
      CLIP_POSITION_BONES
    )) {
      console.warn("[Toucan] clip audit:", p);
    }
  }, [gltf.animations]);

  const { actions, mixer } = useAnimations(clips, scene);

  // The quiet clip is the intended base layer; the enhanced one is the older,
  // rockier version kept only so a rolled-back asset still animates.
  const idleAction = useMemo(
    () => actions[CLIP_IDLE_BODY_QUIET] ?? actions[CLIP_IDLE_BODY_FALLBACK] ?? null,
    [actions]
  );

  const head = useRef<THREE.Object3D | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const eased = useRef({ yaw: 0, pitch: 0 });
  const lastMouse = useRef({ x: 0, y: 0 });

  // parent world rotation, captured once (Body's own idle motion is tiny)
  const parentQ = useRef(new THREE.Quaternion());
  const parentInv = useRef(new THREE.Quaternion());
  const primed = useRef(false);

  /* ── morph targets, driven procedurally ─────────────────────────────────
     The baked morph tracks were filtered out: glTF interleaves all three
     weights into ONE track, so any two overlapping clips would average away
     each other's morphs. Driving them here also lets throat_pulse follow the
     real audio envelope instead of a guessed curve. */
  const morphMesh = useRef<THREE.Mesh | null>(null);
  const morphIdx = useRef<{ puff: number; breath: number; throat: number } | null>(null);

  useEffect(() => {
    // Collected rather than assigned in the traverse callback: TypeScript can't
    // narrow a `let` written from inside a closure, and would type it `never`.
    //
    // The asset is now THREE meshes (body + two wing appendages), so "first
    // mesh with a morphTargetDictionary" is no longer safe — pick the one that
    // actually carries the morphs we drive, and fall back to first-found.
    const withMorphs: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.morphTargetDictionary) withMorphs.push(m);
    });
    const found =
      withMorphs.find((m) => m.morphTargetDictionary?.[MORPHS.CHEST_BREATH] !== undefined) ??
      withMorphs[0] ??
      null;
    morphMesh.current = found;
    if (found) {
      const dict = found.morphTargetDictionary ?? {};
      morphIdx.current = {
        puff: dict[MORPHS.BODY_PUFF] ?? -1,
        breath: dict[MORPHS.CHEST_BREATH] ?? -1,
        throat: dict[MORPHS.THROAT_PULSE] ?? -1,
      };
    } else {
      morphIdx.current = null;
      if (process.env.NODE_ENV !== "production") {
        console.warn("[Toucan] no morph targets found — is this the rerigged GLB?");
      }
    }
  }, [scene]);

  /* ── grab the head bone and force it to the true rest pose ── */
  useEffect(() => {
    const h = scene.getObjectByName("Head");
    if (!h) {
      console.warn("[Toucan] Head bone not found");
      return;
    }
    head.current = h;
    h.quaternion.copy(restQuat);
    eased.current = { yaw: 0, pitch: 0 };
    primed.current = false;
  }, [scene, restQuat]);

  /* ── layer 1: body idle, always running ── */
  useEffect(() => {
    if (!idleAction) {
      console.warn(
        `[Toucan] no body idle clip found ("${CLIP_IDLE_BODY_QUIET}" or "${CLIP_IDLE_BODY_FALLBACK}")`
      );
      return;
    }
    if (process.env.NODE_ENV !== "production" && !actions[CLIP_IDLE_BODY_QUIET]) {
      console.warn(`[Toucan] falling back to "${CLIP_IDLE_BODY_FALLBACK}" — it sways more`);
    }
    idleAction.reset().setLoop(THREE.LoopRepeat, Infinity);
    idleAction.setEffectiveWeight(1);
    // random phase, so two birds on one page never sway in lockstep
    idleAction.time = Math.random() * idleAction.getClip().duration;
    idleAction.play();
    return () => void idleAction.stop();
  }, [actions, idleAction]);

  /* ── layer 2: talk.
     Both clips are kept PLAYING at weight 0 rather than stopped. A stopped
     action leaves its bones frozen wherever the last frame put them; an action
     at zero weight lets the mixer restore the bind pose, which is what actually
     closes the beak when the agent stops talking. ── */
  useEffect(() => {
    if (!CFG.TALK.ENABLED || !CFG.BEAK.ENABLED) return;
    const list = [actions[CLIP_TALK_SOFT], actions[CLIP_TALK_EXCITED]];
    for (const a of list) {
      if (!a) continue;
      a.reset().setLoop(THREE.LoopRepeat, Infinity);
      a.setEffectiveWeight(0);
      a.timeScale = CFG.BEAK.SPEED;
      a.play();
    }
    return () => {
      for (const a of list) a?.stop();
    };
  }, [actions, CFG]);

  /* ── pointer ── */
  useEffect(() => {
    if (!CFG.LOOK.ENABLED) return;
    const { TRAVEL_X, TRAVEL_Y, HEAD_HEIGHT_FRAC, FLIP_X, FLIP_Y } = CFG.LOOK;

    const read = (mx: number, my: number) => {
      lastMouse.current = { x: mx, y: my };
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // measure from where the head actually sits, not the canvas centre
      const hx = r.left + r.width / 2;
      const hy = r.top + r.height * HEAD_HEIGHT_FRAC;
      const nx = THREE.MathUtils.clamp((mx - hx) / TRAVEL_X, -1, 1);
      const ny = THREE.MathUtils.clamp((my - hy) / TRAVEL_Y, -1, 1);
      pointer.current.x = FLIP_X ? -nx : nx;
      pointer.current.y = FLIP_Y ? -ny : ny;
    };

    const onMove = (ev: MouseEvent) => read(ev.clientX, ev.clientY);
    const onReflow = () => read(lastMouse.current.x, lastMouse.current.y);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("scroll", onReflow);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onReflow);
      window.removeEventListener("resize", onReflow);
    };
  }, [containerRef, CFG]);

  // scratch, reused each frame
  const eu = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);
  const swing = useMemo(() => new THREE.Quaternion(), []);
  const result = useMemo(() => new THREE.Quaternion(), []);

  /* ── idle saccade state ──
     A perched bird's idle is rotational: hold dead still, then snap the head to
     a new angle in a couple of frames, then hold again. Holds are randomised
     (uniform intervals read as mechanical instantly); the snap itself is a
     fixed, very short, LINEAR interpolation — easing it is what makes CG birds
     look wrong. This sits OUTSIDE the pointer easing below, otherwise the
     smoothing would round the snap off into a drift. */
  const sac = useRef({
    yaw: 0,
    pitch: 0,
    fromYaw: 0,
    fromPitch: 0,
    toYaw: 0,
    toPitch: 0,
    snapStart: -1,
    holdUntil: -1,
  });

  /* ── talk / one-shot / morph runtime state ── */
  const talk = useRef({ level: 0, weight: 0, excited: false });
  const shot = useRef({
    action: null as THREE.AnimationAction | null,
    name: "",
    until: -1,
    nextAt: -1,
    forced: false,
  });
  const headYield = useRef(0); // 0 = we own the head, 1 = a clip owns it
  const puffEnv = useRef({ start: -1, dur: 0, strength: 0.85 });
  const idleDuck = useRef(1); // body idle weight, ducked under one-shots

  /* ── arrival flight ──────────────────────────────────────────────────────
     The three clips animate the bird IN PLACE. All world travel is this
     group, moved from CFG.ENTRANCE.FROM to the origin, so the flight path
     lives here and the GLB stays reusable at any perch position. */
  const flyGroup = useRef<THREE.Group>(null);
  const entrance = useRef({
    phase: "wait" as "wait" | "fly" | "approach" | "settle" | "done",
    t0: -1,
    flyTime: 0, // FLY_TIME rounded to whole wingbeats; see below
    action: null as THREE.AnimationAction | null,
  });
  // Deliberately NOT gated on the clip existing: useAnimations populates
  // `actions` in an effect, so on the first render it is empty. Gating here
  // would leave the bird visible on the perch for a frame before it teleported
  // out to the start of the flight. A missing clip is handled in the machine.
  const EN = CFG.ENTRANCE;
  const entranceOn = Boolean(EN?.ENABLED);
  const fromVec = useMemo(() => new THREE.Vector3(...(EN?.FROM ?? [0, 0, 0])), [EN]);

  // Start hidden at the far end of the flight, so frame one never shows the
  // bird sitting on the perch before it flies in.
  useEffect(() => {
    if (!entranceOn || !flyGroup.current) return;
    flyGroup.current.position.copy(fromVec);
    flyGroup.current.visible = false;
  }, [entranceOn, fromVec]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const I = CFG.IDLE;
    const S = sac.current;
    const voice = voiceRef?.current;

    /* ── arrival sequence ──
       Runs once, in a fixed order. Poses match exactly at every seam (verified
       in Blender at 0.000000 difference), so the clips hard-switch rather than
       cross-fade — a blend would round off the landing contact. */
    const E = entrance.current;
    if (EN && entranceOn && E.phase !== "done") {
      const g = flyGroup.current;
      if (E.t0 < 0) E.t0 = t + EN.DELAY;
      const el = t - E.t0;
      const play = (name: string, loop: boolean) => {
        const a = actions[name];
        if (!a) return null;
        E.action?.stop();
        a.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        a.clampWhenFinished = true;
        a.setEffectiveWeight(1).play();
        return a;
      };
      // Set by land(). A plain flag rather than re-reading E.phase, because the
      // enclosing `E.phase !== "done"` check narrows the type and the compiler
      // can't see the write happening inside this closure.
      let landedThisFrame = false;
      const land = () => {
        E.phase = "done";
        E.action = null;
        landedThisFrame = true;
        if (g) {
          g.visible = true;
          g.position.set(0, 0, 0);
        }
      };
      const appDur = actions[CLIP_LAND_APPROACH]?.getClip().duration ?? 0.833;
      const setDur = actions[CLIP_LAND_SETTLE]?.getClip().duration ?? 1.333;

      /* The seam from the fly loop into the approach was authored to match to
         0.000000 — but only at the loop's OWN boundary. The loop is 0.625s, so
         a literal FLY_TIME of 1.5 cuts it at 2.4 wingbeats and the hard switch
         lands mid-stroke, snapping the wings. Round to whole wingbeats and the
         seam is exact again. Costs a few hundred ms of flight; buys a clean cut. */
      const flyDur = actions[CLIP_FLY_LOOP]?.getClip().duration ?? 0.625;
      if (E.flyTime <= 0) {
        E.flyTime = Math.max(1, Math.round(EN.FLY_TIME / flyDur)) * flyDur;
      }
      const flyTime = E.flyTime;

      if (E.phase === "wait" && el >= 0) {
        if (g) g.visible = true;
        E.action = play(CLIP_FLY_LOOP, true);
        // Clip missing from the GLB: land immediately rather than strand an
        // invisible bird off-camera forever.
        if (!E.action) land();
        else E.phase = "fly";
      } else if (E.phase === "fly" && el >= flyTime) {
        E.action = play(CLIP_LAND_APPROACH, false);
        E.phase = "approach";
      } else if (E.phase === "approach" && el >= flyTime + appDur) {
        E.action = play(CLIP_LAND_SETTLE, false);
        E.phase = "settle";
      } else if (E.phase === "settle" && el >= flyTime + appDur + setDur) {
        E.action?.fadeOut(0.2);
        land();
      }

      if (g && !landedThisFrame) {
        // The old one-piece ease-out slid all the way to the perch before the
        // settle clip began, so the "landing" read as a parked bird bobbing.
        // Split the path: cruise high, brake to a just-above-branch pre-contact
        // point, then finish the last drop during the first frames of settle.
        const side = fromVec.x < 0 ? -1 : 1;
        const preApproach = new THREE.Vector3(
          side * 1.45,
          Math.max(0.62, Math.min(1.05, Math.abs(fromVec.y) * 0.36)),
          fromVec.z * 0.24
        );
        const preContact = new THREE.Vector3(
          side * 0.2,
          0.16,
          fromVec.z === 0 ? 0 : Math.sign(fromVec.z) * 0.05
        );
        const final = new THREE.Vector3(0, 0, 0);
        const easeInOut = (x: number) => x * x * (3 - 2 * x);
        const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
        const easeInQuad = (x: number) => x * x;
        const settleStart = flyTime + appDur;
        const contactDur = Math.min(0.16, Math.max(0.1, setDur * 0.12));

        if (el <= flyTime) {
          const k = THREE.MathUtils.clamp(el / Math.max(flyTime, 1e-3), 0, 1);
          g.position.copy(fromVec).lerp(preApproach, easeInOut(k));
        } else if (el <= settleStart) {
          const k = THREE.MathUtils.clamp((el - flyTime) / Math.max(appDur, 1e-3), 0, 1);
          const e = easeOutCubic(k);
          g.position.copy(preApproach).lerp(preContact, e);
          // Small braking arc; it rises then commits downward instead of
          // floating horizontally into the branch.
          g.position.y += Math.sin(k * Math.PI) * 0.18;
        } else {
          const k = THREE.MathUtils.clamp((el - settleStart) / contactDur, 0, 1);
          g.position.copy(preContact).lerp(final, easeInQuad(k));
        }
      }
    }

    const arriving = entranceOn && entrance.current.phase !== "done";
    // no chatter or random comfort motions mid-flight
    const speaking = Boolean(voice?.isAgentSpeaking) && CFG.TALK.ENABLED && !arriving;

    /* ── talk layer ── */
    if (CFG.TALK.ENABLED && CFG.BEAK.ENABLED) {
      const T = CFG.TALK;
      const raw = voice?.agentAudioLevel ?? 0;
      talk.current.level += (raw - talk.current.level) * T.LEVEL_SMOOTHING;

      // hysteresis, or the two clips flicker back and forth mid-sentence
      const lvl = talk.current.level;
      if (!talk.current.excited && lvl > T.EXCITED_LEVEL) talk.current.excited = true;
      else if (talk.current.excited && lvl < T.EXCITED_LEVEL - T.EXCITED_HYSTERESIS)
        talk.current.excited = false;

      const target = speaking ? 1 : 0;
      const secs = target > talk.current.weight ? T.FADE_IN : T.FADE_OUT;
      talk.current.weight = THREE.MathUtils.damp(
        talk.current.weight,
        target,
        1 / Math.max(secs, 1e-3),
        delta
      );

      const soft = actions[CLIP_TALK_SOFT];
      const exc = actions[CLIP_TALK_EXCITED];
      const w = talk.current.weight;
      if (soft) soft.setEffectiveWeight(talk.current.excited ? 0 : w);
      if (exc) exc.setEffectiveWeight(talk.current.excited ? w : 0);
    }

    /* ── one-shots: only between utterances, and never on top of each other ── */
    const B = CFG.BREAKS;
    const debugForcing = process.env.NODE_ENV !== "production" && !!DEBUG_FORCE_ONE_SHOT;
    if (B?.ENABLED) {
      // skip the stagger delay when forcing a clip for inspection
      if (shot.current.nextAt < 0) shot.current.nextAt = debugForcing ? t : t + B.FIRST_DELAY;

      // Hold the scheduler at arm's length through the flight. Without this the
      // countdown runs while the bird is airborne and the first comfort motion
      // fires the instant it lands, stepping on the settle.
      if (arriving && !debugForcing) shot.current.nextAt = t + B.FIRST_DELAY;

      if (shot.current.action && t >= shot.current.until) {
        shot.current.action.fadeOut(0.25);
        shot.current.action = null;
        shot.current.name = "";
        shot.current.nextAt = shot.current.forced
          ? t + DEBUG_FORCE_INTERVAL
          : t + B.MIN_GAP + Math.random() * (B.MAX_GAP - B.MIN_GAP);
      }

      const quiet = !speaking && talk.current.weight < 0.05 && !arriving;
      if (!shot.current.action && quiet && t >= shot.current.nextAt) {
        const forced = debugForcing ? (DEBUG_FORCE_ONE_SHOT as OneShotClip) : null;
        const name = forced ?? pickOneShot(B.WEIGHTS);
        const a = name ? actions[name] : null;
        if (a && name) {
          const dur = a.getClip().duration;
          a.reset().setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
          a.setEffectiveWeight(1);
          a.fadeIn(0.2).play();
          shot.current.action = a;
          shot.current.name = name;
          shot.current.until = t + dur;
          shot.current.forced = forced !== null;
          const puff = PUFF_CLIPS[name];
          if (puff !== undefined) puffEnv.current = { start: t, dur, strength: puff };
        } else {
          shot.current.nextAt = t + 2; // clip missing; try again shortly
        }
      }
    }

    // Duck the body idle so the one-shot on top of it isn't averaged into mush.
    // Body-travel clips duck hardest: their vertical pop IS the readable part,
    // and halving it against the idle is what made earlier versions feel weak.
    const shotActive = shot.current.action !== null;
    const duckTo = BODY_TRAVEL_CLIPS.includes(shot.current.name)
      ? IDLE_DUCK.BODY_TRAVEL
      : IDLE_DUCK.DEFAULT;
    // The arrival clips own the whole body; the idle loop is silenced entirely
    // rather than ducked, or it would average the wingbeats away.
    idleDuck.current = THREE.MathUtils.damp(
      idleDuck.current,
      arriving ? 0 : shotActive ? duckTo : 1,
      arriving ? 14 : 6,
      delta
    );
    idleAction?.setEffectiveWeight(idleDuck.current);

    // Hand the head over to preen/yawn while they run, take it back after.
    // Also park it during the flight itself: a bird tracking the cursor while
    // mid-air reads as a glitch. It comes back as the landing settles.
    const clipOwnsHead = HEAD_OWNING_CLIPS.includes(shot.current.name);
    const flying =
      entranceOn && (entrance.current.phase === "fly" || entrance.current.phase === "approach");
    headYield.current = THREE.MathUtils.damp(
      headYield.current,
      clipOwnsHead || flying ? 1 : 0,
      8,
      delta
    );

    /* ── saccades ── */
    if (I.ENABLED) {
      if (S.holdUntil < 0) S.holdUntil = t + I.START_DELAY; // stagger the birds

      if (S.snapStart >= 0) {
        const k = (t - S.snapStart) / (I.SACCADE_MS / 1000);
        if (k >= 1) {
          S.yaw = S.toYaw;
          S.pitch = S.toPitch;
          S.snapStart = -1;
          S.holdUntil = t + I.HOLD_MIN + Math.random() * (I.HOLD_MAX - I.HOLD_MIN);
        } else {
          // linear on purpose — no easing
          S.yaw = S.fromYaw + (S.toYaw - S.fromYaw) * k;
          S.pitch = S.fromPitch + (S.toPitch - S.fromPitch) * k;
        }
      } else if (t >= S.holdUntil) {
        const big = Math.random() < I.BIG_LOOK_CHANCE ? I.BIG_LOOK_MULT : 1;
        S.fromYaw = S.yaw;
        S.fromPitch = S.pitch;
        S.toYaw = (Math.random() * 2 - 1) * deg(I.YAW_SPREAD) * big;
        S.toPitch = (Math.random() * 2 - 1) * deg(I.PITCH_SPREAD) * big;
        S.snapStart = t;
      }
    }

    /* ── morphs ── */
    const mesh = morphMesh.current;
    const idx = morphIdx.current;
    const inf = mesh?.morphTargetInfluences;
    if (inf && idx) {
      if (idx.breath >= 0 && CFG.BREATH.ENABLED) {
        const Br = CFG.BREATH;
        inf[idx.breath] =
          Br.BASE + Br.DEPTH * (0.5 + 0.5 * Math.sin(t * Br.RATE * Math.PI * 2 + Br.PHASE));
      }
      if (idx.throat >= 0) {
        const target = speaking ? Math.min(1, talk.current.level * CFG.TALK.THROAT_GAIN) : 0;
        inf[idx.throat] = THREE.MathUtils.damp(inf[idx.throat] ?? 0, target, 14, delta);
      }
      if (idx.puff >= 0) {
        const P = puffEnv.current;
        let target = 0;
        if (P.start >= 0 && t - P.start < P.dur) {
          // rise fast, hold, then ease off over the tail of the clip
          const k = (t - P.start) / P.dur;
          target = k < 0.25 ? k / 0.25 : k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
        } else if (P.start >= 0) {
          puffEnv.current = { start: -1, dur: 0, strength: 0.85 };
        }
        inf[idx.puff] = THREE.MathUtils.damp(inf[idx.puff] ?? 0, target * P.strength, 10, delta);
      }
    }

    /* ── head ── */
    const h = head.current;
    if (!h) return;

    if (!primed.current) {
      if (!h.parent) return;
      h.parent.updateWorldMatrix(true, false);
      h.parent.getWorldQuaternion(parentQ.current);
      parentInv.current.copy(parentQ.current).invert();
      primed.current = true;
    }

    // Pointer tracking IS smoothed — following the cursor should glide. The
    // saccade offset is added afterwards so it keeps its hard snap.
    const L = CFG.LOOK;
    if (L.ENABLED) {
      const tYaw = deg(L.REST_YAW) + pointer.current.x * deg(L.YAW_RANGE);
      const tPitch = deg(L.REST_PITCH) + pointer.current.y * deg(L.PITCH_RANGE);
      eased.current.yaw += (tYaw - eased.current.yaw) * L.EASING;
      eased.current.pitch += (tPitch - eased.current.pitch) * L.EASING;
    }

    // Swing is built in WORLD axes (Y up, X sideways) so it stays intuitive no
    // matter how the bones are oriented, then converted into the bone's local
    // space and applied on top of rest:   local = parent⁻¹ · swing · parent · rest
    // Preserving `rest` is what keeps the two beak halves aligned to the head.
    eu.set(
      eased.current.pitch + sac.current.pitch,
      eased.current.yaw + sac.current.yaw,
      0,
      "YXZ"
    );
    swing.setFromEuler(eu);
    result
      .copy(parentInv.current)
      .multiply(swing)
      .multiply(parentQ.current)
      .multiply(restQuat);

    // The mixer has already written this bone this frame — drei's useAnimations
    // registers its useFrame before ours. While a head-owning clip runs we
    // blend toward the procedural pose instead of overwriting it, so preen and
    // yawn play out cleanly and hand the head back without a pop.
    if (headYield.current > 0.001) {
      h.quaternion.slerp(result, 1 - headYield.current);
    } else {
      h.quaternion.copy(result);
    }
  });

  useEffect(() => () => void mixer?.stopAllAction(), [mixer]);

  /* The outer group is the flight path and nothing else — it is a world-space
     offset that decays to zero as the bird arrives, leaving the primitive's own
     perch transform untouched. Moving the GLB root instead would fight the
     mixer, which writes that root's transform every frame. */
  return (
    <group ref={flyGroup}>
      <primitive
        object={scene}
        position={[...CFG.POSITION] as [number, number, number]}
        scale={CFG.SCALE}
        rotation={[0, deg(CFG.FACING), 0]}
      />
    </group>
  );
}

useGLTF.preload(toucanConfig.MODEL);
useGLTF.preload(toucan2Config.MODEL);
