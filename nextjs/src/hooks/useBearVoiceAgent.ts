"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BearVoiceState, BearVoiceStateRef } from "@/lib/bearVoiceState";

type VoiceStatus = "idle" | "connecting" | "active" | "disconnected" | "error";

type VoiceCall = {
  disconnect(): void;
  getRemoteStream?: () => MediaStream | undefined;
  isMuted(): boolean;
  mute(muted: boolean): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  parameters?: { CallSid?: string };
};

type VoiceDevice = {
  connect(options?: { params?: Record<string, string> }): Promise<VoiceCall>;
  destroy(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  register(): Promise<void>;
};

export type BearVoiceAgent = {
  activeSpeakerName: string | null;
  error: string | null;
  isMuted: boolean;
  isRemoteSpeaking: boolean;
  remoteAudioLevel: number;
  start: () => Promise<void>;
  status: VoiceStatus;
  stop: () => void;
  toggleMute: () => void;
  voiceRef: BearVoiceStateRef;
};

const DEFAULT_DESTINATION = "portfolio-bears";
const DEV_AGENT_BASE_URL = "https://mkimbell.ngrok.dev";

const bearNameForId = (bearId: BearVoiceState["activeBearId"]) =>
  bearId === "back_left_log" ? "Smokey" : "Maple";

const isBearId = (value: unknown): value is BearVoiceState["activeBearId"] =>
  value === "back_left_log" || value === "back_right_log";

type TwilioMediaHandler = {
  _masterAudio?: HTMLAudioElement;
  outputs?: Map<string, { audio?: HTMLAudioElement }>;
};

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function applyRemoteVolume(call: VoiceCall | null, volume: number): void {
  const handler = (call as unknown as { _mediaHandler?: TwilioMediaHandler } | null)?._mediaHandler;
  const audio = handler?._masterAudio ?? handler?.outputs?.get("default")?.audio;
  if (audio) audio.volume = clampVolume(volume);
}

/**
 * Real-time lip-sync features from one analyser frame. No phoneme recognition -
 * the approach the browser lip-sync libraries (wawa-lipsync, lipsync-engine)
 * and the avatar write-ups converge on: three continuous mouth parameters
 * instead of 15 discrete visemes, because a stylized low-poly face can only
 * show ~three shapes anyway and continuous values never "pop".
 *
 * Calibrated offline against recorded speech (three macOS voices, low/mid/high
 * pitched, isolated words beet/boot/bot/bait/boat/bat/see/sue/saw/... plus
 * running sentences) with a Python replica of this exact chain - see
 * .lipsync-renders/lip2.py. What that showed, and why the features are what
 * they are:
 *
 *   open  - NOT raw loudness. Running speech barely dips in RMS between
 *           syllables, so a loudness-driven jaw plateaus half-open. Instead:
 *           60% "syllabic contrast" (fast envelope above its own ~300ms
 *           floor) + 40% level vs a slowly-decaying peak (automatic gain),
 *           scaled by F1 height - share of sub-1kHz energy above 500Hz, ~0 for
 *           ee/oo/m, 0.4-0.65 for ah/aw - and cut on hiss (s/sh/f). Gives
 *           ~3-4 real closures per second of speech, i.e. syllable rate.
 *   wide / round - F2 brightness, log10(E[1.4-3.2kHz] / E[250Hz-1kHz]),
 *           relative to THIS voice's running median. (A power-weighted
 *           spectral centroid, the first thing tried, just tracks pitch: ~400Hz
 *           medians, useless.) Round vowels sit ~1.3-1.7 decades below front
 *           ones in every voice tested, but the absolute values shift by a
 *           decade between voices - hence the per-voice median. Wide needs a
 *           LOW F1 as well (ee/ih, not ah); round needs dark + low-ish F1
 *           (oo/oh/w). Shapes fade in over the first ~2.5s of voiced audio
 *           while the median settles, so a cold start can't pucker an "ee".
 *   onset - fast/slow envelope ratio crossing a threshold = a new syllable,
 *           with a refractory gap so one syllable can't fire twice. Drives the
 *           head nods, blink timing and per-syllable variation in the scene.
 */
function createLipSyncAnalyzer(sampleRate: number, fftSize: number) {
  const binHz = sampleRate / fftSize;
  const bin = (hz: number) => Math.max(1, Math.round(hz / binHz));
  const B = {
    b150: bin(150), b250: bin(250), b500: bin(500), b1000: bin(1000),
    b1400: bin(1400), b3200: bin(3200), b3500: bin(3500), b7500: bin(7500),
  };
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  let last = 0;
  let peak = 0.05;
  let fast = 0;
  let slow = 0;
  let floor = 0;
  let median = -1.5;     // log10 F2 brightness; typical mid-voice starting point
  let voicedTime = 0;
  let lastOnset = 0;
  // power summed over [a, b) bins, from the analyser's dB spectrum
  const band = (db: Float32Array, a: number, b: number) => {
    let sum = 1e-12;
    for (let i = a; i < b && i < db.length; i++) {
      const v = db[i];
      if (Number.isFinite(v)) sum += Math.pow(10, v / 10);
    }
    return sum;
  };
  return (rms: number, spectrumDb: Float32Array, now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    // envelopes (time-constant based, frame-rate independent)
    fast += (rms - fast) * (1 - Math.exp(-dt / 0.025));
    slow += (rms - slow) * (1 - Math.exp(-dt / 0.18));
    peak = Math.max(rms, peak * Math.exp(-dt * 0.35), 0.035);
    floor = fast < floor ? fast : floor + (fast - floor) * (1 - Math.exp(-dt / 0.3));

    const voiced = rms > 0.012;
    const level = clamp01((rms - 0.012) / Math.max(0.02, peak * 0.8 - 0.012));
    const contrast = clamp01((fast - floor) / Math.max(0.01, peak * 0.8 - floor));

    const lo = band(spectrumDb, B.b150, B.b500);
    const f1 = band(spectrumDb, B.b500, B.b1000);
    const f2 = band(spectrumDb, B.b1400, B.b3200);
    const base = band(spectrumDb, B.b250, B.b1000);
    const hiss = band(spectrumDb, B.b3500, B.b7500);
    const total = band(spectrumDb, B.b150, B.b7500);
    const f1Open = clamp01(f1 / (lo + f1));
    const brightness = Math.log10(f2 / base);
    const sibilant = clamp01((hiss / total - 0.08) / 0.25);

    // Per-voice running median of F2 brightness over vowel nuclei: moves a
    // fixed step toward each sample (converges on the median, shrugs off the
    // outliers consonant transitions throw), fast for the first 2.5s.
    if (voiced && level > 0.3) {
      voicedTime += dt;
      const rate = voicedTime < 2.5 ? 2.0 : 0.6;
      median += rate * dt * (brightness > median ? 1 : -1);
    }
    const dev = brightness - median;
    const confidence = 0.35 + 0.65 * clamp01(voicedTime / 2.5);

    const drive = 0.4 * level + 0.6 * contrast;
    const open = voiced
      ? clamp01(Math.pow(drive, 0.85) * (0.55 + 0.75 * f1Open) * (1 - 0.6 * sibilant))
      : 0;
    const wide = voiced
      ? clamp01(clamp01((dev + 0.4) / 0.5) * clamp01(1 - 1.8 * f1Open) + sibilant * 0.8) * confidence
      : 0;
    const round = voiced
      ? clamp01((-dev - 0.6) / 0.5) * clamp01(1.3 - 1.3 * f1Open) * confidence
      : 0;

    let onset = false;
    let onsetStrength = 0;
    if (fast > 0.02 && fast > slow * 1.35 && now - lastOnset > 160) {
      onset = true;
      lastOnset = now;
      onsetStrength = clamp01((fast / Math.max(slow, 1e-4) - 1.35) / 1.2 * 0.6 + (fast / peak) * 0.5);
    }
    return { open, wide, round, onset, onsetStrength };
  };
}

const parseEventData = (event: MessageEvent<string>) => {
  try {
    const parsed: unknown = JSON.parse(event.data);
    if (typeof parsed !== "object" || parsed === null) return null;
    const payload = parsed as { bearId?: unknown; data?: { bearId?: unknown }; type?: unknown };
    return {
      bearId: payload.bearId ?? payload.data?.bearId,
      type: payload.type,
    };
  } catch {
    return null;
  }
};

export function useBearVoiceAgent({
  speechVolume = 1,
  smokeySpeechVolume = 1,
  mapleSpeechVolume = 1,
}: {
  speechVolume?: number;
  smokeySpeechVolume?: number;
  mapleSpeechVolume?: number;
} = {}): BearVoiceAgent {
  const callRef = useRef<VoiceCall | null>(null);
  const deviceRef = useRef<VoiceDevice | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const audioSetupTimerRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const speechVolumeRef = useRef({
    master: clampVolume(speechVolume),
    smokey: clampVolume(smokeySpeechVolume),
    maple: clampVolume(mapleSpeechVolume),
  });
  const voiceRef = useRef<BearVoiceState>({
    activeBearId: "back_left_log",
    isRemoteSpeaking: false,
    remoteAudioLevel: 0,
    phase: "idle",
    segmentId: 0,
    speakerSource: "default",
    isInterrupted: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [activeSpeakerName, setActiveSpeakerName] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);
  const [status, setStatus] = useState<VoiceStatus>("idle");

  useEffect(() => {
    speechVolumeRef.current = {
      master: clampVolume(speechVolume),
      smokey: clampVolume(smokeySpeechVolume),
      maple: clampVolume(mapleSpeechVolume),
    };
    const trim = voiceRef.current.activeBearId === "back_left_log"
      ? speechVolumeRef.current.smokey
      : speechVolumeRef.current.maple;
    applyRemoteVolume(callRef.current, speechVolumeRef.current.master * trim);
  }, [mapleSpeechVolume, smokeySpeechVolume, speechVolume]);

  const cleanupAudioMonitor = useCallback(() => {
    if (audioFrameRef.current !== null) {
      cancelAnimationFrame(audioFrameRef.current);
      audioFrameRef.current = null;
    }
    if (audioSetupTimerRef.current !== null) {
      window.clearTimeout(audioSetupTimerRef.current);
      audioSetupTimerRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    voiceRef.current.isRemoteSpeaking = false;
    voiceRef.current.remoteAudioLevel = 0;
    voiceRef.current.mouthOpen = 0;
    voiceRef.current.mouthWide = 0;
    voiceRef.current.mouthRound = 0;
    voiceRef.current.activeBearId = "back_left_log";
    voiceRef.current.segmentId = 0;
    voiceRef.current.speakerSource = "default";
    voiceRef.current.phase = "interrupted";
    voiceRef.current.isInterrupted = true;
    setIsRemoteSpeaking(false);
    setRemoteAudioLevel(0);
  }, []);

  const cleanupAgentEvents = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setActiveSpeakerName(null);
  }, []);

  const cleanup = useCallback(() => {
    cleanupAgentEvents();
    cleanupAudioMonitor();
    try {
      deviceRef.current?.destroy();
    } catch {
      // The SDK may have already disposed the device after a call error.
    }
    callRef.current = null;
    deviceRef.current = null;
    setIsMuted(false);
  }, [cleanupAgentEvents, cleanupAudioMonitor]);

  const subscribeToAgentEvents = useCallback((callSid: string) => {
    cleanupAgentEvents();

    const configuredBaseUrl = process.env.NEXT_PUBLIC_BEAR_AGENT_BASE_URL?.trim();
    const agentBaseUrl =
      process.env.NODE_ENV === "production" ? configuredBaseUrl : DEV_AGENT_BASE_URL;
    if (!agentBaseUrl) {
      console.warn("[BearVoice] Bear event URL is not configured.");
      return;
    }

    const url = new URL(`/events/${encodeURIComponent(callSid)}`, agentBaseUrl);
    const eventToken = process.env.NEXT_PUBLIC_BEAR_EVENT_TOKEN?.trim();
    // Temporary browser-visible token until the event endpoint uses authenticated sessions.
    if (process.env.NODE_ENV === "production" && eventToken) {
      url.searchParams.set("token", eventToken);
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    const handleStarted = (event: Event) => {
      const data = parseEventData(event as MessageEvent<string>);
      if (!data || !isBearId(data.bearId)) return;
      voiceRef.current.activeBearId = data.bearId;
      voiceRef.current.segmentId = (voiceRef.current.segmentId ?? 0) + 1;
      voiceRef.current.speakerSource = "backend";
      voiceRef.current.phase = "remote-speaking";
      voiceRef.current.isInterrupted = false;
      const trim = data.bearId === "back_left_log"
        ? speechVolumeRef.current.smokey
        : speechVolumeRef.current.maple;
      applyRemoteVolume(callRef.current, speechVolumeRef.current.master * trim);
      setActiveSpeakerName(bearNameForId(data.bearId));
    };

    const handleInterrupted = () => {
      voiceRef.current.phase = "interrupted";
      voiceRef.current.isInterrupted = true;
      setActiveSpeakerName(null);
    };

    eventSource.addEventListener("bear.speech.started", handleStarted);
    eventSource.addEventListener("bear.speech.interrupted", handleInterrupted);
    eventSource.onmessage = (event) => {
      const data = parseEventData(event);
      if (data?.type === "bear.speech.started") handleStarted(event);
      if (data?.type === "bear.speech.interrupted") handleInterrupted();
    };
  }, [cleanupAgentEvents]);

  const monitorRemoteAudio = useCallback(
    (call: VoiceCall) => {
      let attempts = 0;
      const setup = () => {
        const stream = call.getRemoteStream?.();
        if (!stream) {
          attempts += 1;
          if (attempts < 50) audioSetupTimerRef.current = window.setTimeout(setup, 100);
          return;
        }

        const audioContext = new AudioContext();
        const trim = voiceRef.current.activeBearId === "back_left_log"
          ? speechVolumeRef.current.smokey
          : speechVolumeRef.current.maple;
        applyRemoteVolume(call, speechVolumeRef.current.master * trim);
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        // 1024 at 48kHz = ~47Hz bins: fine enough to separate F1 (~300-900Hz)
        // from F2 (~900-2500Hz), which is what the mouth-shape features need.
        // Light analyser smoothing only - the scene smooths per channel with
        // its own attack/release, and double smoothing reads as lag.
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.25;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        const samples = new Float32Array(analyser.fftSize);
        const spectrum = new Float32Array(analyser.frequencyBinCount);
        const lipsync = createLipSyncAnalyzer(audioContext.sampleRate, analyser.fftSize);
        let lastAudibleAt = 0;
        let lastStatePublishAt = 0;

        const measure = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += sample * sample;
          const rms = Math.sqrt(sum / samples.length);
          analyser.getFloatFrequencyData(spectrum);
          const lip = lipsync(rms, spectrum, performance.now());
          voiceRef.current.mouthOpen = lip.open;
          voiceRef.current.mouthWide = lip.wide;
          voiceRef.current.mouthRound = lip.round;
          if (lip.onset) {
            voiceRef.current.syllable = (voiceRef.current.syllable ?? 0) + 1;
            voiceRef.current.syllableStrength = lip.onsetStrength;
          }
          const now = Date.now();
          if (rms > 0.012) lastAudibleAt = now;
          const speaking = now - lastAudibleAt < 350;
          const wasSpeaking = voiceRef.current.isRemoteSpeaking;
          if (speaking && !wasSpeaking && voiceRef.current.segmentId === 0) {
            // Until the backend identifies a speaker, the first audible segment is Smokey.
            voiceRef.current.activeBearId = "back_left_log";
            voiceRef.current.segmentId = (voiceRef.current.segmentId ?? 0) + 1;
            voiceRef.current.speakerSource = "default";
            voiceRef.current.phase = "remote-speaking";
            voiceRef.current.isInterrupted = false;
          } else if (!speaking && wasSpeaking && voiceRef.current.speakerSource !== "backend") {
            voiceRef.current.phase = "idle";
            voiceRef.current.isInterrupted = false;
          }
          voiceRef.current.remoteAudioLevel = rms;
          voiceRef.current.isRemoteSpeaking = speaking;
          // The scene reads RMS from the ref at display rate. Controls only need a
          // coarse meter/status update, except for immediate speaking transitions.
          if (speaking !== wasSpeaking || now - lastStatePublishAt >= 120) {
            lastStatePublishAt = now;
            setRemoteAudioLevel(rms);
            setIsRemoteSpeaking(speaking);
          }
          audioFrameRef.current = requestAnimationFrame(measure);
        };

        measure();
      };

      setup();
    },
    []
  );

  const stop = useCallback(() => {
    callRef.current?.disconnect();
    cleanup();
    setStatus("disconnected");
  }, [cleanup]);

  const start = useCallback(async () => {
    if (callRef.current) return;

    setError(null);
    setStatus("connecting");
    try {
      const tokenResponse = await fetch("/api/twilio/voice-token", { method: "POST" });
      if (!tokenResponse.ok) throw new Error("Unable to start a voice session.");
      const { token } = (await tokenResponse.json()) as { token?: string };
      if (!token) throw new Error("Voice token was not returned.");

      const { Device } = (await import("@twilio/voice-sdk")) as unknown as {
        Device: new (accessToken: string) => VoiceDevice;
      };
      const device = new Device(token);
      deviceRef.current = device;
      device.on("error", () => {
        setError("The voice connection failed.");
        setStatus("error");
        cleanup();
      });
      await device.register();

      const call = await device.connect({
        params: { To: process.env.NEXT_PUBLIC_BEAR_AGENT_TO || DEFAULT_DESTINATION },
      });
      callRef.current = call;
      call.on("accept", (acceptedCall?: unknown) => {
        const accepted = (acceptedCall || call) as VoiceCall;
        const callSid = accepted.parameters?.CallSid || call.parameters?.CallSid;
        setStatus("active");
        monitorRemoteAudio(accepted);
        if (callSid) subscribeToAgentEvents(callSid);
      });
      call.on("disconnect", () => {
        cleanup();
        setStatus("disconnected");
      });
      call.on("cancel", () => {
        cleanup();
        setStatus("disconnected");
      });
      call.on("reject", () => {
        cleanup();
        setStatus("disconnected");
      });
      call.on("error", () => {
        setError("The call ended unexpectedly.");
        cleanup();
        setStatus("error");
      });
    } catch (startError) {
      cleanup();
      setError(startError instanceof Error ? startError.message : "Unable to start a voice session.");
      setStatus("error");
    }
  }, [cleanup, monitorRemoteAudio, subscribeToAgentEvents]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const nextMuted = !call.isMuted();
    call.mute(nextMuted);
    setIsMuted(nextMuted);
  }, []);

  useEffect(() => () => {
    callRef.current?.disconnect();
    cleanup();
  }, [cleanup]);

  return {
    activeSpeakerName,
    error,
    isMuted,
    isRemoteSpeaking,
    remoteAudioLevel,
    start,
    status,
    stop,
    toggleMute,
    voiceRef,
  };
}
