/**
 * VerticalControlPanel.ts
 *
 * The vertical section of the front panel, one column per channel (CH1, CH2).
 * Each column carries the classic per-channel controls as hardware widgets: a
 * volts/div rotary switch, a vertical-position knob, an AC/DC/GND coupling
 * switch, an Invert button, and a color-coded on/off button.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { HBox, type Node, Text, type TPaint, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { PanelButton } from "../../common/controls/PanelButton.js";
import { RotaryKnob } from "../../common/controls/RotaryKnob.js";
import { RotarySwitch } from "../../common/controls/RotarySwitch.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { SCOPE_POSITION_RANGE, SCOPE_VOLTS_PER_DIV_STEPS } from "../../SimConstants.js";
import type { Channel } from "../model/Channel.js";
import { COUPLINGS } from "../model/Coupling.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { derivedString, numberItems, unionItems } from "./controlHelpers.js";
import { formatDivisions, formatVoltsPerDiv } from "./formatUnits.js";

const HEADING_FONT = new PhetFont({ size: 15, weight: "bold" });
const CHANNEL_FONT = new PhetFont({ size: 14, weight: "bold" });

type ChannelA11y = {
  voltsPerDivision: TReadOnlyProperty<string>;
  position: TReadOnlyProperty<string>;
  coupling: TReadOnlyProperty<string>;
  invert: TReadOnlyProperty<string>;
  enabled: TReadOnlyProperty<string>;
};

export class VerticalControlPanel extends SimPanel {
  /** Every interactive control, in reading order, for pdomOrder. */
  public readonly controlsInOrder: Node[] = [];

  public constructor(model: OscilloscopeModel) {
    const strings = StringManager.getInstance();
    const v = strings.getVertical();
    const trig = strings.getTrigger();
    const a11y = strings.getA11yStrings().controls;

    const column1 = new VerticalControlPanelColumn(
      model.ch1,
      OscilloscopeColors.channel1ColorProperty,
      trig.ch1StringProperty,
      {
        voltsPerDivision: a11y.ch1VoltsPerDivisionStringProperty,
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
        position: a11y.ch2PositionStringProperty,
        coupling: a11y.ch2CouplingStringProperty,
        invert: a11y.ch2InvertStringProperty,
        enabled: a11y.ch2EnabledStringProperty,
      },
    );

    const content = new VBox({
      align: "left",
      spacing: 10,
      children: [
        new Text(v.titleStringProperty, { font: HEADING_FONT, fill: OscilloscopeColors.textColorProperty }),
        new HBox({ spacing: 18, align: "top", children: [column1, column2] }),
      ],
    });

    super(content);

    this.controlsInOrder.push(...column1.order, ...column2.order);
  }
}

/** One channel's column of vertical controls. */
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

    const onButton = new PanelButton({
      labelStringProperty: headingStringProperty,
      indicatorProperty: channel.enabledProperty,
      indicatorColor: color,
      accessibleName: a11y.enabled,
      listener: () => {
        channel.enabledProperty.value = !channel.enabledProperty.value;
      },
      minWidth: 58,
    });

    const voltsSwitch = new RotarySwitch(
      channel.voltsPerDivisionProperty,
      numberItems(SCOPE_VOLTS_PER_DIV_STEPS, formatVoltsPerDiv),
      { radius: 22, captionStringProperty: v.voltsPerDivisionStringProperty, accessibleName: a11y.voltsPerDivision },
    );

    const positionKnob = new RotaryKnob(channel.positionProperty, SCOPE_POSITION_RANGE, {
      radius: 20,
      captionStringProperty: v.positionStringProperty,
      valueStringProperty: derivedString(channel.positionProperty, formatDivisions),
      accessibleName: a11y.position,
    });

    const couplingSwitch = new RotarySwitch(
      channel.couplingProperty,
      unionItems(COUPLINGS, {
        DC: v.dcStringProperty,
        AC: v.acStringProperty,
        GND: v.gndStringProperty,
      }),
      { radius: 18, captionStringProperty: v.couplingStringProperty, accessibleName: a11y.coupling },
    );

    const invertButton = new PanelButton({
      labelStringProperty: v.invertStringProperty,
      indicatorProperty: channel.invertedProperty,
      accessibleName: a11y.invert,
      listener: () => {
        channel.invertedProperty.value = !channel.invertedProperty.value;
      },
      minWidth: 58,
    });

    super({
      align: "center",
      spacing: 9,
      children: [
        new Text(headingStringProperty, { font: CHANNEL_FONT, fill: color }),
        onButton,
        voltsSwitch,
        positionKnob,
        couplingSwitch,
        invertButton,
      ],
    });

    this.order = [onButton, voltsSwitch, positionKnob, couplingSwitch, invertButton];
  }
}
