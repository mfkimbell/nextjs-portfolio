import type { MutableRefObject } from "react";

export type BearVoiceBearId = "back_left_log" | "back_right_log";

/** Live voice data read by the scene without causing React renders at audio-frame rate. */
export type BearVoiceState = {
  activeBearId: BearVoiceBearId;
  isRemoteSpeaking: boolean;
  remoteAudioLevel: number;
  /** Transport phase is separate from a future speaker identity event. */
  phase?: "idle" | "remote-speaking" | "interrupted";
  /** Monotonic mixed-audio segment marker; safe for a future speaker-event channel to replace. */
  segmentId?: number;
  /** The current identity is a stable fallback until the backend supplies one. */
  speakerSource?: "default" | "backend";
  /** Lets future transport interruptions end a segment without inventing a new speaker. */
  isInterrupted?: boolean;
};

export type BearVoiceStateRef = MutableRefObject<BearVoiceState>;
