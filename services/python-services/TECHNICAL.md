# Fauward Python Services Technical Guide

This guide is the technical entry point for maintainers of `services/python-services`.

The service is a FastAPI gateway plus Celery worker system. It integrates with Postgres, Redis, storage, PDF rendering, OCR libraries, route optimisation, customs helpers, pricing logic, analytics rollups, ML model scoring, and the Phase 1 invoicing domain core.

## Deep-Dive Documents

- [Architecture](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Security and Tenant Isolation](docs/security.md)
- [Workers and Queues](docs/workers-and-queues.md)
- [Database and Migrations](docs/database-and-migrations.md)
- [Operations](docs/operations.md)

## Current Structure

```text
python-services/
  api/
    deps.py
    health.py
    analytics.py
    auth.py
    customs.py
    metrics.py
    ml.py
    ocr.py
    pdf.py
    pricing.py
    routes.py

  core/
    config.py
    logging.py
    errors.py
    security.py
    telemetry.py
    rate_limit.py

  schemas/
    analytics.py
    customs.py
    ml.py
    ocr.py
    pdf.py
    pricing.py
    routes.py

  models/
    base.py
    invoicing.py

  services/
    invoicing/
      database.py
      numbering.py
      repository.py
      schemas.py
      state.py
    tenant_access.py
    audit_service.py
    job_service.py
    analytics_service.py
    customs_service.py
    customs_declarations.py
    ml_service.py
    ml_feedback.py
    ml_models.py
    ml_predictions.py
    ml_recommendations.py
    ocr_service.py
    pdf_service.py
    pdf_jobs.py
    pricing_service.py
    queue_metrics.py
    route_service.py
    route_jobs.py
    storage_service.py

  repositories/
    analytics.py
    audit_logs.py
    customs_declarations.py
    documents.py
    parsed_documents.py
    predictions.py
    route_jobs.py
    shipments.py
    tenants.py

  workers/
    analytics_worker.py
    customs_worker.py
    ml_worker.py
    notifications_worker.py
    ocr_worker.py
    pdf_worker.py
    pricing_worker.py
    route_worker.py

  migrations/
    env.py
    versions/
      0002_invoicing_phase1.py

  alembic.ini
  main.py
  db.py
  celery_app.py
```

Some legacy module names remain intentionally for backward compatibility:

- Existing route imports still work.
- `models/*_schemas.py` remains as the original schema location; `schemas/*.py` re-exports or adds current API schemas.
- `services/pdf_jobs.py`, `services/customs_declarations.py`, and `services/route_jobs.py` remain; `pdf_service.py`, `customs_service.py`, and `route_service.py` are compatibility entry points.
- `workers/route_worker.py` remains because Celery task names and queue routing already reference it.
- Invoicing uses SQLAlchemy/Alembic for its aggregate and migrations. Existing asyncpg-based services remain unchanged.

## Refactor Principles

- Routes handle validation, dependencies, service calls, and response models.
- Services handle business rules, tenant access, queueing, status shaping, audit logging, and storage validation.
- Repositories wrap `db.fetch`, `db.fetchrow`, and `db.execute` with parameterized SQL.
- Invoicing services use SQLAlchemy `AsyncSession`; the domain package owns transition, numbering, event, and outbox rules.
- Workers update rows tenant-safely and fetch trusted source-of-truth data from the database when available.
- Existing public routes are preserved unless a safer endpoint was added.

## Hardening Summary

### Authentication

- `AuthContext` includes `tenant_id`, immutable `scopes`, `api_key_id`, `user_id`, `actor_id`, and `key_type`.
- Scope input is normalized from nulls, lists, tuples, sets, comma-separated strings, and space-separated strings.
- Super-admin detection supports legacy scopes but requires platform/admin key type when available.
- Bearer token parsing is strict and returns `WWW-Authenticate: Bearer` on auth failures.
- `require_scope()` and `require_any_scope()` are available.

### Tenant Isolation

- Normal users resolve to `auth.tenant_id`.
- Super admins may use requested tenant IDs on routes that allow cross-tenant access.
- Hidden resource lookups are tenant-scoped and return `404` for guessed cross-tenant IDs.
- Direct tenant mismatch returns safe, consistent errors.

### Queue Reliability

- Job creation endpoints generate server-side job IDs.
- Publish failures mark inserted jobs `FAILED`.
- Normal tenants do not see raw queue, Redis, storage, provider, or worker stack traces.

### Storage and Files

- OCR upload storage validates tenant access before reading files.
- Uploads are size-limited and MIME-limited.
- Filenames are sanitized.
- OCR JSON `fileUrl` input accepts only trusted storage/local URLs.
- PDF downloads are authorized through `GET /pdf/download/{job_id}`.

### Observability

- Queue metrics are restricted to super admins or platform/ops metrics keys.
- Redis queue reads are run off the async event loop.
- Queue labels come only from the static worker queue map.
- Health endpoints support liveness/readiness checks.

### Invoicing Phase 1

- `draft -> issued` transition allocates invoice numbers inside the same database transaction.
- Numbering locks `invoice_sequences` rows with `SELECT ... FOR UPDATE`.
- Issued invoices store frozen payer/payee snapshots and a SHA-256 content hash.
- `invoice_events` is append-only and records before/after snapshots for transitions.
- Invoice render work is written to the Python-owned `outbox` table. The existing `/pdf` flow still uses `documents` plus `publish_job`.

## New and Updated Features

- Server-side PDF, OCR, customs declaration, and route job IDs.
- Tenant-scoped idempotency keys for supported job types.
- PDF download endpoint.
- Customs declaration status endpoint.
- Route request validation and vehicle ownership checks.
- Pricing quote IDs and valid-until timestamps.
- Bounded analytics date ranges and weighted delivery metrics.
- Cohort pagination and nested metrics shape.
- Live analytics SSE heartbeat and Redis fallback handling.
- ML lead scores include score, label, and nested payload.
- ML retrain returns Celery `taskId`.
- Audit logging for sensitive queue/request actions.
- Readiness and liveness endpoints.
- Migration file for service hardening indexes.
- Alembic migration for invoicing Phase 1 domain tables.
- SQLAlchemy async session setup for the invoicing aggregate.

## Main Commands

Install:

```powershell
cd C:\Users\temit\fauward\services\python-services
python -m pip install -r requirements.txt
```

Run migrations:

```powershell
psql $env:DATABASE_URL -f migrations/versions/0001_service_hardening_indexes.sql
python -m alembic upgrade head
```

Run tests:

```powershell
pytest tests
```

Start API:

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Start worker:

```powershell
celery -A celery_app worker --loglevel=info -Q pdf,routes,analytics,ocr,notifications,pricing,customs,ml
```

Start beat:

```powershell
celery -A celery_app beat --loglevel=info
```
