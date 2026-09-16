// components/TalkToTheBirds.tsx
"use client";

import React from "react";
import ToucanScene from "./ToucanScene";
import type { VoiceState } from "./ToucanGLB";
import { useToucanVoiceAgent } from "@/hooks/useToucanVoiceAgent";

export default function TalkToTheBirds() {
  const {
    agentAudioLevel,
    callSid,
    error,
    identity,
    isAgentSpeaking,
    isMuted,
    start,
    status,
    stop,
    toggleMute,
    transcript,
  } = useToucanVoiceAgent();

  const isConnecting = status === "connecting";
  const isActive = status === "active";

  // The birds read the voice state from a ref instead of props. The hook
  // updates agentAudioLevel on every animation frame, so passing it down as a
  // value would re-render the 3D canvas 60 times a second. Mutating a stable
  // ref during render is safe here: it's a plain mirror of values we already
  // hold, and only useFrame ever reads it.
  const voiceRef = React.useRef<VoiceState>({
    isAgentSpeaking: false,
    agentAudioLevel: 0,
  });
  voiceRef.current.isAgentSpeaking = isAgentSpeaking;
  voiceRef.current.agentAudioLevel = agentAudioLevel;

  return (
    <section
      id="talk-to-the-birds"
      className="relative z-20 w-full overflow-hidden py-10 sm:py-14"
    >
      <h2 className="text-4xl font-bold neon-text text-center mb-4">
        Talk To The Birds
      </h2>

      <div className="relative z-30 mx-auto mb-8 flex max-w-3xl flex-col items-center gap-3 px-4 text-center">
        <p className="max-w-2xl text-sm text-white/85 sm:text-base">
          Press the button, allow microphone access, and talk to the portfolio
          agent. For now, call state and transcript events are also logged in
          your browser console.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {!isActive ? (
            <button
              type="button"
              onClick={start}
              disabled={isConnecting}
              className="rounded-full border border-white/40 bg-white/90 px-5 py-2.5 font-semibold text-sky-700 shadow-lg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isConnecting ? "Calling the toucans…" : "Talk to the Toucans"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleMute}
                className="rounded-full border border-white/40 bg-white/90 px-5 py-2.5 font-semibold text-sky-700 shadow-lg transition hover:bg-white"
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={stop}
                className="rounded-full border border-red-200/60 bg-red-500/90 px-5 py-2.5 font-semibold text-white shadow-lg transition hover:bg-red-500"
              >
                Hang up
              </button>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/25 bg-sky-950/25 px-4 py-3 text-left text-xs text-white/85 shadow-lg backdrop-blur-sm sm:text-sm">
          <div>
            <span className="font-semibold text-white">Status:</span> {status}
            {isAgentSpeaking ? " · toucan audio active" : ""}
          </div>
          <div>
            <span className="font-semibold text-white">Identity:</span> {identity}
          </div>
          {callSid && (
            <div>
              <span className="font-semibold text-white">Call SID:</span> {callSid}
            </div>
          )}
          {error && <div className="text-red-100">Error: {error}</div>}
        </div>

        {transcript.length > 0 && (
          <div className="max-h-44 w-full max-w-2xl overflow-auto rounded-2xl border border-white/25 bg-sky-950/30 p-4 text-left text-sm text-white/90 shadow-lg backdrop-blur-sm">
            {transcript.slice(-8).map((entry, index) => (
              <div key={`${entry.role}-${index}`} className="mb-2 last:mb-0">
                <span className="font-semibold uppercase tracking-wide text-white/70">
                  {entry.role}:
                </span>{" "}
                {entry.text}
              </div>
            ))}
          </div>
        )}
      </div>

      <ToucanScene voiceRef={voiceRef} />
    </section>
  );
}
