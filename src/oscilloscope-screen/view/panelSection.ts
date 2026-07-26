/**
 * panelSection.ts
 *
 * A shared factory that gives a control panel a bench-instrument "section header":
 * a full-width label strip above the panel body, spanning the body's width, like
 * the "Vertical | Horizontal | Trigger" band across a real scope's front panel.
 *
 * Returns a Node to hand straight to a {@link SimPanel} as its content.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { Node, Rectangle, Text, type TPaint, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import type { DisposalBag } from "../../common/DisposalBag.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { PANEL_CORNER_RADIUS } from "../../SimConstants.js";

const HEADER_FONT = new PhetFont({ size: 13, weight: "bold" });
/** Height of the header strip, in screen pixels. */
const HEADER_HEIGHT = 22;
/** Minimum horizontal padding (px) between the label and the strip edges. */
const HEADER_PADDING = 12;

export type SectionHeaderOptions = {
  /** Fill of the header strip. Defaults to the themed section-header color. */
  barColor?: TPaint;
  /** Text color of the header label. Defaults to the themed section-header text color. */
  textColor?: TPaint;
  /** Header label font. */
  font?: PhetFont;
  /**
   * Teardown collector of the panel that owns this header. The strip keeps bounds
   * links and a localized `Text` alive, so a panel that can be disposed should pass
   * its bag; omit it for a header that lives as long as the sim.
   */
  bag?: DisposalBag;
};

/**
 * Wraps a panel body with a section-header strip sized to span the body width, and
 * returns a VBox suitable as a {@link SimPanel} content node. The strip re-measures
 * when the body or label bounds change (e.g. on locale switch).
 */
export function withSectionHeader(
  labelStringProperty: TReadOnlyProperty<string>,
  body: Node,
  options?: SectionHeaderOptions,
): Node {
  const barColor = options?.barColor ?? OscilloscopeColors.sectionHeaderColorProperty;
  const textColor = options?.textColor ?? OscilloscopeColors.sectionHeaderTextColorProperty;
  const font = options?.font ?? HEADER_FONT;

  const label = new Text(labelStringProperty, { font, fill: textColor, maxWidth: 240 });
  const bar = new Rectangle(0, 0, HEADER_HEIGHT, HEADER_HEIGHT, {
    fill: barColor,
    cornerRadius: PANEL_CORNER_RADIUS - 2,
  });
  const header = new Node({ children: [bar, label] });

  const layout = (): void => {
    const width = Math.max(body.width, label.width + HEADER_PADDING * 2);
    bar.setRect(0, 0, width, HEADER_HEIGHT);
    label.centerX = width / 2;
    label.centerY = HEADER_HEIGHT / 2;
  };
  const bag = options?.bag;
  if (bag) {
    bag.link(body.boundsProperty, layout);
    bag.link(label.boundsProperty, layout);
    bag.own(label, bar, header);
  } else {
    body.boundsProperty.link(layout);
    label.boundsProperty.link(layout);
  }

  return new VBox({ align: "center", spacing: 7, children: [header, body] });
}
