/**
 * RotaryKnob.ts
 *
 * A continuous rotary knob — the workhorse control of a real oscilloscope's
 * front panel. It replaces the usual on-screen slider: the user grabs the knob
 * and scrubs (drag up / right to increase, down / left to decrease), and the
 * pointer indicator rotates through a 270° sweep to show the value.
 *
 * Accessibility comes for free: the knob mixes in {@link AccessibleSlider}, so it
 * is keyboard-operable (arrow keys step the value, Page Up/Down for coarse steps,
 * Home/End for the extremes) and announces its value to assistive technology.
 * The look is a knob, not a slider track — no slider UI on screen.
 */

import { Property, type TProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { Range } from "scenerystack/dot";
import { Circle, Line, Node, type NodeOptions, Text, type TPaint, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { AccessibleSlider, type AccessibleSliderOptions } from "scenerystack/sun";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { KnobDragListener } from "./KnobDragListener.js";

const SWEEP_DEGREES = 270;
const START_DEGREES = -135; // pointer angle at the minimum value (measured from 12 o'clock, clockwise +)

export type RotaryKnobOptions = {
  /** Radius of the knob body, in pixels. */
  radius?: number;
  /** Caption drawn beneath the knob. */
  captionStringProperty?: TReadOnlyProperty<string> | null;
  /** Live value readout drawn beneath the caption. */
  valueStringProperty?: TReadOnlyProperty<string> | null;
  /** Color of the caption / readout text. */
  textFill?: TPaint;
  /** Arrow-key step; defaults to range/20. */
  keyboardStep?: number;
  shiftKeyboardStep?: number;
  pageKeyboardStep?: number;
} & Pick<NodeOptions, "accessibleName" | "accessibleHelpText" | "enabledProperty" | "visibleProperty">;

// AccessibleSlider trait mixed into Node; options are the first constructor arg.
const AccessibleSliderNode = AccessibleSlider(Node, 0);

export class RotaryKnob extends AccessibleSliderNode {
  private readonly disposeRotaryKnob: () => void;

  public constructor(valueProperty: TProperty<number>, range: Range, providedOptions?: RotaryKnobOptions) {
    const length = range.getLength();
    const radius = providedOptions?.radius ?? 24;
    const captionStringProperty = providedOptions?.captionStringProperty ?? null;
    const valueStringProperty = providedOptions?.valueStringProperty ?? null;
    const textFill = providedOptions?.textFill ?? OscilloscopeColors.textColorProperty;

    const superOptions: AccessibleSliderOptions & NodeOptions = {
      valueProperty,
      enabledRangeProperty: new Property(range),
      keyboardStep: providedOptions?.keyboardStep ?? length / 20,
      shiftKeyboardStep: providedOptions?.shiftKeyboardStep ?? length / 100,
      pageKeyboardStep: providedOptions?.pageKeyboardStep ?? length / 5,
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

    // ── Knob body ─────────────────────────────────────────────────────────────
    const body = new Circle(radius, {
      fill: OscilloscopeColors.knobBodyColorProperty,
      stroke: OscilloscopeColors.knobRimColorProperty,
      lineWidth: 2,
    });

    // Faint inner disc for a machined-metal feel.
    const innerDisc = new Circle(radius * 0.6, {
      fill: OscilloscopeColors.knobRimColorProperty,
      opacity: 0.25,
    });

    // Start / end detent ticks so the sweep limits read clearly.
    const tickAt = (deg: number): Line => {
      const rad = (deg * Math.PI) / 180;
      const inner = radius + 2;
      const outer = radius + 6;
      return new Line(Math.sin(rad) * inner, -Math.cos(rad) * inner, Math.sin(rad) * outer, -Math.cos(rad) * outer, {
        stroke: OscilloscopeColors.knobIndicatorColorProperty,
        lineWidth: 1.5,
      });
    };

    // ── Pointer indicator (rotates with the value) ────────────────────────────
    const indicator = new Line(0, 0, 0, -(radius - 5), {
      stroke: OscilloscopeColors.knobIndicatorColorProperty,
      lineWidth: 3,
      lineCap: "round",
    });

    const knob = new Node({
      children: [body, innerDisc, tickAt(START_DEGREES), tickAt(START_DEGREES + SWEEP_DEGREES), indicator],
    });

    // ── Caption + live readout ────────────────────────────────────────────────
    const labelChildren: Node[] = [knob];
    if (captionStringProperty) {
      labelChildren.push(
        new Text(captionStringProperty, { font: new PhetFont(11), fill: textFill, maxWidth: radius * 3 }),
      );
    }
    if (valueStringProperty) {
      labelChildren.push(
        new Text(valueStringProperty, {
          font: new PhetFont({ size: 11, weight: "bold" }),
          fill: textFill,
          maxWidth: radius * 3.4,
        }),
      );
    }
    this.addChild(new VBox({ spacing: 3, children: labelChildren }));

    // Rotate the indicator to reflect the value.
    const updateIndicator = (value: number) => {
      const fraction = length === 0 ? 0 : (value - range.min) / length;
      const deg = START_DEGREES + fraction * SWEEP_DEGREES;
      indicator.rotation = (deg * Math.PI) / 180;
    };
    valueProperty.link(updateIndicator);

    // ── Pointer scrub interaction ─────────────────────────────────────────────
    const dragListener = new KnobDragListener(valueProperty, range);
    knob.addInputListener(dragListener);

    this.disposeRotaryKnob = () => {
      valueProperty.unlink(updateIndicator);
      dragListener.dispose();
    };
  }

  public override dispose(): void {
    this.disposeRotaryKnob();
    super.dispose();
  }
}
