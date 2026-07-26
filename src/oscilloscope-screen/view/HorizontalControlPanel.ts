/**
 * HorizontalControlPanel.ts
 *
 * TBS-style horizontal section: Position and Scale (time/div), ×10 magnifier,
 * and X-Y as a secondary mode button. FFT lives with Vertical (Math/F).
 */

import { DerivedProperty } from "scenerystack/axon";
import { HBox, type Node, VBox } from "scenerystack/scenery";
import { PanelButton } from "../../common/controls/PanelButton.js";
import { RotaryKnob } from "../../common/controls/RotaryKnob.js";
import { RotarySwitch } from "../../common/controls/RotarySwitch.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import { SCOPE_HORIZONTAL_POSITION_RANGE, SCOPE_TIME_PER_DIV_STEPS } from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { derivedString, numberItems } from "./controlHelpers.js";
import { formatDivisions, formatTimePerDiv } from "./formatUnits.js";
import { withSectionHeader } from "./panelSection.js";

export class HorizontalControlPanel extends SimPanel {
  public readonly controlsInOrder: Node[];

  public constructor(model: OscilloscopeModel) {
    const strings = StringManager.getInstance();
    const h = strings.getHorizontal();
    const a11y = strings.getA11yStrings().controls;

    const positionKnob = new RotaryKnob(model.horizontalPositionProperty, SCOPE_HORIZONTAL_POSITION_RANGE, {
      radius: 18,
      captionStringProperty: h.positionStringProperty,
      valueStringProperty: derivedString(model.horizontalPositionProperty, formatDivisions),
      accessibleName: a11y.horizontalPositionStringProperty,
    });

    const timeSwitch = new RotarySwitch(
      model.timePerDivisionProperty,
      numberItems(SCOPE_TIME_PER_DIV_STEPS, formatTimePerDiv),
      {
        radius: 22,
        captionStringProperty: h.timePerDivisionStringProperty,
        accessibleName: a11y.timePerDivisionStringProperty,
      },
    );

    const magButton = new PanelButton({
      labelStringProperty: h.magnifyStringProperty,
      indicatorProperty: model.magnifyProperty,
      accessibleName: a11y.magnifyStringProperty,
      listener: () => {
        model.magnifyProperty.value = !model.magnifyProperty.value;
      },
      minWidth: 66,
      fontSize: 11,
    });

    const xyButton = new PanelButton({
      labelStringProperty: h.xyModeStringProperty,
      indicatorProperty: new DerivedProperty([model.displayModeProperty], (m) => m === "xy"),
      accessibleName: a11y.xyModeStringProperty,
      listener: () => {
        model.displayModeProperty.value = model.displayModeProperty.value === "xy" ? "yt" : "xy";
      },
      minWidth: 66,
      fontSize: 11,
    });

    const body = new VBox({
      align: "left",
      spacing: 8,
      children: [
        new HBox({ spacing: 12, align: "top", children: [positionKnob, timeSwitch] }),
        new HBox({ spacing: 8, children: [magButton, xyButton] }),
      ],
    });

    super(withSectionHeader(h.titleStringProperty, body), { xMargin: 10, yMargin: 8 });

    this.controlsInOrder = [positionKnob, timeSwitch, magButton, xyButton];
  }
}
