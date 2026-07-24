/**
 * Channel.test.ts
 *
 * Unit tests for a single vertical input channel: its initial state honours the
 * construction options, and reset() restores every per-channel control.
 */

import { describe, expect, it } from "vitest";
import { Channel } from "../src/oscilloscope-screen/model/Channel.js";

describe("Channel", () => {
  it("initializes from its construction options", () => {
    const ch = new Channel({ index: 2, initiallyEnabled: false, initialVoltsPerDivision: 0.1 });
    expect(ch.index).toBe(2);
    expect(ch.enabledProperty.value).toBe(false);
    expect(ch.voltsPerDivision).toBe(0.1);
    expect(ch.couplingProperty.value).toBe("DC");
    expect(ch.invertedProperty.value).toBe(false);
    expect(ch.positionProperty.value).toBe(0);
    ch.dispose();
  });

  it("reset() restores every per-channel control to its initial state", () => {
    const ch = new Channel({ index: 1, initiallyEnabled: true, initialVoltsPerDivision: 0.5 });
    ch.enabledProperty.value = false;
    ch.voltsPerDivisionProperty.value = 2;
    ch.positionProperty.value = 3;
    ch.couplingProperty.value = "AC";
    ch.invertedProperty.value = true;

    ch.reset();

    expect(ch.enabledProperty.value).toBe(true);
    expect(ch.voltsPerDivision).toBe(0.5);
    expect(ch.positionProperty.value).toBe(0);
    expect(ch.couplingProperty.value).toBe("DC");
    expect(ch.invertedProperty.value).toBe(false);
    ch.dispose();
  });
});
