/**
 * OscilloscopeDisplayNode.ts
 *
 * The oscilloscope "CRT": a dark screen face with a graticule grid and up to
 * three glowing waveform traces (CH1, CH2, and an optional CH1±CH2 math trace),
 * plus a draggable trigger-level marker. It supports the standard Y-T sweep as
 * well as an X-Y (Lissajous) mode, and an optional persistence / afterglow.
 *
 * The view calls {@link update} each frame; the node reads the latest per-channel
 * buffers and control state directly from the model and redraws.
 */

import { Shape } from "scenerystack/kite";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { DragListener, Node, type NodeOptions, Path, Rectangle } from "scenerystack/scenery";
import { StringManager } from "../../i18n/StringManager.js";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import {
  CURSOR_TIME_RANGE,
  CURSOR_VOLT_RANGE,
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  DIVISION_SIZE,
  HORIZONTAL_DIVISIONS,
  PANEL_CORNER_RADIUS,
  PERSISTENCE_SWEEPS,
  SCOPE_TRIGGER_LEVEL_RANGE,
  TRACE_SAMPLE_COUNT,
  VERTICAL_DIVISIONS,
} from "../../OscilloscopeConstants.js";
import type { Channel } from "../model/Channel.js";
import type { OscilloscopeModel } from "../model/OscilloscopeModel.js";
import {
  computeMagnitudeSpectrum,
  createSpectrumScratch,
  largestPowerOfTwoAtMost,
  type SpectrumScratch,
} from "../model/Spectrum.js";
import { MeasurementCursorNode } from "./MeasurementCursorNode.js";

const SUBDIVISIONS = 5;
const TICK_LENGTH = 5;
const CENTER_X = DISPLAY_WIDTH / 2;
const CENTER_Y = DISPLAY_HEIGHT / 2;

// ── Trace / marker rendering ──────────────────────────────────────────────────
/** Stroke width of the CRT-face border, in screen pixels. */
const FACE_LINE_WIDTH = 3;
/** Stroke width of the glowing waveform traces, in screen pixels. */
const TRACE_LINE_WIDTH = 2;
/** Extra stroke width added at full defocus (focus = 0), in screen pixels. */
const DEFOCUS_EXTRA_WIDTH = 3.5;
/** Stroke width of the graticule grid, axes, and cursor/trigger lines, in screen pixels. */
const THIN_LINE_WIDTH = 1;
/** Opacity of the freshest persistence "afterglow" ghost; older ones fade from here. */
const PERSISTENCE_GHOST_OPACITY = 0.34;
/** How far (px) a trace may be drawn past the display edge before it is clipped. */
const TRACE_CLIP_MARGIN = 2;
/** Dash pattern (px on, px off) for the dashed trigger-level line. */
const TRIGGER_LINE_DASH = [6, 4];
/** Half-width / half-height (px) of the trigger-level drag tab drawn at the right edge. */
const TRIGGER_TAB_DEPTH = 12;
const TRIGGER_TAB_HALF_HEIGHT = 6;
/** Bottom inset (px) of the FFT baseline and the headroom left above full-scale bins. */
const FFT_BASELINE_INSET = 2;
const FFT_TOP_INSET = 8;

export class OscilloscopeDisplayNode extends Node {
  /** The four measurement cursors, in reading order, for `pdomOrder`. */
  public readonly cursorsInOrder: MeasurementCursorNode[];

  private readonly model: OscilloscopeModel;

  private readonly ch1Path: Path;
  private readonly ch2Path: Path;
  private readonly mathPath: Path;
  private readonly xyPath: Path;
  private readonly fftPath: Path;
  private readonly ghostPaths: Path[];
  private readonly triggerMarker: Node;
  private readonly triggerLine: Path;
  private readonly cursorLayer: Node;
  /** Brightened band marking the delayed-sweep window on the main trace. */
  private readonly delayZone: Rectangle;

  /** The clipped layer holding every waveform trace; its opacity is the CRT intensity. */
  private readonly traceLayer: Node;
  /** Every waveform Path, so focus (line width) can be applied uniformly. */
  private readonly tracePaths: Path[];
  /** Whether BEAM FIND is engaged this frame; hard-clamps traces onto the graticule. */
  private beamFinderActive = false;

  /**
   * Recent CH1 sweeps, newest first, drawn behind the live trace at decreasing
   * opacity. A single ghost would be invisible: the trace is trigger-aligned, so
   * last frame's sweep lands exactly under this one. A chain deep enough to span
   * a fraction of a second is what makes the afterglow show the trace's recent
   * history while a knob is being turned.
   */
  private readonly ghostShapes: (Shape | null)[] = new Array<Shape | null>(PERSISTENCE_SWEEPS).fill(null);

  // Reused FFT working buffers, so the spectrum mode does not allocate three typed
  // arrays on every animation frame.
  private readonly spectrumScratch: SpectrumScratch = createSpectrumScratch(
    largestPowerOfTwoAtMost(TRACE_SAMPLE_COUNT),
  );

  // Teardown for the model-Property links and drag listeners wired up below, so a
  // disposed display node does not keep the (longer-lived) model alive.
  private readonly disposeActions: (() => void)[] = [];

  // Children this node created and therefore owns. Scenery does not dispose a
  // node's children for it, and each of these carries listeners on sim-lifetime
  // ProfileColorProperties that would otherwise keep the subtree reachable.
  private readonly ownedChildren: Node[] = [];

  public constructor(model: OscilloscopeModel, providedOptions?: NodeOptions) {
    const options = optionize<NodeOptions, EmptySelfOptions, NodeOptions>()({}, providedOptions);
    super(options);
    this.model = model;

    // ── CRT face ──────────────────────────────────────────────────────────────
    const face = new Rectangle(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT, {
      fill: OscilloscopeColors.displayBackgroundColorProperty,
      stroke: OscilloscopeColors.displayBorderColorProperty,
      lineWidth: FACE_LINE_WIDTH,
      cornerRadius: PANEL_CORNER_RADIUS,
    });
    this.addChild(face);
    this.ownedChildren.push(face);

    // ── Graticule (minor grid lines) ──────────────────────────────────────────
    const gridShape = new Shape();
    for (let c = 0; c <= HORIZONTAL_DIVISIONS; c++) {
      const x = c * DIVISION_SIZE;
      gridShape.moveTo(x, 0).lineTo(x, DISPLAY_HEIGHT);
    }
    for (let r = 0; r <= VERTICAL_DIVISIONS; r++) {
      const y = r * DIVISION_SIZE;
      gridShape.moveTo(0, y).lineTo(DISPLAY_WIDTH, y);
    }
    const gridPath = new Path(gridShape, {
      stroke: OscilloscopeColors.graticuleColorProperty,
      lineWidth: THIN_LINE_WIDTH,
    });
    this.addChild(gridPath);
    this.ownedChildren.push(gridPath);

    // ── Center cross-hair axes with subdivision ticks ─────────────────────────
    const tickSpacing = DIVISION_SIZE / SUBDIVISIONS;
    const axisShape = new Shape();
    axisShape.moveTo(0, CENTER_Y).lineTo(DISPLAY_WIDTH, CENTER_Y);
    axisShape.moveTo(CENTER_X, 0).lineTo(CENTER_X, DISPLAY_HEIGHT);
    for (let x = tickSpacing; x < DISPLAY_WIDTH; x += tickSpacing) {
      axisShape.moveTo(x, CENTER_Y - TICK_LENGTH).lineTo(x, CENTER_Y + TICK_LENGTH);
    }
    for (let y = tickSpacing; y < DISPLAY_HEIGHT; y += tickSpacing) {
      axisShape.moveTo(CENTER_X - TICK_LENGTH, y).lineTo(CENTER_X + TICK_LENGTH, y);
    }
    const axisPath = new Path(axisShape, {
      stroke: OscilloscopeColors.graticuleAxisColorProperty,
      lineWidth: THIN_LINE_WIDTH,
    });
    this.addChild(axisPath);
    this.ownedChildren.push(axisPath);

    // ── Delayed-sweep intensified band (behind the traces) ────────────────────
    // In "intensified" delayed-sweep mode this marks, on the main trace, the slice
    // the delayed timebase magnifies.
    this.delayZone = new Rectangle(0, 0, 0, DISPLAY_HEIGHT, {
      fill: OscilloscopeColors.delayZoneColorProperty,
      visible: false,
    });
    this.addChild(this.delayZone);
    this.ownedChildren.push(this.delayZone);

    // ── Trace layer (clipped to the CRT face) ─────────────────────────────────
    // Index 0 holds the freshest ghost and fades linearly with age.
    this.ghostPaths = Array.from(
      { length: PERSISTENCE_SWEEPS },
      (_, age) =>
        new Path(null, {
          stroke: OscilloscopeColors.channel1ColorProperty,
          lineWidth: TRACE_LINE_WIDTH,
          opacity: PERSISTENCE_GHOST_OPACITY * (1 - age / PERSISTENCE_SWEEPS),
          lineJoin: "round",
        }),
    );
    this.ch1Path = new Path(null, {
      stroke: OscilloscopeColors.channel1ColorProperty,
      lineWidth: TRACE_LINE_WIDTH,
      lineJoin: "round",
      lineCap: "round",
    });
    this.ch2Path = new Path(null, {
      stroke: OscilloscopeColors.channel2ColorProperty,
      lineWidth: TRACE_LINE_WIDTH,
      lineJoin: "round",
      lineCap: "round",
    });
    this.mathPath = new Path(null, {
      stroke: OscilloscopeColors.mathTraceColorProperty,
      lineWidth: TRACE_LINE_WIDTH,
      lineJoin: "round",
      lineCap: "round",
    });
    this.xyPath = new Path(null, {
      stroke: OscilloscopeColors.channel2ColorProperty,
      lineWidth: TRACE_LINE_WIDTH,
      lineJoin: "round",
      lineCap: "round",
    });
    this.fftPath = new Path(null, {
      stroke: OscilloscopeColors.traceColorProperty,
      lineWidth: TRACE_LINE_WIDTH,
      lineJoin: "round",
      lineCap: "round",
    });
    const traceLayer = new Node({
      children: [
        // Oldest ghost furthest back, so the freshest sweep reads brightest.
        ...[...this.ghostPaths].reverse(),
        this.mathPath,
        this.ch2Path,
        this.ch1Path,
        this.xyPath,
        this.fftPath,
      ],
      clipArea: Shape.rect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT),
    });
    this.traceLayer = traceLayer;
    this.tracePaths = [...this.ghostPaths, this.mathPath, this.ch2Path, this.ch1Path, this.xyPath, this.fftPath];
    this.addChild(traceLayer);
    this.ownedChildren.push(
      traceLayer,
      ...this.ghostPaths,
      this.mathPath,
      this.ch2Path,
      this.ch1Path,
      this.xyPath,
      this.fftPath,
    );

    // ── Draggable trigger-level marker ────────────────────────────────────────
    this.triggerLine = new Path(Shape.lineSegment(0, 0, DISPLAY_WIDTH, 0), {
      stroke: OscilloscopeColors.triggerColorProperty,
      lineWidth: THIN_LINE_WIDTH,
      lineDash: TRIGGER_LINE_DASH,
    });
    const triggerTab = new Path(
      new Shape()
        .moveTo(DISPLAY_WIDTH - TRIGGER_TAB_DEPTH, -TRIGGER_TAB_HALF_HEIGHT)
        .lineTo(DISPLAY_WIDTH, 0)
        .lineTo(DISPLAY_WIDTH - TRIGGER_TAB_DEPTH, TRIGGER_TAB_HALF_HEIGHT)
        .close(),
      {
        fill: OscilloscopeColors.triggerColorProperty,
      },
    );
    this.triggerMarker = new Node({ children: [this.triggerLine, triggerTab], cursor: "ns-resize" });
    const triggerDragListener = new DragListener({
      drag: (event) => {
        const localY = this.globalToLocalPoint(event.pointer.point).y;
        this.setTriggerLevelFromY(localY);
      },
    });
    this.triggerMarker.addInputListener(triggerDragListener);
    this.disposeActions.push(() => {
      this.triggerMarker.removeInputListener(triggerDragListener);
      triggerDragListener.dispose();
    });
    this.addChild(this.triggerMarker);
    this.ownedChildren.push(this.triggerMarker, this.triggerLine, triggerTab);

    // ── Draggable measurement cursors (two time, two voltage) ─────────────────
    // Each is an AccessibleSlider, so the Δt / 1÷Δt / ΔV measurement is reachable
    // by keyboard and not only by pointer dragging.
    const cursorNames = StringManager.getInstance().getA11yStrings().controls;
    this.cursorsInOrder = [
      new MeasurementCursorNode(model.cursorTime1Property, CURSOR_TIME_RANGE, "time", {
        accessibleName: cursorNames.cursorTime1StringProperty,
        pointerToValue: (point) => (this.globalToLocalPoint(point).x / DISPLAY_WIDTH) * HORIZONTAL_DIVISIONS,
      }),
      new MeasurementCursorNode(model.cursorTime2Property, CURSOR_TIME_RANGE, "time", {
        accessibleName: cursorNames.cursorTime2StringProperty,
        pointerToValue: (point) => (this.globalToLocalPoint(point).x / DISPLAY_WIDTH) * HORIZONTAL_DIVISIONS,
      }),
      new MeasurementCursorNode(model.cursorVolt1Property, CURSOR_VOLT_RANGE, "voltage", {
        accessibleName: cursorNames.cursorVolt1StringProperty,
        pointerToValue: (point) => (CENTER_Y - this.globalToLocalPoint(point).y) / DIVISION_SIZE,
      }),
      new MeasurementCursorNode(model.cursorVolt2Property, CURSOR_VOLT_RANGE, "voltage", {
        accessibleName: cursorNames.cursorVolt2StringProperty,
        pointerToValue: (point) => (CENTER_Y - this.globalToLocalPoint(point).y) / DIVISION_SIZE,
      }),
    ];
    this.cursorLayer = new Node({ children: this.cursorsInOrder });
    this.addChild(this.cursorLayer);
    this.ownedChildren.push(this.cursorLayer, ...this.cursorsInOrder);

    this.mutate(providedOptions);
  }

  /** Pixels representing one volt on the given channel (after probe scaling). */
  private pixelsPerVolt(channel: Channel): number {
    return DIVISION_SIZE / channel.effectiveVoltsPerDivision;
  }

  /** Screen y (display-local) of the given channel's zero-volt baseline. */
  private baselineY(channel: Channel): number {
    return CENTER_Y - channel.positionProperty.value * DIVISION_SIZE;
  }

  /** Maps a dragged display-local y back to a trigger level on the trigger source channel. */
  private setTriggerLevelFromY(localY: number): void {
    const channel = this.model.trigger.sourceProperty.value === "ch2" ? this.model.ch2 : this.model.ch1;
    const volts = (this.baselineY(channel) - localY) / this.pixelsPerVolt(channel);
    const clamped = Math.max(SCOPE_TRIGGER_LEVEL_RANGE.min, Math.min(SCOPE_TRIGGER_LEVEL_RANGE.max, volts));
    this.model.trigger.levelProperty.value = clamped;
  }

  /** Builds a Y-T trace shape for one channel from its volts-per-column buffer. */
  private buildChannelShape(voltages: Float32Array, channel: Channel): Shape {
    const n = voltages.length;
    const pxPerVolt = this.pixelsPerVolt(channel);
    const sign = channel.invertedProperty.value ? -1 : 1;
    const base = this.baselineY(channel);
    const shape = new Shape();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * DISPLAY_WIDTH;
      const raw = base - sign * (voltages[i] ?? 0) * pxPerVolt;
      const y = this.clampY(raw);
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    return shape;
  }

  /**
   * Clamps a display-local y to the drawable area. BEAM FIND clamps hard onto the
   * graticule (an off-screen trace is pulled to the nearest edge); otherwise the
   * usual small overscan margin is allowed before the clip removes it.
   */
  private clampY(raw: number): number {
    const m = this.beamFinderActive ? 0 : TRACE_CLIP_MARGIN;
    return Math.max(-m, Math.min(DISPLAY_HEIGHT + m, raw));
  }

  /** Clamps a display-local x to the drawable area (used by X-Y mode). */
  private clampX(raw: number): number {
    const m = this.beamFinderActive ? 0 : TRACE_CLIP_MARGIN;
    return Math.max(-m, Math.min(DISPLAY_WIDTH + m, raw));
  }

  /** Applies the CRT beam controls: intensity (layer opacity) and focus (line width). */
  private applyBeamControls(): void {
    const model = this.model;
    this.beamFinderActive = model.beamFinderProperty.value;
    // BEAM FIND overrides intensity to full so a dim or off-screen trace is found.
    this.traceLayer.opacity = this.beamFinderActive ? 1 : model.intensityProperty.value;
    // Focus 1 is a sharp hairline; lower focus thickens the stroke like a defocused beam.
    const width = TRACE_LINE_WIDTH + (1 - model.focusProperty.value) * DEFOCUS_EXTRA_WIDTH;
    for (const path of this.tracePaths) {
      path.lineWidth = width;
    }
  }

  /** Redraws every trace and the trigger marker from current model state. */
  public update(): void {
    this.applyBeamControls();
    const mode = this.model.displayModeProperty.value;
    if (mode === "xy") {
      this.updateXY();
    } else if (mode === "fft") {
      this.updateFFT();
    } else {
      this.updateYT();
    }
  }

  /** Clears every Y-T trace, for the modes that draw something else entirely. */
  private clearYTTraces(): void {
    this.ch1Path.shape = null;
    this.ch2Path.shape = null;
    this.mathPath.shape = null;
    this.clearPersistence();
  }

  private updateXY(): void {
    this.clearYTTraces();
    this.fftPath.shape = null;
    this.xyPath.shape = this.buildXYShape();
    this.triggerMarker.visible = false;
    this.delayZone.visible = false;
    this.cursorLayer.visible = false;
  }

  private updateFFT(): void {
    this.clearYTTraces();
    this.xyPath.shape = null;
    this.fftPath.shape = this.buildFFTShape();
    this.triggerMarker.visible = false;
    this.delayZone.visible = false;

    const cursorsOn = this.model.cursorsEnabledProperty.value;
    this.cursorLayer.visible = cursorsOn;
    // Frequency cursors reuse the vertical (time) cursor lines; hide the voltage pair.
    const [time1, time2, volt1, volt2] = this.cursorsInOrder;
    if (time1 && time2 && volt1 && volt2) {
      time1.visible = cursorsOn;
      time2.visible = cursorsOn;
      volt1.visible = false;
      volt2.visible = false;
    }
  }

  private updateYT(): void {
    const model = this.model;
    this.xyPath.shape = null;
    this.fftPath.shape = null;
    // The trigger marker sits on a channel's displayed trace; LINE and EXT trigger
    // on their own reference signals, which are not drawn, so there is nothing to
    // mark. The TriggerControlPanel's level knob remains the keyboard equivalent.
    const source = model.trigger.sourceProperty.value;
    this.triggerMarker.visible = source === "ch1" || source === "ch2";
    this.cursorLayer.visible = model.cursorsEnabledProperty.value;
    for (const cursor of this.cursorsInOrder) {
      cursor.visible = true;
    }

    this.ch1Path.shape = model.ch1.enabledProperty.value ? this.buildChannelShape(model.ch1Trace, model.ch1) : null;
    this.ch2Path.shape = model.ch2.enabledProperty.value ? this.buildChannelShape(model.ch2Trace, model.ch2) : null;
    this.mathPath.shape = model.mathModeProperty.value !== "off" ? this.buildMathShape() : null;

    this.updatePersistence(this.ch1Path.shape);
    this.updateTriggerMarker();
    this.updateDelayZone();
  }

  /**
   * Positions the brightened delayed-sweep band. It spans, in main-sweep divisions,
   * from the delay marker to the end of the delayed window, and shows only in the
   * "intensified" delayed-sweep mode (in "delayed" mode the whole face *is* the zoom).
   */
  private updateDelayZone(): void {
    const model = this.model;
    if (model.delayedSweepModeProperty.value !== "intensified") {
      this.delayZone.visible = false;
      return;
    }
    const mainPerDiv = model.effectiveTimePerDivision;
    const widthDiv = mainPerDiv > 0 ? model.delayedWindow / mainPerDiv : 0;
    const startX = model.delayProperty.value * DIVISION_SIZE;
    const endX = Math.min(DISPLAY_WIDTH, startX + widthDiv * DIVISION_SIZE);
    const x = Math.max(0, Math.min(DISPLAY_WIDTH, startX));
    this.delayZone.setRect(x, 0, Math.max(0, endX - x), DISPLAY_HEIGHT);
    this.delayZone.visible = true;
  }

  /** Ages the afterglow chain by one sweep and repaints the ghosts. */
  private updatePersistence(liveShape: Shape | null): void {
    if (!this.model.persistenceProperty.value) {
      this.clearPersistence();
      return;
    }
    if (liveShape) {
      this.ghostShapes.pop();
      this.ghostShapes.unshift(liveShape);
    }
    for (let age = 0; age < this.ghostPaths.length; age++) {
      const path = this.ghostPaths[age];
      if (path) {
        // The freshest retained sweep lands exactly under the live trace, so the
        // visible afterglow starts one sweep further back.
        path.shape = this.ghostShapes[age + 1] ?? null;
      }
    }
  }

  /** The CH1±CH2 math trace, scaled with CH1's sensitivity about screen center. */
  private buildMathShape(): Shape {
    const model = this.model;
    const pxPerVolt = this.pixelsPerVolt(model.ch1);
    const n = model.mathTrace.length;
    const shape = new Shape();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * DISPLAY_WIDTH;
      const raw = CENTER_Y - (model.mathTrace[i] ?? 0) * pxPerVolt;
      const y = this.clampY(raw);
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    return shape;
  }

  /** Drops every retained sweep, so re-engaging persistence starts from a clean face. */
  private clearPersistence(): void {
    this.ghostShapes.fill(null);
    for (const path of this.ghostPaths) {
      path.shape = null;
    }
  }

  /** Positions the trigger marker at the current trigger level. */
  private updateTriggerMarker(): void {
    const channel = this.model.trigger.sourceProperty.value === "ch2" ? this.model.ch2 : this.model.ch1;
    const y = this.baselineY(channel) - this.model.trigger.levelProperty.value * this.pixelsPerVolt(channel);
    this.triggerMarker.y = Math.max(0, Math.min(DISPLAY_HEIGHT, y));
  }

  /** Builds the X-Y (Lissajous) shape: CH1 drives X, CH2 drives Y. */
  private buildXYShape(): Shape {
    const model = this.model;
    const x1 = model.ch1Trace;
    const y2 = model.ch2Trace;
    const n = Math.min(x1.length, y2.length);
    const pxX = this.pixelsPerVolt(model.ch1);
    const pxY = this.pixelsPerVolt(model.ch2);
    const s1 = model.ch1.invertedProperty.value ? -1 : 1;
    const s2 = model.ch2.invertedProperty.value ? -1 : 1;
    const shape = new Shape();
    for (let i = 0; i < n; i++) {
      const x = CENTER_X + s1 * (x1[i] ?? 0) * pxX;
      const y = CENTER_Y - s2 * (y2[i] ?? 0) * pxY;
      const cx = this.clampX(x);
      const cy = this.clampY(y);
      if (i === 0) {
        shape.moveTo(cx, cy);
      } else {
        shape.lineTo(cx, cy);
      }
    }
    return shape;
  }

  /** Builds the FFT spectrum shape (magnitude vs frequency) of the primary channel. */
  private buildFFTShape(): Shape {
    const magnitudes = computeMagnitudeSpectrum(this.model.primaryTrace, this.spectrumScratch);
    const bins = magnitudes.length;
    const shape = new Shape();
    if (bins < 2) {
      return shape;
    }
    const baseY = DISPLAY_HEIGHT - FFT_BASELINE_INSET;
    // Both insets come off the drawable height, so a full-scale bin lands exactly
    // FFT_TOP_INSET below the top edge.
    const usableHeight = DISPLAY_HEIGHT - FFT_TOP_INSET - FFT_BASELINE_INSET;
    for (let k = 0; k < bins; k++) {
      const x = (k / (bins - 1)) * DISPLAY_WIDTH;
      const y = baseY - (magnitudes[k] ?? 0) * usableHeight;
      if (k === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    return shape;
  }

  public override dispose(): void {
    for (const teardown of this.disposeActions) {
      teardown();
    }
    this.disposeActions.length = 0;

    // Scenery leaves children alone on dispose, but every one of these holds a
    // listener on a sim-lifetime color Property; disposing them releases those.
    for (const child of this.ownedChildren) {
      child.dispose();
    }
    this.ownedChildren.length = 0;

    super.dispose();
  }
}
