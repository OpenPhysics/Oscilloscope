# CLAUDE.md — Oscilloscope

Sim-specific context for AI assistants. General SceneryStack guidance: [OpenPhysics/.github/CLAUDE.md](https://github.com/OpenPhysics/.github/blob/main/CLAUDE.md).

## Project

A single-screen SceneryStack **oscilloscope** simulation. The scope displays either a synthetic
signal from a built-in **function generator** (sine / square / triangle / sawtooth) or **live
microphone audio** (Web Audio API), on a CRT-style graticule with 1-2-5 stepped volts/div and
time/div controls, Run/Stop, and a live frequency / period / Vpp readout. Forked from
`OpenPhysics/TemplateSingleSim`, and it keeps that template's **canonical accessibility** wiring.
For multi-screen sims, see [`doc/multi-screen.md`](doc/multi-screen.md).

### Simulation architecture

- **Model** samples the active source into a voltage buffer (`OscilloscopeModel.getTrace()`), one
  value per horizontal pixel column, over a time window of `timePerDiv × HORIZONTAL_DIVISIONS`.
  The function generator is analytic (triggered → stationary); the microphone path pulls the
  latest `AnalyserNode` time-domain data with a rising-edge trigger.
- **View** redraws the trace each frame in `OscilloscopeScreenView.step()`, but **only while
  running** — a stopped scope freezes the trace, like a real STOP.
- Run/Stop reuses `common/TimeModel`'s `isPlayingProperty` (no elapsed-time integration needed,
  since the trace is triggered rather than scrolled).

## Key files

| File | Purpose |
|---|---|
| `src/OscilloscopeColors.ts` | All `ProfileColorProperty` instances (incl. CRT phosphor / graticule colors) |
| `src/SimConstants.ts` | Named numeric constants (display geometry, generator & scope ranges/steps) |
| `src/OscilloscopeNamespace.ts` | Namespace for color property names |
| `src/i18n/StringManager.ts` | Singleton localized string accessor |
| `src/oscilloscope-screen/OscilloscopeScreen.ts` | Screen wrapper (threads the show-measurements preference to the view) |
| `src/oscilloscope-screen/model/OscilloscopeModel.ts` | Top-level model: source selection, sensitivities, trace sampling |
| `src/oscilloscope-screen/model/FunctionGenerator.ts` | Synthetic signal source (`voltageAt(t)`) |
| `src/oscilloscope-screen/model/AudioInput.ts` | Microphone source via Web Audio `AnalyserNode` (degrades gracefully) |
| `src/oscilloscope-screen/model/Waveform.ts` | Pure normalized waveform-shape evaluator |
| `src/oscilloscope-screen/model/SignalSource.ts` | `functionGenerator` \| `audio` union |
| `src/oscilloscope-screen/view/OscilloscopeScreenView.ts` | Layout, per-frame trace refresh, `screenSummaryContent` + `pdomOrder` |
| `src/oscilloscope-screen/view/OscilloscopeDisplayNode.ts` | CRT face, graticule, and waveform trace |
| `src/oscilloscope-screen/view/SignalControlPanel.ts` | Source selector + function-generator controls |
| `src/oscilloscope-screen/view/ScopeControlPanel.ts` | Volts/div + time/div pickers |
| `src/oscilloscope-screen/view/MeasurementReadoutNode.ts` | On-screen freq / period / Vpp overlay |
| `src/oscilloscope-screen/view/formatUnits.ts` | Engineering-unit label formatters (mV/V, µs/ms, Hz/kHz) |
| `src/oscilloscope-screen/view/OscilloscopeScreenSummaryContent.ts` | Accessible screen summary with **live** current-details |
| `src/oscilloscope-screen/view/OscilloscopeKeyboardHelpContent.ts` | Keyboard-help dialog content (slider + basic actions) |
| `src/common/SimPanel.ts` | Pre-themed `Panel` wrapper (uses `OscilloscopeColors` automatically) |
| `src/common/SimButtonOptions.ts` | Flat button-appearance option bundles + light-control-surface combo-box options |
| `src/common/TimeModel.ts` | Composable play/pause model — drives Run/Stop |
| `scripts/generate-icons.ts` | PNG icons from `public/icons/icon.svg` |
| `scripts/rename-sim.ts` | Automated fork/rename across all files and folders |

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

This template is the **canonical accessibility reference** for OpenPhysics sims. It ships with
the three required layers wired up: PDOM names, a `OscilloscopeScreenSummaryContent`, and an explicit
`pdomOrder` + `OscilloscopeKeyboardHelpContent`. A11y strings live under the `a11y` key in each locale
JSON, exposed via `StringManager.getA11yStrings()`. When building a real sim, make
`currentDetailsContent` a live `DerivedProperty` over model state and add `accessibleName`s to
every interactive node. Full convention and checklist: [Baton/ACCESSIBILITY.md](https://github.com/OpenPhysics/Baton/blob/main/ACCESSIBILITY.md).

## Compliance carve-outs

A clean fork of this template rarely needs compliance carve-outs — root `SimConstants.ts`,
`*Colors.ts`, `*Namespace.ts`, standard screen layout, and full a11y wiring pass Baton's
compliance check out of the box. Document carve-outs in the forked sim's `CLAUDE.md` only when
you introduce a deliberate deviation (nested constants, hardcoded interaction fills, etc.).

## Testing

Fleet-standard Vitest layout (keep when forking):

| Path | Purpose |
|---|---|
| `vitest.config.ts` | `happy-dom` environment; `setupFiles: ["./tests/setup.ts"]`; `execArgv: ["--expose-gc"]` |
| `tests/setup.ts` | Canvas / AudioContext mocks + `init({ name: "…" })` before SceneryStack imports |
| `tests/TimeModel.test.ts` | Sample model unit tests — replace with real physics tests |
| `tests/memory-leak.test.ts` | WeakRef + `forceGC` dispose regression (fleet pattern) |
| `tests/fuzz/fuzz.spec.ts` | Optional Playwright fuzz smoke via joist `?fuzz` |
| `playwright.config.ts` | Chromium project + Vite webServer for fuzz |

- Put unit tests only under root `tests/`, mirroring `src/` (never co-locate or use `__tests__/`).
- Change the `name` passed to `init()` in `tests/setup.ts` to match `package.json` after `npm run rename`.
- Run `npm test`. CI runs the suite when a `test` script is present.
- Expand `memory-leak.test.ts` for any component that adds/removes nodes or links Properties at
  runtime (see OpticsLab for a deep suite).
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
| `npm run rename` | Automated fork/rename (`--id`, `--name`) |

## Customizing a new sim from this template

### Automated rename (recommended)

```sh
npm run rename -- --id friction --name "Friction"
# or for multi-word names:
npm run rename -- --id wave-interference --name "Wave Interference"
```

This replaces all template identifiers in file contents and renames files/folders. Run
`npm run check` afterwards to verify TypeScript is clean.

### Manual checklist (if not using the rename script)

1. **Rename** — replace `oscilloscope` / `Oscilloscope` / `Sim` prefix in `init.ts`, `brand.ts`, `package.json`, class names, and screen folders
2. **Locale** — add `strings_XX.json`, register in `StringManager`, add locale to `init.ts` `availableLocales`
3. **Icon** — edit `public/icons/icon.svg`, run `npm run icons`; match theme color in `index.html` / `vite.config.ts`
4. **Colors** — edit `OscilloscopeColors.ts` (`default` + `projector` profiles per property)

## Multi-screen sims

Full guide: [`doc/multi-screen.md`](doc/multi-screen.md)

Summary:
- Create a new screen folder mirroring `src/oscilloscope-screen/` for each screen
- Add screen-name keys to all locale JSON files
- Expose new `StringProperty` getters in `StringManager.getScreenNames()`
- For shared state, create a root model passed to each per-screen model
- Add `src/common/{SimName}ScreenIcons.ts` with `create{Screen}Icon()` factories; wire `homeScreenIcon` + `navigationBarIcon` on each Screen
- Register all screens in the `screens` array in `main.ts`

## Using this template beyond a direct copy

| Approach | When to use |
|---|---|
| **GitHub template** ("Use this template" button) | Starting a single new sim |
| `npm run rename` after cloning | Same, automated |
| **npm workspace / monorepo** | Managing a suite of sims with shared tooling |
| **`npm create` scaffolder** | Org-wide standardized sim bootstrapping |
| **git subtree** for pulling updates | Keeping forks in sync with template improvements |

See `doc/multi-screen.md` → "Using this template beyond a direct copy" for details on each approach.

## PWA

After `npm run build`, the sim is installable offline via Workbox (`dist/manifest.webmanifest`).
