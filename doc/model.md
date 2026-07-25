# Model - Oscilloscope

This document describes the model (the underlying physics, math, and behavior) for the simulation, in
terms appropriate for an educator. It is the companion to
[implementation-notes.md](./implementation-notes.md), which targets developers.

## Overview

The simulation is a working bench oscilloscope wired to a working function generator. A signal of a
chosen shape, frequency, amplitude, and DC offset is fed into channel 1; the scope samples it and
draws voltage against time on a graticule of 10 horizontal by 8 vertical divisions.

The ideas a student should take away are the ones a real scope teaches:

- **A scope trades one axis for another.** The vertical knob sets *volts per division*, the
  horizontal knob sets *seconds per division*. Nothing about the signal changes when you turn them —
  only how much of it fits on screen. Reading a measurement means counting divisions and multiplying.
- **A trace only stands still if it is triggered.** The scope redraws the sweep from the same point
  on the waveform each time — the instant the voltage crosses a chosen *level* on a chosen *slope*.
  Set the level above the signal's peak and the waveform can never be caught: it free-runs, or (in
  normal mode) the screen simply holds the last thing it caught. This is the single most common
  source of confusion at a real bench, and the simulation reproduces it faithfully.
- **Coupling decides whether you see the DC.** In DC coupling you see the signal as it is. In AC
  coupling the constant part is removed and the trace re-centers, which is how you examine a small
  ripple riding on a large steady voltage. GND disconnects the input and shows you where zero is.
- **Two channels let you compare.** Channel 2 carries the same generator signal with an adjustable
  phase shift, so students can see phase difference directly, add or subtract the two channels, or
  plot one against the other (X-Y) to get Lissajous figures.

The frequency-domain view (FFT) shows the same signal decomposed into its component frequencies — a
sine has one spike, a square wave has a spike at the fundamental plus odd harmonics.

Channel 1 can alternatively be fed from the computer's **microphone**, so a whistle, a tuning fork,
or a voice becomes a live trace.

## Quantities and units

All model quantities are SI. Ranges below are enforced by `Range` objects in `src/SimConstants.ts`.

| Quantity | Symbol | Units | Range | Default |
|---|---|---|---|---|
| Signal frequency | f | Hz | 1 – 20 000 | 200 |
| Signal amplitude (zero-to-peak) | A | V | 0 – 5 | 1.0 |
| DC offset | V₀ | V | −5 – +5 | 0 |
| Duty cycle (square / pulse) | D | — | 0.05 – 0.95 | 0.5 |
| Channel 2 phase shift | φ | ° | 0 – 360 | 0 |
| Vertical sensitivity | — | V/div | 5 mV – 5 V, in 1-2-5 steps | 0.5 |
| Horizontal sensitivity | — | s/div | 1 µs – 0.5 s, in 1-2-5 steps | 1 ms |
| Vertical position | — | div | −4 – +4 | 0 |
| Horizontal position | — | div | −5 – +5 | 0 |
| Trigger level | L | V | −20 – +20 | 0 |
| Injected noise amplitude | — | V | 0 – 1 | 0.15 |

The graticule is fixed at 10 horizontal and 8 vertical divisions, so the time window on screen is
`10 × (s/div)` and the visible voltage span for a channel is `8 × (V/div)`. The ×10 magnifier
divides the effective seconds-per-division by 10.

## Governing equations

**Signal.** The generator is analytic — it has a closed-form voltage at any time `t`, so the scope
can sample it at whatever resolution the timebase demands rather than integrating a state forward.
For a normalized shape function `s(p)` of the phase `p`:

```
v(t) = A · s( frac( f·t + φ/360 ) ) + V₀   (+ noise, if enabled)
```

where `frac(x)` is the fractional part, so only the position within the cycle matters. The shapes are

| Waveform | s(p) on p ∈ [0,1) | Mean over one period |
|---|---|---|
| sine | sin(2πp) | 0 |
| square | +1 if p < D, else −1 | 2D − 1 |
| pulse | +1 if p < D, else 0 | D |
| triangle | 4p on [0,¼); 2−4p on [¼,¾); 4p−4 on [¾,1) | 0 |
| sawtooth | 2p − 1 | 0 |
| noise | sum of three uniform samples, rescaled to [−1,1] | 0 |

**Triggering.** The scope searches one full period for the first time the signal crosses the trigger
level `L` in the selected direction, refining the crossing by linear interpolation between samples:

```
t_trigger = the smallest t ∈ [0, 1/f) with  v(t⁻) < L ≤ v(t⁺)   (rising slope)
```

That instant is placed at the **horizontal center** of the display, so column `i` of `n` shows

```
t_i = t_trigger + ( i/(n−1) − ½ )·T_window − (horizontal position)·(s/div)
```

Because the same crossing anchors every sweep, a repetitive waveform appears frozen. If no crossing
exists — the level is outside the signal's range — the behavior depends on the trigger mode: **auto**
sweeps anyway from `t = 0` (a free-running trace), **normal** holds the previously captured sweep,
and **single** holds it too, then stops the sweep clock once one triggered capture lands.

**Coupling.** Applied to the sampled buffer, where `V_DC = A·(mean of s) + V₀` is the signal's exact
DC component from the table above:

```
DC :  v            (unchanged)
AC :  v − V_DC
GND:  0
```

Using the *analytic* DC rather than the average of what happens to be on screen matters: a window
average depends on how many cycles the current timebase shows, which would make an asymmetric
waveform's baseline shift every time the time/div knob moved.

**Measurements.** Vmax, Vmin, and Vpp = Vmax − Vmin are read from the captured trace; Vrms is the
root-mean-square over the window. These are taken from a *noiseless* copy of the signal — Vmax and
Vmin are extreme values, and added noise pushes them apart but never together, which would inflate
Vpp by roughly the noise amplitude. For the generator the displayed frequency is exact; for the
microphone it is estimated from the spacing of the signal's mean-crossings, each located to
sub-sample precision.

**Spectrum.** The FFT view applies a periodic Hann window and a radix-2 fast Fourier transform, then
plots the single-sided magnitude normalized so the largest bin reaches full height.

## Simplifications and assumptions

- **The scope is ideal.** No input impedance, probe loading, bandwidth limit, rise-time limit, or
  amplifier noise. Real scopes attenuate and distort near their bandwidth ceiling; this one does not.
- **AC coupling is exact, not a filter.** A real scope's AC coupling is a high-pass filter with a
  cutoff of a few hertz, which visibly droops the flat top of a low-frequency square wave. Here the
  DC component is simply subtracted, so flat tops stay flat.
- **Sampling is not modeled.** There is no sample-rate limit, no aliasing, and no interpolation
  artifact — the generator is evaluated exactly at each column. A real digital scope aliases badly
  once the signal approaches its sample rate.
- **Channel 2 is always the generator**, never the microphone. It exists as the phase-shifted
  reference for dual-trace and phase comparison.
- **Trigger holdoff is not modeled**, and the trigger search covers a single period, so it finds the
  first crossing rather than tracking a specific one across sweeps.
- **Injected noise is uniform and independent per sample** (white), not the pink or thermal noise of
  a real instrument. It is added for signal-to-noise discussion and is on by default.
- **The microphone signal is treated as volts** in the range [−1, 1]; there is no calibration to a
  real sound-pressure level.

## References

- Any introductory laboratory-electronics text's oscilloscope chapter; the control set here follows
  the classic analog bench scope (e.g. Tektronix 2200-series) rather than a modern digital one.
- Hann window and radix-2 Cooley-Tukey FFT: standard signal-processing references.
