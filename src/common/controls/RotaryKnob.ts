/**
 * RotaryKnob.ts
 *
 * A continuous rotary knob — the workhorse control of a real oscilloscope's
 * front panel. It replaces the usual on-screen slider: the user grabs the knob
 * and turns it (relative angular drag around the dial centre), and the
 * pointer indicator rotates through a 270° sweep to show the value.
 *
 * Accessibility comes for free: the knob mixes in {@link AccessibleSlider}, so it
 * is keyboard-operable (arrow keys step the value, Page Up/Down for coarse steps,
 * Home/End for the extremes) and announces its value to assistive technology.
 * The look is a knob, not a slider track — no slider UI on screen.
 */

import { Property, type TProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { Range } from "scenerystack/dot";
import { optionize } from "scenerystack/phet-core";
import { Circle, Line, Node, type NodeOptions, Text, type TPaint, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { AccessibleSlider, type AccessibleSliderOptions } from "scenerystack/sun";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { KnobDragListener } from "./KnobDragListener.js";

const SWEEP_DEGREES = 270;
const START_DEGREES = -135; // pointer angle at the minimum value (measured from 12 o'clock, clockwise +)

/** Fractions of the full range used for the default keyboard step sizes. */
const KEYBOARD_STEP_FRACTION = 1 / 20;
const SHIFT_KEYBOARD_STEP_FRACTION = 1 / 100;
const PAGE_KEYBOARD_STEP_FRACTION = 1 / 5;

type SelfOptions = {
  /** Radius of the knob body, in pixels. */
  radius?: number;
  /** Caption drawn beneath the knob. */
  captionStringProperty?: TReadOnlyProperty<string> | null;
  /** Live value readout drawn beneath the caption. */
  valueStringProperty?: TReadOnlyProperty<string> | null;
  /** Color of the caption / readout text. */
  textFill?: TPaint;
};

type ParentOptions = AccessibleSliderOptions &
  Pick<NodeOptions, "accessibleName" | "accessibleHelpText" | "enabledProperty" | "visibleProperty" | "cursor">;

export type RotaryKnobOptions = SelfOptions &
  Pick<
    ParentOptions,
    | "accessibleName"
    | "accessibleHelpText"
    | "enabledProperty"
    | "visibleProperty"
    | "keyboardStep"
    | "shiftKeyboardStep"
    | "pageKeyboardStep"
  >;

// AccessibleSlider trait mixed into Node; options are the first constructor arg.
const AccessibleSliderNode = AccessibleSlider(Node, 0);

export class RotaryKnob extends AccessibleSliderNode {
  private readonly disposeRotaryKnob: () => void;

  public constructor(valueProperty: TProperty<number>, range: Range, providedOptions?: RotaryKnobOptions) {
    const length = range.getLength();
    const enabledRangeProperty = new Property(range);

    const options = optionize<RotaryKnobOptions, SelfOptions, ParentOptions>()(
      {
        radius: 24,
        captionStringProperty: null,
        valueStringProperty: null,
        textFill: OscilloscopeColors.textColorProperty,
        // AccessibleSlider:
        valueProperty,
        enabledRangeProperty,
        keyboardStep: length * KEYBOARD_STEP_FRACTION,
        shiftKeyboardStep: length * SHIFT_KEYBOARD_STEP_FRACTION,
        pageKeyboardStep: length * PAGE_KEYBOARD_STEP_FRACTION,
        cursor: "pointer",
      },
      providedOptions,
    );

    const { radius, captionStringProperty, valueStringProperty, textFill } = options;

    super(options);

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
    // Dial faces are small (~40 px across); inflate the pick target so they are
    // easy to grab without hunting for the rim.
    knob.mouseArea = knob.localBounds.dilated(14);
    knob.touchArea = knob.localBounds.dilated(18);

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

    // ── Pointer turn interaction (relative angle about the dial centre) ───────
    const dragListener = new KnobDragListener(valueProperty, range, knob);
    knob.addInputListener(dragListener);

    this.disposeRotaryKnob = () => {
      valueProperty.unlink(updateIndicator);
      knob.removeInputListener(dragListener);
      dragListener.dispose();
      enabledRangeProperty.dispose();
    };
  }

  public override dispose(): void {
    this.disposeRotaryKnob();
    super.dispose();
  }
}
