# Offline Sync Notes

The current app already behaves as a local-first field client, but the queue and reconciliation are still mocked in memory/local storage rather than backed by a real sync engine.

## Implemented now

- status updates create queued mutations
- confirmation submission creates queued proof and status mutations
- verification scans create queued verification mutations
- location capture creates queued location mutations
- the sync screen shows queue state and replay progress
- connectivity and sync state are tracked separately for immediate UI feedback

## Queue behavior

- records are created with `idempotencyKey`
- pending records can move through `pending`, `syncing`, and `synced`
- replay processes a bounded batch
- proof drafts, scan records, and location pings are marked synced after replay

## What is not implemented yet

- real backend acknowledgement and reconciliation
- retry backoff strategy
- failure classification and recovery UI
- attachment upload splitting
- IndexedDB-backed repositories for durable offline storage

## Next hardening steps

1. Move queue and field entities into Dexie.
2. Preserve replay metadata and attachment references in IndexedDB.
3. Add ordered replay, retry, and failure handling.
4. Reconcile server responses back into job and stop state.
