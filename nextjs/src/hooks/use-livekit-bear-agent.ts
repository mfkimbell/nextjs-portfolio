"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { BearVoiceAgent, MicrophonePermission } from "@/hooks/useBearVoiceAgent";
import type { BearVoiceState, BearVoiceStateRef } from "@/lib/bearVoiceState";
import { applyLipSyncFrame, createLipSyncAnalyzer } from "@/lib/bearLipSync";

const DEFAULT_SMOKEY_PITCH_RATE = 0.9;
const DEFAULT_MAPLE_PITCH_RATE = 1.12;

type VoiceStatus = "idle" | "connecting" | "active" | "disconnected" | "error";
type BearAmbienceGraph = { filter: BiquadFilterNode; panner: StereoPannerNode; dry: GainNode; wet: GainNode };

const SMOKEY_PAN = -1;
const MAPLE_PAN = 1;
const BEAR_DISTANCE_FILTER_HZ = 4_800;
const BEAR_DRY_GAIN = 0.72;
const BEAR_REVERB_GAIN = 0.18;

const publishVisitorReady = async (room: Room) => {
  const payload = new Uint8Array(new TextEncoder().encode(JSON.stringify({ type: "visitor.ready" })));
  await room.localParticipant.publishData(payload, { reliable: true });
};

export const useLiveKitBearAgent = (
  voice = "marin",
  pitch = { smokey: DEFAULT_SMOKEY_PITCH_RATE, maple: DEFAULT_MAPLE_PITCH_RATE },
): BearVoiceAgent => {
  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const participantBearsRef = useRef(new Map<string, BearVoiceState["activeBearId"]>());
  const audioContextsRef = useRef(new Map<string, AudioContext>());
  const ambienceGraphsRef = useRef(new Map<string, BearAmbienceGraph>());
  const audioFramesRef = useRef(new Map<string, number>());
  const trackStatesRef = useRef(new Map<string, { state: BearVoiceState; rms: number; lastAudibleAt: number }>());
  const subscriptionTimerRef = useRef<number | null>(null);
  const readyRequestedRef = useRef(false);

  const voiceRef = useRef<BearVoiceState>({
    activeBearId: "back_left_log",
    isRemoteSpeaking: false,
    remoteAudioLevel: 0,
    phase: "idle",
    segmentId: 0,
    speakerSource: "backend",
    isInterrupted: false,
  }) as BearVoiceStateRef;
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [activeSpeakerName, setActiveSpeakerName] = useState<string | null>(null);
  const [spokenText, setSpokenText] = useState<string | null>(null);
  const [dialoguePhase, setDialoguePhase] = useState<"idle" | "playing" | "your-turn">("idle");
  const [microphonePermission, setMicrophonePermission] = useState<MicrophonePermission>("prompt");

  const requestMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophonePermission("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophonePermission("granted");
    } catch (requestError) {
      setMicrophonePermission(requestError instanceof DOMException && requestError.name === "NotAllowedError" ? "denied" : "prompt");
    }
  }, []);

  const cleanup = useCallback(() => {
    for (const frame of audioFramesRef.current.values()) cancelAnimationFrame(frame);
    audioFramesRef.current.clear();
    for (const context of audioContextsRef.current.values()) void context.close();
    audioContextsRef.current.clear();
    ambienceGraphsRef.current.clear();
    trackStatesRef.current.clear();
    if (subscriptionTimerRef.current !== null) window.clearInterval(subscriptionTimerRef.current);
    subscriptionTimerRef.current = null;
    for (const element of audioElementsRef.current) element.remove();
    audioElementsRef.current = [];
    roomRef.current?.disconnect();
    roomRef.current = null;
    voiceRef.current.isRemoteSpeaking = false;
    voiceRef.current.phase = "idle";
    setIsRemoteSpeaking(false);
    setActiveSpeakerName(null);
    setSpokenText(null);
    setDialoguePhase("idle");
    setIsMuted(false);
  }, [voiceRef]);

  const updateAmbience = useCallback((identity: string, bear: BearVoiceState["activeBearId"]) => {
    const graph = ambienceGraphsRef.current.get(identity);
    if (!graph) return;
    const now = graph.filter.context.currentTime;
    graph.panner.pan.setTargetAtTime(bear === "back_right_log" ? MAPLE_PAN : SMOKEY_PAN, now, 0.05);
    graph.filter.frequency.setTargetAtTime(BEAR_DISTANCE_FILTER_HZ, now, 0.08);
    graph.dry.gain.setTargetAtTime(BEAR_DRY_GAIN, now, 0.05);
    graph.wet.gain.setTargetAtTime(BEAR_REVERB_GAIN, now, 0.05);
  }, []);

  const monitorAudioTrack = useCallback((track: Track, participantIdentity: string) => {
    if (track.kind !== Track.Kind.Audio || audioContextsRef.current.has(participantIdentity)) return;
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.25;
    const source = context.createMediaStreamSource(new MediaStream([mediaTrack]));
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    const panner = context.createStereoPanner();
    const dry = context.createGain();
    const wet = context.createGain();
    const convolver = context.createConvolver();
    const impulse = context.createBuffer(2, Math.floor(context.sampleRate * 0.24), context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / data.length, 3);
      }
    }
    convolver.buffer = impulse;
    source.connect(analyser);
    source.connect(filter);
    filter.connect(panner);
    panner.connect(dry);
    panner.connect(convolver);
    convolver.connect(wet);
    dry.connect(context.destination);
    wet.connect(context.destination);
    audioContextsRef.current.set(participantIdentity, context);
    ambienceGraphsRef.current.set(participantIdentity, { filter, panner, dry, wet });
    const bear = participantBearsRef.current.get(participantIdentity)
      ?? (participantIdentity.includes("maple") ? "back_right_log" : "back_left_log");
    updateAmbience(participantIdentity, bear);
    void context.resume();
    const samples = new Float32Array(analyser.fftSize);
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    const lipSync = createLipSyncAnalyzer(context.sampleRate, analyser.fftSize);
    const state: BearVoiceState = {
      activeBearId: "back_left_log",
      isRemoteSpeaking: false,
      remoteAudioLevel: 0,
      phase: "idle",
      segmentId: 0,
      speakerSource: "backend",
      isInterrupted: false,
    };
    const trackState = { state, rms: 0, lastAudibleAt: 0 };
    trackStatesRef.current.set(participantIdentity, trackState);
    const measure = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      analyser.getFloatFrequencyData(spectrum);
      const now = performance.now();
      applyLipSyncFrame(state, lipSync(rms, spectrum, samples, now));
      if (rms > 0.012) trackState.lastAudibleAt = now;
      trackState.rms = rms;
      const active = [...trackStatesRef.current.entries()]
        .filter(([, candidate]) => now - candidate.lastAudibleAt < 350)
        .sort((a, b) => b[1].rms - a[1].rms)[0];
      const speaking = Boolean(active);
      if (active) {
        const [identity, candidate] = active;
        const bear = participantBearsRef.current.get(identity)
          ?? (identity.includes("maple") ? "back_right_log" : "back_left_log");
        voiceRef.current.activeBearId = bear;
        voiceRef.current.remoteAudioLevel = candidate.rms;
        voiceRef.current.mouthOpen = candidate.state.mouthOpen;
        voiceRef.current.mouthWide = candidate.state.mouthWide;
        voiceRef.current.mouthRound = candidate.state.mouthRound;
        voiceRef.current.pitch = candidate.state.pitch;
        voiceRef.current.syllable = candidate.state.syllable;
        voiceRef.current.syllableStrength = candidate.state.syllableStrength;
        voiceRef.current.accent = candidate.state.accent;
        voiceRef.current.accentStrength = candidate.state.accentStrength;
        voiceRef.current.phase = "remote-speaking";
        setActiveSpeakerName(bear === "back_left_log" ? "Smokey" : "Maple");
      } else {
        voiceRef.current.phase = "idle";
        voiceRef.current.remoteAudioLevel = 0;
        setActiveSpeakerName(null);
      }
      voiceRef.current.isRemoteSpeaking = speaking;
      setIsRemoteSpeaking(speaking);
      audioFramesRef.current.set(participantIdentity, requestAnimationFrame(measure));
    };
    measure();
  }, [updateAmbience, voiceRef]);

  const start = useCallback(async () => {
    if (roomRef.current) return;
    setStatus("connecting");
    setError(null);
    try {
      const room = new Room();
      roomRef.current = room;
      // Request browser audio unlock synchronously from the Talk button gesture
      // before network/token awaits can consume the activation window.
      void room.startAudio().catch(() => {});
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          room: `bear-room-${crypto.randomUUID()}`,
          voice,
          smokeyPitch: pitch.smokey,
          maplePitch: pitch.maple,
        }),
      });
      if (!response.ok) throw new Error("Unable to create a LiveKit room.");
      const { token, url } = await response.json() as { token?: string; url?: string };
      if (!token || !url) throw new Error("LiveKit token response was incomplete.");

      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach() as HTMLAudioElement;
        element.autoplay = true;
        // Web Audio owns audible output so each bear gets an independent spatial mix.
        element.muted = true;
        document.body.append(element);
        audioElementsRef.current.push(element);
        console.log("LiveKit remote audio track attached", { participant: participant.identity, trackSid: track.sid });
        void element.play().catch((playError: unknown) => {
          console.warn("LiveKit audio playback was blocked", playError);
          setError("LiveKit audio playback was blocked by the browser. Click Talk again to unlock audio.");
        });
        monitorAudioTrack(track, participant.identity);
      });
      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        if (publication.kind === Track.Kind.Audio) {
          console.log("LiveKit remote audio track published", { participant: participant.identity, trackSid: publication.trackSid });
          void publication.setSubscribed(true);
        }
      });
      room.on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant, reason) => {
        console.error("LiveKit audio subscription failed", { trackSid, participant: participant.identity, reason });
        setError("LiveKit could not subscribe to a bear audio track.");
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        console.log("LiveKit audio playback status", { allowed: room.canPlaybackAudio });
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const speaker = speakers[0];
        const bear = speaker ? participantBearsRef.current.get(speaker.identity) : undefined;
        if (bear) voiceRef.current.activeBearId = bear;
      });
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        if (!participant) return;
        try {
          const event = JSON.parse(new TextDecoder().decode(payload)) as { type?: unknown; bear?: unknown; text?: unknown };
          if (event.type === "bear.play" && typeof event.text === "string") {
            setSpokenText(event.text);
            setDialoguePhase("playing");
          }
          if (event.type === "turn.completed") setDialoguePhase("your-turn");
          if (event.type !== "bear.identity" || (event.bear !== "smokey" && event.bear !== "maple")) return;
          const bear = event.bear === "maple" ? "back_right_log" : "back_left_log";
          participantBearsRef.current.set(participant.identity, bear);
          updateAmbience(participant.identity, bear);
        } catch {
          // Ignore non-bear room data.
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room) cleanup();
        setStatus("disconnected");
      });
      await room.connect(url, token, { autoSubscribe: true });
      const subscribeToAgentAudio = () => {
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.kind === Track.Kind.Audio && !publication.isSubscribed) {
              console.log("LiveKit requesting remote audio subscription", { participant: participant.identity, trackSid: publication.trackSid });
              publication.setSubscribed(true);
            }
          }
        }
      };
      subscribeToAgentAudio();
      subscriptionTimerRef.current = window.setInterval(subscribeToAgentAudio, 500);
      setStatus("active");
      if (readyRequestedRef.current) {
        await publishVisitorReady(room);
        readyRequestedRef.current = false;
      }
    } catch (startError) {
      cleanup();
      setError(startError instanceof Error ? startError.message : "Unable to connect to LiveKit.");
      setStatus("error");
    }
  }, [cleanup, monitorAudioTrack, pitch.maple, pitch.smokey, updateAmbience, voice, voiceRef]);

  const stop = useCallback(() => {
    cleanup();
    setStatus("disconnected");
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const nextMuted = !isMuted;
    void room.localParticipant.setMicrophoneEnabled(!nextMuted);
    setIsMuted(nextMuted);
  }, [isMuted]);

  const sendTextMessage = useCallback(async (text: string) => {
    const room = roomRef.current;
    if (!room || !text.trim()) return false;
    const payload = new Uint8Array(new TextEncoder().encode(JSON.stringify({ type: "visitor.message", text: text.trim() })));
    await room.localParticipant.publishData(
      payload,
      { reliable: true },
    );
    return true;
  }, []);

  const beginConversation = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return false;
    readyRequestedRef.current = true;
    try {
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicrophonePermission("granted");
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Microphone or audio activation was blocked.");
      return false;
    }
    if ((room as unknown as { state?: string }).state !== "connected") return true;
    await publishVisitorReady(room);
    readyRequestedRef.current = false;
    return true;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);
  useEffect(() => {
    void requestMicrophone();
  }, [requestMicrophone]);

  return {
    activeSpeakerName,
    error,
    isMuted,
    microphonePermission,
    isRemoteSpeaking,
    remoteAudioLevel: 0,
    spokenText,
    dialoguePhase,
    reactToFishFire: () => {},
    requestMicrophone,
    beginConversation,
    sendTextMessage,
    start,
    status,
    stop,
    toggleMute,
    voiceRef,
  };
};
