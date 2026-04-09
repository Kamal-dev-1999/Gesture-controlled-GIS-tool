import { useEffect, useRef, useState, useCallback } from 'react';
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { TrackedHandData, HandLandmarkPoint } from '../types';

// ─── Landmark Index Constants ─────────────────────────────────────────────────
const WRIST_IDX = 0;
const THUMB_TIP_IDX = 4;
const INDEX_TIP_IDX = 8;

// CDN paths (avoids Vite WASM bundling complications)
const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// ─── Utility: NormalizedLandmark → HandLandmarkPoint ─────────────────────────
function toLandmarkPoint(lm: NormalizedLandmark): HandLandmarkPoint {
  return { x: lm.x, y: lm.y, z: lm.z };
}

// ─── Utility: Calculate centroid of all 21 landmarks ─────────────────────────
function calcCentroid(landmarks: NormalizedLandmark[]): HandLandmarkPoint {
  const sum = landmarks.reduce(
    (acc, lm) => ({ x: acc.x + lm.x, y: acc.y + lm.y, z: acc.z + lm.z }),
    { x: 0, y: 0, z: 0 }
  );
  const n = landmarks.length || 1;
  return { x: sum.x / n, y: sum.y / n, z: sum.z / n };
}

// ─── Utility: Euclidean distance between two normalized points ────────────────
function euclideanDist(a: HandLandmarkPoint, b: HandLandmarkPoint): number {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)
  );
}

// ─── Hook Return Type ─────────────────────────────────────────────────────────
export interface UseHandTrackingReturn {
  handData: TrackedHandData | null;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
}

// ─── useHandTracking ──────────────────────────────────────────────────────────
export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): UseHandTrackingReturn {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  const [handData, setHandData] = useState<TrackedHandData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Canvas Drawing ────────────────────────────────────────────────────────
  const drawLandmarks = useCallback(
    (landmarks: NormalizedLandmark[], isPinching: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!drawingUtilsRef.current) {
        drawingUtilsRef.current = new DrawingUtils(ctx);
      }

      const du = drawingUtilsRef.current;

      // Draw connectors (skeleton lines)
      du.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
        color: isPinching ? 'rgba(99,102,241,0.7)' : 'rgba(59,130,246,0.5)',
        lineWidth: 1.5,
      });

      // Draw all landmark dots
      du.drawLandmarks(landmarks, {
        color: 'rgba(255,255,255,0.6)',
        fillColor: 'rgba(59,130,246,0.3)',
        lineWidth: 1,
        radius: 3,
      });

      // Highlight key landmarks with custom circles
      const keyPoints = [
        { idx: WRIST_IDX, color: '#3b82f6', label: 'W' },
        { idx: THUMB_TIP_IDX, color: isPinching ? '#a78bfa' : '#f59e0b', label: 'T' },
        { idx: INDEX_TIP_IDX, color: isPinching ? '#a78bfa' : '#10b981', label: 'I' },
      ];

      keyPoints.forEach(({ idx, color }) => {
        const lm = landmarks[idx];
        if (!lm) return;
        const x = lm.x * canvas.width;
        const y = lm.y * canvas.height;

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Glow ring
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Draw pinch line when pinching
      if (isPinching) {
        const thumb = landmarks[THUMB_TIP_IDX];
        const index = landmarks[INDEX_TIP_IDX];
        if (thumb && index) {
          ctx.beginPath();
          ctx.moveTo(thumb.x * canvas.width, thumb.y * canvas.height);
          ctx.lineTo(index.x * canvas.width, index.y * canvas.height);
          ctx.strokeStyle = 'rgba(167,139,250,0.9)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    },
    [canvasRef]
  );

  // ── Inference Loop ────────────────────────────────────────────────────────
  const runInference = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(runInference);
      return;
    }

    const now = video.currentTime;
    if (now === lastVideoTimeRef.current) {
      rafRef.current = requestAnimationFrame(runInference);
      return;
    }
    lastVideoTimeRef.current = now;

    const timestampMs = performance.now();
    const results = landmarker.detectForVideo(video, timestampMs);

    if (results.landmarks && results.landmarks.length > 0) {
      const rawLandmarks = results.landmarks[0];

      const indexTip = toLandmarkPoint(rawLandmarks[INDEX_TIP_IDX]);
      const thumbTip = toLandmarkPoint(rawLandmarks[THUMB_TIP_IDX]);
      const wrist = toLandmarkPoint(rawLandmarks[WRIST_IDX]);
      const centroid = calcCentroid(rawLandmarks);
      const pinchDistance = euclideanDist(thumbTip, indexTip);

      // Pinch threshold: ~7% of normalized space (accounts for hand scale variance)
      const PINCH_THRESHOLD = 0.07;
      const isPinching = pinchDistance < PINCH_THRESHOLD;

      const tracked: TrackedHandData = {
        landmarks: rawLandmarks.map(toLandmarkPoint),
        indexTip,
        thumbTip,
        wrist,
        centroid,
        pinchDistance,
        isPinching,
      };

      setHandData(tracked);
      drawLandmarks(rawLandmarks, isPinching);
    } else {
      // Clear canvas when no hand detected
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      setHandData(null);
    }

    rafRef.current = requestAnimationFrame(runInference);
  }, [videoRef, canvasRef, drawLandmarks]);

  // ── Initialization ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      try {
        setIsLoading(true);
        setError(null);

        // 1. Request webcam
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // 2. Load MediaPipe WASM + HandLandmarker model
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

        if (cancelled) return;

        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_PATH,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (cancelled) return;

        setIsReady(true);
        setIsLoading(false);

        // 3. Start inference loop
        rafRef.current = requestAnimationFrame(runInference);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Unknown error initializing camera';
        console.error('[useHandTracking]', err);
        setError(msg);
        setIsLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;

      // Cancel animation frame
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // Stop webcam stream
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      // Close landmarker
      landmarkerRef.current?.close();
      landmarkerRef.current = null;

      // Close drawing utils
      drawingUtilsRef.current?.close();
      drawingUtilsRef.current = null;
    };
  }, [videoRef, canvasRef, runInference]);

  return { handData, isReady, isLoading, error };
}
