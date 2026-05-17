# API Reference

All feature endpoints return camelCase JSON.

## Health

```http
GET /health
GET /health/live
GET /health/ready
```

`/health/live` returns process liveness. `/health/ready` checks database and Redis connectivity and returns safe status only.

## PDF

```http
POST /pdf/generate
GET  /pdf/status/{job_id}
GET  /pdf/download/{job_id}
```

Generate request:

```json
{
  "tenantId": "tenant_123",
  "type": "invoice",
  "shipmentId": "shipment_123",
  "idempotencyKey": "optional-stable-key",
  "options": {
    "includeLogo": true,
    "locale": "en-GB",
    "currency": "GBP",
    "labelSize": "4x6in",
    "notes": "Optional safe note"
  }
}
```

Supported `type`:

- `invoice`
- `shipping_label`
- `pod`
- `manifest`

Queued response:

```json
{
  "jobId": "server-generated-id",
  "status": "QUEUED"
}
```

Status response:

```json
{
  "jobId": "server-generated-id",
  "status": "QUEUED|PROCESSING|COMPLETED|FAILED",
  "url": "/pdf/download/server-generated-id",
  "error": null
}
```

Notes:

- client-supplied `jobId` is ignored
- shipment ownership is verified before queueing
- worker fetches trusted shipment data
- URL is only exposed when completed and authorized

## OCR

```http
POST /ocr/parse
GET  /ocr/result/{job_id}
```

JSON request:

```json
{
  "tenantId": "tenant_123",
  "documentType": "customs_form",
  "fileUrl": "trusted-storage-url"
}
```

Multipart form fields:

- `file`
- `tenantId`
- `documentType`

Supported `documentType`:

- `return_auth`
- `customs_form`
- `bill_of_lading`
- `pod_photo`

Result response:

```json
{
  "jobId": "server-generated-id",
  "status": "QUEUED|PROCESSING|READY|FAILED",
  "documentType": "customs_form",
  "extractedFields": {},
  "confidenceScore": 0.92,
  "error": null
}
```

## Customs

```http
POST /customs/hs-lookup
POST /customs/duty-estimate
POST /customs/declaration
GET  /customs/declaration/status/{job_id}
```

HS lookup:

```json
{
  "description": "laptop charger"
}
```

Returns at most five matches.

Duty estimate:

```json
{
  "originCountry": "US",
  "destCountry": "GB",
  "hsCode": "850110",
  "declaredValue": "100.00",
  "currency": "GBP"
}
```

Declaration request:

```json
{
  "tenantId": "tenant_123",
  "shipmentId": "shipment_123",
  "declarationType": "uk_cds",
  "idempotencyKey": "optional-stable-key",
  "options": {}
}
```

Declaration status:

```json
{
  "jobId": "server-generated-id",
  "tenantId": "tenant_123",
  "shipmentId": "shipment_123",
  "declarationType": "uk_cds",
  "status": "QUEUED|PROCESSING|COMPLETED|FAILED",
  "error": null,
  "updatedAt": "2026-05-02T12:00:00+00:00"
}
```

Declaration generation does not submit to external customs systems.

## Routes

```http
POST /routes/optimize
GET  /routes/{job_id}
```

Optimize request:

```json
{
  "tenantId": "tenant_123",
  "vehicleId": "vehicle_123",
  "depot": { "lat": 51.5, "lng": -0.12 },
  "stops": [
    {
      "shipmentId": "shipment_123",
      "lat": 51.51,
      "lng": -0.1,
      "timeWindowStart": "2026-05-02T09:00:00+00:00",
      "timeWindowEnd": "2026-05-02T12:00:00+00:00",
      "weightKg": "5.5"
    }
  ],
  "vehicleCapacityKg": "50",
  "idempotencyKey": "optional-stable-key"
}
```

Queued response:

```json
{
  "jobId": "server-generated-id",
  "status": "queued"
}
```

Status response:

```json
{
  "jobId": "server-generated-id",
  "status": "QUEUED|PROCESSING|COMPLETED|FAILED",
  "orderedStops": [],
  "totalDistanceM": 0,
  "estimatedDurationS": 0,
  "error": null,
  "updatedAt": "2026-05-02T12:00:00+00:00"
}
```

## Pricing

```http
POST /pricing/quote
```

Request:

```json
{
  "tenantId": "tenant_123",
  "originPostcode": "SW1A 1AA",
  "destPostcode": "M1 1AE",
  "weightKg": "12.5",
  "promoCode": "SAVE10"
}
```

Response:

```json
{
  "quoteId": "server-generated-id",
  "tenantId": "tenant_123",
  "currency": "GBP",
  "subtotal": 10,
  "discount": 0,
  "total": 10,
  "validUntil": "2026-05-02T12:30:00+00:00",
  "breakdown": {
    "base": 10,
    "surcharges": [],
    "promoDiscount": 0
  }
}
```

## Analytics

```http
GET /analytics/summary?tenantId=&dateFrom=&dateTo=
GET /analytics/cohorts?tenantId=&limit=&offset=
GET /analytics/live?tenantId=
GET /analytics/churn-risk
```

Rules:

- default summary range is last 30 days
- maximum summary range is 365 days
- `avgDeliveryHours` is weighted by shipment count
- cohorts return `{ "signupWeek": "...", "metrics": {...} }`
- live endpoint is Server-Sent Events
- churn risk is super-admin only

## ML

```http
GET  /ml/shipment-risk/{shipment_id}
GET  /ml/churn-risk/{tenant_id}
GET  /ml/predictions/{tenant_id}?limit=&offset=
GET  /ml/leads?limit=&offset=
GET  /ml/models
GET  /ml/retrain/status/{task_id}
POST /ml/retrain/{model_name}
POST /ml/feedback
```

Additional advisory endpoints include ETA, SLA risk, customs risk, route risk, anomaly, demand forecast, pricing recommendation, customer LTV, support-ticket classification, and next-best-action.

`POST /ml/retrain/{model_name}` is super-admin only and returns:

```json
{
  "modelName": "delivery_delay",
  "status": "queued",
  "taskId": "celery-task-id"
}
```

## Metrics

```http
GET /metrics/queues
```

Requires super admin or platform/ops metrics scope.

Response:

```json
{
  "queues": {
    "fauward:pdf:generate": 0
  },
  "updatedAt": "2026-05-02T12:00:00+00:00"
}
```

The Prometheus exposition endpoint remains `/metrics`; this JSON endpoint is `/metrics/queues`.
