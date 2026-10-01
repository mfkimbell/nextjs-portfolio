"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CampfireScene from "@/components/scene-lab/CampfireScene";
import SceneArrow from "@/components/SceneArrow";
import CampsiteTitleIntro from "@/components/scene-lab/CampsiteTitleIntro";
import ForceLandscape from "@/components/ForceLandscape";
import ViewportDebug from "@/components/ViewportDebug";
import SceneLabClient from "@/components/scene-lab/SceneLabClient";
import BearVoiceControls from "@/components/BearVoiceControls";
import { useBearVoiceAgent } from "@/hooks/useBearVoiceAgent";
import { DEFAULT_CAMPFIRE_CONFIG, type CampfireSceneConfig } from "@/components/scene-lab/sceneConfig";
import { useCampsiteOneShot } from "@/lib/campsiteSounds";

// .wav, not the original .mp3: the source file had ~150ms of near-silence
// baked in at the front (a swoosh "wind-up", or just MP3 encoder priming
// samples - LAME and most encoders prepend a short silent header) plus a
// long silent tail, so it read as laggy no matter how low swooshDelayMs
// was set - the delay was IN the audio, not before it. Trimmed with
// ffmpeg's silenceremove and re-exported as .wav to match the site's
// other short cues (uncompressed, no decode start-up to speak of either).
const SWOOSH_URL = "/sound/switch-between-scenes.wav";

function clampUnit(v: number) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

const STORAGE_KEY = "scene-lab-config-v1";
const MODE_KEY = "campsite-mode";

type Mode = "config" | "site";

const PANELS = [
  { title: "By the fire", blurb: "Pull up a log." },
  { title: "Get in touch", blurb: "Come and sit down." },
  { title: "The arcade", blurb: "Four screens, one truck battery." },
];

/**
 * Two ways to run the same scene.
 *
 * "config" is the full scene lab - free camera, click to select, every slider. That's
 * the default while the campsite is still being built, because the panelled view locks
 * the camera and swallows clicks, which makes it impossible to move anything.
 *
 * "site" is the finished experience: camera pinned to one of three sectors, arrow on
 * the left to move round the fire.
 */
export default function CampsiteHome() {
  const [mode, setMode] = useState<Mode>("config");
  const [panel, setPanel] = useState(0);
  // Config is immutable in this component - all live tuning happens in the
  // full scene-lab under /scene-lab, which reads/writes the JSON directly.
  // No setter needed here; keeping it triggers a no-unused-vars error.
  const config: CampfireSceneConfig = DEFAULT_CAMPFIRE_CONFIG;
  const bearVoiceAgent = useBearVoiceAgent({
    speechVolume: config.speechVolume,
    smokeySpeechVolume: config.smokeySpeechVolume,
    mapleSpeechVolume: config.mapleSpeechVolume,
  });
  // Title screen gate for site mode. Fresh every time you enter preview - the
  // cinematic is part of the vibe, so returning visitors see it too.
  const [showTitle, setShowTitle] = useState(true);
  // Split from showTitle so we can release the intro flight the moment the
  // visitor clicks (sound on), while the title overlay keeps rendering its
  // fade-out for another beat. Flight and letter-fade overlap = seamless.
  const [titleHeld, setTitleHeld] = useState(true);

  useEffect(() => {
    try {
      // Wipe the stale scene-config entry: the campfire scene state now lives
      // in src/config/campfireScene.json (loaded via DEFAULT_CAMPFIRE_CONFIG),
      // and any localStorage override would silently drift from what ships.
      window.localStorage.removeItem(STORAGE_KEY);
      const savedMode = window.localStorage.getItem(MODE_KEY);
      if (savedMode === "site" || savedMode === "config") setMode(savedMode);
      // The old campsite-muted flag is deliberately cleared rather than read:
      // the mute button is gone, so a visitor who happened to leave it on would
      // otherwise be stuck with a silent site and no control to undo it.
      window.localStorage.removeItem("campsite-muted");
    } catch {
      /* defaults are fine */
    }
  }, []);


  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next: Mode = m === "config" ? "site" : "config";
      try { window.localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ }
      // Re-arm the title whenever we come back into site mode.
      if (next === "site") { setShowTitle(true); setTitleHeld(true); }
      return next;
    });
  }, []);

  const playSwoosh = useCampsiteOneShot(SWOOSH_URL);

  // Shared by the panel-change effect below AND the title card's "enter"
  // click (see onEnter on CampsiteTitleIntro) - that one doesn't change
  // `panel` (it's already 0/campfire before AND after clicking start, only
  // showTitle flips), so it can't ride the panel-change effect's dependency
  // and has to fire the same swoosh explicitly instead.
  const fireSwoosh = useCallback(() => {
    const master = clampUnit(config.masterVolume);
    const vol = master * clampUnit(config.swooshVolume);
    if (vol <= 0) return;
    const delay = Number.isFinite(config.swooshDelayMs) ? Math.max(0, config.swooshDelayMs) : 0;
    const rate = Number.isFinite(config.swooshRate) && config.swooshRate > 0 ? config.swooshRate : 1;
    const timer = window.setTimeout(() => playSwoosh(vol, rate), delay);
    return () => window.clearTimeout(timer);
  }, [config.masterVolume, config.swooshVolume, config.swooshDelayMs, config.swooshRate, playSwoosh]);

  // Swoosh between the three sites. Played every time the panel index changes,
  // not on the click handlers alone, so it also fires from keyboard arrows.
  // swooshDelayMs holds it back from the exact instant the panel flips - the
  // camera itself takes a beat to start turning (LocationCamera eases in),
  // so a swoosh fired the same frame as the click used to land slightly
  // ahead of the motion it's supposed to be selling. swooshRate is just
  // HTMLMediaElement.playbackRate on the clone - under 1 stretches the cue
  // slower without touching its volume.
  const lastPanelRef = useRef(panel);
  useEffect(() => {
    if (lastPanelRef.current === panel) return;
    lastPanelRef.current = panel;
    return fireSwoosh();
  }, [panel, fireSwoosh]);

  const next = useCallback(() => setPanel((p) => (p + 1) % PANELS.length), []);
  const prev = useCallback(() => setPanel((p) => (p - 1 + PANELS.length) % PANELS.length), []);

  useEffect(() => {
    if (mode !== "site") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") next();
      if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, next, prev]);

  const ModeToggle = (
    <button
      onClick={toggleMode}
      className="pointer-events-auto fixed bottom-3 left-3 z-50 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-[0.65rem] font-semibold text-white/70 shadow-lg backdrop-blur-md transition hover:border-white/35 hover:text-white"
      title={mode === "config" ? "Preview the finished three-panel site" : "Back to the editor"}
    >
      {mode === "config" ? "▶ preview site" : "✎ config mode"}
    </button>
  );

  // Config mode is the scene lab itself - no duplicated controls, no drift between
  // what's tuned here and what the site renders.
  if (mode === "config") {
    return (
      <>
        <SceneLabClient />
        {ModeToggle}
      </>
    );
  }


  return (
    <>
    {/* TEMP: ?debug overlay. Outside the wrapper so its fixed strips pin to the
        screen, not to the rotated box. Remove once the bars are settled. */}
    <ViewportDebug />
    <ForceLandscape>
    <main className="relative h-full w-full overflow-hidden bg-[#03040a]">
        <CampfireScene
          config={config}
          panel={panel}
          intro
          titleHeld={titleHeld}
          bearVoiceRef={bearVoiceAgent.voiceRef}
          onFishImpact={bearVoiceAgent.reactToFishFire}
        />

        {!showTitle && panel === 0 ? <BearVoiceControls agent={bearVoiceAgent} /> : null}


      {showTitle ? (
        <CampsiteTitleIntro
          onUnmute={() => setTitleHeld(false)}
          onEnter={() => {
            setShowTitle(false);
            // Same swoosh the scene-to-scene switches use, hand-fired here
            // because this transition doesn't change `panel` (already 0)
            // for the panel-change effect above to catch - it's the camera
            // pulling IN to the campfire for the first time, not moving
            // between two already-framed locations.
            fireSwoosh();
          }}
          timing={{
            blackHoldDuration: config.titleBlackHoldDuration,
            fadeInDuration: config.titleFadeInDuration,
            exitSlideDuration: config.titleExitSlideDuration,
            exitUnmountDelay: config.titleExitUnmountDelay,
            exitSlideDistance: config.titleExitSlideDistance,
            exitZDistance: config.titleExitZDistance,
            idleAmount: config.titleLetterIdleAmount,
            waviness: config.titleLetterWaviness,
          }}
        />
      ) : null}

      {!showTitle && (
        <>
          {/* One arrow in each top corner - the model itself, with no plate
              behind it. The round button is gone as a LOOK, not as a control:
              the <button> is still here, still carries the aria-label and the
              keyboard focus, and is still what takes the click, because the
              canvas inside it has pointer events switched off. What went is
              the border, the fill and the blur.

              Nothing painted behind the arrow means nothing guaranteeing
              contrast either, so the model carries its own drop shadow. A CSS
              filter on the canvas element does that to the rendered pixels,
              which keeps a pale chevron readable over a moonlit tent.

              They stay corner-anchored rather than growing into a strip: a
              full-height edge target used to swallow every click in the left
              ~130px of the scene, which is a real cost on a page whose whole
              point is clicking the campsite. */}
          <button
            onClick={prev}
            aria-label={`Previous: ${PANELS[(panel - 1 + PANELS.length) % PANELS.length].title}`}
            className="scene-arrow-drop group absolute left-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 sm:left-4 sm:top-4 sm:h-12 sm:w-12"
          >
            {/* Hover lives on the inner span, not the button: the button owns
                the drop-in animation, and an animation with fill `both` keeps
                writing its own transform - a hover scale up there would be
                overwritten the moment the drop finished. */}
            <span className="block h-full w-full drop-shadow-[0_2px_7px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:-translate-x-1 group-hover:scale-110">
              <SceneArrow direction="left" />
            </span>
          </button>
          <button
            onClick={next}
            aria-label={`Next: ${PANELS[(panel + 1) % PANELS.length].title}`}
            className="scene-arrow-drop scene-arrow-drop-late group absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 sm:right-4 sm:top-4 sm:h-12 sm:w-12"
          >
            <span className="block h-full w-full drop-shadow-[0_2px_7px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:translate-x-1 group-hover:scale-110">
              <SceneArrow direction="right" />
            </span>
          </button>
        </>
      )}

      {ModeToggle}
    </main>
    </ForceLandscape>
    </>
  );
}
