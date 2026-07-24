# Implementation Notes - Oscilloscope

Developer-facing notes on the **TemplateSingleSim** scaffold. **Replace and expand this file when
forking** to describe your sim's real architecture (see Stern Gerlach or Light Propagation for
target quality). Until then, this documents what the template provides out of the box.

## Architecture Overview

TemplateSingleSim is the fleet-canonical starting point for new single-screen SceneryStack sims.
It demonstrates Model–View separation, color profiles, localization, reset behavior, accessibility
reference wiring, and reusable common components — **without** domain physics.

```
main.ts
  └─ OscilloscopeScreen             (Screen<OscilloscopeModel, OscilloscopeScreenView>)
       ├─ OscilloscopeModel          state + logic  (src/oscilloscope-screen/model/)  ← stub: add physics here
       └─ OscilloscopeScreenView     visuals        (src/oscilloscope-screen/view/)
            ├─ OscilloscopeScreenSummaryContent     (PDOM overview — reference a11y pattern)
            └─ OscilloscopeKeyboardHelpContent      (keyboard help dialog)

src/common/
  ├─ SimPanel.ts           pre-themed panel (uses OscilloscopeColors)
  ├─ SimButtonOptions.ts   flat button / combo-box option bundles
  └─ TimeModel.ts          composable play/pause + elapsed time

src/preferences/
  ├─ OscilloscopePreferencesModel   sim-specific pref state
  ├─ OscilloscopePreferencesNode    pref UI in Preferences → Simulation
  └─ oscilloscopeQueryParameters    QueryStringMachine declarations
```

Data flows Model → View through AXON `Property` objects (`.link()` / `.lazyLink()`). The view never
integrates physics; the model never imports scenery.

## Forking checklist

### Automated rename (recommended)

```sh
npm run rename -- --id my-sim --name "My Simulation"
npm run check
```

`scripts/rename-sim.ts` replaces template identifiers in file contents and renames files/folders.

### Manual steps (after rename or if skipping the script)

1. **`doc/model.md`** — educator physics (equations, ranges, simplifications).
2. **`doc/implementation-notes.md`** — this file, rewritten for your architecture.
3. **`OscilloscopeModel`** — real Properties, `step(dt)`, `reset()`; compose `TimeModel` if animated.
4. **`OscilloscopeScreenView`** — play area + controls; wire `ResetAllButton` to `model.reset()`.
5. **`OscilloscopeColors.ts`** — sim palette (default + projector profiles).
6. **Locale JSON** — title, strings, `a11y` keys; register locales in `init.ts`.
7. **`public/icons/icon.svg`** → `npm run icons`; align theme color in `index.html` / vite config.
8. **`tests/setup.ts`** — `init({ name: … })` must match `package.json` name after rename.
9. **`CLAUDE.md`** — sim-specific file map and pitfalls for AI assistants.

## Common components (keep when forking)

### SimPanel

Every control panel should use `SimPanel` so projector-mode switching is automatic:

```typescript
import { SimPanel } from "../../common/SimPanel.js";
const panel = new SimPanel(content);
const panelWide = new SimPanel(content, { xMargin: 20 });
```

### TimeModel

Compose into your screen model for animation (do not subclass `TimeModel`):

```typescript
export class MyModel implements TModel {
  public readonly timer = new TimeModel();  // pass true to auto-play on startup

  public step(dt: number): void {
    this.timer.step(dt);
    // physics uses this.timer.timeProperty.value
  }
  public reset(): void { this.timer.reset(); /* restore initial state */ }
}
```

Wire `TimeControlNode` to `model.timer.isPlayingProperty` in the view.

### SimButtonOptions

Spread flat button options into every push/round button and `TimeControlNode` (see `CLAUDE.md`).
Use `SIM_COMBO_BOX_OPTIONS` + `LIGHT_SURFACE_TEXT_FILL` for light control surfaces on dark panels.

## Accessibility (reference implementation)

The template is the **canonical OpenPhysics a11y reference**:

- PDOM `accessibleName` on interactive nodes (prefer live `StringProperty`s).
- `OscilloscopeScreenSummaryContent` with a live `currentDetailsContent` `DerivedProperty` over model state.
- Explicit `pdomOrder` + `OscilloscopeKeyboardHelpContent`.
- Strings under `a11y` in locale JSON → `StringManager.getA11yStrings()`.

Full checklist: [Baton/ACCESSIBILITY.md](https://github.com/OpenPhysics/Baton/blob/main/ACCESSIBILITY.md).

## Testing (fleet layout — keep when forking)

| Path | Purpose |
|---|---|
| `vitest.config.ts` | `happy-dom`; `setupFiles: ["./tests/setup.ts"]`; `execArgv: ["--expose-gc"]` |
| `tests/setup.ts` | Canvas/AudioContext mocks + `init()` before SceneryStack imports |
| `tests/TimeModel.test.ts` | **Replace** with real model/physics tests mirroring `src/` |
| `tests/memory-leak.test.ts` | WeakRef + `forceGC` dispose regression |
| `tests/fuzz/fuzz.spec.ts` | Optional Playwright smoke via `?fuzz` |

Run `npm test`. Expand `memory-leak.test.ts` when adding runtime-created nodes or Property links.

## Multi-screen simulations

Default is single-screen. To add screens, see **`doc/multi-screen.md`**: per-screen folders mirroring
`src/oscilloscope-screen/`, `StringManager` screen-name getters, optional shared root model, a shared
`src/common/{SimName}ScreenIcons.ts` module (`create{Screen}Icon()` factories wired as
`homeScreenIcon` / `navigationBarIcon`), and register all screens in `main.ts`.

## PWA

After `npm run build`, the sim is installable offline via Workbox (`dist/manifest.webmanifest`).

## Known template stubs (remove when forking)

- `OscilloscopeModel.step()` / `reset()` — empty placeholders until you add physics.
- Placeholder play-area content in `OscilloscopeScreenView` — replace with real UI.
- `tests/TimeModel.test.ts` — sample only; add tests for your model under `tests/`.
