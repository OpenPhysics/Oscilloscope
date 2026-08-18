/**
 * AudioInput.ts
 *
 * Live microphone signal source, backed by the Web Audio API. It requests
 * microphone access on demand, feeds the stream into an AnalyserNode, and
 * exposes the raw time-domain samples so the oscilloscope can display them.
 *
 * The class degrades gracefully: if the browser lacks the Web Audio / media
 * APIs, or the user denies permission, `statusProperty` reflects that and
 * `fillTrace()` simply produces a flat (zero) line. Nothing here throws.
 */

import { StringUnionProperty } from "scenerystack/axon";
import { AUDIO_FFT_SIZE } from "../../OscilloscopeConstants.js";
import OscilloscopeNamespace from "../../OscilloscopeNamespace.js";

/** Lifecycle states of the microphone connection, in the order a user meets them. */
export const AUDIO_STATUSES = ["idle", "requesting", "active", "denied", "unsupported"] as const;

/** A single microphone lifecycle state. */
export type AudioStatus = (typeof AUDIO_STATUSES)[number];

/** Minimal shape of the AudioContext constructor (standard or webkit-prefixed). */
type AudioContextConstructor = new () => AudioContext;

export class AudioInput {
  /** Current state of the microphone connection. */
  public readonly statusProperty = new StringUnionProperty<AudioStatus>("idle", {
    validValues: [...AUDIO_STATUSES],
  });

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  /** Reusable scratch buffer for the analyser's time-domain data. */
  private readonly timeData: Float32Array<ArrayBuffer>;

  /** Sample rate of the active audio context (updated when the mic starts). */
  private sampleRate = 44100;

  public constructor(fftSize: number = AUDIO_FFT_SIZE) {
    this.timeData = new Float32Array(fftSize);
  }

  /** Whether a live microphone signal is currently available. */
  public get isActive(): boolean {
    return this.statusProperty.value === "active" && this.analyser !== null;
  }

  /**
   * The longest sweep (seconds) this input can actually fill. An `AnalyserNode`
   * only ever hands back its most recent `fftSize` samples, so anything longer
   * would have to be stretched across the display — the oscilloscope clamps its
   * timebase to this instead. Reported at the live context's sample rate, so it
   * tracks the hardware once the microphone starts.
   */
  public get maxWindowSeconds(): number {
    return this.timeData.length / this.sampleRate;
  }

  private static getAudioContextConstructor(): AudioContextConstructor | undefined {
    if (typeof window === "undefined") {
      return undefined;
    }
    const w = window as unknown as Record<string, AudioContextConstructor | undefined>;
    return w["AudioContext"] ?? w["webkitAudioContext"];
  }

  /**
   * Whether this document's Permissions-Policy allows `getUserMedia({ audio })`.
   * Calling getUserMedia when the policy forbids microphone logs a console error
   * (`Permissions policy violation`) even if the promise is caught.
   */
  private static isMicrophoneAllowedByPolicy(): boolean {
    if (typeof document === "undefined") {
      return false;
    }
    const policyHolder = document as Document & {
      permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
      featurePolicy?: { allowsFeature: (feature: string) => boolean };
    };
    const policy = policyHolder.permissionsPolicy ?? policyHolder.featurePolicy;
    if (policy && typeof policy.allowsFeature === "function") {
      return policy.allowsFeature("microphone");
    }
    return true;
  }

  /**
   * Requests microphone access and begins analysing the stream. Safe to call
   * repeatedly; a no-op while already requesting or active.
   */
  public async start(): Promise<void> {
    if (this.statusProperty.value === "requesting" || this.isActive) {
      return;
    }

    const AudioContextCtor = AudioInput.getAudioContextConstructor();
    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!(AudioContextCtor && mediaDevices?.getUserMedia && AudioInput.isMicrophoneAllowedByPolicy())) {
      this.statusProperty.value = "unsupported";
      return;
    }

    this.statusProperty.value = "requesting";
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = this.timeData.length;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      this.mediaStream = stream;
      this.audioContext = context;
      this.analyser = analyser;
      this.sourceNode = source;
      this.sampleRate = context.sampleRate;

      if (context.state === "suspended") {
        await context.resume();
      }
      this.statusProperty.value = "active";
    } catch {
      this.teardown();
      this.statusProperty.value = "denied";
    }
  }

  /** Releases the microphone and audio graph, returning to the idle state. */
  public stop(): void {
    this.teardown();
    if (this.statusProperty.value === "active" || this.statusProperty.value === "requesting") {
      this.statusProperty.value = "idle";
    }
  }

  private teardown(): void {
    this.sourceNode?.disconnect();
    this.analyser?.disconnect();
    for (const track of this.mediaStream?.getTracks() ?? []) {
      track.stop();
    }
    this.audioContext?.close().catch(() => {
      /* closing an already-closed context is harmless */
    });
    this.sourceNode = null;
    this.analyser = null;
    this.mediaStream = null;
    this.audioContext = null;
  }

  /**
   * Fills `out` with the most recent microphone samples spanning `windowSeconds`
   * of real time, resampled to `out.length` points. A level/slope trigger search
   * stabilises the displayed waveform. Values are in [-1, 1] and treated as volts
   * by the oscilloscope. When no live signal is available, `out` is zeroed.
   *
   * `windowSeconds` beyond {@link maxWindowSeconds} cannot be honoured — the
   * samples simply do not exist — so the capture is clamped. Callers are expected
   * to hold their timebase inside that limit (the model does) rather than let a
   * graticule claim time the capture does not hold.
   *
   * @returns true when a trigger event was found in the captured samples. The
   *   model uses this to decide whether a `normal` / `single` sweep may update;
   *   a flat line (no microphone) never counts as triggered.
   */
  public fillTrace(
    out: Float32Array,
    windowSeconds: number,
    level = 0,
    slope: "rising" | "falling" = "rising",
  ): boolean {
    const analyser = this.analyser;
    if (!analyser) {
      out.fill(0);
      return false;
    }

    analyser.getFloatTimeDomainData(this.timeData);
    const total = this.timeData.length;
    const windowSamples = Math.min(total, Math.max(2, Math.round(windowSeconds * this.sampleRate)));

    // The crossing is centred on the display, so a usable trigger point needs half
    // a window of samples behind it and half ahead. Searching that range — rather
    // than a fixed slice of the front of the buffer — is what keeps the search span
    // open as the window grows: the old bound went to zero once the window reached
    // half the buffer, which silently refused every trigger (and so froze NORMAL and
    // SINGLE) on exactly the slow sweeps the analyser can still fill.
    const half = Math.floor(windowSamples / 2);
    const searchFrom = Math.max(1, half);
    const searchTo = Math.min(total - 1, total - windowSamples + half);

    let start = half;
    let triggered = false;
    for (let i = searchFrom; i <= searchTo; i++) {
      const prev = this.timeData[i - 1] ?? 0;
      const curr = this.timeData[i] ?? 0;
      const crossed = slope === "rising" ? prev < level && curr >= level : prev > level && curr <= level;
      if (crossed) {
        start = i;
        triggered = true;
        break;
      }
    }

    // Read the window starting half a window before the crossing, as on a real
    // scope. Indices are clamped, so a window longer than the acquisition memory
    // simply repeats the edge samples rather than reading past the buffer.
    const lastOut = out.length - 1;
    const lastWin = windowSamples - 1;
    for (let j = 0; j < out.length; j++) {
      const offset = lastOut === 0 ? 0 : Math.round((j / lastOut) * lastWin);
      const idx = start - half + offset;
      out[j] = this.timeData[Math.max(0, Math.min(total - 1, idx))] ?? 0;
    }
    return triggered;
  }

  public dispose(): void {
    this.teardown();
    this.statusProperty.dispose();
  }
}

OscilloscopeNamespace.register("AudioInput", AudioInput);
