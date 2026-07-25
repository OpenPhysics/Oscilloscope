/**
 * OscilloscopeScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * For multi-screen simulations, duplicate this file (e.g. IntroScreen.ts,
 * LabScreen.ts), add each screen to the screens array in src/main.ts, and put
 * shared create*Icon() factories in src/common/{SimName}ScreenIcons.ts (see
 * doc/multi-screen.md).
 */
import type { TProperty, TReadOnlyProperty } from "scenerystack/axon";
import { optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import OscilloscopeColors from "../OscilloscopeColors.js";
import { OscilloscopeModel } from "./model/OscilloscopeModel.js";
import { OscilloscopeKeyboardHelpContent } from "./view/OscilloscopeKeyboardHelpContent.js";
import { OscilloscopeScreenView } from "./view/OscilloscopeScreenView.js";

type SelfOptions = {
  // Preference (owned by main.ts) controlling the on-screen measurement readout.
  // Writable so the front-panel Measure button can toggle it.
  showMeasurementsProperty: TProperty<boolean>;
  // Preference-owned noise injection controls, read live by the model's generator.
  noiseEnabledProperty: TReadOnlyProperty<boolean>;
  noiseAmplitudeProperty: TReadOnlyProperty<number>;
};

// Require tandem to be explicit: joist threads it through to the screen's view.
export type OscilloscopeScreenOptions = SelfOptions & ScreenOptions & { tandem: Tandem };

export class OscilloscopeScreen extends Screen<OscilloscopeModel, OscilloscopeScreenView> {
  public constructor(options: OscilloscopeScreenOptions) {
    const showMeasurementsProperty = options.showMeasurementsProperty;
    const { noiseEnabledProperty, noiseAmplitudeProperty } = options;

    super(
      // Model factory — called once when the screen is first shown
      () => new OscilloscopeModel({ noiseEnabledProperty, noiseAmplitudeProperty }),
      // View factory — receives the model instance
      (model) =>
        new OscilloscopeScreenView(model, {
          showMeasurementsProperty,
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<OscilloscopeScreenOptions, SelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: OscilloscopeColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new OscilloscopeKeyboardHelpContent(),
        },
        options,
      ),
    );
  }
}
