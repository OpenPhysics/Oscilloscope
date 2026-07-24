/**
 * measurementUtils.test.ts
 *
 * Unit tests for the pure measurement helpers used by the screen view's live
 * readouts and Autoset: frequency estimation by mean-crossing counting, and
 * snapping a target to the nearest 1-2-5 rotary-switch step.
 */

import { describe, expect, it } from "vitest";
import { estimateFrequency, nearestStep } from "../src/oscilloscope-screen/view/measurementUtils.js";
import { SCOPE_TIME_PER_DIV_STEPS, SCOPE_VOLTS_PER_DIV_STEPS } from "../src/SimConstants.js";

function sineBuffer(cycles: number, samples: number): Float32Array {
  const buf = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    buf[i] = Math.sin((2 * Math.PI * cycles * i) / samples);
  }
  return buf;
}

describe("estimateFrequency", () => {
  // A mean-crossing counter is accurate to within one crossing over the record,
  // i.e. ±(1 / windowSeconds) Hz, so the tests assert that tolerance.
  it("counts about one rising mean-crossing per cycle", () => {
    // 5 full cycles across a 1-second window → ≈5 Hz (±1 crossing).
    expect(estimateFrequency(sineBuffer(5, 1000), 1)).toBeGreaterThanOrEqual(4);
    expect(estimateFrequency(sineBuffer(5, 1000), 1)).toBeLessThanOrEqual(6);
  });

  it("scales with the window length", () => {
    // 10 cycles across a 2-second window → ≈5 Hz.
    expect(estimateFrequency(sineBuffer(10, 2000), 2)).toBeGreaterThanOrEqual(4.5);
    expect(estimateFrequency(sineBuffer(10, 2000), 2)).toBeLessThanOrEqual(5.5);
  });

  it("returns 0 for a degenerate buffer or non-positive window", () => {
    expect(estimateFrequency(new Float32Array(1), 1)).toBe(0);
    expect(estimateFrequency(sineBuffer(5, 1000), 0)).toBe(0);
    expect(estimateFrequency(sineBuffer(5, 1000), -1)).toBe(0);
  });

  it("ignores a DC offset (crossings are counted about the mean)", () => {
    const clean = estimateFrequency(sineBuffer(5, 1000), 1);
    const offset = sineBuffer(5, 1000);
    for (let i = 0; i < offset.length; i++) {
      offset[i] += 10; // large DC offset
    }
    // A big DC offset must not change the count: crossings are about the mean.
    expect(estimateFrequency(offset, 1)).toBe(clean);
  });
});

describe("nearestStep", () => {
  it("snaps to the closest step", () => {
    expect(nearestStep(SCOPE_VOLTS_PER_DIV_STEPS, 0.3)).toBe(0.2);
    expect(nearestStep(SCOPE_VOLTS_PER_DIV_STEPS, 0.42)).toBe(0.5);
  });

  it("clamps to the extremes for out-of-range targets", () => {
    expect(nearestStep(SCOPE_VOLTS_PER_DIV_STEPS, 1000)).toBe(5);
    expect(nearestStep(SCOPE_VOLTS_PER_DIV_STEPS, -1)).toBe(0.005);
    expect(nearestStep(SCOPE_TIME_PER_DIV_STEPS, 0)).toBe(0.000001);
  });

  it("returns an exact step unchanged", () => {
    for (const step of SCOPE_TIME_PER_DIV_STEPS) {
      expect(nearestStep(SCOPE_TIME_PER_DIV_STEPS, step)).toBe(step);
    }
  });

  it("falls back to the target for an empty step list", () => {
    expect(nearestStep([], 3.14)).toBe(3.14);
  });
});
