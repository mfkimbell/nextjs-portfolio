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

/**
 * Something that just happened in the camp that the bears should know about.
 * The site sends the id; the bear coordinator (agent/src/scene-events.ts) owns
 * what it means - the line the bears say about it, and what they remember of
 * it in later answers. Keep the two lists in step.
 *
 *   fish.burned    - the visitor threw the fish in the fire (sent once the
 *                    bears have finished watching it burn)
 *   tent.finished  - the last of the four voices from inside the tent
 */
export type SceneEventId = "fish.burned" | "tent.finished";
