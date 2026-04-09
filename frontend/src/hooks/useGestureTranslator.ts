import { useRef, useEffect, useCallback } from 'react';
import type { TrackedHandData, GestureIntent } from '../types';
import {
  SmoothedPoint2D,
  computeDelta,
  normalizedDeltaToPixels,
  yDeltaToZoomDelta,
  applyDeadZone,
  lerp,
} from '../utils/gesturemath';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum normalized delta to register as meaningful movement */
const PAN_DEAD_ZONE = 0.004;

/** Scale factor: normalized delta → map pixel offset.
 *  Higher = more sensitive panning. */
const PAN_SENSITIVITY = 8;

/** How strong the zoom response is (higher = faster zoom per cm of hand movement) */
const ZOOM_SENSITIVITY = 30;

/** Lerp alpha for zoom smoothing — lower = buttery smooth, higher = responsive */
const ZOOM_LERP_ALPHA = 0.12;

/** Smoothing window for the centroid (higher = smoother but more latency) */
const SMOOTHING_WINDOW = 6;

/** While pinching, Y dead zone before zoom kicks in */
const ZOOM_DEAD_ZONE_Y = 0.003;

// ─── Hook State (persistent across renders via refs) ────────────────────────

interface ZoomState {
  isActive: boolean;
  currentZoom: number;
  targetZoom: number;
}

// ─── useGestureTranslator ─────────────────────────────────────────────────────

/**
 * Converts raw TrackedHandData from MediaPipe into a GestureIntent
 * (pan or zoom) for the Google Maps instance.
 *
 * @param handData      The latest hand tracking result (null if no hand)
 * @param mapRef        A ref to the live GoogleMap instance
 * @param viewportW     Width of the map container in pixels
 * @param viewportH     Height of the map container in pixels
 */
export function useGestureTranslator(
  handData: TrackedHandData | null,
  mapRef: React.RefObject<google.maps.Map | null>,
  viewportW: number,
  viewportH: number
): GestureIntent | null {
  // Smoothed centroid filter
  const smoothedCentroid = useRef(new SmoothedPoint2D(SMOOTHING_WINDOW));

  // Previous smoothed position (to compute delta)
  const prevSmoothed = useRef<{ x: number; y: number } | null>(null);

  // Zoom state (holds current and target zoom for lerp)
  const zoomState = useRef<ZoomState>({
    isActive: false,
    currentZoom: 13,
    targetZoom: 13,
  });

  // Whether we were pinching last frame (for state transition detection)
  const wasPinching = useRef(false);

  // rAF ref for the zoom lerp loop
  const zoomRafRef = useRef<number | null>(null);

  // ── Zoom Lerp Loop ────────────────────────────────────────────────────────
  // Runs independently of the hand tracking loop to ensure silky-smooth zoom
  const runZoomLerp = useCallback(() => {
    const map = mapRef.current;
    const zs = zoomState.current;

    if (!map || !zs.isActive) {
      zoomRafRef.current = null;
      return;
    }

    zs.currentZoom = lerp(zs.currentZoom, zs.targetZoom, ZOOM_LERP_ALPHA);
    const clamped = Math.max(2, Math.min(20, zs.currentZoom));
    map.setZoom(clamped);

    // Keep looping until zoom converges
    if (Math.abs(zs.currentZoom - zs.targetZoom) > 0.01) {
      zoomRafRef.current = requestAnimationFrame(runZoomLerp);
    } else {
      zs.currentZoom = zs.targetZoom;
      map.setZoom(Math.max(2, Math.min(20, zs.targetZoom)));
      zoomRafRef.current = null;
    }
  }, [mapRef]);

  // ── Process hand data each time it changes ────────────────────────────────
  useEffect(() => {
    // No hand: reset smoothing state
    if (!handData) {
      smoothedCentroid.current.reset();
      prevSmoothed.current = null;
      wasPinching.current = false;
      zoomState.current.isActive = false;
      return;
    }

    const { centroid, isPinching } = handData;

    // Push centroid into low-pass filter
    smoothedCentroid.current.push(centroid);
    const smoothed = smoothedCentroid.current.get();

    // Compute frame-to-frame delta from smoothed positions
    const delta = computeDelta(smoothed, prevSmoothed.current);
    prevSmoothed.current = { ...smoothed };

    // ── Transition: just started pinching ──
    if (isPinching && !wasPinching.current) {
      // Snapshot current map zoom as starting point
      const map = mapRef.current;
      const currentZoom = map?.getZoom() ?? 13;
      zoomState.current.currentZoom = currentZoom;
      zoomState.current.targetZoom = currentZoom;
      zoomState.current.isActive = true;
    }

    // ── Transition: just released pinch ──
    if (!isPinching && wasPinching.current) {
      zoomState.current.isActive = false;
    }

    wasPinching.current = isPinching;

    // ── PINCH → ZOOM ──────────────────────────────────────────────────────
    if (isPinching) {
      const yDeltaRaw = delta.dy;
      const yDeadApplied = Math.abs(yDeltaRaw) < ZOOM_DEAD_ZONE_Y ? 0 : yDeltaRaw;

      if (yDeadApplied !== 0) {
        const zoomDelta = yDeltaToZoomDelta(yDeadApplied, ZOOM_SENSITIVITY);
        zoomState.current.targetZoom = Math.max(
          2,
          Math.min(20, zoomState.current.targetZoom + zoomDelta)
        );

        // Kick off lerp loop if not already running
        if (zoomRafRef.current === null) {
          zoomRafRef.current = requestAnimationFrame(runZoomLerp);
        }
      }

      return; // Don't pan while zooming
    }

    // ── AIR PAN ───────────────────────────────────────────────────────────
    const deadZoned = applyDeadZone(delta, PAN_DEAD_ZONE);

    if (deadZoned.dx !== 0 || deadZoned.dy !== 0) {
      const pixelDelta = normalizedDeltaToPixels(
        deadZoned,
        viewportW,
        viewportH,
        PAN_SENSITIVITY
      );

      mapRef.current?.panBy(pixelDelta.dx, pixelDelta.dy);
    }
  }, [handData, mapRef, viewportW, viewportH, runZoomLerp]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (zoomRafRef.current !== null) {
        cancelAnimationFrame(zoomRafRef.current);
      }
    };
  }, []);

  // ── Derive GestureIntent for the UI badge ─────────────────────────────────
  if (!handData) return null;

  if (handData.isPinching) {
    return { type: 'zoom', zoomDelta: 0 }; // Actual zoom handled in lerp loop
  }

  const smoothed = smoothedCentroid.current.get();
  const delta = computeDelta(smoothed, prevSmoothed.current);
  const dead = applyDeadZone(delta, PAN_DEAD_ZONE);

  if (dead.dx !== 0 || dead.dy !== 0) {
    return { type: 'pan', deltaX: dead.dx, deltaY: dead.dy };
  }

  return { type: 'idle' };
}
