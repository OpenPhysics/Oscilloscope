/**
 * MeasurementCursorNode.ts
 *
 * One draggable measurement cursor on the CRT face: a dashed line the user
 * positions to read off Δt / 1÷Δt / ΔV. A "time" cursor is a vertical line that
 * moves horizontally (its value is in horizontal divisions from the left edge); a
 * "voltage" cursor is a horizontal line that moves vertically (its value is in
 * vertical divisions from screen center, up positive).
 *
 * Like the front-panel knobs, this mixes in {@link AccessibleSlider} so the cursor
 * is focusable and operable from the keyboard — arrow keys nudge it, Page Up/Down
 * moves it a whole division, Home/End jump to the extremes — and announces its
 * value. Pointer dragging is handled alongside, and the two stay in sync because
 * both write the same model Property.
 */

import { Property, type TProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { Range, Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { DragListener, Node, type NodeOptions, Path, Rectangle } from "scenerystack/scenery";
import { AccessibleSlider, type AccessibleSliderOptions } from "scenerystack/sun";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import {
  CURSOR_KEYBOARD_STEP,
  CURSOR_PAGE_KEYBOARD_STEP,
  CURSOR_SHIFT_KEYBOARD_STEP,
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  DIVISION_SIZE,
  HORIZONTAL_DIVISIONS,
} from "../../OscilloscopeConstants.js";

/** Stroke width of the dashed cursor line, in screen pixels. */
const CURSOR_LINE_WIDTH = 1;
/** Dash pattern (px on, px off) for the dashed measurement-cursor lines. */
const CURSOR_LINE_DASH = [4, 4];
/** Half-thickness (px) of a cursor's invisible pointer hit target. */
const CURSOR_HIT_TOLERANCE = 7;
/** Transparent fill giving the otherwise-invisible cursor hit target a hittable area. */
const TRANSPARENT_HIT_FILL = "rgba(0, 0, 0, 0.01)";

/** Which axis the cursor measures along. */
export type CursorOrientation = "time" | "voltage";

export type MeasurementCursorNodeOptions = {
  /** Accessible name announced for this cursor. */
  accessibleName: TReadOnlyProperty<string>;
  /**
   * Converts a global pointer point to a cursor value, in the same divisions the
   * Property uses. Supplied by the display node, which owns the coordinate frame.
   */
  pointerToValue: (globalPoint: Vector2) => number;
};

const AccessibleSliderNode = AccessibleSlider(Node, 0);

export class MeasurementCursorNode extends AccessibleSliderNode {
  private readonly disposeMeasurementCursorNode: () => void;

  public constructor(
    valueProperty: TProperty<number>,
    range: Range,
    orientation: CursorOrientation,
    providedOptions: MeasurementCursorNodeOptions,
  ) {
    const isTime = orientation === "time";
    const enabledRangeProperty = new Property(range);

    const superOptions: AccessibleSliderOptions & Pick<NodeOptions, "accessibleName" | "cursor"> = {
      valueProperty,
      enabledRangeProperty,
      keyboardStep: CURSOR_KEYBOARD_STEP,
      shiftKeyboardStep: CURSOR_SHIFT_KEYBOARD_STEP,
      pageKeyboardStep: CURSOR_PAGE_KEYBOARD_STEP,
      accessibleName: providedOptions.accessibleName,
      cursor: isTime ? "ew-resize" : "ns-resize",
    };
    super(superOptions);

    // A vertical line spanning the display height, or a horizontal one spanning
    // its width. Both are drawn about the node origin and moved by translating it.
    const line = new Path(
      isTime ? Shape.lineSegment(0, 0, 0, DISPLAY_HEIGHT) : Shape.lineSegment(0, 0, DISPLAY_WIDTH, 0),
      {
        stroke: OscilloscopeColors.cursorColorProperty,
        lineWidth: CURSOR_LINE_WIDTH,
        lineDash: CURSOR_LINE_DASH,
      },
    );
    const hit = isTime
      ? new Rectangle(-CURSOR_HIT_TOLERANCE, 0, 2 * CURSOR_HIT_TOLERANCE, DISPLAY_HEIGHT, {
          fill: TRANSPARENT_HIT_FILL,
        })
      : new Rectangle(0, -CURSOR_HIT_TOLERANCE, DISPLAY_WIDTH, 2 * CURSOR_HIT_TOLERANCE, {
          fill: TRANSPARENT_HIT_FILL,
        });

    this.addChild(hit);
    this.addChild(line);

    const dragListener = new DragListener({
      drag: (event) => {
        valueProperty.value = range.constrainValue(providedOptions.pointerToValue(event.pointer.point));
      },
    });
    this.addInputListener(dragListener);

    // Translate the whole node so the line lands at the value's screen position.
    const updatePosition = (value: number): void => {
      if (isTime) {
        this.x = (value / HORIZONTAL_DIVISIONS) * DISPLAY_WIDTH;
      } else {
        this.y = DISPLAY_HEIGHT / 2 - value * DIVISION_SIZE;
      }
    };
    valueProperty.link(updatePosition);

    this.disposeMeasurementCursorNode = () => {
      valueProperty.unlink(updatePosition);
      this.removeInputListener(dragListener);
      dragListener.dispose();
      enabledRangeProperty.dispose();
      line.dispose();
      hit.dispose();
    };
  }

  public override dispose(): void {
    this.disposeMeasurementCursorNode();
    super.dispose();
  }
}
