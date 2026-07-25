/**
 * KnobDragListener.test.ts
 *
 * Pins the angle helpers used by rotary scrubbing: clockwise-from-12 convention
 * and ±π unwrap. A wrong sign or unwrap here makes every dial feel stuck or inverted.
 */

import { Vector2 } from "scenerystack/dot";
import { describe, expect, it } from "vitest";
import { knobAngleFromCenter, unwrapAngleDelta } from "../src/common/controls/KnobDragListener.js";

describe("knobAngleFromCenter", () => {
  const origin = new Vector2(0, 0);

  it("is 0 at 12 o'clock", () => {
    expect(knobAngleFromCenter(origin, new Vector2(0, -10))).toBeCloseTo(0);
  });

  it("increases clockwise (3 o'clock is +π/2)", () => {
    expect(knobAngleFromCenter(origin, new Vector2(10, 0))).toBeCloseTo(Math.PI / 2);
  });

  it("is ±π at 6 o'clock", () => {
    expect(Math.abs(knobAngleFromCenter(origin, new Vector2(0, 10)))).toBeCloseTo(Math.PI);
  });
});

describe("unwrapAngleDelta", () => {
  it("returns the short signed turn", () => {
    expect(unwrapAngleDelta(0, 0.2)).toBeCloseTo(0.2);
    expect(unwrapAngleDelta(0.2, 0)).toBeCloseTo(-0.2);
  });

  it("unwraps the ±π discontinuity without a full-turn jump", () => {
    const from = Math.PI - 0.1;
    const to = -Math.PI + 0.1;
    expect(unwrapAngleDelta(from, to)).toBeCloseTo(0.2);
    expect(unwrapAngleDelta(to, from)).toBeCloseTo(-0.2);
  });
});
