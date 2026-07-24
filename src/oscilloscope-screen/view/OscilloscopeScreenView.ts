/**
 * OscilloscopeScreenView.ts
 *
 * Top-level view for the oscilloscope screen. It lays out the CRT display and a
 * hardware-style front panel — function generator, per-channel vertical controls,
 * horizontal timebase, trigger, and acquisition buttons — built entirely from
 * rotary knobs, rotary switches, and panel buttons (no sliders).
 *
 * Each animation frame it resamples the model (while running) and redraws the
 * traces; changing a control while stopped still rescales the frozen trace, just
 * like a real scope's STOP. It also computes the live automatic measurements and
 * implements Autoset and Single-shot capture.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { NumberProperty } from "scenerystack/axon";
import { Bounds2 } from "scenerystack/dot";
import { Node } from "scenerystack/scenery";
import { ResetAllButton } from "scenerystack/scenery-phet";
import type { ScreenViewOptions } from "scenerystack/sim";
import { ScreenView } from "scenerystack/sim";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/SimButtonOptions.js";
import {
  HORIZONTAL_DIVISIONS,
  SCOPE_TIME_PER_DIV_STEPS,
  SCOPE_TRIGGER_LEVEL_RANGE,
  SCOPE_VOLTS_PER_DIV_STEPS,
  SCREEN_VIEW_MARGIN,
} from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { AcquisitionPanel } from "./AcquisitionPanel.js";
import { HorizontalControlPanel } from "./HorizontalControlPanel.js";
import { MeasurementReadoutNode } from "./MeasurementReadoutNode.js";
import { OscilloscopeDisplayNode } from "./OscilloscopeDisplayNode.js";
import { OscilloscopeScreenSummaryContent } from "./OscilloscopeScreenSummaryContent.js";
import { SignalGeneratorPanel } from "./SignalGeneratorPanel.js";
import { TriggerControlPanel } from "./TriggerControlPanel.js";
import { VerticalControlPanel } from "./VerticalControlPanel.js";

const LAYOUT_BOUNDS = new Bounds2(0, 0, 1280, 800);

type SelfOptions = {
  showMeasurementsProperty: TReadOnlyProperty<boolean>;
};

export type OscilloscopeScreenViewOptions = SelfOptions & ScreenViewOptions;

export class OscilloscopeScreenView extends ScreenView {
  private readonly model: OscilloscopeModel;
  private readonly displayNode: OscilloscopeDisplayNode;

  // Live automatic measurements of the primary channel.
  private readonly measuredFrequency = new NumberProperty(0);
  private readonly measuredPeriod = new NumberProperty(0);
  private readonly measuredVpp = new NumberProperty(0);
  private readonly measuredVrms = new NumberProperty(0);
  private readonly measuredVmax = new NumberProperty(0);
  private readonly measuredVmin = new NumberProperty(0);

  public constructor(model: OscilloscopeModel, providedOptions: OscilloscopeScreenViewOptions) {
    const { showMeasurementsProperty, ...screenViewOptions } = providedOptions;

    super({
      layoutBounds: LAYOUT_BOUNDS,
      screenSummaryContent: new OscilloscopeScreenSummaryContent(model),
      ...screenViewOptions,
    });

    this.model = model;

    const popupLayer = new Node();

    // ── CRT display + measurement overlay ─────────────────────────────────────
    const displayNode = new OscilloscopeDisplayNode(model, {
      left: SCREEN_VIEW_MARGIN,
      top: SCREEN_VIEW_MARGIN,
    });
    this.displayNode = displayNode;
    this.addChild(displayNode);

    const readout = new MeasurementReadoutNode(
      {
        frequencyProperty: this.measuredFrequency,
        periodProperty: this.measuredPeriod,
        vppProperty: this.measuredVpp,
        vrmsProperty: this.measuredVrms,
        vmaxProperty: this.measuredVmax,
        vminProperty: this.measuredVmin,
      },
      showMeasurementsProperty,
    );
    readout.left = displayNode.left + 8;
    readout.top = displayNode.top + 8;
    this.addChild(readout);

    // ── Front-panel control sections ──────────────────────────────────────────
    const generatorPanel = new SignalGeneratorPanel(model);
    const verticalPanel = new VerticalControlPanel(model);
    const horizontalPanel = new HorizontalControlPanel(model);
    const triggerPanel = new TriggerControlPanel(model);
    const acquisitionPanel = new AcquisitionPanel(model, {
      onSingle: () => this.captureSingle(),
      onAutoset: () => this.autoset(),
    });

    // Top-right: generator + vertical side by side.
    generatorPanel.left = displayNode.right + 20;
    generatorPanel.top = SCREEN_VIEW_MARGIN;
    verticalPanel.left = generatorPanel.right + 16;
    verticalPanel.top = SCREEN_VIEW_MARGIN;

    // Below them: acquisition cluster.
    acquisitionPanel.left = generatorPanel.left;
    acquisitionPanel.top = Math.max(generatorPanel.bottom, verticalPanel.bottom) + 16;

    // Below the display: horizontal + trigger.
    horizontalPanel.left = SCREEN_VIEW_MARGIN;
    horizontalPanel.top = displayNode.bottom + 16;
    triggerPanel.left = horizontalPanel.right + 16;
    triggerPanel.top = horizontalPanel.top;

    this.addChild(generatorPanel);
    this.addChild(verticalPanel);
    this.addChild(acquisitionPanel);
    this.addChild(horizontalPanel);
    this.addChild(triggerPanel);

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

    this.addChild(popupLayer);

    // ── Accessibility: keyboard / reading traversal order ─────────────────────
    this.addChild(
      new Node({
        pdomOrder: [
          generatorPanel.sourceSwitch,
          generatorPanel.waveformSwitch,
          generatorPanel.frequencyKnob,
          generatorPanel.amplitudeKnob,
          generatorPanel.offsetKnob,
          generatorPanel.dutyKnob,
          generatorPanel.phaseKnob,
          ...verticalPanel.controlsInOrder,
          ...horizontalPanel.controlsInOrder,
          ...triggerPanel.controlsInOrder,
          ...acquisitionPanel.controlsInOrder,
          resetAllButton,
        ],
      }),
    );

    // Draw an initial trace so the display isn't blank before the first frame.
    model.refresh();
    this.redraw();
  }

  /** Redraws the traces and recomputes the measurements from the current buffers. */
  private redraw(): void {
    this.displayNode.update();
    this.updateMeasurements();
  }

  /** Captures exactly one sweep and stops, like the front-panel SINGLE button. */
  private captureSingle(): void {
    this.model.refresh();
    this.redraw();
    this.model.timer.isPlayingProperty.value = false;
  }

  /** Measures the primary (lowest enabled) channel's displayed trace. */
  private updateMeasurements(): void {
    const model = this.model;
    const primaryIsCh1 = model.ch1.enabledProperty.value || !model.ch2.enabledProperty.value;
    const buffer = primaryIsCh1 ? model.ch1Trace : model.ch2Trace;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sumSquares = 0;
    for (const v of buffer) {
      if (v < min) {
        min = v;
      }
      if (v > max) {
        max = v;
      }
      sumSquares += v * v;
    }
    const n = buffer.length;
    this.measuredVmax.value = Number.isFinite(max) ? max : 0;
    this.measuredVmin.value = Number.isFinite(min) ? min : 0;
    this.measuredVpp.value = max > min ? max - min : 0;
    this.measuredVrms.value = Math.sqrt(sumSquares / n);

    // Frequency: exact from the generator, or estimated from a live microphone.
    const audioPrimary = primaryIsCh1 && model.sourceProperty.value === "audio";
    let hz = 0;
    if (audioPrimary) {
      hz = OscilloscopeScreenView.estimateFrequency(buffer, model.timeWindow);
    } else {
      hz = model.functionGenerator.frequencyProperty.value;
    }
    this.measuredFrequency.value = hz;
    this.measuredPeriod.value = hz > 0 ? 1 / hz : 0;
  }

  /** Estimates a periodic signal's frequency by counting mean-crossings in the window. */
  private static estimateFrequency(buffer: Float32Array, windowSeconds: number): number {
    const n = buffer.length;
    if (n < 2 || windowSeconds <= 0) {
      return 0;
    }
    let mean = 0;
    for (const v of buffer) {
      mean += v;
    }
    mean /= n;
    let crossings = 0;
    for (let i = 1; i < n; i++) {
      const prev = (buffer[i - 1] ?? 0) - mean;
      const curr = (buffer[i] ?? 0) - mean;
      if (prev < 0 && curr >= 0) {
        crossings++;
      }
    }
    return crossings / windowSeconds;
  }

  /** Auto-scales the vertical, horizontal, and trigger controls to the generator signal. */
  private autoset(): void {
    const model = this.model;
    const fg = model.functionGenerator;

    model.displayModeProperty.value = "yt";
    model.magnifyProperty.value = false;
    model.horizontalPositionProperty.value = 0;

    // Vertical: aim for a signal ~4 divisions peak-to-peak on CH1.
    const peak = Math.max(0.01, fg.amplitudeProperty.value + Math.abs(fg.offsetProperty.value));
    model.ch1.enabledProperty.value = true;
    model.ch1.couplingProperty.value = "DC";
    model.ch1.invertedProperty.value = false;
    model.ch1.positionProperty.value = 0;
    model.ch1.voltsPerDivisionProperty.value = OscilloscopeScreenView.nearestStep(SCOPE_VOLTS_PER_DIV_STEPS, peak / 2);

    // Horizontal: aim for ~3 cycles across the screen.
    const f = fg.frequencyProperty.value;
    if (f > 0) {
      const targetTimePerDiv = 3 / f / HORIZONTAL_DIVISIONS;
      model.timePerDivisionProperty.value = OscilloscopeScreenView.nearestStep(
        SCOPE_TIME_PER_DIV_STEPS,
        targetTimePerDiv,
      );
    }

    // Trigger: level at the signal's DC midpoint, rising edge on CH1, auto mode.
    model.trigger.sourceProperty.value = "ch1";
    model.trigger.slopeProperty.value = "rising";
    model.trigger.modeProperty.value = "auto";
    model.trigger.levelProperty.value = Math.max(
      SCOPE_TRIGGER_LEVEL_RANGE.min,
      Math.min(SCOPE_TRIGGER_LEVEL_RANGE.max, fg.offsetProperty.value),
    );

    model.timer.isPlayingProperty.value = true;
    model.refresh();
    this.redraw();
  }

  /** The step in `steps` closest to `target` (steps assumed sorted ascending). */
  private static nearestStep(steps: readonly number[], target: number): number {
    let best = steps[0] ?? target;
    let bestDist = Math.abs(best - target);
    for (const step of steps) {
      const dist = Math.abs(step - target);
      if (dist < bestDist) {
        best = step;
        bestDist = dist;
      }
    }
    return best;
  }

  public reset(): void {
    this.measuredFrequency.reset();
    this.measuredPeriod.reset();
    this.measuredVpp.reset();
    this.measuredVrms.reset();
    this.measuredVmax.reset();
    this.measuredVmin.reset();
    this.model.refresh();
    this.redraw();
  }

  public override step(_dt: number): void {
    // Resample only while running (STOP freezes the captured trace) …
    if (this.model.timer.isPlayingProperty.value) {
      this.model.refresh();
    }
    // … but always redraw so control changes rescale the trace live.
    this.redraw();
  }
}
