/**
 * OscilloscopePreferencesNode.ts
 *
 * Custom preferences UI shown in Preferences → Simulation. Controls are bound
 * to OscilloscopePreferencesModel Properties (whose initial values come from
 * oscilloscopeQueryParameters).
 *
 * The Preferences dialog chrome is always light (joist), independent of the
 * sim's default/projector color profile. All fills here therefore use the
 * light-surface palette (same values as projector), never theme-aware panel
 * text/background colors that flip to near-white in default mode.
 */

import { DerivedProperty } from "scenerystack/axon";
import { Text, VBox } from "scenerystack/scenery";
import { NumberControl, PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import type { Tandem } from "scenerystack/tandem";
import { LIGHT_SURFACE_TEXT_FILL } from "../common/SimButtonOptions.js";
import { StringManager } from "../i18n/StringManager.js";
import OscilloscopeColors from "../OscilloscopeColors.js";
import { FG_NOISE_AMPLITUDE_RANGE } from "../OscilloscopeConstants.js";
import OscilloscopeNamespace from "../OscilloscopeNamespace.js";
import type { OscilloscopePreferencesModel } from "./OscilloscopePreferencesModel.js";

export class OscilloscopePreferencesNode extends VBox {
  public constructor(preferencesModel: OscilloscopePreferencesModel, tandem?: Tandem) {
    const prefStrings = StringManager.getInstance().getPreferences();

    const header = new Text(prefStrings.titleStringProperty, {
      font: new PhetFont({ size: 18, weight: "bold" }),
      fill: LIGHT_SURFACE_TEXT_FILL,
    });

    const checkboxOptions = {
      checkboxColor: LIGHT_SURFACE_TEXT_FILL,
      checkboxColorBackground: OscilloscopeColors.controlSurfaceColorProperty,
      spacing: 8,
    };

    const showMeasurementsCheckbox = new Checkbox(
      preferencesModel.showMeasurementsProperty,
      new Text(prefStrings.showMeasurementsStringProperty, {
        font: new PhetFont(14),
        fill: LIGHT_SURFACE_TEXT_FILL,
      }),
      {
        ...checkboxOptions,
        ...(tandem && { tandem: tandem.createTandem("showMeasurementsCheckbox") }),
      },
    );

    const noiseCheckbox = new Checkbox(
      preferencesModel.noiseEnabledProperty,
      new Text(prefStrings.noiseStringProperty, {
        font: new PhetFont(14),
        fill: LIGHT_SURFACE_TEXT_FILL,
      }),
      {
        ...checkboxOptions,
        ...(tandem && { tandem: tandem.createTandem("noiseCheckbox") }),
      },
    );

    // Noise-amplitude control is enabled only while noise injection is on.
    const noiseAmplitudeControl = new NumberControl(
      prefStrings.noiseAmplitudeStringProperty,
      preferencesModel.noiseAmplitudeProperty,
      FG_NOISE_AMPLITUDE_RANGE,
      {
        enabledProperty: new DerivedProperty([preferencesModel.noiseEnabledProperty], (on) => on),
        delta: 0.05,
        titleNodeOptions: { font: new PhetFont(13), fill: LIGHT_SURFACE_TEXT_FILL },
        numberDisplayOptions: {
          decimalPlaces: 2,
          textOptions: { font: new PhetFont(13), fill: LIGHT_SURFACE_TEXT_FILL },
          backgroundFill: OscilloscopeColors.controlSurfaceColorProperty,
        },
        // Dark thumb so it stays readable on the always-white dialog in either profile.
        sliderOptions: { thumbFill: LIGHT_SURFACE_TEXT_FILL },
        ...(tandem && { tandem: tandem.createTandem("noiseAmplitudeControl") }),
      },
    );

    super({
      align: "left",
      spacing: 12,
      children: [header, showMeasurementsCheckbox, noiseCheckbox, noiseAmplitudeControl],
    });
  }
}

OscilloscopeNamespace.register("OscilloscopePreferencesNode", OscilloscopePreferencesNode);
