/**
 * measurementUtils.ts
 *
 * Small pure helpers backing the screen view's live measurements and Autoset.
 * They are dependency-free so they can be unit-tested in isolation from the
 * SceneryStack view they normally run inside.
 */

/**
 * Estimates a periodic signal's frequency (Hz) by counting rising mean-crossings
 * across a captured buffer that spans `windowSeconds` of real time. Returns 0 for
 * a degenerate buffer or non-positive window.
 */
export function estimateFrequency(buffer: Float32Array, windowSeconds: number): number {
  const n = buffer.length;
  if (n < 2 || windowSeconds <= 0) {
    return 0;
  }
  let mean = 0;
  for (const v of buffer) {
    mean += v;
  }
  mean /= n;
  let crossings = 0;
  for (let i = 1; i < n; i++) {
    const prev = (buffer[i - 1] ?? 0) - mean;
    const curr = (buffer[i] ?? 0) - mean;
    if (prev < 0 && curr >= 0) {
      crossings++;
    }
  }
  return crossings / windowSeconds;
}

/** The value in `steps` closest to `target`. Falls back to `target` for an empty list. */
export function nearestStep(steps: readonly number[], target: number): number {
  let best = steps[0] ?? target;
  let bestDist = Math.abs(best - target);
  for (const step of steps) {
    const dist = Math.abs(step - target);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}
