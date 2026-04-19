# Architecture Snapshot

Fauward Go is currently a standalone React + TypeScript + Vite PWA with a local-first mobile execution model.

## Current feature boundaries

- `src/app`
  Router, auth guard, app shell, and providers.
- `src/features`
  Screen-level flows for auth, home, jobs, stops, routes, verification, location, sync, settings, POD, and support.
- `src/components`
  Shared UI building blocks such as cards, headers, status pills, back links, and signature capture.
- `src/store`
  Zustand stores for auth, seeded field data, and sync/connectivity state.
- `src/db`
  Dexie schema placeholder for the next persistence step.
- `src/types`
  Shared field domain types, including workflow stages, jobs, stops, verification, POD, and queue records.

## Domain model in the app today

The job and stop model is stage-based rather than delivery-only.

Implemented workflow stages:

- shipment creation
- warehouse intake
- dispatch handoff
- pickup
- linehaul
- delivery
- return initiation
- return receipt

Each stop can expose a different combination of:

- status updates
- shipment/package/label verification
- confirmation capture
- location updates
- exception handling

## Data flow

1. User signs in through mocked local auth.
2. Demo field data is seeded into the local store.
3. Jobs and stops render from the local Zustand store.
4. User actions update local entities first.
5. Mutating actions create pending queue records with idempotency keys.
6. Sync replay marks queued records as syncing and then synced.

## Implemented UI flow

- `Home` is now a lightweight summary surface.
- `Jobs` is the primary search and execution entry.
- `Stop detail` is the stage-aware execution surface.
- `Verification` supports camera scan and manual fallback.
- `POD / confirmation` is only enabled where the stop requires proof fields.
- `Settings` contains utilities and support entry points.

## Current limitations

- no live backend integration yet
- no real session/token management
- no Dexie-backed persistence yet
- no attachment upload pipeline yet
- support call action has no configured phone number yet
