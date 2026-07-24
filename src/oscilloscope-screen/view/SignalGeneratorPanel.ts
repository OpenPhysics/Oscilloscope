/**
 * SignalGeneratorPanel.ts
 *
 * The function-generator section of the front panel: a rotary switch to pick
 * CH1's input (generator or microphone), a waveform selector, and knobs for
 * frequency, amplitude, DC offset, duty cycle, and the CH2 phase shift. Every
 * control is a real-instrument knob or switch — no sliders.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { RotaryKnob } from "../../common/controls/RotaryKnob.js";
import { RotarySwitch } from "../../common/controls/RotarySwitch.js";
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
import { SIGNAL_SOURCES } from "../model/SignalSource.js";
import { WAVEFORMS } from "../model/Waveform.js";
import { derivedString, unionItems } from "./controlHelpers.js";
import { formatDegrees, formatFrequency, formatPercent, formatVoltage } from "./formatUnits.js";

const HEADING_FONT = new PhetFont({ size: 15, weight: "bold" });

export class SignalGeneratorPanel extends SimPanel {
  public readonly sourceSwitch: Node;
  public readonly waveformSwitch: Node;
  public readonly frequencyKnob: Node;
  public readonly amplitudeKnob: Node;
  public readonly offsetKnob: Node;
  public readonly dutyKnob: Node;
  public readonly phaseKnob: Node;

  public constructor(model: OscilloscopeModel) {
    const strings = StringManager.getInstance();
    const g = strings.getGenerator();
    const src = strings.getSource();
    const controls = strings.getA11yStrings().controls;
    const fg = model.functionGenerator;

    const sourceSwitch = new RotarySwitch(
      model.sourceProperty,
      unionItems(SIGNAL_SOURCES, {
        functionGenerator: src.functionGeneratorStringProperty,
        audio: src.audioStringProperty,
      }),
      { radius: 20, captionStringProperty: src.titleStringProperty, accessibleName: controls.sourceStringProperty },
    );

    const waveformSwitch = new RotarySwitch(
      fg.waveformProperty,
      unionItems(WAVEFORMS, {
        sine: g.sineStringProperty,
        square: g.squareStringProperty,
        triangle: g.triangleStringProperty,
        sawtooth: g.sawtoothStringProperty,
        pulse: g.pulseStringProperty,
        noise: g.noiseStringProperty,
      }),
      { radius: 22, captionStringProperty: g.waveformStringProperty, accessibleName: controls.waveformStringProperty },
    );

    const frequencyKnob = new RotaryKnob(fg.frequencyProperty, FG_FREQUENCY_RANGE, {
      captionStringProperty: g.frequencyStringProperty,
      valueStringProperty: derivedString(fg.frequencyProperty, formatFrequency),
      accessibleName: controls.frequencyStringProperty,
      keyboardStep: 10,
      shiftKeyboardStep: 1,
      pageKeyboardStep: 100,
    });
    const amplitudeKnob = new RotaryKnob(fg.amplitudeProperty, FG_AMPLITUDE_RANGE, {
      captionStringProperty: g.amplitudeStringProperty,
      valueStringProperty: derivedString(fg.amplitudeProperty, formatVoltage),
      accessibleName: controls.amplitudeStringProperty,
    });
    const offsetKnob = new RotaryKnob(fg.offsetProperty, FG_OFFSET_RANGE, {
      captionStringProperty: g.offsetStringProperty,
      valueStringProperty: derivedString(fg.offsetProperty, formatVoltage),
      accessibleName: controls.offsetStringProperty,
    });
    const dutyKnob = new RotaryKnob(fg.dutyCycleProperty, FG_DUTY_CYCLE_RANGE, {
      captionStringProperty: g.dutyStringProperty,
      valueStringProperty: derivedString(fg.dutyCycleProperty, formatPercent),
      accessibleName: controls.dutyStringProperty,
    });
    const phaseKnob = new RotaryKnob(fg.phaseProperty, FG_PHASE_RANGE, {
      captionStringProperty: g.phaseStringProperty,
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
      font: new PhetFont({ size: 11, style: "italic" }),
      fill: OscilloscopeColors.textColorProperty,
      visibleProperty: new DerivedProperty([model.sourceProperty], (s) => s === "audio"),
    });

    const content = new VBox({
      align: "left",
      spacing: 10,
      children: [
        new Text(g.titleStringProperty, { font: HEADING_FONT, fill: OscilloscopeColors.textColorProperty }),
        new HBox({ spacing: 18, align: "top", children: [sourceSwitch, waveformSwitch] }),
        statusText,
        new HBox({ spacing: 12, align: "top", children: [frequencyKnob, amplitudeKnob, offsetKnob] }),
        new HBox({ spacing: 12, align: "top", children: [dutyKnob, phaseKnob] }),
      ],
    });

    super(content);

    this.sourceSwitch = sourceSwitch;
    this.waveformSwitch = waveformSwitch;
    this.frequencyKnob = frequencyKnob;
    this.amplitudeKnob = amplitudeKnob;
    this.offsetKnob = offsetKnob;
    this.dutyKnob = dutyKnob;
    this.phaseKnob = phaseKnob;
  }
}
