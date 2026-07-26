/**
 * labActivities.ts
 *
 * Scripted classroom challenges that configure the scope and generator so a
 * student can practice a single bench skill (measure Vpp, get a Normal trigger,
 * find a harmonic, match a 90° Lissajous). Pure functions over the model — the
 * dialog just lists them and calls {@link apply}.
 */

import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";

export type LabActivityId = "measureVpp" | "normalTrigger" | "thirdHarmonic" | "lissajous90";

export type LabActivity = {
  readonly id: LabActivityId;
  /** Applies the activity's starting instrument state. */
  readonly apply: (model: OscilloscopeModel) => void;
};

/**
 * Configure a clean square wave so students can count divisions for Vpp.
 * CH1 on, DC, ×1 probe, Auto trigger, Y-T.
 */
function applyMeasureVpp(model: OscilloscopeModel): void {
  resetCommon(model);
  model.functionGenerator.waveformProperty.value = "square";
  model.functionGenerator.frequencyProperty.value = 200;
  model.functionGenerator.amplitudeProperty.value = 1;
  model.functionGenerator.offsetProperty.value = 0;
  model.functionGenerator.dutyCycleProperty.value = 0.5;
  model.ch1.voltsPerDivisionProperty.value = 0.5;
  model.timePerDivisionProperty.value = 0.001;
  model.trigger.modeProperty.value = "auto";
  model.trigger.levelProperty.value = 0;
}

/**
 * Put the trigger in Normal with the level above the peaks so the screen holds
 * until the student lowers the level onto the waveform.
 */
function applyNormalTrigger(model: OscilloscopeModel): void {
  resetCommon(model);
  model.functionGenerator.waveformProperty.value = "sine";
  model.functionGenerator.frequencyProperty.value = 200;
  model.functionGenerator.amplitudeProperty.value = 1;
  model.functionGenerator.offsetProperty.value = 0;
  model.ch1.voltsPerDivisionProperty.value = 0.5;
  model.timePerDivisionProperty.value = 0.001;
  model.trigger.modeProperty.value = "normal";
  model.trigger.slopeProperty.value = "rising";
  model.trigger.levelProperty.value = 1.5; // above ±1 V peaks → held until lowered
  model.refresh();
}

/**
 * Square wave in FFT mode so the odd-harmonic comb is visible; students hunt
 * for the third harmonic with frequency cursors.
 */
function applyThirdHarmonic(model: OscilloscopeModel): void {
  resetCommon(model);
  model.functionGenerator.waveformProperty.value = "square";
  model.functionGenerator.frequencyProperty.value = 500;
  model.functionGenerator.amplitudeProperty.value = 1;
  model.functionGenerator.offsetProperty.value = 0;
  model.functionGenerator.dutyCycleProperty.value = 0.5;
  model.ch1.voltsPerDivisionProperty.value = 0.5;
  model.timePerDivisionProperty.value = 0.002;
  model.displayModeProperty.value = "fft";
  model.cursorsEnabledProperty.value = true;
  model.cursorTime1Property.value = 2;
  model.cursorTime2Property.value = 6;
  model.trigger.modeProperty.value = "auto";
}

/**
 * Dual-channel X-Y with OUT B at 90° for a circle Lissajous figure.
 */
function applyLissajous90(model: OscilloscopeModel): void {
  resetCommon(model);
  model.functionGenerator.waveformProperty.value = "sine";
  model.functionGenerator.frequencyProperty.value = 200;
  model.functionGenerator.amplitudeProperty.value = 1;
  model.functionGenerator.offsetProperty.value = 0;
  model.functionGenerator.phaseProperty.value = 90;
  model.connectJack(2, "functionGeneratorB");
  model.ch2.enabledProperty.value = true;
  model.ch1.voltsPerDivisionProperty.value = 0.5;
  model.ch2.voltsPerDivisionProperty.value = 0.5;
  model.displayModeProperty.value = "xy";
  model.trigger.modeProperty.value = "auto";
}

function resetCommon(model: OscilloscopeModel): void {
  model.timer.isPlayingProperty.value = true;
  model.displayModeProperty.value = "yt";
  model.magnifyProperty.value = false;
  model.horizontalPositionProperty.value = 0;
  model.mathModeProperty.value = "off";
  model.cursorsEnabledProperty.value = false;
  model.persistenceProperty.value = false;
  model.connectJack(1, "functionGeneratorA");
  model.disconnectChannel(2);
  model.ch1.enabledProperty.value = true;
  model.ch2.enabledProperty.value = false;
  model.ch1.couplingProperty.value = "DC";
  model.ch2.couplingProperty.value = "DC";
  model.ch1.invertedProperty.value = false;
  model.ch2.invertedProperty.value = false;
  model.ch1.probeProperty.value = 1;
  model.ch2.probeProperty.value = 1;
  model.ch1.positionProperty.value = 0;
  model.ch2.positionProperty.value = 0;
  model.trigger.sourceProperty.value = "ch1";
  model.trigger.slopeProperty.value = "rising";
}

export const LAB_ACTIVITIES: readonly LabActivity[] = [
  { id: "measureVpp", apply: applyMeasureVpp },
  { id: "normalTrigger", apply: applyNormalTrigger },
  { id: "thirdHarmonic", apply: applyThirdHarmonic },
  { id: "lissajous90", apply: applyLissajous90 },
];
