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
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";

export class OscilloscopeScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: OscilloscopeModel) {
    const strings = StringManager.getInstance();
    const a11y = strings.getA11yStrings();
    const fgStrings = strings.getGenerator();
    const details = a11y.currentDetails;
    const fg = model.functionGenerator;

    // Localized waveform name that tracks the selected waveform.
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

    // Sentence describing the function-generator source, with live values.
    //
    // `decimalPlaces` is required: it defaults to null, which formats the raw
    // number. The knobs are continuous, so a dragged frequency is a value like
    // 1018.1409090909092 — fine for the model, but a screen reader would read
    // every digit aloud. The visible readouts round via formatUnits; these match.
    const functionGeneratorDetails = new PatternStringProperty(
      details.functionGeneratorStringProperty,
      {
        waveform: waveformNameProperty,
        frequency: fg.frequencyProperty,
        amplitude: fg.amplitudeProperty,
      },
      { decimalPlaces: { waveform: null, frequency: 0, amplitude: 2 } },
    );

    // Switch between the function-generator sentence and the microphone sentences.
    const currentDetailsProperty = new DerivedProperty(
      [
        model.sourceProperty,
        model.audioInput.statusProperty,
        functionGeneratorDetails,
        details.audioActiveStringProperty,
        details.audioInactiveStringProperty,
      ],
      (source, status, fgDetails, audioActive, audioInactive) => {
        if (source === "functionGenerator") {
          return fgDetails;
        }
        return status === "active" ? audioActive : audioInactive;
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
