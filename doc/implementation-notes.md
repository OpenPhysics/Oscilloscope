# Implementation Notes - Oscilloscope

Developer-facing notes on how this simulation is put together and why. The educator-facing companion
is [model.md](./model.md). Sim-specific conventions and pitfalls for AI assistants live in
[`CLAUDE.md`](../CLAUDE.md).

## Architecture Overview

```
main.ts
  └─ OscilloscopeScreen             (Screen<OscilloscopeModel, OscilloscopeScreenView>)
       ├─ OscilloscopeModel          src/oscilloscope-screen/model/
       │    ├─ FunctionGenerator     analytic signal source (voltageAt / cleanVoltageAt)
       │    ├─ AudioInput            microphone via Web Audio AnalyserNode
       │    ├─ Channel × 2           volts/div, position, coupling, invert, on/off
       │    ├─ Trigger               source / level / slope / mode / armed
       │    └─ TimeModel             run–stop clock
       └─ OscilloscopeScreenView     src/oscilloscope-screen/view/
            ├─ OscilloscopeDisplayNode        CRT face, traces, trigger marker, cursors
            │    └─ MeasurementCursorNode × 4 accessible draggable cursors
            ├─ SignalGeneratorPanel / VerticalControlPanel / HorizontalControlPanel
            ├─ TriggerControlPanel / AcquisitionPanel
            ├─ MeasurementReadoutNode / CursorReadoutNode
            ├─ OscilloscopeScreenSummaryContent   (PDOM overview, live details)
            └─ OscilloscopeKeyboardHelpContent

src/common/controls/    RotaryKnob, RotarySwitch, PanelButton, KnobDragListener
src/common/             SimPanel, SimButtonOptions, TimeModel, downloadFile
src/preferences/        PreferencesModel / PreferencesNode / queryParameters
```

## The sampling pipeline

`OscilloscopeModel.refresh()` is the heart of the sim. The view calls it once per frame while
running, and it rebuilds every trace buffer from scratch. There is no incremental state to keep in
sync — a redraw is always a full resample — which is what makes the control behavior easy to reason
about.

Order of operations, and why:

1. **Resolve the trigger first.** `computeTriggerOffset()` scans one signal period for the
   level/slope crossing and interpolates it. It returns `number | null`; `null` means the comparator
   never fired. This distinction is the whole basis of trigger-mode behavior, so it must not be
   collapsed to `0`.
2. **Decide whether to sweep at all.** `auto` proceeds regardless (free-running from `t = 0`);
   `normal` and `single` return early when untriggered, leaving the previous buffers untouched — the
   frozen trace *is* the hold. `single` also holds while disarmed, so a completed capture stays on
   screen instead of free-running. Taking the capture clears `trigger.armedProperty` and stops the
   clock; arming happens both when SINGLE is selected and when `isPlayingProperty` goes true, so
   pressing RUN after a capture waits for the next trigger rather than doing nothing visible.
3. **Fill the buffers.** `fillFromGenerator()` writes two buffers per channel in one pass: the clean
   waveform and the same value plus a noise sample. Evaluating the waveform once and adding noise on
   top is cheaper than two evaluations and guarantees the two buffers describe the same signal.
4. **Apply coupling** to both buffers with the *analytic* DC (`FunctionGenerator.meanVoltage`).
5. **Derive the math trace** when the math mode is not off.

### Why two buffers per channel

`ch1Buffer` is what the display draws; `ch1CleanBuffer` is what the measurements read. Vmax, Vmin and
Vpp are extreme-value statistics: added noise moves the maximum up and the minimum down, never the
reverse, so measuring the displayed trace inflated Vpp by roughly the noise amplitude (~14% at the
default noise setting). Noise is on by default, so this was the sim's out-of-the-box behavior.
`OscilloscopeModel.test.ts` pins both traces.

### Why AC coupling does not average the window

The obvious implementation — subtract the mean of the visible samples — is wrong for any waveform
that is not symmetric about the trigger point. The window mean depends on how many cycles the
current time/div happens to show, so a 20%-duty pulse's baseline visibly jumped whenever the timebase
knob moved. `waveformMean()` gives each shape's exact per-period mean instead, so AC coupling is a
fixed offset removal, matching the fixed high-pass of a real scope. The microphone path has no
analytic DC available and still uses the window mean, which is acceptable because a mic signal is
already centered near zero.

### The audio scratch buffer

`AudioInput.fillTrace()` only discovers whether it triggered *as a side effect* of resampling. A held
`normal`/`single` sweep must not have already overwritten the committed buffer, so the microphone
path fills `audioScratchBuffer` first and copies it across only once the sweep is allowed to proceed.

## Rendering

`OscilloscopeScreenView.step()` resamples only while running, but redraws whenever the drawing
inputs change — a stopped scope still rescales its frozen trace as you turn volts/div, exactly as a
real STOP does.

Redrawing rebuilds a Kite `Shape` per visible trace (560 segments each), so it is gated on a
`redrawDirty` flag. Running always sets it; while stopped, only a change to one of the Properties in
`renderInputs` does.

> **Adding anything that affects drawing means adding its Property to `renderInputs`.** Miss one and
> a stopped scope shows a stale trace — the failure is silent and only reproducible with the sweep
> stopped.

FFT mode reuses a `SpectrumScratch` allocated once, rather than churning three typed arrays per
frame. `computeMagnitudeSpectrum()` still allocates when called without scratch, which keeps it a
pure function for tests.

## Controls

Every panel control is a hardware widget, never a slider — that is the sim's defining UI decision.
`RotaryKnob` (continuous) and `RotarySwitch` (detented, generic over the value type) are built on
sun's `AccessibleSlider` trait, so keyboard operation and PDOM announcement come for free while the
rendering is a knob. `RotarySwitch` drives an internal integer index Property and mirrors it to the
model Property through a re-entrancy guard, so external writes (Reset All, Autoset) move the dial.

The four **measurement cursors** are `MeasurementCursorNode`s and use the same `AccessibleSlider`
trait, so the Δt / 1÷Δt / ΔV measurement is reachable by keyboard. They own both their pointer
`DragListener` and their keyboard behavior; both write the same model Property, so the two input
paths cannot disagree. The trigger-level marker is pointer-only on purpose — the trigger panel's
level knob is its keyboard equivalent.

## Disposal

Model classes dispose the Properties they own. `FunctionGenerator` tracks whether it *owns* its noise
Properties (it does not when they are injected from preferences) and only resets/disposes the owned
ones.

On the view side, `OscilloscopeDisplayNode` keeps two lists: `disposeActions` for Property links and
input listeners, and `ownedChildren` for the nodes it created. Scenery does **not** dispose a node's
children, and each child here holds a listener on a sim-lifetime `ProfileColorProperty`, so skipping
that second list leaks the whole subtree. `memory-leak.test.ts` constructs the view components
against a model that outlives them, so a missed `unlink` keeps the component reachable and fails.

Panels and the `ScreenView` are never removed from the scene graph; `ScreenView.dispose()` exists so
its `renderInputs` links are paired and testable, not because it is reached in normal operation.

## Numerics worth knowing about

- **Frequency estimation** (`measurementUtils.estimateFrequency`, microphone path only) measures
  between the first and last mean-crossing with sub-sample interpolation, and divides by the number
  of periods spanned. Counting whole crossings over the window instead quantizes the answer to
  `1/windowSeconds` — a 100 Hz grid at the default timebase, which reported a 200 Hz tone as 100 or
  300 Hz. Rising-only crossings are preferred (a whole period apart, exact for asymmetric waveforms),
  with an all-crossings half-period fallback for captures too short to hold two rising edges.
- **Number formatting** goes through `toFixed` from `scenerystack/dot`, never the native
  `Number.prototype.toFixed`, which rounds inconsistently across browsers.
- **Numbers in a11y strings must be rounded explicitly.** `PatternStringProperty`'s `decimalPlaces`
  defaults to `null`, and the knobs are continuous, so an unrounded frequency reads aloud as
  `1018.1409090909092`.

## Testing

| Path | Purpose |
|---|---|
| `vitest.config.ts` | `happy-dom`; `setupFiles: ["./tests/setup.ts"]`; `execArgv: ["--expose-gc"]` |
| `tests/setup.ts` | Canvas/AudioContext mocks + `init()` before SceneryStack imports |
| `tests/OscilloscopeModel.test.ts` | Sampling, coupling, trigger modes, clean-vs-displayed traces |
| `tests/measurementUtils.test.ts` | Frequency-estimator accuracy; 1-2-5 step snapping |
| `tests/Waveform.test.ts`, `Spectrum.test.ts`, `Trigger.test.ts`, `Channel.test.ts`, `FunctionGenerator.test.ts` | Pure model units |
| `tests/memory-leak.test.ts` | WeakRef + `forceGC` dispose regression, models and view components |
| `tests/fuzz/fuzz.spec.ts` | Optional Playwright smoke via `?fuzz` |

The numerics tests assert accuracy against known-good values, not just structure. Keep that style —
the defects these tests cover were all invisible to structural assertions.

Run `npm run lint && npm run check && npm run build && npm test`.

The microphone path is not exercised by unit tests: the environment mocks `AudioContext` and provides
no `getUserMedia`, so the audio source yields a flat line, which the tests assert.

## Multi-screen simulations

Single-screen today. To add screens see [`multi-screen.md`](./multi-screen.md): per-screen folders
mirroring `src/oscilloscope-screen/`, `StringManager` screen-name getters, an optional shared root
model, a `src/common/OscilloscopeScreenIcons.ts` module wired as `homeScreenIcon` /
`navigationBarIcon`, and every screen registered in `main.ts`.

## PWA

After `npm run build`, the sim is installable offline via Workbox (`dist/manifest.webmanifest`).
