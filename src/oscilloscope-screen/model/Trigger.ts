/**
 * Trigger.ts
 *
 * The oscilloscope's trigger system, which decides where along the signal each
 * sweep begins so that a repetitive waveform appears to stand still. It owns the
 * front-panel trigger controls:
 *
 *   - source — which channel the trigger watches (CH1 or CH2)
 *   - level  — the voltage the signal must cross to fire (a draggable line on screen)
 *   - slope  — whether it fires on the rising or falling edge
 *   - mode   — auto (free-run if untriggered), normal (only on a trigger), or
 *              single (arm once, capture one sweep, then stop)
 */

import { NumberProperty, StringUnionProperty } from "scenerystack/axon";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";
import { SCOPE_TRIGGER_LEVEL_RANGE } from "../../SimConstants.js";

/** Which channel the trigger comparator watches. */
export const TRIGGER_SOURCES = ["ch1", "ch2"] as const;
export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

/** Which edge of the signal fires the trigger. */
export const TRIGGER_SLOPES = ["rising", "falling"] as const;
export type TriggerSlope = (typeof TRIGGER_SLOPES)[number];

/** Trigger arming mode. */
export const TRIGGER_MODES = ["auto", "normal", "single"] as const;
export type TriggerMode = (typeof TRIGGER_MODES)[number];

export class Trigger {
  /** Channel the trigger watches. */
  public readonly sourceProperty = new StringUnionProperty<TriggerSource>("ch1", {
    validValues: [...TRIGGER_SOURCES],
  });

  /** Trigger threshold voltage. */
  public readonly levelProperty = new NumberProperty(0, {
    range: SCOPE_TRIGGER_LEVEL_RANGE,
    units: "V",
  });

  /** Edge that fires the trigger. */
  public readonly slopeProperty = new StringUnionProperty<TriggerSlope>("rising", {
    validValues: [...TRIGGER_SLOPES],
  });

  /** Arming mode. */
  public readonly modeProperty = new StringUnionProperty<TriggerMode>("auto", {
    validValues: [...TRIGGER_MODES],
  });

  public reset(): void {
    this.sourceProperty.reset();
    this.levelProperty.reset();
    this.slopeProperty.reset();
    this.modeProperty.reset();
  }

  public dispose(): void {
    this.sourceProperty.dispose();
    this.levelProperty.dispose();
    this.slopeProperty.dispose();
    this.modeProperty.dispose();
  }
}

OscilloscopeNamespace.register("Trigger", Trigger);
