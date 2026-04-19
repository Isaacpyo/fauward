# Rollout Plan

## Phase 1: Mobile shell and local-first execution

Status: shipped as a working prototype

- standalone React + Vite PWA scaffold
- gated sign-in flow
- simplified home, jobs, and settings navigation
- branded mobile shell
- stage-aware assigned jobs and stops
- verification, confirmation capture, location, sync, and support screens

## Phase 2: Backend integration

Status: next major phase

- replace seeded demo data with authenticated session bootstrap
- connect login and email-link auth to backend endpoints
- load jobs, routes, stops, and capabilities from APIs
- restore session and tenant context from real server state

## Phase 3: Offline persistence hardening

Status: planned

- move field data and queue records into Dexie
- persist drafts, verification records, and location pings
- add retry backoff, ordered replay, and reconciliation
- handle partial sync and failure recovery cleanly

## Phase 4: Device and attachment hardening

Status: partially prototyped

- camera-based QR and barcode scan is already prototyped
- confirmation capture is already prototyped
- next step is production-safe attachment handling, upload flow, and permissions hardening

## Phase 5: Production readiness

Status: planned

- add automated coverage for core field flows
- align client types with backend/shared contracts
- finish API client boundaries
- prepare for monorepo extraction when the app surface stabilizes
