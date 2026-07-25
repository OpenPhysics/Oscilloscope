/**
 * measurementUtils.ts
 *
 * Small pure helpers backing the screen view's live measurements and Autoset.
 * They are dependency-free so they can be unit-tested in isolation from the
 * SceneryStack view they normally run inside.
 */

/** Where a run of like-signed mean-crossings starts and ends, and how many there were. */
type CrossingSpan = {
  /** Sub-sample index of the first crossing, or -1 when there were none. */
  first: number;
  /** Sub-sample index of the last crossing, or -1 when there were none. */
  last: number;
  count: number;
};

/** The arithmetic mean of `buffer` (0 for an empty buffer). */
function meanOf(buffer: Float32Array): number {
  if (buffer.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const v of buffer) {
    sum += v;
  }
  return sum / buffer.length;
}

/**
 * Locates the buffer's mean-crossings to sub-sample precision.
 *
 * @returns `rising` spans only the upward crossings (a whole period apart, so it
 *   is exact for any waveform) and `all` spans every crossing in both directions
 *   (half a period apart for a symmetric waveform, which keeps short captures
 *   measurable).
 */
function findMeanCrossings(buffer: Float32Array, mean: number): { rising: CrossingSpan; all: CrossingSpan } {
  const rising: CrossingSpan = { first: -1, last: -1, count: 0 };
  const all: CrossingSpan = { first: -1, last: -1, count: 0 };

  const record = (span: CrossingSpan, position: number): void => {
    if (span.count === 0) {
      span.first = position;
    }
    span.last = position;
    span.count++;
  };

  for (let i = 1; i < buffer.length; i++) {
    const prev = (buffer[i - 1] ?? 0) - mean;
    const curr = (buffer[i] ?? 0) - mean;
    const isRising = prev < 0 && curr >= 0;
    if (!(isRising || (prev >= 0 && curr < 0))) {
      continue;
    }

    // Interpolate where the segment actually crosses the mean.
    const position = i - 1 + prev / (prev - curr);
    record(all, position);
    if (isRising) {
      record(rising, position);
    }
  }

  return { rising, all };
}

/**
 * Estimates a periodic signal's frequency (Hz) from a captured buffer spanning
 * `windowSeconds` of real time. Returns 0 for a degenerate buffer, a non-positive
 * window, or a signal with fewer than two rising mean-crossings.
 *
 * Frequency is taken from the elapsed time *between the first and last rising
 * mean-crossing*, with each crossing located to sub-sample precision by linear
 * interpolation. Simply counting whole crossings and dividing by the window would
 * quantize the result to 1/windowSeconds — at the default 1 ms/div that is a
 * 100 Hz grid, which reports a 200 Hz tone as 100 Hz or 300 Hz depending on where
 * the capture happens to start. Measuring crossing-to-crossing removes both the
 * quantization and the partial cycle at each end of the window.
 */
export function estimateFrequency(buffer: Float32Array, windowSeconds: number): number {
  const n = buffer.length;
  if (n < 2 || windowSeconds <= 0) {
    return 0;
  }

  const { rising, all } = findMeanCrossings(buffer, meanOf(buffer));

  // The samples span `windowSeconds` across n-1 intervals.
  const secondsPerSample = windowSeconds / (n - 1);

  /** Frequency from a span covering `periodsPerGap` periods between crossings. */
  const frequencyFrom = (span: CrossingSpan, periodsPerGap: number): number => {
    if (span.count < 2 || span.last <= span.first) {
      return 0;
    }
    const elapsed = (span.last - span.first) * secondsPerSample;
    return elapsed > 0 ? ((span.count - 1) * periodsPerGap) / elapsed : 0;
  };

  // Preferred: whole periods between like-signed crossings. Exact even for a
  // waveform whose high and low halves differ in length (a low duty-cycle pulse).
  const fromRising = frequencyFrom(rising, 1);
  if (fromRising > 0) {
    return fromRising;
  }

  // Fallback for captures too short to hold two rising edges (e.g. exactly two
  // cycles on screen, where those edges land on the window boundaries).
  // Consecutive crossings are half a period apart for a symmetric waveform.
  return frequencyFrom(all, 0.5);
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
