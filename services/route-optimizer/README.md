# Fauward Route Optimizer

A standalone Python microservice that provides intelligent route planning and ML-based ETA prediction for the Fauward logistics platform.

## Overview

Field operators using fauward-Go are assigned multiple shipment stops per day. This service takes those stops and returns an optimised visit order with per-stop ETAs — minimising total distance, total time, or both depending on the shipment service tier.

The service runs independently of the Node.js backend and is called over HTTP via BullMQ workers. It requires no database connection of its own.

---

## What was built

### Algorithm

Two-phase heuristic optimisation:

**Phase 1 — Nearest Neighbour**
Starts from the vehicle's current GPS position and greedily picks the closest unvisited stop at each step. Fast initialisation at O(n²).

**Phase 2 — 2-opt improvement**
Iteratively reverses route segments to reduce total cost. Capped at 100 iterations, typically converges well within that for real-world route sizes (≤ 200 stops in under 3 seconds).

**Objectives** (auto-selected from shipment service tier, overridable):

| Tier | Objective | Optimises |
|---|---|---|
| EXPRESS / OVERNIGHT | MIN_TIME | Fewest minutes door-to-door |
| STANDARD | BALANCED | Equal weight on distance and time |
| ECONOMY | MIN_DISTANCE | Fewest kilometres driven |

### ML ETA model

When field operators complete stops, actual arrival times are recorded. These feed a **Random Forest Regressor** that learns travel time patterns specific to the tenant's operating area.

Features used per leg:
- Distance (km) via Haversine
- Hour of day (sin/cos cyclical encoding)
- Day of week (one-hot, 7 features)
- Origin and destination coordinates

Before enough real data exists, the service falls back to a baseline model: 35 km/h average with time-of-day adjustments (rush hour +30%, late night −15%).

Training requires a minimum of 10 completed trips with resolvable coordinates. The trained model is persisted to `/app/data/` (joblib format) and loaded automatically on startup.

### Seeding

A seed script generates synthetic UK delivery data to bootstrap the model before real operator data accumulates:

```bash
python scripts/seed_eta_training.py \
  --url https://fauward-production-e19b.up.railway.app \
  --rows 200
```

The script generates realistic trips across London, Birmingham, Manchester, Leeds, Bristol, Heathrow, Gatwick and other UK hubs with time-of-day weighted departure times and realistic speed variance.

---

## API endpoints

### `GET /v1/health`
Returns service status and whether the ETA model is trained and loaded.

```json
{ "ok": true, "version": "1.0.0", "etaModelLoaded": true }
```

### `POST /v1/optimize`
Optimises a route and returns an ordered stop sequence with per-stop ETAs.

**Request:**
```json
{
  "requestId": "uuid",
  "vehicle": {
    "start": { "lat": 51.5074, "lng": -0.1278 },
    "capacity": 1200.0
  },
  "constraints": {
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

**Response includes:**
- `orderedStopIds` — stop IDs in optimised visit order
- `legs` — per-leg distance, duration, and ETA timestamp
- `totalDistanceKm` / `totalDurationMinutes`
- `feasible` — whether all constraints are satisfied
- `violations` — list of constraint violations if any
- `explain` — algorithm notes and score breakdown (when requested)

### `POST /v1/eta/train`
Trains the ETA model on historical trip data.

```json
{
  "rows": [
    {
      "fromLat": 51.5074, "fromLng": -0.1278,
      "toLat": 51.5155,   "toLng": -0.1426,
      "departedAt": "2026-01-10T09:00:00",
      "arrivedAt":  "2026-01-10T09:22:00"
    }
  ]
}
```

Minimum 10 rows required. Invalid samples (duration > 24h, distance < 100m) are filtered automatically.

---

## Integration with Fauward backend

The backend connects via BullMQ (async) and direct HTTP (sync for health/training).

**Flow:**
1. Admin creates a route via `POST /api/v1/routes` (groups shipments by date)
2. Admin triggers optimisation via `POST /api/v1/routes/:id/optimize`
3. Backend enqueues a BullMQ job — returns `202 Accepted` immediately
4. Worker picks up the job, extracts stop coordinates from shipment addresses, calls this service
5. Optimised sequence and ETAs are written back to `RouteStop.sequence` and `RouteStop.estimatedAt`
6. fauward-Go reads the ordered stops via `GET /api/v1/field/routes`

**Vehicle start position:** the caller passes `vehicleStart` coordinates (fauward-Go sends live GPS via `POST /field/location`). Falls back to first stop's coordinates if not provided.

**Environment variable required in backend:**
```
ROUTE_OPTIMIZER_URL=http://fauward-abf1.railway.internal:8080
```

---

## File structure

```
services/route-optimizer/
├── app/
│   ├── main.py          FastAPI application — 3 endpoints
│   ├── schemas.py       Pydantic request/response models
│   ├── optimizer.py     Nearest-neighbour + 2-opt engine
│   ├── eta_model.py     Random Forest ETA predictor (sklearn)
│   └── utils.py         Haversine, time features, leg calculation
├── scripts/
│   └── seed_eta_training.py   Bootstrap ETA model with synthetic UK data
├── tests/
│   ├── conftest.py
│   ├── test_api.py      16 API tests
│   └── test_optimizer.py   9 algorithm tests
├── data/
│   └── .gitkeep         Model files written here at runtime (gitignored)
├── Dockerfile
├── railway.json
├── requirements.txt
└── README.md
```

---

## Running locally

```bash
cd services/route-optimizer
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Interactive docs available at `http://localhost:8001/docs`.

## Running tests

```bash
cd services/route-optimizer
python -m pytest tests/ -v
```

25 tests, all passing.

---

## Deployment

Deployed on Railway as a standalone service in the Fauward project.

- Public URL: `https://fauward-production-e19b.up.railway.app`
- Internal URL: `http://fauward-abf1.railway.internal:8080` (used by backend)
- Healthcheck: `GET /v1/health`
- Port: 8080 (Railway-assigned via `$PORT`)

The backend service must have `ROUTE_OPTIMIZER_URL` pointing to the internal URL for private network communication.

---

## Performance

| Stops | Response time |
|---|---|
| 10 | < 0.1s |
| 50 | < 0.5s |
| 100 | < 1.5s |
| 200 | < 3.5s |

Tested on Railway's standard compute tier.
