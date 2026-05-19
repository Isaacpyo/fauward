# Security and Tenant Isolation

## Authentication

All feature endpoints require:

```http
Authorization: Bearer <token>
```

Public exceptions:

- `GET /health`
- `GET /health/live`
- `GET /health/ready`

`api/auth.py` provides:

- `AuthContext`
- `require_bearer_token`
- `require_super_admin`
- `require_scope(scope)`
- `require_any_scope(scopes)`

## AuthContext

Auth context includes:

- `tenant_id`
- immutable `scopes`
- `api_key_id`
- `user_id`
- `actor_id`
- `key_type`

Scopes are normalized safely from null, list, tuple, set, comma-separated string, and space-separated string input.

## API Key Validation

`db.validate_api_key()` supports:

- hashed API-key lookup
- optional key-prefix lookup when schema supports it
- constant-time hash comparison
- active/disabled checks
- revoked checks when columns exist
- expiry checks
- tenant status checks when supported
- safe `lastUsed` / `last_used_at` updates

Raw API keys are never returned in errors.

## Super Admin Rules

Supported privileged scope names:

- `super_admin`
- `super-admin`
- `admin:all`
- `platform:admin`

When `key_type` is available, super-admin privileges require a platform/admin key type. A normal tenant key with a broad string scope must not become platform admin.

## Tenant Access

Shared rule:

```text
normal user -> effective tenant = auth.tenant_id
super admin -> effective tenant = requested tenantId
```

Hidden resource lookups by ID use tenant-scoped queries for normal users. Guessed cross-tenant job IDs return `404`, not `403`.

Direct request tenant mismatch returns a safe error where relevant.

## Scope Summary

Common scopes:

- `pdf:read`, `pdf:write`
- `ocr:read`, `ocr:write`
- `customs:read`, `customs:estimate`, `customs:write`, `customs:submit`
- `routes:read`, `routes:optimize`
- `pricing:quote`, `pricing:read`
- `metrics:read`, `metrics:queues`, `ops:metrics`

Super admins pass scope checks automatically.

## Sensitive Response Rules

Normal tenants must not receive:

- stack traces
- Redis internals
- storage bucket internals
- provider credentials or URLs with secrets
- raw OCR provider errors
- raw customs payloads
- internal pricing margins, cost floors, or private rule IDs
- other tenants' resource existence

Super admins may receive more diagnostics where routes already support it.

## Audit Events

Sensitive actions are audited where infrastructure is available:

- `pdf_generation_queued`
- `ocr_parse_queued`
- `customs_declaration_queued`
- `route_optimization_queued`
- `pricing_quote_created`
- `ml_model_retrain_queued`
- `invoice.issued` in `invoice_events`

Audit metadata avoids raw documents, signed URL tokens, API keys, full customs payloads, and stack traces.

## Invoice Integrity Controls

Issued invoices are immutable in the Phase 1 domain core. Corrections are expected to happen through later credit-note flows, not by editing issued rows.

Invoice issue stores:

- frozen payer and payee snapshots
- SHA-256 content hash of the canonical issued invoice snapshot
- append-only `invoice_events` with before/after snapshots
- an invoice outbox row in the same transaction for asynchronous rendering
