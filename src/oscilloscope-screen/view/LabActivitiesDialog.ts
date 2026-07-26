/**
 * LabActivitiesDialog.ts
 *
 * Soft-key "Lab" dialog listing the guided classroom challenges. Choosing one
 * configures the model via {@link LAB_ACTIVITIES} and closes the dialog.
 */

import { Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Dialog } from "scenerystack/sim";
import { RectangularPushButton } from "scenerystack/sun";
import { FLAT_RECTANGULAR_BUTTON_OPTIONS } from "../../common/SimButtonOptions.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { LAB_ACTIVITIES, type LabActivityId } from "./labActivities.js";

const TITLE_FONT = new PhetFont({ size: 18, weight: "bold" });
const BODY_FONT = new PhetFont(14);
const HINT_FONT = new PhetFont(12);

export class LabActivitiesDialog extends Dialog {
  public constructor(model: OscilloscopeModel, onApplied: () => void) {
    const labs = StringManager.getInstance().getLabs();

    const titleFor = (id: LabActivityId) => {
      switch (id) {
        case "measureVpp":
          return labs.measureVppTitleStringProperty;
        case "normalTrigger":
          return labs.normalTriggerTitleStringProperty;
        case "thirdHarmonic":
          return labs.thirdHarmonicTitleStringProperty;
        case "lissajous90":
          return labs.lissajous90TitleStringProperty;
      }
    };
    const hintFor = (id: LabActivityId) => {
      switch (id) {
        case "measureVpp":
          return labs.measureVppHintStringProperty;
        case "normalTrigger":
          return labs.normalTriggerHintStringProperty;
        case "thirdHarmonic":
          return labs.thirdHarmonicHintStringProperty;
        case "lissajous90":
          return labs.lissajous90HintStringProperty;
      }
    };

    const buttons = LAB_ACTIVITIES.map((activity) => {
      const label = new VBox({
        align: "left",
        spacing: 2,
        children: [
          new Text(titleFor(activity.id), {
            font: BODY_FONT,
            fill: OscilloscopeColors.controlSurfaceTextColorProperty,
            maxWidth: 420,
          }),
          new Text(hintFor(activity.id), {
            font: HINT_FONT,
            fill: OscilloscopeColors.controlSurfaceTextColorProperty,
            maxWidth: 420,
          }),
        ],
      });
      return new RectangularPushButton({
        ...FLAT_RECTANGULAR_BUTTON_OPTIONS,
        content: label,
        listener: () => {
          activity.apply(model);
          onApplied();
          this.hide();
        },
      });
    });

    const content = new VBox({
      align: "left",
      spacing: 10,
      children: [
        new Text(labs.introStringProperty, {
          font: HINT_FONT,
          fill: OscilloscopeColors.textColorProperty,
          maxWidth: 460,
        }),
        ...buttons,
      ],
    });

    super(content, {
      title: new Text(labs.titleStringProperty, { font: TITLE_FONT }),
      closeButtonListener: () => this.hide(),
    });
  }
}
