# 🚕 SG Taxi Tracker

Real-time Singapore taxi availability map. Shows live taxi positions, your location, nearby taxi count, and a personal booking log that builds up a success-rate history over time.

---

## Tech Stack & Why

### Go (Backend)

**Why Go for this use case:**
WebSockets are a long-lived connection problem. Every browser tab that opens the app holds an open connection to the server — the server must handle all of them simultaneously while also polling the taxi API every 30 seconds and broadcasting updates to everyone.

Go's goroutines make this cheap. Each connected browser gets its own goroutine (~2 KB RAM). A channel acts as the pipe between the poller and the broadcaster. The result is a single binary that can hold thousands of concurrent WebSocket connections with minimal memory.

| | |
|---|---|
| ✅ Goroutines are tiny (2 KB vs ~1 MB for OS threads) | ✅ Built-in channel primitives make fan-out clean |
| ✅ Compiles to a single static binary, easy to containerise | ✅ Strong standard library — `net/http` handles WebSocket upgrade out of the box (via gorilla) |
| ❌ Verbose error handling (`if err != nil`) adds boilerplate | ❌ No built-in WebSocket — needs `gorilla/websocket` |
| ❌ Steeper learning curve than Node.js for JS developers | ❌ Overkill if you only have a handful of users |

**Alternatives considered:**
- **Node.js + Socket.io** — easier to write, but single-threaded. High concurrency requires clustering or worker threads which adds complexity.
- **Python + FastAPI** — great for ML/data work but slower under concurrent WebSocket load due to the GIL.

---

### React + Vite (Frontend)

**Why React for this use case:**
The UI has several independent pieces of state — WebSocket status, taxi count, nearby count, user location, booking log — that all update at different times. React's component model keeps each piece isolated and re-renders only what changed.

Vite replaces Create React App for near-instant HMR (hot module reload) during development.

| | |
|---|---|
| ✅ Component state makes it easy to manage location, WS status, and booking log independently | ✅ Vite dev server is extremely fast |
| ✅ `useCallback` / `useRef` let you hold Mapbox marker references without triggering re-renders | ✅ Large ecosystem — hooks for geolocation, localStorage, etc. |
| ❌ React StrictMode double-invokes effects in dev — caused the user marker bug (stale ref after map teardown) | ❌ More setup than plain JS for a small app |
| ❌ `useEffect` dependency arrays are easy to get wrong, leading to stale closures | |

**Alternatives considered:**
- **Plain JS** — simpler, but managing WebSocket state, map lifecycle, and booking logs without a framework gets messy fast.
- **Svelte** — less boilerplate than React, but smaller ecosystem and less familiar to most teams.

---

### Mapbox GL JS (Map)

**Why Mapbox for this use case:**
Rendering 2,000–3,000 taxi markers that update every 30 seconds requires WebGL — canvas-based rendering that runs on the GPU. Mapbox GL JS uses WebGL under the hood, so thousands of markers render smoothly. DOM-based alternatives (like Leaflet) slow down with that many markers.

| | |
|---|---|
| ✅ WebGL rendering handles 2,000+ markers without frame drops | ✅ GeoJSON sources + layers make the radius circle trivial to add |
| ✅ Smooth flyTo / animations built in | ✅ Free tier is generous for a demo project |
| ❌ Requires an API token — token exposed in the frontend bundle (unavoidable for client-side maps) | ❌ Paid above 50,000 map loads/month |
| ❌ Heavier bundle than Leaflet (~280 KB gzipped) | |

**Alternatives considered:**
- **Google Maps JS API** — more familiar, but more expensive and the API is more restrictive.
- **Leaflet** — lightweight and free, but DOM-based marker rendering degrades at 2,000+ markers.
- **deck.gl** — better for massive datasets (100k+ points) but more complex to set up.

---

### data.gov.sg Taxi Availability API (Data Source)

**Why this API:**
It's free, requires no authentication, and provides real-time taxi positions updated roughly every 30 seconds — exactly what this app needs.

| | |
|---|---|
| ✅ Free with no API key required | ✅ Real-time data, same source Grab/CDG apps use |
| ❌ Coordinates only — no taxi IDs, so you can't track individual taxis over time | ❌ 30-second update interval is the minimum granularity |
| ❌ No historical data available via the API | |

---

### localStorage (Booking Log)

**Why localStorage for the booking log:**
The booking log is personal data — it makes sense to keep it on the user's device. No backend needed, no auth, no privacy concerns. The data set is small (a few hundred log entries at most).

| | |
|---|---|
| ✅ Zero backend changes required | ✅ Persists across page refreshes |
| ❌ Lost if the user clears browser storage | ❌ Not shared across devices or browsers |
| ❌ No server-side analytics possible | |

**If you wanted to scale this:** store logs in a backend database (Postgres) behind an authenticated API. That would let you aggregate success rates across all users and build a city-wide model of taxi availability vs booking success.

---

## Architecture

```
data.gov.sg API
      ↓  poll every 30s (goroutine)
Go WebSocket Server :8080
      ↓  broadcast to all clients (goroutine per client)
React Frontend
      ├── Mapbox GL JS  →  renders taxi markers + radius circle
      ├── useGeolocation  →  browser GPS
      ├── useBookingLog   →  localStorage
      └── BookingPanel    →  log bookings, view success-rate insights
```

---

## Quick Start (Local)

### 1. Get a Mapbox token
Sign up free at https://mapbox.com → Account → Tokens → copy your default public token.

### 2. Frontend
```bash
cd frontend
cp .env.example .env
# paste your VITE_MAPBOX_TOKEN into .env
npm install
npm run dev
```

### 3. Backend
```bash
cd backend
go mod tidy
go run .
```

Open http://localhost:5173

---

## Docker (Local)

```bash
cd docker
VITE_MAPBOX_TOKEN=your_token docker compose up --build
```

Open http://localhost

---

## Deploy to AWS EKS

### 1. Push images to ECR
```bash
aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin YOUR_AWS_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com

docker build -t grabmap-backend ./backend
docker tag grabmap-backend:latest YOUR_ECR_URI/grabmap-backend:latest
docker push YOUR_ECR_URI/grabmap-backend:latest

docker build \
  --build-arg VITE_MAPBOX_TOKEN=your_token \
  --build-arg VITE_WS_URL=wss://your-domain.com/ws \
  -t grabmap-frontend ./frontend
docker tag grabmap-frontend:latest YOUR_ECR_URI/grabmap-frontend:latest
docker push YOUR_ECR_URI/grabmap-frontend:latest
```

### 2. Update k8s.yaml
Replace `YOUR_ECR_URI` with your actual ECR URI.

### 3. Apply to cluster
```bash
kubectl apply -f docker/k8s.yaml
kubectl get services  # get the LoadBalancer external IP
```

---

## Key Design Decisions

**WebSocket vs polling:** WebSocket is a persistent connection — the server pushes updates. If each browser polled data.gov.sg directly every 30s, that's N requests per interval (one per user). With WebSocket, it's always one request regardless of how many users are connected — the server fans it out.

**Go channel as message bus:** The poller and broadcaster are completely decoupled. The poller doesn't know how many browsers are connected; it just sends to the channel. The broadcaster doesn't know where the data came from; it just reads from the channel and sends to everyone. This separation makes each part easy to reason about independently.

**Goroutine per client write:** Broadcasting to each client happens in its own goroutine. If one browser has a slow connection and blocks on `WriteJSON`, it doesn't delay the other clients. Each write is independent.

**`mapReady` state in React:** Mapbox fires a `load` event when the style finishes loading. The user's location can arrive from the browser GPS before or after this event. Using a `mapReady` boolean as a React state dependency ensures the marker and radius circle are only drawn after the map is ready to accept layers, regardless of which resolves first.
