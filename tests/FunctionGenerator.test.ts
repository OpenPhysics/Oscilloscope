/**
 * FunctionGenerator.test.ts
 *
 * Unit tests for the synthetic-signal source: the generated voltage should
 * scale with amplitude, repeat with the configured frequency, and reset cleanly.
 */

import { describe, expect, it } from "vitest";
import { FG_DEFAULT_FREQUENCY } from "../src/OscilloscopeConstants.js";
import { FunctionGenerator } from "../src/oscilloscope-screen/model/FunctionGenerator.js";

describe("FunctionGenerator", () => {
  it("defaults to a sine wave at the default frequency, amplitude 1 V", () => {
    const fg = new FunctionGenerator();
    expect(fg.waveformProperty.value).toBe("sine");
    expect(fg.frequencyProperty.value).toBe(FG_DEFAULT_FREQUENCY);
    expect(fg.amplitudeProperty.value).toBe(1);
    fg.dispose();
  });

  it("scales the output voltage by the amplitude", () => {
    const fg = new FunctionGenerator();
    fg.waveformProperty.value = "sine";
    fg.frequencyProperty.value = 100;
    fg.amplitudeProperty.value = 2;
    // Quarter period of a 100 Hz sine is at t = 2.5 ms → peak = +amplitude.
    expect(fg.voltageAt(0.0025)).toBeCloseTo(2);
    fg.dispose();
  });

  it("repeats with the configured period", () => {
    const fg = new FunctionGenerator();
    fg.frequencyProperty.value = 250; // period = 4 ms
    const a = fg.voltageAt(0.001);
    const b = fg.voltageAt(0.001 + 1 / 250);
    expect(a).toBeCloseTo(b);
    fg.dispose();
  });

  it("produces zero output at zero amplitude", () => {
    const fg = new FunctionGenerator();
    fg.amplitudeProperty.value = 0;
    for (const t of [0, 0.0003, 0.001, 0.01]) {
      expect(fg.voltageAt(t)).toBe(0);
    }
    fg.dispose();
  });

  it("reset() restores all defaults", () => {
    const fg = new FunctionGenerator();
    fg.waveformProperty.value = "square";
    fg.frequencyProperty.value = 1000;
    fg.amplitudeProperty.value = 2;
    fg.reset();
    expect(fg.waveformProperty.value).toBe("sine");
    expect(fg.frequencyProperty.value).toBe(FG_DEFAULT_FREQUENCY);
    expect(fg.amplitudeProperty.value).toBe(1);
    fg.dispose();
  });
});
