# Oscilloscope

A single-screen [SceneryStack](https://scenerystack.org/) simulation of a bench oscilloscope.
Feed it a synthetic signal from the built-in **function generator** or **live microphone audio**,
and watch the waveform sweep across a phosphor-green CRT graticule. Built with Vite 8,
TypeScript 7, and Biome 2.

## Features

- **CRT display** — 10 × 8 graticule with center cross-hair, subdivision ticks, and a glowing trace
- **Function generator** — sine / square / triangle / sawtooth, adjustable frequency (20–2000 Hz)
  and amplitude (0–2.5 V)
- **Microphone source** — displays the live audio waveform via the Web Audio API (with graceful
  fallback when unavailable or permission is denied)
- **Scope controls** — 1-2-5 stepped volts/div and time/div pickers, plus Run/Stop and single-step
- **On-screen measurements** — live frequency, period, and peak-to-peak voltage readout
  (toggle in Preferences → Simulation)
- Full Interactive Description accessibility (screen summary, live details, PDOM order, keyboard help)
- English, Spanish, and French localization via `StringManager`
- Default and projector color profiles
- Progressive Web App (installable, offline-capable)

## Quick Start

```bash
npm install
npm run icons    # generate PNG icons from public/icons/icon.svg
npm start        # dev server → http://localhost:5173
```

> The microphone source requires a browser that grants microphone permission over a secure
> (HTTPS or localhost) origin. Without it, the audio trace is a flat line and the status line
> explains why.

## Scripts

| Command | Description |
|---|---|
| `npm start` / `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest unit tests (includes memory-leak suite) |
| `npm run test:fuzz` | Optional Playwright fuzz smoke (`?fuzz`, default 15s) |
| `npm run test:fuzz:quick` | Shorter fuzz smoke (10s) |
| `npm run check` | TypeScript type check |
| `npm run lint` | Biome lint check |
| `npm run format` | Auto-format all files |
| `npm run fix` | Lint + auto-fix |
| `npm run icons` | Regenerate PNG icons from `public/icons/icon.svg` |
| `npm run rename` | Fork this template to a new sim id/name |
| `npm run clean` | Remove `dist/` |

New sims start at `version: "0.0.0"` in `package.json`. Bump only when cutting a release (for example `npm version patch` and a matching git tag). Keep `name` in kebab-case; it is separate from the SceneryStack sim identifier in `src/init.ts`.

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [SceneryStack](https://scenerystack.org/) | ^3.0.0 | Simulation framework |
| [Vite](https://vitejs.dev/) | ^8 | Build tool + dev server |
| [TypeScript](https://www.typescriptlang.org/) | ^7 | Type-safe JavaScript |
| [Biome](https://biomejs.dev/) | ^2.5 | Linting + formatting |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | ^1 | PWA + service worker |

## License

GNU Affero General Public License v3.0 — see [OpenPhysics org license](https://github.com/OpenPhysics/.github/blob/main/LICENSE).

## Contributing

See [OpenPhysics contributing guidelines](https://github.com/OpenPhysics/.github/blob/main/CONTRIBUTING.md).
Report bugs via GitHub Issues; use org issue templates.
