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

/**
 * Frequency of the internal AC-line ("mains") reference used by the `line` trigger
 * source, in hertz. Selecting LINE triggers the sweep on this fixed reference, so a
 * signal harmonically related to the mains stands still while an unrelated one rolls —
 * exactly how a bench scope's line trigger is used to look at hum.
 */
export const LINE_FREQUENCY = 60; // Hz

/**
 * Trigger holdoff, in seconds: a dead time after each accepted trigger during which
 * further triggers are ignored, used to stabilize waveforms with more than one edge
 * per cycle. Default 0 (disabled).
 */
export const SCOPE_TRIGGER_HOLDOFF_RANGE = new Range(0, 0.05); // s
export const SCOPE_DEFAULT_TRIGGER_HOLDOFF = 0; // s

/** Extra sweep magnification applied when the ×10 (zoom) button is engaged. */
export const SCOPE_MAGNIFY_FACTOR = 10;

// ── Delayed sweep (second timebase) ───────────────────────────────────────────
// A delayed sweep magnifies a small, delayed slice of the main sweep. The delay
// marker sits on the main trace (measured in main-sweep divisions from the left
// edge); the delayed time/div sets how far the slice is zoomed.

/** Default delayed time/div (a fast slice of the main sweep). */
export const SCOPE_DEFAULT_DELAYED_TIME_PER_DIV = 0.00005; // s/div (50 µs/div)

/** Position of the delay marker on the main sweep, in divisions from the left edge. */
export const SCOPE_DELAY_RANGE = new Range(0, HORIZONTAL_DIVISIONS); // div
export const SCOPE_DEFAULT_DELAY = HORIZONTAL_DIVISIONS / 2; // div (centered on the trigger)

// ── CRT beam controls (intensity / focus) ─────────────────────────────────────

/** Trace brightness: 1 is full phosphor glow, lower dims the whole trace layer. */
export const SCOPE_INTENSITY_RANGE = new Range(0.2, 1);
export const SCOPE_DEFAULT_INTENSITY = 0.9;

/** Beam focus: 1 is a sharp hairline; lower values thicken (defocus) the trace. */
export const SCOPE_FOCUS_RANGE = new Range(0, 1);
export const SCOPE_DEFAULT_FOCUS = 1;

/**
 * Probe attenuation factors offered on each channel's probe switch (×1 / ×10).
 * Tip voltage is always what the generator produces; ×10 scales the effective
 * volts/div so the same tip signal occupies 1/10 as many divisions — matching a
 * DSO that has been told a ×10 probe is attached.
 */
export const SCOPE_PROBE_FACTORS = [1, 10] as const;
export type ProbeFactor = (typeof SCOPE_PROBE_FACTORS)[number];

/**
 * Time constant (seconds) of the first-order high-pass that models AC coupling.
 * ~10 ms puts visible square-wave droop on the default educational timebases
 * without wiping out mid-audio tones.
 */
export const AC_COUPLING_TIME_CONSTANT = 0.01; // s

/**
 * Samples used to step the AC high-pass across one signal period when solving for
 * its periodic steady state (see `settleAcHighPass` in OscilloscopeModel). This
 * only needs to resolve one period of the waveform's shape, not the filter's
 * multi-period settling, which is solved in closed form.
 */
export const AC_STEADY_STATE_SAMPLES = 512;

/**
 * Samples used to scan one waveform period for the trigger crossing. The crossing
 * is then refined by linear interpolation, so this only bounds how narrow a
 * feature (e.g. a very low duty-cycle pulse) can be and still be found.
 */
export const TRIGGER_SEARCH_STEPS = 512;

/**
 * How many previous sweeps linger as fading "afterglow" ghosts when persistence is
 * engaged. A single ghost is invisible on a trigger-stationary trace (it lands
 * exactly under the live one), so the ghost chain has to be deep enough to show
 * the trace's recent history while a control is being turned.
 */
export const PERSISTENCE_SWEEPS = 8;

/** Keyboard step sizes for the draggable measurement cursors, in divisions. */
export const CURSOR_KEYBOARD_STEP = 0.1;
export const CURSOR_SHIFT_KEYBOARD_STEP = 0.01;
export const CURSOR_PAGE_KEYBOARD_STEP = 1;

/** Travel of the time cursors: the full width of the graticule, in divisions from the left edge. */
export const CURSOR_TIME_RANGE = new Range(0, HORIZONTAL_DIVISIONS); // div

/** Travel of the voltage cursors, in divisions above/below screen center. */
export const CURSOR_VOLT_RANGE = new Range(-VERTICAL_DIVISIONS / 2, VERTICAL_DIVISIONS / 2); // div

/**
 * Size of the microphone analyser FFT window (power of two, per Web Audio spec).
 *
 * This is also the scope's acquisition memory for the microphone: an `AnalyserNode`
 * hands back exactly this many of the most recent samples, so it bounds the longest
 * sweep the mic can honestly fill — `fftSize / sampleRate` seconds, ≈ 743 ms at
 * 44.1 kHz. 32768 is the maximum the Web Audio spec allows, and the model clamps
 * the timebase to match (see `microphoneMaxTimePerDivision`) rather than stretching
 * a shorter capture across a graticule that claims more time than it holds.
 */
export const AUDIO_FFT_SIZE = 32768;

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
