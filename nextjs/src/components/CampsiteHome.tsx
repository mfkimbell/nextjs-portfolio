"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CampfireScene from "@/components/scene-lab/CampfireScene";
import CampsiteTitleIntro from "@/components/scene-lab/CampsiteTitleIntro";
import SceneLabClient from "@/components/scene-lab/SceneLabClient";
import { DEFAULT_CAMPFIRE_CONFIG, type CampfireSceneConfig } from "@/components/scene-lab/sceneConfig";
import { useCampsiteOneShot } from "@/lib/campsiteSounds";

const SWOOSH_URL = "/sound/switch-between-scenes.mp3";

function clampUnit(v: number) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

const STORAGE_KEY = "scene-lab-config-v1";
const MODE_KEY = "campsite-mode";
const MUTE_KEY = "campsite-muted";

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
  const [muted, setMuted] = useState(false);
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
      const savedMuted = window.localStorage.getItem(MUTE_KEY);
      if (savedMuted === "1") setMuted(true);
    } catch {
      /* defaults are fine */
    }
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try { window.localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Effective config: force masterVolume to 0 when muted, so every downstream
  // sound (fire crackle, banjo, swoosh, hover) is silenced without touching
  // the individual per-sound sliders.
  const effectiveConfig = muted ? { ...config, masterVolume: 0 } : config;

  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next: Mode = m === "config" ? "site" : "config";
      try { window.localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ }
      // Re-arm the title whenever we come back into site mode.
      if (next === "site") { setShowTitle(true); setTitleHeld(true); }
      return next;
    });
  }, []);

  // Swoosh between the three sites. Played every time the panel index changes,
  // not on the click handlers alone, so it also fires from keyboard arrows.
  const playSwoosh = useCampsiteOneShot(SWOOSH_URL);
  const lastPanelRef = useRef(panel);
  useEffect(() => {
    if (lastPanelRef.current !== panel) {
      lastPanelRef.current = panel;
      const master = clampUnit(effectiveConfig.masterVolume);
      const vol = master * clampUnit(effectiveConfig.swooshVolume);
      if (vol > 0) playSwoosh(vol);
    }
  }, [panel, effectiveConfig.masterVolume, effectiveConfig.swooshVolume, playSwoosh]);

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

  const MuteToggle = (
    <button
      onClick={toggleMuted}
      aria-label={muted ? "Unmute" : "Mute"}
      title={muted ? "Unmute" : "Mute"}
      className="pointer-events-auto fixed bottom-3 right-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/70 shadow-lg backdrop-blur-md transition hover:border-white/35 hover:text-white"
    >
      {muted ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="m16 9 5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
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

  const current = PANELS[panel];

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#03040a]">
      <CampfireScene config={effectiveConfig} panel={panel} intro titleHeld={titleHeld} />

      {showTitle ? (
        <CampsiteTitleIntro
          onUnmute={() => setTitleHeld(false)}
          onEnter={() => setShowTitle(false)}
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
          <button
            onClick={next}
            aria-label={`Next: ${PANELS[(panel + 1) % PANELS.length].title}`}
            className="group absolute left-0 top-0 z-20 flex h-full w-24 cursor-pointer items-center justify-start pl-3 sm:w-32 sm:pl-5"
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-black/45 to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white/70 backdrop-blur-md transition-all duration-300 group-hover:border-white/40 group-hover:bg-black/60 group-hover:text-white sm:h-14 sm:w-14">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 transition-transform duration-300 group-hover:-translate-x-0.5">
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-3 text-center">
            <div>
              <div className="text-sm font-semibold tracking-wide text-white/90 sm:text-base">{current.title}</div>
              <div className="text-[0.7rem] text-white/50 sm:text-xs">{current.blurb}</div>
            </div>
            <div className="flex items-center gap-1.5">
              {PANELS.map((p, i) => (
                <span
                  key={p.title}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === panel ? "w-6 bg-white/80" : "w-1.5 bg-white/25"
                  }`}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {ModeToggle}
      {MuteToggle}
    </main>
  );
}
