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
export function meanOf(buffer: Float32Array): number {
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

/**
 * Estimates duty cycle (high-time fraction in [0, 1]) from a buffer by measuring
 * the fraction of samples above the mean. Returns 0 for a flat or empty buffer.
 */
export function estimateDutyCycle(buffer: Float32Array): number {
  if (buffer.length === 0) {
    return 0;
  }
  const mean = meanOf(buffer);
  let high = 0;
  let swings = false;
  for (const v of buffer) {
    if (v > mean) {
      high++;
    }
    if (v !== mean) {
      swings = true;
    }
  }
  return swings ? high / buffer.length : 0;
}

/**
 * 10%–90% rise time (seconds) of the first rising edge found in `buffer`.
 * Returns 0 when no qualifying edge exists.
 */
export function estimateRiseTime(buffer: Float32Array, windowSeconds: number): number {
  return estimateEdgeTime(buffer, windowSeconds, "rise");
}

/** 90%–10% fall time (seconds) of the first falling edge found in `buffer`. */
export function estimateFallTime(buffer: Float32Array, windowSeconds: number): number {
  return estimateEdgeTime(buffer, windowSeconds, "fall");
}

/** Locates the first index where `buffer` crosses `level` in the given direction. */
function crossingIndex(buffer: Float32Array, level: number, rising: boolean, fromIndex: number): number {
  for (let i = Math.max(1, fromIndex); i < buffer.length; i++) {
    const prev = buffer[i - 1] ?? 0;
    const curr = buffer[i] ?? 0;
    if (rising ? prev < level && curr >= level : prev > level && curr <= level) {
      return i;
    }
  }
  return -1;
}

function interpolateCrossing(buffer: Float32Array, i: number, level: number): number {
  const prev = buffer[i - 1] ?? 0;
  const curr = buffer[i] ?? 0;
  return i - 1 + (level - prev) / (curr - prev || 1);
}

function estimateEdgeTime(buffer: Float32Array, windowSeconds: number, kind: "rise" | "fall"): number {
  const n = buffer.length;
  if (n < 2 || windowSeconds <= 0) {
    return 0;
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of buffer) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const span = max - min;
  if (!(span > 0)) {
    return 0;
  }
  const lo = min + 0.1 * span;
  const hi = min + 0.9 * span;
  const rising = kind === "rise";
  const startLevel = rising ? lo : hi;
  const endLevel = rising ? hi : lo;
  const startAt = crossingIndex(buffer, startLevel, rising, 1);
  if (startAt < 0) {
    return 0;
  }
  const endAt = crossingIndex(buffer, endLevel, rising, startAt);
  if (endAt < 0) {
    return 0;
  }
  const start = interpolateCrossing(buffer, startAt, startLevel);
  const end = interpolateCrossing(buffer, endAt, endLevel);
  return Math.max(0, (end - start) * (windowSeconds / (n - 1)));
}

/**
 * Phase of `b` relative to `a`, in degrees on [0, 360). Uses the delay between
 * corresponding rising mean-crossings. Returns 0 when either buffer lacks a
 * usable period.
 */
export function estimatePhaseDegrees(a: Float32Array, b: Float32Array, windowSeconds: number): number {
  if (a.length < 2 || b.length < 2 || a.length !== b.length || windowSeconds <= 0) {
    return 0;
  }
  const freq = estimateFrequency(a, windowSeconds);
  if (freq <= 0) {
    return 0;
  }
  const periodSamples = (a.length - 1) / (freq * windowSeconds);
  if (!(periodSamples > 0)) {
    return 0;
  }
  const aRising = findMeanCrossings(a, meanOf(a)).rising;
  const bRising = findMeanCrossings(b, meanOf(b)).rising;
  if (aRising.count < 1 || bRising.count < 1) {
    return 0;
  }
  let delta = bRising.first - aRising.first;
  // Wrap into [0, period).
  delta = ((delta % periodSamples) + periodSamples) % periodSamples;
  return (delta / periodSamples) * 360;
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
