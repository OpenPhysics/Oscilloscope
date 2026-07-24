/**
 * SignalControlPanel.ts
 *
 * The left-hand control stack: choose the input source (function generator or
 * microphone), and — for the function generator — the waveform, frequency, and
 * amplitude. The function-generator controls disable themselves while the
 * microphone source is active, and a live status line reports the microphone
 * state.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { Range } from "scenerystack/dot";
import { HSeparator, type Node, Text, VBox } from "scenerystack/scenery";
import { NumberControl, PhetFont } from "scenerystack/scenery-phet";
import { ComboBox } from "scenerystack/sun";
import {
  FLAT_RECTANGULAR_BUTTON_OPTIONS,
  LIGHT_SURFACE_TEXT_FILL,
  SIM_COMBO_BOX_OPTIONS,
} from "../../common/SimButtonOptions.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { FG_AMPLITUDE_RANGE, FG_FREQUENCY_RANGE } from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { SIGNAL_SOURCES } from "../model/SignalSource.js";
import { WAVEFORMS } from "../model/Waveform.js";

const HEADING_FONT = new PhetFont({ size: 15, weight: "bold" });
const LABEL_FONT = new PhetFont(13);

export class SignalControlPanel extends SimPanel {
  /** The source combo box and the function-generator controls, for pdomOrder. */
  public readonly sourceComboBox: Node;
  public readonly waveformComboBox: Node;
  public readonly frequencyControl: Node;
  public readonly amplitudeControl: Node;

  public constructor(model: OscilloscopeModel, listParent: Node) {
    const strings = StringManager.getInstance();
    const sourceStrings = strings.getSource();
    const fgStrings = strings.getFunctionGenerator();
    const a11y = strings.getA11yStrings();

    // True only while the function generator is the selected source.
    const fgEnabledProperty = new DerivedProperty([model.sourceProperty], (source) => source === "functionGenerator");

    // ── Source selector ───────────────────────────────────────────────────────
    const sourceLabels: Record<(typeof SIGNAL_SOURCES)[number], TReadOnlyProperty<string>> = {
      functionGenerator: sourceStrings.functionGeneratorStringProperty,
      audio: sourceStrings.audioStringProperty,
    };
    const sourceComboBox = new ComboBox(
      model.sourceProperty,
      SIGNAL_SOURCES.map((value) => ({
        value,
        tandemName: `${value}Item`,
        accessibleName: sourceLabels[value],
        createNode: () => new Text(sourceLabels[value], { font: LABEL_FONT, fill: LIGHT_SURFACE_TEXT_FILL }),
      })),
      listParent,
      { ...SIM_COMBO_BOX_OPTIONS, accessibleName: a11y.controls.sourceStringProperty },
    );

    // ── Waveform selector ─────────────────────────────────────────────────────
    const waveformLabels: Record<(typeof WAVEFORMS)[number], TReadOnlyProperty<string>> = {
      sine: fgStrings.sineStringProperty,
      square: fgStrings.squareStringProperty,
      triangle: fgStrings.triangleStringProperty,
      sawtooth: fgStrings.sawtoothStringProperty,
    };
    const waveformComboBox = new ComboBox(
      model.functionGenerator.waveformProperty,
      WAVEFORMS.map((value) => ({
        value,
        tandemName: `${value}Item`,
        accessibleName: waveformLabels[value],
        createNode: () => new Text(waveformLabels[value], { font: LABEL_FONT, fill: LIGHT_SURFACE_TEXT_FILL }),
      })),
      listParent,
      {
        ...SIM_COMBO_BOX_OPTIONS,
        accessibleName: a11y.controls.waveformStringProperty,
        enabledProperty: fgEnabledProperty,
      },
    );

    // ── Frequency & amplitude sliders ─────────────────────────────────────────
    const frequencyControl = new NumberControl(
      fgStrings.frequencyStringProperty,
      model.functionGenerator.frequencyProperty,
      FG_FREQUENCY_RANGE,
      SignalControlPanel.numberControlOptions(
        a11y.controls.frequencyStringProperty,
        1,
        0,
        FG_FREQUENCY_RANGE,
        fgEnabledProperty,
      ),
    );
    const amplitudeControl = new NumberControl(
      fgStrings.amplitudeStringProperty,
      model.functionGenerator.amplitudeProperty,
      FG_AMPLITUDE_RANGE,
      SignalControlPanel.numberControlOptions(
        a11y.controls.amplitudeStringProperty,
        0.1,
        1,
        FG_AMPLITUDE_RANGE,
        fgEnabledProperty,
      ),
    );

    // ── Microphone status line (only meaningful for the audio source) ─────────
    const status = sourceStrings.status;
    const statusTextProperty = new DerivedProperty(
      [
        model.audioInput.statusProperty,
        status.idleStringProperty,
        status.requestingStringProperty,
        status.activeStringProperty,
        status.deniedStringProperty,
        status.unsupportedStringProperty,
      ],
      (state, idle, requesting, active, denied, unsupported) => {
        switch (state) {
          case "requesting":
            return requesting;
          case "active":
            return active;
          case "denied":
            return denied;
          case "unsupported":
            return unsupported;
          default:
            return idle;
        }
      },
    );
    const statusText = new Text(statusTextProperty, {
      font: new PhetFont({ size: 12, style: "italic" }),
      fill: OscilloscopeColors.textColorProperty,
      visibleProperty: new DerivedProperty([model.sourceProperty], (source) => source === "audio"),
    });

    const content = new VBox({
      align: "left",
      spacing: 10,
      stretch: true,
      children: [
        new Text(sourceStrings.titleStringProperty, { font: HEADING_FONT, fill: OscilloscopeColors.textColorProperty }),
        sourceComboBox,
        statusText,
        new HSeparator(),
        new Text(fgStrings.titleStringProperty, { font: HEADING_FONT, fill: OscilloscopeColors.textColorProperty }),
        new Text(fgStrings.waveformStringProperty, { font: LABEL_FONT, fill: OscilloscopeColors.textColorProperty }),
        waveformComboBox,
        frequencyControl,
        amplitudeControl,
      ],
    });

    super(content);

    this.sourceComboBox = sourceComboBox;
    this.waveformComboBox = waveformComboBox;
    this.frequencyControl = frequencyControl;
    this.amplitudeControl = amplitudeControl;
  }

  /** Shared, themed NumberControl option bundle for the dark panel. */
  private static numberControlOptions(
    accessibleName: TReadOnlyProperty<string>,
    delta: number,
    decimalPlaces: number,
    range: Range,
    enabledProperty: TReadOnlyProperty<boolean>,
  ) {
    const makeTick = (value: number) => ({
      value,
      label: new Text(decimalPlaces > 0 ? value.toFixed(decimalPlaces) : `${value}`, {
        font: new PhetFont(11),
        fill: OscilloscopeColors.textColorProperty,
      }),
    });
    return {
      accessibleName,
      enabledProperty,
      delta,
      layoutFunction: NumberControl.createLayoutFunction1(),
      titleNodeOptions: { font: LABEL_FONT, fill: OscilloscopeColors.textColorProperty },
      numberDisplayOptions: {
        decimalPlaces,
        textOptions: { font: LABEL_FONT, fill: LIGHT_SURFACE_TEXT_FILL },
        backgroundFill: OscilloscopeColors.controlSurfaceColorProperty,
        backgroundStroke: OscilloscopeColors.panelBorderColorProperty,
      },
      arrowButtonOptions: FLAT_RECTANGULAR_BUTTON_OPTIONS,
      sliderOptions: {
        thumbFill: OscilloscopeColors.accentColorProperty,
        trackFillEnabled: OscilloscopeColors.textColorProperty,
        majorTicks: [makeTick(range.min), makeTick(range.max)],
        majorTickLength: 8,
      },
    };
  }
}
