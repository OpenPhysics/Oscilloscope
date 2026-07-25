/**
 * Waveform.ts
 *
 * The set of waveforms the function generator can synthesize, plus a pure
 * helper that evaluates the normalized shape of each one.
 *
 * A "waveform sample" is dimensionless and bounded to [-1, 1]; the function
 * generator multiplies it by its amplitude (in volts) to produce a voltage.
 */

/** All function-generator waveform shapes, in display order. */
export const WAVEFORMS = ["sine", "square", "triangle", "sawtooth", "pulse", "noise"] as const;

/** A single waveform shape. */
export type Waveform = (typeof WAVEFORMS)[number];

/**
 * Evaluates the normalized shape of `waveform` at a given phase.
 *
 * @param waveform - the shape to evaluate
 * @param phase - cycles elapsed (integer part is ignored; only the fraction matters)
 * @param duty - high-fraction for square / pulse (defaults to 0.5); ignored otherwise
 * @returns a value in [-1, 1]
 */
export function waveformSample(waveform: Waveform, phase: number, duty = 0.5): number {
  // Noise is aperiodic — a fresh pseudo-random sample every call.
  if (waveform === "noise") {
    // Sum of uniforms → roughly bell-shaped, scaled back into [-1, 1].
    return Math.max(-1, Math.min(1, (Math.random() + Math.random() + Math.random() - 1.5) / 1.5));
  }

  // Wrap into the [0, 1) fundamental period.
  const p = phase - Math.floor(phase);

  switch (waveform) {
    case "sine":
      return Math.sin(2 * Math.PI * p);
    case "square":
      return p < duty ? 1 : -1;
    case "pulse":
      // Like square but returns to a 0 baseline, giving a unipolar pulse train.
      return p < duty ? 1 : 0;
    case "triangle":
      // Rises 0→1 over [0, 0.25], falls 1→-1 over [0.25, 0.75], rises -1→0 over [0.75, 1).
      if (p < 0.25) {
        return 4 * p;
      }
      if (p < 0.75) {
        return 2 - 4 * p;
      }
      return 4 * p - 4;
    case "sawtooth":
      // Rising ramp from -1 to 1 across one period.
      return 2 * p - 1;
  }
}

/**
 * The exact mean (DC component) of one full period of `waveform`, in the same
 * normalized units as {@link waveformSample}.
 *
 * AC coupling needs the signal's true DC component. Estimating it from the mean
 * of whatever happens to be on screen makes the baseline wander whenever the
 * time/div knob changes the number of cycles in the window, so the per-period
 * mean is derived analytically here instead. Only the duty-cycle waveforms have
 * a non-zero mean: `square` averages `2·duty − 1` and `pulse` averages `duty`;
 * sine, triangle, sawtooth, and zero-mean noise all integrate to 0 over a period.
 *
 * @param waveform - the shape to evaluate
 * @param duty - high-fraction for square / pulse (defaults to 0.5); ignored otherwise
 * @returns the mean value over one period, in [-1, 1]
 */
export function waveformMean(waveform: Waveform, duty = 0.5): number {
  switch (waveform) {
    case "square":
      return 2 * duty - 1;
    case "pulse":
      return duty;
    default:
      return 0;
  }
}
