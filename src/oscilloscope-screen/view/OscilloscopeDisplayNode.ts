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
  SCOPE_TRIGGER_LEVEL_RANGE,
  TRACE_SAMPLE_COUNT,
  VERTICAL_DIVISIONS,
} from "../../SimConstants.js";
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
/** Stroke width of the graticule grid, axes, and cursor/trigger lines, in screen pixels. */
const THIN_LINE_WIDTH = 1;
/** Opacity of the persistence "afterglow" ghost of the previous CH1 sweep. */
const PERSISTENCE_GHOST_OPACITY = 0.28;
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
  private readonly ghostPath: Path;
  private readonly triggerMarker: Node;
  private readonly triggerLine: Path;
  private readonly cursorLayer: Node;

  private previousCh1Shape: Shape | null = null;

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
    super();
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

    // ── Trace layer (clipped to the CRT face) ─────────────────────────────────
    this.ghostPath = new Path(null, {
      stroke: OscilloscopeColors.channel1ColorProperty,
      lineWidth: TRACE_LINE_WIDTH,
      opacity: PERSISTENCE_GHOST_OPACITY,
      lineJoin: "round",
    });
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
      children: [this.ghostPath, this.mathPath, this.ch2Path, this.ch1Path, this.xyPath, this.fftPath],
      clipArea: Shape.rect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT),
    });
    this.addChild(traceLayer);
    this.ownedChildren.push(
      traceLayer,
      this.ghostPath,
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

  /** Pixels representing one volt on the given channel. */
  private pixelsPerVolt(channel: Channel): number {
    return DIVISION_SIZE / channel.voltsPerDivision;
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
      const y = Math.max(-TRACE_CLIP_MARGIN, Math.min(DISPLAY_HEIGHT + TRACE_CLIP_MARGIN, raw));
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    return shape;
  }

  /** Redraws every trace and the trigger marker from current model state. */
  public update(): void {
    const model = this.model;
    const mode = model.displayModeProperty.value;

    if (mode === "xy") {
      this.ch1Path.shape = null;
      this.ch2Path.shape = null;
      this.mathPath.shape = null;
      this.ghostPath.shape = null;
      this.fftPath.shape = null;
      this.xyPath.shape = this.buildXYShape();
      this.triggerMarker.visible = false;
      this.cursorLayer.visible = false;
      return;
    }

    if (mode === "fft") {
      this.ch1Path.shape = null;
      this.ch2Path.shape = null;
      this.mathPath.shape = null;
      this.ghostPath.shape = null;
      this.xyPath.shape = null;
      this.fftPath.shape = this.buildFFTShape();
      this.triggerMarker.visible = false;
      this.cursorLayer.visible = false;
      return;
    }

    this.xyPath.shape = null;
    this.fftPath.shape = null;
    this.triggerMarker.visible = true;
    this.cursorLayer.visible = model.cursorsEnabledProperty.value;

    // Persistence: keep the last CH1 sweep as a faded ghost.
    if (model.persistenceProperty.value) {
      this.ghostPath.shape = this.previousCh1Shape;
    } else {
      this.ghostPath.shape = null;
    }

    if (model.ch1.enabledProperty.value) {
      const shape = this.buildChannelShape(model.ch1Trace, model.ch1);
      this.ch1Path.shape = shape;
      this.previousCh1Shape = shape;
    } else {
      this.ch1Path.shape = null;
    }

    this.ch2Path.shape = model.ch2.enabledProperty.value ? this.buildChannelShape(model.ch2Trace, model.ch2) : null;

    // Math trace, scaled with CH1's sensitivity and drawn about screen center.
    if (model.mathModeProperty.value !== "off") {
      const pxPerVolt = this.pixelsPerVolt(model.ch1);
      const n = model.mathTrace.length;
      const shape = new Shape();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * DISPLAY_WIDTH;
        const raw = CENTER_Y - (model.mathTrace[i] ?? 0) * pxPerVolt;
        const y = Math.max(-TRACE_CLIP_MARGIN, Math.min(DISPLAY_HEIGHT + TRACE_CLIP_MARGIN, raw));
        if (i === 0) {
          shape.moveTo(x, y);
        } else {
          shape.lineTo(x, y);
        }
      }
      this.mathPath.shape = shape;
    } else {
      this.mathPath.shape = null;
    }

    this.updateTriggerMarker();
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
      const cx = Math.max(-TRACE_CLIP_MARGIN, Math.min(DISPLAY_WIDTH + TRACE_CLIP_MARGIN, x));
      const cy = Math.max(-TRACE_CLIP_MARGIN, Math.min(DISPLAY_HEIGHT + TRACE_CLIP_MARGIN, y));
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
