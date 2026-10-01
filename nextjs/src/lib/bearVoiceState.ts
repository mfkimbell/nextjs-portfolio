import type { MutableRefObject } from "react";

export type BearVoiceBearId = "back_left_log" | "back_right_log";

/** Live voice data read by the scene without causing React renders at audio-frame rate. */
export type BearVoiceState = {
  activeBearId: BearVoiceBearId;
  activeSpeechId?: string;
  isRemoteSpeaking: boolean;
  remoteAudioLevel: number;
  /** Transport phase is separate from a future speaker identity event. */
  phase?: "idle" | "queued" | "remote-speaking" | "interrupted";
  /** Monotonic mixed-audio segment marker; safe for a future speaker-event channel to replace. */
  segmentId?: number;
  /** The current identity is a stable fallback until the backend supplies one. */
  speakerSource?: "default" | "backend";
  /** Lets future transport interruptions end a segment without inventing a new speaker. */
  isInterrupted?: boolean;
  /**
   * Lip-sync features, 0..1, derived per audio frame from the remote stream's
   * spectrum (see useBearVoiceAgent's measure()). Raw targets - the scene does
   * its own attack/release smoothing so this stays cheap and frame-agnostic.
   *   mouthOpen  - jaw opening: loudness vs a rolling peak, boosted by F1 energy
   *   mouthWide  - brighter-than-this-voice's-average spectrum (E, I, S, T)
   *   mouthRound - darker-than-average spectrum (O, U, W)
   */
  mouthOpen?: number;
  mouthWide?: number;
  mouthRound?: number;
  /** Increments once per detected syllable onset - drives nods, blinks, variation. */
  syllable?: number;
  /** 0..1 strength of the most recent onset (stressed syllables are bigger). */
  syllableStrength?: number;
  /** Semitones vs the speaker's running median F0 (0 when unvoiced) - drives head lift. */
  pitch?: number;
  /** Increments on each PROMINENT syllable only (~1/4 of them, >=0.7s apart) - nods, lean, backchannels. */
  accent?: number;
  /** 0..1 prominence of the latest accent. */
  accentStrength?: number;
};

export type BearVoiceStateRef = MutableRefObject<BearVoiceState>;
