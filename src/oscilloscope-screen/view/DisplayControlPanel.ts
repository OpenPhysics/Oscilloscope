/**
 * DisplayControlPanel.ts
 *
 * The CRT beam controls a real bench scope carries on its front panel: Intensity
 * (trace brightness), Focus (trace sharpness), and a Beam Find key that pulls an
 * off-screen or dim trace back onto the graticule at full brightness while held.
 *
 * These shape how the phosphor trace is drawn rather than what it contains, so they
 * live in their own small section beside the acquisition controls.
 */

import { HBox, type Node, VBox } from "scenerystack/scenery";
import { PanelButton } from "../../common/controls/PanelButton.js";
import { RotaryKnob } from "../../common/controls/RotaryKnob.js";
import { DisposalBag } from "../../common/DisposalBag.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import { SCOPE_FOCUS_RANGE, SCOPE_INTENSITY_RANGE } from "../../OscilloscopeConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { derivedString } from "./controlHelpers.js";
import { formatPercent } from "./formatUnits.js";
import { withSectionHeader } from "./panelSection.js";

export class DisplayControlPanel extends SimPanel {
  public readonly controlsInOrder: Node[];

  private readonly bag: DisposalBag;

  public constructor(model: OscilloscopeModel) {
    const bag = new DisposalBag();
    const strings = StringManager.getInstance();
    const d = strings.getDisplay();
    const a11y = strings.getA11yStrings().controls;

    const intensityReadout = derivedString(model.intensityProperty, formatPercent);
    const intensityKnob = new RotaryKnob(model.intensityProperty, SCOPE_INTENSITY_RANGE, {
      radius: 18,
      captionStringProperty: d.intensityStringProperty,
      valueStringProperty: intensityReadout,
      accessibleName: a11y.intensityStringProperty,
    });

    const focusReadout = derivedString(model.focusProperty, formatPercent);
    const focusKnob = new RotaryKnob(model.focusProperty, SCOPE_FOCUS_RANGE, {
      radius: 18,
      captionStringProperty: d.focusStringProperty,
      valueStringProperty: focusReadout,
      accessibleName: a11y.focusStringProperty,
    });

    const beamFindButton = new PanelButton({
      labelStringProperty: d.beamFindStringProperty,
      indicatorProperty: model.beamFinderProperty,
      accessibleName: a11y.beamFindStringProperty,
      listener: () => {
        model.beamFinderProperty.value = !model.beamFinderProperty.value;
      },
      minWidth: 84,
      fontSize: 11,
    });

    const body = new VBox({
      align: "left",
      spacing: 8,
      children: [new HBox({ spacing: 14, align: "top", children: [intensityKnob, focusKnob] }), beamFindButton],
    });

    super(withSectionHeader(d.titleStringProperty, body, { bag }), { xMargin: 10, yMargin: 8 });

    this.bag = bag;
    this.bag.own(intensityKnob, focusKnob, beamFindButton, intensityReadout, focusReadout);

    this.controlsInOrder = [intensityKnob, focusKnob, beamFindButton];
  }

  public override dispose(): void {
    this.bag.dispose();
    super.dispose();
  }
}
