/**
 * FunctionGenerator.ts
 *
 * A synthetic signal source: a classic function generator producing a sine,
 * square, triangle, or sawtooth voltage at a chosen frequency and amplitude.
 *
 * The generator is analytic — `voltageAt(t)` returns the exact voltage at any
 * time `t`, so the oscilloscope can sample it at whatever resolution the
 * horizontal (time/div) setting demands.
 */

import { NumberProperty, StringUnionProperty } from "scenerystack/axon";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";
import {
  FG_AMPLITUDE_RANGE,
  FG_DEFAULT_AMPLITUDE,
  FG_DEFAULT_FREQUENCY,
  FG_FREQUENCY_RANGE,
} from "../../SimConstants.js";
import { WAVEFORMS, type Waveform, waveformSample } from "./Waveform.js";

export class FunctionGenerator {
  /** The waveform shape currently being generated. */
  public readonly waveformProperty = new StringUnionProperty<Waveform>("sine", {
    validValues: [...WAVEFORMS],
  });

  /** Signal frequency, in hertz. */
  public readonly frequencyProperty: NumberProperty;

  /** Signal amplitude (zero-to-peak), in volts. */
  public readonly amplitudeProperty: NumberProperty;

  public constructor() {
    this.frequencyProperty = new NumberProperty(FG_DEFAULT_FREQUENCY, {
      range: FG_FREQUENCY_RANGE,
      units: "Hz",
    });
    this.amplitudeProperty = new NumberProperty(FG_DEFAULT_AMPLITUDE, {
      range: FG_AMPLITUDE_RANGE,
      units: "V",
    });
  }

  /**
   * The instantaneous generated voltage at time `t` (seconds).
   * Phase is measured from t = 0, so a triggered display of this source is
   * stationary and depends only on frequency, amplitude, and waveform.
   */
  public voltageAt(t: number): number {
    const phase = this.frequencyProperty.value * t;
    return this.amplitudeProperty.value * waveformSample(this.waveformProperty.value, phase);
  }

  public reset(): void {
    this.waveformProperty.reset();
    this.frequencyProperty.reset();
    this.amplitudeProperty.reset();
  }

  public dispose(): void {
    this.waveformProperty.dispose();
    this.frequencyProperty.dispose();
    this.amplitudeProperty.dispose();
  }
}

OscilloscopeNamespace.register("FunctionGenerator", FunctionGenerator);
