import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFactCorrection, buildSpeechCommands, interruptionDelayMs, LiveKitTurnQueue, removeRepeatedSentences } from "./livekit-orchestrator.js";

describe("buildSpeechCommands", () => {
  it("lets Smokey start the next sentence before Maple corrects him", () => {
    assert.deepEqual(buildSpeechCommands("turn-1", {
      smokeyLead: "Mitchell is a senior engineer. What would you like to know about him?",
      interruptAfter: "Mitchell is a senior engineer. What would you",
      mapleInterruption: "Actually, Mitchell is a staff engineer.",
      smokeyRecovery: "Right, staff engineer. What would you like to know about him?",
    }), [
      { turnId: "turn-1", sequence: 0, bear: "smokey", text: "Mitchell is a senior engineer. What would you", interrupt: true },
      { turnId: "turn-1", sequence: 1, bear: "maple", text: "Actually, Mitchell is a staff engineer.", interrupt: true },
      { turnId: "turn-1", sequence: 2, bear: "smokey", text: "Right, staff engineer. What would you like to know about him?" },
    ]);
  });

  it("rejects a correction boundary inside the mistaken sentence", () => {
    const commands = buildSpeechCommands("turn-title", {
      smokeyLead: "Mitchell is a senior engineer. What would you like to know about him?",
      interruptAfter: "Mitchell is a senior engineer",
      mapleInterruption: "Actually, Mitchell is a staff engineer.",
    });
    assert.equal(commands[0]?.interrupt, false);
  });

  it("allows Maple to cut in after a one-word next-sentence lead", () => {
    const commands = buildSpeechCommands("turn-fast", {
      smokeyLead: "Mitchell is a senior engineer. So what should we cover?",
      interruptAfter: "Mitchell is a senior engineer. So",
      mapleInterruption: "Actually, Smokey, Mitchell is a staff engineer.",
    });
    assert.equal(commands[0]?.text, "Mitchell is a senior engineer. So");
    assert.equal(commands[0]?.interrupt, true);
  });

  it("uses a Maple follow-up when there is no correction target", () => {
    const commands = buildSpeechCommands("turn-2", {
      smokeyLead: "Mitchell builds reliable systems.",
      mapleInterruption: "And he cares about maintainability too.",
    });
    assert.equal(commands.length, 2);
    assert.equal(commands[1]?.interrupt, false);
  });

  it("cuts Smokey off after he begins the next sentence", () => {
    const commands = buildSpeechCommands("turn-3", {
      smokeyLead: "Mitchell has shipped twelve projects. And he has also led several migrations.",
      interruptAfter: "Mitchell has shipped twelve projects. And he has",
      mapleInterruption: "Actually, Smokey, the portfolio lists closer to twenty projects.",
      smokeyRecovery: "Fine, closer to twenty. He has led several migrations too.",
    });
    assert.equal(commands[0]?.text, "Mitchell has shipped twelve projects. And he has");
    assert.equal(commands[1]?.interrupt, true);
  });
});

describe("interruptionDelayMs", () => {
  it("starts Maple before Smokey's estimated prefix end", () => {
    const text = "Mitchell is a senior engineer";
    assert.ok(interruptionDelayMs(text, 350) < interruptionDelayMs(text, 0));
    assert.ok(interruptionDelayMs(text, 350) <= interruptionDelayMs(text, 0) - 300);
  });
});

describe("applyFactCorrection", () => {
  const plan = {
    smokeyLead: "Mitchell is a senior engineer. So what should we cover?",
    interruptAfter: "Mitchell is a senior engineer. So",
    mapleInterruption: "Actually, Mitchell is a staff engineer.",
    smokeyRecovery: "Right, staff engineer.",
  };

  it("keeps Maple as a normal follow-up when Smokey did not use the catalog mistake", () => {
    assert.deepEqual(applyFactCorrection(plan, { incorrectClaim: "works at Regions Bank", mapleCorrection: "Actually, he works at Twilio." }), {
      ...plan,
      interruptAfter: undefined,
      smokeyRecovery: undefined,
    });
  });

  it("uses the catalog correction when the draft contains its exact mistake", () => {
    assert.equal(
      applyFactCorrection(plan, { incorrectClaim: "senior engineer", mapleCorrection: "Actually, Smokey, Mitchell is a staff engineer." }).mapleInterruption,
      "Actually, Smokey, Mitchell is a staff engineer.",
    );
  });
});

describe("LiveKitTurnQueue", () => {
  it("only advances on the matching completion event", () => {
    const queue = new LiveKitTurnQueue();
    const first = queue.enqueue("turn-1", {
      smokeyLead: "One two three four five.",
      interruptAfter: "One two three four. And now five six",
      mapleInterruption: "Correction.",
    });
    assert.equal(first?.bear, "smokey");
    assert.equal(queue.complete("stale", 0), undefined);
    assert.equal(queue.complete("turn-1", 0)?.bear, "maple");
  });
});

describe("removeRepeatedSentences", () => {
  it("removes a repeated greeting while preserving the new answer", () => {
    assert.equal(
      removeRepeatedSentences(
        "Hi there. Got it, the Falcon SUV. Should we review collision coverage?",
        ["Hi there."],
      ),
      "Got it, the Falcon SUV. Should we review collision coverage?",
    );
  });
});
