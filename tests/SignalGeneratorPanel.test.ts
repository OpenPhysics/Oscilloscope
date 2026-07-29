/**
 * The generator panel's frequency slider runs on a log10 companion Property, so the
 * conversions back and forth have to stay inside the model Property's declared
 * range even where binary floating point does not round-trip exactly.
 */

import { enableAssert } from "scenerystack/assert";
import { NumberProperty } from "scenerystack/axon";
import { beforeAll, describe, expect, it } from "vitest";
import { DisposalBag } from "../src/common/DisposalBag.js";
import { FG_FREQUENCY_RANGE } from "../src/OscilloscopeConstants.js";
import { createLog10Property } from "../src/oscilloscope-screen/view/SignalGeneratorPanel.js";

describe("createLog10Property", () => {
  beforeAll(() => {
    // The sim enables SceneryStack assertions at startup, and it is the range
    // assertion on the linear Property that this guards against.
    enableAssert();
  });

  it("keeps the linear Property in range at the top of the log sweep", () => {
    const bag = new DisposalBag();
    const frequency = new NumberProperty(200, { range: FG_FREQUENCY_RANGE, units: "Hz" });
    const log = createLog10Property(frequency, FG_FREQUENCY_RANGE, bag);

    // What the slider does on End / drag-to-the-right-edge.
    expect(() => {
      log.value = log.range.max;
    }).not.toThrow();
    expect(FG_FREQUENCY_RANGE.contains(frequency.value)).toBe(true);
    expect(frequency.value).toBeCloseTo(FG_FREQUENCY_RANGE.max, 6);

    bag.dispose();
    frequency.dispose();
  });

  it("keeps the linear Property in range at the bottom of the log sweep", () => {
    const bag = new DisposalBag();
    const frequency = new NumberProperty(200, { range: FG_FREQUENCY_RANGE, units: "Hz" });
    const log = createLog10Property(frequency, FG_FREQUENCY_RANGE, bag);

    expect(() => {
      log.value = log.range.min;
    }).not.toThrow();
    expect(FG_FREQUENCY_RANGE.contains(frequency.value)).toBe(true);
    expect(frequency.value).toBeCloseTo(FG_FREQUENCY_RANGE.min, 6);

    bag.dispose();
    frequency.dispose();
  });

  it("tracks the linear Property when the model drives it (Reset All, Autoset, labs)", () => {
    const bag = new DisposalBag();
    const frequency = new NumberProperty(200, { range: FG_FREQUENCY_RANGE, units: "Hz" });
    const log = createLog10Property(frequency, FG_FREQUENCY_RANGE, bag);

    frequency.value = 2000;
    expect(log.value).toBeCloseTo(Math.log10(2000), 9);
    expect(log.range.contains(log.value)).toBe(true);

    bag.dispose();
    frequency.dispose();
  });

  it("round-trips a value set through the log Property", () => {
    const bag = new DisposalBag();
    const frequency = new NumberProperty(200, { range: FG_FREQUENCY_RANGE, units: "Hz" });
    const log = createLog10Property(frequency, FG_FREQUENCY_RANGE, bag);

    log.value = Math.log10(440);
    expect(frequency.value).toBeCloseTo(440, 6);

    bag.dispose();
    frequency.dispose();
  });
});
