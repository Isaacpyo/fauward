# Fauward Agents PWA

The Agents PWA is the field-operations mobile web app for scanning shipments and advancing statuses with audit-friendly notes and location.

## Scope

This app replaces the old `apps/driver` surface and runs from `apps/agents`.

Primary capabilities:
- Login with existing Fauward tenant credentials
- Dashboard with quick actions and recent scans
- QR scan or manual tracking reference lookup
- Shipment detail + timeline
- Confirm-and-advance status flow (`location` + `notes` required)
- Offline queue for scan/advance actions with auto-sync on reconnect

## Stack

- React 18 + Vite
- React Router
- Tailwind CSS
- `vite-plugin-pwa` (injectManifest)
- `@zxing/browser` for camera QR scanning

## App Structure

- `src/pages/WelcomePage.tsx` public splash/welcome
- `src/pages/LoginPage.tsx` credential login
- `src/pages/DashboardPage.tsx` overview + actions
- `src/pages/ScanPage.tsx` QR/manual scan flow
- `src/pages/ShipmentPage.tsx` shipment details + draft advance
- `src/pages/ConfirmPage.tsx` confirmation + submit/queue
- `src/pages/ShipmentsPage.tsx` recent shipments touched by current user

Core plumbing:
- `src/context/AgentAuthContext.tsx` session/auth state
- `src/lib/api.ts` authenticated API client + token refresh
- `src/lib/session.ts` local session persistence and role checks
- `src/lib/agentOfflineQueue.ts` local offline queues
- `src/components/agent/AgentSyncListener.tsx` online-event queue drain

## Routing

Route helpers are centralized in `src/lib/agentPaths.ts`.

Active routes:
- `/` welcome
- `/login`
- `/dashboard`
- `/scan`
- `/shipments`
- `/shipment/:ref`
- `/shipment/:ref/confirm`

## Authentication and Tenant Context

The app uses existing backend auth endpoints:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`

Session tokens are stored locally and attached on requests:
- `Authorization: Bearer <accessToken>`
- `x-tenant-slug: <tenantSlug>`

Role access is restricted to operational roles (`TENANT_DRIVER`, `TENANT_STAFF`, `TENANT_MANAGER`, `TENANT_ADMIN`).

## Backend API Usage (Agents)

The PWA consumes these endpoints:

- `GET /api/v1/agents/shipments/by-ref/:trackingRef`
  - returns shipment summary + timeline events for a tracking reference

- `POST /api/v1/agents/shipments/advance`
  - body: `{ trackingRef, location, notes }`
  - advances shipment to next allowed agent-stage status
  - writes shipment event/audit metadata in backend

- `GET /api/v1/agents/shipments/recent?limit=50`
  - recent shipments last touched by authenticated user

## Status Flow

Current agent flow in `src/lib/agentWorkflow.ts`:
- `PENDING -> PROCESSING -> PICKED_UP -> IN_TRANSIT -> OUT_FOR_DELIVERY -> DELIVERED`

`ConfirmPage` posts to backend to advance exactly one step.

## Offline Behavior

Two local queues are used (`localStorage`):
- `agentScanQueue`
- `agentAdvanceQueue`

Behavior:
- scan/advance is queued when offline
- sync listener drains queue on reconnect
- processing stops on first server rejection to preserve action order

## PWA + Service Worker

Configured in:
- `vite.config.ts`
- `src/sw.ts`

Caching strategy:
- app shell: stale-while-revalidate
- agents/shipments API: network-first with timeout fallback

## Scripts

From repo root:

```bash
npm run dev --workspace=apps/agents
npm run build --workspace=apps/agents
npm run preview --workspace=apps/agents
```

## Notes

- Firebase integration is intentionally not used in this app.
- All data operations run through Fauward backend + existing Prisma database integration.
