/**
 * SoftAcquirePanel.ts
 *
 * TBS-style soft / acquire cluster, laid out like the real bench scope's top
 * button block: a grid of gray soft-keys (Cursor / Measure / Lab, then Persist /
 * CSV / PNG) on the left, and the acquisition column — Run/Stop (green), Single,
 * Autoset — down the right edge.
 */

import type { TProperty } from "scenerystack/axon";
import { HBox, type Node, VBox } from "scenerystack/scenery";
import { PanelButton } from "../../common/controls/PanelButton.js";
import { DisposalBag } from "../../common/DisposalBag.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { withSectionHeader } from "./panelSection.js";

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

  private readonly bag: DisposalBag;

  public constructor(model: OscilloscopeModel, options: SoftAcquirePanelOptions) {
    const bag = new DisposalBag();
    const strings = StringManager.getInstance();
    const acq = strings.getAcquisition();
    const a11y = strings.getA11yStrings().controls;

    // Left grid of gray soft-keys, sized to a common width so the columns align.
    const SOFT_KEY_WIDTH = 76;

    const cursorButton = new PanelButton({
      labelStringProperty: acq.cursorsStringProperty,
      indicatorProperty: model.cursorsEnabledProperty,
      accessibleName: a11y.cursorsStringProperty,
      listener: () => {
        model.cursorsEnabledProperty.value = !model.cursorsEnabledProperty.value;
      },
      minWidth: SOFT_KEY_WIDTH,
      fontSize: 11,
    });

    const measureButton = new PanelButton({
      labelStringProperty: acq.measureStringProperty,
      indicatorProperty: options.showMeasurementsProperty,
      accessibleName: a11y.measureStringProperty,
      listener: () => {
        options.showMeasurementsProperty.value = !options.showMeasurementsProperty.value;
      },
      minWidth: SOFT_KEY_WIDTH,
      fontSize: 11,
    });

    const helpButton = new PanelButton({
      labelStringProperty: acq.labStringProperty,
      accessibleName: a11y.labStringProperty,
      listener: options.onHelp,
      minWidth: SOFT_KEY_WIDTH,
      fontSize: 11,
    });

    const persistButton = new PanelButton({
      labelStringProperty: acq.persistenceStringProperty,
      indicatorProperty: model.persistenceProperty,
      accessibleName: a11y.persistenceStringProperty,
      listener: () => {
        model.persistenceProperty.value = !model.persistenceProperty.value;
      },
      minWidth: SOFT_KEY_WIDTH,
      fontSize: 11,
    });

    const exportCsvButton = new PanelButton({
      labelStringProperty: acq.exportCsvStringProperty,
      accessibleName: a11y.exportCsvStringProperty,
      listener: options.onExportCsv,
      minWidth: SOFT_KEY_WIDTH,
      fontSize: 11,
    });

    const exportImageButton = new PanelButton({
      labelStringProperty: acq.exportImageStringProperty,
      accessibleName: a11y.exportImageStringProperty,
      listener: options.onExportImage,
      minWidth: SOFT_KEY_WIDTH,
      fontSize: 11,
    });

    // Acquisition column down the right edge, led by the green Run/Stop key.
    const ACQUIRE_KEY_WIDTH = 82;

    const runStopButton = new PanelButton({
      labelStringProperty: acq.runStopStringProperty,
      indicatorProperty: model.timer.isPlayingProperty,
      indicatorColor: OscilloscopeColors.traceColorProperty,
      accessibleName: a11y.runStopStringProperty,
      listener: () => {
        model.timer.isPlayingProperty.value = !model.timer.isPlayingProperty.value;
      },
      minWidth: ACQUIRE_KEY_WIDTH,
    });

    const singleButton = new PanelButton({
      labelStringProperty: acq.singleStringProperty,
      accessibleName: a11y.singleStringProperty,
      listener: options.onSingle,
      minWidth: ACQUIRE_KEY_WIDTH,
    });

    const autosetButton = new PanelButton({
      labelStringProperty: acq.autosetStringProperty,
      accessibleName: a11y.autosetStringProperty,
      listener: options.onAutoset,
      minWidth: ACQUIRE_KEY_WIDTH,
    });

    const softKeyGrid = new VBox({
      align: "center",
      spacing: 6,
      children: [
        new HBox({ spacing: 6, children: [cursorButton, measureButton, helpButton] }),
        new HBox({ spacing: 6, children: [persistButton, exportCsvButton, exportImageButton] }),
      ],
    });

    const acquireColumn = new VBox({
      align: "center",
      spacing: 6,
      children: [runStopButton, singleButton, autosetButton],
    });

    const body = new HBox({
      align: "top",
      spacing: 12,
      children: [softKeyGrid, acquireColumn],
    });

    super(withSectionHeader(acq.titleStringProperty, body, { bag }), { xMargin: 10, yMargin: 8 });

    this.controlsInOrder = [
      cursorButton,
      measureButton,
      helpButton,
      persistButton,
      exportCsvButton,
      exportImageButton,
      runStopButton,
      singleButton,
      autosetButton,
    ];

    this.bag = bag;
    this.bag.own(...this.controlsInOrder);
  }

  public override dispose(): void {
    this.bag.dispose();
    super.dispose();
  }
}
