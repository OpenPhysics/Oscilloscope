/**
 * CursorReadoutNode.ts
 *
 * A translucent readout for the draggable measurement cursors, shown at the
 * top-right of the display when cursors are enabled. In Y-T mode it reports Δt,
 * 1/Δt, and ΔV; in FFT mode it reports the two frequency-cursor readouts and Δf.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { GridBox, Node, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { DisposalBag } from "../../common/DisposalBag.js";
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
} from "../../OscilloscopeConstants.js";
import type { DisplayMode } from "../model/OscilloscopeModel.js";
import { formatFrequency, formatPeriod, formatVoltage } from "./formatUnits.js";

const READOUT_FONT = new PhetFont(READOUT_FONT_SIZE);

export type CursorMeasurements = {
  readonly deltaTimeProperty: TReadOnlyProperty<number>;
  readonly cursorFrequencyProperty: TReadOnlyProperty<number>;
  readonly deltaVoltageProperty: TReadOnlyProperty<number>;
  readonly frequency1Property: TReadOnlyProperty<number>;
  readonly frequency2Property: TReadOnlyProperty<number>;
  readonly deltaFrequencyProperty: TReadOnlyProperty<number>;
  readonly displayModeProperty: TReadOnlyProperty<DisplayMode>;
};

export class CursorReadoutNode extends Rectangle {
  private readonly bag: DisposalBag;

  public constructor(measurements: CursorMeasurements, visibleProperty: TReadOnlyProperty<boolean>) {
    const bag = new DisposalBag();
    const m = StringManager.getInstance().getMeasurements();

    const text = (property: TReadOnlyProperty<string>): Text => {
      const node = new Text(property, { font: READOUT_FONT, fill: OscilloscopeColors.cursorColorProperty });
      bag.own(node);
      return node;
    };

    const dtString = new DerivedProperty([measurements.deltaTimeProperty, m.noneStringProperty], (s, dash) =>
      s > 0 ? formatPeriod(s) : dash,
    );
    const freqString = new DerivedProperty([measurements.cursorFrequencyProperty, m.noneStringProperty], (hz, dash) =>
      hz > 0 ? formatFrequency(hz) : dash,
    );
    const dvString = new DerivedProperty([measurements.deltaVoltageProperty], formatVoltage);
    const f1String = new DerivedProperty([measurements.frequency1Property, m.noneStringProperty], (hz, dash) =>
      hz > 0 ? formatFrequency(hz) : dash,
    );
    const f2String = new DerivedProperty([measurements.frequency2Property, m.noneStringProperty], (hz, dash) =>
      hz > 0 ? formatFrequency(hz) : dash,
    );
    const dfString = new DerivedProperty([measurements.deltaFrequencyProperty, m.noneStringProperty], (hz, dash) =>
      hz > 0 ? formatFrequency(hz) : dash,
    );

    const ytGrid = new GridBox({
      xSpacing: READOUT_COLUMN_SPACING,
      ySpacing: READOUT_ROW_SPACING,
      xAlign: "left",
      rows: [
        [text(m.deltaTimeStringProperty), text(dtString)],
        [text(m.cursorFrequencyStringProperty), text(freqString)],
        [text(m.deltaVoltageStringProperty), text(dvString)],
      ],
    });

    const fftGrid = new GridBox({
      xSpacing: READOUT_COLUMN_SPACING,
      ySpacing: READOUT_ROW_SPACING,
      xAlign: "left",
      rows: [
        [text(m.frequency1StringProperty), text(f1String)],
        [text(m.frequency2StringProperty), text(f2String)],
        [text(m.deltaFrequencyStringProperty), text(dfString)],
      ],
    });

    const ytVisible = new DerivedProperty([measurements.displayModeProperty], (mode) => mode === "yt");
    const fftVisible = new DerivedProperty([measurements.displayModeProperty], (mode) => mode === "fft");
    ytGrid.visibleProperty = ytVisible;
    fftGrid.visibleProperty = fftVisible;

    const stack = new Node({ children: [ytGrid, fftGrid] });

    super(
      0,
      0,
      Math.max(ytGrid.width, fftGrid.width) + READOUT_X_PADDING,
      Math.max(ytGrid.height, fftGrid.height) + READOUT_Y_PADDING,
      {
        fill: OscilloscopeColors.readoutBackgroundColorProperty,
        cornerRadius: READOUT_CORNER_RADIUS,
        visibleProperty,
      },
    );
    stack.left = READOUT_INSET;
    stack.centerY = this.rectHeight / 2;
    this.addChild(stack);

    this.bag = bag;
    this.bag.own(
      dtString,
      freqString,
      dvString,
      f1String,
      f2String,
      dfString,
      ytVisible,
      fftVisible,
      ytGrid,
      fftGrid,
      stack,
    );
  }

  public override dispose(): void {
    this.bag.dispose();
    super.dispose();
  }
}
