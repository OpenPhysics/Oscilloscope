/**
 * OscilloscopePreferencesModel.ts
 *
 * Model for the simulation-specific preferences shown in Preferences →
 * Simulation. Each preference Property takes its initial value from the
 * corresponding query parameter in oscilloscopeQueryParameters.
 */

import { BooleanProperty, NumberProperty } from "scenerystack/axon";
import type { Tandem } from "scenerystack/tandem";
import OscilloscopeNamespace from "../OscilloscopeNamespace.js";
import { FG_NOISE_AMPLITUDE_RANGE } from "../SimConstants.js";
import oscilloscopeQueryParameters from "./oscilloscopeQueryParameters.js";

export class OscilloscopePreferencesModel {
  /**
   * Whether the on-screen measurement readout (frequency, period, Vpp) is drawn
   * over the display. Initial value comes from the `measurements` query parameter.
   */
  public readonly showMeasurementsProperty: BooleanProperty;

  /** Whether additive signal noise is injected. Read live by the function generator. */
  public readonly noiseEnabledProperty: BooleanProperty;

  /** Amplitude of the injected noise, in volts. */
  public readonly noiseAmplitudeProperty: NumberProperty;

  public constructor(tandem?: Tandem) {
    this.showMeasurementsProperty = new BooleanProperty(
      oscilloscopeQueryParameters.measurements,
      tandem ? { tandem: tandem.createTandem("showMeasurementsProperty") } : undefined,
    );
    this.noiseEnabledProperty = new BooleanProperty(
      oscilloscopeQueryParameters.noise,
      tandem ? { tandem: tandem.createTandem("noiseEnabledProperty") } : undefined,
    );
    this.noiseAmplitudeProperty = new NumberProperty(oscilloscopeQueryParameters.noiseAmplitude, {
      range: FG_NOISE_AMPLITUDE_RANGE,
      units: "V",
      ...(tandem ? { tandem: tandem.createTandem("noiseAmplitudeProperty") } : {}),
    });
  }

  public reset(): void {
    this.showMeasurementsProperty.reset();
    this.noiseEnabledProperty.reset();
    this.noiseAmplitudeProperty.reset();
  }
}

OscilloscopeNamespace.register("OscilloscopePreferencesModel", OscilloscopePreferencesModel);
