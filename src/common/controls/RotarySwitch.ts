/**
 * RotarySwitch.ts
 *
 * A detented rotary selector — the multi-position switch a real oscilloscope
 * uses for volts/div, time/div, coupling, trigger source, and so on. It steps
 * through a fixed list of positions: the pointer snaps to the selected detent,
 * ticks mark every position around the dial, and a bold readout beneath shows
 * the current selection.
 *
 * Like {@link RotaryKnob} it is built on {@link AccessibleSlider} (over an internal
 * integer index), so arrow keys, Home/End and Page Up/Down all work and the
 * selection is announced to assistive technology. Dragging the dial (scrub)
 * clicks it from position to position. No slider UI is shown.
 */

import {
  DerivedProperty,
  NumberProperty,
  type PhetioProperty,
  Property,
  type TReadOnlyProperty,
} from "scenerystack/axon";
import { clamp, Range, roundSymmetric } from "scenerystack/dot";
import { Circle, DragListener, Line, Node, type NodeOptions, Text, type TPaint, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { AccessibleSlider, type AccessibleSliderOptions } from "scenerystack/sun";
import OscilloscopeColors from "../../OscilloscopeColors.js";

const SWEEP_DEGREES = 270;
const START_DEGREES = -135;
const STEP_PIXELS = 26; // drag distance that advances one position

/** One selectable position of the switch. */
export type RotarySwitchItem<T> = {
  readonly value: T;
  readonly stringProperty: TReadOnlyProperty<string>;
};

type SelfOptions = {
  radius?: number;
  captionStringProperty?: TReadOnlyProperty<string> | null;
  textFill?: TPaint;
  /** Paint for the selected-position readout (defaults to {@link SelfOptions.textFill}). */
  readoutFill?: TPaint;
};

export type RotarySwitchOptions = SelfOptions &
  Pick<
    NodeOptions,
    "accessibleName" | "accessibleHelpText" | "enabledProperty" | "visibleProperty" | "cursor" | "scale"
  >;

const AccessibleSliderNode = AccessibleSlider(Node, 0);

export class RotarySwitch<T> extends AccessibleSliderNode {
  private readonly disposeRotarySwitch: () => void;

  public constructor(
    property: PhetioProperty<T>,
    items: readonly RotarySwitchItem<T>[],
    providedOptions?: RotarySwitchOptions,
  ) {
    const count = items.length;
    const maxIndex = Math.max(0, count - 1);

    const indexForValue = (value: T): number => {
      const i = items.findIndex((item) => item.value === value);
      return i < 0 ? 0 : i;
    };

    const indexProperty = new NumberProperty(indexForValue(property.value), {
      range: new Range(0, maxIndex),
    });

    const radius = providedOptions?.radius ?? 24;
    const captionStringProperty = providedOptions?.captionStringProperty ?? null;
    const textFill = providedOptions?.textFill ?? OscilloscopeColors.textColorProperty;
    const readoutFill = providedOptions?.readoutFill ?? OscilloscopeColors.textColorProperty;

    const superOptions: AccessibleSliderOptions & NodeOptions = {
      valueProperty: indexProperty,
      enabledRangeProperty: new Property(new Range(0, maxIndex)),
      keyboardStep: 1,
      shiftKeyboardStep: 1,
      pageKeyboardStep: Math.max(1, Math.floor(count / 4)),
      constrainValue: (value: number) => clamp(roundSymmetric(value), 0, maxIndex),
      roundToStepSize: true,
      cursor: "pointer",
    };
    if (providedOptions?.accessibleName !== undefined) {
      superOptions.accessibleName = providedOptions.accessibleName;
    }
    if (providedOptions?.accessibleHelpText !== undefined) {
      superOptions.accessibleHelpText = providedOptions.accessibleHelpText;
    }
    if (providedOptions?.enabledProperty !== undefined) {
      superOptions.enabledProperty = providedOptions.enabledProperty;
    }
    if (providedOptions?.visibleProperty !== undefined) {
      superOptions.visibleProperty = providedOptions.visibleProperty;
    }

    super(superOptions);

    // ── Dial body ─────────────────────────────────────────────────────────────
    const body = new Circle(radius, {
      fill: OscilloscopeColors.knobBodyColorProperty,
      stroke: OscilloscopeColors.knobRimColorProperty,
      lineWidth: 2,
    });
    const innerDisc = new Circle(radius * 0.6, {
      fill: OscilloscopeColors.knobRimColorProperty,
      opacity: 0.25,
    });

    // A detent tick for every position.
    const tickChildren: Node[] = [];
    for (let i = 0; i < count; i++) {
      const fraction = count <= 1 ? 0.5 : i / maxIndex;
      const deg = START_DEGREES + fraction * SWEEP_DEGREES;
      const rad = (deg * Math.PI) / 180;
      const inner = radius + 2;
      const outer = radius + 6;
      tickChildren.push(
        new Line(Math.sin(rad) * inner, -Math.cos(rad) * inner, Math.sin(rad) * outer, -Math.cos(rad) * outer, {
          stroke: OscilloscopeColors.knobIndicatorColorProperty,
          lineWidth: 1.5,
        }),
      );
    }

    const indicator = new Line(0, 0, 0, -(radius - 5), {
      stroke: OscilloscopeColors.knobIndicatorColorProperty,
      lineWidth: 3,
      lineCap: "round",
    });

    const dial = new Node({ children: [body, innerDisc, ...tickChildren, indicator] });

    // ── Caption + selected-position readout ───────────────────────────────────
    const readoutStringProperty = DerivedProperty.deriveAny(
      [indexProperty, ...items.map((item) => item.stringProperty)],
      () => {
        const i = clamp(roundSymmetric(indexProperty.value), 0, maxIndex);
        return items[i]?.stringProperty.value ?? "";
      },
    );

    const labelChildren: Node[] = [dial];
    if (captionStringProperty) {
      labelChildren.push(
        new Text(captionStringProperty, {
          font: new PhetFont(11),
          fill: textFill,
          maxWidth: radius * 3.4,
        }),
      );
    }
    labelChildren.push(
      new Text(readoutStringProperty, {
        font: new PhetFont({ size: 12, weight: "bold" }),
        fill: readoutFill,
        maxWidth: radius * 3.6,
      }),
    );
    this.addChild(new VBox({ spacing: 3, children: labelChildren }));

    // ── Keep the model value, index, and pointer in sync ──────────────────────
    let syncing = false;
    const updatePointer = (index: number): void => {
      const fraction = count <= 1 ? 0.5 : clamp(index, 0, maxIndex) / maxIndex;
      const deg = START_DEGREES + fraction * SWEEP_DEGREES;
      indicator.rotation = (deg * Math.PI) / 180;
    };

    const indexListener = (rawIndex: number): void => {
      const index = clamp(roundSymmetric(rawIndex), 0, maxIndex);
      updatePointer(index);
      if (!syncing) {
        syncing = true;
        property.value = items[index]?.value ?? property.value;
        syncing = false;
      }
    };
    indexProperty.link(indexListener);

    const propertyListener = (value: T): void => {
      if (syncing) {
        return;
      }
      syncing = true;
      indexProperty.value = indexForValue(value);
      syncing = false;
    };
    property.link(propertyListener);

    // ── Pointer scrub: drag advances the dial detent by detent ────────────────
    let prevX = 0;
    let prevY = 0;
    let accum = 0;
    const setIndex = (index: number): void => {
      indexProperty.value = clamp(index, 0, maxIndex);
    };
    const dragListener = new DragListener({
      start: (event) => {
        accum = 0;
        prevX = event.pointer.point.x;
        prevY = event.pointer.point.y;
      },
      drag: (event) => {
        const { x, y } = event.pointer.point;
        accum += x - prevX - (y - prevY);
        prevX = x;
        prevY = y;
        while (accum >= STEP_PIXELS) {
          accum -= STEP_PIXELS;
          setIndex(roundSymmetric(indexProperty.value) + 1);
        }
        while (accum <= -STEP_PIXELS) {
          accum += STEP_PIXELS;
          setIndex(roundSymmetric(indexProperty.value) - 1);
        }
      },
    });
    dial.addInputListener(dragListener);

    this.disposeRotarySwitch = () => {
      indexProperty.unlink(indexListener);
      property.unlink(propertyListener);
      readoutStringProperty.dispose();
      dragListener.dispose();
      indexProperty.dispose();
    };
  }

  public override dispose(): void {
    this.disposeRotarySwitch();
    super.dispose();
  }
}
