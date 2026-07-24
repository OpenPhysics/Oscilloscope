/**
 * ScopeControlPanel.ts
 *
 * The oscilloscope's own controls: vertical sensitivity (volts/div) and
 * horizontal sweep rate (time/div), each a 1-2-5 stepped picker just like a
 * real bench scope.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { ComboBox } from "scenerystack/sun";
import { LIGHT_SURFACE_TEXT_FILL, SIM_COMBO_BOX_OPTIONS } from "../../common/SimButtonOptions.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { SCOPE_TIME_PER_DIV_STEPS, SCOPE_VOLTS_PER_DIV_STEPS } from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { formatTimePerDiv, formatVoltsPerDiv } from "./formatUnits.js";

const HEADING_FONT = new PhetFont({ size: 15, weight: "bold" });
const LABEL_FONT = new PhetFont(13);

export class ScopeControlPanel extends SimPanel {
  public readonly voltsPerDivComboBox: Node;
  public readonly timePerDivComboBox: Node;

  public constructor(model: OscilloscopeModel, listParent: Node) {
    const strings = StringManager.getInstance();
    const displayStrings = strings.getDisplay();
    const a11y = strings.getA11yStrings();

    const makeNumberComboBox = (
      property: OscilloscopeModel["voltsPerDivisionProperty"],
      steps: readonly number[],
      format: (value: number) => string,
      accessibleName: TReadOnlyProperty<string>,
      tandemPrefix: string,
    ): ComboBox<number> =>
      new ComboBox(
        property,
        steps.map((value) => ({
          value,
          tandemName: `${tandemPrefix}${String(value).replace(/[^0-9]/g, "")}Item`,
          accessibleName: format(value),
          createNode: () => new Text(format(value), { font: LABEL_FONT, fill: LIGHT_SURFACE_TEXT_FILL }),
        })),
        listParent,
        { ...SIM_COMBO_BOX_OPTIONS, accessibleName },
      );

    const voltsPerDivComboBox = makeNumberComboBox(
      model.voltsPerDivisionProperty,
      SCOPE_VOLTS_PER_DIV_STEPS,
      formatVoltsPerDiv,
      a11y.controls.voltsPerDivisionStringProperty,
      "volts",
    );
    const timePerDivComboBox = makeNumberComboBox(
      model.timePerDivisionProperty,
      SCOPE_TIME_PER_DIV_STEPS,
      formatTimePerDiv,
      a11y.controls.timePerDivisionStringProperty,
      "time",
    );

    const labelOptions = { font: LABEL_FONT, fill: OscilloscopeColors.textColorProperty } as const;

    const content = new VBox({
      align: "left",
      spacing: 8,
      stretch: true,
      children: [
        new Text(displayStrings.titleStringProperty, {
          font: HEADING_FONT,
          fill: OscilloscopeColors.textColorProperty,
        }),
        new Text(displayStrings.voltsPerDivisionStringProperty, labelOptions),
        voltsPerDivComboBox,
        new Text(displayStrings.timePerDivisionStringProperty, labelOptions),
        timePerDivComboBox,
      ],
    });

    super(content);

    this.voltsPerDivComboBox = voltsPerDivComboBox;
    this.timePerDivComboBox = timePerDivComboBox;
  }
}
