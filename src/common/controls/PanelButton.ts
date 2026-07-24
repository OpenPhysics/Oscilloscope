/**
 * PanelButton.ts
 *
 * A front-panel push button, styled after the labelled buttons on a real
 * oscilloscope. It can act as a momentary action (Autoset, Single, Reset) or,
 * when given an `indicatorProperty`, as a toggle with a lit indicator LED
 * (Run/Stop, CH on/off, Invert, ×10, X-Y, …).
 *
 * The button itself remains a fully accessible sun `RectangularPushButton`, so it
 * is focusable and operable from the keyboard with a proper accessible name.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { optionize } from "scenerystack/phet-core";
import { Circle, HBox, Node, Text, type TPaint } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { RectangularPushButton, type RectangularPushButtonOptions } from "scenerystack/sun";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import { FLAT_BUTTON_APPEARANCE_OPTIONS } from "../SimButtonOptions.js";

type SelfOptions = {
  /** Button label. */
  labelStringProperty: TReadOnlyProperty<string> | string;
  /** When provided, the button shows an indicator LED that lights while this is true. */
  indicatorProperty?: TReadOnlyProperty<boolean> | null;
  /** Paint of the indicator LED when lit. */
  indicatorColor?: TPaint;
  /** Label text color. */
  textFill?: TPaint;
  /** Font size of the label. */
  fontSize?: number;
};

export type PanelButtonOptions = SelfOptions &
  Pick<
    RectangularPushButtonOptions,
    "listener" | "accessibleName" | "accessibleHelpText" | "enabledProperty" | "visibleProperty" | "minWidth"
  >;

export class PanelButton extends RectangularPushButton {
  public constructor(providedOptions: PanelButtonOptions) {
    const options = optionize<PanelButtonOptions, SelfOptions, RectangularPushButtonOptions>()(
      {
        indicatorProperty: null,
        indicatorColor: OscilloscopeColors.accentColorProperty,
        textFill: OscilloscopeColors.textColorProperty,
        fontSize: 12,
        // RectangularPushButton:
        baseColor: OscilloscopeColors.panelButtonColorProperty,
        cornerRadius: 3,
        xMargin: 8,
        yMargin: 5,
        ...FLAT_BUTTON_APPEARANCE_OPTIONS,
      },
      providedOptions,
    );

    const label = new Text(options.labelStringProperty, {
      font: new PhetFont({ size: options.fontSize, weight: "bold" }),
      fill: options.textFill,
      maxWidth: 120,
    });

    const rowChildren: Node[] = [];
    if (options.indicatorProperty) {
      const ledBase = new Circle(4, { fill: OscilloscopeColors.ledOffColorProperty });
      const ledLit = new Circle(4, {
        fill: options.indicatorColor,
        visibleProperty: options.indicatorProperty,
      });
      rowChildren.push(new Node({ children: [ledBase, ledLit] }));
    }
    rowChildren.push(label);

    options.content = new HBox({ spacing: 6, children: rowChildren });

    super(options);
  }
}
