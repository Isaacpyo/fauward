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
Repositories + db.py
  |
  | parameterized SQL through asyncpg
  v
Postgres

Workers
  |
  | consume Celery tasks and Redis-list bridge jobs
  v
Postgres + Storage + Redis completion queues
```

The service runs beside the Node.js backend. Node may publish jobs to Redis lists, while FastAPI endpoints can also create database job rows and publish worker payloads.

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

### `repositories/`

Small SQL wrappers around `db.fetch`, `db.fetchrow`, and `db.execute`.

Rules:

- parameterized SQL only
- no ORM introduced
- no business decisions
- return plain dictionaries or primitive values

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

## Compatibility Notes

- Existing route paths are preserved.
- Existing Celery task names are preserved.
- `workers/route_worker.py` was not renamed to avoid breaking Celery routing.
- The old `GET /health` still exists; `/health/live` and `/health/ready` were added.
