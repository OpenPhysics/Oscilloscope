/**
 * OscilloscopeScreenView.ts
 *
 * Top-level view for the oscilloscope screen. Lays out a TBS 1000C–inspired
 * front panel (soft/acquire, horizontal, trigger, vertical with Math/FFT and
 * BNCs) beside the CRT, with a distinct function-generator module and patch
 * cables into the channel inputs.
 *
 * Each animation frame it resamples the model (while running) and redraws the
 * traces; changing a control while stopped still rescales the frozen trace.
 */

import type { TProperty, TReadOnlyProperty } from "scenerystack/axon";
import { DerivedProperty, NumberProperty } from "scenerystack/axon";
import { Bounds2 } from "scenerystack/dot";
import { Node, Rectangle, VBox } from "scenerystack/scenery";
import { ResetAllButton } from "scenerystack/scenery-phet";
import type { ScreenViewOptions } from "scenerystack/sim";
import { ScreenView } from "scenerystack/sim";
import { downloadTextFile, triggerBlobDownload } from "../../common/downloadFile.js";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/SimButtonOptions.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import {
  HORIZONTAL_DIVISIONS,
  PANEL_CORNER_RADIUS,
  SCOPE_TIME_PER_DIV_STEPS,
  SCOPE_TRIGGER_LEVEL_RANGE,
  SCOPE_VOLTS_PER_DIV_STEPS,
  SCREEN_VIEW_MARGIN,
} from "../../OscilloscopeConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { spectrumMaxFrequency } from "../model/Spectrum.js";
import { CursorReadoutNode } from "./CursorReadoutNode.js";
import { DisplayControlPanel } from "./DisplayControlPanel.js";
import { HorizontalControlPanel } from "./HorizontalControlPanel.js";
import { LabActivitiesDialog } from "./LabActivitiesDialog.js";
import { MeasurementReadoutNode } from "./MeasurementReadoutNode.js";
import {
  estimateDutyCycle,
  estimateFallTime,
  estimateFrequency,
  estimatePhaseDegrees,
  estimateRiseTime,
  meanOf,
  nearestStep,
} from "./measurementUtils.js";
import { OscilloscopeDisplayNode } from "./OscilloscopeDisplayNode.js";
import { OscilloscopeScreenSummaryContent } from "./OscilloscopeScreenSummaryContent.js";
import { PatchCableLayer } from "./PatchCableLayer.js";
import { SignalGeneratorPanel } from "./SignalGeneratorPanel.js";
import { SoftAcquirePanel } from "./SoftAcquirePanel.js";
import { TriggerControlPanel } from "./TriggerControlPanel.js";
import { VerticalControlPanel } from "./VerticalControlPanel.js";

const LAYOUT_BOUNDS = new Bounds2(0, 0, 1280, 800);

type SelfOptions = {
  showMeasurementsProperty: TProperty<boolean>;
};

export type OscilloscopeScreenViewOptions = SelfOptions & ScreenViewOptions;

export class OscilloscopeScreenView extends ScreenView {
  private readonly model: OscilloscopeModel;
  private readonly displayNode: OscilloscopeDisplayNode;
  private readonly patchLayer: PatchCableLayer;

  private readonly measuredFrequency = new NumberProperty(0);
  private readonly measuredPeriod = new NumberProperty(0);
  private readonly measuredVpp = new NumberProperty(0);
  private readonly measuredVrms = new NumberProperty(0);
  private readonly measuredVmax = new NumberProperty(0);
  private readonly measuredVmin = new NumberProperty(0);
  private readonly measuredDutyCycle = new NumberProperty(0);
  private readonly measuredRiseTime = new NumberProperty(0);
  private readonly measuredFallTime = new NumberProperty(0);
  private readonly measuredMean = new NumberProperty(0);
  private readonly measuredPhase = new NumberProperty(0);

  private readonly measuredDeltaTime = new NumberProperty(0);
  private readonly measuredCursorFrequency = new NumberProperty(0);
  private readonly measuredDeltaVoltage = new NumberProperty(0);
  private readonly measuredFrequency1 = new NumberProperty(0);
  private readonly measuredFrequency2 = new NumberProperty(0);
  private readonly measuredDeltaFrequency = new NumberProperty(0);

  /** Every measured Property, so Reset All cannot leave one behind. */
  private readonly measuredProperties: NumberProperty[];

  private redrawDirty = true;
  private readonly markRedrawDirty = (): void => {
    this.redrawDirty = true;
  };
  private readonly renderInputs: TReadOnlyProperty<unknown>[] = [];

  // Scratch buffers for the per-frame measurement pass. Measurements run on every
  // redraw, so these are allocated once and reused, like the model's trace buffers —
  // a fresh typed array per frame is exactly the garbage this sim avoids elsewhere.
  private readonly signedBuffer: Float32Array;
  private readonly phaseBufferA: Float32Array;
  private readonly phaseBufferB: Float32Array;

  // Built on first use and reused: a new Dialog per press would accumulate one
  // undisposed dialog (and its localized Texts) for every visit to the Lab menu.
  private labDialog: LabActivitiesDialog | null = null;

  public constructor(model: OscilloscopeModel, providedOptions: OscilloscopeScreenViewOptions) {
    const { showMeasurementsProperty, ...screenViewOptions } = providedOptions;

    super({
      layoutBounds: LAYOUT_BOUNDS,
      screenSummaryContent: new OscilloscopeScreenSummaryContent(model),
      ...screenViewOptions,
    });

    this.model = model;
    this.measuredProperties = [
      this.measuredFrequency,
      this.measuredPeriod,
      this.measuredVpp,
      this.measuredVrms,
      this.measuredVmax,
      this.measuredVmin,
      this.measuredDutyCycle,
      this.measuredRiseTime,
      this.measuredFallTime,
      this.measuredMean,
      this.measuredPhase,
      this.measuredDeltaTime,
      this.measuredCursorFrequency,
      this.measuredDeltaVoltage,
      this.measuredFrequency1,
      this.measuredFrequency2,
      this.measuredDeltaFrequency,
    ];
    this.signedBuffer = new Float32Array(model.sampleCount);
    this.phaseBufferA = new Float32Array(model.sampleCount);
    this.phaseBufferB = new Float32Array(model.sampleCount);

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
        dutyCycleProperty: this.measuredDutyCycle,
        riseTimeProperty: this.measuredRiseTime,
        fallTimeProperty: this.measuredFallTime,
        meanProperty: this.measuredMean,
        phaseProperty: this.measuredPhase,
        showPhaseProperty: new DerivedProperty(
          [model.ch1.enabledProperty, model.ch2.enabledProperty],
          (a, b) => a && b,
        ),
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
        frequency1Property: this.measuredFrequency1,
        frequency2Property: this.measuredFrequency2,
        deltaFrequencyProperty: this.measuredDeltaFrequency,
        displayModeProperty: model.displayModeProperty,
      },
      new DerivedProperty(
        [model.cursorsEnabledProperty, model.displayModeProperty],
        (on, mode) => on && (mode === "yt" || mode === "fft"),
      ),
    );
    cursorReadout.right = displayNode.right - 8;
    cursorReadout.top = displayNode.top + 8;
    this.addChild(cursorReadout);

    // Patch cables sit above panels so wires draw over the chassis.
    const patchLayer = new PatchCableLayer({ model, coordinateFrame: this });
    this.patchLayer = patchLayer;

    const softAcquirePanel = new SoftAcquirePanel(model, {
      showMeasurementsProperty,
      onSingle: () => model.captureSingle(),
      onAutoset: () => this.autoset(),
      onHelp: () => this.showLabs(),
      onExportCsv: () => this.exportCsv(),
      onExportImage: () => this.exportImage(),
    });
    const horizontalPanel = new HorizontalControlPanel(model);
    const triggerPanel = new TriggerControlPanel(model);
    const displayPanel = new DisplayControlPanel(model);
    const verticalPanel = new VerticalControlPanel(model, {
      ch1Bnc: patchLayer.ch1Bnc,
      ch2Bnc: patchLayer.ch2Bnc,
    });
    const generatorPanel = new SignalGeneratorPanel(model, {
      listParent: this,
      sourceJackA: patchLayer.sourceJackA,
      sourceJackB: patchLayer.sourceJackB,
      sourceJackMic: patchLayer.sourceJackMic,
    });

    // Decorative bezel softkeys flanking the CRT, like a real scope's menu column.
    // Purely chrome: non-interactive and absent from the PDOM.
    const softkeys = new VBox({
      spacing: 12,
      pickable: false,
      children: Array.from(
        { length: 5 },
        () =>
          new Rectangle(0, 0, 22, 30, {
            fill: OscilloscopeColors.softkeyColorProperty,
            stroke: OscilloscopeColors.knobRimColorProperty,
            lineWidth: 1,
            cornerRadius: PANEL_CORNER_RADIUS - 2,
          }),
      ),
    });
    softkeys.left = displayNode.right + 6;
    softkeys.centerY = displayNode.centerY;
    this.addChild(softkeys);

    // TBS geography to the right of the CRT: soft/acquire on top, then a
    // Vertical | Horizontal | Trigger row beneath it.
    const controlsLeft = softkeys.right + 12;
    softAcquirePanel.left = controlsLeft;
    softAcquirePanel.top = SCREEN_VIEW_MARGIN;

    // Vertical | Horizontal | Trigger in one row under the soft/acquire cluster,
    // like the real scope: Vertical on the left, Horizontal and Trigger to its right.
    verticalPanel.left = controlsLeft;
    verticalPanel.top = softAcquirePanel.bottom + 10;

    horizontalPanel.left = verticalPanel.right + 12;
    horizontalPanel.top = softAcquirePanel.bottom + 10;
    triggerPanel.left = horizontalPanel.right + 12;
    triggerPanel.top = softAcquirePanel.bottom + 10;

    // CRT beam controls sit under the Vertical | Horizontal | Trigger row.
    const controlRowBottom = Math.max(verticalPanel.bottom, horizontalPanel.bottom, triggerPanel.bottom);
    displayPanel.left = controlsLeft;
    displayPanel.top = controlRowBottom + 10;

    // Generator under the CRT on the left; wires reach rightward to the BNCs.
    generatorPanel.left = SCREEN_VIEW_MARGIN;
    generatorPanel.top = displayNode.bottom + 16;

    this.addChild(softAcquirePanel);
    this.addChild(horizontalPanel);
    this.addChild(triggerPanel);
    this.addChild(verticalPanel);
    this.addChild(displayPanel);
    this.addChild(generatorPanel);
    this.addChild(patchLayer);

    // After layout, draw the default CH1←OUT A cable. The layer keeps itself in
    // sync with the patch Properties from here on, so no extra listener is needed.
    patchLayer.redrawWires();

    const resetAllButton = new ResetAllButton({
      ...FLAT_RESET_ALL_BUTTON_OPTIONS,
      listener: () => {
        model.reset();
        this.reset();
        patchLayer.redrawWires();
      },
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      bottom: this.layoutBounds.maxY - SCREEN_VIEW_MARGIN,
    });
    this.addChild(resetAllButton);

    this.addChild(
      new Node({
        pdomOrder: [
          ...softAcquirePanel.controlsInOrder,
          ...horizontalPanel.controlsInOrder,
          ...triggerPanel.controlsInOrder,
          ...verticalPanel.controlsInOrder,
          ...displayPanel.controlsInOrder,
          patchLayer.sourceJackA,
          patchLayer.sourceJackB,
          patchLayer.sourceJackMic,
          generatorPanel.waveformComboBox,
          generatorPanel.frequencySlider,
          generatorPanel.amplitudeSlider,
          generatorPanel.offsetSlider,
          generatorPanel.dutySlider,
          generatorPanel.phaseSlider,
          ...displayNode.cursorsInOrder,
          resetAllButton,
        ],
      }),
    );

    this.renderInputs.push(
      model.ch1.enabledProperty,
      model.ch1.voltsPerDivisionProperty,
      model.ch1.probeProperty,
      model.ch1.positionProperty,
      model.ch1.couplingProperty,
      model.ch1.invertedProperty,
      model.ch1.inputProperty,
      model.ch2.enabledProperty,
      model.ch2.voltsPerDivisionProperty,
      model.ch2.probeProperty,
      model.ch2.positionProperty,
      model.ch2.couplingProperty,
      model.ch2.invertedProperty,
      model.ch2.inputProperty,
      model.displayModeProperty,
      model.mathModeProperty,
      model.persistenceProperty,
      model.intensityProperty,
      model.focusProperty,
      model.beamFinderProperty,
      model.cursorsEnabledProperty,
      model.cursorTime1Property,
      model.cursorTime2Property,
      model.cursorVolt1Property,
      model.cursorVolt2Property,
      model.trigger.sourceProperty,
      model.trigger.levelProperty,
      model.trigger.holdoffProperty,
      model.timePerDivisionProperty,
      model.horizontalPositionProperty,
      model.magnifyProperty,
      model.delayedSweepModeProperty,
      model.delayProperty,
      model.delayedTimePerDivisionProperty,
    );
    for (const property of this.renderInputs) {
      property.lazyLink(this.markRedrawDirty);
    }

    model.refresh();
    this.redraw();
    this.redrawDirty = false;
  }

  private showLabs(): void {
    this.labDialog ??= new LabActivitiesDialog(this.model, () => {
      this.model.refresh();
      this.redraw();
      this.redrawDirty = false;
      this.patchLayer.redrawWires();
    });
    this.labDialog.show();
  }

  private redraw(): void {
    this.displayNode.update();
    this.updateMeasurements();
  }

  private updateMeasurements(): void {
    const model = this.model;
    const buffer = model.primaryCleanTrace;
    const n = buffer.length;
    const sign = model.primaryChannel.invertedProperty.value ? -1 : 1;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sumSquares = 0;
    const signed = this.signedBuffer;
    for (let i = 0; i < n; i++) {
      const v = sign * (buffer[i] ?? 0);
      signed[i] = v;
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
    this.measuredMean.value = meanOf(signed);
    this.measuredDutyCycle.value = estimateDutyCycle(signed);
    this.measuredRiseTime.value = estimateRiseTime(signed, model.displayedTimeWindow);
    this.measuredFallTime.value = estimateFallTime(signed, model.displayedTimeWindow);

    const hz = this.measureFrequency(signed);
    this.measuredFrequency.value = hz;
    this.measuredPeriod.value = hz > 0 ? 1 / hz : 0;

    this.updatePhaseMeasurement();

    const deltaDivisionsTime = Math.abs(model.cursorTime2Property.value - model.cursorTime1Property.value);
    const deltaTime = deltaDivisionsTime * model.displayedTimePerDivision;
    this.measuredDeltaTime.value = deltaTime;
    this.measuredCursorFrequency.value = deltaTime > 0 ? 1 / deltaTime : 0;
    const deltaDivisionsVolt = Math.abs(model.cursorVolt1Property.value - model.cursorVolt2Property.value);
    this.measuredDeltaVoltage.value = deltaDivisionsVolt * model.primaryChannel.effectiveVoltsPerDivision;

    const fMax = spectrumMaxFrequency(model.sampleCount, model.displayedTimeWindow);
    const f1 = (model.cursorTime1Property.value / HORIZONTAL_DIVISIONS) * fMax;
    const f2 = (model.cursorTime2Property.value / HORIZONTAL_DIVISIONS) * fMax;
    this.measuredFrequency1.value = f1;
    this.measuredFrequency2.value = f2;
    this.measuredDeltaFrequency.value = Math.abs(f2 - f1);
  }

  /**
   * The frequency to report for the primary channel.
   *
   * The generator's own setting is exact and noise-free, so it is preferred — but
   * only when the channel is actually showing that signal. A grounded channel
   * displays a flat line and must read as unmeasurable rather than quietly echoing
   * the knob, and the noise waveform has no single frequency to echo, so both fall
   * through to measuring whatever is on screen.
   */
  private measureFrequency(signed: Float32Array): number {
    const model = this.model;
    const channel = model.primaryChannel;
    const input = channel.inputProperty.value;
    if (input === "none" || channel.couplingProperty.value === "GND") {
      return 0;
    }
    if (input === "microphone" || model.functionGenerator.waveformProperty.value === "noise") {
      return estimateFrequency(signed, model.displayedTimeWindow);
    }
    return model.functionGenerator.frequencyProperty.value;
  }

  private updatePhaseMeasurement(): void {
    const model = this.model;
    // Negative reads as "—" in the readout: no second trace, nothing to compare.
    if (!(model.ch1.enabledProperty.value && model.ch2.enabledProperty.value)) {
      this.measuredPhase.value = -1;
      return;
    }
    // Prefer the generator phase when both channels are FG A/B — exact and noise-free.
    const in1 = model.ch1.inputProperty.value;
    const in2 = model.ch2.inputProperty.value;
    if (
      (in1 === "functionGeneratorA" || in1 === "functionGeneratorB") &&
      (in2 === "functionGeneratorA" || in2 === "functionGeneratorB")
    ) {
      const phaseA = in1 === "functionGeneratorB" ? model.functionGenerator.phaseProperty.value : 0;
      const phaseB = in2 === "functionGeneratorB" ? model.functionGenerator.phaseProperty.value : 0;
      this.measuredPhase.value = (((phaseB - phaseA) % 360) + 360) % 360;
      return;
    }
    // Both channels are enabled here (checked above), so CH2's clean buffer was
    // filled this frame; estimate phase from the two captured traces.
    const s1 = model.ch1.invertedProperty.value ? -1 : 1;
    const s2 = model.ch2.invertedProperty.value ? -1 : 1;
    const ch1 = model.ch1CleanTrace;
    const ch2 = model.ch2CleanTrace;
    const a = this.phaseBufferA;
    const b = this.phaseBufferB;
    for (let i = 0; i < a.length; i++) {
      a[i] = s1 * (ch1[i] ?? 0);
      b[i] = s2 * (ch2[i] ?? 0);
    }
    this.measuredPhase.value = estimatePhaseDegrees(a, b, model.displayedTimeWindow);
  }

  private autoset(): void {
    const model = this.model;
    const fg = model.functionGenerator;

    model.displayModeProperty.value = "yt";
    model.magnifyProperty.value = false;
    model.delayedSweepModeProperty.value = "off";
    model.horizontalPositionProperty.value = 0;

    // Ensure CH1 has a signal to autoset against.
    if (model.ch1.inputProperty.value === "none") {
      model.connectJack(1, "functionGeneratorA");
    }

    model.ch1.enabledProperty.value = true;
    model.ch1.couplingProperty.value = "DC";
    model.ch1.invertedProperty.value = false;
    model.ch1.probeProperty.value = 1;
    model.ch1.positionProperty.value = 0;
    model.refresh();
    this.updateMeasurements();

    const audioPrimary = model.ch1.inputProperty.value === "microphone";
    const peak = audioPrimary
      ? Math.max(0.01, this.measuredVpp.value / 2)
      : Math.max(0.01, fg.amplitudeProperty.value + Math.abs(fg.offsetProperty.value));
    model.ch1.voltsPerDivisionProperty.value = nearestStep(SCOPE_VOLTS_PER_DIV_STEPS, peak / 2);

    const f = audioPrimary ? this.measuredFrequency.value : fg.frequencyProperty.value;
    if (f > 0) {
      const targetTimePerDiv = 3 / f / HORIZONTAL_DIVISIONS;
      model.timePerDivisionProperty.value = nearestStep(SCOPE_TIME_PER_DIV_STEPS, targetTimePerDiv);
    }

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
    this.patchLayer.redrawWires();
  }

  private exportCsv(): void {
    const model = this.model;
    const n = model.sampleCount;
    const dt = n > 1 ? model.displayedTimeWindow / (n - 1) : 0;

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

    const lines: string[] = [["time_s", ...columns.map((c) => c.header)].join(",")];
    for (let i = 0; i < n; i++) {
      const cells = columns.map((c) => (c.data[i] ?? 0).toPrecision(6));
      lines.push([(i * dt).toPrecision(6), ...cells].join(","));
    }
    downloadTextFile("oscilloscope-trace.csv", lines.join("\n"));
  }

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
    // Every measured Property is recomputed from the fresh capture below, so the
    // resets only matter for the brief moment in between — but leaving any of them
    // out would strand a stale reading if that recompute ever short-circuits.
    for (const property of this.measuredProperties) {
      property.reset();
    }
    this.model.refresh();
    this.redraw();
  }

  public override step(_dt: number): void {
    if (this.model.timer.isPlayingProperty.value) {
      this.model.refresh();
      this.redrawDirty = true;
    }
    if (this.redrawDirty) {
      this.redraw();
      this.redrawDirty = false;
    }
  }

  // No dispose() override: joist's ScreenView is deliberately not disposable — its
  // setPDOMOrder() throws, so Node.dispose() cannot complete and any override that
  // called super.dispose() would throw instead of tearing anything down. The screen
  // view and the model share the sim's lifetime, so there is nothing here to
  // release; the components below it (panels, patch layer, display node) each own
  // a DisposalBag and are covered by the memory-leak suite.
}
