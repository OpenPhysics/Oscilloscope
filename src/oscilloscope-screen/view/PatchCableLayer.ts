/**
 * PatchCableLayer.ts
 *
 * Draws and interacts with the patch cables between function-generator / mic
 * source jacks and the CH1 / CH2 BNC inputs. Model state lives on each channel's
 * `inputProperty`; this layer keeps the wires and drag-to-connect gesture in sync.
 */

import { DerivedProperty } from "scenerystack/axon";
import type { Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { DragListener, Node, Path, type TPaint } from "scenerystack/scenery";
import { DisposalBag } from "../../common/DisposalBag.js";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import type { ChannelInput, SignalJack } from "../model/ChannelInput.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import { BncJackNode } from "./BncJackNode.js";

const JACK_CYCLE: ChannelInput[] = ["none", "functionGeneratorA", "functionGeneratorB", "microphone"];

function wireColor(jack: SignalJack): TPaint {
  switch (jack) {
    case "functionGeneratorA":
      return OscilloscopeColors.wireFgAColorProperty;
    case "functionGeneratorB":
      return OscilloscopeColors.wireFgBColorProperty;
    case "microphone":
      return OscilloscopeColors.wireMicColorProperty;
  }
}

function cableShape(from: Vector2, to: Vector2): Shape {
  const midY = (from.y + to.y) / 2 + 40;
  return new Shape().moveTo(from.x, from.y).quadraticCurveTo((from.x + to.x) / 2, midY, to.x, to.y);
}

export type PatchCableLayerOptions = {
  model: OscilloscopeModel;
  /** Parent whose local frame is used for wire coordinates (usually the screen view). */
  coordinateFrame: Node;
};

/**
 * Owns the five jack nodes — the generator's OUT A / OUT B / MIC sources and the
 * scope's CH1 / CH2 BNC inputs — and exposes them so the screen view and the
 * vertical panel can lay them out in place.
 */
export class PatchCableLayer extends Node {
  public readonly sourceJackA: BncJackNode;
  public readonly sourceJackB: BncJackNode;
  public readonly sourceJackMic: BncJackNode;
  public readonly ch1Bnc: BncJackNode;
  public readonly ch2Bnc: BncJackNode;

  private readonly model: OscilloscopeModel;
  private readonly coordinateFrame: Node;
  private readonly bag = new DisposalBag();
  private readonly wireLayer = new Node();
  private readonly draftWire = new Path(null, {
    stroke: OscilloscopeColors.wireFgAColorProperty,
    lineWidth: 4,
    lineCap: "round",
    visible: false,
  });
  private draftJack: SignalJack | null = null;

  public constructor(options: PatchCableLayerOptions) {
    super();
    this.model = options.model;
    this.coordinateFrame = options.coordinateFrame;

    const strings = StringManager.getInstance();
    const patch = strings.getPatch();
    const a11y = strings.getA11yStrings().controls;
    const model = options.model;

    const connectedTo = (jack: SignalJack) => {
      const derived = new DerivedProperty(
        [model.ch1.inputProperty, model.ch2.inputProperty],
        (a, b) => a === jack || b === jack,
      );
      this.bag.own(derived);
      return derived;
    };
    const patchedTo = (channelInput: typeof model.ch1.inputProperty) => {
      const derived = new DerivedProperty([channelInput], (input) => input !== "none");
      this.bag.own(derived);
      return derived;
    };

    this.sourceJackA = new BncJackNode({
      labelStringProperty: patch.outAStringProperty,
      connectedProperty: connectedTo("functionGeneratorA"),
      accessibleName: a11y.fgOutAStringProperty,
      accessibleHelpText: a11y.patchHelpStringProperty,
      pinFill: OscilloscopeColors.wireFgAColorProperty,
      onActivate: () => this.activateSource("functionGeneratorA"),
    });
    this.sourceJackB = new BncJackNode({
      labelStringProperty: patch.outBStringProperty,
      connectedProperty: connectedTo("functionGeneratorB"),
      accessibleName: a11y.fgOutBStringProperty,
      accessibleHelpText: a11y.patchHelpStringProperty,
      pinFill: OscilloscopeColors.wireFgBColorProperty,
      onActivate: () => this.activateSource("functionGeneratorB"),
    });
    this.sourceJackMic = new BncJackNode({
      labelStringProperty: patch.micOutStringProperty,
      connectedProperty: connectedTo("microphone"),
      accessibleName: a11y.micOutStringProperty,
      accessibleHelpText: a11y.patchHelpStringProperty,
      pinFill: OscilloscopeColors.wireMicColorProperty,
      onActivate: () => this.activateSource("microphone"),
    });

    this.ch1Bnc = new BncJackNode({
      labelStringProperty: patch.ch1BncStringProperty,
      connectedProperty: patchedTo(model.ch1.inputProperty),
      accessibleName: a11y.ch1BncStringProperty,
      accessibleHelpText: a11y.patchHelpStringProperty,
      pinFill: OscilloscopeColors.channel1ColorProperty,
      onActivate: () => this.cycleChannel(1),
    });
    this.ch2Bnc = new BncJackNode({
      labelStringProperty: patch.ch2BncStringProperty,
      connectedProperty: patchedTo(model.ch2.inputProperty),
      accessibleName: a11y.ch2BncStringProperty,
      accessibleHelpText: a11y.patchHelpStringProperty,
      pinFill: OscilloscopeColors.channel2ColorProperty,
      onActivate: () => this.cycleChannel(2),
    });

    this.addChild(this.wireLayer);
    this.addChild(this.draftWire);

    this.attachSourceDrag(this.sourceJackA, "functionGeneratorA");
    this.attachSourceDrag(this.sourceJackB, "functionGeneratorB");
    this.attachSourceDrag(this.sourceJackMic, "microphone");

    const redraw = () => this.redrawWires();
    this.bag.link(model.ch1.inputProperty, redraw);
    this.bag.link(model.ch2.inputProperty, redraw);
    // Layout moves jacks; redraw after the frame settles.
    this.bag.lazyLink(this.coordinateFrame.boundsProperty, redraw);
    this.bag.own(this.sourceJackA, this.sourceJackB, this.sourceJackMic, this.ch1Bnc, this.ch2Bnc, this.draftWire);
  }

  /** Call after the screen has finished positioning the jack nodes. */
  public redrawWires(): void {
    this.wireLayer.removeAllChildren();
    this.drawCableIfPatched("functionGeneratorA");
    this.drawCableIfPatched("functionGeneratorB");
    this.drawCableIfPatched("microphone");
  }

  private sourceNode(jack: SignalJack): BncJackNode {
    switch (jack) {
      case "functionGeneratorA":
        return this.sourceJackA;
      case "functionGeneratorB":
        return this.sourceJackB;
      case "microphone":
        return this.sourceJackMic;
    }
  }

  private bncNode(index: 1 | 2): BncJackNode {
    return index === 1 ? this.ch1Bnc : this.ch2Bnc;
  }

  private toLocal(global: Vector2): Vector2 {
    return this.coordinateFrame.globalToLocalPoint(global);
  }

  private drawCableIfPatched(jack: SignalJack): void {
    const channel = this.model.channelForJack(jack);
    if (!channel) {
      return;
    }
    const from = this.toLocal(this.sourceNode(jack).getJackGlobalCenter());
    const to = this.toLocal(this.bncNode(channel.index).getJackGlobalCenter());
    this.wireLayer.addChild(
      new Path(cableShape(from, to), {
        stroke: wireColor(jack),
        lineWidth: 4,
        lineCap: "round",
        pickable: false,
      }),
    );
  }

  private activateSource(jack: SignalJack): void {
    const channel = this.model.channelForJack(jack);
    if (channel) {
      this.model.disconnectChannel(channel.index);
      return;
    }
    // Free source: plug into the first free BNC (CH1 then CH2).
    if (this.model.ch1.inputProperty.value === "none") {
      this.model.connectJack(1, jack);
    } else if (this.model.ch2.inputProperty.value === "none") {
      this.model.connectJack(2, jack);
    }
  }

  private cycleChannel(index: 1 | 2): void {
    const channel = this.model.channel(index);
    const other = this.model.channel(index === 1 ? 2 : 1);
    const current = channel.inputProperty.value;
    const start = Math.max(0, JACK_CYCLE.indexOf(current));
    for (let step = 1; step <= JACK_CYCLE.length; step++) {
      const next = JACK_CYCLE[(start + step) % JACK_CYCLE.length];
      if (next === undefined) {
        continue;
      }
      if (next !== "none" && other.inputProperty.value === next) {
        continue;
      }
      channel.inputProperty.value = next;
      return;
    }
  }

  private attachSourceDrag(jackNode: BncJackNode, jack: SignalJack): void {
    let dragging = false;
    const dragListener = new DragListener({
      start: () => {
        dragging = true;
        this.draftJack = jack;
        this.draftWire.stroke = wireColor(jack);
        this.draftWire.visible = true;
      },
      drag: (event) => {
        if (!(dragging && this.draftJack && event)) {
          return;
        }
        const from = this.toLocal(jackNode.getJackGlobalCenter());
        const to = this.toLocal(event.pointer.point);
        this.draftWire.shape = cableShape(from, to);
      },
      end: (event) => {
        dragging = false;
        this.draftWire.visible = false;
        this.draftWire.shape = null;
        const jackId = this.draftJack;
        this.draftJack = null;
        if (!(jackId && event)) {
          return;
        }
        const point = event.pointer.point;
        if (this.hitBnc(this.ch1Bnc, point)) {
          this.model.connectJack(1, jackId);
        } else if (this.hitBnc(this.ch2Bnc, point)) {
          this.model.connectJack(2, jackId);
        }
        this.redrawWires();
      },
    });
    this.bag.addInputListener(jackNode, dragListener);
  }

  private hitBnc(bnc: BncJackNode, globalPoint: Vector2): boolean {
    const center = bnc.getJackGlobalCenter();
    return center.distance(globalPoint) < 36;
  }

  public override dispose(): void {
    this.bag.dispose();
    this.wireLayer.removeAllChildren();
    this.wireLayer.dispose();
    super.dispose();
  }
}
