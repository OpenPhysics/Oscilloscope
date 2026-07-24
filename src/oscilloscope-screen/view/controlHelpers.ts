/**
 * controlHelpers.ts
 *
 * Small factories shared by the front-panel control panels: they turn value
 * tables into {@link RotarySwitchItem} lists and wrap model Properties in the
 * short, formatted string Properties that the knobs display as live readouts.
 */

import { DerivedProperty, Property, type TReadOnlyProperty } from "scenerystack/axon";
import type { RotarySwitchItem } from "../../common/controls/RotarySwitch.js";

/** A constant (non-localized) string as a read-only Property, e.g. a unit label. */
export function constantString(value: string): TReadOnlyProperty<string> {
  return new Property(value);
}

/** Switch positions for a numeric table (volts/div, time/div), formatted to labels. */
export function numberItems(values: readonly number[], format: (value: number) => string): RotarySwitchItem<number>[] {
  return values.map((value) => ({ value, stringProperty: constantString(format(value)) }));
}

/** Switch positions for a string-union table, using localized label Properties. */
export function unionItems<T extends string>(
  values: readonly T[],
  labels: Record<T, TReadOnlyProperty<string>>,
): RotarySwitchItem<T>[] {
  return values.map((value) => ({ value, stringProperty: labels[value] }));
}

/** A live, formatted readout string derived from a numeric model Property. */
export function derivedString<T>(
  property: TReadOnlyProperty<T>,
  format: (value: T) => string,
): TReadOnlyProperty<string> {
  return new DerivedProperty([property], format);
}
