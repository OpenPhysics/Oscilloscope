/**
 * CursorReadoutNode.ts
 *
 * A translucent readout for the draggable measurement cursors, shown at the
 * top-right of the display when cursors are enabled. It reports the time and
 * voltage differences between the cursor pairs and the derived cursor frequency:
 * Δt, 1/Δt, and ΔV. The view feeds it live numeric Properties.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { GridBox, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { formatFrequency, formatPeriod, formatVoltage } from "./formatUnits.js";

const READOUT_FONT = new PhetFont(11);

export type CursorMeasurements = {
  readonly deltaTimeProperty: TReadOnlyProperty<number>;
  readonly cursorFrequencyProperty: TReadOnlyProperty<number>;
  readonly deltaVoltageProperty: TReadOnlyProperty<number>;
};

export class CursorReadoutNode extends Rectangle {
  public constructor(measurements: CursorMeasurements, visibleProperty: TReadOnlyProperty<boolean>) {
    const m = StringManager.getInstance().getMeasurements();

    const text = (property: TReadOnlyProperty<string>): Text =>
      new Text(property, { font: READOUT_FONT, fill: OscilloscopeColors.cursorColorProperty });

    const dtString = new DerivedProperty([measurements.deltaTimeProperty, m.noneStringProperty], (s, dash) =>
      s > 0 ? formatPeriod(s) : dash,
    );
    const freqString = new DerivedProperty([measurements.cursorFrequencyProperty, m.noneStringProperty], (hz, dash) =>
      hz > 0 ? formatFrequency(hz) : dash,
    );
    const dvString = new DerivedProperty([measurements.deltaVoltageProperty], formatVoltage);

    const grid = new GridBox({
      xSpacing: 10,
      ySpacing: 2,
      xAlign: "left",
      rows: [
        [text(m.deltaTimeStringProperty), text(dtString)],
        [text(m.cursorFrequencyStringProperty), text(freqString)],
        [text(m.deltaVoltageStringProperty), text(dvString)],
      ],
    });

    super(0, 0, grid.width + 16, grid.height + 12, {
      fill: "rgba(0, 0, 0, 0.55)",
      cornerRadius: 4,
      visibleProperty,
    });
    grid.left = 8;
    grid.centerY = this.rectHeight / 2;
    this.addChild(grid);
  }
}
