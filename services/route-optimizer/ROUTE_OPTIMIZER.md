# Route Optimizer

Fauward's route optimization microservice. Runs as a standalone Python/FastAPI process and is called by the Fastify backend via HTTP.

## What it does

Given a set of delivery/pickup stops, the service returns an ordered stop sequence with per-stop ETAs that minimises total distance, total time, or both. It runs in under 3 seconds for up to 200 stops.

It also exposes an ETA training endpoint. As fauward-Go field operators complete stops and their actual arrival times are recorded, those data points are fed back to train a Random Forest model that progressively improves ETA accuracy for that tenant's typical routes.

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
                   RouteStop.sequence  ← optimized order
                   RouteStop.estimatedAt ← per-stop ETAs
                   Route.optimizedAt   ← last run timestamp
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

**2. Trigger optimization**
```
POST /api/v1/routes/:routeId/optimize
{ objective?, useEtaModel?, vehicleStart? }
→ 202 Accepted — job enqueued in BullMQ
```

**3. Worker runs asynchronously**
```
Fetches Route + stops + shipment addresses
Extracts lat/lng from address JSON
Calls POST /v1/optimize on this service
Writes back optimized sequence and ETAs to RouteStop rows
Stamps Route.optimizedAt + Route.optimizationScore
```

**4. fauward-Go reads optimized route**
```
GET /api/v1/field/routes  →  stops ordered by sequence, with estimatedAt per stop
```

**5. ETA feedback loop**
```
Field operator completes stop → RouteStop.arrivedAt recorded
POST /api/v1/routes/eta/train  (admin-triggered)
→ collects completed stops with coordinates → POST /v1/eta/train
→ Random Forest model retrained, improving future ETA predictions
```

---

## Algorithm

**Phase 1 — Nearest-Neighbour**
Starting from the vehicle's position, greedily picks the closest unvisited stop until all stops are visited. O(n²) — fast for any realistic route size.

**Phase 2 — 2-opt improvement**
Iteratively reverses route segments if doing so reduces total cost. Capped at 100 iterations. Converges well within the cap for ≤ 200 stops.

**Objectives**
| Value | Optimises |
|---|---|
| `MIN_DISTANCE` | fewest kilometres driven |
| `MIN_TIME` | fewest minutes (includes service time per stop) |
| `BALANCED` (default) | weighted combination — 1 km ≈ 2 min |

Service tier → objective mapping (automatic, overridable):
- `EXPRESS` / `OVERNIGHT` → `MIN_TIME`
- `STANDARD` → `BALANCED`
- `ECONOMY` → `MIN_DISTANCE`

---

## ETA model

When no trained model is available (or `useEtaModel: false`), the service uses a baseline model: 35 km/h average speed with time-of-day adjustments (rush hour +30 %, late night −15 %).

When trained, a **Random Forest Regressor** (50 trees, max depth 10) replaces the baseline. Features: distance, hour-of-day (cyclic sin/cos encoding), day-of-week (one-hot), origin/destination coordinates.

Minimum 10 completed stops with resolvable coordinates required to trigger training.

---

## Address → coordinate mapping

Fauward stores shipment addresses as freeform JSON. The service extracts coordinates by looking for `lat`/`lng` or `latitude`/`longitude` keys. Stops without resolvable coordinates are skipped with a warning; the route still optimises over the remaining stops.

Geocoding is a planned enhancement — the extraction is isolated in `routing.service.ts:extractCoords()` so a geocoding provider can be dropped in without touching the rest of the module.

---

## API reference (this service)

### `GET /v1/health`
```json
{ "ok": true, "version": "1.0.0", "etaModelLoaded": false }
```

### `POST /v1/optimize`
```json
{
  "requestId": "string",
  "vehicle": { "start": { "lat": 0, "lng": 0 }, "capacity": null },
  "constraints": { "maxStops": null, "maxKm": null, "maxMinutes": null },
  "stops": [
    { "id": "uuid", "type": "PICKUP|DROPOFF", "lat": 0, "lng": 0,
      "serviceMinutes": 5, "priority": "NORMAL|HIGH|LOW" }
  ],
  "options": { "objective": "BALANCED", "seed": 42, "explain": false, "useEtaModel": true }
}
```
Response includes `orderedStopIds[]`, per-stop `legs[]` with ETAs, `totalDistanceKm`, `totalDurationMinutes`, `feasible`, `violations[]`.

### `POST /v1/eta/train`
```json
{ "rows": [{ "fromLat": 0, "fromLng": 0, "toLat": 0, "toLng": 0,
             "departedAt": "ISO8601", "arrivedAt": "ISO8601" }] }
```

---

## Fastify endpoints added

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/routes` | ADMIN, STAFF | Create route from shipment list |
| `POST` | `/api/v1/routes/:id/optimize` | ADMIN, STAFF | Enqueue optimization |
| `GET` | `/api/v1/routes` | ADMIN, STAFF | List routes (filterable by date, status) |
| `GET` | `/api/v1/routes/:id` | ADMIN, STAFF | Get route + ordered stops + ETAs |
| `PATCH` | `/api/v1/routes/:id/stops/:stopId/arrive` | Any authenticated | Mark stop arrival |
| `POST` | `/api/v1/routes/eta/train` | ADMIN | Retrain ETA model |
| `GET` | `/api/v1/routes/health` | ADMIN | Optimizer service health probe |

---

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `ROUTE_OPTIMIZER_URL` | `http://localhost:8001` | URL of this Python service |

---

## Running locally

```bash
# From services/route-optimizer/
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Tests
python -m pytest tests/ -v
```

## Deploying on Railway

Set `ROUTE_OPTIMIZER_URL` in the backend Railway service to point at the Python service's Railway domain (e.g. `https://route-optimizer.up.railway.app`).

The `railway.json` in this directory is pre-configured for Railway's Dockerfile builder.

---

## Schema changes

Two fields added to the `Route` model:

```prisma
optimizedAt       DateTime?   // timestamp of last successful optimization
optimizationScore Json?       // { distanceKm, durationMinutes, feasible, violations }
```

Run `npm run prisma:migrate --workspace=apps/backend` to apply.

---

## Files added / modified

```
services/route-optimizer/         ← new Python microservice
├── app/main.py                   FastAPI application
├── app/schemas.py                Pydantic request/response models
├── app/optimizer.py              Nearest-neighbour + 2-opt engine
├── app/eta_model.py              Random Forest ETA predictor
├── app/utils.py                  Haversine, time features, leg calculation
├── tests/                        25 pytest tests (100% pass)
├── Dockerfile
├── requirements.txt
└── railway.json

apps/backend/
├── prisma/schema.prisma          +optimizedAt, +optimizationScore on Route
├── src/config/index.ts           +ROUTE_OPTIMIZER_URL
├── src/queues/queues.ts          +routeOptimizationQueue
├── src/queues/route-optimization.worker.ts   new BullMQ worker
├── src/modules/routing/
│   ├── routing.types.ts          TypeScript mirror of Python schemas
│   ├── routing.service.ts        HTTP client + coordinate extractor
│   └── routing.routes.ts         7 Fastify endpoints
└── src/app.ts                    registers routing module + worker
```
