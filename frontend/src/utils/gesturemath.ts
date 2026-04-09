import type { HandLandmarkPoint } from '../types';

// ─── Euclidean Distance ───────────────────────────────────────────────────────

/**
 * Euclidean distance between two normalized landmark points (ignores Z).
 */
export function euclideanDist2D(a: HandLandmarkPoint, b: HandLandmarkPoint): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

// ─── Linear Interpolation ─────────────────────────────────────────────────────

/**
 * Smooth lerp between `current` and `target` at rate `alpha` [0..1].
 * Higher alpha = faster response, lower = smoother/lazier.
 */
export function lerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

// ─── Low-Pass (Moving Average) Filter ────────────────────────────────────────

/**
 * Maintains a circular buffer of recent values and returns the average.
 * Call `push(value)` each frame, then `average()` to get the smoothed value.
 */
export class MovingAverageFilter {
  private readonly buffer: number[];
  private readonly size: number;
  private head = 0;
  private filled = false;

  constructor(windowSize: number) {
    this.size = Math.max(1, windowSize);
    this.buffer = new Array<number>(this.size).fill(0);
  }

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.size;
    if (this.head === 0) this.filled = true;
  }

  average(): number {
    const count = this.filled ? this.size : this.head;
    if (count === 0) return 0;
    return this.buffer.slice(0, count).reduce((s, v) => s + v, 0) / count;
  }

  reset(): void {
    this.buffer.fill(0);
    this.head = 0;
    this.filled = false;
  }
}

// ─── 2D Smoothed Point ────────────────────────────────────────────────────────

/**
 * Paired X/Y moving average filters for a 2D point.
 */
export class SmoothedPoint2D {
  private readonly xFilter: MovingAverageFilter;
  private readonly yFilter: MovingAverageFilter;

  constructor(windowSize: number) {
    this.xFilter = new MovingAverageFilter(windowSize);
    this.yFilter = new MovingAverageFilter(windowSize);
  }

  push(point: HandLandmarkPoint): void {
    this.xFilter.push(point.x);
    this.yFilter.push(point.y);
  }

  get(): { x: number; y: number } {
    return { x: this.xFilter.average(), y: this.yFilter.average() };
  }

  reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
  }
}

// ─── Delta (Frame-to-Frame Movement) ─────────────────────────────────────────

export interface Delta2D {
  dx: number;
  dy: number;
}

/**
 * Compute the delta between the current smoothed position and the previous one.
 */
export function computeDelta(
  current: { x: number; y: number },
  previous: { x: number; y: number } | null
): Delta2D {
  if (!previous) return { dx: 0, dy: 0 };
  return {
    dx: current.x - previous.x,
    dy: current.y - previous.y,
  };
}

// ─── Normalized → Pixel Scaling ───────────────────────────────────────────────

/**
 * Scale a normalized [0..1] delta to pixel pan offset.
 * Landmarks are in video space; we want map pixel space.
 */
export function normalizedDeltaToPixels(
  delta: Delta2D,
  viewportWidth: number,
  viewportHeight: number,
  sensitivity: number
): Delta2D {
  return {
    dx: delta.dx * viewportWidth * sensitivity,
    dy: delta.dy * viewportHeight * sensitivity,
  };
}

// ─── Zoom Delta from Y Movement ───────────────────────────────────────────────

/**
 * Map a Y-axis delta (normalized) to a zoom level delta.
 * Moving hand UP (negative deltaY) = zoom in (+)
 * Moving hand DOWN (positive deltaY) = zoom out (-)
 *
 * @param deltaY   normalized Y delta (current - previous), range roughly [-0.05, 0.05]
 * @param sensitivity  how aggressively to respond (default 20)
 */
export function yDeltaToZoomDelta(deltaY: number, sensitivity = 20): number {
  // Invert: hand moving up (smaller Y) = zoom in
  return -deltaY * sensitivity;
}

// ─── Dead Zone ────────────────────────────────────────────────────────────────

/**
 * If the absolute delta is below `threshold`, zero it out.
 * Prevents micro-jitter from accumulating into map drift.
 */
export function applyDeadZone(delta: Delta2D, threshold: number): Delta2D {
  return {
    dx: Math.abs(delta.dx) < threshold ? 0 : delta.dx,
    dy: Math.abs(delta.dy) < threshold ? 0 : delta.dy,
  };
}
