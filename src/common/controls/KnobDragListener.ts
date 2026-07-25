/**
 * KnobDragListener.ts
 *
 * The pointer behavior for a {@link RotaryKnob}: relative angular drag. The
 * pointer's motion around the dial centre advances the value — the same gesture
 * you use on a physical knob — so circular turning feels natural. Absolute-angle
 * mapping is avoided on purpose: it would jump whenever the pointer crossed the
 * 270° sweep's dead zone. Relative deltas never snap.
 */

import type { TProperty } from "scenerystack/axon";
import type { Range } from "scenerystack/dot";
import { Vector2 } from "scenerystack/dot";
import { DragListener, type Node } from "scenerystack/scenery";

/**
 * Visual sweep of the knob pointer, in radians. Must stay in sync with the
 * indicator arc drawn by {@link RotaryKnob} / {@link RotarySwitch} (270°).
 */
export const KNOB_SWEEP_RADIANS = (270 * Math.PI) / 180;

/** Ignore angle samples this close to the dial centre (atan2 is unstable there). */
const MIN_DRAG_RADIUS = 6;

/**
 * Angle of `point` about `center`, in radians: 0 at 12 o'clock, increasing
 * clockwise (matches the knob indicator's rotation convention).
 */
export function knobAngleFromCenter(center: Vector2, point: Vector2): number {
  return Math.atan2(point.x - center.x, center.y - point.y);
}

/**
 * Smallest signed turn from `from` to `to`, in (−π, π]. Unwraps the ±π
 * discontinuity of {@link knobAngleFromCenter}.
 */
export function unwrapAngleDelta(from: number, to: number): number {
  let delta = to - from;
  if (delta > Math.PI) {
    delta -= 2 * Math.PI;
  } else if (delta < -Math.PI) {
    delta += 2 * Math.PI;
  }
  return delta;
}

export class KnobDragListener extends DragListener {
  public constructor(valueProperty: TProperty<number>, range: Range, dial: Node) {
    const perRadian = range.getLength() / KNOB_SWEEP_RADIANS;
    let prevAngle = 0;
    let hasAngle = false;

    const centerOf = (): Vector2 => dial.localToGlobalPoint(new Vector2(0, 0));

    super({
      start: (event) => {
        const center = centerOf();
        const point = event.pointer.point;
        if (point.distance(center) < MIN_DRAG_RADIUS) {
          hasAngle = false;
          return;
        }
        prevAngle = knobAngleFromCenter(center, point);
        hasAngle = true;
      },
      drag: (event) => {
        const center = centerOf();
        const point = event.pointer.point;
        if (point.distance(center) < MIN_DRAG_RADIUS) {
          hasAngle = false;
          return;
        }
        const angle = knobAngleFromCenter(center, point);
        if (!hasAngle) {
          prevAngle = angle;
          hasAngle = true;
          return;
        }
        const delta = unwrapAngleDelta(prevAngle, angle);
        prevAngle = angle;
        const next = valueProperty.value + delta * perRadian;
        valueProperty.value = Math.max(range.min, Math.min(range.max, next));
      },
    });
  }
}
