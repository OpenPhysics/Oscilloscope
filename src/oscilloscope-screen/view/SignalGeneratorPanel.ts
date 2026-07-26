/**
 * SignalGeneratorPanel.ts
 *
 * The CH1/CH2 signal-source module: waveform combo, sliders for frequency /
 * amplitude / offset / duty / phase, microphone status, and OUT A / OUT B / MIC
 * source jacks for patch cables into the scope BNCs.
 */

import {
  DerivedProperty,
  NumberProperty,
  type Property,
  type TProperty,
  type TReadOnlyProperty,
} from "scenerystack/axon";
import { Dimension2, Range } from "scenerystack/dot";
import { HBox, Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { ComboBox, type ComboBoxItem, HSlider, type HSliderOptions } from "scenerystack/sun";
import { LIGHT_SURFACE_TEXT_FILL, SIM_COMBO_BOX_OPTIONS } from "../../common/SimButtonOptions.js";
import { SimPanel } from "../../common/SimPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import {
  FG_AMPLITUDE_RANGE,
  FG_DUTY_CYCLE_RANGE,
  FG_FREQUENCY_RANGE,
  FG_OFFSET_RANGE,
  FG_PHASE_RANGE,
} from "../../SimConstants.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { WAVEFORMS } from "../model/Waveform.js";
import { derivedString } from "./controlHelpers.js";
import { formatDegrees, formatFrequency, formatPercent, formatVoltage } from "./formatUnits.js";
import { withSectionHeader } from "./panelSection.js";

const HEADING_FONT = new PhetFont({ size: 15, weight: "bold" });
const LABEL_FONT = new PhetFont(12);
const VALUE_FONT = new PhetFont({ size: 12, weight: "bold" });
const COMBO_FONT = new PhetFont(13);
const TRACK_SIZE = new Dimension2(150, 4);
const FREQUENCY_TRACK_SIZE = new Dimension2(318, 4);
const THUMB_SIZE = new Dimension2(14, 24);

type SliderRowOptions = {
  labelStringProperty: TReadOnlyProperty<string>;
  valueStringProperty: TReadOnlyProperty<string>;
  accessibleName: TReadOnlyProperty<string>;
  enabledProperty?: TReadOnlyProperty<boolean>;
  trackSize?: Dimension2;
} & Pick<HSliderOptions, "keyboardStep" | "shiftKeyboardStep" | "pageKeyboardStep" | "constrainValue">;

function createLog10Property(linearProperty: TProperty<number>, range: Range): NumberProperty {
  const logRange = new Range(Math.log10(range.min), Math.log10(range.max));
  const logProperty = new NumberProperty(Math.log10(linearProperty.value), { range: logRange });
  let syncing = false;
  logProperty.link((logValue) => {
    if (syncing) {
      return;
    }
    syncing = true;
    linearProperty.value = 10 ** logValue;
    syncing = false;
  });
  linearProperty.link((value) => {
    if (syncing) {
      return;
    }
    syncing = true;
    const clamped = Math.max(range.min, Math.min(range.max, value));
    logProperty.value = Math.log10(clamped);
    syncing = false;
  });
  return logProperty;
}

function createSliderRow(valueProperty: TProperty<number>, range: Range, options: SliderRowOptions): Node {
  const trackSize = options.trackSize ?? TRACK_SIZE;
  const label = new Text(options.labelStringProperty, {
    font: LABEL_FONT,
    fill: OscilloscopeColors.textColorProperty,
    maxWidth: Math.min(110, trackSize.width * 0.55),
  });
  const valueText = new Text(options.valueStringProperty, {
    font: VALUE_FONT,
    fill: OscilloscopeColors.generatorAccentColorProperty,
    maxWidth: Math.min(100, trackSize.width * 0.45),
  });

  const sliderOptions: HSliderOptions = {
    trackSize,
    thumbSize: THUMB_SIZE,
    trackFillEnabled: OscilloscopeColors.generatorSliderTrackColorProperty,
    trackFillDisabled: OscilloscopeColors.ledOffColorProperty,
    trackStroke: OscilloscopeColors.generatorPanelBorderColorProperty,
    thumbFill: OscilloscopeColors.generatorAccentColorProperty,
    thumbFillHighlighted: OscilloscopeColors.generatorAccentHighlightColorProperty,
    thumbStroke: OscilloscopeColors.generatorPanelBorderColorProperty,
    majorTickStroke: OscilloscopeColors.generatorPanelBorderColorProperty,
    accessibleName: options.accessibleName,
    soundGenerator: null,
  };
  if (options.enabledProperty) {
    sliderOptions.enabledProperty = options.enabledProperty;
  }
  if (options.keyboardStep !== undefined) {
    sliderOptions.keyboardStep = options.keyboardStep;
  }
  if (options.shiftKeyboardStep !== undefined) {
    sliderOptions.shiftKeyboardStep = options.shiftKeyboardStep;
  }
  if (options.pageKeyboardStep !== undefined) {
    sliderOptions.pageKeyboardStep = options.pageKeyboardStep;
  }
  if (options.constrainValue) {
    sliderOptions.constrainValue = options.constrainValue;
  }

  const slider = new HSlider(valueProperty as Property<number>, range, sliderOptions);

  const header = new Node({ children: [label, valueText] });
  const layoutHeader = (): void => {
    label.left = 0;
    label.centerY = 0;
    valueText.right = trackSize.width;
    valueText.centerY = 0;
  };
  label.boundsProperty.link(layoutHeader);
  valueText.boundsProperty.link(layoutHeader);

  return new VBox({
    align: "left",
    spacing: 2,
    children: [header, slider],
  });
}

function createComboItems<T extends string>(
  values: readonly T[],
  labels: Record<T, TReadOnlyProperty<string>>,
): ComboBoxItem<T>[] {
  return values.map((value) => ({
    value,
    createNode: () =>
      new Text(labels[value], {
        font: COMBO_FONT,
        fill: LIGHT_SURFACE_TEXT_FILL,
        maxWidth: 140,
      }),
    accessibleName: labels[value],
  }));
}

export type SignalGeneratorPanelOptions = {
  listParent: Node;
  sourceJackA: Node;
  sourceJackB: Node;
  sourceJackMic: Node;
};

export class SignalGeneratorPanel extends SimPanel {
  public readonly waveformComboBox: Node;
  public readonly frequencySlider: Node;
  public readonly amplitudeSlider: Node;
  public readonly offsetSlider: Node;
  public readonly dutySlider: Node;
  public readonly phaseSlider: Node;

  public constructor(model: OscilloscopeModel, options: SignalGeneratorPanelOptions) {
    const strings = StringManager.getInstance();
    const g = strings.getGenerator();
    const src = strings.getSource();
    const controls = strings.getA11yStrings().controls;
    const fg = model.functionGenerator;

    const waveformComboBox = new ComboBox(
      fg.waveformProperty,
      createComboItems(WAVEFORMS, {
        sine: g.sineStringProperty,
        square: g.squareStringProperty,
        triangle: g.triangleStringProperty,
        sawtooth: g.sawtoothStringProperty,
        pulse: g.pulseStringProperty,
        noise: g.noiseStringProperty,
      }),
      options.listParent,
      {
        ...SIM_COMBO_BOX_OPTIONS,
        accessibleName: controls.waveformStringProperty,
        comboBoxVoicingNameResponsePattern: "{{value}}",
      },
    );

    const logFrequencyProperty = createLog10Property(fg.frequencyProperty, FG_FREQUENCY_RANGE);
    const frequencySlider = createSliderRow(logFrequencyProperty, logFrequencyProperty.range, {
      labelStringProperty: g.frequencyStringProperty,
      valueStringProperty: derivedString(fg.frequencyProperty, formatFrequency),
      accessibleName: controls.frequencyStringProperty,
      trackSize: FREQUENCY_TRACK_SIZE,
      keyboardStep: 0.05,
      shiftKeyboardStep: 0.01,
      pageKeyboardStep: 1,
    });

    const amplitudeSlider = createSliderRow(fg.amplitudeProperty, FG_AMPLITUDE_RANGE, {
      labelStringProperty: g.amplitudeStringProperty,
      valueStringProperty: derivedString(fg.amplitudeProperty, formatVoltage),
      accessibleName: controls.amplitudeStringProperty,
    });
    const offsetSlider = createSliderRow(fg.offsetProperty, FG_OFFSET_RANGE, {
      labelStringProperty: g.offsetStringProperty,
      valueStringProperty: derivedString(fg.offsetProperty, formatVoltage),
      accessibleName: controls.offsetStringProperty,
    });
    const dutySlider = createSliderRow(fg.dutyCycleProperty, FG_DUTY_CYCLE_RANGE, {
      labelStringProperty: g.dutyStringProperty,
      valueStringProperty: derivedString(fg.dutyCycleProperty, formatPercent),
      accessibleName: controls.dutyStringProperty,
      enabledProperty: new DerivedProperty(
        [fg.waveformProperty],
        (waveform) => waveform === "square" || waveform === "pulse",
      ),
    });
    const phaseSlider = createSliderRow(fg.phaseProperty, FG_PHASE_RANGE, {
      labelStringProperty: g.phaseStringProperty,
      valueStringProperty: derivedString(fg.phaseProperty, formatDegrees),
      accessibleName: controls.phaseStringProperty,
      keyboardStep: 5,
      shiftKeyboardStep: 1,
      pageKeyboardStep: 45,
    });

    const status = src.status;
    const statusTextProperty: TReadOnlyProperty<string> = new DerivedProperty(
      [
        model.audioInput.statusProperty,
        status.idleStringProperty,
        status.requestingStringProperty,
        status.activeStringProperty,
        status.deniedStringProperty,
        status.unsupportedStringProperty,
        model.ch1.inputProperty,
        model.ch2.inputProperty,
      ],
      (state, idle, requesting, active, denied, unsupported, ch1In, ch2In) => {
        if (ch1In !== "microphone" && ch2In !== "microphone") {
          return idle;
        }
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
      font: new PhetFont({ size: 11, style: "italic" }),
      fill: OscilloscopeColors.textColorProperty,
      visibleProperty: new DerivedProperty(
        [model.ch1.inputProperty, model.ch2.inputProperty],
        (a, b) => a === "microphone" || b === "microphone",
      ),
      maxWidth: 300,
    });

    // Silkscreen model label, so the box reads as a distinct bench instrument.
    const modelLabel = new Text("OpenPhysics · FG-100", {
      font: new PhetFont({ size: 10, weight: "bold" }),
      fill: OscilloscopeColors.generatorAccentColorProperty,
      opacity: 0.75,
      maxWidth: 200,
    });

    const body = new VBox({
      align: "left",
      spacing: 8,
      children: [
        new VBox({
          align: "left",
          spacing: 3,
          children: [
            new Text(g.waveformStringProperty, {
              font: LABEL_FONT,
              fill: OscilloscopeColors.textColorProperty,
              maxWidth: 140,
            }),
            waveformComboBox,
          ],
        }),
        statusText,
        frequencySlider,
        new HBox({ spacing: 18, align: "top", children: [amplitudeSlider, offsetSlider] }),
        new HBox({ spacing: 18, align: "top", children: [dutySlider, phaseSlider] }),
        new HBox({
          spacing: 20,
          align: "top",
          children: [options.sourceJackA, options.sourceJackB, options.sourceJackMic],
        }),
        modelLabel,
      ],
    });

    const content = withSectionHeader(g.titleStringProperty, body, {
      barColor: OscilloscopeColors.generatorFaceplateColorProperty,
      textColor: OscilloscopeColors.generatorAccentColorProperty,
      font: HEADING_FONT,
    });

    super(content, {
      fill: OscilloscopeColors.generatorPanelBackgroundColorProperty,
      stroke: OscilloscopeColors.generatorPanelBorderColorProperty,
      lineWidth: 3,
      cornerRadius: 10,
      xMargin: 16,
      yMargin: 14,
    });

    this.waveformComboBox = waveformComboBox;
    this.frequencySlider = frequencySlider;
    this.amplitudeSlider = amplitudeSlider;
    this.offsetSlider = offsetSlider;
    this.dutySlider = dutySlider;
    this.phaseSlider = phaseSlider;
  }
}
