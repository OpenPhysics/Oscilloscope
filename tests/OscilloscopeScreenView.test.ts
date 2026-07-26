/**
 * View-level behaviour that the model alone cannot pin down: which frequency the
 * automatic readout reports, when the phase row has nothing to say, and that the
 * persistence afterglow actually retains more than the sweep already on screen.
 *
 * The view is constructed against a real model; `step()` drives one frame exactly
 * as joist does. Note that ScreenView is deliberately not disposable (see
 * memory-leak.test.ts), so these models are left to the test runner.
 */

import { BooleanProperty } from "scenerystack/axon";
import { type Node, Path } from "scenerystack/scenery";
import { Tandem } from "scenerystack/tandem";
import { describe, expect, it } from "vitest";
import { OscilloscopeModel } from "../src/oscilloscope-screen/model/OscilloscopeModel.js";
import { OscilloscopeDisplayNode } from "../src/oscilloscope-screen/view/OscilloscopeDisplayNode.js";
import { OscilloscopeScreenView } from "../src/oscilloscope-screen/view/OscilloscopeScreenView.js";

function createView(model: OscilloscopeModel): OscilloscopeScreenView {
  return new OscilloscopeScreenView(model, {
    showMeasurementsProperty: new BooleanProperty(true),
    tandem: Tandem.OPT_OUT,
  });
}

/** The measured value the readout is showing, read back off the view. */
function measured(view: OscilloscopeScreenView, key: string): number {
  const value = (view as unknown as Record<string, { value: number }>)[key];
  return value.value;
}

describe("automatic frequency readout", () => {
  it("reports the generator's exact setting for a periodic waveform", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "sine";
    model.functionGenerator.frequencyProperty.value = 440;
    const view = createView(model);
    view.step(0.016);
    expect(measured(view, "measuredFrequency")).toBe(440);
    expect(measured(view, "measuredPeriod")).toBeCloseTo(1 / 440, 9);
  });

  it("reads as unmeasurable on a grounded channel", () => {
    // GND flattens the trace, so Vpp already reads 0. Echoing the generator knob
    // for frequency at the same time would be describing a signal that is not
    // on screen.
    const model = new OscilloscopeModel();
    model.functionGenerator.frequencyProperty.value = 440;
    model.ch1.couplingProperty.value = "GND";
    const view = createView(model);
    view.step(0.016);
    expect(measured(view, "measuredFrequency")).toBe(0);
    expect(measured(view, "measuredPeriod")).toBe(0);
    expect(measured(view, "measuredVpp")).toBe(0);
  });

  it("reads as unmeasurable on an unpatched channel", () => {
    const model = new OscilloscopeModel();
    model.disconnectChannel(1);
    const view = createView(model);
    view.step(0.016);
    expect(measured(view, "measuredFrequency")).toBe(0);
  });

  it("measures the trace rather than echoing the knob for the noise waveform", () => {
    // Noise has no single frequency for the generator's setting to stand in for.
    const model = new OscilloscopeModel();
    model.functionGenerator.waveformProperty.value = "noise";
    model.functionGenerator.frequencyProperty.value = 440;
    const view = createView(model);
    view.step(0.016);
    expect(measured(view, "measuredFrequency")).not.toBe(440);
  });
});

describe("phase readout", () => {
  it("is negative — rendered as a dash — when only one channel is on", () => {
    const model = new OscilloscopeModel();
    model.ch2.enabledProperty.value = false;
    const view = createView(model);
    view.step(0.016);
    expect(measured(view, "measuredPhase")).toBeLessThan(0);
  });

  it("reports the generator's exact phase when both channels come from it", () => {
    const model = new OscilloscopeModel();
    model.functionGenerator.phaseProperty.value = 90;
    model.connectJack(2, "functionGeneratorB");
    model.ch2.enabledProperty.value = true;
    const view = createView(model);
    view.step(0.016);
    expect(measured(view, "measuredPhase")).toBeCloseTo(90, 6);
  });
});

describe("persistence afterglow", () => {
  /** Every Path in the subtree that currently has a shape. */
  function shapedPaths(node: Node): Path[] {
    const found: Path[] = [];
    const walk = (n: Node): void => {
      if (n instanceof Path && n.shape !== null) {
        found.push(n);
      }
      for (const child of n.children) {
        walk(child);
      }
    };
    walk(node);
    return found;
  }

  it("retains several distinct past sweeps, not just the live one", () => {
    const model = new OscilloscopeModel();
    model.persistenceProperty.value = true;
    const display = new OscilloscopeDisplayNode(model);

    // Sweep the frequency so each captured trace differs from the last.
    const shapes = new Set<unknown>();
    for (let frame = 0; frame < 6; frame++) {
      model.functionGenerator.frequencyProperty.value = 200 + frame * 40;
      model.refresh();
      display.update();
    }
    for (const path of shapedPaths(display)) {
      shapes.add(path.shape);
    }

    // The live trace plus a chain of ghosts behind it — a single-frame ghost would
    // land exactly under the live trace and show nothing at all.
    expect(shapes.size).toBeGreaterThan(3);
    display.dispose();
    model.dispose();
  });

  it("drops every ghost when persistence is switched off", () => {
    const model = new OscilloscopeModel();
    model.persistenceProperty.value = true;
    const display = new OscilloscopeDisplayNode(model);
    for (let frame = 0; frame < 6; frame++) {
      model.functionGenerator.frequencyProperty.value = 200 + frame * 40;
      model.refresh();
      display.update();
    }
    const withGhosts = shapedPaths(display).length;

    model.persistenceProperty.value = false;
    display.update();
    const withoutGhosts = shapedPaths(display).length;

    expect(withoutGhosts).toBeLessThan(withGhosts);
    display.dispose();
    model.dispose();
  });
});
