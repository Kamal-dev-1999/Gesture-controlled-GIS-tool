# 🌍 Minority Report GIS Engine
<!--  -->
A high-performance, gesture-controlled Geographic Information System (GIS) prototype. This mono-repo architecture couples real-time machine vision (MediaPipe) with geographic mapping (Google Maps API) and spatio-temporal intelligence (Wikipedia + Google Places).

## 🤖 AI Agent Onboarding & Context

**If you are an AI reading this repo to help a human**, here is your quick-start context:

- **Project Nature**: Full-stack TypeScript mono-repo (React/Vite frontend + Express/Node backend).
- **Core Loop**: Hand tracked via webcam -> MediaPipe extracts landmarks -> Euclidean Math extracts gestures (panning/zooming) -> Delta sent to Google Maps viewport -> Map triggers `onIdle` -> Frontend sends bounding box to backend -> Backend concurrently fetches Wikipedia/Places data -> Frontend renders floating UI panes.
- **Critical Architectural Decisions**:
  1. **MediaPipe WASM Loading**: Do NOT attempt to bundle the MediaPipe `.wasm` binary via Vite. It is loaded via the JSDelivr CDN dynamically in `useHandTracking.ts` to avoid Vite/Rollup build errors.
  2. **Dotenv & Restart Logic**: The backend uses `dotenv.config({ override: true })` because `ts-node-dev` spawns child processes that inherit the original shell's environment cache. If modifying `.env`, explicitly advise restarting the Node process.
  3. **Event Debouncing**: The GIS API fetch is debounced by 600ms on the frontend. Do not remove this, or the Google/Wiki APIs will rate-limit strictly during gesture pans.

---

## 🛠 Tech Stack

### Frontend (`/frontend`)
- **Core**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS v4, custom Glassmorphism/Dark Space CSS variables (`index.css`)
- **Mapping**: `@react-google-maps/api`
- **Machine Vision**: `@mediapipe/tasks-vision` (HandLandmarker running exclusively on GPU delegate)

### Backend (`/backend`)
- **Core**: Node.js, Express, TypeScript, `ts-node-dev`
- **APIs**: Fetching via `axios`, CORS enabled for cross-origin frontend communication.

---

## 📁 Repository Structure

```text
/
├── frontend/
│   ├── index.html               # Main entry with SEO and preconnects
│   ├── .env                     # Contains VITE_GOOGLE_MAPS_API_KEY
│   └── src/
│       ├── App.tsx              # Main layout wiring (Map + UI + Hand Tracking)
│       ├── index.css            # Standardized root tokens and UI styling
│       ├── types/index.ts       # Shared strictly-typed definitions
│       ├── utils/
│       │   └── gesturemath.ts   # Core engine: Lerp, Low-Pass filter, Euclidean distances
│       ├── hooks/
│       │   ├── useHandTracking.ts      # MediaPipe web-cam tracking loop
│       │   └── useGestureTranslator.ts # Translates landmarks into pan/zoom deltas
│       └── components/
│           ├── MapContainer.tsx # Core map render exposing forwardRef map instance
│           ├── CameraFeed.tsx   # Floating webcam + landmark skeleton canvas UI
│           └── GisDataPanel.tsx # Sidebar displaying Places/Wiki results
│
└── backend/
    ├── package.json             # Dev scripts: "npm run dev"
    ├── tsconfig.json          
    ├── .env                     # Contains GOOGLE_PLACES_API_KEY
    └── src/
        └── server.ts            # Express server containing /api/gis-context endpoint
```

---

## 🚀 Setup & Installation

**1. Clone and Install Dependencies**
```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

**2. Configure Environment Variables**

Create a `frontend/.env` file:
```env
VITE_GOOGLE_MAPS_API_KEY=your_maps_javascript_key_here
VITE_API_BASE_URL=http://localhost:3001
```

Create a `backend/.env` file:
```env
PORT=3001
NODE_ENV=development
GOOGLE_PLACES_API_KEY=your_places_api_key_here
FRONTEND_URL=http://localhost:5173
```
> *Note: If `GOOGLE_PLACES_API_KEY` is missing in the backend, it will gracefully fallback to returning mock data (London landmarks) so frontend UI development can continue uninterrupted.*

**3. Run the Development Servers**

Terminal 1 (Backend):
```bash
cd backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

---

## ✋ Gesture Controls

### 1. Air Panning (Moving the Map)
- **How to do it:** Keep your hand **flat and open** facing the camera (fingers unpinched).
- **The Interaction:** Move your hand horizontally or vertically in the air. The system calculates the centroid of your hand and translates it to map panning through a tuned dead-zone low-pass filter to ignore hand jitter.

### 2. Pinch-to-Zoom (Telescoping the Map)
- **How to do it:** Bring the very tip of your **Thumb** and the very tip of your **Index Finger** together to perform a "Pinch". A purple dashed line will connect the two fingers on the camera feed screen.
- **To Zoom OUT (globe view):** While holding the pinch, pull your hand straight **DOWN**.
- **To Zoom IN (street view):** While holding the pinch, push your hand straight **UP**.
- **Note:** Releasing the pinch immediately locks in the zoom level and returns you to Air Panning mode.
