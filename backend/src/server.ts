import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ override: true });

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

interface MapBounds {
  ne: { lat: number; lng: number };
  sw: { lat: number; lng: number };
  center: { lat: number; lng: number };
}

interface PlaceResult {
  name: string;
  vicinity: string;
  rating?: number;
  types: string[];
  placeId: string;
}

interface WikiPage {
  title: string;
  extract: string;
  pageId: number;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
}

interface GisContextResponse {
  landmarks: PlaceResult[];
  wikiArticles: WikiPage[];
  bounds: MapBounds;
  fetchedAt: string;
}

interface WikiGeoSearchItem {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist: number;
}

interface WikiGeoSearchResponse {
  query: {
    geosearch: WikiGeoSearchItem[];
  };
}

interface WikiExtractResponse {
  query: {
    pages: Record<
      string,
      {
        pageid: number;
        title: string;
        extract: string;
      }
    >;
  };
}

interface GooglePlacesResponse {
  results: Array<{
    name: string;
    vicinity: string;
    rating?: number;
    types: string[];
    place_id: string;
  }>;
  status: string;
}

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? '';

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json());

// ─── Request Logger ───────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ─── Health Endpoint ──────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response<HealthResponse>) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── GIS Context Endpoint ─────────────────────────────────────────────────────

app.post(
  '/api/gis-context',
  async (req: Request<object, GisContextResponse, MapBounds>, res: Response) => {
    const bounds = req.body;

    if (!bounds?.center?.lat || !bounds?.center?.lng) {
      res.status(400).json({ error: 'Invalid bounds payload' } as unknown as GisContextResponse);
      return;
    }

    const { lat, lng } = bounds.center;

    try {
      // Run Google Places & Wikipedia in parallel
      const [placesResult, wikiResult] = await Promise.allSettled([
        fetchGooglePlaces(lat, lng),
        fetchWikipediaArticles(lat, lng),
      ]);

      const landmarks: PlaceResult[] =
        placesResult.status === 'fulfilled' ? placesResult.value : [];
      const wikiArticles: WikiPage[] =
        wikiResult.status === 'fulfilled' ? wikiResult.value : [];

      if (placesResult.status === 'rejected') {
        console.error('[Places API Error]', placesResult.reason);
      }
      if (wikiResult.status === 'rejected') {
        console.error('[Wikipedia API Error]', wikiResult.reason);
      }

      const response: GisContextResponse = {
        landmarks,
        wikiArticles,
        bounds,
        fetchedAt: new Date().toISOString(),
      };

      res.json(response);
    } catch (error) {
      console.error('[GIS Context Error]', error);
      res.status(500).json({ error: 'Internal server error' } as unknown as GisContextResponse);
    }
  }
);

// ─── Helper: Google Places Nearby Search ─────────────────────────────────────

async function fetchGooglePlaces(lat: number, lng: number): Promise<PlaceResult[]> {
  if (!GOOGLE_PLACES_API_KEY || GOOGLE_PLACES_API_KEY === 'YOUR_GOOGLE_PLACES_API_KEY_HERE') {
    console.warn('[Places] API key not configured — returning mock data');
    return getMockPlaces();
  }

  const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
  const response = await axios.get<GooglePlacesResponse>(url, {
    params: {
      location: `${lat},${lng}`,
      radius: 2000,
      type: 'tourist_attraction',
      key: GOOGLE_PLACES_API_KEY,
    },
  });

  return response.data.results.slice(0, 8).map((place) => ({
    name: place.name,
    vicinity: place.vicinity,
    rating: place.rating,
    types: place.types.slice(0, 3),
    placeId: place.place_id,
  }));
}

// ─── Helper: Wikipedia Geosearch + Extracts ───────────────────────────────────

async function fetchWikipediaArticles(lat: number, lng: number): Promise<WikiPage[]> {
  const WIKI_BASE = 'https://en.wikipedia.org/w/api.php';

  // Step 1: Geosearch
  const geoResponse = await axios.get<WikiGeoSearchResponse>(WIKI_BASE, {
    params: {
      action: 'query',
      list: 'geosearch',
      gscoord: `${lat}|${lng}`,
      gsradius: 10000,
      gslimit: 5,
      format: 'json',
      origin: '*',
    },
    headers: {
      'User-Agent': 'MinorityReportGisTool/1.0 (dev) axios/1.x',
    },
  });

  const geoResults = geoResponse.data.query.geosearch ?? [];
  if (geoResults.length === 0) return [];

  const pageIds = geoResults
    .slice(0, 3)
    .map((g) => g.pageid)
    .join('|');

  // Step 2: Fetch extracts
  const extractResponse = await axios.get<WikiExtractResponse>(WIKI_BASE, {
    params: {
      action: 'query',
      pageids: pageIds,
      prop: 'extracts',
      exintro: true,
      explaintext: true,
      exsentences: 4,
      format: 'json',
      origin: '*',
    },
    headers: {
      'User-Agent': 'MinorityReportGisTool/1.0 (dev) axios/1.x',
    },
  });

  const pages = extractResponse.data.query.pages;

  return Object.values(pages).map((page) => {
    const geoItem = geoResults.find((g) => g.pageid === page.pageid);
    return {
      title: page.title,
      extract: page.extract ?? 'No description available.',
      pageId: page.pageid,
      lat: geoItem?.lat,
      lng: geoItem?.lon,
      distanceMeters: geoItem?.dist,
    };
  });
}

// ─── Mock Data (used when API keys are not configured) ───────────────────────

function getMockPlaces(): PlaceResult[] {
  return [
    { name: 'Tower of London', vicinity: 'Tower Hill, London', rating: 4.6, types: ['tourist_attraction', 'museum'], placeId: 'mock_1' },
    { name: 'The Shard', vicinity: '32 London Bridge St, London', rating: 4.5, types: ['tourist_attraction', 'establishment'], placeId: 'mock_2' },
    { name: 'Borough Market', vicinity: '8 Southwark St, London', rating: 4.7, types: ['food', 'point_of_interest'], placeId: 'mock_3' },
    { name: 'Tate Modern', vicinity: 'Bankside, London', rating: 4.6, types: ['museum', 'art_gallery'], placeId: 'mock_4' },
  ];
}

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Error]', err.message);
  res.status(500).json({ error: 'Something went wrong' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌍 Minority Report GIS Backend`);
  console.log(`   Server: http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   CORS:   ${FRONTEND_URL}`);
  console.log(`   Mode:   ${process.env.NODE_ENV ?? 'development'}\n`);
});

export default app;
