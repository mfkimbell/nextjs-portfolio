import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBanjoFingerPhase } from "./banjo-performance.ts";

describe("banjo finger phase", () => {
  it("repeats after one beat", () => {
    const first = getBanjoFingerPhase(0, 96);
    const nextBeat = getBanjoFingerPhase(60 / 96, 96);
    assert.ok(Math.abs(first.pickCurl - nextBeat.pickCurl) < 1e-9);
    const nextFretCycle = getBanjoFingerPhase((60 / 96) * 2, 96);
    assert.ok(Math.abs(first.fretPressure - nextFretCycle.fretPressure) < 1e-9);
  });

  it("handles invalid timing safely", () => {
    assert.deepEqual(getBanjoFingerPhase(Number.NaN, 0), getBanjoFingerPhase(0, 96));
  });
});
