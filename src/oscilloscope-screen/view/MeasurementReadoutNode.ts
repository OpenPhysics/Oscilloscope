/**
 * MeasurementReadoutNode.ts
 *
 * A translucent automatic-measurements readout overlaid on the top-left of the
 * display, echoing a real scope's MEASURE panel: frequency, period, and the
 * peak-to-peak, RMS, max and min voltages of the primary channel. The view feeds
 * it live numeric Properties (measured each frame); this node formats them.
 *
 * Visibility is bound to the Preferences → Simulation "Show on-screen
 * measurements" toggle.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { GridBox, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { formatFrequency, formatPeriod, formatVoltage } from "./formatUnits.js";

const READOUT_FONT = new PhetFont(11);

export type MeasurementProperties = {
  /** Signal frequency in Hz; 0 or negative renders as "—". */
  readonly frequencyProperty: TReadOnlyProperty<number>;
  /** Signal period in seconds; 0 or negative renders as "—". */
  readonly periodProperty: TReadOnlyProperty<number>;
  readonly vppProperty: TReadOnlyProperty<number>;
  readonly vrmsProperty: TReadOnlyProperty<number>;
  readonly vmaxProperty: TReadOnlyProperty<number>;
  readonly vminProperty: TReadOnlyProperty<number>;
};

export class MeasurementReadoutNode extends Rectangle {
  public constructor(measurements: MeasurementProperties, showMeasurementsProperty: TReadOnlyProperty<boolean>) {
    const m = StringManager.getInstance().getMeasurements();
    const none = m.noneStringProperty;

    const valueText = (property: TReadOnlyProperty<string>): Text =>
      new Text(property, { font: READOUT_FONT, fill: OscilloscopeColors.displayReadoutColorProperty });

    const labelText = (property: TReadOnlyProperty<string>): Text =>
      new Text(property, { font: READOUT_FONT, fill: OscilloscopeColors.displayReadoutColorProperty });

    const freqString = new DerivedProperty([measurements.frequencyProperty, none], (hz, dash) =>
      hz > 0 ? formatFrequency(hz) : dash,
    );
    const periodString = new DerivedProperty([measurements.periodProperty, none], (s, dash) =>
      s > 0 ? formatPeriod(s) : dash,
    );
    const vppString = new DerivedProperty([measurements.vppProperty], formatVoltage);
    const vrmsString = new DerivedProperty([measurements.vrmsProperty], formatVoltage);
    const vmaxString = new DerivedProperty([measurements.vmaxProperty], formatVoltage);
    const vminString = new DerivedProperty([measurements.vminProperty], formatVoltage);

    const grid = new GridBox({
      xSpacing: 10,
      ySpacing: 2,
      xAlign: "left",
      rows: [
        [labelText(m.frequencyStringProperty), valueText(freqString)],
        [labelText(m.periodStringProperty), valueText(periodString)],
        [labelText(m.vppStringProperty), valueText(vppString)],
        [labelText(m.vrmsStringProperty), valueText(vrmsString)],
        [labelText(m.vmaxStringProperty), valueText(vmaxString)],
        [labelText(m.vminStringProperty), valueText(vminString)],
      ],
    });

    super(0, 0, grid.width + 16, grid.height + 12, {
      fill: "rgba(0, 0, 0, 0.55)",
      cornerRadius: 4,
      visibleProperty: showMeasurementsProperty,
    });
    grid.left = 8;
    grid.centerY = this.rectHeight / 2;
    this.addChild(grid);
  }
}
