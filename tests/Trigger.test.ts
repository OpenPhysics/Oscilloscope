/**
 * Trigger.test.ts
 *
 * Unit tests for the trigger system's defaults and reset behavior.
 */

import { describe, expect, it } from "vitest";
import { Trigger } from "../src/oscilloscope-screen/model/Trigger.js";

describe("Trigger", () => {
  it("defaults to a rising-edge, auto-mode trigger on CH1 at 0 V", () => {
    const trigger = new Trigger();
    expect(trigger.sourceProperty.value).toBe("ch1");
    expect(trigger.levelProperty.value).toBe(0);
    expect(trigger.slopeProperty.value).toBe("rising");
    expect(trigger.modeProperty.value).toBe("auto");
    trigger.dispose();
  });

  it("reset() restores every trigger control", () => {
    const trigger = new Trigger();
    trigger.sourceProperty.value = "ch2";
    trigger.levelProperty.value = 1.5;
    trigger.slopeProperty.value = "falling";
    trigger.modeProperty.value = "single";

    trigger.reset();

    expect(trigger.sourceProperty.value).toBe("ch1");
    expect(trigger.levelProperty.value).toBe(0);
    expect(trigger.slopeProperty.value).toBe("rising");
    expect(trigger.modeProperty.value).toBe("auto");
    trigger.dispose();
  });
});
