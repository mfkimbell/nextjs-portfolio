"use client";

/**
 * Scene-lab test source for the talking bears: drives the same voice state the
 * live Twilio call does (BearVoiceState), from your microphone or an audio
 * file, through the same analyser (src/lib/bearLipSync.ts). Lets the
 * bearTalk* knobs be tuned without placing a call.
 *
 *   mic  - getUserMedia -> analyser only (not played back, so no feedback).
 *   file - an <audio> element -> analyser -> speakers, so you hear what the
 *          bear is lip-syncing to.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BearVoiceBearId, BearVoiceState } from "@/lib/bearVoiceState";
import { applyLipSyncFrame, createLipSyncAnalyzer } from "@/lib/bearLipSync";

export type BearTalkTestSource = "off" | "mic" | "file";

export function useBearTalkTest() {
  const voiceRef = useRef<BearVoiceState>({
    activeBearId: "back_left_log",
    isRemoteSpeaking: false,
    remoteAudioLevel: 0,
    phase: "idle",
    segmentId: 0,
    speakerSource: "backend",
    isInterrupted: false,
  });
  const [source, setSource] = useState<BearTalkTestSource>("off");
  const [speaker, setSpeakerState] = useState<BearVoiceBearId>("back_left_log");
  const [error, setError] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.src = ""; }
    audioElRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    const v = voiceRef.current;
    v.isRemoteSpeaking = false;
    v.remoteAudioLevel = 0;
    v.mouthOpen = 0; v.mouthWide = 0; v.mouthRound = 0; v.pitch = 0;
    v.phase = "idle";
    setSource("off");
  }, []);

  useEffect(() => stop, [stop]);

  const setSpeaker = useCallback((id: BearVoiceBearId) => {
    voiceRef.current.activeBearId = id;
    setSpeakerState(id);
  }, []);

  const run = useCallback((ctx: AudioContext, node: AudioNode, label: BearTalkTestSource) => {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.25;
    node.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    const lipsync = createLipSyncAnalyzer(ctx.sampleRate, analyser.fftSize);
    let lastAudible = 0;
    const measure = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const x of samples) sum += x * x;
      const rms = Math.sqrt(sum / samples.length);
      analyser.getFloatFrequencyData(spectrum);
      const v = voiceRef.current;
      applyLipSyncFrame(v, lipsync(rms, spectrum, samples, performance.now()));
      const now = Date.now();
      if (rms > 0.012) lastAudible = now;
      v.remoteAudioLevel = rms;
      v.isRemoteSpeaking = now - lastAudible < 350;
      v.phase = v.isRemoteSpeaking ? "remote-speaking" : "idle";
      rafRef.current = requestAnimationFrame(measure);
    };
    setSource(label);
    measure();
  }, []);

  const startMic = useCallback(async () => {
    stop();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      streamRef.current = stream;
      run(ctx, ctx.createMediaStreamSource(stream), "mic");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone unavailable");
      stop();
    }
  }, [run, stop]);

  const startFile = useCallback(async (file: File) => {
    stop();
    setError(null);
    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      const el = new Audio(url);
      audioElRef.current = el;
      const src = ctx.createMediaElementSource(el);
      src.connect(ctx.destination);   // hear it
      run(ctx, src, "file");
      el.onended = () => stop();
      await el.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not play that file");
      stop();
    }
  }, [run, stop]);

  return { voiceRef, source, speaker, setSpeaker, startMic, startFile, stop, error };
}
