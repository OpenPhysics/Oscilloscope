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

import { BooleanProperty, NumberProperty, StringUnionProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { TModel } from "scenerystack/joist";
import { TimeModel } from "../../common/TimeModel.js";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";
import {
  CURSOR_TIME_RANGE,
  CURSOR_VOLT_RANGE,
  HORIZONTAL_DIVISIONS,
  SCOPE_DEFAULT_TIME_PER_DIV,
  SCOPE_DEFAULT_VOLTS_PER_DIV,
  SCOPE_HORIZONTAL_POSITION_RANGE,
  SCOPE_MAGNIFY_FACTOR,
  SCOPE_TIME_PER_DIV_RANGE,
  TRACE_SAMPLE_COUNT,
  TRIGGER_SEARCH_STEPS,
  VERTICAL_DIVISIONS,
} from "../../SimConstants.js";
import { AudioInput } from "./AudioInput.js";
import { Channel } from "./Channel.js";
import type { Coupling } from "./Coupling.js";
import { FunctionGenerator } from "./FunctionGenerator.js";
import { SIGNAL_SOURCES, type SignalSource } from "./SignalSource.js";
import { Trigger } from "./Trigger.js";

/**
 * How the display plots the channels: Y versus time, CH1 (X) versus CH2 (Y), or
 * the frequency spectrum (FFT) of the primary channel.
 */
export const DISPLAY_MODES = ["yt", "xy", "fft"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

/** The optional CH1±CH2 math trace. */
export const MATH_MODES = ["off", "add", "subtract"] as const;
export type MathMode = (typeof MATH_MODES)[number];

/**
 * The mean of a filled buffer. Used only for the microphone path, where no
 * analytic DC component exists; the generator path uses `FunctionGenerator.meanVoltage`.
 */
function windowMean(buffer: Float32Array): number {
  if (buffer.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const v of buffer) {
    sum += v;
  }
  return sum / buffer.length;
}

export type OscilloscopeModelOptions = {
  /** Preference-owned "inject noise" toggle; the generator reads it live. */
  noiseEnabledProperty?: TReadOnlyProperty<boolean>;
  /** Preference-owned noise amplitude (volts). */
  noiseAmplitudeProperty?: TReadOnlyProperty<number>;
};

export class OscilloscopeModel implements TModel {
  /** Run/Stop clock. Starts running so the trace is live on load. */
  public readonly timer = new TimeModel(true);

  /** The synthetic-signal source. */
  public readonly functionGenerator: FunctionGenerator;

  /** The live-microphone source. */
  public readonly audioInput = new AudioInput();

  /** Vertical channel 1. */
  public readonly ch1 = new Channel({
    index: 1,
    initiallyEnabled: true,
    initialVoltsPerDivision: SCOPE_DEFAULT_VOLTS_PER_DIV,
  });

  /** Vertical channel 2 (off by default, like a real scope). */
  public readonly ch2 = new Channel({
    index: 2,
    initiallyEnabled: false,
    initialVoltsPerDivision: SCOPE_DEFAULT_VOLTS_PER_DIV,
  });

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

  /** Whether the draggable measurement cursors are shown. */
  public readonly cursorsEnabledProperty = new BooleanProperty(false);

  // Cursor positions. Time cursors are in horizontal divisions from the left
  // edge; voltage cursors are in vertical divisions from screen center (up +).
  public readonly cursorTime1Property = new NumberProperty(HORIZONTAL_DIVISIONS * 0.3, {
    range: CURSOR_TIME_RANGE,
  });
  public readonly cursorTime2Property = new NumberProperty(HORIZONTAL_DIVISIONS * 0.7, {
    range: CURSOR_TIME_RANGE,
  });
  public readonly cursorVolt1Property = new NumberProperty(VERTICAL_DIVISIONS * 0.25, {
    range: CURSOR_VOLT_RANGE,
  });
  public readonly cursorVolt2Property = new NumberProperty(-VERTICAL_DIVISIONS * 0.25, {
    range: CURSOR_VOLT_RANGE,
  });

  // Reused per-frame trace buffers (volts per horizontal pixel column). The
  // `clean` variants hold the same signal without injected noise: the display
  // draws the noisy trace (that is what a real probe sees) while the automatic
  // measurements read the clean one, so Vmax/Vmin/Vpp are not biased outward by
  // noise — min/max are extreme-value statistics and noise only ever pushes them
  // further apart, never together.
  private readonly ch1Buffer = new Float32Array(TRACE_SAMPLE_COUNT);
  private readonly ch2Buffer = new Float32Array(TRACE_SAMPLE_COUNT);
  private readonly ch1CleanBuffer = new Float32Array(TRACE_SAMPLE_COUNT);
  private readonly ch2CleanBuffer = new Float32Array(TRACE_SAMPLE_COUNT);
  private readonly mathBuffer = new Float32Array(TRACE_SAMPLE_COUNT);

  // Microphone samples land here first: the audio path only discovers whether it
  // triggered as a side effect of resampling, so a held (untriggered) normal or
  // single sweep must not have already overwritten the committed buffer.
  private readonly audioScratchBuffer = new Float32Array(TRACE_SAMPLE_COUNT);

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

    // Selecting SINGLE arms a fresh capture, matching a bench scope where turning
    // the mode switch to SINGLE readies the next sweep.
    this.trigger.modeProperty.link((mode) => {
      if (mode === "single") {
        this.trigger.arm();
      }
    });

    // Restarting the sweep re-arms a single-shot capture, so RUN after a completed
    // SINGLE waits for the next trigger rather than silently doing nothing.
    this.timer.isPlayingProperty.link((isPlaying) => {
      if (isPlaying && this.trigger.modeProperty.value === "single") {
        this.trigger.arm();
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

  /** Whether the primary (lowest enabled) channel is CH1. */
  public get primaryIsCh1(): boolean {
    return this.ch1.enabledProperty.value || !this.ch2.enabledProperty.value;
  }

  /** The primary channel (CH1 if enabled, else CH2). */
  public get primaryChannel(): Channel {
    return this.primaryIsCh1 ? this.ch1 : this.ch2;
  }

  /** Latest primary-channel trace (volts per column). Valid after {@link refresh}. */
  public get primaryTrace(): Float32Array {
    return this.primaryIsCh1 ? this.ch1Buffer : this.ch2Buffer;
  }

  /** Latest math trace (volts per column). Valid after {@link refresh}. */
  public get mathTrace(): Float32Array {
    return this.mathBuffer;
  }

  /**
   * Latest primary-channel trace with any injected noise removed. This is the
   * signal the automatic measurements read — see the buffer declarations above.
   */
  public get primaryCleanTrace(): Float32Array {
    return this.primaryIsCh1 ? this.ch1CleanBuffer : this.ch2CleanBuffer;
  }

  /**
   * Resamples every trace from the current model state. Call once per frame.
   *
   * Honours the trigger mode, as a bench scope does:
   *   - `auto`   — sweeps even without a trigger event (free-running baseline)
   *   - `normal` — holds the last captured sweep until a trigger event arrives
   *   - `single` — captures one triggered sweep, then stops the sweep clock
   */
  public refresh(): void {
    const triggerMode = this.trigger.modeProperty.value;
    const ch1Audio = this.sourceProperty.value === "audio";

    // Capture the microphone before anything else whenever it is CH1's source —
    // including when the trigger watches CH2 — because the commit below always
    // reads this scratch for the audio path. It only reports a trigger as a side
    // effect of resampling, hence scratch rather than the committed buffer.
    const audioTriggered = ch1Audio
      ? this.audioInput.fillTrace(
          this.audioScratchBuffer,
          this.timeWindow,
          this.trigger.levelProperty.value,
          this.trigger.slopeProperty.value,
        )
      : false;

    // Resolve the trigger event. The analytic generator is searched directly; the
    // microphone's answer already came back from the capture above.
    let triggered: boolean;
    if (ch1Audio && this.trigger.sourceProperty.value === "ch1") {
      triggered = audioTriggered;
      this.triggerOffsetSeconds = 0;
    } else {
      const offset = this.computeTriggerOffset();
      triggered = offset !== null;
      this.triggerOffsetSeconds = offset ?? 0;
    }

    // NORMAL and SINGLE show nothing new until the comparator actually fires …
    if (!triggered && triggerMode !== "auto") {
      return;
    }

    // … and a SINGLE that has already taken its capture stays frozen until it is
    // re-armed, rather than quietly free-running like AUTO.
    if (triggerMode === "single" && !this.trigger.armedProperty.value) {
      return;
    }

    if (ch1Audio) {
      // A live microphone carries no separable "clean" signal — the captured
      // samples serve as both the displayed and the measured trace.
      this.ch1Buffer.set(this.audioScratchBuffer);
      this.ch1CleanBuffer.set(this.audioScratchBuffer);
      this.applyCoupling(this.ch1Buffer, this.ch1.couplingProperty.value, windowMean(this.ch1Buffer));
      this.applyCoupling(this.ch1CleanBuffer, this.ch1.couplingProperty.value, windowMean(this.ch1CleanBuffer));
    } else {
      this.fillFromGenerator(this.ch1Buffer, this.ch1CleanBuffer, 0, this.ch1.couplingProperty.value);
    }

    // CH2 always samples the function generator (never the microphone): it is the
    // phase-shifted reference channel for dual-trace / phase comparisons. Skip the
    // work entirely when nothing on screen can read it.
    const mathMode = this.mathModeProperty.value;
    const ch2Needed = this.ch2.enabledProperty.value || this.displayModeProperty.value === "xy" || mathMode !== "off";
    if (ch2Needed) {
      this.fillFromGenerator(
        this.ch2Buffer,
        this.ch2CleanBuffer,
        this.functionGenerator.phaseProperty.value,
        this.ch2.couplingProperty.value,
      );
    }

    if (mathMode !== "off") {
      const n = this.mathBuffer.length;
      for (let i = 0; i < n; i++) {
        const a = this.ch1Buffer[i] ?? 0;
        const b = this.ch2Buffer[i] ?? 0;
        this.mathBuffer[i] = mathMode === "add" ? a + b : a - b;
      }
    }

    // A single-shot capture is complete: disarm and freeze, like SINGLE on a scope.
    if (triggerMode === "single" && this.trigger.armedProperty.value) {
      this.trigger.armedProperty.value = false;
      this.timer.isPlayingProperty.value = false;
    }
  }

  /**
   * Samples the function generator across the display window into `buffer` (with
   * noise, for the display) and `cleanBuffer` (without, for measurements), then
   * applies the channel's coupling to both.
   *
   * The waveform is evaluated once per column and the noise added on top, rather
   * than evaluating the generator twice.
   */
  private fillFromGenerator(
    buffer: Float32Array,
    cleanBuffer: Float32Array,
    phaseDegrees: number,
    coupling: Coupling,
  ): void {
    const n = buffer.length;
    const windowSeconds = this.timeWindow;
    const fg = this.functionGenerator;
    const t0 = this.triggerOffsetSeconds;
    const hShift = this.horizontalPositionProperty.value * this.effectiveTimePerDivision;
    const lastIndex = Math.max(1, n - 1);

    // The trigger event (t0) sits at the horizontal center of the display, as on a
    // real bench scope, so the `-0.5` places the center column at the crossing.
    for (let i = 0; i < n; i++) {
      const t = t0 + (i / lastIndex - 0.5) * windowSeconds - hShift;
      const clean = fg.cleanVoltageAt(t, phaseDegrees);
      cleanBuffer[i] = clean;
      buffer[i] = clean + fg.noiseSample();
    }

    // Both buffers carry the same DC component, so both take the same correction.
    const dcVolts = fg.meanVoltage;
    this.applyCoupling(buffer, coupling, dcVolts);
    this.applyCoupling(cleanBuffer, coupling, dcVolts);
  }

  /**
   * Applies AC / DC / GND coupling to a filled buffer, in place.
   *
   * `dcVolts` is the signal's true DC component. It is passed in rather than
   * measured from the buffer because the mean of the *visible window* depends on
   * how many cycles the current time/div happens to show: for a waveform that is
   * not symmetric about the trigger point (a low-duty pulse, say) that would make
   * the AC-coupled baseline jump every time the timebase knob moves, which no
   * real scope does — its AC coupling is a fixed high-pass.
   */
  private applyCoupling(buffer: Float32Array, coupling: Coupling, dcVolts: number): void {
    if (coupling === "GND") {
      buffer.fill(0);
      return;
    }
    if (coupling === "AC" && dcVolts !== 0) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = (buffer[i] ?? 0) - dcVolts;
      }
    }
  }

  /**
   * Finds the time offset at which the trigger source crosses the trigger level
   * with the selected slope, so the displayed generator waveform stands still.
   *
   * Returns `null` when the comparator never fires over a full period — the level
   * is outside the signal's range, or the frequency is degenerate. Callers use
   * that to distinguish "no trigger event" (which holds a normal/single sweep)
   * from a genuine crossing at t = 0.
   */
  private computeTriggerOffset(): number | null {
    const source = this.trigger.sourceProperty.value;
    const fg = this.functionGenerator;
    const f = fg.frequencyProperty.value;
    if (f <= 0) {
      return null;
    }

    const phaseDeg = source === "ch2" ? fg.phaseProperty.value : 0;
    const level = this.trigger.levelProperty.value;
    const rising = this.trigger.slopeProperty.value === "rising";
    const period = 1 / f;

    let prev = fg.cleanVoltageAt(0, phaseDeg);
    for (let i = 1; i <= TRIGGER_SEARCH_STEPS; i++) {
      const t = (i / TRIGGER_SEARCH_STEPS) * period;
      const curr = fg.cleanVoltageAt(t, phaseDeg);
      const crossed = rising ? prev < level && curr >= level : prev > level && curr <= level;
      if (crossed) {
        const denom = curr - prev || 1;
        const frac = (level - prev) / denom;
        return ((i - 1 + frac) / TRIGGER_SEARCH_STEPS) * period;
      }
      prev = curr;
    }
    return null;
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
    this.cursorsEnabledProperty.reset();
    this.cursorTime1Property.reset();
    this.cursorTime2Property.reset();
    this.cursorVolt1Property.reset();
    this.cursorVolt2Property.reset();
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
    this.cursorsEnabledProperty.dispose();
    this.cursorTime1Property.dispose();
    this.cursorTime2Property.dispose();
    this.cursorVolt1Property.dispose();
    this.cursorVolt2Property.dispose();
  }
}

OscilloscopeNamespace.register("OscilloscopeModel", OscilloscopeModel);
