/**
 * OscilloscopePreferencesModel.ts
 *
 * Model for the simulation-specific preferences shown in Preferences →
 * Simulation. Each preference Property takes its initial value from the
 * corresponding query parameter in oscilloscopeQueryParameters.
 */

import { BooleanProperty } from "scenerystack/axon";
import type { Tandem } from "scenerystack/tandem";
import OscilloscopeNamespace from "../OscilloscopeNamespace.js";
import oscilloscopeQueryParameters from "./oscilloscopeQueryParameters.js";

export class OscilloscopePreferencesModel {
  /**
   * Whether the on-screen measurement readout (frequency, period, Vpp) is drawn
   * over the display. Initial value comes from the `measurements` query parameter.
   */
  public readonly showMeasurementsProperty: BooleanProperty;

  public constructor(tandem?: Tandem) {
    this.showMeasurementsProperty = new BooleanProperty(
      oscilloscopeQueryParameters.measurements,
      tandem ? { tandem: tandem.createTandem("showMeasurementsProperty") } : undefined,
    );
  }

  public reset(): void {
    this.showMeasurementsProperty.reset();
  }
}

OscilloscopeNamespace.register("OscilloscopePreferencesModel", OscilloscopePreferencesModel);
