/**
 * AcquisitionPanel.ts
 *
 * The acquisition / display-control cluster: Run/Stop, Single-shot capture,
 * Autoset, a persistence toggle, and the CH1±CH2 math-channel selector.
 */

import { HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { PanelButton } from "../../common/controls/PanelButton.js";
import { RotarySwitch } from "../../common/controls/RotarySwitch.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { MATH_MODES, type OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { unionItems } from "./controlHelpers.js";

const HEADING_FONT = new PhetFont({ size: 15, weight: "bold" });

export type AcquisitionPanelOptions = {
  /** Capture a single sweep, then stop. */
  onSingle: () => void;
  /** Auto-scale the display to the current signal. */
  onAutoset: () => void;
};

export class AcquisitionPanel extends SimPanel {
  public readonly controlsInOrder: Node[];

  public constructor(model: OscilloscopeModel, options: AcquisitionPanelOptions) {
    const strings = StringManager.getInstance();
    const acq = strings.getAcquisition();
    const a11y = strings.getA11yStrings().controls;

    const runStopButton = new PanelButton({
      labelStringProperty: acq.runStopStringProperty,
      indicatorProperty: model.timer.isPlayingProperty,
      indicatorColor: OscilloscopeColors.traceColorProperty,
      accessibleName: a11y.runStopStringProperty,
      listener: () => {
        model.timer.isPlayingProperty.value = !model.timer.isPlayingProperty.value;
      },
      minWidth: 80,
    });

    const singleButton = new PanelButton({
      labelStringProperty: acq.singleStringProperty,
      accessibleName: a11y.singleStringProperty,
      listener: options.onSingle,
      minWidth: 80,
    });

    const autosetButton = new PanelButton({
      labelStringProperty: acq.autosetStringProperty,
      accessibleName: a11y.autosetStringProperty,
      listener: options.onAutoset,
      minWidth: 80,
    });

    const persistButton = new PanelButton({
      labelStringProperty: acq.persistenceStringProperty,
      indicatorProperty: model.persistenceProperty,
      accessibleName: a11y.persistenceStringProperty,
      listener: () => {
        model.persistenceProperty.value = !model.persistenceProperty.value;
      },
      minWidth: 80,
    });

    const mathSwitch = new RotarySwitch(
      model.mathModeProperty,
      unionItems(MATH_MODES, {
        off: acq.mathOffStringProperty,
        add: acq.mathAddStringProperty,
        subtract: acq.mathSubtractStringProperty,
      }),
      { radius: 20, captionStringProperty: acq.mathStringProperty, accessibleName: a11y.mathStringProperty },
    );

    const content = new VBox({
      align: "center",
      spacing: 9,
      children: [
        new Text(acq.titleStringProperty, { font: HEADING_FONT, fill: OscilloscopeColors.textColorProperty }),
        runStopButton,
        new HBox({ spacing: 8, children: [singleButton, autosetButton] }),
        persistButton,
        mathSwitch,
      ],
    });

    super(content);

    this.controlsInOrder = [runStopButton, singleButton, autosetButton, persistButton, mathSwitch];
  }
}
