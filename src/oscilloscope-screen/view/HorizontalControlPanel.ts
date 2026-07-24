/**
 * HorizontalControlPanel.ts
 *
 * The horizontal (timebase) section: a time/div rotary switch, a horizontal
 * position knob, a ×10 magnifier button, and an X-Y mode button.
 */

import { DerivedProperty } from "scenerystack/axon";
import { HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { PanelButton } from "../../common/controls/PanelButton.js";
import { RotaryKnob } from "../../common/controls/RotaryKnob.js";
import { RotarySwitch } from "../../common/controls/RotarySwitch.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { SCOPE_HORIZONTAL_POSITION_RANGE, SCOPE_TIME_PER_DIV_STEPS } from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { derivedString, numberItems } from "./controlHelpers.js";
import { formatTimePerDiv } from "./formatUnits.js";

const HEADING_FONT = new PhetFont({ size: 15, weight: "bold" });

export class HorizontalControlPanel extends SimPanel {
  public readonly controlsInOrder: Node[];

  public constructor(model: OscilloscopeModel) {
    const strings = StringManager.getInstance();
    const h = strings.getHorizontal();
    const a11y = strings.getA11yStrings().controls;

    const timeSwitch = new RotarySwitch(
      model.timePerDivisionProperty,
      numberItems(SCOPE_TIME_PER_DIV_STEPS, formatTimePerDiv),
      {
        radius: 24,
        captionStringProperty: h.timePerDivisionStringProperty,
        accessibleName: a11y.timePerDivisionStringProperty,
      },
    );

    const positionKnob = new RotaryKnob(model.horizontalPositionProperty, SCOPE_HORIZONTAL_POSITION_RANGE, {
      radius: 20,
      captionStringProperty: h.positionStringProperty,
      valueStringProperty: derivedString(model.horizontalPositionProperty, (v) => `${v.toFixed(2)} div`),
      accessibleName: a11y.horizontalPositionStringProperty,
    });

    const magButton = new PanelButton({
      labelStringProperty: h.magnifyStringProperty,
      indicatorProperty: model.magnifyProperty,
      accessibleName: a11y.magnifyStringProperty,
      listener: () => {
        model.magnifyProperty.value = !model.magnifyProperty.value;
      },
      minWidth: 66,
    });

    const xyButton = new PanelButton({
      labelStringProperty: h.xyModeStringProperty,
      indicatorProperty: new DerivedProperty([model.displayModeProperty], (m) => m === "xy"),
      accessibleName: a11y.xyModeStringProperty,
      listener: () => {
        model.displayModeProperty.value = model.displayModeProperty.value === "xy" ? "yt" : "xy";
      },
      minWidth: 66,
    });

    const content = new VBox({
      align: "left",
      spacing: 10,
      children: [
        new Text(h.titleStringProperty, { font: HEADING_FONT, fill: OscilloscopeColors.textColorProperty }),
        new HBox({ spacing: 14, align: "top", children: [timeSwitch, positionKnob] }),
        new HBox({ spacing: 10, align: "center", children: [magButton, xyButton] }),
      ],
    });

    super(content);

    this.controlsInOrder = [timeSwitch, positionKnob, magButton, xyButton];
  }
}
