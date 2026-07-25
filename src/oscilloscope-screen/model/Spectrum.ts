/**
 * Spectrum.ts
 *
 * A small, dependency-free FFT used by the oscilloscope's FFT / spectrum display
 * mode. It applies a Hann window to the sampled trace and computes the
 * single-sided magnitude spectrum with an in-place iterative radix-2 FFT.
 *
 * The result is normalized to [0, 1] (relative to the largest bin), which is all
 * the display needs to draw a spectrum trace scaled to the screen.
 */

/** The largest power of two that is ≤ `n` (and ≥ 1). */
export function largestPowerOfTwoAtMost(n: number): number {
  let size = 1;
  while (size * 2 <= n) {
    size *= 2;
  }
  return size;
}

/**
 * Reusable working buffers for {@link computeMagnitudeSpectrum}.
 *
 * The spectrum is recomputed every animation frame while the FFT display mode is
 * on, so a caller in that hot path should allocate one of these once and pass it
 * back in rather than churning three typed arrays per frame.
 */
export type SpectrumScratch = {
  readonly re: Float64Array;
  readonly im: Float64Array;
  readonly magnitudes: Float32Array;
};

/** Allocates scratch sized for a transform of `size` points (a power of two). */
export function createSpectrumScratch(size: number): SpectrumScratch {
  return {
    re: new Float64Array(size),
    im: new Float64Array(size),
    magnitudes: new Float32Array(size / 2),
  };
}

/**
 * Computes the normalized single-sided magnitude spectrum of `samples`.
 *
 * @param samples - real-valued time-domain samples (e.g. a trace buffer)
 * @param scratch - optional working buffers to reuse; must be sized for
 *   `largestPowerOfTwoAtMost(samples.length)`, otherwise it is ignored and fresh
 *   arrays are allocated. When supplied, the returned array *is* `scratch.magnitudes`
 *   and is overwritten by the next call.
 * @returns magnitudes for bins 0 … N/2-1, normalized so the peak bin is 1
 */
export function computeMagnitudeSpectrum(samples: Float32Array, scratch?: SpectrumScratch): Float32Array {
  const size = largestPowerOfTwoAtMost(samples.length);
  if (size < 2) {
    return new Float32Array(1);
  }

  const half = size / 2;
  const usable =
    scratch !== undefined &&
    scratch.re.length === size &&
    scratch.im.length === size &&
    scratch.magnitudes.length === half
      ? scratch
      : null;

  const re = usable ? usable.re : new Float64Array(size);
  const im = usable ? usable.im : new Float64Array(size);
  const mag = usable ? usable.magnitudes : new Float32Array(half);
  if (usable) {
    im.fill(0);
  }

  // Periodic Hann window (dividing by `size`, not `size - 1`): the record is
  // treated as one period of a periodic signal, which is what the DFT assumes, so
  // this is the form that actually minimizes leakage between bins.
  for (let i = 0; i < size; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
    re[i] = (samples[i] ?? 0) * w;
  }

  fftInPlace(re, im);

  let max = 0;
  for (let k = 0; k < half; k++) {
    const m = Math.hypot(re[k] ?? 0, im[k] ?? 0);
    mag[k] = m;
    if (m > max) {
      max = m;
    }
  }
  if (max > 0) {
    for (let k = 0; k < half; k++) {
      mag[k] = (mag[k] ?? 0) / max;
    }
  }
  return mag;
}

/** In-place iterative Cooley-Tukey radix-2 FFT. `re`/`im` length must be a power of two. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0;
      re[i] = re[j] ?? 0;
      re[j] = tr;
      const ti = im[i] ?? 0;
      im[i] = im[j] ?? 0;
      im[j] = ti;
    }
  }

  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curR = 1;
      let curI = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const reB = re[b] ?? 0;
        const imB = im[b] ?? 0;
        const tr = curR * reB - curI * imB;
        const ti = curR * imB + curI * reB;
        re[b] = (re[a] ?? 0) - tr;
        im[b] = (im[a] ?? 0) - ti;
        re[a] = (re[a] ?? 0) + tr;
        im[a] = (im[a] ?? 0) + ti;
        const nextR = curR * wr - curI * wi;
        curI = curR * wi + curI * wr;
        curR = nextR;
      }
    }
  }
}
