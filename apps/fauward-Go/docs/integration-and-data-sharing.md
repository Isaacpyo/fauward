# Integration And Data Sharing

This document describes how Fauward Go should integrate with backend services and how operational data should be shared across the wider Fauward platform.

## Goal

Fauward Go should not become an isolated field app. It should act as the mobile execution surface for operational data that is created, owned, and consumed across multiple systems.

Examples:

- shipment creation and updates from the core platform
- route and task assignment from dispatch operations
- warehouse intake and return events from hub workflows
- delivery and confirmation events for customer-facing tracking
- location, scan, and exception data for monitoring and support

## Core integration model

Fauward Go should follow this pattern:

1. Read assigned operational work from backend APIs.
2. Execute field actions locally first.
3. Queue writes when offline or under weak connectivity.
4. Sync field updates back to backend services.
5. Share reconciled operational events with other Fauward services.

## Data domains to share

## Identity and access

- user profile
- tenant
- role
- permissions
- vehicle or device assignment

## Operational workload

- assigned jobs
- routes
- stops
- workflow stage
- task capabilities
- SLA or time window data

## Execution events

- status changes
- scan verification results
- POD or confirmation payloads
- location pings
- exceptions and failure reasons
- return initiation and return receipt events

## Attachments and evidence

- proof photos
- signature references
- OTP confirmation metadata
- recipient identity details where allowed

## Recommended sharing pattern

Operational data should be shared as events plus current-state APIs.

Use current-state APIs for:

- current jobs list
- stop details
- route details
- user session bootstrap

Use events/webhooks/message streams for:

- stop status changed
- shipment verified
- proof submitted
- exception reported
- return collected
- return received
- location updated

## Suggested backend responsibilities

## Fauward Go client

- capture actions
- maintain local queue
- preserve local drafts
- display field-safe state

## Operational API

- authenticate user
- return assigned workload
- validate permissions
- accept idempotent writes
- return reconciliation metadata

## Event or integration layer

- publish operational events
- fan out updates to dispatch, tracking, support, analytics, and returns systems
- deduplicate by idempotency key or event id

## Data-sharing rules

- every mutable field action should have an idempotency key
- every event should include tenant and actor identifiers
- workflow stage should be explicit, not inferred from labels
- evidence files should be referenced by durable attachment ids
- timestamps should use ISO 8601 UTC
- downstream consumers should treat Fauward Go as an execution producer, not the system of record

## Minimal event shape

```json
{
  "eventId": "evt_123",
  "eventType": "field.stop.completed",
  "tenantId": "tenant_1",
  "actorId": "field-user-1",
  "shipmentId": "SHP-24006",
  "jobId": "job-shp-24006",
  "stopId": "stop-delivery",
  "workflowStage": "delivery",
  "occurredAt": "2026-04-19T10:15:00.000Z",
  "idempotencyKey": "idem_123",
  "payload": {}
}
```

## Integration phases

## Phase 1

- replace seeded reads with backend APIs
- replace mocked auth with real auth
- send queued writes to backend sync endpoints

## Phase 2

- publish operational events after reconciliation
- connect tracking, dispatch, warehouse, and support consumers

## Phase 3

- add durable attachment upload and evidence references
- add observability, retries, and dead-letter handling

## Current status

Implemented today:

- local workflow-stage model
- local queue model
- local verification, confirmation, location, and exception capture

Not implemented yet:

- real API integration
- real event publishing
- shared operational data contracts across services
- attachment pipeline
