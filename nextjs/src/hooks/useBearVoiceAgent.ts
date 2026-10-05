"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BearVoiceState, BearVoiceStateRef } from "@/lib/bearVoiceState";
import { applyLipSyncFrame, createLipSyncAnalyzer } from "@/lib/bearLipSync";

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
  reactToFishFire: () => void;
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

const parseEventData = (event: MessageEvent<string>) => {
  try {
    const parsed: unknown = JSON.parse(event.data);
    if (typeof parsed !== "object" || parsed === null) return null;
    const payload = parsed as {
      bearId?: unknown;
      speechId?: unknown;
      data?: { bearId?: unknown; speechId?: unknown };
      type?: unknown;
    };
    const speechId = payload.speechId ?? payload.data?.speechId;
    return {
      bearId: payload.bearId ?? payload.data?.bearId,
      speechId: typeof speechId === "string" ? speechId : undefined,
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
  smokeyVoiceId,
  mapleVoiceId,
}: {
  speechVolume?: number;
  smokeySpeechVolume?: number;
  mapleSpeechVolume?: number;
  smokeyVoiceId?: string;
  mapleVoiceId?: string;
} = {}): BearVoiceAgent {
  const callRef = useRef<VoiceCall | null>(null);
  const deviceRef = useRef<VoiceDevice | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const audioSetupTimerRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const callSidRef = useRef<string | null>(null);
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
    voiceRef.current.pitch = 0;
    voiceRef.current.activeBearId = "back_left_log";
    voiceRef.current.activeSpeechId = undefined;
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
    callSidRef.current = null;
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
      voiceRef.current.activeSpeechId = data.speechId;
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

    const handleQueued = (event: Event) => {
      const data = parseEventData(event as MessageEvent<string>);
      if (!data || !isBearId(data.bearId)) return;
      voiceRef.current.activeBearId = data.bearId;
      voiceRef.current.activeSpeechId = data.speechId;
      voiceRef.current.speakerSource = "backend";
      voiceRef.current.phase = "queued";
      voiceRef.current.isInterrupted = false;
      const trim = data.bearId === "back_left_log"
        ? speechVolumeRef.current.smokey
        : speechVolumeRef.current.maple;
      applyRemoteVolume(callRef.current, speechVolumeRef.current.master * trim);
      setActiveSpeakerName(bearNameForId(data.bearId));
    };

    const handleInterrupted = (event: Event) => {
      const data = parseEventData(event as MessageEvent<string>);
      if (!data || (data.speechId && data.speechId !== voiceRef.current.activeSpeechId)) return;
      voiceRef.current.phase = "interrupted";
      voiceRef.current.isInterrupted = true;
      voiceRef.current.activeSpeechId = undefined;
      setActiveSpeakerName(null);
    };

    const handleEnded = (event: Event) => {
      const data = parseEventData(event as MessageEvent<string>);
      if (!data || (data.speechId && data.speechId !== voiceRef.current.activeSpeechId)) return;
      voiceRef.current.phase = "idle";
      voiceRef.current.isInterrupted = false;
      voiceRef.current.activeSpeechId = undefined;
      setActiveSpeakerName(null);
    };

    eventSource.addEventListener("bear.speech.queued", handleQueued);
    eventSource.addEventListener("bear.speech.started", handleStarted);
    eventSource.addEventListener("bear.speech.interrupted", handleInterrupted);
    eventSource.addEventListener("bear.speech.ended", handleEnded);
    eventSource.onmessage = (event) => {
      const data = parseEventData(event);
      if (data?.type === "bear.speech.queued") handleQueued(event);
      if (data?.type === "bear.speech.started") handleStarted(event);
      if (data?.type === "bear.speech.interrupted") handleInterrupted(event);
      if (data?.type === "bear.speech.ended") handleEnded(event);
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
          applyLipSyncFrame(voiceRef.current, lipsync(rms, spectrum, samples, performance.now()));
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

  const reactToFishFire = useCallback(() => {
    const callSid = callSidRef.current;
    if (!callSid) return;
    const configuredBaseUrl = process.env.NEXT_PUBLIC_BEAR_AGENT_BASE_URL?.trim();
    const agentBaseUrl = process.env.NODE_ENV === "production" ? configuredBaseUrl : DEV_AGENT_BASE_URL;
    if (!agentBaseUrl) return;
    const url = new URL(`/fish-reaction/${encodeURIComponent(callSid)}`, agentBaseUrl);
    const eventToken = process.env.NEXT_PUBLIC_BEAR_EVENT_TOKEN?.trim();
    if (process.env.NODE_ENV === "production" && eventToken) url.searchParams.set("token", eventToken);
    void fetch(url, { method: "POST" });
  }, []);

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
        params: {
          To: process.env.NEXT_PUBLIC_BEAR_AGENT_TO || DEFAULT_DESTINATION,
          ...(smokeyVoiceId ? { SmokeyVoice: smokeyVoiceId } : {}),
          ...(mapleVoiceId ? { MapleVoice: mapleVoiceId } : {}),
        },
      });
      callRef.current = call;
      call.on("accept", (acceptedCall?: unknown) => {
        const accepted = (acceptedCall || call) as VoiceCall;
        const callSid = accepted.parameters?.CallSid || call.parameters?.CallSid;
        setStatus("active");
        monitorRemoteAudio(accepted);
        if (callSid) {
          subscribeToAgentEvents(callSid);
          callSidRef.current = callSid;
        }
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
  }, [cleanup, mapleVoiceId, monitorRemoteAudio, smokeyVoiceId, subscribeToAgentEvents]);

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
    reactToFishFire,
    status,
    stop,
    toggleMute,
    voiceRef,
  };
}
