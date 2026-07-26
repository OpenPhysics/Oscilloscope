/**
 * BncJackNode.ts
 *
 * A circular BNC-style jack used both on the scope vertical section (channel
 * inputs) and on the function-generator / microphone module (source outputs).
 * Click / keyboard activation cycles or disconnects; pointer drag from a source
 * jack starts a patch (handled by {@link PatchCableLayer}).
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { Vector2 } from "scenerystack/dot";
import { Circle, FireListener, Node, type NodeOptions, Text, type TPaint, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { DisposalBag } from "../../common/DisposalBag.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";

export type BncJackNodeOptions = {
  /** Caption under the jack. */
  labelStringProperty: TReadOnlyProperty<string>;
  /** Whether a cable is currently plugged in. */
  connectedProperty: TReadOnlyProperty<boolean>;
  /** Accessible name for the jack. */
  accessibleName: TReadOnlyProperty<string> | string;
  /** Optional help text. */
  accessibleHelpText?: TReadOnlyProperty<string> | string;
  /** Fired on click / keyboard activation. */
  onActivate: () => void;
  /** Outer radius of the jack body. */
  radius?: number;
  /** Accent paint for the inner pin (channel color, etc.). */
  pinFill?: TPaint;
} & Pick<NodeOptions, "cursor">;

export class BncJackNode extends Node {
  private readonly body: Node;
  private readonly bag = new DisposalBag();

  public constructor(options: BncJackNodeOptions) {
    const radius = options.radius ?? 14;
    const pinFill = options.pinFill ?? OscilloscopeColors.textColorProperty;

    const ringFill = new DerivedProperty(
      [
        options.connectedProperty,
        OscilloscopeColors.bncJackConnectedColorProperty,
        OscilloscopeColors.bncJackColorProperty,
      ],
      (connected, connectedColor, freeColor) => (connected ? connectedColor : freeColor),
    );

    const outer = new Circle(radius, {
      fill: ringFill,
      stroke: OscilloscopeColors.panelBorderColorProperty,
      lineWidth: 2,
    });
    const inner = new Circle(radius * 0.45, {
      fill: OscilloscopeColors.displayBackgroundColorProperty,
      stroke: pinFill,
      lineWidth: 2,
    });
    const pin = new Circle(radius * 0.18, { fill: pinFill });

    const body = new Node({ children: [outer, inner, pin] });
    body.mouseArea = body.localBounds.dilated(10);
    body.touchArea = body.localBounds.dilated(14);

    const label = new Text(options.labelStringProperty, {
      font: new PhetFont({ size: 11, weight: "bold" }),
      fill: OscilloscopeColors.textColorProperty,
      maxWidth: radius * 4,
    });

    const helpTextOptions =
      options.accessibleHelpText === undefined ? {} : { accessibleHelpText: options.accessibleHelpText };

    super({
      children: [new VBox({ spacing: 3, children: [body, label] })],
      cursor: options.cursor ?? "pointer",
      tagName: "button",
      accessibleName: options.accessibleName,
      ...helpTextOptions,
    });

    this.body = body;

    const fireListener = new FireListener({
      fire: () => options.onActivate(),
    });
    this.bag.addInputListener(this, fireListener);
    // `ringFill` links the connected-state Property (which the patch layer derives
    // from model state) and two sim-lifetime color Properties; the Texts and Circles
    // hold color/string listeners of their own. None are released by Node.dispose().
    this.bag.own(ringFill, outer, inner, pin, body, label);
  }

  /** Global coordinates of the jack pin (for drawing cables). */
  public getJackGlobalCenter(): Vector2 {
    return this.localToGlobalPoint(this.body.center);
  }

  public override dispose(): void {
    this.bag.dispose();
    super.dispose();
  }
}
