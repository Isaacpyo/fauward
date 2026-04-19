# Fauward Go

Fauward Go is a mobile-first PWA for field execution across the shipment lifecycle, from shipment creation and warehouse intake through dispatch, pickup, linehaul, delivery, and returns.

## Current state

- gated sign-in flow with password and mocked email-link sign-in
- home, jobs, settings, route, stop, verification, location, sync, POD, and support screens
- white branded UI using Fauward Go assets and a simplified mobile layout
- assigned job model that supports multiple workflow stages, not just pickup and delivery
- local-first field store with seeded demo data and queued mutations
- QR and barcode verification flow with camera support when `BarcodeDetector` is available
- confirmation capture flow for stages that require recipient name, OTP, signature, and/or photo evidence
- sync queue screen with queued, syncing, and synced mutation visibility

## What is still mocked

- authentication is local demo auth, not backend auth
- email-link sign-in is simulated in the client
- field data is seeded locally
- sync replay is mocked reconciliation
- support calling is not configured yet

## Local demo access

The login UI no longer shows demo credentials, but the local demo auth still accepts:

- email: `ops@fauward.test`
- password: `246810`

You can also use the mocked email-link sign-in path from the login screen.

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
