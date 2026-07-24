/**
 * MeasurementReadoutNode.ts
 *
 * A small translucent readout overlaid on the top-left of the display, echoing
 * a real scope's automatic measurements: frequency, period, and peak-to-peak
 * voltage (Vpp). Frequency and period are known exactly for the function
 * generator; for the live microphone they read "—". Vpp is measured from the
 * displayed trace, so it is meaningful for both sources.
 *
 * Visibility is bound to the Preferences → Simulation "Show on-screen
 * measurements" toggle.
 */

import { DerivedProperty, PatternStringProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { Rectangle, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { formatFrequency, formatPeriod, formatVoltage } from "./formatUnits.js";

const READOUT_FONT = new PhetFont(12);
const NO_VALUE = "—";

export class MeasurementReadoutNode extends Rectangle {
  public constructor(
    model: OscilloscopeModel,
    measuredVppProperty: TReadOnlyProperty<number>,
    showMeasurementsProperty: TReadOnlyProperty<boolean>,
  ) {
    const measurements = StringManager.getInstance().getMeasurements();
    const fg = model.functionGenerator;

    const frequencyValueProperty = new DerivedProperty([model.sourceProperty, fg.frequencyProperty], (source, hz) =>
      source === "functionGenerator" ? formatFrequency(hz) : NO_VALUE,
    );
    const periodValueProperty = new DerivedProperty([model.sourceProperty, fg.frequencyProperty], (source, hz) =>
      source === "functionGenerator" && hz > 0 ? formatPeriod(1 / hz) : NO_VALUE,
    );
    const vppValueProperty = new DerivedProperty([measuredVppProperty], (vpp) => formatVoltage(vpp));

    const line = (pattern: TReadOnlyProperty<string>, valueProperty: TReadOnlyProperty<string>) =>
      new Text(new PatternStringProperty(pattern, { value: valueProperty }), {
        font: READOUT_FONT,
        fill: OscilloscopeColors.displayReadoutColorProperty,
      });

    const content = new VBox({
      align: "left",
      spacing: 3,
      children: [
        line(measurements.frequencyStringProperty, frequencyValueProperty),
        line(measurements.periodStringProperty, periodValueProperty),
        line(measurements.vppStringProperty, vppValueProperty),
      ],
    });

    // Semi-transparent card behind the text so it stays legible over the trace.
    super(0, 0, content.width + 16, content.height + 12, {
      fill: "rgba(0, 0, 0, 0.55)",
      cornerRadius: 4,
      visibleProperty: showMeasurementsProperty,
    });
    content.centerY = this.rectHeight / 2;
    content.left = 8;
    this.addChild(content);
  }
}
