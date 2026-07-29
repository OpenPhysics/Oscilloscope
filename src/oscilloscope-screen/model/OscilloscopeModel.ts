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
import {
  AC_COUPLING_TIME_CONSTANT,
  AC_STEADY_STATE_SAMPLES,
  CURSOR_TIME_RANGE,
  CURSOR_VOLT_RANGE,
  HORIZONTAL_DIVISIONS,
  LINE_FREQUENCY,
  SCOPE_DEFAULT_DELAY,
  SCOPE_DEFAULT_DELAYED_TIME_PER_DIV,
  SCOPE_DEFAULT_FOCUS,
  SCOPE_DEFAULT_INTENSITY,
  SCOPE_DEFAULT_TIME_PER_DIV,
  SCOPE_DEFAULT_VOLTS_PER_DIV,
  SCOPE_DELAY_RANGE,
  SCOPE_FOCUS_RANGE,
  SCOPE_HORIZONTAL_POSITION_RANGE,
  SCOPE_INTENSITY_RANGE,
  SCOPE_MAGNIFY_FACTOR,
  SCOPE_TIME_PER_DIV_RANGE,
  SCOPE_TIME_PER_DIV_STEPS,
  TRACE_SAMPLE_COUNT,
  TRIGGER_SEARCH_STEPS,
  VERTICAL_DIVISIONS,
} from "../../OscilloscopeConstants.js";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";
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
 * Delayed-sweep (second timebase) display mode:
 *   - `off`         — a single main sweep
 *   - `intensified` — the main sweep, with the delayed window brightened on it
 *   - `delayed`     — the delayed window, zoomed to the delayed time/div
 */
export const DELAYED_SWEEP_MODES = ["off", "intensified", "delayed"] as const;
export type DelayedSweepMode = (typeof DELAYED_SWEEP_MODES)[number];

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

/**
 * First-order high-pass filter modelling AC-coupling droop, in place.
 *
 * Discrete form: y[i] = α·(y[i−1] + x[i] − x[i−1]) with α = τ/(τ+dt). Callers
 * should already have removed the DC component so the filter only shapes edges.
 * Pass `prevX0`/`prevY0` (from {@link settleAcHighPass}) to seed the filter with a
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
 * Solves for the AC high-pass's *periodic steady state* at `tEnd`, returning the
 * filter state `[prevX, prevY]` that seeds {@link applyAcHighPass} for the visible
 * window (whose first sample is at `tEnd`).
 *
 * The discrete high-pass is linear, so stepping it across one whole period of a
 * periodic input is an affine map on its state:
 *
 *     y(t + P) = a·y(t) + b,    a = α^N,    b = the one-period response from y = 0
 *
 * whose fixed point `y* = b / (1 − a)` is exactly the settled output — reached in
 * closed form instead of marching through the ~5 time-constants the transient
 * actually takes to decay. That matters at a fast timebase, where 5τ spans
 * thousands of periods: stepping it with a fixed, period-blind sample budget has
 * to alias the carrier, which used to leave tens of millivolts of baseline error
 * on a fast sweep. This costs one period of samples at any frequency.
 *
 * `sampleAt` must already have the DC component removed, and `periodSeconds` must
 * be finite and positive — callers with an aperiodic source (the noise waveform)
 * seed the filter directly instead.
 */
function settleAcHighPass(sampleAt: (t: number) => number, tEnd: number, periodSeconds: number): [number, number] {
  const steps = AC_STEADY_STATE_SAMPLES;
  const dt = periodSeconds / steps;
  // Work in the log domain: α sits within an ulp or two of 1 for a fast signal, so
  // α^N and 1 − α^N both lose all their significance if computed directly.
  const logAlpha = Math.log1p(-dt / (AC_COUPLING_TIME_CONSTANT + dt));
  const alpha = Math.exp(logAlpha);
  const oneMinusDecay = -Math.expm1(steps * logAlpha);

  const tStart = tEnd - periodSeconds;
  let prevX = sampleAt(tStart);
  let response = 0;
  for (let i = 1; i <= steps; i++) {
    const x = sampleAt(tStart + i * dt);
    response = alpha * (response + x - prevX);
    prevX = x;
  }

  // The final step lands on tEnd, so prevX is the sample at the window start and
  // `response` is b — the one-period response from a zero initial state.
  return [prevX, oneMinusDecay > 0 ? response / oneMinusDecay : response];
}

/** The largest entry of `steps` that does not exceed `limit` (the smallest if none does). */
function largestStepAtMost(steps: readonly number[], limit: number): number {
  let best: number | null = null;
  let smallest = steps[0] ?? limit;
  for (const step of steps) {
    if (step < smallest) {
      smallest = step;
    }
    if (step <= limit && (best === null || step > best)) {
      best = step;
    }
  }
  return best ?? smallest;
}

/**
 * How the trigger comparator must be transformed to watch what a channel actually
 * displays. See {@link OscilloscopeModel.triggerViewFor}.
 */
type TriggerView = {
  /** Threshold in raw source volts, before coupling and invert. */
  readonly level: number;
  /** Whether the comparator looks for a rising edge of the raw source. */
  readonly rising: boolean;
};

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

  /** Delayed-sweep (second timebase) display mode. */
  public readonly delayedSweepModeProperty = new StringUnionProperty<DelayedSweepMode>("off", {
    validValues: [...DELAYED_SWEEP_MODES],
  });

  /** Position of the delay marker on the main sweep, in divisions from the left edge. */
  public readonly delayProperty = new NumberProperty(SCOPE_DEFAULT_DELAY, {
    range: SCOPE_DELAY_RANGE,
  });

  /** Delayed timebase sensitivity, in seconds per division (the zoom of the delayed slice). */
  public readonly delayedTimePerDivisionProperty = new NumberProperty(SCOPE_DEFAULT_DELAYED_TIME_PER_DIV, {
    range: SCOPE_TIME_PER_DIV_RANGE,
    units: "s",
  });

  /** Y-T versus X-Y versus FFT display. */
  public readonly displayModeProperty = new StringUnionProperty<DisplayMode>("yt", {
    validValues: [...DISPLAY_MODES],
  });

  /** Whether previous sweeps linger (afterglow / persistence). */
  public readonly persistenceProperty = new BooleanProperty(false);

  /** CRT beam intensity (trace brightness), 0.2–1. */
  public readonly intensityProperty = new NumberProperty(SCOPE_DEFAULT_INTENSITY, {
    range: SCOPE_INTENSITY_RANGE,
  });

  /** CRT beam focus: 1 draws a sharp hairline, lower values defocus (thicken) it. */
  public readonly focusProperty = new NumberProperty(SCOPE_DEFAULT_FOCUS, {
    range: SCOPE_FOCUS_RANGE,
  });

  /**
   * Whether BEAM FIND is engaged: overrides intensity to full and pulls an
   * off-screen trace back inside the graticule, matching a scope's beam-finder key.
   */
  public readonly beamFinderProperty = new BooleanProperty(false);

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
  private clampingTimebase = false;

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

    // The microphone's acquisition memory is finite, so the sweep it can fill is
    // too. Hold the timebase inside that limit rather than letting the graticule
    // claim more time than the capture actually holds.
    Multilink.multilink(
      [
        this.ch1.inputProperty,
        this.ch2.inputProperty,
        this.timePerDivisionProperty,
        this.magnifyProperty,
        this.audioInput.statusProperty,
      ],
      () => this.enforceMicrophoneTimebase(),
    );

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

  /**
   * The longest time/div the microphone can honestly fill, given that an
   * `AnalyserNode` only hands back a fixed number of the most recent samples.
   * Beyond this the graticule would be labelling time the capture does not hold,
   * so {@link enforceMicrophoneTimebase} clamps the knob to it instead.
   */
  public get microphoneMaxTimePerDivision(): number {
    const perDivision = this.audioInput.maxWindowSeconds / HORIZONTAL_DIVISIONS;
    return perDivision * (this.magnifyProperty.value ? SCOPE_MAGNIFY_FACTOR : 1);
  }

  /**
   * Arms and starts a single-shot capture, as the front-panel SINGLE key does:
   * select SINGLE, arm, and make sure the sweep clock runs so the next trigger
   * event lands. Pressing SINGLE again re-arms a scope that already stopped.
   */
  public captureSingle(): void {
    this.trigger.modeProperty.value = "single";
    this.trigger.arm();
    this.timer.isPlayingProperty.value = true;
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

  /**
   * Whether the delayed timebase is being displayed (the zoomed slice). The
   * microphone path has no analytic pre-roll to sample outside its capture, so the
   * delayed sweep is a generator/analytic feature and is inert while a mic is patched.
   */
  public get delayedActive(): boolean {
    return this.delayedSweepModeProperty.value === "delayed" && !this.microphoneInUse;
  }

  /** Time spanned by the delayed sweep across the whole graticule, in seconds. */
  public get delayedWindow(): number {
    return this.delayedTimePerDivisionProperty.value * HORIZONTAL_DIVISIONS;
  }

  /** The delay from the trigger to the start of the delayed window, in seconds. */
  public get delaySeconds(): number {
    return (this.delayProperty.value - HORIZONTAL_DIVISIONS / 2) * this.effectiveTimePerDivision;
  }

  /** Seconds per division of whatever sweep is currently on screen (main or delayed). */
  public get displayedTimePerDivision(): number {
    return this.delayedActive ? this.delayedTimePerDivisionProperty.value : this.effectiveTimePerDivision;
  }

  /** Time spanned by whatever sweep is currently on screen, in seconds. */
  public get displayedTimeWindow(): number {
    return this.delayedActive ? this.delayedWindow : this.timeWindow;
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
    const triggered = this.acquireTrigger();

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

  /**
   * Runs the trigger comparator for this frame, recapturing the microphone along
   * the way (it can only report whether it triggered as a side effect of
   * resampling), and leaves {@link triggerOffsetSeconds} set for the sweep.
   *
   * @returns whether a trigger event was found — `auto` sweeps anyway, `normal`
   *   and `single` hold their last capture.
   */
  private acquireTrigger(): boolean {
    const source = this.trigger.sourceProperty.value;
    const holdoff = this.trigger.holdoffProperty.value;
    this.triggerOffsetSeconds = 0;

    // A channel source (CH1/CH2) watches what that channel displays, so the
    // front-panel level and slope are mapped through its coupling and invert. LINE
    // and EXT are their own reference signals and use no channel.
    const sourceChannel = source === "ch1" ? this.ch1 : source === "ch2" ? this.ch2 : null;
    const sourceIsMic = sourceChannel?.inputProperty.value === "microphone";
    const channelView = sourceChannel
      ? this.triggerViewFor(
          sourceChannel,
          sourceIsMic ? windowMean(this.audioScratchBuffer) : this.functionGenerator.meanVoltage,
        )
      : null;

    // Resample the microphone whenever it is patched, regardless of the trigger
    // source — a channel may be holding the mic even when LINE/EXT drives the
    // sweep. Only when the mic *is* the trigger source do its level/slope matter.
    const audioTriggered = this.microphoneInUse
      ? this.audioInput.fillTrace(
          this.audioScratchBuffer,
          this.timeWindow,
          sourceIsMic ? (channelView?.level ?? 0) : 0,
          sourceIsMic && channelView?.rising === false ? "falling" : "rising",
        )
      : false;

    const rising = this.trigger.slopeProperty.value === "rising";
    const fg = this.functionGenerator;

    if (source === "line") {
      // Trigger on the internal AC-mains reference (a fixed sine). A signal
      // harmonically related to the mains stands still; an unrelated one rolls.
      const offset = this.computeCrossingOffset(
        (t) => Math.sin(2 * Math.PI * LINE_FREQUENCY * t),
        1 / LINE_FREQUENCY,
        0,
        rising,
        holdoff,
      );
      this.triggerOffsetSeconds = offset ?? 0;
      return offset !== null;
    }

    if (source === "ext") {
      // Trigger on the generator's own output A as an external sync, independent of
      // any channel's coupling/invert, using the raw front-panel level.
      const f = fg.frequencyProperty.value;
      if (f <= 0) {
        return false;
      }
      const offset = this.computeCrossingOffset(
        (t) => fg.cleanVoltageAt(t, 0),
        1 / f,
        this.trigger.levelProperty.value,
        rising,
        holdoff,
      );
      this.triggerOffsetSeconds = offset ?? 0;
      return offset !== null;
    }

    // Channel source (CH1/CH2). A grounded channel has no signal to trigger on.
    if (!channelView) {
      return false;
    }
    if (sourceIsMic) {
      return audioTriggered;
    }
    const input = sourceChannel?.inputProperty.value ?? "none";
    // Unpatched trigger source: free-run in auto; hold otherwise.
    if (!this.isGeneratorInput(input)) {
      return false;
    }
    const offset = this.computeTriggerOffset(input, channelView, holdoff);
    this.triggerOffsetSeconds = offset ?? 0;
    return offset !== null;
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

  /**
   * Maps the front-panel trigger level and slope — which the user sets against the
   * trace *as drawn*, via the on-screen marker — into the raw source signal the
   * comparator searches.
   *
   * The displayed trace is `sign · (source − dc)`, so a displayed crossing of
   * `level` on the selected edge is a raw crossing of `sign·level + dc` on the edge
   * `sign` maps it to. Without this the marker and the comparator disagree: an
   * AC-coupled offset signal holds forever in NORMAL with the marker sitting right
   * on the waveform, and an inverted channel fires its "rising" trigger on a
   * visibly falling edge.
   *
   * @param channel - the channel the trigger watches
   * @param dcVolts - the DC component AC coupling removes from that channel
   * @returns null for a grounded channel, which has no signal to trigger on
   */
  private triggerViewFor(channel: Channel, dcVolts: number): TriggerView | null {
    const coupling = channel.couplingProperty.value;
    if (coupling === "GND") {
      return null;
    }
    const inverted = channel.invertedProperty.value;
    const sign = inverted ? -1 : 1;
    const dc = coupling === "AC" ? dcVolts : 0;
    const risingOnScreen = this.trigger.slopeProperty.value === "rising";
    return {
      level: sign * this.trigger.levelProperty.value + dc,
      rising: inverted ? !risingOnScreen : risingOnScreen,
    };
  }

  /**
   * Pulls the timebase back inside {@link microphoneMaxTimePerDivision} whenever the
   * microphone is patched, snapping down to the next 1-2-5 detent so the knob keeps
   * reading a real switch position.
   */
  private enforceMicrophoneTimebase(): void {
    if (this.clampingTimebase || !this.microphoneInUse) {
      return;
    }
    const limit = this.microphoneMaxTimePerDivision;
    if (this.timePerDivisionProperty.value <= limit) {
      return;
    }
    this.clampingTimebase = true;
    this.timePerDivisionProperty.value = largestStepAtMost([...SCOPE_TIME_PER_DIV_STEPS], limit);
    this.clampingTimebase = false;
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
    const fg = this.functionGenerator;
    const t0 = this.triggerOffsetSeconds;
    const lastIndex = Math.max(1, n - 1);
    const dcVolts = fg.meanVoltage;

    // The sweep spans `winWidth` seconds beginning at `winStart` (both measured from
    // the trigger). The main sweep is centered on the trigger and shifted by the
    // horizontal-position knob; the delayed sweep is a short window offset by the
    // delay and zoomed to the delayed time/div.
    const delayed = this.delayedActive;
    const winWidth = delayed ? this.delayedWindow : this.timeWindow;
    const hShift = this.horizontalPositionProperty.value * this.effectiveTimePerDivision;
    const winStart = delayed ? t0 + this.delaySeconds : t0 - 0.5 * this.timeWindow - hShift;

    for (let i = 0; i < n; i++) {
      const t = winStart + (i / lastIndex) * winWidth;
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
      // Seed the high-pass with its settled state so the visible window is not
      // skewed by the filter's startup transient. Noise is white, so both traces
      // are settled on the same clean carrier.
      const frequency = fg.frequencyProperty.value;
      const periodic = fg.waveformProperty.value !== "noise" && frequency > 0;
      const [prevX, prevY] = periodic
        ? settleAcHighPass((t) => fg.cleanVoltageAt(t, phaseDegrees) - dcVolts, winStart, 1 / frequency)
        : // Aperiodic (the noise waveform) has no steady state to solve for, and
          // no DC to decay away either — it is already zero-mean, so starting the
          // filter at rest costs nothing visible.
          [fg.cleanVoltageAt(winStart, phaseDegrees) - dcVolts, 0];
      for (let i = 0; i < n; i++) {
        buffer[i] = (buffer[i] ?? 0) - dcVolts;
        cleanBuffer[i] = (cleanBuffer[i] ?? 0) - dcVolts;
      }
      applyAcHighPass(buffer, winWidth, prevX, prevY);
      applyAcHighPass(cleanBuffer, winWidth, prevX, prevY);
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
      // Audio sits far above the filter's 1/(2πτ) ≈ 16 Hz corner, where the
      // high-pass settles to unity gain, so y = x is the right starting state.
      // Starting from rest instead would ramp the left edge of every sweep.
      const first = buffer[0] ?? 0;
      applyAcHighPass(buffer, this.timeWindow, first, first);
    }
  }

  private computeTriggerOffset(input: ChannelInput, view: TriggerView, holdoff: number): number | null {
    const fg = this.functionGenerator;
    const f = fg.frequencyProperty.value;
    if (f <= 0 || !this.isGeneratorInput(input)) {
      return null;
    }
    const phaseDeg = this.phaseForInput(input);
    return this.computeCrossingOffset((t) => fg.cleanVoltageAt(t, phaseDeg), 1 / f, view.level, view.rising, holdoff);
  }

  /**
   * Finds the sweep origin: the time (within one `period`) at which `sampler`
   * crosses `level` on the selected edge, refined by linear interpolation.
   *
   * Holdoff models a bench scope's trigger holdoff: after an accepted trigger the
   * comparator ignores crossings for `holdoff` seconds, so the first crossing at
   * or after `holdoff` (modulo the period) becomes the trigger. On a waveform with
   * a single edge per cycle this simply skips whole periods and lands on the same
   * phase — the display is unchanged, exactly as on a real scope with a simple
   * repetitive signal. On a waveform with several edges per cycle it selects a
   * later edge, which is what stabilizes the display.
   *
   * `sampler` is assumed periodic with `period`, so the search seeds its previous
   * sample from one step *before* t = 0 (equivalently, `period − dt`). That catches
   * a crossing sitting exactly on the period boundary — e.g. a sine that starts on
   * its own rising zero-crossing, whose next rising crossing lands where floating
   * point makes sin(2π) a hair negative and a t=0-seeded scan would step right past.
   *
   * @returns the crossing time in seconds on [0, period), or null when none occurs.
   */
  private computeCrossingOffset(
    sampler: (t: number) => number,
    period: number,
    level: number,
    rising: boolean,
    holdoff: number,
  ): number | null {
    if (!(period > 0)) {
      return null;
    }
    const hold = holdoff > 0 ? holdoff % period : 0;
    const dt = period / TRIGGER_SEARCH_STEPS;
    let firstCrossing: number | null = null;
    let afterHoldoff: number | null = null;

    let prev = sampler(-dt);
    for (let i = 0; i < TRIGGER_SEARCH_STEPS; i++) {
      const curr = sampler(i * dt);
      const crossed = rising ? prev < level && curr >= level : prev > level && curr <= level;
      if (crossed) {
        const denom = curr - prev || 1;
        const frac = (level - prev) / denom;
        let tc = (i - 1 + frac) * dt;
        if (tc < 0) {
          tc += period; // a boundary crossing wraps into [0, period)
        }
        if (firstCrossing === null) {
          firstCrossing = tc;
        }
        if (afterHoldoff === null && tc >= hold) {
          afterHoldoff = tc;
          break;
        }
      }
      prev = curr;
    }
    // Prefer the first post-holdoff crossing; fall back to the first crossing of
    // all (a full period later it, too, satisfies the holdoff — same phase).
    return afterHoldoff ?? firstCrossing;
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
    this.delayedSweepModeProperty.reset();
    this.delayProperty.reset();
    this.delayedTimePerDivisionProperty.reset();
    this.displayModeProperty.reset();
    this.persistenceProperty.reset();
    this.intensityProperty.reset();
    this.focusProperty.reset();
    this.beamFinderProperty.reset();
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
    this.delayedSweepModeProperty.dispose();
    this.delayProperty.dispose();
    this.delayedTimePerDivisionProperty.dispose();
    this.displayModeProperty.dispose();
    this.persistenceProperty.dispose();
    this.intensityProperty.dispose();
    this.focusProperty.dispose();
    this.beamFinderProperty.dispose();
    this.mathModeProperty.dispose();
    this.cursorsEnabledProperty.dispose();
    this.cursorTime1Property.dispose();
    this.cursorTime2Property.dispose();
    this.cursorVolt1Property.dispose();
    this.cursorVolt2Property.dispose();
  }
}

OscilloscopeNamespace.register("OscilloscopeModel", OscilloscopeModel);
