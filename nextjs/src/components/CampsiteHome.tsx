"use client";

import { useCallWatch } from "@/hooks/useCallWatch";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatChoice } from "@/components/scene-lab/CabinExtras";
import CampfireScene from "@/components/scene-lab/CampfireScene";
import SceneArrow from "@/components/SceneArrow";
import CampsiteTitleIntro from "@/components/scene-lab/CampsiteTitleIntro";
import ForceLandscape from "@/components/ForceLandscape";
import ViewportDebug from "@/components/ViewportDebug";
import PerfOverlay from "@/components/PerfOverlay";
import { Mic, MicOff } from "lucide-react";
import { useProgress } from "@react-three/drei";
import { perfStats, SCENE_READY_EVENT } from "@/lib/perfStats";
import SceneLabClient from "@/components/scene-lab/SceneLabClient";
import ConfiguredBearDialogue from "@/components/bear-dialogue/ConfiguredBearDialogue";
import { useBearVoiceAgent } from "@/hooks/useBearVoiceAgent";
import { useLiveKitBearAgent } from "@/hooks/use-livekit-bear-agent";
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
type VoiceTransport = "twilio" | "livekit";

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
/** Twilio number whose Voice webhook points at /call (ConversationRelay). */
const BEAR_PHONE_NUMBER = process.env.NEXT_PUBLIC_BEAR_PHONE_NUMBER || "+1 (855) 471-0900";

/** Deterministic star dots for the phone loading cover: two layers of
 *  radial-gradient dots, one of them twinkling. Pure CSS, no canvas. */
function starLayer(seed: number, count: number, maxSize: number) {
  let a = seed;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (rnd() * 100).toFixed(2), y = (rnd() * 100).toFixed(2);
    // a third of the old size: tiny pin-pricks
    const r = ((0.6 + rnd() * maxSize) / 3).toFixed(2);
    const o = (0.35 + rnd() * 0.65).toFixed(2);
    parts.push(`radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,${o}) 0, rgba(255,255,255,${o}) ${r}px, transparent ${(+r + 0.35).toFixed(2)}px)`);
  }
  return parts.join(",");
}
const STARFIELD_STYLE = { backgroundImage: starLayer(7, 70, 0.9) };
const STARFIELD_STYLE_2 = { backgroundImage: starLayer(91, 35, 1.3) };

export default function CampsiteHome() {
  const [mode, setMode] = useState<Mode>("site");
  const [panel, setPanel] = useState(0);
  // Config is immutable in this component - all live tuning happens in the
  // full scene-lab under /scene-lab, which reads/writes the JSON directly.
  // No setter needed here; keeping it triggers a no-unused-vars error.
  const config: CampfireSceneConfig = DEFAULT_CAMPFIRE_CONFIG;
  const [voiceTransport, setVoiceTransport] = useState<VoiceTransport>("livekit");
  const [twilioSmokeyVoice] = useState("oubi7HGxNVjXMnWLgwBT");
  const [twilioMapleVoice] = useState("u0REnIJvUgcGQYW2Ux8K");
  const [liveKitSmokeyVoice] = useState("ash");
  const [smokeyPitch] = useState(0.9);
  const [maplePitch] = useState(0.97);   // was 1.12 - Maple a touch lower
  const bearVoiceAgent = useBearVoiceAgent({
    speechVolume: config.speechVolume,
    smokeySpeechVolume: config.smokeySpeechVolume,
    mapleSpeechVolume: config.mapleSpeechVolume,
    smokeyVoiceId: twilioSmokeyVoice,
    mapleVoiceId: twilioMapleVoice,
  });
  const liveKitBearAgent = useLiveKitBearAgent(liveKitSmokeyVoice, { smokey: smokeyPitch, maple: maplePitch });
  const startLiveKit = liveKitBearAgent.start;
  const activeBearAgent = voiceTransport === "livekit" ? liveKitBearAgent : bearVoiceAgent;
  const [dialogueStarted, setDialogueStarted] = useState(false);
  // Order of events: the title click releases the intro flight; the camera
  // lands and the bears say hello (no mic, nothing asked of the visitor);
  // only once their greeting is OVER do the three 3D arrows appear over the
  // telephone (call a real Twilio number), the microphone (talk - the
  // browser asks for the mic right then) and the typewriter (type).
  const [chatMode, setChatMode] = useState<ChatChoice | null>(null);
  // "Call us" open: wait for this visitor's call so the bears can pick up their phones
  const { onCall } = useCallWatch(chatMode === "phone");
  const [greeted, setGreeted] = useState(false);
  const greetAskedRef = useRef(false);
  const startBearsDuringFlight = useCallback(async () => {
    setTitleHeld(false);
  }, []);
  // ask the bears to greet - on the title's "enter" click, so the browser
  // counts it as a gesture and lets their audio play
  const askForGreeting = useCallback(() => {
    if (greetAskedRef.current) return;
    greetAskedRef.current = true;
    if (voiceTransport !== "livekit") { bearVoiceAgent.stop(); setVoiceTransport("livekit"); }
    void (async () => {
      await liveKitBearAgent.start();
      await liveKitBearAgent.beginConversation?.({ microphone: false });
    })();
  }, [bearVoiceAgent, liveKitBearAgent, voiceTransport]);
  const chooseChatMode = useCallback(async (choice: ChatChoice) => {
    setChatMode(choice);
    if (choice === "phone") {           // just shows the number; Twilio's /call webhook takes the call
      await liveKitBearAgent.setMicrophone?.(false);
      return;
    }
    if (choice === "type") {            // typing goes over the LiveKit data channel, mic stays off
      await liveKitBearAgent.setMicrophone?.(false);
      return;
    }
    // "talk": this is where the browser's microphone prompt appears
    const ok = await liveKitBearAgent.setMicrophone?.(true);
    if (ok === false) setChatMode(null);   // refused: back to the three choices
  }, [liveKitBearAgent]);
  const selectTwilioTransport = useCallback(() => {
    liveKitBearAgent.stop();
    setVoiceTransport("twilio");
  }, [liveKitBearAgent]);
  const selectLiveKitTransport = useCallback(() => {
    bearVoiceAgent.stop();
    setVoiceTransport("livekit");
  }, [bearVoiceAgent]);
  // Title screen gate for site mode. Fresh every time you enter preview - the
  // cinematic is part of the vibe, so returning visitors see it too.
  const [showTitle, setShowTitle] = useState(true);
  // Split from showTitle so we can release the intro flight the moment the
  // visitor clicks (sound on), while the title overlay keeps rendering its
  // fade-out for another beat. Flight and letter-fade overlap = seamless.
  const [titleHeld, setTitleHeld] = useState(true);
  /*
   * Hold the "click to enter" until the campfire has actually loaded. Entering
   * early started the intro flight while models were still downloading and
   * shaders compiling - on a phone that is the stutter-fest at start-up. The
   * title shows the loading percentage meanwhile. Sticky once reached, with a
   * 20 s fallback so a stuck download can never trap anyone on the title.
   */
  const [coverGone, setCoverGone] = useState(false);
  const loadProgress = useProgress();
  // Ready = every site loaded AND its shaders compiled (CampfireScene's
  // ShaderPrewarm fires SCENE_READY_EVENT). Compiling them after entering is
  // what froze the phone for seconds at a time once the fly-in had started.
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    if (perfStats.prewarmedAt) { setSceneReady(true); return; }
    const on = () => setSceneReady(true);
    window.addEventListener(SCENE_READY_EVENT, on);
    const t = window.setTimeout(on, 30000);   // never trap anyone on the title
    return () => { window.removeEventListener(SCENE_READY_EVENT, on); window.clearTimeout(t); };
  }, []);

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

  useEffect(() => {
    if (activeBearAgent.isRemoteSpeaking) setDialogueStarted(true);
  }, [activeBearAgent.isRemoteSpeaking]);
  // The greeting is over when the agent hands the turn over. Fallbacks so the
  // choices can never get stuck hidden: a beat of silence after the bears
  // have spoken, or 15 s after entering if the bears never connect at all.
  useEffect(() => {
    if (greeted || showTitle) return;
    if (activeBearAgent.dialoguePhase === "your-turn" && !activeBearAgent.isRemoteSpeaking) { setGreeted(true); return; }
    const wait = dialogueStarted && !activeBearAgent.isRemoteSpeaking ? 2500 : dialogueStarted ? null : 15000;
    if (wait == null) return;
    const t = window.setTimeout(() => setGreeted(true), wait);
    return () => window.clearTimeout(t);
  }, [greeted, showTitle, dialogueStarted, activeBearAgent.dialoguePhase, activeBearAgent.isRemoteSpeaking]);
  const choosing = !showTitle && greeted && chatMode == null && panel === 0;
  // (Switching channel = clicking the telephone / microphone / typewriter
  //  again; the old "say it and the bears call a tool" route is gone.)

  useEffect(() => {
    if (mode !== "site" || voiceTransport !== "livekit") return;
    void startLiveKit();
  }, [mode, startLiveKit, voiceTransport]);


  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next: Mode = m === "config" ? "site" : "config";
      try { window.localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ }
      // Re-arm the title whenever we come back into site mode.
      if (next === "site") { setShowTitle(true); setTitleHeld(true); setChatMode(null); setGreeted(false); greetAskedRef.current = false; }
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
    <PerfOverlay />
    <ForceLandscape>
    <main className="relative h-full w-full overflow-hidden bg-[#03040a]">
        <CampfireScene
          config={config}
          panel={panel}
          onRequestPanel={setPanel}
          intro
          titleHeld={titleHeld}
          bearVoiceRef={activeBearAgent.voiceRef}
          onFishImpact={activeBearAgent.reactToFishFire}
          onSceneEvent={activeBearAgent.notifySceneEvent}
          chatChoice={{ show: choosing, onChoose: chooseChatMode, clickable: !showTitle && greeted && panel === 0 }}
        />

        {/* (no "how do you want to talk" banner - the three arrows say it) */}

        {/* the phone number now shows in a dialogue bubble (BearDialogue, chatMode "phone") */}

        {/* (to switch channel, click the telephone, microphone or typewriter) */}
        {/* Voice chat: a plain white mic / muted-mic icon, bottom-right, to mute yourself */}
        {!showTitle && chatMode === "mic" ? (
          <button
            type="button"
            onClick={liveKitBearAgent.toggleMute}
            aria-pressed={liveKitBearAgent.isMuted}
            aria-label={liveKitBearAgent.isMuted ? "Unmute microphone" : "Mute microphone"}
            title={liveKitBearAgent.isMuted ? "Unmute" : "Mute"}
            className="pointer-events-auto absolute bottom-4 right-4 z-40 rounded-full p-2 text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)] transition hover:scale-110 hover:text-white"
          >
            {liveKitBearAgent.isMuted ? <MicOff size={30} strokeWidth={2} /> : <Mic size={30} strokeWidth={2} />}
          </button>
        ) : null}

        {false && !showTitle && panel === 0 ? (
          <div className="pointer-events-auto absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full border border-white/20 bg-black/70 p-1 text-[0.65rem] text-white shadow-lg backdrop-blur-md">
            <button type="button" onClick={selectTwilioTransport} className={`rounded-full px-2 py-1 ${voiceTransport === "twilio" ? "bg-amber-200 text-stone-950" : "text-white/70"}`}>Twilio</button>
            <button type="button" onClick={selectLiveKitTransport} className={`rounded-full px-2 py-1 ${voiceTransport === "livekit" ? "bg-amber-200 text-stone-950" : "text-white/70"}`}>LiveKit beta</button>
          </div>
        ) : null}
        {/* the bubbles follow you to every scene, not just the campfire */}
        {!showTitle && (dialogueStarted || chatMode != null) && !(choosing && !activeBearAgent.isRemoteSpeaking) ? <ConfiguredBearDialogue agent={activeBearAgent} chatMode={chatMode ?? undefined} config={config} phoneNumber={BEAR_PHONE_NUMBER} onCall={onCall} onChangeChannel={() => setChatMode(null)} /> : null}


      {/* A plain starry night covers the 3D scene while it loads and
          compiles (it was visibly popping and flickering behind the title),
          then fades away once it's ready, revealing the scene as normal. */}
      {!coverGone ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[35] bg-black"
          style={{ opacity: sceneReady ? 0 : 1, transition: "opacity 1.4s ease", ...STARFIELD_STYLE }}
          onTransitionEnd={() => { if (sceneReady) setCoverGone(true); }}
        >
          <div className="absolute inset-0 campsite-twinkle" style={STARFIELD_STYLE_2} />
          <style>{`@keyframes campsite-twinkle { 0%,100% { opacity: .35 } 50% { opacity: 1 } } .campsite-twinkle { animation: campsite-twinkle 3.2s ease-in-out infinite }`}</style>
        </div>
      ) : null}

      {showTitle ? (
        <CampsiteTitleIntro
          ready={sceneReady}
          loader={{ bottomPct: config.titleLoaderBottomPct, leftPct: config.titleLoaderLeftPct, sizeRem: config.titleLoaderSizeRem, textScale: config.titleLoaderTextScale, fadeOut: (config.titleLoaderFadeOut ?? 1) >= 0.5, fadeSec: config.titleLoaderFadeSec, fadeTo: config.titleLoaderFadeTo }}
          loadingPercent={loadProgress.active || loadProgress.progress < 100 ? loadProgress.progress : -1}
          onUnmute={startBearsDuringFlight}
          onEnter={() => {
            setShowTitle(false);
            askForGreeting();
            // (No swoosh on the first zoom into scene 1 any more - it played
            //  out of step with the fly-in. Scene-to-scene switches keep theirs.)
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
            className="scene-arrow-drop group absolute left-[2vmin] top-[2vmin] z-20 flex h-[10vmin] w-[10vmin] items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
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
            className="scene-arrow-drop scene-arrow-drop-late group absolute right-[2vmin] top-[2vmin] z-20 flex h-[10vmin] w-[10vmin] items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
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
