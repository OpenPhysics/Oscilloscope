/**
 * OscilloscopeModel.test.ts
 *
 * Unit tests for the top-level model: dual-channel trace sampling for the
 * function-generator patches, the time window derived from time/div (with the ×10
 * magnifier), input coupling, trigger modes, the noiseless measurement trace,
 * BNC patch exclusivity, and reset.
 *
 * The microphone path is only exercised structurally — the test environment mocks
 * AudioContext and provides no getUserMedia, so the audio source yields a flat
 * line. Tests that care about audio therefore assert on the capture call rather
 * than on sample values.
 */

import { BooleanProperty, NumberProperty } from "scenerystack/axon";
import { describe, expect, it, vi } from "vitest";
import { OscilloscopeModel } from "../src/oscilloscope-screen/model/OscilloscopeModel.js";
import {
  FG_DEFAULT_FREQUENCY,
  HORIZONTAL_DIVISIONS,
  SCOPE_MAGNIFY_FACTOR,
  TRACE_SAMPLE_COUNT,
} from "../src/SimConstants.js";

/** A model whose generator injects noise, as the sim does by default. */
function noisyModel(amplitude = 0.15): OscilloscopeModel {
  return new OscilloscopeModel({
    noiseEnabledProperty: new BooleanProperty(true),
    noiseAmplitudeProperty: new NumberProperty(amplitude),
  });
}

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
  it("defaults to CH1 patched to function-generator A, with CH2 unpatched and off", () => {
    const model = new OscilloscopeModel();
    expect(model.ch1.inputProperty.value).toBe("functionGeneratorA");
    expect(model.ch2.inputProperty.value).toBe("none");
    expect(model.ch1.enabledProperty.value).toBe(true);
    expect(model.ch2.enabledProperty.value).toBe(false);
    model.dispose();
  });

  it("enforces exclusive source-jack occupancy across channels", () => {
    const model = new OscilloscopeModel();
    model.ch2.inputProperty.value = "functionGeneratorA";
    expect(model.ch1.inputProperty.value).toBe("none");
    expect(model.ch2.inputProperty.value).toBe("functionGeneratorA");
    model.connectJack(1, "functionGeneratorB");
    expect(model.ch1.inputProperty.value).toBe("functionGeneratorB");
    expect(model.channelForJack("functionGeneratorB")).toBe(model.ch1);
    model.dispose();
  });

  it("leaves an unpatched channel flat", () => {
    const model = new OscilloscopeModel();
    model.ch1.inputProperty.value = "none";
    model.refresh();
    for (const v of model.ch1Trace) {
      expect(v).toBe(0);
    }
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

  it("produces a flat line for the microphone patch with no live mic", () => {
    const model = new OscilloscopeModel();
    model.ch1.inputProperty.value = "microphone";
    model.refresh();
    for (const v of model.ch1Trace) {
      expect(v).toBe(0);
    }
    model.dispose();
  });

  it("recaptures the microphone even when the trigger watches CH2", () => {
    const model = new OscilloscopeModel();
    const fillTrace = vi.spyOn(model.audioInput, "fillTrace");

    model.ch1.inputProperty.value = "microphone";
    model.trigger.sourceProperty.value = "ch2";
    model.refresh();
    expect(fillTrace).toHaveBeenCalledTimes(1);

    model.refresh();
    expect(fillTrace).toHaveBeenCalledTimes(2);

    model.ch1.inputProperty.value = "functionGeneratorA";
    model.refresh();
    expect(fillTrace).toHaveBeenCalledTimes(2);

    fillTrace.mockRestore();
    model.dispose();
  });

  it("samples FG B with the configured phase into a channel", () => {
    const model = new OscilloscopeModel();
    model.ch1.inputProperty.value = "functionGeneratorA";
    model.ch2.enabledProperty.value = true;
    model.ch2.inputProperty.value = "functionGeneratorB";
    model.functionGenerator.waveformProperty.value = "sine";
    model.functionGenerator.amplitudeProperty.value = 1;
    model.functionGenerator.phaseProperty.value = 180;
    model.refresh();

    // 180° phase makes B the negation of A at every sample.
    let maxAbsDiffFromNegation = 0;
    for (let i = 0; i < model.ch1Trace.length; i++) {
      const a = model.ch1Trace[i] ?? 0;
      const b = model.ch2Trace[i] ?? 0;
      maxAbsDiffFromNegation = Math.max(maxAbsDiffFromNegation, Math.abs(b - -a));
    }
    expect(maxAbsDiffFromNegation).toBeLessThan(1e-6);
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

  it("AC coupling holds the baseline steady as the timebase changes", () => {
    // Regression: subtracting the mean of the *visible window* made the baseline
    // of an asymmetric waveform jump whenever time/div changed the number of
    // cycles on screen. A real scope's AC coupling is a fixed high-pass.
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "pulse";
    model.functionGenerator.dutyCycleProperty.value = 0.2;
    model.functionGenerator.offsetProperty.value = 0;
    model.ch1.couplingProperty.value = "AC";

    const centerVolts: number[] = [];
    for (const timePerDivision of [0.001, 0.0012, 0.0017, 0.002]) {
      model.timePerDivisionProperty.value = timePerDivision;
      model.refresh();
      const trace = model.ch1Trace;
      centerVolts.push(trace[Math.floor(trace.length / 2)] ?? 0);
    }

    const spread = Math.max(...centerVolts) - Math.min(...centerVolts);
    expect(spread).toBeLessThan(1e-6);
    model.dispose();
  });

  it("AC coupling removes the analytic DC of a duty-cycled waveform", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "pulse";
    model.functionGenerator.dutyCycleProperty.value = 0.25;
    model.functionGenerator.amplitudeProperty.value = 1;
    model.functionGenerator.offsetProperty.value = 0;
    model.ch1.couplingProperty.value = "AC";
    model.refresh();

    // A 25% pulse of amplitude 1 has a DC component of 0.25 V, so AC coupling
    // shifts the high level to +0.75 and the low level to -0.25.
    const { min, max } = extremes(model.ch1Trace);
    expect(max).toBeCloseTo(0.75, 5);
    expect(min).toBeCloseTo(-0.25, 5);
    model.dispose();
  });

  it("keeps a noiseless measurement trace alongside the displayed one", () => {
    // Regression: measurements read the displayed (noisy) buffer, so Vpp — an
    // extreme-value statistic — was biased outward by roughly the noise amplitude.
    const model = noisyModel(0.15);
    model.functionGenerator.waveformProperty.value = "sine";
    model.functionGenerator.amplitudeProperty.value = 1;
    model.refresh();

    const displayed = extremes(model.ch1Trace);
    const measured = extremes(model.primaryCleanTrace);

    // The clean trace is a faithful ±1 sine …
    expect(measured.max - measured.min).toBeCloseTo(2, 2);
    // … while the displayed trace carries the injected noise.
    expect(displayed.max - displayed.min).toBeGreaterThan(2.1);
    model.dispose();
  });

  describe("trigger modes", () => {
    /**
     * Captures one sweep at amplitude 1, then puts the trigger level out of reach
     * *and* doubles the amplitude. Whether the trace picks up the new amplitude is
     * what distinguishes a free-running sweep from a held one.
     */
    function captureThenChangeSignalOutOfTrigger(model: OscilloscopeModel): Float32Array {
      model.functionGenerator.amplitudeProperty.value = 1;
      model.functionGenerator.offsetProperty.value = 0;
      model.trigger.levelProperty.value = 0;
      model.refresh();
      const captured = model.ch1Trace.slice();

      model.functionGenerator.amplitudeProperty.value = 2;
      model.trigger.levelProperty.value = 10; // out of reach of the ±2 V signal
      return captured;
    }

    it("auto free-runs when the trigger never fires", () => {
      const model = new OscilloscopeModel();
      model.trigger.modeProperty.value = "auto";
      const captured = captureThenChangeSignalOutOfTrigger(model);

      model.refresh();
      // Auto keeps sweeping, so the new amplitude reaches the display.
      expect(extremes(model.ch1Trace).max).toBeGreaterThan(1.5);
      expect(Array.from(model.ch1Trace)).not.toEqual(Array.from(captured));
      model.dispose();
    });

    it("normal holds the last sweep until the trigger fires", () => {
      const model = new OscilloscopeModel();
      model.trigger.modeProperty.value = "normal";
      const captured = captureThenChangeSignalOutOfTrigger(model);

      model.refresh();
      // Held: the frozen sweep still shows the old amplitude.
      expect(Array.from(model.ch1Trace)).toEqual(Array.from(captured));
      expect(extremes(model.ch1Trace).max).toBeLessThan(1.5);

      // Bring the level back within reach and the sweep resumes.
      model.trigger.levelProperty.value = 0;
      model.refresh();
      expect(extremes(model.ch1Trace).max).toBeGreaterThan(1.5);
      model.dispose();
    });

    it("single captures one triggered sweep and then stops", () => {
      const model = new OscilloscopeModel();
      model.timer.isPlayingProperty.value = true;
      model.trigger.modeProperty.value = "single";

      // Selecting SINGLE arms the capture.
      expect(model.trigger.armedProperty.value).toBe(true);

      model.refresh();
      expect(model.trigger.armedProperty.value).toBe(false);
      expect(model.timer.isPlayingProperty.value).toBe(false);
      model.dispose();
    });

    it("single holds its capture until re-armed, and RUN re-arms it", () => {
      const model = new OscilloscopeModel();
      model.functionGenerator.amplitudeProperty.value = 1;
      model.timer.isPlayingProperty.value = true;
      model.trigger.modeProperty.value = "single";
      model.refresh();
      const captured = model.ch1Trace.slice();
      expect(model.timer.isPlayingProperty.value).toBe(false);

      // Disarmed: even a perfectly triggerable signal must not resample.
      model.functionGenerator.amplitudeProperty.value = 3;
      model.refresh();
      expect(Array.from(model.ch1Trace)).toEqual(Array.from(captured));

      // Pressing RUN re-arms, so the next sweep captures the new signal.
      model.timer.isPlayingProperty.value = true;
      expect(model.trigger.armedProperty.value).toBe(true);
      model.refresh();
      expect(extremes(model.ch1Trace).max).toBeGreaterThan(2);
      expect(model.timer.isPlayingProperty.value).toBe(false);
      model.dispose();
    });

    it("single stays armed while the trigger cannot fire", () => {
      const model = new OscilloscopeModel();
      model.timer.isPlayingProperty.value = true;
      model.functionGenerator.amplitudeProperty.value = 1;
      model.functionGenerator.offsetProperty.value = 0;
      model.trigger.levelProperty.value = 10; // out of reach of the ±1 V signal
      model.trigger.modeProperty.value = "single";

      model.refresh();
      // No trigger event, so the capture is still pending and the clock runs on.
      expect(model.trigger.armedProperty.value).toBe(true);
      expect(model.timer.isPlayingProperty.value).toBe(true);

      model.trigger.levelProperty.value = 0;
      model.refresh();
      expect(model.trigger.armedProperty.value).toBe(false);
      expect(model.timer.isPlayingProperty.value).toBe(false);
      model.dispose();
    });
  });

  it("reset() restores the BNC patches, sensitivities, and generator", () => {
    const model = new OscilloscopeModel();
    model.ch1.inputProperty.value = "microphone";
    model.ch2.inputProperty.value = "functionGeneratorA";
    model.timePerDivisionProperty.value = 0.01;
    model.ch1.voltsPerDivisionProperty.value = 2;
    model.functionGenerator.frequencyProperty.value = 1000;
    model.reset();
    expect(model.ch1.inputProperty.value).toBe("functionGeneratorA");
    expect(model.ch2.inputProperty.value).toBe("none");
    expect(model.timePerDivisionProperty.value).toBe(0.001);
    expect(model.ch1.voltsPerDivisionProperty.value).toBe(0.5);
    expect(model.functionGenerator.frequencyProperty.value).toBe(FG_DEFAULT_FREQUENCY);
    model.dispose();
  });
});
