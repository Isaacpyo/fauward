# Fauward Python Services

Python microservices for the Fauward logistics platform. This app provides a FastAPI HTTP gateway plus Celery workers for document generation, route optimization, analytics, OCR, notifications, pricing, customs compliance, and predictive ML.

The service is designed to run beside the existing Node.js/Fastify backend. Node writes operational records to Postgres and pushes jobs into Redis lists. Python workers consume those jobs, perform heavier compute/integration work, write results back to Postgres, and publish completion or failure events back to Redis.

## Contents

- [Architecture](#architecture)
- [Directory Layout](#directory-layout)
- [Runtime Requirements](#runtime-requirements)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Docker Compose](#docker-compose)
- [Authentication](#authentication)
- [Redis Queues](#redis-queues)
- [HTTP API](#http-api)
- [Feature Workers](#feature-workers)
- [Database Tables](#database-tables)
- [Storage](#storage)
- [ML Model Registry](#ml-model-registry)
- [Error Handling](#error-handling)
- [Node.js Backend Integration](#nodejs-backend-integration)
- [Verification](#verification)
- [Operational Notes](#operational-notes)

## Architecture

```text
Node.js backend
  |
  | lpush fauward:* queue payloads
  v
Redis
  |
  | brpop queue bridge in Celery worker process
  v
Celery workers
  |
  | compute, provider calls, PDFs, OCR, ML, uploads
  v
Postgres + Supabase Storage
  |
  | lpush fauward:*:done result events
  v
Redis completion queues

FastAPI gateway
  |
  | synchronous API endpoints for direct callers
  v
Redis queues + Postgres status reads
```

Main components:

- `main.py`: FastAPI app and router registration.
- `celery_app.py`: Celery app, queues, task routing, beat schedules, and Redis-list bridge startup.
- `db.py`: asyncpg pool, SQL helpers, API key validation, and service-owned table creation.
- `config.py`: pydantic-settings configuration loaded from `.env` and environment variables.
- `workers/`: async job handlers and Celery task wrappers.
- `api/`: FastAPI routers for synchronous endpoints.
- `lib/`: storage, Supabase, tax, HS lookup, logging, and model registry helpers.
- `templates/`: PDF, email, and customs XML templates.

## Directory Layout

```text
apps/python-services/
|-- Dockerfile
|-- README.md
|-- requirements.txt
|-- .env.example
|-- main.py
|-- celery_app.py
|-- db.py
|-- config.py
|-- api/
|   |-- analytics.py
|   |-- auth.py
|   |-- customs.py
|   |-- ml.py
|   |-- ocr.py
|   |-- pdf.py
|   |-- pricing.py
|   `-- routes.py
|-- workers/
|   |-- analytics_worker.py
|   |-- customs_worker.py
|   |-- ml_worker.py
|   |-- notifications_worker.py
|   |-- ocr_worker.py
|   |-- pdf_worker.py
|   |-- pricing_worker.py
|   `-- route_worker.py
|-- lib/
|   |-- data/
|   |   |-- duty_rates.json
|   |   `-- hs_codes.csv
|   |-- hs_lookup.py
|   |-- json_logging.py
|   |-- model_registry.py
|   |-- storage.py
|   |-- supabase_client.py
|   `-- tax_engine.py
`-- templates/
    |-- invoice.html
    |-- manifest.html
    |-- pod.html
    |-- shipping_label.html
    |-- customs/
    `-- email/
```

## Runtime Requirements

- Python 3.12
- Redis 7+
- Postgres 15+ or Supabase Postgres
- Tesseract OCR binary for OCR image processing
- WeasyPrint system libraries:
  - Cairo
  - Pango
  - GDK Pixbuf
  - libffi
  - shared MIME info
- Optional provider credentials:
  - Supabase Storage
  - SendGrid
  - Twilio

Python dependencies are pinned by minimum version in `requirements.txt`.

## Environment Variables

The service reads `.env` and normal process environment variables. Keep real secrets out of Git; use the tracked templates below as starting points.

| File | Purpose |
| --- | --- |
| `.env` | Ignored host-local env file used by `uvicorn` and `celery` when run from `apps/python-services`. |
| `env.local.example` | Host-local template using `localhost` Postgres and Redis. |
| `env.docker.local.example` | Docker Compose local template using container hostnames `postgres` and `redis`. |
| `env.production.example` | Production template for deployment secret managers or private host env files. |
| `.env.example` | Backward-compatible minimal example matching the original service scaffold. |

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes, unless `SUPABASE_DB_URL` is set | Postgres connection URL used by asyncpg. |
| `SUPABASE_DB_URL` | Alternative | Existing backend-style DB URL fallback. |
| `REDIS_URL` | Yes | Redis broker/backend URL. |
| `SUPABASE_URL` | Optional | Supabase project URL for Storage uploads. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Service-role key for Supabase Storage. |
| `SENDGRID_API_KEY` | Optional | Enables real email sending. |
| `TWILIO_ACCOUNT_SID` | Optional | Enables real SMS sending with token/from number. |
| `TWILIO_AUTH_TOKEN` | Optional | Twilio auth token. |
| `TWILIO_FROM` | Optional | Twilio sender number. |
| `OSRM_BASE_URL` | Optional | Defaults to `http://router.project-osrm.org`. |
| `PYTHON_QUEUE_LISTENERS_ENABLED` | Optional | Enables Redis-list bridge in workers. Defaults to `true`. |
| `PYTHON_LOCAL_STORAGE_DIR` | Optional | Local fallback storage directory. Defaults to `.storage`. |
| `PYTHON_DEFAULT_EMAIL_FROM` | Optional | SendGrid sender. Defaults to `no-reply@fauward.com`. |
| `LOG_LEVEL` | Optional | `DEBUG`, `INFO`, `WARNING`, or `ERROR`. Defaults to `INFO`. |

Host-local example:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fauward_dev
REDIS_URL=redis://localhost:6379/0
SUPABASE_URL=https://example.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SENDGRID_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
OSRM_BASE_URL=http://router.project-osrm.org
```

Docker Compose production deployments may set `PYTHON_DATABASE_URL` and `PYTHON_REDIS_URL`. The root `docker-compose.yml` maps those into the container's `DATABASE_URL` and `REDIS_URL`, which avoids accidentally inheriting backend-local values.

## Running Locally

Create the ignored local env file:

```powershell
Copy-Item apps\python-services\env.local.example apps\python-services\.env
```

Or use the helper script if your PowerShell execution policy allows local scripts:

```powershell
.\apps\python-services\scripts\setup-local-env.ps1
```

Then install and run from `apps/python-services`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Start the API:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Start workers:

```bash
celery -A celery_app worker --loglevel=info -Q pdf,routes,analytics,ocr,notifications,pricing,customs,ml
```

Start scheduled jobs:

```bash
celery -A celery_app beat --loglevel=info
```

## Docker Compose

The root `docker-compose.yml` contains:

- `python-api`: FastAPI gateway on port `8000`.
- `python-worker`: Celery worker for all feature queues.
- `python-beat`: Celery beat scheduler.

Run from the repo root:

```bash
docker compose --env-file apps/python-services/env.docker.local.example up --build python-api python-worker python-beat
```

The Docker image installs the required system packages for WeasyPrint, Tesseract, and python-magic.

For production Compose-style deployments, put the values from `env.production.example` into the deployment environment or a private env file, then run:

```bash
docker compose --env-file /secure/path/python-services.env up -d --build python-api python-worker python-beat
```

Recommended production split:

- `python-api`: `PYTHON_QUEUE_LISTENERS_ENABLED=false`
- `python-worker`: `PYTHON_QUEUE_LISTENERS_ENABLED=true`
- `python-beat`: `PYTHON_QUEUE_LISTENERS_ENABLED=false`

## Authentication

All FastAPI feature endpoints require a bearer token:

```http
Authorization: Bearer fw_...
```

Token validation:

- Hashes the raw token with SHA-256.
- Checks `api_keys.keyHash` for the main Prisma-backed schema.
- Falls back to `tenant_api_keys.key_hash` for the tenant-db/Supabase schema.
- Rejects inactive or expired keys.
- Updates `api_keys.lastUsed` when validating against `api_keys`.

Super-admin-only endpoints require one of these scopes:

- `super_admin`
- `super-admin`
- `admin:all`
- `platform:admin`

## Redis Queues

Workers consume Redis lists using blocking `brpop` through a queue bridge. The bridge forwards jobs into Celery queues so the worker can execute with Celery retry, routing, and scheduling semantics.

| Source Redis List | Celery Task | Celery Queue | Done Queue |
| --- | --- | --- | --- |
| `fauward:pdf:generate` | `workers.pdf_worker.process_pdf_job` | `pdf` | `fauward:pdf:done` |
| `fauward:routes:optimize` | `workers.route_worker.process_route_job` | `routes` | `fauward:routes:done` |
| `fauward:ocr:parse` | `workers.ocr_worker.process_ocr_job` | `ocr` | `fauward:ocr:done` |
| `fauward:notifications:send` | `workers.notifications_worker.process_notification_job` | `notifications` | `fauward:notifications:done` |
| `fauward:customs:generate` | `workers.customs_worker.process_customs_job` | `customs` | `fauward:customs:done` |
| `fauward:pricing:quote` | `workers.pricing_worker.process_pricing_job` | `pricing` | `fauward:pricing:done` |
| `fauward:ml:score` | `workers.ml_worker.process_ml_score_job` | `ml` | `fauward:ml:done` |

Successful completion event shape:

```json
{
  "jobId": "uuid",
  "status": "READY",
  "worker": "pdf_worker",
  "url": "https://..."
}
```

Failure event shape:

```json
{
  "jobId": "uuid",
  "status": "FAILED",
  "worker": "pdf_worker",
  "error": "message"
}
```

## HTTP API

### Health

```http
GET /health
```

Response:

```json
{ "status": "ok" }
```

### PDF

```http
POST /pdf/generate
GET /pdf/status/{jobId}
```

Generate payload:

```json
{
  "jobId": "uuid",
  "tenantId": "uuid",
  "type": "invoice",
  "shipmentId": "uuid",
  "data": {
    "invoiceNumber": "INV-1001",
    "lineItems": [
      { "description": "Shipment", "qty": 1, "unitPrice": 25.0 }
    ],
    "subtotal": 25.0,
    "vat": 5.0,
    "total": 30.0,
    "currency": "GBP"
  }
}
```

Supported `type` values:

- `invoice`
- `shipping_label`
- `pod`
- `manifest`

### Routes

```http
POST /routes/optimize
GET /routes/{jobId}
```

Optimize payload:

```json
{
  "jobId": "uuid",
  "tenantId": "uuid",
  "vehicleId": "uuid",
  "depot": { "lat": 51.5, "lng": -0.1 },
  "stops": [
    {
      "shipmentId": "uuid",
      "lat": 51.52,
      "lng": -0.09,
      "timeWindowStart": "09:00",
      "timeWindowEnd": "12:00",
      "weightKg": 5.2
    }
  ],
  "vehicleCapacityKg": 500
}
```

### Analytics

```http
GET /analytics/summary?tenantId=&dateFrom=&dateTo=
GET /analytics/cohorts?tenantId=
GET /analytics/churn-risk
```

`/analytics/churn-risk` is super-admin only.

Summary response:

```json
{
  "shipmentsTotal": 10,
  "onTimeRate": 91.5,
  "revenueTotal": 1200.0,
  "avgDeliveryHours": 24.5,
  "dailySeries": [
    { "date": "2026-01-01", "shipments": 4, "revenue": 410.0 }
  ]
}
```

### OCR

```http
POST /ocr/parse
GET /ocr/result/{jobId}
```

`POST /ocr/parse` accepts either JSON:

```json
{
  "jobId": "uuid",
  "tenantId": "uuid",
  "documentType": "customs_form",
  "fileUrl": "https://..."
}
```

or multipart form data:

- `file`
- `tenantId`
- `documentType`
- `jobId` optional

Supported document types:

- `return_auth`
- `customs_form`
- `bill_of_lading`
- `pod_photo`

### Pricing

```http
POST /pricing/quote
```

Payload:

```json
{
  "tenantId": "uuid",
  "originPostcode": "SW1A 1AA",
  "destPostcode": "M1 1AE",
  "weightKg": 12.5,
  "promoCode": "SAVE10"
}
```

Response:

```json
{
  "base": 20.63,
  "surcharges": [
    { "name": "Medium parcel", "amount": 5.63, "type": "weight" }
  ],
  "promoDiscount": 0.0,
  "total": 26.26,
  "currency": "GBP",
  "demandSignal": "NORMAL",
  "acceptanceProbability": 0.72
}
```

### Customs

```http
POST /customs/hs-lookup?description=laptop+charger
POST /customs/duty-estimate
POST /customs/declaration
```

Duty estimate payload:

```json
{
  "originCountry": "US",
  "destCountry": "UK",
  "hsCode": "850110",
  "declaredValue": 100,
  "currency": "GBP"
}
```

Declaration payload:

```json
{
  "jobId": "uuid",
  "tenantId": "uuid",
  "shipmentId": "uuid",
  "declarationType": "uk_cds",
  "shipmentData": {
    "senderName": "Sender Ltd",
    "recipientName": "Buyer Ltd",
    "originCountry": "US",
    "destCountry": "GB",
    "currency": "GBP",
    "items": [
      { "description": "Laptop charger", "hsCode": "850110", "quantity": 1, "declaredValue": 100 }
    ]
  }
}
```

Supported declaration types:

- `uk_cds`
- `eu_aes`

### ML

```http
GET /ml/shipment-risk/{shipmentId}
GET /ml/churn-risk/{tenantId}
GET /ml/predictions/{tenantId}
GET /ml/leads
POST /ml/retrain/{modelName}
```

`POST /ml/retrain/{modelName}` is super-admin only.

Supported model names:

- `delivery_delay`
- `tenant_churn`
- `lead_score`

## Feature Workers

### Feature 1: PDF Generation

Files:

- `workers/pdf_worker.py`
- `api/pdf.py`
- `templates/invoice.html`
- `templates/shipping_label.html`
- `templates/pod.html`
- `templates/manifest.html`

Behavior:

- Loads tenant branding from `tenants`.
- Renders Jinja2 HTML templates.
- Generates shipping-label QR codes with `qrcode`.
- Converts HTML to PDF with WeasyPrint.
- Uploads PDFs to Supabase Storage bucket `documents`, or local fallback storage.
- Upserts status into `documents`.
- Attempts to update matching `shipment_documents.fileUrl`.
- Publishes completion or failure events.

### Feature 2: Route Optimization

Files:

- `workers/route_worker.py`
- `api/routes.py`

Behavior:

- Calls OSRM table API for duration and distance matrices.
- Falls back to haversine distance if OSRM is unavailable.
- Uses OR-Tools VRP solver for single-vehicle route ordering.
- Applies vehicle capacity and stop time windows.
- Stores ordered stops, total distance, and estimated duration in `route_jobs`.

### Feature 3: Analytics Batch Processing

Files:

- `workers/analytics_worker.py`
- `api/analytics.py`

Celery beat schedule:

- Nightly rollup at 02:00 UTC.
- Realtime KPIs hourly.
- Cohort analysis weekly on Sunday at 02:30 UTC.
- Churn signals daily at 02:45 UTC.

Behavior:

- Aggregates shipments, delivery success, on-time rate, revenue, delivery hours, new customers, and active drivers.
- Stores daily aggregates in `analytics_snapshots`.
- Stores cohort metrics in `cohort_metrics`.
- Caches 24-hour KPI payloads in Redis keys `analytics:kpi:{tenantId}` with 5-minute TTL.
- Adds `tenants.churnRisk` defensively if missing and flags inactive tenants as `AT_RISK`.

### Feature 4: Document OCR

Files:

- `workers/ocr_worker.py`
- `api/ocr.py`

Behavior:

- Downloads remote files or reads local `file://` URLs.
- Detects PDFs, images, or text files.
- Extracts PDF text with `pdfplumber`.
- Extracts image text with Tesseract.
- Parses fields using document-type regex patterns.
- Stores results in `parsed_documents`.

### Feature 5: Notifications

Files:

- `workers/notifications_worker.py`
- `templates/email/*.html`

Behavior:

- Loads tenant branding from `tenants`.
- Renders email templates with Jinja2.
- Inlines CSS with Premailer.
- Adds RTL direction for Arabic locale.
- Sends email through SendGrid when configured.
- Sends SMS through Twilio when configured.
- Logs delivery attempts in `notification_logs`.
- Retries provider failures up to 3 times with exponential backoff.

If provider credentials are missing, the worker records a skipped provider reference such as `sendgrid:not-configured` or `twilio:not-configured`.

### Feature 6: Dynamic Pricing

Files:

- `workers/pricing_worker.py`
- `api/pricing.py`

Behavior:

- Loads base rate from `rate_cards`.
- Computes weight surcharges.
- Applies enabled tenant surcharges.
- Checks optional `remote_zones` if present.
- Validates and applies `promo_codes`.
- Reads demand signal from Redis key `pricing:demand:{origin}:{dest}`.
- Predicts quote acceptance with a persisted logistic regression model when available.
- Provides a heuristic fallback when the model is unavailable.

Scheduled tasks:

- Hourly `refresh_demand_signals`.
- Weekly `retrain_pricing_model`.

### Feature 7: Customs and Compliance

Files:

- `workers/customs_worker.py`
- `api/customs.py`
- `lib/hs_lookup.py`
- `lib/tax_engine.py`
- `lib/data/hs_codes.csv`
- `lib/data/duty_rates.json`
- `templates/customs/*.xml.j2`

Behavior:

- Looks up HS codes using fuzzy matching against bundled CSV data.
- Caches HS lookup results in Redis.
- Estimates duty, VAT, and total landed cost for UK, EU, US, UAE, and NG rate tables.
- Renders UK CDS or EU AES XML declarations.
- Validates XML against a minimal declaration schema.
- Uploads declaration XML to storage.
- Updates `customs_declarations`.

### Feature 8: Predictive ML

Files:

- `workers/ml_worker.py`
- `api/ml.py`
- `lib/model_registry.py`

Models:

- `delivery_delay`: XGBoost when available, RandomForest fallback.
- `tenant_churn`: LogisticRegression with balanced class weights.
- `lead_score`: RandomForestClassifier.

Scheduled tasks:

- `train_delay_model`: Sundays 03:00 UTC.
- `train_churn_model`: Sundays 03:30 UTC.
- `train_lead_model`: Sundays 04:00 UTC.
- `score_all_shipments`: hourly.
- `score_all_tenants`: daily 06:00 UTC.
- `score_all_leads`: daily 06:30 UTC.

Model artifacts are persisted to storage under:

```text
models/{model_name}/v{timestamp}.pkl
```

Predictions are stored in `prediction_results`.

## Database Tables

The service uses existing Fauward tables when available:

- `tenants`
- `shipments`
- `shipment_documents`
- `rate_cards`
- `surcharges`
- `promo_codes`
- `quotes`
- `leads`
- `invoices`
- `support_tickets`
- `api_keys`
- `tenant_api_keys`
- `notification_logs`

The service also creates these support tables on startup if missing:

- `error_logs`
- `documents`
- `route_jobs`
- `analytics_snapshots`
- `cohort_metrics`
- `parsed_documents`
- `customs_declarations`
- `prediction_results`

Table creation happens in `db.ensure_service_tables()`, called during DB connection startup.

## Storage

Storage helper:

- `lib/storage.py`
- `lib/supabase_client.py`

Upload strategy:

1. If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured, upload to Supabase Storage.
2. If Supabase upload fails or is not configured, write to local fallback storage under `PYTHON_LOCAL_STORAGE_DIR`.
3. Return either a Supabase public URL or a local `file://` URI.

Buckets used:

- `documents`: PDFs, uploaded OCR files, customs XML.
- `models`: ML model artifacts.

## ML Model Registry

`lib/model_registry.py` provides:

- `load_latest(model_name)`
- `save(model_name, artifact)`
- in-memory model cache

Artifacts are serialized with `joblib`.

Each saved artifact should be a dictionary containing:

```python
{
    "model": trained_model,
    "feature_columns": ["column_a", "column_b"]
}
```

## Error Handling

All queue workers use the shared runner in `workers/__init__.py`.

On failure:

- The exception is logged with structured JSON logging.
- A row is inserted into `error_logs`.
- The job status is marked `FAILED` where a status table exists.
- A failure event is pushed to the relevant done queue.
- Celery sees the exception and can apply task retry behavior where configured.

The notification worker additionally retries provider errors up to 3 times.

## Node.js Backend Integration

The Node backend can publish jobs directly to Redis lists with `lpush`.

Example:

```ts
await redis.lpush(
  'fauward:pdf:generate',
  JSON.stringify({ jobId, tenantId, type, shipmentId, data })
);
```

A helper exists in the backend:

```ts
import { publishPythonServiceJob } from '../../queues/python-services.js';
```

Current integration points:

- Invoice document generation publishes `fauward:pdf:generate`.
- Supported email templates publish `fauward:notifications:send`.

Additional Node modules can use the same helper for:

- `fauward:routes:optimize`
- `fauward:ocr:parse`
- `fauward:customs:generate`
- `fauward:pricing:quote`
- `fauward:ml:score`

## Verification

Basic source checks:

```bash
python -m compileall apps\python-services
docker compose config --quiet
npm.cmd run build --workspace=apps/backend
```

Runtime smoke checks:

```bash
curl http://localhost:8000/health
```

Authenticated endpoint example:

```bash
curl -H "Authorization: Bearer fw_xxx" \
  "http://localhost:8000/analytics/summary?tenantId=TENANT_ID"
```

Queue smoke test:

```bash
redis-cli LPUSH fauward:pdf:generate '{"jobId":"test-job","tenantId":"tenant-id","type":"manifest","shipmentId":"shipment-id","data":{"stops":[]}}'
redis-cli BRPOP fauward:pdf:done 30
```

## Operational Notes

- Keep `PYTHON_QUEUE_LISTENERS_ENABLED=true` for worker deployments that should consume Redis list jobs.
- Set it to `false` for beat-only processes if list consumption should never start there.
- The API process does not start the queue bridge.
- Celery broker and result backend both use `REDIS_URL`.
- All logs are JSON-formatted via Python `logging`.
- Avoid `print()` in service code.
- OCR requires Tesseract to be installed in the runtime environment.
- WeasyPrint requires native rendering libraries; prefer the provided Dockerfile for deployment.
- OSRM public routing is suitable for development, but production should use a controlled OSRM endpoint.
- Supabase Storage public URLs assume bucket policies allow public reads. If private buckets are required, add signed URL generation before exposing document links.
