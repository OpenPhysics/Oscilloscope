/**
 * Waveform.test.ts
 *
 * Unit tests for the pure waveform-shape evaluator that backs the function
 * generator. Values are normalized to [-1, 1] and periodic in phase.
 */

import { describe, expect, it } from "vitest";
import { WAVEFORMS, waveformSample } from "../src/oscilloscope-screen/model/Waveform.js";

describe("waveformSample", () => {
  it("stays within [-1, 1] for every waveform across a full period", () => {
    for (const waveform of WAVEFORMS) {
      for (let p = 0; p < 1; p += 0.01) {
        const v = waveformSample(waveform, p);
        expect(v).toBeGreaterThanOrEqual(-1.0001);
        expect(v).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("is periodic with period 1 in phase (except aperiodic noise)", () => {
    for (const waveform of WAVEFORMS) {
      if (waveform === "noise") {
        continue;
      }
      for (const p of [0.1, 0.37, 0.85]) {
        expect(waveformSample(waveform, p)).toBeCloseTo(waveformSample(waveform, p + 3));
      }
    }
  });

  it("pulse is a unipolar 0/1 train governed by duty", () => {
    expect(waveformSample("pulse", 0.1, 0.5)).toBe(1);
    expect(waveformSample("pulse", 0.6, 0.5)).toBe(0);
    expect(waveformSample("pulse", 0.3, 0.25)).toBe(0);
    expect(waveformSample("pulse", 0.1, 0.25)).toBe(1);
  });

  it("sine matches Math.sin", () => {
    expect(waveformSample("sine", 0)).toBeCloseTo(0);
    expect(waveformSample("sine", 0.25)).toBeCloseTo(1);
    expect(waveformSample("sine", 0.5)).toBeCloseTo(0);
    expect(waveformSample("sine", 0.75)).toBeCloseTo(-1);
  });

  it("square is +1 on the first half and -1 on the second", () => {
    expect(waveformSample("square", 0.1)).toBe(1);
    expect(waveformSample("square", 0.49)).toBe(1);
    expect(waveformSample("square", 0.5)).toBe(-1);
    expect(waveformSample("square", 0.9)).toBe(-1);
  });

  it("triangle peaks at +1 (quarter) and -1 (three-quarter)", () => {
    expect(waveformSample("triangle", 0)).toBeCloseTo(0);
    expect(waveformSample("triangle", 0.25)).toBeCloseTo(1);
    expect(waveformSample("triangle", 0.5)).toBeCloseTo(0);
    expect(waveformSample("triangle", 0.75)).toBeCloseTo(-1);
  });

  it("sawtooth ramps linearly from -1 to +1", () => {
    expect(waveformSample("sawtooth", 0)).toBeCloseTo(-1);
    expect(waveformSample("sawtooth", 0.5)).toBeCloseTo(0);
    expect(waveformSample("sawtooth", 0.999)).toBeCloseTo(1, 1);
  });
});
