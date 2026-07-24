/**
 * OscilloscopePreferencesNode.ts
 *
 * Custom preferences UI shown in Preferences → Simulation. Controls are bound
 * to OscilloscopePreferencesModel Properties (whose initial values come from
 * oscilloscopeQueryParameters).
 */

import { Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import type { Tandem } from "scenerystack/tandem";
import { StringManager } from "../i18n/StringManager.js";
import OscilloscopeColors from "../OscilloscopeColors.js";
import OscilloscopeNamespace from "../OscilloscopeNamespace.js";
import type { OscilloscopePreferencesModel } from "./OscilloscopePreferencesModel.js";

export class OscilloscopePreferencesNode extends VBox {
  public constructor(preferencesModel: OscilloscopePreferencesModel, tandem?: Tandem) {
    const prefStrings = StringManager.getInstance().getPreferences();

    const header = new Text(prefStrings.titleStringProperty, {
      font: new PhetFont({ size: 18, weight: "bold" }),
      fill: OscilloscopeColors.textColorProperty,
    });

    const showMeasurementsCheckbox = new Checkbox(
      preferencesModel.showMeasurementsProperty,
      new Text(prefStrings.showMeasurementsStringProperty, {
        font: new PhetFont(14),
        fill: OscilloscopeColors.textColorProperty,
      }),
      {
        checkboxColor: OscilloscopeColors.textColorProperty,
        checkboxColorBackground: OscilloscopeColors.panelBackgroundColorProperty,
        spacing: 8,
        ...(tandem && { tandem: tandem.createTandem("showMeasurementsCheckbox") }),
      },
    );

    super({
      align: "left",
      spacing: 12,
      children: [header, showMeasurementsCheckbox],
    });
  }
}

OscilloscopeNamespace.register("OscilloscopePreferencesNode", OscilloscopePreferencesNode);
