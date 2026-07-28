# Multi-Screen Simulations

This template ships as a **single-screen** simulation. Many physics simulations
expose multiple conceptual modes — "Intro" + "Lab", "Basics" + "Advanced", etc.
This guide shows how to extend the template to two or more screens.

---

## Architecture patterns

### Single-screen (template default)

```
main.ts
  └─ OscilloscopeScreen            (Screen<OscilloscopeModel, OscilloscopeScreenView>)
       ├─ OscilloscopeModel         owns all state
       └─ OscilloscopeScreenView    owns all visuals
```

### Multi-screen with independent state (simplest)

Each screen is completely self-contained. Use this when screens have no shared
physical state — for instance an "Intro" that is purely explanatory and a "Lab"
with interactive controls.

```
main.ts
  ├─ IntroScreen           (Screen<IntroModel, IntroScreenView>)
  │    ├─ IntroModel
  │    └─ IntroScreenView
  └─ LabScreen             (Screen<LabModel, LabScreenView>)
       ├─ LabModel
       └─ LabScreenView
```

### Multi-screen with shared model (recommended for real sims)

A top-level "root model" owns shared state (e.g. selected material, common
parameters). Each screen model receives a reference to it.

```
main.ts  →  creates FrictionModel (shared)
  ├─ IntroScreen    receives FrictionModel → IntroModel(frictionModel)
  └─ LabScreen      receives FrictionModel → LabModel(frictionModel)
```

---

## Step-by-step: adding a second screen

### 1 — Add strings

`src/i18n/strings_en.json` (and every other locale file):

```json
{
  "title": "Friction",
  "screens": {
    "intro": "Intro",
    "lab": "Lab"
  }
}
```

**Important:** All locale files must define identical keys. TypeScript will error
at compile time if any key is missing (see the `satisfies` checks in
`StringManager.ts`).

### 2 — Expose screen-name properties in StringManager

```typescript
// src/i18n/StringManager.ts
public getScreenNames(): {
  readonly introStringProperty: ReadOnlyProperty<string>;
  readonly labStringProperty:   ReadOnlyProperty<string>;
} {
  return {
    introStringProperty: stringProperties.screens.introStringProperty,
    labStringProperty:   stringProperties.screens.labStringProperty,
  };
}
```

### 3 — Create the second screen folder

Mirror the structure of `src/oscilloscope-screen/`:

```
src/
├─ common/
│   └─ FrictionScreenIcons.ts   # createIntroIcon(), createLabIcon(), …
├─ intro-screen/
│   ├─ IntroScreen.ts
│   ├─ model/
│   │   └─ IntroModel.ts
│   └─ view/
│       ├─ IntroScreenView.ts
│       ├─ IntroScreenSummaryContent.ts
│       └─ IntroKeyboardHelpContent.ts
└─ lab-screen/
    ├─ LabScreen.ts
    ├─ model/
    │   └─ LabModel.ts
    └─ view/
        ├─ LabScreenView.ts
        ├─ LabScreenSummaryContent.ts
        └─ LabKeyboardHelpContent.ts
```

Each screen file follows the same `Screen<Model, View>` pattern as the
existing `OscilloscopeScreen.ts`. Screen icons live in one shared module under
`src/common/` (see [Home screen icons](#home-screen-icons)) — do **not** put
a `*ScreenIcon.ts` next to each screen.

### 4 — (Optional) Create a shared root model

If screens share state, create a top-level model before constructing screens:

```typescript
// src/model/FrictionModel.ts
import { BooleanProperty, NumberProperty } from "scenerystack/axon";

export class FrictionModel {
  public readonly surfaceTypeProperty = new StringProperty("wood");
  public readonly normalForceProperty = new NumberProperty(10, { units: "N" });

  public reset(): void {
    this.surfaceTypeProperty.reset();
    this.normalForceProperty.reset();
  }
}
```

Per-screen models then take it as a constructor argument:

```typescript
// src/intro-screen/model/IntroModel.ts
export class IntroModel implements TModel {
  public constructor(public readonly shared: FrictionModel) {}

  public step(_dt: number): void { /* … */ }
  public reset(): void { this.shared.reset(); }
}
```

### 5 — Register both screens in main.ts

```typescript
// src/main.ts  (inside onReadyToLaunch)

// Shared model — created once, passed to both screens
const frictionModel = new FrictionModel();

const screens = [
  new IntroScreen(frictionModel, {
    name: stringManager.getScreenNames().introStringProperty,
    tandem: Tandem.ROOT.createTandem("introScreen"),
    backgroundColorProperty: OscilloscopeColors.backgroundColorProperty,
  }),
  new LabScreen(frictionModel, {
    name: stringManager.getScreenNames().labStringProperty,
    tandem: Tandem.ROOT.createTandem("labScreen"),
    backgroundColorProperty: OscilloscopeColors.backgroundColorProperty,
  }),
];

const sim = new Sim(stringManager.getTitleStringProperty(), screens, { … });
```

---

## Screen options reference

| Option | Type | Purpose |
|---|---|---|
| `name` | `ReadOnlyProperty<string>` | Localizable tab label |
| `tandem` | `Tandem` | PhET-iO registration root |
| `backgroundColorProperty` | `TReadOnlyProperty<Color>` | Screen background |
| `createKeyboardHelpNode` | `() => Node` | Per-screen keyboard help |
| `homeScreenIcon` | `ScreenIcon` | Icon on the home screen |
| `navigationBarIcon` | `ScreenIcon` | Smaller icon in the nav bar |
| `maxDT` | `number` | Maximum allowed dt in seconds |
| `targetFrameRate` | `number` | Target FPS for `step()` |

---

## Home screen icons

Multi-screen sims show a home screen by default. Each screen needs a
`homeScreenIcon` and usually a `navigationBarIcon`, or SceneryStack falls
back to a generic placeholder.

### Fleet convention

Put **all** screen icons in one module:

```
src/common/{SimName}ScreenIcons.ts
```

Export one factory per screen named `create{Screen}Icon()`:

| Screen | Factory |
|---|---|
| Intro | `createIntroIcon()` |
| Lab | `createLabIcon()` |
| … | `create…Icon()` |

Wire both icons in each `*Screen.ts` constructor via `optionize` defaults
(same pattern as MotionsOfTheSun / TheRamp):

```typescript
import { createIntroIcon } from "../common/FrictionScreenIcons.js";

optionize<IntroScreenOptions, EmptySelfOptions, ScreenOptions>()(
  {
    backgroundColorProperty: FrictionColors.backgroundColorProperty,
    createKeyboardHelpNode: () => new IntroKeyboardHelpContent(),
    homeScreenIcon: createIntroIcon(),
    navigationBarIcon: createIntroIcon(),
  },
  options,
);
```

Do **not** use per-screen classes like `intro-screen/IntroScreenIcon.ts`.

### Icon module skeleton

Draw on the standard PhET **548 × 373** canvas with scenery primitives and
`*Colors` `ProfileColorProperty`s so icons follow default / projector mode:

```typescript
/**
 * FrictionScreenIcons.ts
 *
 * Programmatic home-screen / navigation-bar icons for each Friction screen.
 * Drawn on the standard PhET 548 × 373 canvas using FrictionColors.
 */
import { Node, Rectangle } from "scenerystack/scenery";
import { ScreenIcon } from "scenerystack/sim";
import FrictionColors from "../FrictionColors.js";

const W = 548;
const H = 373;

function background(): Rectangle {
  return new Rectangle(0, 0, W, H, { fill: FrictionColors.backgroundColorProperty });
}

function iconFrom(content: Node): ScreenIcon {
  return new ScreenIcon(content, {
    maxIconWidthProportion: 1,
    maxIconHeightProportion: 1,
    fill: FrictionColors.backgroundColorProperty,
  });
}

export function createIntroIcon(): ScreenIcon {
  // Distinctive motif for the Intro screen (keep it readable at navbar size too).
  return iconFrom(
    new Node({
      children: [
        background(),
        new Rectangle(180, 120, 188, 133, {
          fill: FrictionColors.accentColorProperty,
          cornerRadius: 12,
        }),
      ],
    }),
  );
}

export function createLabIcon(): ScreenIcon {
  return iconFrom(
    new Node({
      children: [
        background(),
        // … Lab-specific motif …
      ],
    }),
  );
}
```

Each icon should be a miniature of what that screen is about so learners can
tell the screens apart on the home screen.

---

## Accessibility across screens

Each screen must have its own `ScreenSummaryContent` and `KeyboardHelpContent`.
The strings live under per-screen keys in the a11y block:

```json
"a11y": {
  "intro": {
    "screenSummary": { … },
    "currentDetails": "…"
  },
  "lab": {
    "screenSummary": { … },
    "currentDetails": "…"
  }
}
```

Expose them via separate methods in `StringManager`:

```typescript
public getIntroA11yStrings() { return stringProperties.a11y.intro; }
public getLabA11yStrings()   { return stringProperties.a11y.lab; }
```

