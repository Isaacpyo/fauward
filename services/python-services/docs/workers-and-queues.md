# Workers and Queues

## Queue Map

| Redis List | Celery Task | Celery Queue | Done Queue |
| --- | --- | --- | --- |
| `fauward:pdf:generate` | `workers.pdf_worker.process_pdf_job` | `pdf` | `fauward:pdf:done` |
| `fauward:routes:optimize` | `workers.route_worker.process_route_job` | `routes` | `fauward:routes:done` |
| `fauward:ocr:parse` | `workers.ocr_worker.process_ocr_job` | `ocr` | `fauward:ocr:done` |
| `fauward:notifications:send` | `workers.notifications_worker.process_notification_job` | `notifications` | `fauward:notifications:done` |
| `fauward:customs:generate` | `workers.customs_worker.process_customs_job` | `customs` | `fauward:customs:done` |
| `fauward:pricing:quote` | `workers.pricing_worker.process_pricing_job` | `pricing` | `fauward:pricing:done` |
| `fauward:ml:score` | `workers.ml_worker.process_ml_score_job` | `ml` | `fauward:ml:done` |

## Job Lifecycle

1. API creates job row with a server-side ID.
2. API publishes worker payload.
3. If publish fails, the row is marked `FAILED`.
4. Worker marks job `PROCESSING`.
5. Worker performs the job using trusted DB data where possible.
6. Worker updates job row to `COMPLETED`, `READY`, or `FAILED`.
7. Worker publishes a done/failure event.

## Done Event

```json
{
  "jobId": "server-generated-id",
  "status": "READY",
  "worker": "pdf_worker"
}
```

## Failure Event

```json
{
  "jobId": "server-generated-id",
  "status": "FAILED",
  "worker": "pdf_worker",
  "error": "safe worker error"
}
```

Normal API callers do not receive raw failure internals.

## Invoice Outbox

Invoicing does not publish Redis/Celery jobs during request handling. Phase 1 writes invoice-related work to the Python-owned `outbox` table inside the same transaction as the invoice state transition.

Current invoice outbox event:

```json
{
  "eventType": "render_invoice",
  "aggregateType": "invoice",
  "aggregateId": "invoice-id",
  "payload": {
    "tenantId": "tenant_123",
    "invoiceId": "invoice-id",
    "invoiceNumber": "INV-2026-000001",
    "contentHashSha256": "..."
  }
}
```

Future invoice workers drain `outbox` rows idempotently by `outbox.id`. The legacy PDF worker and Redis list bridge remain unchanged for `/pdf/generate`.

## Redis List Bridge

`workers/__init__.py` includes a Redis-list bridge that forwards Redis list payloads into Celery tasks. This keeps compatibility with Node modules that publish jobs directly to Redis.

Control bridge startup with:

```text
PYTHON_QUEUE_LISTENERS_ENABLED=true|false
```

Recommended deployment split:

- API: `false`
- Worker: `true`
- Beat: `false`

## Worker Notes

### PDF Worker

- Fetches shipment data by tenant and shipment ID.
- Renders HTML templates with Jinja2.
- Generates PDFs with WeasyPrint.
- Stores output in configured storage.
- Continues to serve the legacy shipment-document PDF path, not the new invoice aggregate.

### OCR Worker

- Processes trusted file URLs or stored uploads.
- Detects PDF/image/text.
- Extracts text with pdfplumber or Tesseract.
- Updates `parsed_documents` by `job_id + tenant_id`.

### Route Worker

- Uses OSRM matrix API with fallback haversine distances.
- Uses OR-Tools when available.
- Verifies shipment IDs by tenant before processing.
- Updates `route_jobs` by `id + tenant_id`.

### Customs Worker

- Fetches trusted shipment data by tenant and shipment ID.
- Renders declaration XML drafts.
- Does not submit declarations to external customs systems.

### Pricing Worker

- Loads rates, surcharges, promos, and demand signals.
- Evaluates quote logic.
- Does not expose private rule internals through API response.

### Analytics Worker

- Builds snapshots, cohorts, and churn-risk data.
- Stores rollups in Postgres and live KPI cache in Redis.

### ML Worker

- Scores shipments, tenants, and leads.
- Trains supported models only through Celery tasks.
- Stores model artifacts through the model registry.
