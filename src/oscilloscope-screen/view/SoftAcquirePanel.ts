/**
 * SoftAcquirePanel.ts
 *
 * TBS-style soft / acquire cluster: Cursor, Measure, Help on one row; Run/Stop,
 * Single, Autoset on the next; Persist and export as secondary actions.
 */

import type { TProperty } from "scenerystack/axon";
import { HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { PanelButton } from "../../common/controls/PanelButton.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";

const HEADING_FONT = new PhetFont({ size: 13, weight: "bold" });

export type SoftAcquirePanelOptions = {
  showMeasurementsProperty: TProperty<boolean>;
  onSingle: () => void;
  onAutoset: () => void;
  onHelp: () => void;
  onExportCsv: () => void;
  onExportImage: () => void;
};

export class SoftAcquirePanel extends SimPanel {
  public readonly controlsInOrder: Node[];

  public constructor(model: OscilloscopeModel, options: SoftAcquirePanelOptions) {
    const strings = StringManager.getInstance();
    const acq = strings.getAcquisition();
    const a11y = strings.getA11yStrings().controls;

    const cursorButton = new PanelButton({
      labelStringProperty: acq.cursorsStringProperty,
      indicatorProperty: model.cursorsEnabledProperty,
      accessibleName: a11y.cursorsStringProperty,
      listener: () => {
        model.cursorsEnabledProperty.value = !model.cursorsEnabledProperty.value;
      },
      minWidth: 72,
      fontSize: 11,
    });

    const measureButton = new PanelButton({
      labelStringProperty: acq.measureStringProperty,
      indicatorProperty: options.showMeasurementsProperty,
      accessibleName: a11y.measureStringProperty,
      listener: () => {
        options.showMeasurementsProperty.value = !options.showMeasurementsProperty.value;
      },
      minWidth: 72,
      fontSize: 11,
    });

    const helpButton = new PanelButton({
      labelStringProperty: acq.helpStringProperty,
      accessibleName: a11y.helpStringProperty,
      listener: options.onHelp,
      minWidth: 72,
      fontSize: 11,
    });

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
      minWidth: 72,
    });

    const autosetButton = new PanelButton({
      labelStringProperty: acq.autosetStringProperty,
      accessibleName: a11y.autosetStringProperty,
      listener: options.onAutoset,
      minWidth: 72,
    });

    const persistButton = new PanelButton({
      labelStringProperty: acq.persistenceStringProperty,
      indicatorProperty: model.persistenceProperty,
      accessibleName: a11y.persistenceStringProperty,
      listener: () => {
        model.persistenceProperty.value = !model.persistenceProperty.value;
      },
      minWidth: 64,
      fontSize: 11,
    });

    const exportCsvButton = new PanelButton({
      labelStringProperty: acq.exportCsvStringProperty,
      accessibleName: a11y.exportCsvStringProperty,
      listener: options.onExportCsv,
      minWidth: 64,
      fontSize: 11,
    });

    const exportImageButton = new PanelButton({
      labelStringProperty: acq.exportImageStringProperty,
      accessibleName: a11y.exportImageStringProperty,
      listener: options.onExportImage,
      minWidth: 64,
      fontSize: 11,
    });

    const content = new VBox({
      align: "center",
      spacing: 8,
      children: [
        new Text(acq.titleStringProperty, { font: HEADING_FONT, fill: OscilloscopeColors.textColorProperty }),
        new HBox({ spacing: 6, children: [cursorButton, measureButton, helpButton] }),
        new HBox({ spacing: 6, children: [runStopButton, singleButton, autosetButton] }),
        new HBox({ spacing: 6, children: [persistButton, exportCsvButton, exportImageButton] }),
      ],
    });

    super(content, { xMargin: 10, yMargin: 8 });

    this.controlsInOrder = [
      cursorButton,
      measureButton,
      helpButton,
      runStopButton,
      singleButton,
      autosetButton,
      persistButton,
      exportCsvButton,
      exportImageButton,
    ];
  }
}
