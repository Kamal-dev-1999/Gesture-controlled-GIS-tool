import { useRef, useState, useCallback, useEffect } from 'react';
import { MapContainer } from './components/MapContainer';
import { GisDataPanel } from './components/GisDataPanel';
import { CameraFeed } from './components/CameraFeed';
import { useHandTracking } from './hooks/useHandTracking';
import { useGestureTranslator } from './hooks/useGestureTranslator';
import type { MapContainerHandle } from './components/MapContainer';
import type { MapBounds, GisContextResponse } from './types';

// ─── Debounce Hook ─────────────────────────────────────────────────────────────

function useDebounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fn(...args), delayMs);
    },
    [fn, delayMs]
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:3001';

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ref to the Google Maps instance (shared with gesture translator)
  const mapContainerRef = useRef<MapContainerHandle | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);

  // Viewport dimensions for pan scaling
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ w: window.innerWidth * 0.75, h: window.innerHeight });

  // ── Track viewport size ────────────────────────────────────────────────────
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setViewportSize({ w: width, h: height });
      }
    });
    if (mapDivRef.current) observer.observe(mapDivRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Sync mapContainerRef handle → mapInstanceRef ───────────────────────────
  const syncMapRef = useCallback(() => {
    const map = mapContainerRef.current?.getMap() ?? null;
    mapInstanceRef.current = map;
  }, []);

  // ── Hand Tracking ──────────────────────────────────────────────────────────
  const {
    handData,
    isReady: trackingReady,
    isLoading: trackingLoading,
    error: trackingError,
  } = useHandTracking(videoRef, canvasRef);

  // ── Gesture → Map Translation ──────────────────────────────────────────────
  // Ensure mapInstanceRef is kept up to date before the translator reads it
  useEffect(() => { syncMapRef(); });

  const gestureIntent = useGestureTranslator(
    handData,
    mapInstanceRef,
    viewportSize.w,
    viewportSize.h
  );

  // ── GIS Data State ─────────────────────────────────────────────────────────
  const [gisData, setGisData] = useState<GisContextResponse | null>(null);
  const [isGisLoading, setIsGisLoading] = useState(false);

  const fetchGisContext = useCallback(async (bounds: MapBounds) => {
    setIsGisLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/gis-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bounds),
      });
      if (!response.ok) throw new Error(`GIS API error: ${response.status}`);
      const data = (await response.json()) as GisContextResponse;
      setGisData(data);
    } catch (err) {
      console.error('[GIS Fetch Error]', err);
    } finally {
      setIsGisLoading(false);
    }
  }, []);

  const debouncedFetchGis = useDebounce(fetchGisContext, 600);

  const handleBoundsChange = useCallback(
    (bounds: MapBounds) => { debouncedFetchGis(bounds); },
    [debouncedFetchGis]
  );

  // ── Badge label ────────────────────────────────────────────────────────────
  const gestureLabel = (() => {
    if (trackingError) return '⚠️ No Camera';
    if (trackingLoading) return '⏳ Loading AI…';
    if (!trackingReady) return '⏳ Loading AI…';
    if (gestureIntent?.type === 'zoom') return '🤏 Zooming';
    if (gestureIntent?.type === 'pan') return '✋ Panning';
    if (handData) return '🖐 Tracking';
    return '🖐 Ready';
  })();

  const gestureBadgeClass = [
    'gesture-badge',
    gestureIntent?.type === 'pan' ? 'active-pan' : '',
    gestureIntent?.type === 'zoom' ? 'active-zoom' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="app-layout">
      {/* ── Map Area ──────────────────────────────────────────────────── */}
      <div ref={mapDivRef} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <MapContainer
          ref={mapContainerRef}
          onBoundsChange={handleBoundsChange}
        />

        {/* HUD pill */}
        <div className="map-hud">
          <div className="hud-pill">
            <div className="hud-pill-dot" />
            Minority Report GIS
          </div>
        </div>

        {/* Gesture status badge */}
        <div className={gestureBadgeClass}>{gestureLabel}</div>

        {/* Floating Camera Feed */}
        <CameraFeed
          videoRef={videoRef}
          canvasRef={canvasRef}
          isTrackingActive={trackingReady && !trackingError}
          isLoading={trackingLoading}
          error={trackingError}
        />
      </div>

      {/* ── GIS Side Panel ─────────────────────────────────────────────── */}
      <GisDataPanel gisData={gisData} isLoading={isGisLoading} />
    </div>
  );
}
