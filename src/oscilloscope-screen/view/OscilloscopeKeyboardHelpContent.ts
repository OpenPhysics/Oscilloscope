/**
 * OscilloscopeKeyboardHelpContent.ts
 *
 * Content for the keyboard-help dialog (the "?" button in the navigation bar).
 * The oscilloscope adds sliders (frequency, amplitude) alongside the basic
 * button / combo-box actions, so both a slider section and a basic-actions
 * section are shown.
 */

import {
  BasicActionsKeyboardHelpSection,
  SliderControlsKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";

export class OscilloscopeKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    super([new SliderControlsKeyboardHelpSection()], [new BasicActionsKeyboardHelpSection()]);
  }
}
