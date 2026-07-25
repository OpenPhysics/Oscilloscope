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

// ── On-screen readout overlays (measurement + cursor panels) ──────────────────
// Shared chrome for the translucent readout panels floated over the CRT face, so
// the measurement and cursor overlays stay visually identical.

/** Font size of the overlay readout text, in points. */
export const READOUT_FONT_SIZE = 11;

/** Corner radius of the translucent readout backing, in screen pixels. */
export const READOUT_CORNER_RADIUS = 4;

/** Inset from the readout backing edge to its text grid, in screen pixels. */
export const READOUT_INSET = 8;

/** Horizontal / vertical padding added around the readout text grid, in screen pixels. */
export const READOUT_X_PADDING = 16;
export const READOUT_Y_PADDING = 12;

/** Column / row spacing inside the readout text grid, in screen pixels. */
export const READOUT_COLUMN_SPACING = 10;
export const READOUT_ROW_SPACING = 2;

// ── Function generator defaults / ranges (SI units) ───────────────────────────

/** Signal frequency in hertz. Audible-range default. */
export const FG_DEFAULT_FREQUENCY = 200; // Hz
export const FG_FREQUENCY_RANGE = new Range(1, 20000); // Hz

/** Signal amplitude (zero-to-peak) in volts. */
export const FG_DEFAULT_AMPLITUDE = 1.0; // V
export const FG_AMPLITUDE_RANGE = new Range(0, 5); // V

/** Vertical DC offset added to the generated signal, in volts. */
export const FG_DEFAULT_OFFSET = 0; // V
export const FG_OFFSET_RANGE = new Range(-5, 5); // V

/** Duty cycle (high-fraction) for the square / pulse waveforms, unitless [0,1]. */
export const FG_DEFAULT_DUTY_CYCLE = 0.5;
export const FG_DUTY_CYCLE_RANGE = new Range(0.05, 0.95);

/** Phase of CH2 relative to CH1, in degrees, for dual-channel phase comparisons. */
export const FG_DEFAULT_PHASE = 0; // degrees
export const FG_PHASE_RANGE = new Range(0, 360); // degrees

/** Amplitude of the optional additive Gaussian-ish noise, in volts. */
export const FG_DEFAULT_NOISE_AMPLITUDE = 0.15; // V
export const FG_NOISE_AMPLITUDE_RANGE = new Range(0, 1); // V

// ── Oscilloscope control defaults / ranges ────────────────────────────────────

/** Vertical sensitivity: volts represented by one division. */
export const SCOPE_DEFAULT_VOLTS_PER_DIV = 0.5; // V/div

/** Full 1-2-5 volts-per-division rotary-switch positions (5 mV/div … 5 V/div). */
export const SCOPE_VOLTS_PER_DIV_STEPS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5] as const; // V/div
export const SCOPE_VOLTS_PER_DIV_RANGE = new Range(0.005, 5); // V/div

/** Horizontal sensitivity: seconds represented by one division. */
export const SCOPE_DEFAULT_TIME_PER_DIV = 0.001; // s/div (1 ms/div)

/** Full 1-2-5 seconds-per-division rotary-switch positions (1 µs/div … 0.5 s/div). */
export const SCOPE_TIME_PER_DIV_STEPS = [
  0.000001, 0.000002, 0.000005, 0.00001, 0.00002, 0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02,
  0.05, 0.1, 0.2, 0.5,
] as const; // s/div
export const SCOPE_TIME_PER_DIV_RANGE = new Range(0.000001, 0.5); // s/div

/** Vertical trace position (offset), in divisions above/below center. */
export const SCOPE_POSITION_RANGE = new Range(-VERTICAL_DIVISIONS / 2, VERTICAL_DIVISIONS / 2); // div

/** Horizontal trace position (offset), in divisions left/right of center. */
export const SCOPE_HORIZONTAL_POSITION_RANGE = new Range(-HORIZONTAL_DIVISIONS / 2, HORIZONTAL_DIVISIONS / 2); // div

/** Trigger level, in volts. Kept wide so it stays reachable at any volts/div. */
export const SCOPE_TRIGGER_LEVEL_RANGE = new Range(-20, 20); // V

/** Extra sweep magnification applied when the ×10 (zoom) button is engaged. */
export const SCOPE_MAGNIFY_FACTOR = 10;

/**
 * Samples used to scan one waveform period for the trigger crossing. The crossing
 * is then refined by linear interpolation, so this only bounds how narrow a
 * feature (e.g. a very low duty-cycle pulse) can be and still be found.
 */
export const TRIGGER_SEARCH_STEPS = 512;

/** Keyboard step sizes for the draggable measurement cursors, in divisions. */
export const CURSOR_KEYBOARD_STEP = 0.1;
export const CURSOR_SHIFT_KEYBOARD_STEP = 0.01;
export const CURSOR_PAGE_KEYBOARD_STEP = 1;

/** Travel of the time cursors: the full width of the graticule, in divisions from the left edge. */
export const CURSOR_TIME_RANGE = new Range(0, HORIZONTAL_DIVISIONS); // div

/** Travel of the voltage cursors, in divisions above/below screen center. */
export const CURSOR_VOLT_RANGE = new Range(-VERTICAL_DIVISIONS / 2, VERTICAL_DIVISIONS / 2); // div

/** Size of the microphone analyser FFT window (power of two, per Web Audio spec). */
export const AUDIO_FFT_SIZE = 2048;

OscilloscopeNamespace.register("SimConstants", {
  SCREEN_VIEW_MARGIN,
  PANEL_CORNER_RADIUS,
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
