# Fauward Python Services

FastAPI and Celery services for the Fauward logistics platform.

This service handles compute-heavy and integration-heavy workflows that sit beside the main Node.js backend:

- PDF generation for invoices, labels, PODs, and manifests
- Invoicing domain core for first-class financial documents
- OCR parsing for logistics documents
- Route optimisation
- Customs HS lookup, landed-cost estimates, and declaration draft generation
- Pricing quote evaluation
- Tenant analytics and live KPI streams
- Predictive ML scoring and retraining orchestration
- Queue, worker, and operational monitoring

The current implementation has been refactored toward a layered service layout:

```text
api -> schemas -> services -> repositories/db or SQLAlchemy -> workers/outbox
```

Routes are kept stable where possible, while job IDs, tenant access, queue publishing, status lookups, and sensitive responses have been hardened for production use.

## Documentation

- [Technical Guide](TECHNICAL.md): architecture, security, API details, workers, migrations, and operations.
- [API Reference](docs/api-reference.md): route-by-route request and response details.
- [Security and Tenant Isolation](docs/security.md): auth, scopes, tenant boundaries, and safe errors.
- [Workers and Queues](docs/workers-and-queues.md): Redis lists, Celery routing, job lifecycle, and failure handling.
- [Database and Migrations](docs/database-and-migrations.md): service tables, indexes, and migration notes.
- [Operations](docs/operations.md): local development, deployment, health checks, metrics, and test commands.

## Public Capabilities

### Document Automation

Generate tenant-scoped PDFs from trusted shipment data. The API supports:

- `invoice`
- `shipping_label`
- `pod`
- `manifest`

PDF jobs are queued server-side, status is tenant-scoped, and completed PDFs are downloaded through an authorized endpoint.

### Invoicing Domain Core

Phase 1 of the invoicing subsystem is implemented as a parallel backend module. It does not change the legacy `/pdf` shipment-document flow.

The domain core provides:

- tax-ready Pydantic schemas for invoices, money, addresses, line items, and tax breakdowns
- SQLAlchemy models and Alembic migration for invoice tables
- gapless per-tenant/fiscal-year numbering at issue time
- immutable issued invoices with SHA-256 content hashes
- append-only `invoice_events`
- invoice-specific `outbox` rows for later render/email/webhook workers

HTTP invoice routes are intentionally not exposed until the API phase.

### OCR

Parse return authorisations, customs forms, bills of lading, and POD images. Uploads are validated for tenant access, file size, MIME type, filename safety, and trusted storage URLs before queueing.

### Route Optimisation

Optimise delivery stops using shipment IDs that belong to the authenticated tenant. Route jobs validate coordinates, stop count, duplicate shipments, weight limits, vehicle ownership, capacity, and time windows.

### Customs

Support customs workflows without automatically submitting to external customs systems:

- HS code lookup
- Duty and VAT estimates
- UK CDS / EU AES declaration draft jobs
- Tenant-scoped declaration status polling

### Pricing

Generate tenant-safe quotes from normalized postcode, weight, and promo-code input. The API returns customer-safe pricing output without exposing internal margin, cost-floor, or rule internals.

### Analytics

Provide tenant-scoped dashboard data:

- 30-day default summaries with bounded date ranges
- Weighted delivery and on-time metrics
- Cohort metrics with stable nested response shape
- Live Server-Sent Events KPI stream with Redis fallback handling
- Super-admin churn-risk analytics

### ML

Expose tenant-safe prediction lookups, lead scores, model status, feedback, advisory recommendations, and super-admin retrain orchestration. Retrain requests return Celery task IDs; the service does not fake production model training.

### Operations

Internal monitoring endpoints expose queue depths only to super admins or platform/ops metrics keys. Health endpoints are available for orchestrators:

- `GET /health/live`
- `GET /health/ready`

## Quick Start

From `services/python-services`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Create local environment values:

```powershell
Copy-Item env.local.example .env
```

Start the API:

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Start workers:

```powershell
celery -A celery_app worker --loglevel=info -Q pdf,routes,analytics,ocr,notifications,pricing,customs,ml
```

Run tests:

```powershell
pytest tests
```

## Runtime Requirements

- Python 3.12+
- Redis 7+
- Postgres 15+ or Supabase Postgres
- Tesseract OCR binary for image OCR
- WeasyPrint native dependencies for PDF rendering
- Optional Supabase Storage, SendGrid, and Twilio credentials

## API Overview

Public route prefixes:

```text
/analytics
/customs
/health
/metrics
/ml
/ocr
/pdf
/pricing
/routes
```

All feature endpoints require `Authorization: Bearer <token>` except public health checks. Platform operational metrics require super-admin or ops metrics privileges.

## Security Defaults

- API keys are validated using hashed token lookup.
- Scopes are normalized and immutable in auth context.
- Super-admin privileges require platform/admin key type when available.
- Normal tenants only operate inside `auth.tenant_id`.
- Cross-tenant guessed job IDs return `404`, not `403`.
- Client-supplied job IDs are ignored for tenant-facing job creation.
- Queue publish failures mark jobs `FAILED` instead of leaving them stuck in `QUEUED`.
- Normal tenants receive safe error messages, not provider traces or stack traces.

See [Security and Tenant Isolation](docs/security.md) for details.

## Repository Layout

```text
services/python-services/
  api/             FastAPI routers and dependencies
  core/            shared config, logging, errors, security, telemetry, rate-limit helpers
  models/          legacy Pydantic schema modules plus SQLAlchemy ORM models
  schemas/         API request/response schemas
  services/        business logic, queueing, tenant checks, audit, storage, invoicing
  repositories/    parameterized SQL wrappers
  workers/         Celery workers and Redis-list bridge
  migrations/      idempotent SQL and Alembic migrations
  lib/             storage, tax, HS lookup, model registry, provider helpers
  templates/       PDF, email, SMS, and customs templates
  tests/           pytest suites
```

## Deployment Notes

The API, worker, and beat processes can run separately:

- API: `uvicorn main:app`
- Worker: `celery -A celery_app worker ...`
- Scheduler: `celery -A celery_app beat ...`

For production, run migrations before deploying, keep API queue listeners disabled, and use private environment management for secrets. See [Operations](docs/operations.md).
