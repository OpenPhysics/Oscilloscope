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
  fgDetails: string,
  audioActive: string,
  audioInactive: string,
  unconnected: string,
  micActive: boolean,
): string {
  if (input === "none") {
    return unconnected;
  }
  if (input === "microphone") {
    return micActive ? audioActive : audioInactive;
  }
  return fgDetails;
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

    // One PatternStringProperty per channel so {{channel}} is correct when both
    // BNCs are patched to the generator — a shared string already filled for
    // "whichever channel has FG" left the wrong number on the second channel.
    const functionGeneratorDetailsCh1 = new PatternStringProperty(
      details.functionGeneratorStringProperty,
      {
        channel: 1,
        waveform: waveformNameProperty,
        frequency: fg.frequencyProperty,
        amplitude: fg.amplitudeProperty,
      },
      { decimalPlaces: { channel: 0, waveform: null, frequency: 0, amplitude: 2 } },
    );
    const functionGeneratorDetailsCh2 = new PatternStringProperty(
      details.functionGeneratorStringProperty,
      {
        channel: 2,
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
        functionGeneratorDetailsCh1,
        functionGeneratorDetailsCh2,
        details.audioActiveStringProperty,
        details.audioInactiveStringProperty,
        unconnectedCh1,
        unconnectedCh2,
      ],
      (ch1In, ch2In, status, fg1, fg2, audioActive, audioInactive, unc1, unc2) => {
        const micActive = status === "active";
        const parts: string[] = [];
        parts.push(describeChannelInput(ch1In, fg1, audioActive, audioInactive, unc1, micActive));
        if (ch2In !== "none" || model.ch2.enabledProperty.value) {
          parts.push(describeChannelInput(ch2In, fg2, audioActive, audioInactive, unc2, micActive));
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
