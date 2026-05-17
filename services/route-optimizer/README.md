# Fauward Route Optimizer

A standalone Python/FastAPI microservice that provides intelligent route planning and ML-based ETA prediction for the Fauward logistics platform. Runs independently of the Node.js backend and is called over HTTP via BullMQ workers.

---

## What it does

Given a set of delivery/pickup stops, the service returns an optimised visit order with per-stop ETAs — minimising total distance, total time, or both depending on the shipment service tier. Handles up to 200 stops in under 3 seconds.

It also exposes an ETA training endpoint. As fauward-Go field operators complete stops and actual arrival times are recorded, those data points are fed back to train a Random Forest model that progressively improves ETA accuracy for that tenant's typical routes.

---

## Architecture

```
fauward-Go (field operator PWA)
        │  POST /field/location (live GPS)
        │
        ▼
Fastify Backend  ─────────────────────────────────────────────┐
│                                                              │
│  modules/routing/                                            │
│  ├── routing.routes.ts   (REST surface)                      │
│  ├── routing.service.ts  (HTTP client + address mapper)      │
│  └── routing.types.ts    (TypeScript schemas)                │
│                                                              │
│  queues/                                                     │
│  ├── queues.ts            (routeOptimizationQueue)           │
│  └── route-optimization.worker.ts  (BullMQ worker)          │
│                                                              │
└──────────────────────── Redis (BullMQ) ─────────────────────┘
                                │
                                ▼
                   services/route-optimizer/   ← this service
                   POST /v1/optimize
                   POST /v1/eta/train
                   GET  /v1/health
                                │
                                ▼
                   PostgreSQL  (Route + RouteStop)
                   RouteStop.sequence     ← optimised order written here
                   RouteStop.estimatedAt  ← per-stop ETAs written here
                   Route.optimizedAt      ← last run timestamp
                   Route.optimizationScore ← result metadata
```

---

## Data flow

**1. Create route**
```
POST /api/v1/routes
{ vehicleId, date, shipmentIds[] }
→ creates Route + RouteStop rows (one PICKUP + one DROPOFF per shipment)
```

**2. Trigger optimisation**
```
POST /api/v1/routes/:routeId/optimize
{ objective?, useEtaModel?, vehicleStart? }
→ 202 Accepted — job enqueued in BullMQ immediately
```

**3. Worker runs asynchronously**
```
Fetches Route + stops + shipment addresses
Extracts lat/lng from address JSON
Calls POST /v1/optimize on this service
Writes optimised sequence and ETAs back to RouteStop rows
Stamps Route.optimizedAt + Route.optimizationScore
```

**4. fauward-Go reads optimised route**
```
GET /api/v1/field/routes  →  stops ordered by sequence, with estimatedAt per stop
```

**5. ETA feedback loop**
```
Operator completes stop → RouteStop.arrivedAt recorded
POST /api/v1/routes/eta/train  (admin-triggered)
→ collects completed stops with coordinates → POST /v1/eta/train
→ Random Forest model retrained, improving future ETA predictions
```

---

## Algorithm

**Phase 1 — Nearest Neighbour**
Starting from the vehicle's GPS position, greedily picks the closest unvisited stop at each step. Fast initialisation at O(n²).

**Phase 2 — 2-opt improvement**
Iteratively reverses route segments to reduce total cost. Capped at 100 iterations — converges well within that for real-world route sizes.

**Objectives** (auto-selected from shipment service tier, overridable per request):

| Value | Tier default | Optimises |
|---|---|---|
| `MIN_TIME` | EXPRESS / OVERNIGHT | Fewest minutes door-to-door |
| `BALANCED` | STANDARD | Equal weight on distance and time |
| `MIN_DISTANCE` | ECONOMY | Fewest kilometres driven |

---

## ETA model

When no trained model is available (or `useEtaModel: false`), the service uses a **baseline model**: 35 km/h average speed with time-of-day adjustments (rush hour +30%, late night −15%).

When trained, a **Random Forest Regressor** (50 trees, max depth 10) replaces the baseline.

Features per leg:
- Distance (km) via Haversine
- Hour of day (sin/cos cyclical encoding)
- Day of week (one-hot, 7 features)
- Origin and destination coordinates

Minimum 10 completed trips with resolvable coordinates required to trigger training. The trained model persists to `/app/data/` (joblib) and loads automatically on startup.

### Seeding

A seed script generates synthetic UK delivery data to bootstrap the model before real operator data accumulates:

```bash
python scripts/seed_eta_training.py \
  --url https://fauward-production-e19b.up.railway.app \
  --rows 200
```

Generates realistic trips across London, Birmingham, Manchester, Leeds, Bristol, Heathrow, Gatwick and other UK hubs — time-of-day weighted with realistic speed variance.

---

## Address → coordinate mapping

Fauward stores shipment addresses as freeform JSON. The service extracts coordinates by looking for `lat`/`lng` or `latitude`/`longitude` keys. Stops without resolvable coordinates are skipped with a warning; the route still optimises over the remaining stops.

Geocoding is a planned enhancement — extraction is isolated in `routing.service.ts:extractCoords()` so a provider can be added without touching the rest of the module.

---

## API reference

### `GET /v1/health`
```json
{ "ok": true, "version": "1.0.0", "etaModelLoaded": true }
```

### `POST /v1/optimize`

```json
{
  "requestId": "uuid",
  "vehicle": {
    "start": { "lat": 51.5074, "lng": -0.1278 },
    "capacity": 1200.0
  },
  "constraints": {
    "maxStops": null,
    "maxKm": 150,
    "maxMinutes": 480
  },
  "stops": [
    {
      "id": "stop-uuid",
      "type": "PICKUP",
      "lat": 51.5155,
      "lng": -0.1426,
      "serviceMinutes": 5,
      "priority": "HIGH"
    }
  ],
  "options": {
    "objective": "BALANCED",
    "seed": 42,
    "explain": true,
    "useEtaModel": true
  }
}
```

Response includes `orderedStopIds[]`, per-leg `legs[]` with distance/duration/ETA, `totalDistanceKm`, `totalDurationMinutes`, `feasible`, `violations[]`, and optional `explain` breakdown.

### `POST /v1/eta/train`

```json
{
  "rows": [
    {
      "fromLat": 51.5074, "fromLng": -0.1278,
      "toLat":   51.5155, "toLng":   -0.1426,
      "departedAt": "2026-01-10T09:00:00",
      "arrivedAt":  "2026-01-10T09:22:00"
    }
  ]
}
```

---

## Fastify endpoints (backend)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/routes` | ADMIN, STAFF | Create route from shipment list |
| `POST` | `/api/v1/routes/:id/optimize` | ADMIN, STAFF | Enqueue optimisation |
| `GET` | `/api/v1/routes` | ADMIN, STAFF | List routes (filter by date, status) |
| `GET` | `/api/v1/routes/:id` | ADMIN, STAFF | Get route + ordered stops + ETAs |
| `PATCH` | `/api/v1/routes/:id/stops/:stopId/arrive` | Any authenticated | Mark stop arrival |
| `POST` | `/api/v1/routes/eta/train` | ADMIN | Retrain ETA model from completed stops |
| `GET` | `/api/v1/routes/health` | ADMIN | Optimizer health probe |

---

## File structure

```
services/route-optimizer/
├── app/
│   ├── main.py            FastAPI application — 3 endpoints
│   ├── schemas.py         Pydantic request/response models
│   ├── optimizer.py       Nearest-neighbour + 2-opt engine
│   ├── eta_model.py       Random Forest ETA predictor (sklearn)
│   └── utils.py           Haversine, time features, leg calculation
├── scripts/
│   └── seed_eta_training.py   Bootstrap ETA model with synthetic UK data
├── tests/
│   ├── conftest.py
│   ├── test_api.py        16 API tests
│   └── test_optimizer.py  9 algorithm tests
├── data/
│   └── .gitkeep           Model files written here at runtime (gitignored)
├── Dockerfile
├── railway.json
├── requirements.txt
└── README.md
```

---

## Schema changes applied

Two fields added to the `Route` Prisma model:

```prisma
optimizedAt       DateTime?   // timestamp of last successful optimisation
optimizationScore Json?       // { distanceKm, durationMinutes, feasible, violations }
```

---

## Backend files added / modified

```
apps/backend/
├── prisma/schema.prisma                    +optimizedAt, +optimizationScore on Route
├── src/config/index.ts                     +ROUTE_OPTIMIZER_URL env var
├── src/queues/queues.ts                    +routeOptimizationQueue
├── src/queues/route-optimization.worker.ts  new BullMQ async worker
├── src/modules/routing/
│   ├── routing.types.ts                    TypeScript mirror of Python schemas
│   ├── routing.service.ts                  HTTP client + coordinate extractor
│   └── routing.routes.ts                   7 Fastify endpoints
└── src/app.ts                              registers routing module + starts worker
```

---

## Running locally

```bash
cd services/route-optimizer
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Interactive docs at `http://localhost:8001/docs`.

```bash
# Run tests
python -m pytest tests/ -v   # 25 tests, all passing
```

---

## Deployment (Railway)

| | |
|---|---|
| **Public URL** | `https://fauward-production-e19b.up.railway.app` |
| **Internal URL** | `http://fauward-abf1.railway.internal:8080` |
| **Port** | 8080 (Railway-assigned via `$PORT`) |
| **Healthcheck** | `GET /v1/health` |

Set in the **backend** Railway service:
```
ROUTE_OPTIMIZER_URL=http://fauward-abf1.railway.internal:8080
```

---

## Performance

| Stops | Response time |
|---|---|
| 10 | < 0.1s |
| 50 | < 0.5s |
| 100 | < 1.5s |
| 200 | < 3.5s |
