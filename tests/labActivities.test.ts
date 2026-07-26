/**
 * labActivities.test.ts
 *
 * Smoke tests for the guided lab presets: each activity leaves the model in a
 * recognizable teaching configuration.
 */

import { describe, expect, it } from "vitest";
import { OscilloscopeModel } from "../src/oscilloscope-screen/model/OscilloscopeModel.js";
import { LAB_ACTIVITIES, type LabActivityId } from "../src/oscilloscope-screen/view/labActivities.js";

function applyLab(id: LabActivityId, model: OscilloscopeModel): void {
  const activity = LAB_ACTIVITIES.find((a) => a.id === id);
  expect(activity).toBeDefined();
  activity?.apply(model);
}

describe("LAB_ACTIVITIES", () => {
  it("exposes the four classroom challenges", () => {
    expect(LAB_ACTIVITIES.map((a) => a.id)).toEqual(["measureVpp", "normalTrigger", "thirdHarmonic", "lissajous90"]);
  });

  it("measureVpp sets a DC-coupled square on CH1", () => {
    const model = new OscilloscopeModel();
    applyLab("measureVpp", model);
    expect(model.functionGenerator.waveformProperty.value).toBe("square");
    expect(model.ch1.inputProperty.value).toBe("functionGeneratorA");
    expect(model.displayModeProperty.value).toBe("yt");
    model.dispose();
  });

  it("normalTrigger arms Normal mode above the peaks", () => {
    const model = new OscilloscopeModel();
    applyLab("normalTrigger", model);
    expect(model.trigger.modeProperty.value).toBe("normal");
    expect(model.trigger.levelProperty.value).toBeGreaterThan(1);
    model.dispose();
  });

  it("thirdHarmonic opens FFT with cursors on", () => {
    const model = new OscilloscopeModel();
    applyLab("thirdHarmonic", model);
    expect(model.displayModeProperty.value).toBe("fft");
    expect(model.cursorsEnabledProperty.value).toBe(true);
    model.dispose();
  });

  it("lissajous90 enables CH2 from OUT B in X-Y", () => {
    const model = new OscilloscopeModel();
    applyLab("lissajous90", model);
    expect(model.displayModeProperty.value).toBe("xy");
    expect(model.ch2.inputProperty.value).toBe("functionGeneratorB");
    expect(model.functionGenerator.phaseProperty.value).toBe(90);
    model.dispose();
  });
});
