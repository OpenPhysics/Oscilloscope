/**
 * SimConstants.ts
 *
 * Central repository for every named numeric constant used across the
 * simulation. Bare numbers that carry semantic meaning (sizes, margins,
 * physics defaults, ranges) belong here rather than inline in model or view
 * code, so they are named, documented, and changed in one place.
 *
 * Conventions
 * ───────────
 *  - Physics / model values use SI units (metres, seconds, kilograms, …);
 *    note the unit in a comment on each value.
 *  - Layout / chrome values are in screen pixels.
 *  - Colour strings live in OscilloscopeColors.ts, not here.
 *  - Computed expressions (e.g. `2 * Math.PI`) may stay inline.
 */

import { Range } from "scenerystack/dot";
import OscilloscopeNamespace from "./OscilloscopeNamespace.js";

// ── Layout / chrome (screen pixels) ───────────────────────────────────────────

/** Margin between the screen edge and edge-anchored controls (e.g. Reset All). */
export const SCREEN_VIEW_MARGIN = 20;

/** Corner radius shared by control panels and dialogs. */
export const PANEL_CORNER_RADIUS = 6;

/** Vertical gap between stacked control panels on the right side of the screen. */
export const PANEL_SPACING = 12;

// ── Oscilloscope display geometry ─────────────────────────────────────────────

/** Number of horizontal graticule divisions (the classic scope has 10). */
export const HORIZONTAL_DIVISIONS = 10;

/** Number of vertical graticule divisions (the classic scope has 8). */
export const VERTICAL_DIVISIONS = 8;

/** Size of one graticule division, in screen pixels. */
export const DIVISION_SIZE = 56;

/** Full width of the display drawing area, in screen pixels. */
export const DISPLAY_WIDTH = HORIZONTAL_DIVISIONS * DIVISION_SIZE;

/** Full height of the display drawing area, in screen pixels. */
export const DISPLAY_HEIGHT = VERTICAL_DIVISIONS * DIVISION_SIZE;

/** Number of samples plotted across the width of the display (one per ~1 px). */
export const TRACE_SAMPLE_COUNT = DISPLAY_WIDTH;

// ── Function generator defaults / ranges (SI units) ───────────────────────────

/** Signal frequency in hertz. Audible-range default. */
export const FG_DEFAULT_FREQUENCY = 440; // Hz (concert A)
export const FG_FREQUENCY_RANGE = new Range(20, 2000); // Hz

/** Signal amplitude (zero-to-peak) in volts. */
export const FG_DEFAULT_AMPLITUDE = 1.0; // V
export const FG_AMPLITUDE_RANGE = new Range(0, 2.5); // V

// ── Oscilloscope control defaults / ranges ────────────────────────────────────

/** Vertical sensitivity: volts represented by one division. */
export const SCOPE_DEFAULT_VOLTS_PER_DIV = 0.5; // V/div
export const SCOPE_VOLTS_PER_DIV_RANGE = new Range(0.05, 2); // V/div

/** Standard 1-2-5 volts-per-division steps offered in the picker. */
export const SCOPE_VOLTS_PER_DIV_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2] as const; // V/div

/** Horizontal sensitivity: seconds represented by one division. */
export const SCOPE_DEFAULT_TIME_PER_DIV = 0.001; // s/div (1 ms/div)
export const SCOPE_TIME_PER_DIV_RANGE = new Range(0.0001, 0.02); // s/div

/** Standard 1-2-5 seconds-per-division steps offered in the picker. */
export const SCOPE_TIME_PER_DIV_STEPS = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02] as const; // s/div

/** Size of the microphone analyser FFT window (power of two, per Web Audio spec). */
export const AUDIO_FFT_SIZE = 2048;

OscilloscopeNamespace.register("SimConstants", {
  SCREEN_VIEW_MARGIN,
  PANEL_CORNER_RADIUS,
  PANEL_SPACING,
  HORIZONTAL_DIVISIONS,
  VERTICAL_DIVISIONS,
  DIVISION_SIZE,
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
  TRACE_SAMPLE_COUNT,
  FG_DEFAULT_FREQUENCY,
  FG_DEFAULT_AMPLITUDE,
  SCOPE_DEFAULT_VOLTS_PER_DIV,
  SCOPE_DEFAULT_TIME_PER_DIV,
  AUDIO_FFT_SIZE,
});
