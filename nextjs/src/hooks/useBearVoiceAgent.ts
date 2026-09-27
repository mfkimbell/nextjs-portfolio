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
};

type VoiceDevice = {
  connect(options?: { params?: Record<string, string> }): Promise<VoiceCall>;
  destroy(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  register(): Promise<void>;
};

export type BearVoiceAgent = {
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

export function useBearVoiceAgent(): BearVoiceAgent {
  const callRef = useRef<VoiceCall | null>(null);
  const deviceRef = useRef<VoiceDevice | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const audioSetupTimerRef = useRef<number | null>(null);
  const activeBearTimerRef = useRef<number | null>(null);
  const voiceRef = useRef<BearVoiceState>({
    activeBearId: "back_left_log",
    isRemoteSpeaking: false,
    remoteAudioLevel: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);
  const [status, setStatus] = useState<VoiceStatus>("idle");

  const cleanupAudioMonitor = useCallback(() => {
    if (audioFrameRef.current !== null) {
      cancelAnimationFrame(audioFrameRef.current);
      audioFrameRef.current = null;
    }
    if (audioSetupTimerRef.current !== null) {
      window.clearTimeout(audioSetupTimerRef.current);
      audioSetupTimerRef.current = null;
    }
    if (activeBearTimerRef.current !== null) {
      window.clearInterval(activeBearTimerRef.current);
      activeBearTimerRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    voiceRef.current.isRemoteSpeaking = false;
    voiceRef.current.remoteAudioLevel = 0;
    voiceRef.current.activeBearId = "back_left_log";
    setIsRemoteSpeaking(false);
    setRemoteAudioLevel(0);
  }, []);

  const cleanup = useCallback(() => {
    cleanupAudioMonitor();
    try {
      deviceRef.current?.destroy();
    } catch {
      // The SDK may have already disposed the device after a call error.
    }
    callRef.current = null;
    deviceRef.current = null;
    setIsMuted(false);
  }, [cleanupAudioMonitor]);

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
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        const samples = new Float32Array(analyser.fftSize);
        let lastAudibleAt = 0;

        const measure = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += sample * sample;
          const rms = Math.sqrt(sum / samples.length);
          const now = Date.now();
          if (rms > 0.012) lastAudibleAt = now;
          const speaking = now - lastAudibleAt < 350;
          const wasSpeaking = voiceRef.current.isRemoteSpeaking;
          if (speaking && !wasSpeaking) {
            voiceRef.current.activeBearId = "back_left_log";
            // The voice backend currently reports only mixed remote audio, not a
            // speaker identity. Alternate predictably so exactly one bear speaks.
            activeBearTimerRef.current = window.setInterval(() => {
              voiceRef.current.activeBearId =
                voiceRef.current.activeBearId === "back_left_log"
                  ? "back_right_log"
                  : "back_left_log";
            }, 2000);
          } else if (!speaking && wasSpeaking) {
            if (activeBearTimerRef.current !== null) {
              window.clearInterval(activeBearTimerRef.current);
              activeBearTimerRef.current = null;
            }
            voiceRef.current.activeBearId = "back_left_log";
          }
          voiceRef.current.remoteAudioLevel = rms;
          voiceRef.current.isRemoteSpeaking = speaking;
          setRemoteAudioLevel(rms);
          setIsRemoteSpeaking(speaking);
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
      call.on("accept", () => {
        setStatus("active");
        monitorRemoteAudio(call);
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
  }, [cleanup, monitorRemoteAudio]);

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

  return { error, isMuted, isRemoteSpeaking, remoteAudioLevel, start, status, stop, toggleMute, voiceRef };
}
