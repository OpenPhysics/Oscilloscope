/**
 * TriggerControlPanel.ts
 *
 * The trigger section: a source switch (CH1 / CH2), a level knob (mirrored by the
 * draggable line on the display), a slope button (rising / falling), and a mode
 * switch (auto / normal / single).
 */

import { DerivedProperty } from "scenerystack/axon";
import { HBox, type Node, VBox } from "scenerystack/scenery";
import { PanelButton } from "../../common/controls/PanelButton.js";
import { RotaryKnob } from "../../common/controls/RotaryKnob.js";
import { RotarySwitch } from "../../common/controls/RotarySwitch.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import { SCOPE_TRIGGER_LEVEL_RANGE } from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { TRIGGER_MODES, TRIGGER_SOURCES } from "../model/Trigger.js";
import { derivedString, unionItems } from "./controlHelpers.js";
import { formatVoltage } from "./formatUnits.js";
import { withSectionHeader } from "./panelSection.js";

export class TriggerControlPanel extends SimPanel {
  public readonly controlsInOrder: Node[];

  public constructor(model: OscilloscopeModel) {
    const strings = StringManager.getInstance();
    const t = strings.getTrigger();
    const a11y = strings.getA11yStrings().controls;
    const trigger = model.trigger;

    const sourceSwitch = new RotarySwitch(
      trigger.sourceProperty,
      unionItems(TRIGGER_SOURCES, { ch1: t.ch1StringProperty, ch2: t.ch2StringProperty }),
      { radius: 18, captionStringProperty: t.sourceStringProperty, accessibleName: a11y.triggerSourceStringProperty },
    );

    const levelKnob = new RotaryKnob(trigger.levelProperty, SCOPE_TRIGGER_LEVEL_RANGE, {
      radius: 22,
      captionStringProperty: t.levelStringProperty,
      valueStringProperty: derivedString(trigger.levelProperty, formatVoltage),
      accessibleName: a11y.triggerLevelStringProperty,
      keyboardStep: 0.1,
      shiftKeyboardStep: 0.01,
      pageKeyboardStep: 1,
    });

    const slopeLabelProperty = new DerivedProperty(
      [trigger.slopeProperty, t.risingStringProperty, t.fallingStringProperty],
      (slope, rising, falling) => `${t.slopeStringProperty.value}: ${slope === "rising" ? rising : falling}`,
    );
    const slopeButton = new PanelButton({
      labelStringProperty: slopeLabelProperty,
      accessibleName: a11y.triggerSlopeStringProperty,
      listener: () => {
        trigger.slopeProperty.value = trigger.slopeProperty.value === "rising" ? "falling" : "rising";
      },
      minWidth: 96,
    });

    const modeSwitch = new RotarySwitch(
      trigger.modeProperty,
      unionItems(TRIGGER_MODES, {
        auto: t.autoStringProperty,
        normal: t.normalStringProperty,
        single: t.singleStringProperty,
      }),
      { radius: 20, captionStringProperty: t.modeStringProperty, accessibleName: a11y.triggerModeStringProperty },
    );

    const body = new VBox({
      align: "left",
      spacing: 10,
      children: [new HBox({ spacing: 14, align: "top", children: [sourceSwitch, levelKnob, modeSwitch] }), slopeButton],
    });

    super(withSectionHeader(t.titleStringProperty, body));

    this.controlsInOrder = [sourceSwitch, levelKnob, slopeButton, modeSwitch];
  }
}
