/**
 * Fleet-standard memory-leak regression suite (TemplateSingleSim / QubitSketch pattern).
 *
 * Creates a disposable model object inside a function boundary, disposes it, forces
 * garbage collection via global.gc (--expose-gc in vitest.config.ts), then asserts via
 * WeakRef that the object was collected. V8 requires a function boundary (not merely
 * a block scope) so local strong references die when the helper returns.
 */

import { NumberProperty, StringUnionProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import { describe, expect, it } from "vitest";
import { RotaryKnob } from "../src/common/controls/RotaryKnob.js";
import { RotarySwitch } from "../src/common/controls/RotarySwitch.js";
import { TimeModel } from "../src/common/TimeModel.js";
import { OscilloscopeModel } from "../src/oscilloscope-screen/model/OscilloscopeModel.js";
import { MeasurementCursorNode } from "../src/oscilloscope-screen/view/MeasurementCursorNode.js";
import { OscilloscopeDisplayNode } from "../src/oscilloscope-screen/view/OscilloscopeDisplayNode.js";
import { CURSOR_TIME_RANGE } from "../src/SimConstants.js";

/**
 * Force garbage collection with multiple passes. When `earlyExitRef` is supplied
 * the loop bails as soon as the object is confirmed collected. The setTimeout(0)
 * yield after a live deref() avoids the WeakRef macrotask-liveness pin.
 */
async function forceGC(earlyExitRef?: WeakRef<object>): Promise<void> {
  for (let i = 0; i < 15; i++) {
    globalThis.gc?.();
    await new Promise<void>((r) => setTimeout(r, 50));
    if (earlyExitRef !== undefined && earlyExitRef.deref() === undefined) {
      return;
    }
    if (earlyExitRef !== undefined) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
}

function createAndDisposeTimeModel(): WeakRef<object> {
  const model = new TimeModel();
  const ref = new WeakRef<object>(model);
  model.dispose();
  return ref;
}

function createAndDisposeOscilloscopeModel(): WeakRef<object> {
  const model = new OscilloscopeModel();
  // Exercise the sampling path so any retained per-frame state would show up.
  model.refresh();
  const ref = new WeakRef<object>(model);
  model.dispose();
  return ref;
}

/**
 * View components are checked against a model that outlives them. If a component
 * fails to unlink from the model's Properties, the model's listener lists keep the
 * component reachable and the WeakRef stays alive — which is exactly the leak these
 * assertions are for.
 */
function createAndDisposeDisplayNode(model: OscilloscopeModel): WeakRef<object> {
  const node = new OscilloscopeDisplayNode(model);
  node.update();
  const ref = new WeakRef<object>(node);
  node.dispose();
  return ref;
}

function createAndDisposeCursorNode(model: OscilloscopeModel): WeakRef<object> {
  const node = new MeasurementCursorNode(model.cursorTime1Property, CURSOR_TIME_RANGE, "time", {
    accessibleName: new StringUnionProperty<"a">("a", { validValues: ["a"] }),
    pointerToValue: () => 0,
  });
  const ref = new WeakRef<object>(node);
  node.dispose();
  return ref;
}

function createAndDisposeRotaryKnob(valueProperty: NumberProperty): WeakRef<object> {
  const knob = new RotaryKnob(valueProperty, new Range(0, 10));
  const ref = new WeakRef<object>(knob);
  knob.dispose();
  return ref;
}

function createAndDisposeRotarySwitch(valueProperty: NumberProperty): WeakRef<object> {
  const items = [0, 1, 2].map((value) => ({
    value,
    stringProperty: new StringUnionProperty<"x">("x", { validValues: ["x"] }),
  }));
  const rotarySwitch = new RotarySwitch(valueProperty, items);
  const ref = new WeakRef<object>(rotarySwitch);
  rotarySwitch.dispose();
  return ref;
}

describe("Memory leak regression", () => {
  it("global.gc is available (--expose-gc)", () => {
    expect(globalThis.gc).toBeDefined();
  });

  it("sanity: plain object is collected", async () => {
    const ref = (() => new WeakRef({ hello: "world" }))();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("TimeModel is collected after dispose", async () => {
    const ref = createAndDisposeTimeModel();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("double dispose() does not throw", () => {
    const model = new TimeModel();
    model.dispose();
    expect(() => model.dispose()).not.toThrow();
  });

  it("OscilloscopeModel is collected after dispose", async () => {
    const ref = createAndDisposeOscilloscopeModel();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("OscilloscopeModel double dispose() does not throw", () => {
    const model = new OscilloscopeModel();
    model.dispose();
    expect(() => model.dispose()).not.toThrow();
  });

  it("OscilloscopeDisplayNode is collected after dispose", async () => {
    // The model deliberately stays alive for the whole test.
    const model = new OscilloscopeModel();
    const ref = createAndDisposeDisplayNode(model);
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
    model.dispose();
  });

  it("MeasurementCursorNode is collected after dispose", async () => {
    const model = new OscilloscopeModel();
    const ref = createAndDisposeCursorNode(model);
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
    model.dispose();
  });

  it("RotaryKnob is collected after dispose", async () => {
    const valueProperty = new NumberProperty(5, { range: new Range(0, 10) });
    const ref = createAndDisposeRotaryKnob(valueProperty);
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
    valueProperty.dispose();
  });

  it("RotarySwitch is collected after dispose", async () => {
    const valueProperty = new NumberProperty(1, { range: new Range(0, 2) });
    const ref = createAndDisposeRotarySwitch(valueProperty);
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
    valueProperty.dispose();
  });

  it("repeated create/dispose cycles leave no survivors", async () => {
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < 10; i++) {
      refs.push(createAndDisposeTimeModel());
    }
    await forceGC();
    const survivors = refs.filter((r) => r.deref() !== undefined).length;
    expect(survivors).toBe(0);
  });
});
