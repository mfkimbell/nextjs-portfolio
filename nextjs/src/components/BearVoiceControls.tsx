"use client";

import type { BearVoiceAgent } from "@/hooks/useBearVoiceAgent";

const liveKitVoices = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];

export default function BearVoiceControls({
  agent,
  transport,
  voice,
  onVoiceChange,
  mapleVoice,
  onMapleVoiceChange,
  smokeyPitch,
  maplePitch,
  onSmokeyPitchChange,
  onMaplePitchChange,
}: {
  agent: BearVoiceAgent;
  transport: "twilio" | "livekit";
  voice: string;
  onVoiceChange: (voice: string) => void;
  mapleVoice?: string;
  onMapleVoiceChange?: (voice: string) => void;
  smokeyPitch: number;
  maplePitch: number;
  onSmokeyPitchChange: (value: number) => void;
  onMaplePitchChange: (value: number) => void;
}) {
  const { activeSpeakerName, error, isMuted, isRemoteSpeaking, microphonePermission, requestMicrophone, start, status, stop, toggleMute } = agent;
  const isConnecting = status === "connecting";
  const isActive = status === "active";
  const needsMicrophone = microphonePermission !== "granted" && microphonePermission !== "unsupported";
  const statusText = error || (needsMicrophone
    ? microphonePermission === "denied" ? "Microphone blocked" : "Microphone access needed"
    : isActive ? (activeSpeakerName ? `${activeSpeakerName} speaking` : isRemoteSpeaking ? "Bear is speaking" : "Listening") : status);
  const handleRequestMicrophone = () => {
    void requestMicrophone();
  };

  return (
    <section
      aria-label="Talk to the bear"
      className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/70 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md"
    >
      <span aria-live="polite" className="max-w-28 truncate text-white/80">
        {statusText}
      </span>
      {!isActive ? (
        <div className="flex items-center gap-1 text-[0.6rem] text-white/60">
          <label className="flex items-center gap-1">
            {transport === "livekit" ? "Smokey" : "Smokey"}
          {transport === "livekit" ? (
            <select value={voice} onChange={(event) => onVoiceChange(event.target.value)} className="max-w-20 rounded bg-black/60 px-1 py-0.5 text-white">
              {liveKitVoices.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <input value={voice} onChange={(event) => onVoiceChange(event.target.value)} className="w-24 rounded bg-black/60 px-1 py-0.5 text-white" />
          )}
          </label>
          {transport === "twilio" && mapleVoice && onMapleVoiceChange ? (
            <label className="flex items-center gap-1">
              Maple
              <input value={mapleVoice} onChange={(event) => onMapleVoiceChange(event.target.value)} className="w-24 rounded bg-black/60 px-1 py-0.5 text-white" />
            </label>
          ) : null}
          {transport === "livekit" ? (
            <>
              <label className="flex items-center gap-1">S pitch <input aria-label="Smokey pitch" type="range" min="0.7" max="1.1" step="0.01" value={smokeyPitch} onChange={(event) => onSmokeyPitchChange(Number(event.target.value))} /></label>
              <label className="flex items-center gap-1">M pitch <input aria-label="Maple pitch" type="range" min="0.95" max="1.6" step="0.01" value={maplePitch} onChange={(event) => onMaplePitchChange(Number(event.target.value))} /></label>
            </>
          ) : null}
        </div>
      ) : null}
      {needsMicrophone ? (
        <button
          type="button"
          onClick={handleRequestMicrophone}
          className="rounded-full bg-amber-200 px-3 py-1.5 font-semibold text-stone-950 transition hover:bg-amber-100"
        >
          {microphonePermission === "denied" ? "Retry mic" : "Allow mic"}
        </button>
      ) : !isActive ? (
        <button
          type="button"
          onClick={start}
          disabled={isConnecting}
          className="rounded-full bg-amber-200 px-3 py-1.5 font-semibold text-stone-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isConnecting ? "Starting" : "Talk"}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={isMuted}
            className="rounded-full border border-white/30 px-3 py-1.5 font-semibold transition hover:bg-white/15"
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={stop}
            className="rounded-full bg-red-500 px-3 py-1.5 font-semibold transition hover:bg-red-400"
          >
            End
          </button>
        </>
      )}
    </section>
  );
}
