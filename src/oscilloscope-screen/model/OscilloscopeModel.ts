/**
 * OscilloscopeModel.ts
 *
 * Top-level model for the oscilloscope screen. It owns:
 *   - two vertical input {@link Channel}s (CH1, CH2), each with volts/div,
 *     position, coupling, invert, on/off, and a BNC {@link ChannelInput} patch
 *   - a {@link FunctionGenerator} with dual outputs A (in-phase) and B (phase)
 *   - an {@link AudioInput} (live microphone), patchable into either channel
 *   - the horizontal system (time/div, position, ×10 magnify)
 *   - the {@link Trigger} system (source, level, slope, mode)
 *   - display options: Y-T vs X-Y vs FFT, persistence, and a CH1±CH2 math trace
 *   - a run/stop clock ({@link TimeModel}) — when stopped, the trace freezes
 *
 * Each frame the view calls {@link refresh} to resample every trace, then reads
 * the per-channel buffers to draw. All buffers are reused between frames.
 */

import {
  BooleanProperty,
  Multilink,
  NumberProperty,
  StringUnionProperty,
  type TReadOnlyProperty,
} from "scenerystack/axon";
import type { TModel } from "scenerystack/joist";
import { TimeModel } from "../../common/TimeModel.js";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";
import {
  AC_COUPLING_TIME_CONSTANT,
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
import type { ChannelInput, SignalJack } from "./ChannelInput.js";
import type { Coupling } from "./Coupling.js";
import { FunctionGenerator } from "./FunctionGenerator.js";
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
 * The mean of a filled buffer. Used for the microphone AC path, where no
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

/** Bounded number of samples used to settle the AC high-pass before the window. */
const AC_WARMUP_SAMPLES = 1024;

/**
 * First-order high-pass filter modelling AC-coupling droop, in place.
 *
 * Discrete form: y[i] = α·(y[i−1] + x[i] − x[i−1]) with α = τ/(τ+dt). Callers
 * should already have removed the DC component so the filter only shapes edges.
 * Pass `prevX0`/`prevY0` (from {@link warmAcHighPass}) to seed the filter with a
 * settled state so the visible window is not biased by the startup transient;
 * omit them to start cold (prevX = first sample, prevY = 0).
 */
function applyAcHighPass(buffer: Float32Array, windowSeconds: number, prevX0?: number, prevY0?: number): void {
  const n = buffer.length;
  if (n < 2 || windowSeconds <= 0) {
    buffer.fill(0);
    return;
  }
  const dt = windowSeconds / (n - 1);
  const alpha = AC_COUPLING_TIME_CONSTANT / (AC_COUPLING_TIME_CONSTANT + dt);

  let prevX = prevX0 ?? buffer[0] ?? 0;
  let prevY = prevY0 ?? 0;

  for (let i = 0; i < n; i++) {
    const x = buffer[i] ?? 0;
    const y = alpha * (prevY + x - prevX);
    buffer[i] = y;
    prevX = x;
    prevY = y;
  }
}

/**
 * Settles the AC high-pass over ~5 time-constants of signal ending at `tEnd`,
 * returning the filter state `[prevX, prevY]` to seed {@link applyAcHighPass}
 * for the visible window (whose first sample is at `tEnd`).
 *
 * The warm-up steps a fixed, bounded number of samples (`AC_WARMUP_SAMPLES`)
 * with its own dt and matching α, independent of the timebase. This keeps a fast
 * sweep cheap — otherwise, at window-resolution, 5τ can span tens of millions of
 * samples per frame — while still finely settling the filter's slow dynamics.
 * `sampleAt` must already have the DC component removed.
 */
function warmAcHighPass(sampleAt: (t: number) => number, tEnd: number): [number, number] {
  const warmupSeconds = 5 * AC_COUPLING_TIME_CONSTANT;
  const dt = warmupSeconds / AC_WARMUP_SAMPLES;
  const alpha = AC_COUPLING_TIME_CONSTANT / (AC_COUPLING_TIME_CONSTANT + dt);
  const tStart = tEnd - warmupSeconds;

  let prevX = sampleAt(tStart);
  let prevY = 0;
  for (let i = 1; i <= AC_WARMUP_SAMPLES; i++) {
    const x = sampleAt(tStart + i * dt);
    prevY = alpha * (prevY + x - prevX);
    prevX = x;
  }
  // The final step lands at tEnd, so prevX is the sample at the window start.
  return [prevX, prevY];
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

  /** The synthetic-signal source (outputs A and B). */
  public readonly functionGenerator: FunctionGenerator;

  /** The live-microphone source. */
  public readonly audioInput = new AudioInput();

  /** Vertical channel 1 — starts patched to function-generator output A. */
  public readonly ch1 = new Channel({
    index: 1,
    initiallyEnabled: true,
    initialVoltsPerDivision: SCOPE_DEFAULT_VOLTS_PER_DIV,
    initialInput: "functionGeneratorA",
  });

  /** Vertical channel 2 (off and unpatched by default, like a real scope). */
  public readonly ch2 = new Channel({
    index: 2,
    initiallyEnabled: false,
    initialVoltsPerDivision: SCOPE_DEFAULT_VOLTS_PER_DIV,
    initialInput: "none",
  });

  /** The trigger system. */
  public readonly trigger = new Trigger();

  /** Horizontal sensitivity, in seconds per division. */
  public readonly timePerDivisionProperty: NumberProperty;

  /** Horizontal trace position (offset), in divisions. */
  public readonly horizontalPositionProperty = new NumberProperty(0, {
    range: SCOPE_HORIZONTAL_POSITION_RANGE,
  });

  /** Whether the ×10 horizontal magnifier is engaged. */
  public readonly magnifyProperty = new BooleanProperty(false);

  /** Y-T versus X-Y versus FFT display. */
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
  private syncingPatch = false;

  public constructor(providedOptions?: OscilloscopeModelOptions) {
    this.functionGenerator = new FunctionGenerator(
      providedOptions?.noiseEnabledProperty,
      providedOptions?.noiseAmplitudeProperty,
    );

    this.timePerDivisionProperty = new NumberProperty(SCOPE_DEFAULT_TIME_PER_DIV, {
      range: SCOPE_TIME_PER_DIV_RANGE,
      units: "s",
    });

    // Exclusive occupancy: each source jack feeds at most one BNC.
    this.ch1.inputProperty.link((input) => this.enforceExclusivePatch(this.ch1, input));
    this.ch2.inputProperty.link((input) => this.enforceExclusivePatch(this.ch2, input));

    // Acquire / release the microphone whenever either channel is patched to it.
    Multilink.multilink([this.ch1.inputProperty, this.ch2.inputProperty], (a, b) => {
      if (a === "microphone" || b === "microphone") {
        this.audioInput.start().catch(() => {
          /* unreachable — start() catches all failures and sets statusProperty */
        });
      } else {
        this.audioInput.stop();
      }
    });

    this.trigger.modeProperty.link((mode) => {
      if (mode === "single") {
        this.trigger.arm();
      }
    });

    this.timer.isPlayingProperty.link((isPlaying) => {
      if (isPlaying && this.trigger.modeProperty.value === "single") {
        this.trigger.arm();
      }
    });
  }

  /** Channel 1 or 2 by index. */
  public channel(index: 1 | 2): Channel {
    return index === 1 ? this.ch1 : this.ch2;
  }

  /** Which channel (if any) currently owns this source jack. */
  public channelForJack(jack: SignalJack): Channel | null {
    if (this.ch1.inputProperty.value === jack) {
      return this.ch1;
    }
    if (this.ch2.inputProperty.value === jack) {
      return this.ch2;
    }
    return null;
  }

  /**
   * Patch `jack` into `channelIndex`, clearing any other channel that held it
   * and disconnecting whatever was previously on this BNC.
   */
  public connectJack(channelIndex: 1 | 2, jack: SignalJack): void {
    this.channel(channelIndex).inputProperty.value = jack;
  }

  /** Unplug the BNC for the given channel. */
  public disconnectChannel(channelIndex: 1 | 2): void {
    this.channel(channelIndex).inputProperty.value = "none";
  }

  /** True when either channel is patched to the microphone. */
  public get microphoneInUse(): boolean {
    return this.ch1.inputProperty.value === "microphone" || this.ch2.inputProperty.value === "microphone";
  }

  public get sampleCount(): number {
    return this.ch1Buffer.length;
  }

  public get effectiveTimePerDivision(): number {
    return this.timePerDivisionProperty.value / (this.magnifyProperty.value ? SCOPE_MAGNIFY_FACTOR : 1);
  }

  public get timeWindow(): number {
    return this.effectiveTimePerDivision * HORIZONTAL_DIVISIONS;
  }

  public get ch1Trace(): Float32Array {
    return this.ch1Buffer;
  }

  public get ch2Trace(): Float32Array {
    return this.ch2Buffer;
  }

  public get primaryIsCh1(): boolean {
    return this.ch1.enabledProperty.value || !this.ch2.enabledProperty.value;
  }

  public get primaryChannel(): Channel {
    return this.primaryIsCh1 ? this.ch1 : this.ch2;
  }

  public get primaryTrace(): Float32Array {
    return this.primaryIsCh1 ? this.ch1Buffer : this.ch2Buffer;
  }

  public get mathTrace(): Float32Array {
    return this.mathBuffer;
  }

  public get primaryCleanTrace(): Float32Array {
    return this.primaryIsCh1 ? this.ch1CleanBuffer : this.ch2CleanBuffer;
  }

  public get ch1CleanTrace(): Float32Array {
    return this.ch1CleanBuffer;
  }

  public get ch2CleanTrace(): Float32Array {
    return this.ch2CleanBuffer;
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
    const micInUse = this.microphoneInUse;
    const triggerChannel = this.trigger.sourceProperty.value === "ch2" ? this.ch2 : this.ch1;
    const triggerIsMic = triggerChannel.inputProperty.value === "microphone";

    const audioTriggered = micInUse
      ? this.audioInput.fillTrace(
          this.audioScratchBuffer,
          this.timeWindow,
          this.trigger.levelProperty.value,
          this.trigger.slopeProperty.value,
        )
      : false;

    let triggered: boolean;
    if (triggerIsMic) {
      triggered = audioTriggered;
      this.triggerOffsetSeconds = 0;
    } else if (this.isGeneratorInput(triggerChannel.inputProperty.value)) {
      const offset = this.computeTriggerOffset(triggerChannel.inputProperty.value);
      triggered = offset !== null;
      this.triggerOffsetSeconds = offset ?? 0;
    } else {
      // Unpatched trigger source: free-run in auto; hold otherwise.
      triggered = false;
      this.triggerOffsetSeconds = 0;
    }

    if (!triggered && triggerMode !== "auto") {
      return;
    }

    if (triggerMode === "single" && !this.trigger.armedProperty.value) {
      return;
    }

    this.fillChannel(this.ch1, this.ch1Buffer, this.ch1CleanBuffer);

    const mathMode = this.mathModeProperty.value;
    const ch2Needed = this.ch2.enabledProperty.value || this.displayModeProperty.value === "xy" || mathMode !== "off";
    if (ch2Needed) {
      this.fillChannel(this.ch2, this.ch2Buffer, this.ch2CleanBuffer);
    }

    if (mathMode !== "off") {
      const n = this.mathBuffer.length;
      for (let i = 0; i < n; i++) {
        const a = this.ch1Buffer[i] ?? 0;
        const b = this.ch2Buffer[i] ?? 0;
        this.mathBuffer[i] = mathMode === "add" ? a + b : a - b;
      }
    }

    if (triggerMode === "single" && this.trigger.armedProperty.value) {
      this.trigger.armedProperty.value = false;
      this.timer.isPlayingProperty.value = false;
    }
  }

  private enforceExclusivePatch(changed: Channel, input: ChannelInput): void {
    if (this.syncingPatch || input === "none") {
      return;
    }
    const other = changed === this.ch1 ? this.ch2 : this.ch1;
    if (other.inputProperty.value === input) {
      this.syncingPatch = true;
      other.inputProperty.value = "none";
      this.syncingPatch = false;
    }
  }

  private isGeneratorInput(input: ChannelInput): input is "functionGeneratorA" | "functionGeneratorB" {
    return input === "functionGeneratorA" || input === "functionGeneratorB";
  }

  private phaseForInput(input: ChannelInput): number {
    return input === "functionGeneratorB" ? this.functionGenerator.phaseProperty.value : 0;
  }

  private fillChannel(channel: Channel, buffer: Float32Array, cleanBuffer: Float32Array): void {
    const input = channel.inputProperty.value;
    const coupling = channel.couplingProperty.value;

    if (input === "none") {
      buffer.fill(0);
      cleanBuffer.fill(0);
      return;
    }

    if (input === "microphone") {
      buffer.set(this.audioScratchBuffer);
      cleanBuffer.set(this.audioScratchBuffer);
      this.applyCoupling(buffer, coupling, windowMean(buffer));
      this.applyCoupling(cleanBuffer, coupling, windowMean(cleanBuffer));
      return;
    }

    this.fillFromGenerator(buffer, cleanBuffer, this.phaseForInput(input), coupling);
  }

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
    const dcVolts = fg.meanVoltage;

    for (let i = 0; i < n; i++) {
      const t = t0 + (i / lastIndex - 0.5) * windowSeconds - hShift;
      const clean = fg.cleanVoltageAt(t, phaseDegrees);
      cleanBuffer[i] = clean;
      buffer[i] = clean + fg.noiseSample();
    }

    if (coupling === "GND") {
      buffer.fill(0);
      cleanBuffer.fill(0);
      return;
    }

    if (coupling === "AC") {
      // Settle the high-pass on ~5 time-constants of pre-roll so the visible
      // window is not skewed by the filter's startup transient. Noise is white,
      // so both traces are warmed on the same clean carrier.
      const tWindowStart = t0 + (0 / lastIndex - 0.5) * windowSeconds - hShift;
      const [prevX, prevY] = warmAcHighPass((t) => fg.cleanVoltageAt(t, phaseDegrees) - dcVolts, tWindowStart);
      for (let i = 0; i < n; i++) {
        buffer[i] = (buffer[i] ?? 0) - dcVolts;
        cleanBuffer[i] = (cleanBuffer[i] ?? 0) - dcVolts;
      }
      applyAcHighPass(buffer, windowSeconds, prevX, prevY);
      applyAcHighPass(cleanBuffer, windowSeconds, prevX, prevY);
      return;
    }

    // DC: leave as sampled.
  }

  /**
   * Applies coupling to a microphone buffer in place (generator path handles AC
   * itself so it can warm the high-pass on analytic pre-roll).
   */
  private applyCoupling(buffer: Float32Array, coupling: Coupling, dcVolts: number): void {
    if (coupling === "GND") {
      buffer.fill(0);
      return;
    }
    if (coupling === "AC") {
      if (dcVolts !== 0) {
        for (let i = 0; i < buffer.length; i++) {
          buffer[i] = (buffer[i] ?? 0) - dcVolts;
        }
      }
      applyAcHighPass(buffer, this.timeWindow);
    }
  }

  private computeTriggerOffset(input: ChannelInput): number | null {
    const fg = this.functionGenerator;
    const f = fg.frequencyProperty.value;
    if (f <= 0 || !this.isGeneratorInput(input)) {
      return null;
    }

    const phaseDeg = this.phaseForInput(input);
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
