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
import {
  FG_DEFAULT_FREQUENCY,
  HORIZONTAL_DIVISIONS,
  SCOPE_MAGNIFY_FACTOR,
  SCOPE_TIME_PER_DIV_STEPS,
  TRACE_SAMPLE_COUNT,
} from "../src/OscilloscopeConstants.js";
import { OscilloscopeModel } from "../src/oscilloscope-screen/model/OscilloscopeModel.js";

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

/** Counts zero-crossings, a proxy for how many waveform cycles are on screen. */
function signChanges(trace: Float32Array): number {
  let count = 0;
  for (let i = 1; i < trace.length; i++) {
    if (Math.sign(trace[i] ?? 0) !== Math.sign(trace[i - 1] ?? 0)) {
      count++;
    }
  }
  return count;
}

/** True when one more refresh (after `mutate`) changed the captured sweep. */
function sweepAdvanced(model: OscilloscopeModel, mutate: () => void): boolean {
  const before = Array.from(model.ch1CleanTrace);
  mutate();
  model.refresh();
  return before.some((v, i) => Math.abs(v - (model.ch1CleanTrace[i] ?? 0)) > 1e-6);
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
    // Mean should be ~0 after AC high-pass despite the +3 V offset.
    expect(Math.abs(sum / model.ch1Trace.length)).toBeLessThan(0.05);
    model.dispose();
  });

  it("×10 probe multiplies the effective volts/div without changing tip-voltage buffers", () => {
    const model = new OscilloscopeModel();
    model.ch1.voltsPerDivisionProperty.value = 0.5;
    expect(model.ch1.effectiveVoltsPerDivision).toBeCloseTo(0.5);
    model.ch1.probeProperty.value = 10;
    expect(model.ch1.effectiveVoltsPerDivision).toBeCloseTo(5);
    model.functionGenerator.amplitudeProperty.value = 1;
    model.refresh();
    const { max } = extremes(model.ch1Trace);
    // Tip voltage is unchanged — only the display scale uses the probe factor.
    expect(max).toBeGreaterThan(0.9);
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

  it("AC coupling keeps the mean near zero across timebases", () => {
    // A real scope's AC coupling is a fixed high-pass; the mean of an offset
    // sine should stay near zero regardless of how many cycles fit on screen.
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "sine";
    model.functionGenerator.amplitudeProperty.value = 1;
    model.functionGenerator.offsetProperty.value = 2;
    model.ch1.couplingProperty.value = "AC";

    for (const timePerDivision of [0.001, 0.0012, 0.0017, 0.002]) {
      model.timePerDivisionProperty.value = timePerDivision;
      model.refresh();
      let sum = 0;
      for (const v of model.ch1Trace) {
        sum += v;
      }
      expect(Math.abs(sum / model.ch1Trace.length)).toBeLessThan(0.08);
    }
    model.dispose();
  });

  it("AC coupling droops the flat top of a low-frequency square wave", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "square";
    model.functionGenerator.frequencyProperty.value = 50;
    model.functionGenerator.amplitudeProperty.value = 1;
    model.functionGenerator.offsetProperty.value = 0;
    model.functionGenerator.dutyCycleProperty.value = 0.5;
    model.timePerDivisionProperty.value = 0.005; // 50 ms window ≈ 2.5 cycles
    model.ch1.couplingProperty.value = "AC";
    model.trigger.levelProperty.value = 0;
    model.refresh();

    const trace = model.ch1Trace;
    // Find a run of high samples after the rising edge near center and confirm
    // later samples in that plateau are lower (exponential droop).
    const center = Math.floor(trace.length / 2);
    let peak = center;
    for (let i = center; i < center + 80 && i < trace.length; i++) {
      if ((trace[i] ?? 0) > (trace[peak] ?? 0)) {
        peak = i;
      }
    }
    const later = Math.min(trace.length - 1, peak + 40);
    expect(trace[peak] ?? 0).toBeGreaterThan(0.5);
    expect(trace[later] ?? 0).toBeLessThan((trace[peak] ?? 0) - 0.05);
    model.dispose();
  });

  it("AC coupling removes the DC of a duty-cycled waveform", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "pulse";
    model.functionGenerator.dutyCycleProperty.value = 0.25;
    model.functionGenerator.amplitudeProperty.value = 1;
    model.functionGenerator.offsetProperty.value = 0;
    model.functionGenerator.frequencyProperty.value = 1000; // well above the AC cutoff
    model.ch1.couplingProperty.value = "AC";
    model.refresh();

    let sum = 0;
    for (const v of model.ch1Trace) {
      sum += v;
    }
    expect(Math.abs(sum / model.ch1Trace.length)).toBeLessThan(0.15);
    const { min, max } = extremes(model.ch1Trace);
    // High sits above zero, low below — DC has been blocked.
    expect(max).toBeGreaterThan(0.4);
    expect(min).toBeLessThan(-0.1);
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

  describe("the trigger watches what the channel displays", () => {
    /** Volts at the centre column — the sample the trigger event is aligned to. */
    function centreSample(model: OscilloscopeModel): number {
      const buffer = model.ch1CleanTrace;
      return buffer[Math.floor(buffer.length / 2)] ?? 0;
    }

    /** Whether one more refresh changed the captured sweep. */
    function sweepAdvances(model: OscilloscopeModel, mutate: () => void): boolean {
      const before = Array.from(model.ch1CleanTrace);
      mutate();
      model.refresh();
      const after = model.ch1CleanTrace;
      return before.some((v, i) => Math.abs(v - (after[i] ?? 0)) > 1e-6);
    }

    it("fires an AC-coupled channel at the level shown on screen, not the raw one", () => {
      // The raw signal swings 2 V … 4 V; AC coupling centres the trace on 0 V, so a
      // 0 V trigger level is sitting right on the displayed waveform and must fire.
      const model = new OscilloscopeModel();
      const fg = model.functionGenerator;
      fg.waveformProperty.value = "sine";
      fg.frequencyProperty.value = 200;
      fg.amplitudeProperty.value = 1;
      fg.offsetProperty.value = 3;
      model.ch1.couplingProperty.value = "AC";
      model.trigger.levelProperty.value = 0;
      model.trigger.modeProperty.value = "normal";
      model.refresh();

      expect(
        sweepAdvances(model, () => {
          fg.frequencyProperty.value = 350;
        }),
      ).toBe(true);
      model.dispose();
    });

    it("aligns a DC-coupled capture exactly to the trigger level", () => {
      const model = new OscilloscopeModel();
      const fg = model.functionGenerator;
      fg.waveformProperty.value = "sine";
      fg.frequencyProperty.value = 200;
      fg.amplitudeProperty.value = 1;
      fg.offsetProperty.value = 0;
      model.ch1.couplingProperty.value = "DC";
      model.trigger.levelProperty.value = 0.5;
      model.refresh();

      // The buffer has an even sample count, so the nearest column sits half a
      // sample past the trigger instant — a few millivolts at this slew rate.
      expect(Math.abs(centreSample(model) - 0.5)).toBeLessThan(0.02);
      model.dispose();
    });

    it("aligns an AC-coupled capture to the level in displayed volts", () => {
      const model = new OscilloscopeModel();
      const fg = model.functionGenerator;
      fg.waveformProperty.value = "sine";
      fg.frequencyProperty.value = 200;
      fg.amplitudeProperty.value = 1;
      fg.offsetProperty.value = 3; // raw signal swings 2 V … 4 V
      model.ch1.couplingProperty.value = "AC";
      model.trigger.levelProperty.value = 0.5;
      model.refresh();

      // The comparator taps the signal ahead of the coupling network, exactly as a
      // bench scope does, so the capture lands within that network's phase lead of
      // the level: atan(1/ωτ) ≈ 4.6° here, worth ≈ 70 mV on a 1 V sine. What must
      // not come back is the old behaviour, where the comparator compared a 0.5 V
      // level against the un-shifted 2 V … 4 V signal and never fired at all.
      expect(centreSample(model)).toBeGreaterThan(0.4);
      expect(centreSample(model)).toBeLessThan(0.6);
      model.dispose();
    });

    it("fires an inverted channel on a rising edge of the drawn trace", () => {
      const model = new OscilloscopeModel();
      const fg = model.functionGenerator;
      fg.waveformProperty.value = "sine";
      fg.frequencyProperty.value = 200;
      fg.amplitudeProperty.value = 1;
      model.trigger.levelProperty.value = 0;
      model.trigger.slopeProperty.value = "rising";
      model.ch1.invertedProperty.value = true;
      model.refresh();

      // The view draws -1 × the buffer for an inverted channel.
      const buffer = model.ch1CleanTrace;
      const mid = Math.floor(buffer.length / 2);
      const drawnBefore = -(buffer[mid - 2] ?? 0);
      const drawnAfter = -(buffer[mid + 2] ?? 0);
      expect(drawnAfter).toBeGreaterThan(drawnBefore);
      model.dispose();
    });

    it("holds a NORMAL sweep when the trigger channel is grounded", () => {
      const model = new OscilloscopeModel();
      model.functionGenerator.frequencyProperty.value = 200;
      model.trigger.modeProperty.value = "normal";
      model.refresh();

      expect(
        sweepAdvances(model, () => {
          model.ch1.couplingProperty.value = "GND";
          model.functionGenerator.amplitudeProperty.value = 4;
        }),
      ).toBe(false);
      model.dispose();
    });
  });

  describe("microphone acquisition memory", () => {
    it("clamps the timebase to the window the analyser can fill", async () => {
      const model = new OscilloscopeModel();
      const limit = model.microphoneMaxTimePerDivision;
      expect(limit).toBeGreaterThan(0);

      model.timePerDivisionProperty.value = 0.5;
      model.connectJack(1, "microphone");
      await Promise.resolve();
      expect(model.timePerDivisionProperty.value).toBeLessThanOrEqual(limit);
      expect(SCOPE_TIME_PER_DIV_STEPS).toContain(model.timePerDivisionProperty.value);

      // Turning the knob past the limit while patched is pulled straight back.
      model.timePerDivisionProperty.value = 0.2;
      await Promise.resolve();
      expect(model.timePerDivisionProperty.value).toBeLessThanOrEqual(limit);
      model.dispose();
    });

    it("leaves the timebase alone once the microphone is unpatched", () => {
      const model = new OscilloscopeModel();
      model.connectJack(1, "microphone");
      model.disconnectChannel(1);
      model.timePerDivisionProperty.value = 0.5;
      expect(model.timePerDivisionProperty.value).toBe(0.5);
      model.dispose();
    });

    it("the ×10 magnifier buys back the sweeps it shortens", () => {
      const model = new OscilloscopeModel();
      const unmagnified = model.microphoneMaxTimePerDivision;
      model.magnifyProperty.value = true;
      expect(model.microphoneMaxTimePerDivision).toBeCloseTo(unmagnified * SCOPE_MAGNIFY_FACTOR, 9);
      model.dispose();
    });
  });

  describe("AC coupling accuracy", () => {
    it("holds the baseline at every timebase, including the fastest sweeps", () => {
      // The high-pass is settled by solving its periodic steady state in closed
      // form. A period-blind warm-up has to alias a fast carrier instead, which
      // left ~30 mV of baseline offset here.
      const model = new OscilloscopeModel();
      const fg = model.functionGenerator;
      fg.amplitudeProperty.value = 1;
      fg.offsetProperty.value = 2;
      model.ch1.couplingProperty.value = "AC";

      for (const [waveform, frequency, timePerDivision] of [
        ["sine", 200, 0.001],
        ["sine", 2000, 0.0001],
        ["sine", 20000, 0.00001],
        ["square", 20000, 0.00001],
        ["triangle", 5000, 0.00002],
      ] as const) {
        fg.waveformProperty.value = waveform;
        fg.frequencyProperty.value = frequency;
        model.timePerDivisionProperty.value = timePerDivision;
        model.refresh();

        let sum = 0;
        for (const v of model.ch1CleanTrace) {
          sum += v;
        }
        const mean = sum / model.ch1CleanTrace.length;
        expect(Math.abs(mean), `${waveform} at ${frequency} Hz, ${timePerDivision} s/div`).toBeLessThan(1e-3);
      }
      model.dispose();
    });

    it("still droops a signal slow enough to fall near the coupling corner", () => {
      // 50 Hz against a 10 ms time constant is genuinely inside the high-pass's
      // skirt: a real AC-coupled scope tilts this trace, and so must this one.
      const model = new OscilloscopeModel();
      const fg = model.functionGenerator;
      fg.waveformProperty.value = "square";
      fg.frequencyProperty.value = 50;
      fg.amplitudeProperty.value = 1;
      fg.offsetProperty.value = 0;
      model.ch1.couplingProperty.value = "AC";
      model.timePerDivisionProperty.value = 0.005;
      model.refresh();

      const trace = model.ch1CleanTrace;
      const first = trace[0] ?? 0;
      let maxDroop = 0;
      for (let i = 0; i < 40; i++) {
        maxDroop = Math.max(maxDroop, Math.abs((trace[i] ?? 0) - first));
      }
      expect(maxDroop).toBeGreaterThan(0.01);
      model.dispose();
    });
  });

  describe("captureSingle", () => {
    it("selects SINGLE, arms, and starts the sweep clock", () => {
      const model = new OscilloscopeModel();
      model.timer.isPlayingProperty.value = false;
      model.captureSingle();
      expect(model.trigger.modeProperty.value).toBe("single");
      expect(model.trigger.armedProperty.value).toBe(true);
      expect(model.timer.isPlayingProperty.value).toBe(true);
      model.dispose();
    });

    it("re-arms a scope that already took its capture", () => {
      const model = new OscilloscopeModel();
      model.functionGenerator.frequencyProperty.value = 200;
      model.trigger.levelProperty.value = 0;
      model.captureSingle();
      model.refresh();
      expect(model.trigger.armedProperty.value).toBe(false);
      expect(model.timer.isPlayingProperty.value).toBe(false);

      model.captureSingle();
      expect(model.trigger.armedProperty.value).toBe(true);
      expect(model.timer.isPlayingProperty.value).toBe(true);
      model.dispose();
    });
  });

  describe("trigger sources", () => {
    it("LINE triggers independently of the channels", () => {
      // A grounded CH1 offers no trigger, but LINE fires on the internal mains
      // reference regardless, so a NORMAL sweep stays live.
      const model = new OscilloscopeModel();
      model.functionGenerator.frequencyProperty.value = 200;
      model.trigger.sourceProperty.value = "line";
      model.trigger.modeProperty.value = "normal";
      model.ch1.couplingProperty.value = "GND";
      model.refresh();
      expect(
        sweepAdvanced(model, () => {
          model.ch1.couplingProperty.value = "DC";
          model.functionGenerator.amplitudeProperty.value = 3;
        }),
      ).toBe(true);
      model.dispose();
    });

    it("EXT triggers on the generator output as an external sync", () => {
      const model = new OscilloscopeModel();
      const fg = model.functionGenerator;
      fg.waveformProperty.value = "sine";
      fg.frequencyProperty.value = 200;
      fg.amplitudeProperty.value = 1;
      model.trigger.sourceProperty.value = "ext";
      model.trigger.levelProperty.value = 0;
      model.trigger.modeProperty.value = "normal";
      model.refresh();
      expect(
        sweepAdvanced(model, () => {
          fg.frequencyProperty.value = 350;
        }),
      ).toBe(true);
      model.dispose();
    });
  });

  describe("trigger holdoff", () => {
    it("leaves a simple repetitive trigger stationary and centered", () => {
      // On a single-edge-per-cycle waveform, holdoff only skips whole periods and
      // lands on the same phase — the display is unchanged, as on a real scope.
      const model = new OscilloscopeModel();
      const fg = model.functionGenerator;
      fg.waveformProperty.value = "sine";
      fg.amplitudeProperty.value = 1;
      fg.frequencyProperty.value = 200;
      model.trigger.sourceProperty.value = "ch1";
      model.trigger.levelProperty.value = 0;
      model.trigger.slopeProperty.value = "rising";

      const captureCenter = (): Float32Array => {
        model.refresh();
        return model.ch1CleanTrace.slice();
      };
      const withoutHoldoff = captureCenter();
      model.trigger.holdoffProperty.value = 0.003; // 3 ms, within the 5 ms period
      const withHoldoff = captureCenter();

      const center = Math.round((withHoldoff.length - 1) / 2);
      expect(Math.abs(withHoldoff[center] ?? 0)).toBeLessThan(0.05);
      expect(withHoldoff[center + 5] ?? 0).toBeGreaterThan(withHoldoff[center] ?? 0);
      // Identical to the no-holdoff capture: a single-edge signal is unaffected.
      expect(Array.from(withHoldoff)).toEqual(Array.from(withoutHoldoff));
      model.dispose();
    });
  });

  describe("delayed sweep", () => {
    it("exposes the delayed window as the displayed timebase only in delayed mode", () => {
      const model = new OscilloscopeModel();
      model.timePerDivisionProperty.value = 0.001;
      model.delayedTimePerDivisionProperty.value = 0.0001;

      expect(model.delayedActive).toBe(false);
      expect(model.displayedTimeWindow).toBeCloseTo(model.timeWindow);

      model.delayedSweepModeProperty.value = "intensified";
      expect(model.delayedActive).toBe(false); // the band shows, but the sweep is still main

      model.delayedSweepModeProperty.value = "delayed";
      expect(model.delayedActive).toBe(true);
      expect(model.displayedTimeWindow).toBeCloseTo(model.delayedWindow);
      expect(model.displayedTimePerDivision).toBeCloseTo(0.0001);
      model.dispose();
    });

    it("zooms into a shorter slice of the signal", () => {
      const model = new OscilloscopeModel();
      const fg = model.functionGenerator;
      fg.waveformProperty.value = "sine";
      fg.amplitudeProperty.value = 1;
      fg.frequencyProperty.value = 1000;
      model.timePerDivisionProperty.value = 0.001; // main: 10 ms ≈ 10 cycles
      model.delayedTimePerDivisionProperty.value = 0.0001; // delayed: 1 ms ≈ 1 cycle
      model.delayProperty.value = 5;

      model.refresh();
      const mainCycles = signChanges(model.ch1CleanTrace);

      model.delayedSweepModeProperty.value = "delayed";
      model.refresh();
      const delayedCycles = signChanges(model.ch1CleanTrace);

      // The delayed sweep shows far fewer cycles (~1/10 of the main window) …
      expect(delayedCycles).toBeLessThan(mainCycles / 4);
      // … but it is still the same full-amplitude sine.
      const { min, max } = extremes(model.ch1CleanTrace);
      expect(max).toBeGreaterThan(0.9);
      expect(min).toBeLessThan(-0.9);
      model.dispose();
    });

    it("is inert while the microphone is patched", () => {
      const model = new OscilloscopeModel();
      model.delayedSweepModeProperty.value = "delayed";
      expect(model.delayedActive).toBe(true);
      model.connectJack(1, "microphone");
      expect(model.delayedActive).toBe(false);
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
    model.trigger.sourceProperty.value = "line";
    model.trigger.holdoffProperty.value = 0.01;
    model.delayedSweepModeProperty.value = "delayed";
    model.beamFinderProperty.value = true;
    model.reset();
    expect(model.ch1.inputProperty.value).toBe("functionGeneratorA");
    expect(model.ch2.inputProperty.value).toBe("none");
    expect(model.timePerDivisionProperty.value).toBe(0.001);
    expect(model.ch1.voltsPerDivisionProperty.value).toBe(0.5);
    expect(model.functionGenerator.frequencyProperty.value).toBe(FG_DEFAULT_FREQUENCY);
    expect(model.trigger.sourceProperty.value).toBe("ch1");
    expect(model.trigger.holdoffProperty.value).toBe(0);
    expect(model.delayedSweepModeProperty.value).toBe("off");
    expect(model.beamFinderProperty.value).toBe(false);
    model.dispose();
  });
});
