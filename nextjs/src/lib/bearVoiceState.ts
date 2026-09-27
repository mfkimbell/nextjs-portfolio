import type { MutableRefObject } from "react";

export type BearVoiceBearId = "back_left_log" | "back_right_log";

/** Live voice data read by the scene without causing React renders at audio-frame rate. */
export type BearVoiceState = {
  activeBearId: BearVoiceBearId;
  isRemoteSpeaking: boolean;
  remoteAudioLevel: number;
};

export type BearVoiceStateRef = MutableRefObject<BearVoiceState>;
