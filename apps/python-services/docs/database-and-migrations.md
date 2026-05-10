# Database and Migrations

## Database Helper

`db.py` owns:

- asyncpg pool lifecycle
- `fetch`, `fetchrow`, `fetchval`, `execute`, `executemany`
- API-key validation
- backward-compatible startup DDL through `ensure_service_tables()`

Repositories call these helpers directly with parameterized SQL.

## Migration Location

```text
migrations/
  versions/
    0001_service_hardening_indexes.sql
```

Apply manually in production:

```powershell
psql $env:DATABASE_URL -f migrations/versions/0001_service_hardening_indexes.sql
```

The migration is idempotent where practical.

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

## Repository Guidelines

- Put new SQL in `repositories/` first.
- Keep SQL parameterized.
- Return simple dictionaries or primitive values.
- Do not add business rules to repository functions.
- Keep tenant filters explicit in SQL.

## Startup DDL

`db.ensure_service_tables()` still creates and patches service tables at startup for compatibility with local/dev deployments.

Production should not rely only on startup DDL. Apply migrations during deployment.
