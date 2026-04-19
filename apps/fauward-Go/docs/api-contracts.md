# API Contract Outline

The current app still runs on seeded local data, but the client surface is already shaped around the backend domains Fauward Go will need.

## Auth

- `POST /auth/login`
- `POST /auth/email-link/request`
- `POST /auth/email-link/consume`
- `GET /auth/me`
- `POST /auth/logout`

## Field read models

- `GET /field/jobs`
- `GET /field/routes`
- `GET /field/stops/:id`
- `GET /field/scan-targets`

## Field write models

- `POST /field/status-update`
- `POST /field/pod`
- `POST /field/scan/verify`
- `POST /field/location`
- `POST /field/exceptions`
- `POST /field/sync/batch`

## Data the client expects

- tenant-scoped authenticated responses
- workflow stage on jobs and stops
- stop capabilities that determine whether verification, confirmation, or location controls are enabled
- idempotent write handling
- reconciliation metadata on sync responses
- attachment-safe proof upload workflows

## Notes on current implementation

- login and email-link flows are mocked locally
- seeded jobs already model the full execution lifecycle
- client-side writes are queued locally and replayed without server acknowledgement
