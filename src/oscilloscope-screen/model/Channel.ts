/**
 * Channel.ts
 *
 * A single vertical input channel of the oscilloscope (CH1 or CH2), owning the
 * per-channel front-panel controls that a real bench scope gives each channel:
 *
 *   - on / off (whether the trace is displayed)
 *   - volts/div (vertical sensitivity, a 1-2-5 stepped rotary switch)
 *   - probe attenuation (×1 / ×10) — scales the effective volts/div readout
 *   - vertical position (offset, in divisions)
 *   - AC / DC / GND coupling
 *   - invert
 *   - BNC input patch (none / FG A / FG B / microphone)
 *
 * The channel is a pure data holder — the model samples a source into it and the
 * view reads these Properties to scale and place the trace.
 */

import { BooleanProperty, NumberProperty, StringUnionProperty } from "scenerystack/axon";
import {
  type ProbeFactor,
  SCOPE_POSITION_RANGE,
  SCOPE_PROBE_FACTORS,
  SCOPE_VOLTS_PER_DIV_RANGE,
} from "../../OscilloscopeConstants.js";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";
import { CHANNEL_INPUTS, type ChannelInput } from "./ChannelInput.js";
import { COUPLINGS, type Coupling } from "./Coupling.js";

export type ChannelOptions = {
  /** 1 for CH1, 2 for CH2 — used for labels. */
  readonly index: 1 | 2;
  /** Whether this channel is displayed on power-up. */
  readonly initiallyEnabled: boolean;
  /** Initial vertical sensitivity, in volts per division. */
  readonly initialVoltsPerDivision: number;
  /** What is patched into this channel's BNC on power-up. */
  readonly initialInput?: ChannelInput;
};

export class Channel {
  /** 1 for CH1, 2 for CH2. */
  public readonly index: 1 | 2;

  /** Whether this channel's trace is drawn. */
  public readonly enabledProperty: BooleanProperty;

  /** Vertical sensitivity, in volts per division (knob position, before probe). */
  public readonly voltsPerDivisionProperty: NumberProperty;

  /**
   * Probe factor (×1 or ×10). Multiplies the knob's volts/div for display and
   * measurement scaling — the tip-voltage buffers themselves are unchanged.
   */
  public readonly probeProperty = new NumberProperty(1, {
    validValues: [...SCOPE_PROBE_FACTORS],
  });

  /** Vertical position (offset) of the trace, in divisions above center. */
  public readonly positionProperty = new NumberProperty(0, { range: SCOPE_POSITION_RANGE });

  /** Input coupling (AC / DC / GND). */
  public readonly couplingProperty = new StringUnionProperty<Coupling>("DC", {
    validValues: [...COUPLINGS],
  });

  /** Whether the trace is inverted (multiplied by -1). */
  public readonly invertedProperty = new BooleanProperty(false);

  /** What is patched into this channel's BNC jack. */
  public readonly inputProperty: StringUnionProperty<ChannelInput>;

  public constructor(options: ChannelOptions) {
    this.index = options.index;
    this.enabledProperty = new BooleanProperty(options.initiallyEnabled);
    this.voltsPerDivisionProperty = new NumberProperty(options.initialVoltsPerDivision, {
      range: SCOPE_VOLTS_PER_DIV_RANGE,
      units: "V",
    });
    this.inputProperty = new StringUnionProperty<ChannelInput>(options.initialInput ?? "none", {
      validValues: [...CHANNEL_INPUTS],
    });
  }

  /** The vertical range, in volts, that maps onto one division for this channel. */
  public get voltsPerDivision(): number {
    return this.voltsPerDivisionProperty.value;
  }

  /** Probe attenuation factor currently selected on this channel. */
  public get probeFactor(): ProbeFactor {
    return this.probeProperty.value as ProbeFactor;
  }

  /**
   * Volts represented by one division after probe compensation — what the
   * on-screen scale and ΔV cursors use.
   */
  public get effectiveVoltsPerDivision(): number {
    return this.voltsPerDivisionProperty.value * this.probeProperty.value;
  }

  public reset(): void {
    this.enabledProperty.reset();
    this.voltsPerDivisionProperty.reset();
    this.probeProperty.reset();
    this.positionProperty.reset();
    this.couplingProperty.reset();
    this.invertedProperty.reset();
    this.inputProperty.reset();
  }

  public dispose(): void {
    this.enabledProperty.dispose();
    this.voltsPerDivisionProperty.dispose();
    this.probeProperty.dispose();
    this.positionProperty.dispose();
    this.couplingProperty.dispose();
    this.invertedProperty.dispose();
    this.inputProperty.dispose();
  }
}

OscilloscopeNamespace.register("Channel", Channel);
