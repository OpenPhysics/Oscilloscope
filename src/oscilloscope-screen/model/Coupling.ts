/**
 * Coupling.ts
 *
 * How a vertical channel is coupled to its input, exactly like the AC / DC / GND
 * switch on a real oscilloscope's front panel:
 *
 *   - DC  — the signal is displayed as-is (including any DC offset).
 *   - AC  — the average (DC) component is removed, so only the AC part is shown.
 *   - GND — the input is disconnected and a flat ground reference is displayed.
 */

/** The channel input-coupling modes, in front-panel switch order. */
export const COUPLINGS = ["DC", "AC", "GND"] as const;

/** A single input-coupling mode. */
export type Coupling = (typeof COUPLINGS)[number];
