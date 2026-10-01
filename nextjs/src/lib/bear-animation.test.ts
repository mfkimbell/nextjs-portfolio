import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampSpring, stepSpring } from "./bear-animation.ts";

describe("bear animation springs", () => {
  it("converges toward a target without frame-rate-dependent jumps", () => {
    let sixty = { value: 0, velocity: 0 };
    let thirty = { value: 0, velocity: 0 };
    for (let index = 0; index < 60; index += 1) sixty = stepSpring(sixty, 1, 90, 18, 1 / 60);
    for (let index = 0; index < 30; index += 1) thirty = stepSpring(thirty, 1, 90, 18, 1 / 30);
    assert.ok(Math.abs(sixty.value - thirty.value) < 0.03);
    assert.ok(Math.abs(sixty.value - 1) < 0.05);
  });

  it("caps long frame gaps and remains finite", () => {
    const next = stepSpring({ value: 0, velocity: 0 }, 1, 26, 11, 2);
    assert.ok(Number.isFinite(next.value));
    assert.ok(Number.isFinite(next.velocity));
    assert.ok(next.value < 1);
  });

  it("clamps invalid state values to a safe finite value", () => {
    assert.deepEqual(clampSpring({ value: Number.NaN, velocity: Infinity }, -1, 1), {
      value: 0,
      velocity: 0,
    });
    assert.deepEqual(clampSpring({ value: 2, velocity: -3 }, -1, 1), {
      value: 1,
      velocity: -3,
    });
  });
});
