/**
 * OscilloscopeModel.test.ts
 *
 * Unit tests for the top-level model: dual-channel trace sampling for the
 * function-generator source, the time window derived from time/div (with the ×10
 * magnifier), input coupling, source switching, and reset.
 *
 * The microphone path is not exercised here — the test environment mocks
 * AudioContext and provides no getUserMedia, so the audio source simply yields a
 * flat line, which we assert.
 */

import { describe, expect, it } from "vitest";
import { OscilloscopeModel } from "../src/oscilloscope-screen/model/OscilloscopeModel.js";
import {
  FG_DEFAULT_FREQUENCY,
  HORIZONTAL_DIVISIONS,
  SCOPE_MAGNIFY_FACTOR,
  TRACE_SAMPLE_COUNT,
} from "../src/SimConstants.js";

function extremes(trace: Float32Array): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of trace) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
}

describe("OscilloscopeModel", () => {
  it("defaults to the function-generator source with CH1 on and CH2 off", () => {
    const model = new OscilloscopeModel();
    expect(model.sourceProperty.value).toBe("functionGenerator");
    expect(model.ch1.enabledProperty.value).toBe(true);
    expect(model.ch2.enabledProperty.value).toBe(false);
    model.dispose();
  });

  it("timeWindow is time/div times the number of horizontal divisions", () => {
    const model = new OscilloscopeModel();
    model.timePerDivisionProperty.value = 0.002;
    expect(model.timeWindow).toBeCloseTo(0.002 * HORIZONTAL_DIVISIONS);
    model.dispose();
  });

  it("the ×10 magnifier shrinks the effective time/div", () => {
    const model = new OscilloscopeModel();
    model.timePerDivisionProperty.value = 0.001;
    model.magnifyProperty.value = true;
    expect(model.effectiveTimePerDivision).toBeCloseTo(0.001 / SCOPE_MAGNIFY_FACTOR);
    model.dispose();
  });

  it("refresh fills one sample per horizontal column", () => {
    const model = new OscilloscopeModel();
    model.refresh();
    expect(model.ch1Trace.length).toBe(TRACE_SAMPLE_COUNT);
    expect(model.ch2Trace.length).toBe(TRACE_SAMPLE_COUNT);
    expect(model.sampleCount).toBe(TRACE_SAMPLE_COUNT);
    model.dispose();
  });

  it("samples the function generator's waveform into CH1", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "sine";
    model.functionGenerator.amplitudeProperty.value = 1;
    model.refresh();
    const { min, max } = extremes(model.ch1Trace);
    // A full-amplitude sine across a multi-cycle window should approach ±1.
    expect(max).toBeGreaterThan(0.9);
    expect(min).toBeLessThan(-0.9);
    model.dispose();
  });

  it("GND coupling flattens the channel to the ground reference", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.amplitudeProperty.value = 2;
    model.ch1.couplingProperty.value = "GND";
    model.refresh();
    for (const v of model.ch1Trace) {
      expect(v).toBe(0);
    }
    model.dispose();
  });

  it("AC coupling removes the DC offset", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "sine";
    model.functionGenerator.amplitudeProperty.value = 1;
    model.functionGenerator.offsetProperty.value = 3;
    model.ch1.couplingProperty.value = "AC";
    model.refresh();
    let sum = 0;
    for (const v of model.ch1Trace) {
      sum += v;
    }
    // Mean should be ~0 after AC coupling despite the +3 V offset.
    expect(Math.abs(sum / model.ch1Trace.length)).toBeLessThan(0.05);
    model.dispose();
  });

  it("produces a flat line for the audio source with no live microphone", () => {
    const model = new OscilloscopeModel();
    model.sourceProperty.value = "audio";
    model.refresh();
    for (const v of model.ch1Trace) {
      expect(v).toBe(0);
    }
    model.dispose();
  });

  it("centers the trigger crossing on the display for a rising-edge trigger", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "sine";
    model.functionGenerator.amplitudeProperty.value = 1;
    model.trigger.sourceProperty.value = "ch1";
    model.trigger.slopeProperty.value = "rising";
    model.trigger.levelProperty.value = 0;
    model.refresh();

    const trace = model.ch1Trace;
    const center = Math.round((trace.length - 1) / 2);
    // The trigger event sits at screen center: the center sample is at the level …
    expect(Math.abs(trace[center] ?? 0)).toBeLessThan(0.05);
    // … and the trace is rising there (a later sample is higher).
    expect(trace[center + 5] ?? 0).toBeGreaterThan(trace[center] ?? 0);
    model.dispose();
  });

  it("aligns the center sample to the trigger level and slope", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "sine";
    model.functionGenerator.amplitudeProperty.value = 1;
    model.trigger.sourceProperty.value = "ch1";
    model.trigger.slopeProperty.value = "falling";
    model.trigger.levelProperty.value = 0.5;
    model.refresh();

    const trace = model.ch1Trace;
    const center = Math.round((trace.length - 1) / 2);
    // Center sample sits at the (non-zero) trigger level …
    expect(Math.abs((trace[center] ?? 0) - 0.5)).toBeLessThan(0.05);
    // … and is falling there for a falling-slope trigger.
    expect(trace[center + 5] ?? 0).toBeLessThan(trace[center] ?? 0);
    model.dispose();
  });

  it("reset() restores the source, sensitivities, and generator", () => {
    const model = new OscilloscopeModel();
    model.sourceProperty.value = "audio";
    model.timePerDivisionProperty.value = 0.01;
    model.ch1.voltsPerDivisionProperty.value = 2;
    model.functionGenerator.frequencyProperty.value = 1000;
    model.reset();
    expect(model.sourceProperty.value).toBe("functionGenerator");
    expect(model.timePerDivisionProperty.value).toBe(0.001);
    expect(model.ch1.voltsPerDivisionProperty.value).toBe(0.5);
    expect(model.functionGenerator.frequencyProperty.value).toBe(FG_DEFAULT_FREQUENCY);
    model.dispose();
  });
});
