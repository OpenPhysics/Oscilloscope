/**
 * OscilloscopeScreenView.ts
 *
 * Top-level view for the oscilloscope screen. Lays out the CRT display, the
 * signal-source / function-generator controls, the scope (volts/div, time/div)
 * controls, a Run/Stop time control, and Reset All. Each animation frame it
 * samples the model and redraws the trace — unless the scope is stopped, in
 * which case the trace freezes, exactly like a real scope's STOP.
 */

import { NumberProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { Node, VBox } from "scenerystack/scenery";
import { ResetAllButton, TimeControlNode } from "scenerystack/scenery-phet";
import type { ScreenViewOptions } from "scenerystack/sim";
import { ScreenView } from "scenerystack/sim";
import { FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS, FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/SimButtonOptions.js";
import { PANEL_SPACING, SCREEN_VIEW_MARGIN } from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { MeasurementReadoutNode } from "./MeasurementReadoutNode.js";
import { OscilloscopeDisplayNode } from "./OscilloscopeDisplayNode.js";
import { OscilloscopeScreenSummaryContent } from "./OscilloscopeScreenSummaryContent.js";
import { ScopeControlPanel } from "./ScopeControlPanel.js";
import { SignalControlPanel } from "./SignalControlPanel.js";

type SelfOptions = {
  // Preference controlling whether the on-screen measurement readout is drawn.
  showMeasurementsProperty: TReadOnlyProperty<boolean>;
};

export type OscilloscopeScreenViewOptions = SelfOptions & ScreenViewOptions;

export class OscilloscopeScreenView extends ScreenView {
  private readonly model: OscilloscopeModel;
  private readonly displayNode: OscilloscopeDisplayNode;

  /** Peak-to-peak voltage measured from the most recent trace, for the readout. */
  private readonly measuredVppProperty = new NumberProperty(0);

  public constructor(model: OscilloscopeModel, providedOptions: OscilloscopeScreenViewOptions) {
    const { showMeasurementsProperty, ...screenViewOptions } = providedOptions;

    super({
      screenSummaryContent: new OscilloscopeScreenSummaryContent(model),
      ...screenViewOptions,
    });

    this.model = model;

    // Layer that hosts combo-box list popups above everything else.
    const popupLayer = new Node();

    // ── CRT display + measurement overlay ─────────────────────────────────────
    const displayNode = new OscilloscopeDisplayNode({
      left: SCREEN_VIEW_MARGIN + 20,
      top: SCREEN_VIEW_MARGIN + 10,
    });
    this.displayNode = displayNode;
    this.addChild(displayNode);

    const readout = new MeasurementReadoutNode(model, this.measuredVppProperty, showMeasurementsProperty);
    readout.left = displayNode.left + 10;
    readout.top = displayNode.top + 10;
    this.addChild(readout);

    // ── Run / Stop time control, centered under the display ───────────────────
    const timeControl = new TimeControlNode(model.timer.isPlayingProperty, {
      playPauseStepButtonOptions: {
        ...FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS,
        stepForwardButtonOptions: {
          ...FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS.stepForwardButtonOptions,
          listener: () => this.refreshTrace(),
        },
      },
      centerX: displayNode.centerX,
      top: displayNode.bottom + 16,
    });
    this.addChild(timeControl);

    // ── Right-hand control stack ──────────────────────────────────────────────
    const signalPanel = new SignalControlPanel(model, popupLayer);
    const scopePanel = new ScopeControlPanel(model, popupLayer);
    const controls = new VBox({
      align: "left",
      stretch: true,
      spacing: PANEL_SPACING,
      children: [signalPanel, scopePanel],
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: SCREEN_VIEW_MARGIN + 10,
    });
    this.addChild(controls);

    // ── Reset All ─────────────────────────────────────────────────────────────
    const resetAllButton = new ResetAllButton({
      ...FLAT_RESET_ALL_BUTTON_OPTIONS,
      listener: () => {
        model.reset();
        this.reset();
      },
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      bottom: this.layoutBounds.maxY - SCREEN_VIEW_MARGIN,
    });
    this.addChild(resetAllButton);

    // Popups render above all controls.
    this.addChild(popupLayer);

    // ── Accessibility: keyboard / reading traversal order ─────────────────────
    this.addChild(
      new Node({
        pdomOrder: [
          signalPanel.sourceComboBox,
          signalPanel.waveformComboBox,
          signalPanel.frequencyControl,
          signalPanel.amplitudeControl,
          scopePanel.voltsPerDivComboBox,
          scopePanel.timePerDivComboBox,
          timeControl,
          resetAllButton,
        ],
      }),
    );

    // Draw an initial trace so the display isn't blank before the first frame.
    this.refreshTrace();
  }

  /** Samples the model, redraws the trace, and updates the measured Vpp. */
  private refreshTrace(): void {
    const voltages = this.model.getTrace();
    this.displayNode.update(voltages, this.model.voltsPerDivisionProperty.value);

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const v of voltages) {
      if (v < min) {
        min = v;
      }
      if (v > max) {
        max = v;
      }
    }
    this.measuredVppProperty.value = max > min ? max - min : 0;
  }

  public reset(): void {
    this.measuredVppProperty.reset();
    this.refreshTrace();
  }

  public override step(_dt: number): void {
    // When stopped (paused), the trace freezes — matching a real scope's STOP.
    if (this.model.timer.isPlayingProperty.value) {
      this.refreshTrace();
    }
  }
}
