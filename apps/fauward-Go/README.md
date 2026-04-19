# Fauward Go

Fauward Go is a mobile-first PWA for field execution across the shipment lifecycle, from shipment creation and warehouse intake through dispatch, pickup, linehaul, delivery, and returns.

## Current state

- gated sign-in flow with backend password auth and backend email-link consumption
- home, jobs, settings, route, stop, verification, location, sync, POD, and support screens
- white branded UI using Fauward Go assets and a simplified mobile layout
- assigned job model that supports multiple workflow stages, not just pickup and delivery
- local-first field store with backend workload bootstrap and queued mutations
- QR and barcode verification flow with camera support when `BarcodeDetector` is available
- confirmation capture flow for stages that require recipient name, OTP, signature, and/or photo evidence
- sync queue screen with queued, syncing, failed, and synced mutation visibility
- authenticated sync batch replay to backend field endpoints with idempotency metadata

## What is still mocked

- attachment upload is still metadata-only and does not push binary files yet
- field contract adaptation is defensive because the backend response envelope is not fully fixed in the app docs
- support calling is not configured yet

## Run locally

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm run build
```

## Main screens

- `Home`: assigned-flow summary, clickable metrics, and verification entry
- `Jobs`: assigned jobs list with search, workflow-stage filter, and QR entry
- `Stop detail`: stage-aware actions for verification, confirmation, location, and exceptions
- `Verification`: scan shipment, package, or label codes
- `Settings`: operator details, field tools, support entry, and sign out

## Docs

- [Architecture](./docs/architecture.md)
- [Offline sync](./docs/offline-sync.md)
- [API contracts](./docs/api-contracts.md)
- [Integration and data sharing](./docs/integration-and-data-sharing.md)
- [Rollout plan](./docs/rollout-plan.md)
