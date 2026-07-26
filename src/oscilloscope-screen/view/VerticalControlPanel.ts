/**
 * VerticalControlPanel.ts
 *
 * TBS-style vertical section: per-channel Position / Menu / Scale, coupling and
 * invert under each column, then Math and FFT buttons, with CH1/CH2 BNC jacks
 * along the bottom.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { HBox, type Node, Text, type TPaint, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { PanelButton } from "../../common/controls/PanelButton.js";
import { RotaryKnob } from "../../common/controls/RotaryKnob.js";
import { RotarySwitch } from "../../common/controls/RotarySwitch.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { SCOPE_POSITION_RANGE, SCOPE_PROBE_FACTORS, SCOPE_VOLTS_PER_DIV_STEPS } from "../../SimConstants.js";
import type { Channel } from "../model/Channel.js";
import { COUPLINGS } from "../model/Coupling.js";
import { MATH_MODES, type OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { derivedString, numberItems, unionItems } from "./controlHelpers.js";
import { formatDivisions, formatVoltsPerDiv } from "./formatUnits.js";
import { withSectionHeader } from "./panelSection.js";

const CHANNEL_FONT = new PhetFont({ size: 13, weight: "bold" });

type ChannelA11y = {
  voltsPerDivision: TReadOnlyProperty<string>;
  probe: TReadOnlyProperty<string>;
  position: TReadOnlyProperty<string>;
  coupling: TReadOnlyProperty<string>;
  invert: TReadOnlyProperty<string>;
  enabled: TReadOnlyProperty<string>;
};

export type VerticalControlPanelOptions = {
  /** CH1 BNC jack node (owned by the patch layer). */
  ch1Bnc: Node;
  /** CH2 BNC jack node (owned by the patch layer). */
  ch2Bnc: Node;
};

export class VerticalControlPanel extends SimPanel {
  public readonly controlsInOrder: Node[] = [];

  public constructor(model: OscilloscopeModel, options: VerticalControlPanelOptions) {
    const strings = StringManager.getInstance();
    const v = strings.getVertical();
    const trig = strings.getTrigger();
    const acq = strings.getAcquisition();
    const a11y = strings.getA11yStrings().controls;

    const column1 = new VerticalControlPanelColumn(
      model.ch1,
      OscilloscopeColors.channel1ColorProperty,
      trig.ch1StringProperty,
      {
        voltsPerDivision: a11y.ch1VoltsPerDivisionStringProperty,
        probe: a11y.ch1ProbeStringProperty,
        position: a11y.ch1PositionStringProperty,
        coupling: a11y.ch1CouplingStringProperty,
        invert: a11y.ch1InvertStringProperty,
        enabled: a11y.ch1EnabledStringProperty,
      },
    );
    const column2 = new VerticalControlPanelColumn(
      model.ch2,
      OscilloscopeColors.channel2ColorProperty,
      trig.ch2StringProperty,
      {
        voltsPerDivision: a11y.ch2VoltsPerDivisionStringProperty,
        probe: a11y.ch2ProbeStringProperty,
        position: a11y.ch2PositionStringProperty,
        coupling: a11y.ch2CouplingStringProperty,
        invert: a11y.ch2InvertStringProperty,
        enabled: a11y.ch2EnabledStringProperty,
      },
    );

    const mathLabelProperty = new DerivedProperty(
      [
        model.mathModeProperty,
        acq.mathStringProperty,
        acq.mathOffStringProperty,
        acq.mathAddStringProperty,
        acq.mathSubtractStringProperty,
      ],
      (mode, math, off, add, subtract) => {
        if (mode === "add") {
          return `${math}: ${add}`;
        }
        if (mode === "subtract") {
          return `${math}: ${subtract}`;
        }
        return `${math}: ${off}`;
      },
    );
    const mathButton = new PanelButton({
      labelStringProperty: mathLabelProperty,
      indicatorProperty: new DerivedProperty([model.mathModeProperty], (mode) => mode !== "off"),
      indicatorColor: OscilloscopeColors.mathTraceColorProperty,
      accessibleName: a11y.mathStringProperty,
      listener: () => {
        const i = MATH_MODES.indexOf(model.mathModeProperty.value);
        const next = MATH_MODES[(i + 1) % MATH_MODES.length];
        if (next !== undefined) {
          model.mathModeProperty.value = next;
        }
      },
      minWidth: 88,
      fontSize: 11,
    });

    const fftButton = new PanelButton({
      labelStringProperty: acq.fftStringProperty,
      indicatorProperty: new DerivedProperty([model.displayModeProperty], (m) => m === "fft"),
      accessibleName: a11y.fftStringProperty,
      listener: () => {
        model.displayModeProperty.value = model.displayModeProperty.value === "fft" ? "yt" : "fft";
      },
      minWidth: 44,
    });

    // Math / FFT sit as a button column on the left edge of the section, like the
    // real scope's M / FFT / Ref stack beside the vertical knobs.
    const mathColumn = new VBox({ align: "center", spacing: 8, children: [mathButton, fftButton] });

    const body = new VBox({
      align: "center",
      spacing: 8,
      children: [
        new HBox({ spacing: 16, align: "top", children: [mathColumn, column1, column2] }),
        new HBox({ spacing: 28, align: "top", children: [options.ch1Bnc, options.ch2Bnc] }),
      ],
    });

    super(withSectionHeader(v.titleStringProperty, body), { xMargin: 10, yMargin: 8 });

    this.controlsInOrder.push(
      ...column1.order,
      ...column2.order,
      mathButton,
      fftButton,
      options.ch1Bnc,
      options.ch2Bnc,
    );
  }
}

/** One channel's TBS-style column: Position, Menu (1/2), Scale, coupling, invert. */
class VerticalControlPanelColumn extends VBox {
  public readonly order: Node[];

  public constructor(
    channel: Channel,
    color: TPaint,
    headingStringProperty: TReadOnlyProperty<string>,
    a11y: ChannelA11y,
  ) {
    const strings = StringManager.getInstance();
    const v = strings.getVertical();

    const positionKnob = new RotaryKnob(channel.positionProperty, SCOPE_POSITION_RANGE, {
      radius: 18,
      captionStringProperty: v.positionStringProperty,
      valueStringProperty: derivedString(channel.positionProperty, formatDivisions),
      accessibleName: a11y.position,
    });

    const menuButton = new PanelButton({
      labelStringProperty: headingStringProperty,
      indicatorProperty: channel.enabledProperty,
      indicatorColor: color,
      accessibleName: a11y.enabled,
      listener: () => {
        channel.enabledProperty.value = !channel.enabledProperty.value;
      },
      minWidth: 52,
    });

    const voltsSwitch = new RotarySwitch(
      channel.voltsPerDivisionProperty,
      SCOPE_VOLTS_PER_DIV_STEPS.map((value) => ({
        value,
        stringProperty: new DerivedProperty([channel.probeProperty], (probe) => formatVoltsPerDiv(value * probe)),
      })),
      { radius: 20, captionStringProperty: v.voltsPerDivisionStringProperty, accessibleName: a11y.voltsPerDivision },
    );

    const probeSwitch = new RotarySwitch(
      channel.probeProperty,
      numberItems(SCOPE_PROBE_FACTORS, (factor) => `×${factor}`),
      { radius: 14, captionStringProperty: v.probeStringProperty, accessibleName: a11y.probe },
    );

    const couplingSwitch = new RotarySwitch(
      channel.couplingProperty,
      unionItems(COUPLINGS, {
        DC: v.dcStringProperty,
        AC: v.acStringProperty,
        GND: v.gndStringProperty,
      }),
      { radius: 14, captionStringProperty: v.couplingStringProperty, accessibleName: a11y.coupling },
    );

    const invertButton = new PanelButton({
      labelStringProperty: v.invertStringProperty,
      indicatorProperty: channel.invertedProperty,
      accessibleName: a11y.invert,
      listener: () => {
        channel.invertedProperty.value = !channel.invertedProperty.value;
      },
      minWidth: 52,
      fontSize: 11,
    });

    super({
      align: "center",
      spacing: 6,
      children: [
        new Text(headingStringProperty, { font: CHANNEL_FONT, fill: color }),
        positionKnob,
        menuButton,
        voltsSwitch,
        probeSwitch,
        couplingSwitch,
        invertButton,
      ],
    });

    this.order = [positionKnob, menuButton, voltsSwitch, probeSwitch, couplingSwitch, invertButton];
  }
}
