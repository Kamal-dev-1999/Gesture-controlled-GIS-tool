// ─── Map & GIS Types ─────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapBounds {
  ne: LatLng;
  sw: LatLng;
  center: LatLng;
}

export interface PlaceResult {
  name: string;
  vicinity: string;
  rating?: number;
  types: string[];
  placeId: string;
}

export interface WikiPage {
  title: string;
  extract: string;
  pageId: number;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
}

export interface GisContextResponse {
  landmarks: PlaceResult[];
  wikiArticles: WikiPage[];
  bounds: MapBounds;
  fetchedAt: string;
}

// ─── Hand Tracking Types ──────────────────────────────────────────────────────

export interface HandLandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface TrackedHandData {
  landmarks: HandLandmarkPoint[];
  indexTip: HandLandmarkPoint;   // Landmark 8
  thumbTip: HandLandmarkPoint;   // Landmark 4
  wrist: HandLandmarkPoint;      // Landmark 0
  centroid: HandLandmarkPoint;   // Calculated center
  pinchDistance: number;
  isPinching: boolean;
}

// ─── Gesture Types ────────────────────────────────────────────────────────────

export interface GestureIntent {
  type: 'pan' | 'zoom' | 'idle';
  deltaX?: number;
  deltaY?: number;
  zoomDelta?: number;
}

// ─── UI State Types ───────────────────────────────────────────────────────────

export interface GisDataPanelProps {
  gisData: GisContextResponse | null;
  isLoading: boolean;
}

export interface MapContainerProps {
  onBoundsChange: (bounds: MapBounds) => void;
}

export interface CameraFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isTrackingActive: boolean;
}
