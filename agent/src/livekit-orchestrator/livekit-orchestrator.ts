export type BearId = "smokey" | "maple";

export type PlannedExchange = {
  smokeyLead: string;
  mapleInterruption?: string;
  interruptAfter?: string;
  smokeyRecovery?: string;
};

export type SpeechCommand = {
  turnId: string;
  sequence: number;
  bear: BearId;
  text: string;
  interrupt?: boolean;
};

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const sentences = (value: string): string[] => value.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];

export const removeRepeatedSentences = (value: string, recentSpoken: string[]): string => {
  const recent = new Set(recentSpoken.flatMap(sentences).map(normalize).filter(Boolean));
  const filtered = sentences(value).filter((sentence) => !recent.has(normalize(sentence)));
  return filtered.join(" ").trim();
};

export const buildSpeechCommands = (turnId: string, plan: PlannedExchange): SpeechCommand[] => {
  const commands: SpeechCommand[] = [];
  const interruption = plan.mapleInterruption?.trim() || "And Maple would add one more thing.";
  const normalizedLead = normalize(plan.smokeyLead);
  const requestedTarget = plan.interruptAfter?.trim();
  const requestedNormalized = requestedTarget ? normalize(requestedTarget) : "";
  const requestedIsValid = requestedTarget
    && requestedNormalized.length >= 8
    && normalizedLead.includes(requestedNormalized)
    && !normalizedLead.endsWith(requestedNormalized);
  const target = requestedIsValid ? requestedTarget : undefined;
  const normalizedTarget = target ? normalize(target) : "";
  const shouldInterrupt = Boolean(
    target
    && interruption
    && normalizedTarget.length >= 8
    && normalizedLead.includes(normalizedTarget)
    && !normalizedLead.endsWith(normalizedTarget),
  );

  let lead = plan.smokeyLead.trim();
  if (shouldInterrupt && target) {
    const words = target.trim().split(/\s+/).length;
    const leadWords = plan.smokeyLead.trim().split(/\s+/);
    const normalizedTargetWords = normalizedTarget.split(" ");
    const normalizedLeadWords = normalize(plan.smokeyLead).split(" ");
    let endIndex = -1;
    for (let index = 0; index <= normalizedLeadWords.length - normalizedTargetWords.length; index += 1) {
      if (normalizedLeadWords.slice(index, index + normalizedTargetWords.length).join(" ") === normalizedTarget) {
        endIndex = index + words;
        break;
      }
    }
    if (endIndex > 0) lead = leadWords.slice(0, endIndex).join(" ");
  }

  commands.push({ turnId, sequence: 0, bear: "smokey", text: lead, interrupt: shouldInterrupt });
  if (interruption) {
    commands.push({ turnId, sequence: 1, bear: "maple", text: interruption, interrupt: shouldInterrupt });
    const recovery = plan.smokeyRecovery?.trim();
    if (shouldInterrupt && recovery) commands.push({ turnId, sequence: 2, bear: "smokey", text: recovery });
  }
  return commands;
};

export const estimateSpeechDurationMs = (text: string, wordsPerMinute = 165): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(450, words * 60_000 / Math.max(80, wordsPerMinute));
};

export const interruptionDelayMs = (smokeyPrefix: string, overlapMs: number): number =>
  Math.max(120, estimateSpeechDurationMs(smokeyPrefix) - Math.max(0, overlapMs));

export class LiveKitTurnQueue {
  private commands: SpeechCommand[] = [];
  private current: SpeechCommand | undefined;

  enqueue(turnId: string, plan: PlannedExchange): SpeechCommand | undefined {
    this.commands = buildSpeechCommands(turnId, plan);
    this.current = this.commands.shift();
    return this.current;
  }

  complete(turnId: string, sequence: number): SpeechCommand | undefined {
    if (!this.current || this.current.turnId !== turnId || this.current.sequence !== sequence) return undefined;
    this.current = this.commands.shift();
    return this.current;
  }

  interrupt(): void {
    this.commands = [];
    this.current = undefined;
  }
}
