/**
 * FunctionGenerator.ts
 *
 * A synthetic signal source: a classic function generator producing a sine,
 * square, triangle, sawtooth, pulse, or noise voltage at a chosen frequency and
 * amplitude, with a DC offset, an adjustable duty cycle (for square/pulse), and
 * a CH2 phase shift for dual-channel phase comparisons.
 *
 * The generator is analytic — `voltageAt(t)` returns the voltage at any time `t`,
 * so the oscilloscope can sample it at whatever resolution the horizontal
 * (time/div) setting demands. Optional additive noise can be injected to support
 * signal-to-noise discussions.
 */

import { BooleanProperty, NumberProperty, StringUnionProperty, type TReadOnlyProperty } from "scenerystack/axon";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";
import {
  FG_AMPLITUDE_RANGE,
  FG_DEFAULT_AMPLITUDE,
  FG_DEFAULT_DUTY_CYCLE,
  FG_DEFAULT_FREQUENCY,
  FG_DEFAULT_NOISE_AMPLITUDE,
  FG_DEFAULT_OFFSET,
  FG_DEFAULT_PHASE,
  FG_DUTY_CYCLE_RANGE,
  FG_FREQUENCY_RANGE,
  FG_NOISE_AMPLITUDE_RANGE,
  FG_OFFSET_RANGE,
  FG_PHASE_RANGE,
} from "../../SimConstants.js";
import { WAVEFORMS, type Waveform, waveformMean, waveformSample } from "./Waveform.js";

export class FunctionGenerator {
  /** The waveform shape currently being generated. */
  public readonly waveformProperty = new StringUnionProperty<Waveform>("sine", {
    validValues: [...WAVEFORMS],
  });

  /** Signal frequency, in hertz. */
  public readonly frequencyProperty: NumberProperty;

  /** Signal amplitude (zero-to-peak), in volts. */
  public readonly amplitudeProperty: NumberProperty;

  /** DC offset added to the signal, in volts. */
  public readonly offsetProperty: NumberProperty;

  /** Duty cycle (high-fraction) for the square / pulse waveforms, unitless. */
  public readonly dutyCycleProperty: NumberProperty;

  /** Phase of CH2 relative to CH1, in degrees. */
  public readonly phaseProperty: NumberProperty;

  /** Whether additive noise is injected onto the signal. Read-only here; owned by preferences. */
  public readonly noiseEnabledProperty: TReadOnlyProperty<boolean>;

  /** Amplitude of the additive noise, in volts. Read-only here; owned by preferences. */
  public readonly noiseAmplitudeProperty: TReadOnlyProperty<number>;

  // Concrete references to the noise Properties only when this generator owns
  // them (i.e. they were not injected from preferences); used for reset/dispose.
  private readonly ownedNoiseEnabled: BooleanProperty | null;
  private readonly ownedNoiseAmplitude: NumberProperty | null;

  public constructor(
    noiseEnabledProperty?: TReadOnlyProperty<boolean>,
    noiseAmplitudeProperty?: TReadOnlyProperty<number>,
  ) {
    this.frequencyProperty = new NumberProperty(FG_DEFAULT_FREQUENCY, {
      range: FG_FREQUENCY_RANGE,
      units: "Hz",
    });
    this.amplitudeProperty = new NumberProperty(FG_DEFAULT_AMPLITUDE, {
      range: FG_AMPLITUDE_RANGE,
      units: "V",
    });
    this.offsetProperty = new NumberProperty(FG_DEFAULT_OFFSET, {
      range: FG_OFFSET_RANGE,
      units: "V",
    });
    this.dutyCycleProperty = new NumberProperty(FG_DEFAULT_DUTY_CYCLE, {
      range: FG_DUTY_CYCLE_RANGE,
    });
    this.phaseProperty = new NumberProperty(FG_DEFAULT_PHASE, {
      range: FG_PHASE_RANGE,
      units: "°",
    });

    if (noiseEnabledProperty) {
      this.noiseEnabledProperty = noiseEnabledProperty;
      this.ownedNoiseEnabled = null;
    } else {
      const owned = new BooleanProperty(false);
      this.noiseEnabledProperty = owned;
      this.ownedNoiseEnabled = owned;
    }
    if (noiseAmplitudeProperty) {
      this.noiseAmplitudeProperty = noiseAmplitudeProperty;
      this.ownedNoiseAmplitude = null;
    } else {
      const owned = new NumberProperty(FG_DEFAULT_NOISE_AMPLITUDE, {
        range: FG_NOISE_AMPLITUDE_RANGE,
        units: "V",
      });
      this.noiseAmplitudeProperty = owned;
      this.ownedNoiseAmplitude = owned;
    }
  }

  /**
   * The noiseless generated voltage at time `t` (seconds). Used for the trigger
   * search, which needs a stable, repeatable waveform.
   *
   * @param t - time, in seconds, measured from the sweep origin
   * @param phaseDegrees - extra phase offset in degrees (CH2 uses `phaseProperty`; CH1 uses 0)
   */
  public cleanVoltageAt(t: number, phaseDegrees = 0): number {
    const cycles = this.frequencyProperty.value * t + phaseDegrees / 360;
    const shape = waveformSample(this.waveformProperty.value, cycles, this.dutyCycleProperty.value);
    return this.amplitudeProperty.value * shape + this.offsetProperty.value;
  }

  /**
   * The instantaneous generated voltage at time `t` (seconds), including any
   * injected noise. This is what the oscilloscope actually displays.
   */
  public voltageAt(t: number, phaseDegrees = 0): number {
    return this.cleanVoltageAt(t, phaseDegrees) + this.noiseSample();
  }

  /**
   * One independent additive-noise sample, in volts (0 when noise is disabled).
   *
   * Exposed separately so a caller that has already evaluated the clean waveform
   * can add noise without paying for a second waveform evaluation.
   */
  public noiseSample(): number {
    if (!(this.noiseEnabledProperty.value && this.noiseAmplitudeProperty.value > 0)) {
      return 0;
    }
    // Uniform additive noise, independent per sample.
    return (Math.random() * 2 - 1) * this.noiseAmplitudeProperty.value;
  }

  /**
   * The signal's exact DC component, in volts: the generator's offset plus the
   * mean of the (amplitude-scaled) waveform shape. Used by AC coupling, which
   * must remove the true DC rather than the mean of the visible window.
   */
  public get meanVoltage(): number {
    const shapeMean = waveformMean(this.waveformProperty.value, this.dutyCycleProperty.value);
    return this.amplitudeProperty.value * shapeMean + this.offsetProperty.value;
  }

  public reset(): void {
    this.waveformProperty.reset();
    this.frequencyProperty.reset();
    this.amplitudeProperty.reset();
    this.offsetProperty.reset();
    this.dutyCycleProperty.reset();
    this.phaseProperty.reset();
    // Injected (preference-owned) noise Properties are not reset by Reset All.
    this.ownedNoiseEnabled?.reset();
    this.ownedNoiseAmplitude?.reset();
  }

  public dispose(): void {
    this.waveformProperty.dispose();
    this.frequencyProperty.dispose();
    this.amplitudeProperty.dispose();
    this.offsetProperty.dispose();
    this.dutyCycleProperty.dispose();
    this.phaseProperty.dispose();
    this.ownedNoiseEnabled?.dispose();
    this.ownedNoiseAmplitude?.dispose();
  }
}

OscilloscopeNamespace.register("FunctionGenerator", FunctionGenerator);
