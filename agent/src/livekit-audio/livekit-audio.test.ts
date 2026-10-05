import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AudioFrame } from "@livekit/rtc-node";
import { pitchShiftFrames } from "./livekit-audio.js";

describe("pitchShiftFrames", () => {
  const frame = new AudioFrame(new Int16Array(480), 24_000, 1, 480);
  it("shortens higher-pitched audio", () => {
    assert.equal(pitchShiftFrames([frame], 1.5).reduce((sum, item) => sum + item.samplesPerChannel, 0), 320);
  });
  it("lengthens lower-pitched audio", () => {
    assert.equal(pitchShiftFrames([frame], 0.75).reduce((sum, item) => sum + item.samplesPerChannel, 0), 640);
  });
});
