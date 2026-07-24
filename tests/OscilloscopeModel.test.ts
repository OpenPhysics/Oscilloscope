/**
 * OscilloscopeModel.test.ts
 *
 * Unit tests for the top-level model: trace sampling for the function-generator
 * source, the time window derived from time/div, source switching, and reset.
 *
 * The microphone path is not exercised here — the test environment mocks
 * AudioContext and provides no getUserMedia, so the audio source simply yields a
 * flat line, which we assert.
 */

import { describe, expect, it } from "vitest";
import { OscilloscopeModel } from "../src/oscilloscope-screen/model/OscilloscopeModel.js";
import { HORIZONTAL_DIVISIONS, TRACE_SAMPLE_COUNT } from "../src/SimConstants.js";

describe("OscilloscopeModel", () => {
  it("defaults to the function-generator source", () => {
    const model = new OscilloscopeModel();
    expect(model.sourceProperty.value).toBe("functionGenerator");
    model.dispose();
  });

  it("timeWindow is time/div times the number of horizontal divisions", () => {
    const model = new OscilloscopeModel();
    model.timePerDivisionProperty.value = 0.002;
    expect(model.timeWindow).toBeCloseTo(0.002 * HORIZONTAL_DIVISIONS);
    model.dispose();
  });

  it("getTrace returns one sample per horizontal column", () => {
    const model = new OscilloscopeModel();
    expect(model.getTrace().length).toBe(TRACE_SAMPLE_COUNT);
    expect(model.sampleCount).toBe(TRACE_SAMPLE_COUNT);
    model.dispose();
  });

  it("samples the function generator's waveform into the trace", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "sine";
    model.functionGenerator.amplitudeProperty.value = 1;
    const trace = model.getTrace();
    let max = Number.NEGATIVE_INFINITY;
    let min = Number.POSITIVE_INFINITY;
    for (const v of trace) {
      max = Math.max(max, v);
      min = Math.min(min, v);
    }
    // A full-amplitude sine across a multi-cycle window should approach ±1.
    expect(max).toBeGreaterThan(0.9);
    expect(min).toBeLessThan(-0.9);
    model.dispose();
  });

  it("produces a flat line for the audio source with no live microphone", () => {
    const model = new OscilloscopeModel();
    model.sourceProperty.value = "audio";
    const trace = model.getTrace();
    for (const v of trace) {
      expect(v).toBe(0);
    }
    model.dispose();
  });

  it("reset() restores the source, sensitivities, and generator", () => {
    const model = new OscilloscopeModel();
    model.sourceProperty.value = "audio";
    model.timePerDivisionProperty.value = 0.01;
    model.voltsPerDivisionProperty.value = 2;
    model.functionGenerator.frequencyProperty.value = 1000;
    model.reset();
    expect(model.sourceProperty.value).toBe("functionGenerator");
    expect(model.timePerDivisionProperty.value).toBe(0.001);
    expect(model.voltsPerDivisionProperty.value).toBe(0.5);
    expect(model.functionGenerator.frequencyProperty.value).toBe(440);
    model.dispose();
  });
});
