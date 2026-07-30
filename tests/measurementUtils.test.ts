/**
 * measurementUtils.test.ts
 *
 * Unit tests for the pure measurement helpers used by the screen view's live
 * readouts and Autoset: interpolated mean-crossing frequency estimation, and
 * snapping a target to the nearest 1-2-5 rotary-switch step.
 */

import { describe, expect, it } from "vitest";
import { SCOPE_TIME_PER_DIV_STEPS, SCOPE_VOLTS_PER_DIV_STEPS } from "../src/OscilloscopeConstants.js";
import {
  estimateDutyCycle,
  estimateFallTime,
  estimateFrequency,
  estimatePhaseDegrees,
  estimateRiseTime,
  meanOf,
  nearestStep,
} from "../src/oscilloscope-screen/view/measurementUtils.js";

/** `cycles` full periods spread across `samples` points spanning the whole window. */
function sineBuffer(cycles: number, samples: number): Float32Array {
  const buf = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    buf[i] = Math.sin((2 * Math.PI * cycles * i) / (samples - 1));
  }
  return buf;
}

/** A duty-cycle pulse train — deliberately asymmetric about its mean. */
function pulseBuffer(cycles: number, samples: number, duty: number): Float32Array {
  const buf = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const phase = ((cycles * i) / (samples - 1)) % 1;
    buf[i] = phase < duty ? 1 : 0;
  }
  return buf;
}

describe("estimateFrequency", () => {
  // Crossings are located by linear interpolation and the frequency is taken
  // between the first and last of them, so the estimate is not quantized to
  // 1/windowSeconds the way a plain crossing count would be.
  it("recovers the frequency of a sine to within 0.5%", () => {
    // 5 cycles across a 1-second window → 5 Hz.
    expect(estimateFrequency(sineBuffer(5, 1000), 1)).toBeCloseTo(5, 2);
    // 10 cycles across a 2-second window → 5 Hz.
    expect(estimateFrequency(sineBuffer(10, 2000), 2)).toBeCloseTo(5, 2);
  });

  it("is not quantized to the reciprocal of the window", () => {
    // The regression this guards: a whole-crossing count over a 10 ms window can
    // only ever report multiples of 100 Hz, so 250 Hz came back as 200 or 300 Hz.
    const windowSeconds = 0.01;
    for (const hz of [200, 250, 300, 440, 1000]) {
      const buffer = sineBuffer(hz * windowSeconds, 560);
      const estimate = estimateFrequency(buffer, windowSeconds);
      expect(Math.abs(estimate - hz) / hz).toBeLessThan(0.01);
    }
  });

  it("handles a capture holding only two cycles", () => {
    // Exactly two cycles puts the rising edges on the window boundaries, leaving a
    // single interior rising crossing; the half-period fallback still measures it.
    expect(estimateFrequency(sineBuffer(2, 560), 0.01)).toBeCloseTo(200, 0);
  });

  it("measures an asymmetric pulse train from like-signed crossings", () => {
    // High and low halves differ in length, so consecutive crossings are not half
    // a period apart — only rising-to-rising spacing gives the true period.
    const estimate = estimateFrequency(pulseBuffer(4, 560, 0.2), 0.01);
    expect(Math.abs(estimate - 400) / 400).toBeLessThan(0.02);
  });

  it("returns 0 for a degenerate buffer or non-positive window", () => {
    expect(estimateFrequency(new Float32Array(1), 1)).toBe(0);
    expect(estimateFrequency(sineBuffer(5, 1000), 0)).toBe(0);
    expect(estimateFrequency(sineBuffer(5, 1000), -1)).toBe(0);
  });

  it("returns 0 for a flat line (no crossings)", () => {
    expect(estimateFrequency(new Float32Array(560), 0.01)).toBe(0);
  });

  it("ignores a DC offset (crossings are located about the mean)", () => {
    const clean = estimateFrequency(sineBuffer(5, 1000), 1);
    const offset = sineBuffer(5, 1000);
    for (let i = 0; i < offset.length; i++) {
      const sample = offset[i];
      if (sample === undefined) {
        throw new Error("test fixture: expected sine buffer sample");
      }
      offset[i] = sample + 10; // large DC offset
    }
    expect(estimateFrequency(offset, 1)).toBeCloseTo(clean, 6);
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

describe("estimateDutyCycle", () => {
  it("recovers a known pulse duty cycle", () => {
    expect(estimateDutyCycle(pulseBuffer(4, 1000, 0.25))).toBeCloseTo(0.25, 1);
    expect(estimateDutyCycle(pulseBuffer(4, 1000, 0.75))).toBeCloseTo(0.75, 1);
  });

  it("returns 0 for a flat line", () => {
    expect(estimateDutyCycle(new Float32Array(100))).toBe(0);
  });
});

describe("meanOf", () => {
  it("averages the buffer", () => {
    expect(meanOf(new Float32Array([1, 2, 3]))).toBeCloseTo(2);
  });
});

describe("estimateRiseTime / estimateFallTime", () => {
  it("measures a near-ideal step edge as a short rise", () => {
    // Abrupt pulse: rise spans one sample at 1 ms window / 999 intervals.
    const buf = pulseBuffer(2, 1000, 0.5);
    const rise = estimateRiseTime(buf, 0.001);
    expect(rise).toBeGreaterThan(0);
    expect(rise).toBeLessThan(0.00005);
  });

  it("measures a matching fall on the same pulse", () => {
    const buf = pulseBuffer(2, 1000, 0.5);
    const fall = estimateFallTime(buf, 0.001);
    expect(fall).toBeGreaterThan(0);
    expect(fall).toBeLessThan(0.00005);
  });
});

describe("estimatePhaseDegrees", () => {
  it("recovers a 90° phase shift between two sines", () => {
    const samples = 1000;
    const cycles = 5;
    const a = sineBuffer(cycles, samples);
    const b = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      // b lags a by 90° (quarter cycle later).
      b[i] = Math.sin((2 * Math.PI * cycles * i) / (samples - 1) - Math.PI / 2);
    }
    const phase = estimatePhaseDegrees(a, b, 1);
    expect(Math.abs(phase - 90)).toBeLessThan(3);
  });
});
