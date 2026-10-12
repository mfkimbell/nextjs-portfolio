"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { BearVoiceAgent, MicrophonePermission } from "@/hooks/useBearVoiceAgent";
import type { BearVoiceState, BearVoiceStateRef } from "@/lib/bearVoiceState";
import { applyLipSyncFrame, createLipSyncAnalyzer } from "@/lib/bearLipSync";
import { getSharedAudioContext } from "@/lib/campsiteSounds";

const DEFAULT_SMOKEY_PITCH_RATE = 0.9;
const DEFAULT_MAPLE_PITCH_RATE = 0.97;

type VoiceStatus = "idle" | "connecting" | "active" | "disconnected" | "error";
type BearAmbienceGraph = { filter: BiquadFilterNode; panner: StereoPannerNode; dry: GainNode; wet: GainNode };

const SMOKEY_PAN = -1;
const MAPLE_PAN = 1;
const BEAR_DISTANCE_FILTER_HZ = 4_800;
const BEAR_DRY_GAIN = 0.72;
const BEAR_REVERB_GAIN = 0.18;

/** Voice debugging: everything is tagged "[bears]" - filter the console on it.
 *  Each room gets a short id so two rooms alive at once are obvious. */
const bearLog = (msg: string, data?: Record<string, unknown>) => console.log(`[bears] ${msg}`, data ?? "");
const bearWarn = (msg: string, data?: Record<string, unknown>) => console.warn(`[bears] ${msg}`, data ?? "");
let liveRooms = 0;

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
  /*
   * THE DOUBLED VOICE. livekit-client's room.startAudio() un-mutes every
   * attached <audio> element (unless webAudioMix is on). Ours are muted on
   * purpose - each bear's sound comes out through our own Web Audio graph
   * (panning, distance, reverb) - so after startAudio ran (enabling the mic
   * calls it) every bear played TWICE: once from the element, once from the
   * graph. That is why it began right after the visitor first spoke.
   * Every startAudio now goes through this, which mutes them again.
   */
  const startAudioSafely = async (room: Room) => {
    try { await room.startAudio(); } finally {
      for (const el of audioElementsRef.current) el.muted = true;
    }
  };
  const participantBearsRef = useRef(new Map<string, BearVoiceState["activeBearId"]>());
  // One graph per bear participant, all on the page's SHARED AudioContext.
  // (Each bear used to get its own `new AudioContext()`: iOS caps how many a
  //  page may hold and starts each one suspended outside a tap, and closing
  //  them on teardown was the only cleanup.)
  const audioContextsRef = useRef(new Map<string, { context: AudioContext; nodes: AudioNode[] }>());
  const ambienceGraphsRef = useRef(new Map<string, BearAmbienceGraph>());
  const audioFramesRef = useRef(new Map<string, number>());
  const trackStatesRef = useRef(new Map<string, { state: BearVoiceState; rms: number; lastAudibleAt: number }>());
  const subscriptionTimerRef = useRef<number | null>(null);
  const readyRequestedRef = useRef(false);
  const doubleWarnRef = useRef({ at: 0 });

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
  // the latest line PER BEAR, so a bubble only ever shows its own bear's words
  // (bear.play for Maple arrives a beat before her voice does - showing the
  //  shared "latest line" put her words in Smokey's bubble for a moment)
  const [spokenByBear, setSpokenByBear] = useState<{ Smokey: string | null; Maple: string | null }>({ Smokey: null, Maple: null });
  const [dialoguePhase, setDialoguePhase] = useState<"idle" | "playing" | "your-turn">("idle");
  const [channelRequest, setChannelRequest] = useState(0);
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
    for (const g of audioContextsRef.current.values()) g.nodes.forEach((n) => { try { n.disconnect(); } catch { /* already */ } });
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
    setSpokenByBear({ Smokey: null, Maple: null });
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
    if (track.kind !== Track.Kind.Audio) return;
    if (audioContextsRef.current.has(participantIdentity)) {
      bearLog("audio track for a participant that already has a graph - not adding a second one", { participant: participantIdentity, trackSid: track.sid });
      return;
    }
    bearLog("creating audio graph", { participant: participantIdentity, trackSid: track.sid, graphsNow: audioContextsRef.current.size + 1 });
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return;
    const context = getSharedAudioContext() ?? new AudioContext();
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
    audioContextsRef.current.set(participantIdentity, { context, nodes: [source, analyser, filter, panner, dry, wet, convolver] });
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
    const lastDoubleWarn = doubleWarnRef.current;
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
      // doubled-voice detector: two different participants audible as the SAME bear
      const audibleByBear = new Map<string, string[]>();
      for (const [identity, candidate] of trackStatesRef.current) {
        if (now - candidate.lastAudibleAt > 120) continue;
        const b = participantBearsRef.current.get(identity) ?? (identity.includes("maple") ? "back_right_log" : "back_left_log");
        audibleByBear.set(b, [...(audibleByBear.get(b) ?? []), identity]);
      }
      for (const [b, ids] of audibleByBear) {
        if (ids.length > 1 && now - lastDoubleWarn.at > 2000) {
          lastDoubleWarn.at = now;
          bearWarn("DOUBLED VOICE: two participants audible as the same bear", { bear: b, participants: ids, graphs: [...audioContextsRef.current.keys()] });
        }
      }
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
    if (roomRef.current) { bearLog("start() ignored - a room already exists", { room: roomRef.current.name || "(connecting)" }); return; }
    setStatus("connecting");
    setError(null);
    try {
      const room = new Room();
      roomRef.current = room;
      const roomTag = Math.random().toString(36).slice(2, 7);
      bearLog("start: new room", { roomTag });
      // Request browser audio unlock synchronously from the Talk button gesture
      // before network/token awaits can consume the activation window.
      void startAudioSafely(room).catch(() => {});
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
      // Stale start: this room was torn down while the token was being fetched
      // (React dev mounts effects twice; a stop() can land mid-start). Without
      // this check the abandoned room still connected, got its OWN bears
      // dispatched, and the visitor heard every line twice.
      if (roomRef.current !== room) { bearWarn("stale start after token fetch - dropping room (this used to double the voices)", { roomTag }); void room.disconnect(); return; }
      if (!token || !url) throw new Error("LiveKit token response was incomplete.");

      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        if (roomRef.current !== room) { bearWarn("audio from a room that is no longer current - ignored", { roomTag, participant: participant.identity }); return; }
        bearLog("track subscribed", { roomTag, room: room.name, participant: participant.identity, trackSid: track.sid, attachedElements: audioElementsRef.current.length + 1 });
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
          if (typeof event.type === "string" && event.type.startsWith("bear.") || event.type === "turn.completed") {
            bearLog(`data ${String(event.type)}`, { roomTag, from: participant.identity, bear: event.bear, text: typeof event.text === "string" ? event.text.slice(0, 60) : undefined });
          }
          if (event.type === "bear.play" && typeof event.text === "string") {
            setSpokenText(event.text);
            const who = event.bear === "maple" ? "Maple" : event.bear === "smokey" ? "Smokey" : null;
            if (who) { const text = event.text; setSpokenByBear((prev) => ({ ...prev, [who]: text })); }
            setDialoguePhase("playing");
          }
          if (event.type === "turn.completed") setDialoguePhase("your-turn");
          if (event.type === "ui.show_channel_options") setChannelRequest((n) => n + 1);
          if (event.type !== "bear.identity" || (event.bear !== "smokey" && event.bear !== "maple")) return;
          const bear = event.bear === "maple" ? "back_right_log" : "back_left_log";
          for (const [identity, other] of participantBearsRef.current) {
            if (other === bear && identity !== participant.identity) {
              // two agents speaking as the same bear (a duplicate dispatch):
              // keep the newest, silence the older so the voice isn't doubled
              console.warn("LiveKit: duplicate bear participant, muting the older one", { bear, identity });
              const g = ambienceGraphsRef.current.get(identity);
              if (g) { g.dry.gain.value = 0; g.wet.gain.value = 0; }
              participantBearsRef.current.delete(identity);
            }
          }
          participantBearsRef.current.set(participant.identity, bear);
          updateAmbience(participant.identity, bear);
        } catch {
          // Ignore non-bear room data.
        }
      });
      room.on(RoomEvent.ParticipantConnected, (p) => bearLog("participant joined", { roomTag, participant: p.identity, inRoom: room.remoteParticipants.size }));
      room.on(RoomEvent.ParticipantDisconnected, (p) => bearLog("participant left", { roomTag, participant: p.identity }));
      room.on(RoomEvent.Disconnected, () => {
        liveRooms = Math.max(0, liveRooms - 1);
        bearLog("room disconnected", { roomTag, liveRooms });
        if (roomRef.current === room) cleanup();
        setStatus("disconnected");
      });
      await room.connect(url, token, { autoSubscribe: true });
      if (roomRef.current !== room) { bearWarn("stale start after connect - dropping room", { roomTag }); void room.disconnect(); return; }
      const subscribeToAgentAudio = () => {
        // belt and braces for the doubled voice: nothing may un-mute our elements
        for (const el of audioElementsRef.current) if (!el.muted) { el.muted = true; bearWarn("re-muted a bear <audio> element (it would have doubled the voice)"); }
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
      liveRooms += 1;
      bearLog("room connected", { roomTag, room: room.name, participants: [...room.remoteParticipants.keys()], liveRooms });
      if (liveRooms > 1) bearWarn("MORE THAN ONE ROOM CONNECTED - every bear line will play once per room", { liveRooms });
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

  const beginConversation = useCallback(async (opts?: { microphone?: boolean }) => {
    const room = roomRef.current;
    if (!room) return false;
    readyRequestedRef.current = true;
    const withMic = opts?.microphone !== false;   // typewriter visitors talk by text only
    try {
      await startAudioSafely(room);
      await room.localParticipant.setMicrophoneEnabled(withMic);
      if (withMic) setMicrophonePermission("granted");
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Microphone or audio activation was blocked.");
      return false;
    }
    if ((room as unknown as { state?: string }).state !== "connected") return true;
    await publishVisitorReady(room);
    readyRequestedRef.current = false;
    return true;
  }, []);

  // The visitor picked "talk" after the greeting: ask for the mic (this is
  // what pops the browser's permission prompt) and publish it into the room.
  // No visitor.ready here - the bears have already said hello.
  const setMicrophone = useCallback(async (on: boolean) => {
    if (on) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicrophonePermission("unsupported");
        setError("This browser can't share a microphone. Try typing instead.");
        return false;
      }
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
        setMicrophonePermission("granted");
      } catch {
        setMicrophonePermission("denied");
        setError("Microphone blocked. Allow it in the address bar, or type instead.");
        return false;
      }
    }
    const room = roomRef.current;
    if (!room) return false;
    try {
      await startAudioSafely(room);
      await room.localParticipant.setMicrophoneEnabled(on);
      setIsMuted(!on);
      setError(null);
      return true;
    } catch (micError) {
      setError(micError instanceof Error ? micError.message : "Couldn't turn the microphone on.");
      return false;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);
  // (The microphone is asked for when the visitor picks the mic, not on load:
  //  phone and typewriter visitors never need it.)

  return {
    activeSpeakerName,
    error,
    isMuted,
    microphonePermission,
    isRemoteSpeaking,
    remoteAudioLevel: 0,
    spokenText,
    spokenByBear,
    dialoguePhase,
    reactToFishFire: () => {},
    requestMicrophone,
    beginConversation,
    sendTextMessage,
    setMicrophone,
    channelRequest,
    start,
    status,
    stop,
    toggleMute,
    voiceRef,
  };
};
