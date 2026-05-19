# Database and Migrations

## Database Helper

`db.py` owns:

- asyncpg pool lifecycle
- `fetch`, `fetchrow`, `fetchval`, `execute`, `executemany`
- API-key validation
- backward-compatible startup DDL through `ensure_service_tables()`

Repositories call these helpers directly with parameterized SQL.

## SQLAlchemy Invoicing Layer

The invoicing Phase 1 aggregate uses SQLAlchemy 2 async sessions in `services/invoicing/database.py` and ORM mappings in `models/invoicing.py`.

This is intentionally scoped to invoicing. Existing PDF, OCR, customs, routes, analytics, and ML code continues to use `db.py` and asyncpg.

## Migration Location

```text
migrations/
  env.py
  versions/
    0001_service_hardening_indexes.sql
    0002_invoicing_phase1.py
```

Apply manually in production:

```powershell
psql $env:DATABASE_URL -f migrations/versions/0001_service_hardening_indexes.sql
python -m alembic upgrade head
```

Migrations are idempotent where practical. The Alembic migration includes DDL that coexists with the legacy Prisma-created finance tables.

## Service Tables

The service owns or extends these support tables:

- `audit_log`
- `error_logs`
- `documents`
- `parsed_documents`
- `customs_declarations`
- `route_jobs`
- `analytics_snapshots`
- `cohort_metrics`
- `prediction_results`
- `ml_prediction_feedback`
- `ml_models`
- `invoice_line_items`
- `invoice_sequences`
- `invoice_events`
- `outbox`

The service extends these existing product/platform tables for invoicing compatibility:

- `invoices`
- `idempotency_keys`

Existing product tables are also read:

- `tenants`
- `shipments`
- `vehicles`
- `shipment_documents`
- `rate_cards`
- `surcharges`
- `promo_codes`
- `quotes`
- `leads`
- `users`
- `invoices`
- `support_tickets`
- `api_keys`
- `tenant_api_keys`
- `notification_logs`

## Important Indexes

Documents:

```sql
documents(tenant_id, id)
documents(tenant_id, shipment_id)
documents(tenant_id, type, updated_at desc)
unique documents(tenant_id, idempotency_key) where idempotency_key is not null
```

Parsed documents:

```sql
parsed_documents(tenant_id, job_id)
parsed_documents(tenant_id, status, updated_at desc)
parsed_documents(tenant_id, document_type, updated_at desc)
```

Customs declarations:

```sql
customs_declarations(tenant_id, id)
customs_declarations(tenant_id, shipment_id)
customs_declarations(tenant_id, declaration_type, updated_at desc)
unique customs_declarations(tenant_id, idempotency_key) where idempotency_key is not null
```

Route jobs:

```sql
route_jobs(tenant_id, id)
route_jobs(tenant_id, status, updated_at desc)
route_jobs(tenant_id, vehicle_id, updated_at desc)
unique route_jobs(tenant_id, idempotency_key) where idempotency_key is not null
```

Predictions:

```sql
unique prediction_results(tenant_id, entity_type, entity_id, model_name)
prediction_results(tenant_id, entity_type, model_name)
prediction_results(tenant_id, updated_at desc)
```

Invoices:

```sql
unique invoices("tenantId", "invoiceNumber") where "invoiceNumber" is not null
unique invoices("tenantId", "fiscalYear", "sequenceNumber") where both are not null
invoices("tenantId", status, "createdAt" desc)
```

Invoice line items:

```sql
unique invoice_line_items(invoice_id, line_number)
invoice_line_items(tenant_id, invoice_id)
```

Invoice events:

```sql
invoice_events(tenant_id, invoice_id, created_at)
invoice_events(tenant_id, created_at desc)
```

Invoice outbox:

```sql
outbox(status, available_at, created_at) where status = 'pending'
outbox(tenant_id, aggregate_id, created_at)
```

Idempotency:

```sql
unique idempotency_keys("tenantId", key)
idempotency_keys("expiresAt")
```

## Repository Guidelines

- Put new SQL in `repositories/` first.
- Keep SQL parameterized.
- Return simple dictionaries or primitive values.
- Do not add business rules to repository functions.
- Keep tenant filters explicit in SQL.
- For invoicing, put aggregate database access in `services/invoicing/repository.py` and keep transition logic in `services/invoicing/state.py` or `services/invoicing/numbering.py`.

## Startup DDL

`db.ensure_service_tables()` still creates and patches service tables at startup for compatibility with local/dev deployments.

Production should not rely only on startup DDL. Apply migrations during deployment.

## Invoicing Migration Notes

`0002_invoicing_phase1.py`:

- adds `ISSUED` to the existing `InvoiceStatus` enum
- relaxes legacy `invoices.invoiceNumber` to allow drafts without numbers
- adds minor-unit money, snapshot, fiscal-year, sequence, and hash columns
- creates `invoice_sequences`, `invoice_line_items`, `invoice_events`, and `outbox`
- adds an append-only trigger for `invoice_events`
- extends `idempotency_keys` with response headers, state, and updated timestamp fields for the Phase 2 middleware

Gapless invoice numbers are allocated only by `issue_invoice()` while the invoice and sequence rows are locked inside one transaction.
