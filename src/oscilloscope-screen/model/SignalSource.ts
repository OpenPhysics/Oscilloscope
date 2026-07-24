/**
 * SignalSource.ts
 *
 * Which signal the oscilloscope is currently displaying: the built-in
 * function generator, or live audio from the microphone.
 */

/** The selectable oscilloscope input sources, in display order. */
export const SIGNAL_SOURCES = ["functionGenerator", "audio"] as const;

/** A single oscilloscope input source. */
export type SignalSource = (typeof SIGNAL_SOURCES)[number];
