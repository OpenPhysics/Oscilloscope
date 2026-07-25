/**
 * ChannelInput.ts
 *
 * What is patched into a vertical channel's BNC: nothing, function-generator
 * output A (in-phase), function-generator output B (phase-shifted), or the
 * live microphone.
 */

/** Patchable inputs, in a stable order for cycling UI. */
export const CHANNEL_INPUTS = ["none", "functionGeneratorA", "functionGeneratorB", "microphone"] as const;

/** A single channel BNC patch target. */
export type ChannelInput = (typeof CHANNEL_INPUTS)[number];

/** Source jacks that can feed a BNC (excludes "none"). */
export const SIGNAL_JACKS = ["functionGeneratorA", "functionGeneratorB", "microphone"] as const;

/** A physical source jack on the generator / mic module. */
export type SignalJack = (typeof SIGNAL_JACKS)[number];
