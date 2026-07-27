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
import { DisposalBag } from "../../common/DisposalBag.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import { SCOPE_TRIGGER_HOLDOFF_RANGE, SCOPE_TRIGGER_LEVEL_RANGE } from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { TRIGGER_MODES, TRIGGER_SOURCES } from "../model/Trigger.js";
import { derivedString, unionItems } from "./controlHelpers.js";
import { formatHoldoff, formatVoltage } from "./formatUnits.js";
import { withSectionHeader } from "./panelSection.js";

export class TriggerControlPanel extends SimPanel {
  public readonly controlsInOrder: Node[];

  private readonly bag: DisposalBag;

  public constructor(model: OscilloscopeModel) {
    const bag = new DisposalBag();
    const strings = StringManager.getInstance();
    const t = strings.getTrigger();
    const a11y = strings.getA11yStrings().controls;
    const trigger = model.trigger;

    const sourceSwitch = new RotarySwitch(
      trigger.sourceProperty,
      unionItems(TRIGGER_SOURCES, {
        ch1: t.ch1StringProperty,
        ch2: t.ch2StringProperty,
        line: t.lineStringProperty,
        ext: t.extStringProperty,
      }),
      { radius: 18, captionStringProperty: t.sourceStringProperty, accessibleName: a11y.triggerSourceStringProperty },
    );

    const levelReadoutProperty = derivedString(trigger.levelProperty, formatVoltage);
    const levelKnob = new RotaryKnob(trigger.levelProperty, SCOPE_TRIGGER_LEVEL_RANGE, {
      radius: 22,
      captionStringProperty: t.levelStringProperty,
      valueStringProperty: levelReadoutProperty,
      accessibleName: a11y.triggerLevelStringProperty,
      keyboardStep: 0.1,
      shiftKeyboardStep: 0.01,
      pageKeyboardStep: 1,
    });

    // Every string this label interpolates has to be a dependency, including the
    // "Slope" caption itself — reading it as `.value` inside the derivation would
    // leave the caption stale in the old locale after a runtime language switch.
    const slopeLabelProperty = new DerivedProperty(
      [trigger.slopeProperty, t.slopeStringProperty, t.risingStringProperty, t.fallingStringProperty],
      (slope, slopeLabel, rising, falling) => `${slopeLabel}: ${slope === "rising" ? rising : falling}`,
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

    const holdoffReadoutProperty = derivedString(trigger.holdoffProperty, formatHoldoff);
    const holdoffKnob = new RotaryKnob(trigger.holdoffProperty, SCOPE_TRIGGER_HOLDOFF_RANGE, {
      radius: 18,
      captionStringProperty: t.holdoffStringProperty,
      valueStringProperty: holdoffReadoutProperty,
      accessibleName: a11y.triggerHoldoffStringProperty,
    });

    const body = new VBox({
      align: "left",
      spacing: 10,
      children: [
        new HBox({ spacing: 14, align: "top", children: [sourceSwitch, levelKnob, modeSwitch] }),
        new HBox({ spacing: 14, align: "center", children: [slopeButton, holdoffKnob] }),
      ],
    });

    super(withSectionHeader(t.titleStringProperty, body, { bag }));

    this.bag = bag;
    this.bag.own(
      sourceSwitch,
      levelKnob,
      slopeButton,
      modeSwitch,
      holdoffKnob,
      slopeLabelProperty,
      levelReadoutProperty,
      holdoffReadoutProperty,
    );

    this.controlsInOrder = [sourceSwitch, levelKnob, slopeButton, modeSwitch, holdoffKnob];
  }

  public override dispose(): void {
    this.bag.dispose();
    super.dispose();
  }
}
