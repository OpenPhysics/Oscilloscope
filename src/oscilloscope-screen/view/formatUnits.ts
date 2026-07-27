/**
 * formatUnits.ts
 *
 * Small pure formatters that turn SI quantities into short, scope-style labels
 * with engineering-friendly units (mV / V, µs / ms, Hz / kHz). Used by the
 * volts/div and time/div pickers and by the on-screen measurement readout.
 *
 * Unit *symbols* (V, Hz, s, …) are internationally standardized and are not
 * translated; only the surrounding sentence labels are localized.
 *
 * All rounding goes through `toFixed` from `scenerystack/dot` rather than the
 * native `Number.prototype.toFixed`, which rounds inconsistently across browsers.
 */

import { toFixed } from "scenerystack/dot";

/** Formats a number with at most `dp` decimals, dropping trailing zeros. */
function trim(value: number, dp = 3): string {
  return String(Number(toFixed(value, dp)));
}

/** e.g. 0.05 → "50 mV/div", 0.5 → "500 mV/div", 2 → "2 V/div". */
export function formatVoltsPerDiv(voltsPerDiv: number): string {
  return voltsPerDiv >= 1 ? `${trim(voltsPerDiv)} V/div` : `${trim(voltsPerDiv * 1000)} mV/div`;
}

/** e.g. 0.0001 → "100 µs/div", 0.001 → "1 ms/div", 0.02 → "20 ms/div". */
export function formatTimePerDiv(timePerDiv: number): string {
  return timePerDiv >= 1e-3 ? `${trim(timePerDiv * 1e3)} ms/div` : `${trim(timePerDiv * 1e6)} µs/div`;
}

/** e.g. 440 → "440 Hz", 1500 → "1.5 kHz". */
export function formatFrequency(hz: number): string {
  return hz >= 1000 ? `${trim(hz / 1000, 2)} kHz` : `${trim(hz, 0)} Hz`;
}

/** e.g. 0.00227 → "2.27 ms", 0.0005 → "500 µs". */
export function formatPeriod(seconds: number): string {
  if (seconds >= 1e-3) {
    return `${trim(seconds * 1e3, 2)} ms`;
  }
  if (seconds >= 1e-6) {
    return `${trim(seconds * 1e6, 1)} µs`;
  }
  return `${trim(seconds * 1e9, 0)} ns`;
}

/** e.g. 2 → "2.00 V". */
export function formatVoltage(volts: number): string {
  return `${toFixed(volts, 2)} V`;
}

/** e.g. 0.5 → "50%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** e.g. 90 → "90°". */
export function formatDegrees(degrees: number): string {
  return `${Math.round(degrees)}°`;
}

/** Screen-position readout in graticule divisions, e.g. -1.5 → "-1.50 div". */
export function formatDivisions(divisions: number): string {
  return `${toFixed(divisions, 2)} div`;
}

/** Trigger holdoff readout: "Off" at zero, otherwise a time (µs / ms). */
export function formatHoldoff(seconds: number): string {
  return seconds <= 0 ? "Off" : formatPeriod(seconds);
}
