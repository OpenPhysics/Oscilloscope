/**
 * KnobDragListener.ts
 *
 * The pointer behavior for a {@link RotaryKnob}: a "scrub" drag. Rather than map
 * the pointer's absolute angle to the value (which jumps when the pointer crosses
 * the knob's dead zone), it accumulates the drag motion — up / right increases,
 * down / left decreases — and steps the value smoothly. This feels like turning a
 * real knob and never snaps.
 */

import type { TProperty } from "scenerystack/axon";
import type { Range } from "scenerystack/dot";
import { DragListener } from "scenerystack/scenery";

/** Pixels of drag motion that sweep the control across its full range. */
const FULL_SCALE_PIXELS = 220;

export class KnobDragListener extends DragListener {
  public constructor(valueProperty: TProperty<number>, range: Range) {
    const perPixel = range.getLength() / FULL_SCALE_PIXELS;
    let prevX = 0;
    let prevY = 0;

    super({
      start: (event) => {
        prevX = event.pointer.point.x;
        prevY = event.pointer.point.y;
      },
      drag: (event) => {
        const { x, y } = event.pointer.point;
        // Drag up (−y) or right (+x) increases the value.
        const deltaPixels = x - prevX - (y - prevY);
        prevX = x;
        prevY = y;
        const next = valueProperty.value + deltaPixels * perPixel;
        valueProperty.value = Math.max(range.min, Math.min(range.max, next));
      },
    });
  }
}
