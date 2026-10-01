export const normalizedSpeech = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const hasPlayedSpeech = (playedText: string, target: string): boolean => {
  const normalizedTarget = normalizedSpeech(target);
  return normalizedTarget.length > 0 && normalizedSpeech(playedText).includes(normalizedTarget);
};

export const shouldPublishSpeechStarted = (
  hasActiveSpeech: boolean,
  alreadyStarted: boolean,
  playedChunk: string,
): boolean => hasActiveSpeech && !alreadyStarted && playedChunk.length > 0;

export const activeSpeechSnapshotEvent = (alreadyStarted: boolean): "bear.speech.queued" | "bear.speech.started" =>
  alreadyStarted ? "bear.speech.started" : "bear.speech.queued";

export const playbackTimeoutMs = (text: string): number =>
  Math.min(60_000, Math.max(12_000, 8_000 + text.length * 80));

export const handoffContextFromMaple = (mapleText: string, proposedContext?: string): string => {
  const source = proposedContext?.trim() || mapleText;
  return source
    .replace(/^\s*(?:actually|well|no|right)[,!]?\s*/i, "")
    .replace(/^\s*smokey[,:]?\s*/i, "")
    .replace(/[.!?]+$/g, "")
    .trim()
    .slice(0, 160);
};

export const contextAwareResume = (
  mapleText: string,
  continuation: string,
  proposedContext?: string,
): string => {
  const context = handoffContextFromMaple(mapleText, proposedContext) || "I heard the correction";
  const next = continuation
    .replace(/^\s*(?:right|yes|fine|noted)[,.!?]?\s*/i, "")
    .trim();
  return `Right, ${context}. ${next}`.trim();
};

export const validInterruptTarget = (
  smokeyText: string,
  target: string | undefined,
): string | undefined => {
  if (!target) return undefined;
  const normalizedText = normalizedSpeech(smokeyText);
  const normalizedTarget = normalizedSpeech(target);
  if (normalizedTarget.length < 8 || normalizedTarget.split(" ").length < 4 || !normalizedText.includes(normalizedTarget)) {
    return undefined;
  }
  if (normalizedText.endsWith(normalizedTarget)) return undefined;
  return target;
};

export const cleanSpokenLine = (value: string, fallback: string): string => {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^\s*\[(?:[^\]]+)\]\s*/i, "")
    .replace(/^\s*(?:smokey|maple)\s*:\s*/i, "")
    .trim();
  const secondSpeaker = cleaned.search(/\s+(?:smokey|maple)\s*:\s*/i);
  return (secondSpeaker >= 0 ? cleaned.slice(0, secondSpeaker) : cleaned).trim() || fallback;
};
