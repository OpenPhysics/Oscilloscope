/**
 * oscilloscopeQueryParameters.ts
 *
 * Sim-specific startup query parameters. This is the single place where every
 * sim-specific query parameter is declared and documented. Public-facing
 * parameters (intended for end users / sharing links) must set `public: true`.
 *
 * ── How to add a query parameter ──────────────────────────────────────────────
 * 1. Add an entry below with a `type`, `defaultValue`, and (if user-facing)
 *    `public: true`. Add `isValidValue` to bound numeric ranges.
 * 2. If it should also be user-editable at runtime, surface it as a preference
 *    in OscilloscopePreferencesModel (initialize that Property from this query parameter).
 *
 * Usage: append e.g. `?measurements=false` to the sim URL.
 */

import { logGlobal } from "scenerystack/phet-core";
import { QueryStringMachine } from "scenerystack/query-string-machine";
import OscilloscopeNamespace from "../OscilloscopeNamespace.js";

const oscilloscopeQueryParameters = QueryStringMachine.getAll({
  /**
   * Whether the on-screen measurement readout (frequency, period, Vpp) is shown
   * over the display on startup. Also toggled at runtime in Preferences → Simulation.
   */
  measurements: {
    type: "boolean",
    defaultValue: true,
    public: true,
  },

  /**
   * Whether additive signal noise is injected on startup. Also toggled at
   * runtime in Preferences → Simulation, for signal-to-noise discussions.
   */
  noise: {
    type: "boolean",
    defaultValue: false,
    public: true,
  },

  /** Startup amplitude of the injected noise, in volts. */
  noiseAmplitude: {
    type: "number",
    defaultValue: 0.15,
    isValidValue: (value: number) => value >= 0 && value <= 1,
    public: true,
  },
});

OscilloscopeNamespace.register("oscilloscopeQueryParameters", oscilloscopeQueryParameters);

// Log query parameters (for the console / PhET-iO).
logGlobal("phet.chipper.queryParameters");

export default oscilloscopeQueryParameters;
