/**
 * OscilloscopeModel.ts
 *
 * Top-level model for the oscilloscope screen. It owns:
 *   - two vertical input {@link Channel}s (CH1, CH2), each with its own volts/div,
 *     position, coupling, invert, and on/off
 *   - a {@link FunctionGenerator} (sine / square / triangle / sawtooth / pulse /
 *     noise, with amplitude, offset, duty cycle, and a CH2 phase shift)
 *   - an {@link AudioInput} (live microphone), selectable as CH1's input
 *   - the horizontal system (time/div, position, ×10 magnify)
 *   - the {@link Trigger} system (source, level, slope, mode)
 *   - display options: Y-T vs X-Y, persistence, and a CH1±CH2 math trace
 *   - a run/stop clock ({@link TimeModel}) — when stopped, the trace freezes
 *
 * Each frame the view calls {@link refresh} to resample every trace, then reads
 * the per-channel buffers to draw. All buffers are reused between frames.
 */

import { BooleanProperty, NumberProperty, type PhetioProperty, StringUnionProperty } from "scenerystack/axon";
import type { TModel } from "scenerystack/joist";
import { TimeModel } from "../../common/TimeModel.js";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";
import {
  HORIZONTAL_DIVISIONS,
  SCOPE_DEFAULT_TIME_PER_DIV,
  SCOPE_HORIZONTAL_POSITION_RANGE,
  SCOPE_MAGNIFY_FACTOR,
  SCOPE_TIME_PER_DIV_RANGE,
  TRACE_SAMPLE_COUNT,
} from "../../SimConstants.js";
import { AudioInput } from "./AudioInput.js";
import { Channel } from "./Channel.js";
import { FunctionGenerator } from "./FunctionGenerator.js";
import { SIGNAL_SOURCES, type SignalSource } from "./SignalSource.js";
import { Trigger } from "./Trigger.js";

/** How the display plots the channels: Y versus time, or CH1 (X) versus CH2 (Y). */
export const DISPLAY_MODES = ["yt", "xy"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

/** The optional CH1±CH2 math trace. */
export const MATH_MODES = ["off", "add", "subtract"] as const;
export type MathMode = (typeof MATH_MODES)[number];

export type OscilloscopeModelOptions = {
  /** Preference-owned "inject noise" toggle; the generator reads it live. */
  noiseEnabledProperty?: PhetioProperty<boolean>;
  /** Preference-owned noise amplitude (volts). */
  noiseAmplitudeProperty?: PhetioProperty<number>;
};

export class OscilloscopeModel implements TModel {
  /** Run/Stop clock. Starts running so the trace is live on load. */
  public readonly timer = new TimeModel(true);

  /** The synthetic-signal source. */
  public readonly functionGenerator: FunctionGenerator;

  /** The live-microphone source. */
  public readonly audioInput = new AudioInput();

  /** Vertical channel 1. */
  public readonly ch1 = new Channel({ index: 1, initiallyEnabled: true, initialVoltsPerDivision: 0.5 });

  /** Vertical channel 2 (off by default, like a real scope). */
  public readonly ch2 = new Channel({ index: 2, initiallyEnabled: false, initialVoltsPerDivision: 0.5 });

  /** The trigger system. */
  public readonly trigger = new Trigger();

  /** CH1's input: the function generator, or the live microphone. */
  public readonly sourceProperty = new StringUnionProperty<SignalSource>("functionGenerator", {
    validValues: [...SIGNAL_SOURCES],
  });

  /** Horizontal sensitivity, in seconds per division. */
  public readonly timePerDivisionProperty: NumberProperty;

  /** Horizontal trace position (offset), in divisions. */
  public readonly horizontalPositionProperty = new NumberProperty(0, {
    range: SCOPE_HORIZONTAL_POSITION_RANGE,
  });

  /** Whether the ×10 horizontal magnifier is engaged. */
  public readonly magnifyProperty = new BooleanProperty(false);

  /** Y-T versus X-Y display. */
  public readonly displayModeProperty = new StringUnionProperty<DisplayMode>("yt", {
    validValues: [...DISPLAY_MODES],
  });

  /** Whether previous sweeps linger (afterglow / persistence). */
  public readonly persistenceProperty = new BooleanProperty(false);

  /** The CH1±CH2 math trace mode. */
  public readonly mathModeProperty = new StringUnionProperty<MathMode>("off", {
    validValues: [...MATH_MODES],
  });

  // Reused per-frame trace buffers (volts per horizontal pixel column).
  private readonly ch1Buffer = new Float32Array(TRACE_SAMPLE_COUNT);
  private readonly ch2Buffer = new Float32Array(TRACE_SAMPLE_COUNT);
  private readonly mathBuffer = new Float32Array(TRACE_SAMPLE_COUNT);

  private ch1HasData = false;
  private ch2HasData = false;
  private triggerOffsetSeconds = 0;

  public constructor(providedOptions?: OscilloscopeModelOptions) {
    this.functionGenerator = new FunctionGenerator(
      providedOptions?.noiseEnabledProperty,
      providedOptions?.noiseAmplitudeProperty,
    );

    this.timePerDivisionProperty = new NumberProperty(SCOPE_DEFAULT_TIME_PER_DIV, {
      range: SCOPE_TIME_PER_DIV_RANGE,
      units: "s",
    });

    // Acquire / release the microphone as CH1's source selection changes.
    this.sourceProperty.link((source) => {
      if (source === "audio") {
        this.audioInput.start().catch(() => {
          /* unreachable — start() catches all failures and sets statusProperty */
        });
      } else {
        this.audioInput.stop();
      }
    });
  }

  /** Number of samples per trace. */
  public get sampleCount(): number {
    return this.ch1Buffer.length;
  }

  /** The time/div actually in effect, accounting for the ×10 magnifier. */
  public get effectiveTimePerDivision(): number {
    return this.timePerDivisionProperty.value / (this.magnifyProperty.value ? SCOPE_MAGNIFY_FACTOR : 1);
  }

  /** The time span, in seconds, currently shown across the whole display. */
  public get timeWindow(): number {
    return this.effectiveTimePerDivision * HORIZONTAL_DIVISIONS;
  }

  /** Latest CH1 trace (volts per column). Valid after {@link refresh}. */
  public get ch1Trace(): Float32Array {
    return this.ch1Buffer;
  }

  /** Latest CH2 trace (volts per column). Valid after {@link refresh}. */
  public get ch2Trace(): Float32Array {
    return this.ch2Buffer;
  }

  /** Latest math trace (volts per column). Valid after {@link refresh}. */
  public get mathTrace(): Float32Array {
    return this.mathBuffer;
  }

  /** Whether CH1 currently has real signal data (false → flat line). */
  public get ch1HasSignal(): boolean {
    return this.ch1HasData;
  }

  /** Whether CH2 currently has real signal data. */
  public get ch2HasSignal(): boolean {
    return this.ch2HasData;
  }

  /** Resamples every trace from the current model state. Call once per frame. */
  public refresh(): void {
    this.triggerOffsetSeconds = this.computeTriggerOffset();

    const ch1Audio = this.sourceProperty.value === "audio";
    this.ch1HasData = this.fillChannel(this.ch1Buffer, 0, ch1Audio);
    this.applyCoupling(this.ch1Buffer, this.ch1.couplingProperty.value);

    this.ch2HasData = this.fillChannel(this.ch2Buffer, this.functionGenerator.phaseProperty.value, false);
    this.applyCoupling(this.ch2Buffer, this.ch2.couplingProperty.value);

    const mode = this.mathModeProperty.value;
    if (mode !== "off") {
      const n = this.mathBuffer.length;
      for (let i = 0; i < n; i++) {
        const a = this.ch1Buffer[i] ?? 0;
        const b = this.ch2Buffer[i] ?? 0;
        this.mathBuffer[i] = mode === "add" ? a + b : a - b;
      }
    }
  }

  /** Fills `buffer` with one channel's raw volts across the display window. */
  private fillChannel(buffer: Float32Array, phaseDegrees: number, useAudio: boolean): boolean {
    const n = buffer.length;
    const windowSeconds = this.timeWindow;

    if (useAudio) {
      return this.audioInput.fillTrace(
        buffer,
        windowSeconds,
        this.trigger.levelProperty.value,
        this.trigger.slopeProperty.value,
      );
    }

    const fg = this.functionGenerator;
    const t0 = this.triggerOffsetSeconds;
    const hShift = this.horizontalPositionProperty.value * this.effectiveTimePerDivision;
    for (let i = 0; i < n; i++) {
      const t = t0 + (i / (n - 1)) * windowSeconds - hShift;
      buffer[i] = fg.voltageAt(t, phaseDegrees);
    }
    return true;
  }

  /** Applies AC / DC / GND coupling to a filled buffer, in place. */
  private applyCoupling(buffer: Float32Array, coupling: "DC" | "AC" | "GND"): void {
    if (coupling === "GND") {
      buffer.fill(0);
      return;
    }
    if (coupling === "AC") {
      let sum = 0;
      for (const v of buffer) {
        sum += v;
      }
      const mean = sum / buffer.length;
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = (buffer[i] ?? 0) - mean;
      }
    }
  }

  /**
   * Finds the time offset at which the trigger source crosses the trigger level
   * with the selected slope, so the displayed generator waveform stands still.
   * Returns 0 when there is no analytic trigger (microphone source, or the level
   * is unreachable — a free-running / auto sweep).
   */
  private computeTriggerOffset(): number {
    const source = this.trigger.sourceProperty.value;
    if (source === "ch1" && this.sourceProperty.value === "audio") {
      return 0;
    }

    const fg = this.functionGenerator;
    const f = fg.frequencyProperty.value;
    if (f <= 0) {
      return 0;
    }

    const phaseDeg = source === "ch2" ? fg.phaseProperty.value : 0;
    const level = this.trigger.levelProperty.value;
    const rising = this.trigger.slopeProperty.value === "rising";
    const period = 1 / f;
    const steps = 512;

    let prev = fg.cleanVoltageAt(0, phaseDeg);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * period;
      const curr = fg.cleanVoltageAt(t, phaseDeg);
      const crossed = rising ? prev < level && curr >= level : prev > level && curr <= level;
      if (crossed) {
        const denom = curr - prev || 1;
        const frac = (level - prev) / denom;
        return ((i - 1 + frac) / steps) * period;
      }
      prev = curr;
    }
    return 0;
  }

  public reset(): void {
    this.timer.reset();
    this.functionGenerator.reset();
    this.ch1.reset();
    this.ch2.reset();
    this.trigger.reset();
    // Resetting the source back to the function generator releases the mic via the link.
    this.sourceProperty.reset();
    this.timePerDivisionProperty.reset();
    this.horizontalPositionProperty.reset();
    this.magnifyProperty.reset();
    this.displayModeProperty.reset();
    this.persistenceProperty.reset();
    this.mathModeProperty.reset();
  }

  public step(dt: number): void {
    this.timer.step(dt);
  }

  public dispose(): void {
    this.timer.dispose();
    this.functionGenerator.dispose();
    this.audioInput.dispose();
    this.ch1.dispose();
    this.ch2.dispose();
    this.trigger.dispose();
    this.sourceProperty.dispose();
    this.timePerDivisionProperty.dispose();
    this.horizontalPositionProperty.dispose();
    this.magnifyProperty.dispose();
    this.displayModeProperty.dispose();
    this.persistenceProperty.dispose();
    this.mathModeProperty.dispose();
  }
}

OscilloscopeNamespace.register("OscilloscopeModel", OscilloscopeModel);
