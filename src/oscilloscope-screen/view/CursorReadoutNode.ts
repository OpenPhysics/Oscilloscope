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
import {
  READOUT_COLUMN_SPACING,
  READOUT_CORNER_RADIUS,
  READOUT_FONT_SIZE,
  READOUT_INSET,
  READOUT_ROW_SPACING,
  READOUT_X_PADDING,
  READOUT_Y_PADDING,
} from "../../SimConstants.js";
import { formatFrequency, formatPeriod, formatVoltage } from "./formatUnits.js";

const READOUT_FONT = new PhetFont(READOUT_FONT_SIZE);

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
      xSpacing: READOUT_COLUMN_SPACING,
      ySpacing: READOUT_ROW_SPACING,
      xAlign: "left",
      rows: [
        [text(m.deltaTimeStringProperty), text(dtString)],
        [text(m.cursorFrequencyStringProperty), text(freqString)],
        [text(m.deltaVoltageStringProperty), text(dvString)],
      ],
    });

    super(0, 0, grid.width + READOUT_X_PADDING, grid.height + READOUT_Y_PADDING, {
      fill: OscilloscopeColors.readoutBackgroundColorProperty,
      cornerRadius: READOUT_CORNER_RADIUS,
      visibleProperty,
    });
    grid.left = READOUT_INSET;
    grid.centerY = this.rectHeight / 2;
    this.addChild(grid);
  }
}
