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
import { DerivedProperty, NumberProperty } from "scenerystack/axon";
import { Bounds2 } from "scenerystack/dot";
import { Node } from "scenerystack/scenery";
import { ResetAllButton } from "scenerystack/scenery-phet";
import type { ScreenViewOptions } from "scenerystack/sim";
import { ScreenView } from "scenerystack/sim";
import { downloadTextFile, triggerBlobDownload } from "../../common/downloadFile.js";
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
import { CursorReadoutNode } from "./CursorReadoutNode.js";
import { HorizontalControlPanel } from "./HorizontalControlPanel.js";
import { MeasurementReadoutNode } from "./MeasurementReadoutNode.js";
import { estimateFrequency, nearestStep } from "./measurementUtils.js";
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

  // Live cursor measurements (Δt, 1/Δt, ΔV).
  private readonly measuredDeltaTime = new NumberProperty(0);
  private readonly measuredCursorFrequency = new NumberProperty(0);
  private readonly measuredDeltaVoltage = new NumberProperty(0);

  // Redraws rebuild a Shape per visible trace, so they are skipped when nothing
  // that feeds the drawing has changed. Running always dirties it (fresh samples);
  // while stopped only a control change does. Starts true to draw the first frame.
  private redrawDirty = true;
  private readonly markRedrawDirty = (): void => {
    this.redrawDirty = true;
  };
  private readonly renderInputs: TReadOnlyProperty<unknown>[] = [];

  public constructor(model: OscilloscopeModel, providedOptions: OscilloscopeScreenViewOptions) {
    const { showMeasurementsProperty, ...screenViewOptions } = providedOptions;

    super({
      layoutBounds: LAYOUT_BOUNDS,
      screenSummaryContent: new OscilloscopeScreenSummaryContent(model),
      ...screenViewOptions,
    });

    this.model = model;

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

    const cursorReadout = new CursorReadoutNode(
      {
        deltaTimeProperty: this.measuredDeltaTime,
        cursorFrequencyProperty: this.measuredCursorFrequency,
        deltaVoltageProperty: this.measuredDeltaVoltage,
      },
      new DerivedProperty([model.cursorsEnabledProperty, model.displayModeProperty], (on, mode) => on && mode === "yt"),
    );
    cursorReadout.right = displayNode.right - 8;
    cursorReadout.top = displayNode.top + 8;
    this.addChild(cursorReadout);

    // ── Front-panel control sections ──────────────────────────────────────────
    const generatorPanel = new SignalGeneratorPanel(model);
    const verticalPanel = new VerticalControlPanel(model);
    const horizontalPanel = new HorizontalControlPanel(model);
    const triggerPanel = new TriggerControlPanel(model);
    const acquisitionPanel = new AcquisitionPanel(model, {
      onSingle: () => this.captureSingle(),
      onAutoset: () => this.autoset(),
      onExportCsv: () => this.exportCsv(),
      onExportImage: () => this.exportImage(),
    });

    // Right of the display: the core scope sections in the standard bench-scope
    // order — VERTICAL (CH1 then CH2), then HORIZONTAL, then TRIGGER, left to right.
    const controlsLeft = displayNode.right + 20;
    verticalPanel.left = controlsLeft;
    verticalPanel.top = SCREEN_VIEW_MARGIN;
    horizontalPanel.left = verticalPanel.right + 16;
    horizontalPanel.top = SCREEN_VIEW_MARGIN;
    triggerPanel.left = horizontalPanel.right + 16;
    triggerPanel.top = SCREEN_VIEW_MARGIN;

    // Below the display: the CH1 signal source (function generator) and the
    // acquisition / display-control cluster.
    generatorPanel.left = SCREEN_VIEW_MARGIN;
    generatorPanel.top = displayNode.bottom + 16;
    acquisitionPanel.left = generatorPanel.right + 16;
    acquisitionPanel.top = generatorPanel.top;

    this.addChild(verticalPanel);
    this.addChild(horizontalPanel);
    this.addChild(triggerPanel);
    this.addChild(generatorPanel);
    this.addChild(acquisitionPanel);

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

    // ── Accessibility: keyboard / reading traversal order ─────────────────────
    // The measurement cursors follow the acquisition cluster, which is where the
    // button that reveals them lives.
    this.addChild(
      new Node({
        pdomOrder: [
          ...verticalPanel.controlsInOrder,
          ...horizontalPanel.controlsInOrder,
          ...triggerPanel.controlsInOrder,
          generatorPanel.sourceSwitch,
          generatorPanel.waveformSwitch,
          generatorPanel.frequencyKnob,
          generatorPanel.amplitudeKnob,
          generatorPanel.offsetKnob,
          generatorPanel.dutyKnob,
          generatorPanel.phaseKnob,
          ...acquisitionPanel.controlsInOrder,
          ...displayNode.cursorsInOrder,
          resetAllButton,
        ],
      }),
    );

    // Everything the drawing depends on. A change to any of these must force a
    // redraw even when the sweep is stopped, because a stopped scope still
    // rescales and repositions its frozen trace as the knobs turn.
    this.renderInputs.push(
      model.ch1.enabledProperty,
      model.ch1.voltsPerDivisionProperty,
      model.ch1.positionProperty,
      model.ch1.couplingProperty,
      model.ch1.invertedProperty,
      model.ch2.enabledProperty,
      model.ch2.voltsPerDivisionProperty,
      model.ch2.positionProperty,
      model.ch2.couplingProperty,
      model.ch2.invertedProperty,
      model.displayModeProperty,
      model.mathModeProperty,
      model.persistenceProperty,
      model.cursorsEnabledProperty,
      model.cursorTime1Property,
      model.cursorTime2Property,
      model.cursorVolt1Property,
      model.cursorVolt2Property,
      model.trigger.sourceProperty,
      model.trigger.levelProperty,
      model.timePerDivisionProperty,
      model.horizontalPositionProperty,
      model.magnifyProperty,
      model.sourceProperty,
    );
    for (const property of this.renderInputs) {
      property.lazyLink(this.markRedrawDirty);
    }

    // Draw an initial trace so the display isn't blank before the first frame.
    model.refresh();
    this.redraw();
    this.redrawDirty = false;
  }

  /** Redraws the traces and recomputes the measurements from the current buffers. */
  private redraw(): void {
    this.displayNode.update();
    this.updateMeasurements();
  }

  /**
   * Arms a one-shot capture, like the front-panel SINGLE button.
   *
   * This goes through the trigger's `single` mode rather than around it, so the
   * sweep waits for a real trigger event and the model stops the clock once the
   * capture lands. The mode switch and this button therefore agree.
   */
  private captureSingle(): void {
    this.model.trigger.modeProperty.value = "single";
    this.model.trigger.arm();
    this.model.timer.isPlayingProperty.value = true;
  }

  /** Measures the primary (lowest enabled) channel's captured trace. */
  private updateMeasurements(): void {
    const model = this.model;

    // Measure the noiseless signal: Vmax/Vmin/Vpp are extreme-value statistics, so
    // injected noise only ever pushes them further apart — measuring the displayed
    // trace overstates Vpp by roughly the noise amplitude.
    const buffer = model.primaryCleanTrace;
    const n = buffer.length;

    // INVERT flips the trace on screen, so the readouts must follow it or they
    // contradict what the user sees. Vpp and Vrms are unchanged by negation.
    const sign = model.primaryChannel.invertedProperty.value ? -1 : 1;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sumSquares = 0;
    for (const raw of buffer) {
      const v = sign * raw;
      if (v < min) {
        min = v;
      }
      if (v > max) {
        max = v;
      }
      sumSquares += v * v;
    }
    this.measuredVmax.value = Number.isFinite(max) ? max : 0;
    this.measuredVmin.value = Number.isFinite(min) ? min : 0;
    this.measuredVpp.value = max > min ? max - min : 0;
    this.measuredVrms.value = n > 0 ? Math.sqrt(sumSquares / n) : 0;

    // Frequency: exact from the generator, or estimated from a live microphone.
    const audioPrimary = model.primaryIsCh1 && model.sourceProperty.value === "audio";
    const hz = audioPrimary
      ? estimateFrequency(buffer, model.timeWindow)
      : model.functionGenerator.frequencyProperty.value;
    this.measuredFrequency.value = hz;
    this.measuredPeriod.value = hz > 0 ? 1 / hz : 0;

    // Cursor measurements: Δt (and 1/Δt) from the time cursors, ΔV from the
    // voltage cursors scaled by the primary channel's sensitivity.
    const deltaDivisionsTime = Math.abs(model.cursorTime2Property.value - model.cursorTime1Property.value);
    const deltaTime = deltaDivisionsTime * model.effectiveTimePerDivision;
    this.measuredDeltaTime.value = deltaTime;
    this.measuredCursorFrequency.value = deltaTime > 0 ? 1 / deltaTime : 0;
    const deltaDivisionsVolt = Math.abs(model.cursorVolt1Property.value - model.cursorVolt2Property.value);
    this.measuredDeltaVoltage.value = deltaDivisionsVolt * model.primaryChannel.voltsPerDivision;
  }

  /** Auto-scales the vertical, horizontal, and trigger controls to the live signal. */
  private autoset(): void {
    const model = this.model;
    const fg = model.functionGenerator;

    model.displayModeProperty.value = "yt";
    model.magnifyProperty.value = false;
    model.horizontalPositionProperty.value = 0;

    // Bring CH1 up in a known, DC-coupled state, then sample so the measurements
    // below reflect whichever source (generator or live mic) is feeding it.
    model.ch1.enabledProperty.value = true;
    model.ch1.couplingProperty.value = "DC";
    model.ch1.invertedProperty.value = false;
    model.ch1.positionProperty.value = 0;
    model.refresh();
    this.updateMeasurements();

    const audioPrimary = model.sourceProperty.value === "audio";

    // Vertical: aim for a signal ~4 divisions peak-to-peak on CH1. From the live
    // Vpp for the microphone, or the generator's amplitude + offset analytically.
    const peak = audioPrimary
      ? Math.max(0.01, this.measuredVpp.value / 2)
      : Math.max(0.01, fg.amplitudeProperty.value + Math.abs(fg.offsetProperty.value));
    model.ch1.voltsPerDivisionProperty.value = nearestStep(SCOPE_VOLTS_PER_DIV_STEPS, peak / 2);

    // Horizontal: aim for ~3 cycles across the screen, using the measured frequency
    // for the mic or the generator's exact frequency otherwise.
    const f = audioPrimary ? this.measuredFrequency.value : fg.frequencyProperty.value;
    if (f > 0) {
      const targetTimePerDiv = 3 / f / HORIZONTAL_DIVISIONS;
      model.timePerDivisionProperty.value = nearestStep(SCOPE_TIME_PER_DIV_STEPS, targetTimePerDiv);
    }

    // Trigger: level at the signal's DC midpoint, rising edge on CH1, auto mode.
    // The generator knows its offset; a live mic is centered near zero.
    const triggerLevel = audioPrimary ? 0 : fg.offsetProperty.value;
    model.trigger.sourceProperty.value = "ch1";
    model.trigger.slopeProperty.value = "rising";
    model.trigger.modeProperty.value = "auto";
    model.trigger.levelProperty.value = Math.max(
      SCOPE_TRIGGER_LEVEL_RANGE.min,
      Math.min(SCOPE_TRIGGER_LEVEL_RANGE.max, triggerLevel),
    );

    model.timer.isPlayingProperty.value = true;
    model.refresh();
    this.redraw();
  }

  /**
   * Exports the currently captured traces (time + enabled channels) as a CSV
   * download.
   *
   * Deliberately does *not* resample: a stopped scope must export the frozen
   * trace the user is looking at, and with noise injected a fresh capture would
   * not match the display even while running.
   */
  private exportCsv(): void {
    const model = this.model;
    const n = model.sampleCount;
    const dt = n > 1 ? model.timeWindow / (n - 1) : 0;

    const columns: { header: string; data: Float32Array }[] = [];
    if (model.ch1.enabledProperty.value) {
      columns.push({ header: "CH1_V", data: model.ch1Trace });
    }
    if (model.ch2.enabledProperty.value) {
      columns.push({ header: "CH2_V", data: model.ch2Trace });
    }
    if (model.mathModeProperty.value !== "off") {
      columns.push({ header: "MATH_V", data: model.mathTrace });
    }

    // Every channel off and math off leaves a time-only file rather than a row of
    // dangling separators.
    const lines: string[] = [["time_s", ...columns.map((c) => c.header)].join(",")];
    for (let i = 0; i < n; i++) {
      const cells = columns.map((c) => (c.data[i] ?? 0).toPrecision(6));
      lines.push([(i * dt).toPrecision(6), ...cells].join(","));
    }
    downloadTextFile("oscilloscope-trace.csv", lines.join("\n"));
  }

  /** Saves the current CRT display as a PNG image download. */
  private exportImage(): void {
    this.displayNode.toCanvas((canvas) => {
      canvas.toBlob((blob) => {
        if (blob) {
          triggerBlobDownload(blob, "oscilloscope.png");
        }
      });
    });
  }

  public reset(): void {
    this.measuredFrequency.reset();
    this.measuredPeriod.reset();
    this.measuredVpp.reset();
    this.measuredVrms.reset();
    this.measuredVmax.reset();
    this.measuredVmin.reset();
    this.measuredDeltaTime.reset();
    this.measuredCursorFrequency.reset();
    this.measuredDeltaVoltage.reset();
    this.model.refresh();
    this.redraw();
  }

  public override step(_dt: number): void {
    // Resample only while running (STOP freezes the captured trace) …
    if (this.model.timer.isPlayingProperty.value) {
      this.model.refresh();
      this.redrawDirty = true;
    }
    // … but still redraw after a control change, so a stopped scope rescales its
    // frozen trace live, exactly as a bench scope does.
    if (this.redrawDirty) {
      this.redraw();
      this.redrawDirty = false;
    }
  }

  /**
   * Unhooks the render-input listeners.
   *
   * A `ScreenView` is never removed from the scene graph in this sim, so this is
   * not reached in normal operation; it exists so the registrations above are
   * paired and the memory-leak suite can exercise the class.
   */
  public override dispose(): void {
    for (const property of this.renderInputs) {
      property.unlink(this.markRedrawDirty);
    }
    this.renderInputs.length = 0;
    super.dispose();
  }
}
