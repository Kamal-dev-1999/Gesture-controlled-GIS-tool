import { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import type { MapBounds } from '../types';

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CENTER = { lat: 51.5074, lng: -0.1278 }; // London
const DEFAULT_ZOOM = 13;

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  gestureHandling: 'none', // We own all gesture handling
  clickableIcons: false,
  styles: [
    { elementType: 'geometry',        stylers: [{ color: '#0d1117' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#080c18' }] },
    { elementType: 'labels.text.fill',   stylers: [{ color: '#6b7280' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
    { featureType: 'poi',                     elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
    { featureType: 'poi.park',                elementType: 'geometry',         stylers: [{ color: '#0f1f12' }] },
    { featureType: 'poi.park',                elementType: 'labels.text.fill', stylers: [{ color: '#3d7a52' }] },
    { featureType: 'road',                    elementType: 'geometry',         stylers: [{ color: '#1e2535' }] },
    { featureType: 'road',                    elementType: 'geometry.stroke',  stylers: [{ color: '#111827' }] },
    { featureType: 'road.highway',            elementType: 'geometry',         stylers: [{ color: '#1d3461' }] },
    { featureType: 'road.highway',            elementType: 'geometry.stroke',  stylers: [{ color: '#111827' }] },
    { featureType: 'road.highway',            elementType: 'labels.text.fill', stylers: [{ color: '#3b82f6' }] },
    { featureType: 'transit',                 elementType: 'geometry',         stylers: [{ color: '#111827' }] },
    { featureType: 'transit.station',         elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
    { featureType: 'water',                   elementType: 'geometry',         stylers: [{ color: '#0a1628' }] },
    { featureType: 'water',                   elementType: 'labels.text.fill', stylers: [{ color: '#1e3a5f' }] },
    { featureType: 'water',                   elementType: 'labels.text.stroke', stylers: [{ color: '#050810' }] },
  ],
};

// ─── Public handle exposed via forwardRef ─────────────────────────────────────

export interface MapContainerHandle {
  /** Direct access to the underlying google.maps.Map instance */
  getMap: () => google.maps.Map | null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MapContainerProps {
  onBoundsChange: (bounds: MapBounds) => void;
}

const GOOGLE_MAPS_LIBRARIES: ('places' | 'geometry')[] = ['places'];

// ─── MapContainer ─────────────────────────────────────────────────────────────

export const MapContainer = forwardRef<MapContainerHandle, MapContainerProps>(
  function MapContainer({ onBoundsChange }, ref) {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    const internalMapRef = useRef<google.maps.Map | null>(null);

    // Expose the map instance to the parent via ref
    useImperativeHandle(ref, () => ({
      getMap: () => internalMapRef.current,
    }));

    const { isLoaded, loadError } = useJsApiLoader({
      googleMapsApiKey: apiKey ?? '',
      libraries: GOOGLE_MAPS_LIBRARIES,
    });

    const onLoad = useCallback((map: google.maps.Map) => {
      internalMapRef.current = map;
    }, []);

    const onUnmount = useCallback(() => {
      internalMapRef.current = null;
    }, []);

    const onIdle = useCallback(() => {
      const map = internalMapRef.current;
      if (!map) return;

      const mapBounds = map.getBounds();
      const center = map.getCenter();
      if (!mapBounds || !center) return;

      const ne = mapBounds.getNorthEast();
      const sw = mapBounds.getSouthWest();

      const bounds: MapBounds = {
        ne: { lat: ne.lat(), lng: ne.lng() },
        sw: { lat: sw.lat(), lng: sw.lng() },
        center: { lat: center.lat(), lng: center.lng() },
      };

      onBoundsChange(bounds);
    }, [onBoundsChange]);

    // ── Error State ──────────────────────────────────────────────────────────
    if (loadError) {
      return (
        <div className="map-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <p style={{ fontSize: 14 }}>Google Maps failed to load.</p>
          <p style={{ fontSize: 12 }}>Check <code style={{ color: 'var(--accent-primary)' }}>VITE_GOOGLE_MAPS_API_KEY</code> in <code>frontend/.env</code></p>
        </div>
      );
    }

    // ── Loading Spinner ──────────────────────────────────────────────────────
    if (!isLoaded) {
      return (
        <div className="map-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--text-secondary)' }}>
          <div style={{ width: 48, height: 48, border: '3px solid var(--accent-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>Loading Map Engine…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    // ── No API Key ───────────────────────────────────────────────────────────
    if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
      return (
        <div className="map-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>
          <span style={{ fontSize: 48 }}>🗺️</span>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Map API Key Required</p>
          <p style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
            Add your key to <code style={{ color: 'var(--accent-primary)' }}>frontend/.env</code>
            {' → '}
            <code style={{ color: 'var(--accent-primary)' }}>VITE_GOOGLE_MAPS_API_KEY</code>
          </p>
        </div>
      );
    }

    return (
      <div className="map-container">
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          options={MAP_OPTIONS}
          onLoad={onLoad}
          onUnmount={onUnmount}
          onIdle={onIdle}
        />
      </div>
    );
  }
);
