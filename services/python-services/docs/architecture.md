# Architecture

## Runtime Shape

```text
FastAPI API
  |
  | validates requests, resolves auth, calls services
  v
Services
  |
  | business rules, tenant checks, queue safety, audit
  v
Repositories + db.py / SQLAlchemy
  |
  | parameterized SQL through asyncpg, SQLAlchemy for invoicing
  v
Postgres

Workers
  |
  | consume Celery tasks and Redis-list bridge jobs
  v
Postgres + Storage + Redis completion queues
```

The service runs beside the Node.js backend. Node may publish jobs to Redis lists, while FastAPI endpoints can also create database job rows and publish worker payloads.

The invoicing subsystem is a parallel domain module. It does not call the legacy `/pdf` queue path during invoice issue; it writes invoice-specific work to the `outbox` table for later workers.

## Layer Responsibilities

### `api/`

FastAPI routers and dependencies.

Route files should stay thin:

- request validation
- dependency injection
- service calls
- response schemas

Route files should avoid:

- long SQL blocks
- tenant resolution logic
- queue failure logic
- storage/file validation
- response sanitization rules

### `schemas/`

Pydantic request and response models. Public API fields remain camelCase.

Legacy `models/*_schemas.py` files still exist and are re-exported where needed to avoid breaking imports.

### `services/`

Business logic and workflow orchestration:

- tenant access
- queueing and publish failure handling
- audit logging
- OCR/PDF/customs/route/pricing/analytics/ML logic
- safe response shaping
- storage validation

`services/invoicing/` owns the invoice aggregate, state transitions, sequential issue-time numbering, content hashing, transition events, and invoice outbox writes.

### `repositories/`

Small SQL wrappers around `db.fetch`, `db.fetchrow`, and `db.execute`.

Rules:

- parameterized SQL only
- existing non-invoice repositories remain asyncpg wrappers
- invoicing uses SQLAlchemy `AsyncSession` in `services/invoicing/repository.py`
- no business decisions
- return plain dictionaries or primitive values

### `models/`

Legacy `models/*_schemas.py` files still provide Pydantic schemas for existing APIs. New SQLAlchemy ORM models live in:

- `models/base.py`
- `models/invoicing.py`

### `workers/`

Celery task wrappers and async worker handlers.

Workers should:

- use tenant IDs from trusted job payloads
- update rows by job ID and tenant ID
- fetch source-of-truth shipment/document data from Postgres
- never rely on client-submitted business data as authoritative

## Startup

`main.py`:

- configures logging
- creates FastAPI app
- connects/disconnects database through lifespan
- registers routers
- attaches SlowAPI limiter
- exposes Prometheus instrumentation when installed

`db.connect_db()`:

- creates asyncpg pool
- runs `ensure_service_tables()` for backward-compatible startup DDL

Production deployments should still apply SQL migrations before starting the app.

## Queue Flow

1. API validates request and auth.
2. Service resolves effective tenant.
3. Service inserts a job row with server-side ID.
4. Service publishes worker payload to Redis/Celery.
5. If publish fails, service marks job `FAILED`.
6. Worker processes job and updates tenant-scoped status row.
7. Worker publishes done/failure event.

## Invoice Outbox Flow

1. Invoicing service locks the draft invoice row.
2. It validates the state transition.
3. It locks or creates the `(tenant_id, fiscal_year)` row in `invoice_sequences`.
4. It assigns the invoice number, freezes snapshots, stores the content hash, and writes `invoice_events`.
5. It inserts an `outbox` row in the same transaction.
6. Future invoice workers drain `outbox` idempotently by outbox row ID.

## Compatibility Notes

- Existing route paths are preserved.
- Existing Celery task names are preserved.
- `workers/route_worker.py` was not renamed to avoid breaking Celery routing.
- The old `GET /health` still exists; `/health/live` and `/health/ready` were added.
- The legacy `/pdf` shipment-document flow remains `documents + publish_job`.
