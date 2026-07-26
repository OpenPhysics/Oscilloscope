/**
 * The trigger panel's slope button builds its label by interpolating several
 * localized strings. Every one of them has to be a declared dependency of that
 * derivation, or the label freezes in the previous language when the user switches
 * locale at runtime (which `init.ts` enables).
 */

import { Text } from "scenerystack/scenery";
import { describe, expect, it } from "vitest";
import { StringManager } from "../src/i18n/StringManager.js";
import { OscilloscopeModel } from "../src/oscilloscope-screen/model/OscilloscopeModel.js";
import { TriggerControlPanel } from "../src/oscilloscope-screen/view/TriggerControlPanel.js";

/** Every string currently rendered anywhere under `panel`. */
function renderedStrings(panel: TriggerControlPanel): string[] {
  const out: string[] = [];
  const walk = (node: { children: unknown[] }): void => {
    if (node instanceof Text) {
      out.push(node.string);
    }
    for (const child of node.children as { children: unknown[] }[]) {
      walk(child);
    }
  };
  walk(panel as unknown as { children: unknown[] });
  return out;
}

describe("TriggerControlPanel slope label", () => {
  it("re-renders when the localized caption changes, not only the direction", () => {
    const trigger = StringManager.getInstance().getTrigger();
    const originalCaption = trigger.slopeStringProperty.value;
    const model = new OscilloscopeModel();
    const panel = new TriggerControlPanel(model);

    try {
      expect(renderedStrings(panel).some((s) => s.startsWith(`${originalCaption}:`))).toBe(true);

      // Stand in for a locale switch: the caption Property changes while the slope
      // itself does not. A derivation that read this string as `.value` instead of
      // declaring it would keep showing the old caption.
      trigger.slopeStringProperty.value = "Flanke";
      expect(renderedStrings(panel).some((s) => s.startsWith("Flanke:"))).toBe(true);
    } finally {
      trigger.slopeStringProperty.value = originalCaption;
      panel.dispose();
      model.dispose();
    }
  });

  it("tracks the slope direction too", () => {
    const model = new OscilloscopeModel();
    const panel = new TriggerControlPanel(model);
    const trigger = StringManager.getInstance().getTrigger();

    model.trigger.slopeProperty.value = "falling";
    expect(renderedStrings(panel)).toContain(
      `${trigger.slopeStringProperty.value}: ${trigger.fallingStringProperty.value}`,
    );

    model.trigger.slopeProperty.value = "rising";
    expect(renderedStrings(panel)).toContain(
      `${trigger.slopeStringProperty.value}: ${trigger.risingStringProperty.value}`,
    );

    panel.dispose();
    model.dispose();
  });
});
