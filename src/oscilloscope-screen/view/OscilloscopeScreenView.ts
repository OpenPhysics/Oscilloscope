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
} from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { spectrumMaxFrequency } from "../model/Spectrum.js";
import { CursorReadoutNode } from "./CursorReadoutNode.js";
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
      onSingle: () => this.captureSingle(),
      onAutoset: () => this.autoset(),
      onHelp: () => this.showLabs(),
      onExportCsv: () => this.exportCsv(),
      onExportImage: () => this.exportImage(),
    });
    const horizontalPanel = new HorizontalControlPanel(model);
    const triggerPanel = new TriggerControlPanel(model);
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

    // Generator under the CRT on the left; wires reach rightward to the BNCs.
    generatorPanel.left = SCREEN_VIEW_MARGIN;
    generatorPanel.top = displayNode.bottom + 16;

    this.addChild(softAcquirePanel);
    this.addChild(horizontalPanel);
    this.addChild(triggerPanel);
    this.addChild(verticalPanel);
    this.addChild(generatorPanel);
    this.addChild(patchLayer);

    // After layout, draw the default CH1←OUT A cable.
    patchLayer.redrawWires();
    model.ch1.inputProperty.lazyLink(() => patchLayer.redrawWires());
    model.ch2.inputProperty.lazyLink(() => patchLayer.redrawWires());

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
    );
    for (const property of this.renderInputs) {
      property.lazyLink(this.markRedrawDirty);
    }

    model.refresh();
    this.redraw();
    this.redrawDirty = false;
  }

  private showLabs(): void {
    const dialog = new LabActivitiesDialog(this.model, () => {
      this.model.refresh();
      this.redraw();
      this.redrawDirty = false;
      this.patchLayer.redrawWires();
    });
    dialog.show();
  }

  private redraw(): void {
    this.displayNode.update();
    this.updateMeasurements();
  }

  private captureSingle(): void {
    this.model.trigger.modeProperty.value = "single";
    this.model.trigger.arm();
    this.model.timer.isPlayingProperty.value = true;
  }

  private updateMeasurements(): void {
    const model = this.model;
    const buffer = model.primaryCleanTrace;
    const n = buffer.length;
    const sign = model.primaryChannel.invertedProperty.value ? -1 : 1;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sumSquares = 0;
    const signed = new Float32Array(n);
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
    this.measuredRiseTime.value = estimateRiseTime(signed, model.timeWindow);
    this.measuredFallTime.value = estimateFallTime(signed, model.timeWindow);

    const primaryInput = model.primaryChannel.inputProperty.value;
    const audioPrimary = primaryInput === "microphone";
    const hz = audioPrimary
      ? estimateFrequency(signed, model.timeWindow)
      : primaryInput === "none"
        ? 0
        : model.functionGenerator.frequencyProperty.value;
    this.measuredFrequency.value = hz;
    this.measuredPeriod.value = hz > 0 ? 1 / hz : 0;

    this.updatePhaseMeasurement();

    const deltaDivisionsTime = Math.abs(model.cursorTime2Property.value - model.cursorTime1Property.value);
    const deltaTime = deltaDivisionsTime * model.effectiveTimePerDivision;
    this.measuredDeltaTime.value = deltaTime;
    this.measuredCursorFrequency.value = deltaTime > 0 ? 1 / deltaTime : 0;
    const deltaDivisionsVolt = Math.abs(model.cursorVolt1Property.value - model.cursorVolt2Property.value);
    this.measuredDeltaVoltage.value = deltaDivisionsVolt * model.primaryChannel.effectiveVoltsPerDivision;

    const fMax = spectrumMaxFrequency(model.sampleCount, model.timeWindow);
    const f1 = (model.cursorTime1Property.value / HORIZONTAL_DIVISIONS) * fMax;
    const f2 = (model.cursorTime2Property.value / HORIZONTAL_DIVISIONS) * fMax;
    this.measuredFrequency1.value = f1;
    this.measuredFrequency2.value = f2;
    this.measuredDeltaFrequency.value = Math.abs(f2 - f1);
  }

  private updatePhaseMeasurement(): void {
    const model = this.model;
    if (!(model.ch1.enabledProperty.value && model.ch2.enabledProperty.value)) {
      this.measuredPhase.value = 0;
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
    const a = Float32Array.from(model.ch1CleanTrace, (v) => s1 * v);
    const b = Float32Array.from(model.ch2CleanTrace, (v) => s2 * v);
    this.measuredPhase.value = estimatePhaseDegrees(a, b, model.timeWindow);
  }

  private autoset(): void {
    const model = this.model;
    const fg = model.functionGenerator;

    model.displayModeProperty.value = "yt";
    model.magnifyProperty.value = false;
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
    if (this.model.timer.isPlayingProperty.value) {
      this.model.refresh();
      this.redrawDirty = true;
    }
    if (this.redrawDirty) {
      this.redraw();
      this.redrawDirty = false;
    }
  }

  public override dispose(): void {
    for (const property of this.renderInputs) {
      property.unlink(this.markRedrawDirty);
    }
    this.renderInputs.length = 0;
    super.dispose();
  }
}
