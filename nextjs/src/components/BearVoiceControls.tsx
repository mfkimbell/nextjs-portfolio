"use client";

import type { BearVoiceAgent } from "@/hooks/useBearVoiceAgent";

export default function BearVoiceControls({ agent }: { agent: BearVoiceAgent }) {
  const { activeSpeakerName, error, isMuted, isRemoteSpeaking, start, status, stop, toggleMute } = agent;
  const isConnecting = status === "connecting";
  const isActive = status === "active";
  const statusText = error || (isActive ? (activeSpeakerName ? `${activeSpeakerName} speaking` : isRemoteSpeaking ? "Bear is speaking" : "Listening") : status);

  return (
    <section
      aria-label="Talk to the bear"
      className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/70 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md"
    >
      <span aria-live="polite" className="max-w-28 truncate text-white/80">
        {statusText}
      </span>
      {!isActive ? (
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
