/**
 * OscilloscopeDisplayNode.ts
 *
 * The oscilloscope "CRT": a dark screen face with a graticule grid and a
 * glowing waveform trace. The view calls {@link update} each frame with the
 * latest column voltages and the current vertical sensitivity (volts/div); the
 * node redraws the trace to fit.
 *
 * All geometry is derived from the division grid in SimConstants, so the
 * display scales cleanly if those constants change.
 */

import { Shape } from "scenerystack/kite";
import { Node, type NodeOptions, Path, Rectangle } from "scenerystack/scenery";
import OscilloscopeColors from "../../OscilloscopeColors.js";
import {
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  DIVISION_SIZE,
  HORIZONTAL_DIVISIONS,
  PANEL_CORNER_RADIUS,
  VERTICAL_DIVISIONS,
} from "../../SimConstants.js";

/** Subdivisions per division marked as small ticks along the center axes. */
const SUBDIVISIONS = 5;

/** Length of a center-axis subdivision tick, in pixels. */
const TICK_LENGTH = 5;

export class OscilloscopeDisplayNode extends Node {
  public readonly displayWidth = DISPLAY_WIDTH;
  public readonly displayHeight = DISPLAY_HEIGHT;

  private readonly tracefield: Node;
  private readonly tracePath: Path;

  public constructor(providedOptions?: NodeOptions) {
    super();

    // ── CRT face ────────────────────────────────────────────────────────────
    const face = new Rectangle(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT, {
      fill: OscilloscopeColors.displayBackgroundColorProperty,
      stroke: OscilloscopeColors.displayBorderColorProperty,
      lineWidth: 3,
      cornerRadius: PANEL_CORNER_RADIUS,
    });
    this.addChild(face);

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
    this.addChild(
      new Path(gridShape, {
        stroke: OscilloscopeColors.graticuleColorProperty,
        lineWidth: 1,
      }),
    );

    // ── Center cross-hair axes with subdivision ticks ─────────────────────────
    const centerX = DISPLAY_WIDTH / 2;
    const centerY = DISPLAY_HEIGHT / 2;
    const tickSpacing = DIVISION_SIZE / SUBDIVISIONS;
    const axisShape = new Shape();
    axisShape.moveTo(0, centerY).lineTo(DISPLAY_WIDTH, centerY);
    axisShape.moveTo(centerX, 0).lineTo(centerX, DISPLAY_HEIGHT);
    // Ticks along the horizontal center axis.
    for (let x = tickSpacing; x < DISPLAY_WIDTH; x += tickSpacing) {
      axisShape.moveTo(x, centerY - TICK_LENGTH).lineTo(x, centerY + TICK_LENGTH);
    }
    // Ticks along the vertical center axis.
    for (let y = tickSpacing; y < DISPLAY_HEIGHT; y += tickSpacing) {
      axisShape.moveTo(centerX - TICK_LENGTH, y).lineTo(centerX + TICK_LENGTH, y);
    }
    this.addChild(
      new Path(axisShape, {
        stroke: OscilloscopeColors.graticuleAxisColorProperty,
        lineWidth: 1,
      }),
    );

    // ── Waveform trace (clipped to the CRT face) ──────────────────────────────
    this.tracePath = new Path(null, {
      stroke: OscilloscopeColors.traceColorProperty,
      lineWidth: 2,
      lineJoin: "round",
      lineCap: "round",
    });
    this.tracefield = new Node({
      children: [this.tracePath],
      clipArea: Shape.rect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT),
    });
    this.addChild(this.tracefield);

    this.mutate(providedOptions);
  }

  /**
   * Redraws the trace from `voltages` (one per horizontal column) using the
   * given vertical sensitivity.
   *
   * @param voltages - displayed voltage at each column, left to right
   * @param voltsPerDivision - volts represented by one vertical division
   */
  public update(voltages: Float32Array, voltsPerDivision: number): void {
    const n = voltages.length;
    if (n < 2 || voltsPerDivision <= 0) {
      this.tracePath.shape = null;
      return;
    }

    const centerY = DISPLAY_HEIGHT / 2;
    const pixelsPerVolt = DIVISION_SIZE / voltsPerDivision;
    const shape = new Shape();

    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * DISPLAY_WIDTH;
      const raw = centerY - (voltages[i] ?? 0) * pixelsPerVolt;
      // Clamp a little beyond the edges so off-screen excursions still clip cleanly.
      const y = Math.max(-2, Math.min(DISPLAY_HEIGHT + 2, raw));
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    this.tracePath.shape = shape;
  }
}
