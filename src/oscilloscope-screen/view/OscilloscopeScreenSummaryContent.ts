/**
 * OscilloscopeScreenSummaryContent.ts
 *
 * The accessible screen summary read by screen readers. Its "current details"
 * paragraph is a LIVE, localized description derived from model state — the
 * canonical OpenPhysics pattern — so a non-visual user can re-read what the
 * oscilloscope is currently showing at any time.
 */
import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { ScreenSummaryContent } from "scenerystack/sim";
import { StringManager } from "../../i18n/StringManager.js";
import type { ChannelInput } from "../model/ChannelInput.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";

function describeChannelInput(
  input: ChannelInput,
  channel: 1 | 2,
  fgDetails: string,
  audioActive: string,
  audioInactive: string,
  unconnectedPattern: (channel: number) => string,
  micActive: boolean,
): string {
  if (input === "none") {
    return unconnectedPattern(channel);
  }
  if (input === "microphone") {
    return micActive ? audioActive : audioInactive;
  }
  return fgDetails.replace("{{channel}}", String(channel));
}

export class OscilloscopeScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: OscilloscopeModel) {
    const strings = StringManager.getInstance();
    const a11y = strings.getA11yStrings();
    const fgStrings = strings.getGenerator();
    const details = a11y.currentDetails;
    const fg = model.functionGenerator;

    const waveformNameProperty = new DerivedProperty(
      [
        fg.waveformProperty,
        fgStrings.sineStringProperty,
        fgStrings.squareStringProperty,
        fgStrings.triangleStringProperty,
        fgStrings.sawtoothStringProperty,
        fgStrings.pulseStringProperty,
        fgStrings.noiseStringProperty,
      ],
      (waveform, sine, square, triangle, sawtooth, pulse, noise) => {
        const map = { sine, square, triangle, sawtooth, pulse, noise };
        return map[waveform];
      },
    );

    const functionGeneratorDetails = new PatternStringProperty(
      details.functionGeneratorStringProperty,
      {
        channel: new DerivedProperty([model.ch1.inputProperty, model.ch2.inputProperty], (a, b) => {
          if (a === "functionGeneratorA" || a === "functionGeneratorB") {
            return 1;
          }
          if (b === "functionGeneratorA" || b === "functionGeneratorB") {
            return 2;
          }
          return 1;
        }),
        waveform: waveformNameProperty,
        frequency: fg.frequencyProperty,
        amplitude: fg.amplitudeProperty,
      },
      { decimalPlaces: { channel: 0, waveform: null, frequency: 0, amplitude: 2 } },
    );

    const unconnectedCh1 = new PatternStringProperty(
      details.unconnectedStringProperty,
      { channel: 1 },
      { decimalPlaces: { channel: 0 } },
    );
    const unconnectedCh2 = new PatternStringProperty(
      details.unconnectedStringProperty,
      { channel: 2 },
      { decimalPlaces: { channel: 0 } },
    );

    const currentDetailsProperty = new DerivedProperty(
      [
        model.ch1.inputProperty,
        model.ch2.inputProperty,
        model.audioInput.statusProperty,
        functionGeneratorDetails,
        details.audioActiveStringProperty,
        details.audioInactiveStringProperty,
        unconnectedCh1,
        unconnectedCh2,
      ],
      (ch1In, ch2In, status, fgDetails, audioActive, audioInactive, unc1, unc2) => {
        const micActive = status === "active";
        const parts: string[] = [];
        parts.push(describeChannelInput(ch1In, 1, fgDetails, audioActive, audioInactive, () => unc1, micActive));
        if (ch2In !== "none" || model.ch2.enabledProperty.value) {
          parts.push(describeChannelInput(ch2In, 2, fgDetails, audioActive, audioInactive, () => unc2, micActive));
        }
        return parts.join(" ");
      },
    );

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: currentDetailsProperty,
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });
  }
}
