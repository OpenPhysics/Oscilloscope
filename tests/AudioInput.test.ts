/**
 * The microphone source's capture geometry. The test environment has no real
 * getUserMedia, so a stub AnalyserNode is installed directly — that is the only
 * way to exercise the resampling and trigger search against known samples.
 */

import { describe, expect, it } from "vitest";
import { AudioInput } from "../src/oscilloscope-screen/model/AudioInput.js";
import { AUDIO_FFT_SIZE, TRACE_SAMPLE_COUNT } from "../src/SimConstants.js";

const SAMPLE_RATE = 44100;

/**
 * Installs a stub analyser that always reports one period-locked sine, plus the
 * sample rate the real context would have.
 */
function stubAnalyser(input: AudioInput, frequency: number): void {
  const internals = input as unknown as {
    analyser: { getFloatTimeDomainData: (out: Float32Array) => void; disconnect: () => void } | null;
    sampleRate: number;
    timeData: Float32Array;
  };
  internals.sampleRate = SAMPLE_RATE;
  internals.analyser = {
    getFloatTimeDomainData: (out: Float32Array) => {
      for (let i = 0; i < out.length; i++) {
        out[i] = Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
      }
    },
    disconnect: () => {
      /* the real AnalyserNode detaches from the graph here */
    },
  };
}

describe("AudioInput", () => {
  it("reports the longest window its acquisition memory can fill", () => {
    const input = new AudioInput();
    stubAnalyser(input, 440);
    expect(input.maxWindowSeconds).toBeCloseTo(AUDIO_FFT_SIZE / SAMPLE_RATE, 9);
    // Long enough to be a usable slow sweep, not the 46 ms a small window allows.
    expect(input.maxWindowSeconds).toBeGreaterThan(0.5);
    input.dispose();
  });

  it("zeroes the trace and refuses to trigger with no live microphone", () => {
    const input = new AudioInput();
    const out = new Float32Array(TRACE_SAMPLE_COUNT);
    out.fill(1);
    expect(input.fillTrace(out, 0.01)).toBe(false);
    expect(Array.from(out).every((v) => v === 0)).toBe(true);
    input.dispose();
  });

  it("finds a rising-edge trigger across every sweep it can fill", () => {
    const input = new AudioInput();
    stubAnalyser(input, 440);
    const out = new Float32Array(TRACE_SAMPLE_COUNT);

    for (const windowSeconds of [0.001, 0.01, 0.1, 0.5, input.maxWindowSeconds * 0.99]) {
      expect(input.fillTrace(out, windowSeconds, 0, "rising"), `${windowSeconds} s window`).toBe(true);
    }
    input.dispose();
  });

  it("still triggers at the slowest sweep the model will actually select", () => {
    // The search span is carved out of the same buffer the window reads, so it used
    // to collapse to nothing once the window passed half the buffer — leaving NORMAL
    // and SINGLE frozen on sweeps the analyser can perfectly well fill. The model
    // clamps the timebase to `maxWindowSeconds`, and every step below it must work.
    const input = new AudioInput();
    stubAnalyser(input, 440);
    const out = new Float32Array(TRACE_SAMPLE_COUNT);
    for (const fraction of [0.55, 0.7, 0.9, 0.99]) {
      const windowSeconds = input.maxWindowSeconds * fraction;
      expect(input.fillTrace(out, windowSeconds, 0, "rising"), `${fraction} of the buffer`).toBe(true);
    }
    input.dispose();
  });

  it("degrades quietly when asked for more time than it holds", () => {
    // Only reachable if a caller ignores maxWindowSeconds; the capture is clamped
    // rather than stretched, and there is genuinely no room left to align a trigger.
    const input = new AudioInput();
    stubAnalyser(input, 440);
    const out = new Float32Array(TRACE_SAMPLE_COUNT);
    expect(() => input.fillTrace(out, input.maxWindowSeconds * 4, 0, "rising")).not.toThrow();
    expect(Array.from(out).every((v) => Number.isFinite(v))).toBe(true);
    input.dispose();
  });

  it("finds a falling-edge trigger too", () => {
    const input = new AudioInput();
    stubAnalyser(input, 440);
    const out = new Float32Array(TRACE_SAMPLE_COUNT);
    expect(input.fillTrace(out, 0.01, 0, "falling")).toBe(true);
    input.dispose();
  });

  it("does not trigger on a level the signal never reaches", () => {
    const input = new AudioInput();
    stubAnalyser(input, 440);
    const out = new Float32Array(TRACE_SAMPLE_COUNT);
    expect(input.fillTrace(out, 0.01, 5, "rising")).toBe(false);
    input.dispose();
  });

  it("fills one sample per display column", () => {
    const input = new AudioInput();
    stubAnalyser(input, 440);
    const out = new Float32Array(TRACE_SAMPLE_COUNT);
    input.fillTrace(out, 0.01, 0, "rising");
    expect(out.length).toBe(TRACE_SAMPLE_COUNT);
    expect(Array.from(out).some((v) => v !== 0)).toBe(true);
    input.dispose();
  });
});
