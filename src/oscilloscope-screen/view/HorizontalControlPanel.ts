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
import { DisposalBag } from "../../common/DisposalBag.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import {
  SCOPE_DELAY_RANGE,
  SCOPE_HORIZONTAL_POSITION_RANGE,
  SCOPE_TIME_PER_DIV_STEPS,
} from "../../OscilloscopeConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { DELAYED_SWEEP_MODES } from "../model/OscilloscopeModel.js";
import { derivedString, numberItems, unionItems } from "./controlHelpers.js";
import { formatDivisions, formatTimePerDiv } from "./formatUnits.js";
import { withSectionHeader } from "./panelSection.js";

export class HorizontalControlPanel extends SimPanel {
  public readonly controlsInOrder: Node[];

  private readonly bag: DisposalBag;

  public constructor(model: OscilloscopeModel) {
    const bag = new DisposalBag();
    const strings = StringManager.getInstance();
    const h = strings.getHorizontal();
    const a11y = strings.getA11yStrings().controls;

    const positionReadoutProperty = derivedString(model.horizontalPositionProperty, formatDivisions);
    const positionKnob = new RotaryKnob(model.horizontalPositionProperty, SCOPE_HORIZONTAL_POSITION_RANGE, {
      radius: 18,
      captionStringProperty: h.positionStringProperty,
      valueStringProperty: positionReadoutProperty,
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

    const xyActiveProperty = new DerivedProperty([model.displayModeProperty], (m) => m === "xy");
    const xyButton = new PanelButton({
      labelStringProperty: h.xyModeStringProperty,
      indicatorProperty: xyActiveProperty,
      accessibleName: a11y.xyModeStringProperty,
      listener: () => {
        model.displayModeProperty.value = model.displayModeProperty.value === "xy" ? "yt" : "xy";
      },
      minWidth: 66,
      fontSize: 11,
    });

    // ── Delayed sweep (second timebase) ───────────────────────────────────────
    const delayedModeSwitch = new RotarySwitch(
      model.delayedSweepModeProperty,
      unionItems(DELAYED_SWEEP_MODES, {
        off: h.delayedOffStringProperty,
        intensified: h.delayedIntensifiedStringProperty,
        delayed: h.delayedDelayedStringProperty,
      }),
      {
        radius: 16,
        captionStringProperty: h.delayedModeStringProperty,
        accessibleName: a11y.delayedSweepStringProperty,
      },
    );

    const delayReadoutProperty = derivedString(model.delayProperty, formatDivisions);
    const delayKnob = new RotaryKnob(model.delayProperty, SCOPE_DELAY_RANGE, {
      radius: 16,
      captionStringProperty: h.delayStringProperty,
      valueStringProperty: delayReadoutProperty,
      accessibleName: a11y.delayPositionStringProperty,
    });

    const delayedTimeSwitch = new RotarySwitch(
      model.delayedTimePerDivisionProperty,
      numberItems(SCOPE_TIME_PER_DIV_STEPS, formatTimePerDiv),
      {
        radius: 18,
        captionStringProperty: h.delayedScaleStringProperty,
        accessibleName: a11y.delayedTimePerDivisionStringProperty,
      },
    );

    const body = new VBox({
      align: "left",
      spacing: 8,
      children: [
        new HBox({ spacing: 12, align: "top", children: [positionKnob, timeSwitch] }),
        new HBox({ spacing: 8, children: [magButton, xyButton] }),
        new HBox({ spacing: 10, align: "top", children: [delayedModeSwitch, delayKnob, delayedTimeSwitch] }),
      ],
    });

    super(withSectionHeader(h.titleStringProperty, body, { bag }), { xMargin: 10, yMargin: 8 });

    this.bag = bag;
    this.bag.own(
      positionKnob,
      timeSwitch,
      magButton,
      xyButton,
      delayedModeSwitch,
      delayKnob,
      delayedTimeSwitch,
      positionReadoutProperty,
      xyActiveProperty,
      delayReadoutProperty,
    );

    this.controlsInOrder = [
      positionKnob,
      timeSwitch,
      magButton,
      xyButton,
      delayedModeSwitch,
      delayKnob,
      delayedTimeSwitch,
    ];
  }

  public override dispose(): void {
    this.bag.dispose();
    super.dispose();
  }
}
