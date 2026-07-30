# CLAUDE.md — Oscilloscope

Sim-specific context for AI assistants. General SceneryStack guidance: [OpenPhysics/.github/CLAUDE.md](https://github.com/OpenPhysics/.github/blob/main/CLAUDE.md).

## Project

A single-screen SceneryStack **oscilloscope** simulation modelled on a real bench scope. It has two
vertical channels (**CH1 / CH2**), each with its own volts/div, position, AC-DC-GND coupling,
invert, and on/off. CH1's input is a built-in **function generator** (sine / square / triangle /
sawtooth / pulse / noise, with amplitude, DC offset, duty cycle, and a CH2 phase shift) or **live
microphone audio** (Web Audio API). It has a horizontal timebase (time/div, position, ×10 magnify)
with a **delayed sweep** (second timebase: off / intensified / delayed, with delay position and
delayed time/div), a **trigger** system (source `CH1`/`CH2`/`LINE`/`EXT`, level, slope, mode, and
**holdoff**, with a draggable on-screen level line), **CRT beam controls** (intensity / focus / beam
find), Y-T, **X-Y**, and **FFT** (spectrum) display modes, a CH1±CH2 **math** trace, optional
persistence, draggable **measurement cursors** (Δt / 1÷Δt / ΔV), **CSV / PNG export**, Run/Stop,
Single, Autoset, and live auto-measurements (freq / period / Vpp / Vrms / Vmax / Vmin / duty / rise /
fall / mean / phase). Optional signal-noise injection is in Preferences.

The defining UI decision: **the scope's own front panel is built from real-instrument widgets —
rotary knobs, detented rotary switches, and panel buttons, never sliders.** The function generator
is deliberately the exception: it is a *separate bench instrument* sitting under the CRT, patched in
over cables, and it uses sliders and a combo box so it reads as a different box rather than more
scope panel. Forked from `OpenPhysics/SceneryStackTemplate`, it keeps that template's **canonical
accessibility** wiring. For multi-screen sims, see [`doc/multi-screen.md`](doc/multi-screen.md).

### Simulation architecture

- **Model** resamples every channel into reusable volts-per-column buffers on `OscilloscopeModel.refresh()`,
  over a time window of `effectiveTimePerDiv × HORIZONTAL_DIVISIONS`. The function generator is analytic
  and trigger-aligned (`computeTriggerOffset()` finds the level/slope crossing → stationary display);
  the microphone path pulls the latest `AnalyserNode` data with a level/slope trigger.
- **Trigger modes are enforced in `refresh()`**, which delegates the comparator to
  `acquireTrigger()`: it returns false when nothing fires over a full period, and `auto` free-runs
  from that, while `normal` and `single` return early so the previous sweep stays frozen. `single`
  additionally holds once disarmed, so a completed capture does not quietly free-run; taking the
  capture clears `trigger.armedProperty` and stops the clock. Arming happens on two edges —
  selecting SINGLE, and `isPlayingProperty` going true (so RUN re-arms). The front-panel SINGLE key
  calls `model.captureSingle()`, which goes *through* those edges rather than around them.
- **`LINE` and `EXT` trigger sources bypass the channel view.** `acquireTrigger()` runs the same
  `computeCrossingOffset()` comparator against an internal `LINE_FREQUENCY` mains sine (`LINE`) or the
  generator's own output A (`EXT`, using the raw front-panel level), so they fire even when every
  channel is grounded — the trigger marker hides for these, since there is no drawn trace to sit on.
  `computeCrossingOffset()` seeds its previous sample from one step *before* t=0 (the sampler is
  periodic), so a crossing exactly on the period boundary — a level-0 sine starting on its own rising
  edge, where `Math.sin(2π)` is a hair negative — is not stepped past.
- **Trigger holdoff** is a real front-panel control (`Trigger.holdoffProperty`) that makes the
  comparator take the first crossing at/after the holdoff time. On the six built-in single-edge-per-cycle
  waveforms this only skips whole periods and lands on the same phase, so the stable display is
  unchanged — exactly as a bench scope behaves on a simple repetitive signal; its visible effect is on
  multi-edge signals.
- **Delayed sweep is a second sampling window.** `delayedActive` (only in `delayed` mode, and inert
  while a mic is patched) swaps `fillFromGenerator`'s window for `delayedWindow` starting at
  `t0 + delaySeconds`; `displayedTimeWindow` / `displayedTimePerDivision` feed the measurement pass so
  cursors and readouts describe whichever sweep is on screen. The `intensified` mode instead draws a
  brightened band (`delayZone`) marking that slice on the main trace.
- **CRT beam controls shape how the trace is drawn, not what it holds.** Intensity is the trace-layer
  opacity, focus sets the stroke width (sharp hairline → defocused), and BEAM FIND overrides intensity
  to full and hard-clamps the trace onto the graticule so an off-screen sweep can be found.
- **The comparator watches what the channel displays, not the raw source.** `triggerViewFor()` maps
  the front-panel level and slope — which the user sets against the on-screen marker — into the raw
  signal `computeTriggerOffset()` searches: the displayed trace is `sign · (source − dc)`, so a
  displayed crossing of `level` is a raw crossing of `sign·level + dc` on the edge `sign` maps it
  to, and a grounded channel yields no trigger at all. Skipping this is a genuinely confusing bug:
  an AC-coupled offset signal holds forever in NORMAL with the marker sitting right on the
  waveform, and an inverted channel fires its "rising" trigger on a visibly falling edge.
- **Two buffers per channel.** The display draws the noisy trace (what a probe really sees); the
  automatic measurements read a parallel noiseless one. Vmax/Vmin/Vpp are extreme-value statistics,
  so measuring the noisy trace biased Vpp outward by roughly the noise amplitude.
- **AC coupling subtracts the signal's analytic DC** (`FunctionGenerator.meanVoltage`, backed by
 `waveformMean()`), then applies a first-order high-pass (`AC_COUPLING_TIME_CONSTANT` ≈ 10 ms) so
 square-wave tops droop like a real scope. Subtracting a *window* mean is avoided because that
 depends on how many cycles the current time/div shows. GND flattens the channel to zero.
- **The high-pass is seeded from its closed-form periodic steady state** (`settleAcHighPass()`).
 The filter is linear, so one whole period of input is an affine map on its state
 (`y(t+P) = a·y(t) + b`) whose fixed point `b / (1 − a)` *is* the settled output. Marching through
 the ~5 time-constants the transient really takes cannot be afforded at a fast timebase — 5τ spans
 thousands of periods — and a period-blind sample budget has to alias the carrier, which left
 ~30 mV of baseline error at 20 kHz. The closed form costs one period of samples at any frequency
 and holds the baseline under 1 mV; `a` and `1 − a` are computed via `log1p`/`expm1` because α sits
 within an ulp of 1 for a fast signal. The aperiodic noise waveform has no steady state and is
 seeded at rest instead.
- **Probe ×1/×10** per channel multiplies the effective volts/div used for drawing and ΔV (tip-voltage
 buffers are unchanged), matching a DSO told a ×10 probe is attached.
- **The microphone's timebase is bounded by its acquisition memory.** An `AnalyserNode` only hands
 back its most recent `AUDIO_FFT_SIZE` samples (≈ 743 ms at 44.1 kHz), so `enforceMicrophoneTimebase()`
 clamps time/div to `microphoneMaxTimePerDivision` while a mic is patched, snapping down to the next
 1-2-5 detent. Stretching a shorter capture across the graticule instead would silently mislabel the
 time axis — by 100× at the slowest sweep.
- **View** redraws in `OscilloscopeScreenView.step()`, but only **resamples** while running — a
  stopped scope freezes the captured buffer, yet still rescales it live when you turn volts/div or
  position, like a real STOP. Redrawing rebuilds a `Shape` per visible trace, so it is gated on a
  `redrawDirty` flag: running always sets it, and while stopped only a change to one of the
  `renderInputs` Properties does. **Anything new that affects drawing must be added to that list**,
  or a stopped scope will show a stale trace.
- **Persistence keeps a chain of `PERSISTENCE_SWEEPS` past CH1 sweeps**, drawn behind the live trace
  at linearly decreasing opacity. A single ghost is not enough: the trace is trigger-aligned, so last
  frame's sweep lands exactly under this one and shows nothing. The chain is what makes the afterglow
  visible while a knob is being turned. Leaving Y-T clears it, so re-engaging starts from a clean face.
- The **hardware controls** live in `src/common/controls/`: `RotaryKnob` and `RotarySwitch` are built on
  sun's `AccessibleSlider` trait (keyboard/PDOM for free) but render as knobs/switches; `PanelButton`
  wraps a `RectangularPushButton` with an indicator LED.
- Run/Stop reuses `common/TimeModel`'s `isPlayingProperty` (no elapsed-time integration needed,
  since the trace is triggered rather than scrolled).

### View teardown

Scenery does not dispose a node's children, unlink its listeners, or dispose the `DerivedProperty`
instances a component derived from model state — and a link onto anything longer-lived (a model
Property, a sim-lifetime `ProfileColorProperty`, a localized string Property) keeps the whole
component subtree reachable. Every view component that links outward therefore collects its teardown
in a **`DisposalBag`** (`src/common/DisposalBag.ts`) and drains it from `dispose()`.

**`OscilloscopeScreenView` is the exception, and must not have a `dispose()` override**: joist's
`ScreenView.setPDOMOrder()` throws unconditionally, and `Node.dispose()` clears `pdomOrder` on its
way out, so any such override throws instead of tearing anything down. Anything needing teardown
belongs in a child component, which is what the memory-leak suite checks. `memory-leak.test.ts` pins
that constraint directly so the override does not come back.

## Key files

| File | Purpose |
|---|---|
| `src/OscilloscopeColors.ts` | All `ProfileColorProperty` instances (incl. CRT phosphor / graticule colors) |
| `src/SimConstants.ts` | Named numeric constants (display geometry, generator & scope ranges/steps) |
| `src/OscilloscopeNamespace.ts` | Namespace for color property names |
| `src/i18n/StringManager.ts` | Singleton localized string accessor |
| `src/oscilloscope-screen/OscilloscopeScreen.ts` | Screen wrapper (threads show-measurements + noise preferences to view/model) |
| `src/oscilloscope-screen/model/OscilloscopeModel.ts` | Top-level model: channels, source, timebase, trigger, math, per-frame `refresh()` |
| `src/oscilloscope-screen/model/Channel.ts` | One vertical channel: volts/div, position, coupling, invert, on/off |
| `src/oscilloscope-screen/model/Coupling.ts` | `DC` \| `AC` \| `GND` union |
| `src/oscilloscope-screen/model/Trigger.ts` | Trigger source / level / slope / mode |
| `src/oscilloscope-screen/model/FunctionGenerator.ts` | Synthetic source (`voltageAt(t)`, offset/duty/phase, injectable noise) |
| `src/oscilloscope-screen/model/AudioInput.ts` | Microphone source via Web Audio `AnalyserNode` (degrades gracefully) |
| `src/oscilloscope-screen/model/Waveform.ts` | Pure normalized waveform-shape evaluator (incl. pulse/noise) |
| `src/oscilloscope-screen/model/Spectrum.ts` | Pure Hann-windowed radix-2 FFT for the spectrum (FFT) display mode |
| `src/oscilloscope-screen/model/ChannelInput.ts` | `none` \| `functionGeneratorA` \| `functionGeneratorB` \| `microphone` BNC patch union |
| `src/common/controls/RotaryKnob.ts` | Continuous accessible knob (scrub drag + `AccessibleSlider` keyboard) |
| `src/common/controls/RotarySwitch.ts` | Detented accessible selector (generic over value type) |
| `src/common/controls/PanelButton.ts` | Front-panel push button with optional indicator LED |
| `src/common/controls/KnobDragListener.ts` | Scrub-drag pointer behavior for `RotaryKnob` |
| `src/oscilloscope-screen/view/OscilloscopeScreenView.ts` | Layout, per-frame refresh/redraw, measurements, Autoset, Single, `pdomOrder` |
| `src/oscilloscope-screen/view/OscilloscopeDisplayNode.ts` | CRT face, graticule, CH1/CH2/math traces, trigger marker, X-Y, FFT, persistence, draggable cursors |
| `src/oscilloscope-screen/view/MeasurementCursorNode.ts` | One draggable **and keyboard-operable** measurement cursor (`AccessibleSlider`) |
| `src/oscilloscope-screen/view/CursorReadoutNode.ts` | On-screen Δt / 1÷Δt / ΔV cursor readout overlay |
| `src/oscilloscope-screen/view/PatchCableLayer.ts` | The five jack nodes + drag-to-connect patch cables between them |
| `src/oscilloscope-screen/view/BncJackNode.ts` | One BNC-style jack (source output or channel input) |
| `src/oscilloscope-screen/view/measurementUtils.ts` | Pure estimators: frequency, duty, rise/fall, phase, `nearestStep` |
| `src/common/downloadFile.ts` | Browser CSV / PNG download helpers (used by trace export) |
| `src/common/DisposalBag.ts` | Teardown collector every disposable view component drains in `dispose()` |
| `src/oscilloscope-screen/view/SignalGeneratorPanel.ts` | Waveform combo + freq/ampl/offset/duty/phase sliders, mic status, source jacks |
| `src/oscilloscope-screen/view/VerticalControlPanel.ts` | Per-channel volts/div, position, coupling, invert, on/off |
| `src/oscilloscope-screen/view/HorizontalControlPanel.ts` | Time/div, position, ×10 magnify, X-Y, delayed sweep (mode / delay / delayed time-div) |
| `src/oscilloscope-screen/view/TriggerControlPanel.ts` | Trigger source (CH1/CH2/LINE/EXT) / level / slope / mode / holdoff |
| `src/oscilloscope-screen/view/DisplayControlPanel.ts` | CRT beam controls: intensity / focus / beam find |
| `src/oscilloscope-screen/view/SoftAcquirePanel.ts` | Cursor, Measure, Lab, Run/Stop, Single, Autoset, Persist, export |
| `src/oscilloscope-screen/view/labActivities.ts` | Guided lab presets (Vpp, Normal trigger, 3rd harmonic, Lissajous) |
| `src/oscilloscope-screen/view/LabActivitiesDialog.ts` | Soft-key Lab dialog that applies a preset |
| `src/oscilloscope-screen/view/controlHelpers.ts` | Switch-item + readout-string factories for the panels |
| `src/oscilloscope-screen/view/panelSection.ts` | `withSectionHeader()` — wraps a panel body in a bench-instrument section-header strip (Acquire/Horizontal/Trigger/Vertical, and the generator faceplate) |
| `src/oscilloscope-screen/view/MeasurementReadoutNode.ts` | On-screen freq / period / Vpp / Vrms / Vmax / Vmin overlay |
| `src/oscilloscope-screen/view/formatUnits.ts` | Engineering-unit label formatters (mV/V, µs/ms, Hz/kHz, %, °) |
| `src/oscilloscope-screen/view/OscilloscopeScreenSummaryContent.ts` | Accessible screen summary with **live** current-details |
| `src/oscilloscope-screen/view/OscilloscopeKeyboardHelpContent.ts` | Keyboard-help dialog content (slider + basic actions) |
| `src/common/SimPanel.ts` | Pre-themed `Panel` wrapper (uses `OscilloscopeColors` automatically) |
| `src/common/SimButtonOptions.ts` | Flat button-appearance option bundles + light-control-surface combo-box options |
| `src/common/TimeModel.ts` | Composable play/pause model — drives Run/Stop |
| `scripts/generate-icons.ts` | PNG icons from `public/icons/icon.svg` |

## Common components

### SimPanel

Every control panel and info box in the sim should use `SimPanel` so that
default/projector color switching is automatic:

```typescript
import { SimPanel } from "../../common/SimPanel.js";
const panel = new SimPanel(content);              // uses OscilloscopeColors defaults
const panel = new SimPanel(content, { xMargin: 20 }); // override any PanelOption
```

### TimeModel

For simulations with animation, compose `TimeModel` into your screen model:

```typescript
import { TimeModel } from "../../common/TimeModel.js";

export class MyModel implements TModel {
  public readonly timer = new TimeModel();   // starts paused; pass true to auto-play

  public step(dt: number): void {
    this.timer.step(dt);
    // use this.timer.timeProperty.value for physics
  }
  public reset(): void { this.timer.reset(); /* … */ }
}
```

Wire the view to `TimeControlNode` from `scenerystack/scenery-phet` binding on
`model.timer.isPlayingProperty`.

### SimButtonOptions

SceneryStack's push/round buttons default to a 3-D/beveled look; every button in the sim
should be flat instead. Spread these into the relevant options object:

```typescript
import { FLAT_RESET_ALL_BUTTON_OPTIONS, FLAT_RECTANGULAR_BUTTON_OPTIONS } from "../../common/SimButtonOptions.js";

const resetAllButton = new ResetAllButton({ ...FLAT_RESET_ALL_BUTTON_OPTIONS, listener: () => {...} });
const exampleButton = new RectangularPushButton({ ...FLAT_RECTANGULAR_BUTTON_OPTIONS, content, listener });
```

`FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS` spreads into `TimeControlNode`'s `playPauseStepButtonOptions`;
`TIME_CONTROL_SPEED_RADIO_OPTIONS` fixes `TimeControlNode`'s speed-radio label color, which
otherwise defaults to black text on the sim's dark default-mode panels. `SIM_COMBO_BOX_OPTIONS`
themes a `ComboBox`'s button/list chrome to the light control surface below; pair item labels
with `LIGHT_SURFACE_TEXT_FILL` (not `OscilloscopeColors.textColorProperty`, which is for panel-fill text).

`OscilloscopeColors.ts` backs this with a "light control surfaces" section —
`controlSurfaceColorProperty`, `controlSurfaceDisabledColorProperty`,
`controlSurfaceTextColorProperty` — identical white/dark-text values in both default and
projector profiles, so any component that must stay light regardless of theme (combo boxes,
flat buttons, editable fields) keeps readable contrast automatically.

## Accessibility

Inherited from `SceneryStackTemplate`, which is the fleet's canonical accessibility reference. All
three required layers are wired up: PDOM names on every interactive node, a live
`OscilloscopeScreenSummaryContent` whose `currentDetailsContent` is a `DerivedProperty` over model
state, and an explicit `pdomOrder` + `OscilloscopeKeyboardHelpContent`. A11y strings live under the
`a11y` key in each locale JSON, exposed via `StringManager.getA11yStrings()`. Full convention and
checklist: [Baton/ACCESSIBILITY.md](https://github.com/OpenPhysics/Baton/blob/main/ACCESSIBILITY.md).

Sim-specific notes:

- **Every control that changes state is keyboard-operable**, including the on-screen ones. The four
  measurement cursors are `MeasurementCursorNode`s built on `AccessibleSlider` (not plain drag
  targets), so Δt / 1÷Δt / ΔV is reachable without a pointer; they sit at the end of `pdomOrder`,
  after the acquisition cluster that reveals them.
- The trigger-level marker is pointer-only by design — `TriggerControlPanel`'s level knob is its
  keyboard equivalent and writes the same Property.
- Numbers interpolated into a11y strings must be rounded explicitly.
  `PatternStringProperty`'s `decimalPlaces` defaults to `null` (no rounding), and the knobs are
  continuous, so an unrounded value reads aloud as `1018.1409090909092`. See
  `OscilloscopeScreenSummaryContent`.

## Compliance carve-outs

Baton's compliance check passes. One documented deviation:

- **Hardcoded colors:** `TRANSPARENT_HIT_FILL` in `MeasurementCursorNode.ts` is a hardcoded
  `rgba(0, 0, 0, 0.01)` rather than a `ProfileColorProperty`. It is a pointer hit-area affordance,
  not a themed color — it must stay invisible in every color profile, so routing it through
  `OscilloscopeColors.ts` would be misleading. The compliance script flags it as a possible
  hardcoded-colors hit; that warning is expected.

## Testing

Fleet-standard Vitest layout (keep when forking):

| Path | Purpose |
|---|---|
| `vitest.config.ts` | `happy-dom` environment; `setupFiles: ["./tests/setup.ts"]`; `execArgv: ["--expose-gc"]` |
| `tests/setup.ts` | Canvas / AudioContext mocks + `init({ name: "…" })` before SceneryStack imports |
| `tests/TimeModel.test.ts` | Sample model unit tests — replace with real physics tests |
| `tests/memory-leak.test.ts` | WeakRef + `forceGC` dispose regression — models **and** every view component with real teardown (display node, cursors, knobs/switches, patch layer, BNC jacks, both readouts, all five panels) |
| `tests/OscilloscopeScreenView.test.ts` | Which frequency the readout reports, phase-row dashing, persistence chain |
| `tests/AudioInput.test.ts` | Microphone capture geometry against a stub `AnalyserNode` |
| `tests/fuzz/fuzz.spec.ts` | Optional Playwright fuzz smoke via joist `?fuzz` |
| `playwright.config.ts` | Chromium project + Vite webServer for fuzz |

- Put unit tests only under root `tests/`, mirroring `src/` (never co-locate or use `__tests__/`).
- Run `npm test`. CI runs the suite when a `test` script is present.
- Expand `memory-leak.test.ts` for any component that adds/removes nodes or links Properties at
  runtime (see OpticsLab for a deep suite). The view cases construct their component against a model
  that **outlives** it, so a missed `unlink` keeps the component reachable and fails the assertion.
- **Build the component the way the panels build it.** These cases only catch what they exercise:
  the `RotaryKnob` case used to pass a bare knob with no caption or readout — the one configuration
  no panel actually uses — so it covered none of the `Text` children a real knob carries.
- The numerics tests assert **accuracy against known-good values**, not just structure:
  `measurementUtils.test.ts` pins the frequency estimator to <1% error (it used to be quantized to
  1/windowSeconds), and `OscilloscopeModel.test.ts` pins the AC-coupled baseline under 1 mV across
  the whole timebase range (including the fastest sweeps, where a period-blind filter warm-up used
  to leave ~30 mV) while still requiring visible droop near the coupling corner. Keep that style
  when touching the math.
- Trigger tests assert against **what is drawn**, not what the generator produces — an AC-coupled or
  inverted channel is exactly where the two diverge.
- Optional: `npm run test:fuzz` / `test:fuzz:quick` (not part of default CI).

## Commands

```bash
npm run lint && npm run check && npm run build && npm test
```

| Command | Description |
|---|---|
| `npm start` / `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run build:single` | Single-file build mode |
| `npm run check` | TypeScript (`tsc --noEmit` + scripts project) |
| `npm run lint` / `npm run fix` | Biome check / auto-fix |
| `npm test` | Vitest unit tests |
| `npm run test:fuzz` | Playwright fuzz smoke |
| `npm run test:fuzz:quick` | 10s fuzz |
| `npm run icons` | Regenerate PWA icons |

## Multi-screen sims

Full guide: [`doc/multi-screen.md`](doc/multi-screen.md)

Summary:
- Create a new screen folder mirroring `src/oscilloscope-screen/` for each screen
- Add screen-name keys to all locale JSON files
- Expose new `StringProperty` getters in `StringManager.getScreenNames()`
- For shared state, create a root model passed to each per-screen model
- Add `src/common/{SimName}ScreenIcons.ts` with `create{Screen}Icon()` factories; wire `homeScreenIcon` + `navigationBarIcon` on each Screen
- Register all screens in the `screens` array in `main.ts`

## PWA

After `npm run build`, the sim is installable offline via Workbox (`dist/manifest.webmanifest`).
