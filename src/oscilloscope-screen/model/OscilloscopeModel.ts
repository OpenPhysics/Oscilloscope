/**
 * OscilloscopeModel.ts
 *
 * Top-level model for the oscilloscope screen. It owns:
 *   - a {@link FunctionGenerator} (synthetic sine / square / triangle / sawtooth)
 *   - an {@link AudioInput} (live microphone)
 *   - the selected input {@link SignalSource}
 *   - the scope's vertical (volts/div) and horizontal (time/div) sensitivity
 *   - a run/stop clock ({@link TimeModel}) — when stopped, the trace freezes
 *
 * The view samples the model each frame via {@link getTrace}, which returns the
 * displayed voltage at every horizontal pixel column.
 */

import { NumberProperty, StringUnionProperty } from "scenerystack/axon";
import type { TModel } from "scenerystack/joist";
import { TimeModel } from "../../common/TimeModel.js";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";
import {
  HORIZONTAL_DIVISIONS,
  SCOPE_DEFAULT_TIME_PER_DIV,
  SCOPE_DEFAULT_VOLTS_PER_DIV,
  SCOPE_TIME_PER_DIV_RANGE,
  SCOPE_VOLTS_PER_DIV_RANGE,
  TRACE_SAMPLE_COUNT,
} from "../../SimConstants.js";
import { AudioInput } from "./AudioInput.js";
import { FunctionGenerator } from "./FunctionGenerator.js";
import { SIGNAL_SOURCES, type SignalSource } from "./SignalSource.js";

export class OscilloscopeModel implements TModel {
  /** Run/Stop clock. Starts running so the trace is live on load. */
  public readonly timer = new TimeModel(true);

  /** The synthetic-signal source. */
  public readonly functionGenerator = new FunctionGenerator();

  /** The live-microphone source. */
  public readonly audioInput = new AudioInput();

  /** Which source is currently displayed. */
  public readonly sourceProperty = new StringUnionProperty<SignalSource>("functionGenerator", {
    validValues: [...SIGNAL_SOURCES],
  });

  /** Horizontal sensitivity, in seconds per division. */
  public readonly timePerDivisionProperty: NumberProperty;

  /** Vertical sensitivity, in volts per division. */
  public readonly voltsPerDivisionProperty: NumberProperty;

  /** Reusable buffer of displayed voltages, one per horizontal pixel column. */
  private readonly traceBuffer = new Float32Array(TRACE_SAMPLE_COUNT);

  public constructor() {
    this.timePerDivisionProperty = new NumberProperty(SCOPE_DEFAULT_TIME_PER_DIV, {
      range: SCOPE_TIME_PER_DIV_RANGE,
      units: "s",
    });
    this.voltsPerDivisionProperty = new NumberProperty(SCOPE_DEFAULT_VOLTS_PER_DIV, {
      range: SCOPE_VOLTS_PER_DIV_RANGE,
      units: "V",
    });

    // Acquire / release the microphone as the source selection changes.
    this.sourceProperty.link((source) => {
      if (source === "audio") {
        // start() handles its own errors internally and never rejects.
        this.audioInput.start().catch(() => {
          /* unreachable — start() catches all failures and sets statusProperty */
        });
      } else {
        this.audioInput.stop();
      }
    });
  }

  /** Number of samples returned by {@link getTrace}. */
  public get sampleCount(): number {
    return this.traceBuffer.length;
  }

  /** The time span, in seconds, currently shown across the whole display. */
  public get timeWindow(): number {
    return this.timePerDivisionProperty.value * HORIZONTAL_DIVISIONS;
  }

  /**
   * Samples the active source across the display's time window and returns the
   * displayed voltage at each horizontal pixel column. The returned array is
   * reused between calls — copy it if you need to retain the values.
   */
  public getTrace(): Float32Array {
    const buffer = this.traceBuffer;
    const windowSeconds = this.timeWindow;

    if (this.sourceProperty.value === "audio") {
      this.audioInput.fillTrace(buffer, windowSeconds);
      return buffer;
    }

    const fg = this.functionGenerator;
    const n = buffer.length;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * windowSeconds;
      buffer[i] = fg.voltageAt(t);
    }
    return buffer;
  }

  public reset(): void {
    this.timer.reset();
    this.functionGenerator.reset();
    // Resetting the source back to the function generator releases the mic via the link.
    this.sourceProperty.reset();
    this.timePerDivisionProperty.reset();
    this.voltsPerDivisionProperty.reset();
  }

  public step(dt: number): void {
    this.timer.step(dt);
  }

  public dispose(): void {
    this.timer.dispose();
    this.functionGenerator.dispose();
    this.audioInput.dispose();
    this.sourceProperty.dispose();
    this.timePerDivisionProperty.dispose();
    this.voltsPerDivisionProperty.dispose();
  }
}

OscilloscopeNamespace.register("OscilloscopeModel", OscilloscopeModel);
