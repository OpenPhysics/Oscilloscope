/**
 * Fleet-standard memory-leak regression suite (TemplateSingleSim / QubitSketch pattern).
 *
 * Creates a disposable model object inside a function boundary, disposes it, forces
 * garbage collection via global.gc (--expose-gc in vitest.config.ts), then asserts via
 * WeakRef that the object was collected. V8 requires a function boundary (not merely
 * a block scope) so local strong references die when the helper returns.
 */

import { BooleanProperty, DerivedProperty, NumberProperty, StringUnionProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import { Node } from "scenerystack/scenery";
import { ScreenView } from "scenerystack/sim";
import { Tandem } from "scenerystack/tandem";
import { describe, expect, it } from "vitest";
import { RotaryKnob } from "../src/common/controls/RotaryKnob.js";
import { RotarySwitch } from "../src/common/controls/RotarySwitch.js";
import { TimeModel } from "../src/common/TimeModel.js";
import { StringManager } from "../src/i18n/StringManager.js";
import { OscilloscopeModel } from "../src/oscilloscope-screen/model/OscilloscopeModel.js";
import { BncJackNode } from "../src/oscilloscope-screen/view/BncJackNode.js";
import { CursorReadoutNode } from "../src/oscilloscope-screen/view/CursorReadoutNode.js";
import { HorizontalControlPanel } from "../src/oscilloscope-screen/view/HorizontalControlPanel.js";
import { MeasurementCursorNode } from "../src/oscilloscope-screen/view/MeasurementCursorNode.js";
import { MeasurementReadoutNode } from "../src/oscilloscope-screen/view/MeasurementReadoutNode.js";
import { OscilloscopeDisplayNode } from "../src/oscilloscope-screen/view/OscilloscopeDisplayNode.js";
import { PatchCableLayer } from "../src/oscilloscope-screen/view/PatchCableLayer.js";
import { SignalGeneratorPanel } from "../src/oscilloscope-screen/view/SignalGeneratorPanel.js";
import { SoftAcquirePanel } from "../src/oscilloscope-screen/view/SoftAcquirePanel.js";
import { TriggerControlPanel } from "../src/oscilloscope-screen/view/TriggerControlPanel.js";
import { VerticalControlPanel } from "../src/oscilloscope-screen/view/VerticalControlPanel.js";
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

/**
 * Controls are built the way the panels build them — with a caption and a live
 * readout wired to *sim-lifetime* localized string Properties. A bare knob has no
 * Text children at all, so it exercises none of the listeners a real one carries.
 */
function createAndDisposeRotaryKnob(valueProperty: NumberProperty): WeakRef<object> {
  const vertical = StringManager.getInstance().getVertical();
  const knob = new RotaryKnob(valueProperty, new Range(0, 10), {
    captionStringProperty: vertical.positionStringProperty,
    valueStringProperty: vertical.voltsPerDivisionStringProperty,
  });
  const ref = new WeakRef<object>(knob);
  knob.dispose();
  return ref;
}

function createAndDisposeRotarySwitch(valueProperty: NumberProperty): WeakRef<object> {
  const vertical = StringManager.getInstance().getVertical();
  const items = [
    { value: 0, stringProperty: vertical.dcStringProperty },
    { value: 1, stringProperty: vertical.acStringProperty },
    { value: 2, stringProperty: vertical.gndStringProperty },
  ];
  const rotarySwitch = new RotarySwitch(valueProperty, items, {
    captionStringProperty: vertical.couplingStringProperty,
  });
  const ref = new WeakRef<object>(rotarySwitch);
  rotarySwitch.dispose();
  return ref;
}

function createAndDisposePatchLayer(model: OscilloscopeModel): WeakRef<object> {
  const layer = new PatchCableLayer({ model, coordinateFrame: new Node() });
  layer.redrawWires();
  const ref = new WeakRef<object>(layer);
  layer.dispose();
  return ref;
}

function createAndDisposeBncJack(model: OscilloscopeModel): WeakRef<object> {
  const connectedProperty = new DerivedProperty([model.ch1.inputProperty], (input) => input !== "none");
  const jack = new BncJackNode({
    labelStringProperty: StringManager.getInstance().getPatch().ch1BncStringProperty,
    connectedProperty,
    accessibleName: "CH1",
    onActivate: () => model.disconnectChannel(1),
  });
  const ref = new WeakRef<object>(jack);
  jack.dispose();
  connectedProperty.dispose();
  return ref;
}

/** Each control panel, built against a model that outlives it. */
function createAndDisposePanel(factory: () => Node): WeakRef<object> {
  const panel = factory();
  const ref = new WeakRef<object>(panel);
  panel.dispose();
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

  it("PatchCableLayer is collected after dispose", async () => {
    const model = new OscilloscopeModel();
    const ref = createAndDisposePatchLayer(model);
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
    model.dispose();
  });

  it("BncJackNode is collected after dispose", async () => {
    const model = new OscilloscopeModel();
    const ref = createAndDisposeBncJack(model);
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
    model.dispose();
  });

  it("MeasurementReadoutNode is collected after dispose", async () => {
    const model = new OscilloscopeModel();
    const numbers = Array.from({ length: 11 }, () => new NumberProperty(0));
    const showPhase = new BooleanProperty(true);
    const showMeasurements = new BooleanProperty(true);
    const ref = createAndDisposePanel(
      () =>
        new MeasurementReadoutNode(
          {
            frequencyProperty: numbers[0] as NumberProperty,
            periodProperty: numbers[1] as NumberProperty,
            vppProperty: numbers[2] as NumberProperty,
            vrmsProperty: numbers[3] as NumberProperty,
            vmaxProperty: numbers[4] as NumberProperty,
            vminProperty: numbers[5] as NumberProperty,
            dutyCycleProperty: numbers[6] as NumberProperty,
            riseTimeProperty: numbers[7] as NumberProperty,
            fallTimeProperty: numbers[8] as NumberProperty,
            meanProperty: numbers[9] as NumberProperty,
            phaseProperty: numbers[10] as NumberProperty,
            showPhaseProperty: showPhase,
          },
          showMeasurements,
        ),
    );
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
    model.dispose();
  });

  it("CursorReadoutNode is collected after dispose", async () => {
    const model = new OscilloscopeModel();
    const numbers = Array.from({ length: 6 }, () => new NumberProperty(0));
    const visible = new BooleanProperty(true);
    const ref = createAndDisposePanel(
      () =>
        new CursorReadoutNode(
          {
            deltaTimeProperty: numbers[0] as NumberProperty,
            cursorFrequencyProperty: numbers[1] as NumberProperty,
            deltaVoltageProperty: numbers[2] as NumberProperty,
            frequency1Property: numbers[3] as NumberProperty,
            frequency2Property: numbers[4] as NumberProperty,
            deltaFrequencyProperty: numbers[5] as NumberProperty,
            displayModeProperty: model.displayModeProperty,
          },
          visible,
        ),
    );
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
    model.dispose();
  });

  it.each([
    ["HorizontalControlPanel", (model: OscilloscopeModel) => new HorizontalControlPanel(model)],
    ["TriggerControlPanel", (model: OscilloscopeModel) => new TriggerControlPanel(model)],
    [
      "VerticalControlPanel",
      (model: OscilloscopeModel) => new VerticalControlPanel(model, { ch1Bnc: new Node(), ch2Bnc: new Node() }),
    ],
    [
      "SoftAcquirePanel",
      (model: OscilloscopeModel) =>
        new SoftAcquirePanel(model, {
          showMeasurementsProperty: new BooleanProperty(true),
          onSingle: () => undefined,
          onAutoset: () => undefined,
          onHelp: () => undefined,
          onExportCsv: () => undefined,
          onExportImage: () => undefined,
        }),
    ],
    [
      "SignalGeneratorPanel",
      (model: OscilloscopeModel) =>
        new SignalGeneratorPanel(model, {
          listParent: new Node(),
          sourceJackA: new Node(),
          sourceJackB: new Node(),
          sourceJackMic: new Node(),
        }),
    ],
  ])("%s is collected after dispose", async (_name, factory) => {
    const model = new OscilloscopeModel();
    const ref = createAndDisposePanel(() => factory(model));
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
    model.dispose();
  });

  it("joist's ScreenView is not disposable, so the sim must not override dispose()", () => {
    // OscilloscopeScreenView used to carry a dispose() override that unlinked its
    // render-input listeners. It could never run: ScreenView.setPDOMOrder() throws
    // unconditionally, and Node.dispose() clears pdomOrder on the way out. Anything
    // needing teardown therefore has to live in a child component, not the view —
    // which is what every case above is checking.
    const view = new ScreenView({ tandem: Tandem.OPT_OUT });
    expect(() => view.dispose()).toThrow(/pdomOrder/);
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
