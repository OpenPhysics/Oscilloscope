/**
 * OscilloscopeColors.ts
 *
 * Defines all dynamic colors for the simulation using ProfileColorProperty.
 *
 * Each color has two profiles:
 *   - "default"   — used in standard (dark) mode
 *   - "projector" — used when the user enables Projector Mode in Preferences
 *
 * SceneryStack switches profiles automatically; no manual toggling is needed.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 * Import OscilloscopeColors and pass properties directly to Node's fillProperty or
 * strokeProperty options:
 *
 *   import OscilloscopeColors from "../../OscilloscopeColors.js";
 *
 *   new Rectangle( 0, 0, 100, 50, {
 *     fillProperty: OscilloscopeColors.backgroundColorProperty,
 *   });
 *
 * ── How to add a color ────────────────────────────────────────────────────────
 * Add a new ProfileColorProperty entry to the OscilloscopeColors object below.
 * Always provide both "default" and "projector" values.
 */
import { ProfileColorProperty } from "scenerystack/scenery";
import OscilloscopeNamespace from "./OscilloscopeNamespace.js";

const OscilloscopeColors = {
  /**
   * Background color for the simulation screen.
   * Deep navy in default mode; white in projector mode.
   */
  backgroundColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "background", {
    default: "#1a1a2e",
    projector: "#ffffff",
  }),

  /**
   * Primary accent color for highlights, selected items, and key UI elements.
   * Sky blue in default mode; dark navy in projector mode.
   */
  accentColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "accent", {
    default: "#4fc3f7",
    projector: "#1a1a2e",
  }),

  /**
   * Background fill for control panels and dialogs.
   * Deep blue in default mode; light gray in projector mode.
   */
  panelBackgroundColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "panelBackground", {
    default: "#16213e",
    projector: "#f5f5f5",
  }),

  /**
   * Border/stroke color for control panels and dialogs.
   * Teal-navy in default mode; medium gray in projector mode.
   */
  panelBorderColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "panelBorder", {
    default: "#0f3460",
    projector: "#999999",
  }),

  /**
   * Text color for labels, readouts, and general UI text.
   * Near-white in default mode; near-black in projector mode.
   */
  textColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "text", {
    default: "#e0e0e0",
    projector: "#1a1a1a",
  }),

  // ── Light control surfaces ───────────────────────────────────────────────────
  // White chrome (combo boxes, flat push buttons, editable input fields) stays light
  // in both profiles; its text stays dark. Same values in default and projector mode,
  // but defined here so every color lives in one themeable place.

  /** Fill of light control surfaces: combo-box button/list, editable input fields. */
  controlSurfaceColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "controlSurface", {
    default: "#ffffff",
    projector: "#ffffff",
  }),

  /** Fill of a disabled control surface (grayed-out editable input field). */
  controlSurfaceDisabledColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "controlSurfaceDisabled", {
    default: "#cccccc",
    projector: "#cccccc",
  }),

  /** Text on light control surfaces: combo items, flat-button labels, field values, preferences. */
  controlSurfaceTextColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "controlSurfaceText", {
    default: "#1a1a1a",
    projector: "#1a1a1a",
  }),

  // ── Oscilloscope display (CRT phosphor screen) ───────────────────────────────
  // The display keeps a dark "CRT" face in both profiles so the glowing trace and
  // graticule read the same on a projector as on screen.

  /** Fill of the oscilloscope screen face (the CRT). Dark in both profiles. */
  displayBackgroundColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "displayBackground", {
    default: "#04140b",
    projector: "#04140b",
  }),

  /** Border framing the oscilloscope screen. */
  displayBorderColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "displayBorder", {
    default: "#2e6b47",
    projector: "#2e6b47",
  }),

  /** Faint graticule grid lines drawn across the display. */
  graticuleColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "graticule", {
    default: "#1f6b3a",
    projector: "#1f6b3a",
  }),

  /** Brighter center cross-hair axes of the graticule. */
  graticuleAxisColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "graticuleAxis", {
    default: "#3fa564",
    projector: "#3fa564",
  }),

  /** The glowing waveform trace (phosphor green). */
  traceColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "trace", {
    default: "#4dff88",
    projector: "#4dff88",
  }),

  /** On-screen measurement readout text overlaid on the display. */
  displayReadoutColorProperty: new ProfileColorProperty(OscilloscopeNamespace, "displayReadout", {
    default: "#8effc0",
    projector: "#8effc0",
  }),
};

export default OscilloscopeColors;
