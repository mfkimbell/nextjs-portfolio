import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeSpeechSnapshotEvent,
  cleanSpokenLine,
  contextAwareResume,
  handoffContextFromMaple,
  hasPlayedSpeech,
  playbackTimeoutMs,
  shouldPublishSpeechStarted,
  validInterruptTarget,
} from "./interruption-plan.js";

describe("validInterruptTarget", () => {
  const smokeyText = "I think you're being dramatic because every small issue becomes a production.";

  it("accepts an exact phrase before the end", () => {
    assert.equal(
      validInterruptTarget(smokeyText, "I think you're being dramatic"),
      "I think you're being dramatic",
    );
  });

  it("normalizes whitespace and case when matching", () => {
    assert.equal(
      validInterruptTarget(smokeyText, "I THINK   YOU'RE BEING DRAMATIC"),
      "I THINK   YOU'RE BEING DRAMATIC",
    );
  });

  it("normalizes punctuation differences from playback events", () => {
    assert.equal(
      validInterruptTarget(smokeyText, "I think you're being dramatic, because"),
      "I think you're being dramatic, because",
    );
  });

  it("rejects a phrase that is not in Smokey's response", () => {
    assert.equal(validInterruptTarget(smokeyText, "Maple is being dramatic"), undefined);
  });

  it("rejects a short ambiguous phrase", () => {
    assert.equal(validInterruptTarget(smokeyText, "I think"), undefined);
  });

  it("rejects an interruption target that is too short to establish the thought", () => {
    assert.equal(validInterruptTarget(smokeyText, "being dramatic because"), undefined);
  });

  it("rejects a target at the end of the response", () => {
    assert.equal(validInterruptTarget(smokeyText, "every small issue becomes a production."), undefined);
  });
});

describe("cleanSpokenLine", () => {
  it("removes accidental speaker labels and stage directions", () => {
    assert.equal(cleanSpokenLine("[laughs] Maple: Me? Dramatic?", "fallback"), "Me? Dramatic?");
    assert.equal(cleanSpokenLine("I disagree. Smokey: No, you don't.", "fallback"), "I disagree.");
  });

  it("uses a fallback for empty output", () => {
    assert.equal(cleanSpokenLine("[pause]", "Please try again."), "Please try again.");
  });
});

describe("playback confirmation", () => {
  it("confirms normalized text only after the complete target has played", () => {
    assert.equal(hasPlayedSpeech("Earlier", "Earlier he"), false);
    assert.equal(hasPlayedSpeech("Earlier, he", "Earlier he"), true);
  });

  it("publishes a start exactly once on the first non-empty played chunk", () => {
    assert.equal(shouldPublishSpeechStarted(true, false, ""), false);
    assert.equal(shouldPublishSpeechStarted(true, false, "Actually"), true);
    assert.equal(shouldPublishSpeechStarted(true, true, ", Smokey"), false);
    assert.equal(shouldPublishSpeechStarted(false, false, "orphan audio"), false);
  });

  it("restores prospective ownership before playback and audible state afterward", () => {
    assert.equal(activeSpeechSnapshotEvent(false), "bear.speech.queued");
    assert.equal(activeSpeechSnapshotEvent(true), "bear.speech.started");
  });

  it("allows longer lines more playback time within safe bounds", () => {
    assert.equal(playbackTimeoutMs("short"), 12_000);
    assert.ok(playbackTimeoutMs("x".repeat(300)) > playbackTimeoutMs("short"));
    assert.equal(playbackTimeoutMs("x".repeat(1_000)), 60_000);
  });
});

describe("context-aware interruption repair", () => {
  it("turns Maple's correction into an explicit Smokey uptake", () => {
    assert.equal(
      contextAwareResume(
        "Actually, Smokey, Mitchell is a staff engineer.",
        "So what would you like to know about Mitchell?",
        "staff engineer",
      ),
      "Right, staff engineer. So what would you like to know about Mitchell?",
    );
  });

  it("derives context from Maple's line when structured context is missing", () => {
    assert.equal(
      handoffContextFromMaple("Actually, Smokey, Mitchell is a staff engineer."),
      "Mitchell is a staff engineer",
    );
  });

  it("cannot degrade into a context-free acknowledgement", () => {
    assert.equal(
      contextAwareResume("No, the migration reduced latency.", "Right. Let me continue."),
      "Right, the migration reduced latency. Let me continue.",
    );
  });
});
