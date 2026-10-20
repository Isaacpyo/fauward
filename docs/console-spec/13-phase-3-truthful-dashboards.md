# Phase 3 — Truthful Dashboards

**Outcome:** no hardcoded number anywhere in the console. Every KPI, chart, badge and "last activity" comes from an API, or says plainly that it is not wired.
**Branch:** `console/p3-dashboards` · **Prereq:** Phase 2 exit criteria green (dashboards need real producers).
**Services going live:** queues, health, jobs, analytics.

---

## WP-3.1 Platform metrics and pillar dashboard

- `GET /api/internal/metrics/overview` (`revenue.analytics.read` for money fields; other fields need only an authenticated session and are filtered per permission):
  `{ mrr: { amount, currency, asOf }, activeTenants, trialingTenants, suspendedTenants, signups7d, shipmentsToday, shipments30d, dlqDepth, error5xxRate1h, failedPayments30d, openPlatformTickets, openEscalations, pendingApprovals: { refunds, jit, planChanges, regionRequests, appeals, dsar } }`.
- MRR: Σ `mrrForSubscription()` (defined in WP-1.2) over subscriptions with `status ∈ {ACTIVE, PAST_DUE}`, excluding DEMO tenants. Converted amounts are flagged in the response.
- Remove `platform.routes.ts:296,502` literals (500/79/29) — already moved in WP-1.1; this WP makes all callers use `mrrForSubscription()`.
- `PillarDashboard`, `PillarCard`, `DashboardOverviewSections`: real values; `alertCount` = count of `ATTENTION|CRITICAL` activity in the last 24 h for that pillar's services; `TopBar` "On-call" pill shows the active incident commander (WP-4 incidents) or is removed until then.
- Delete every literal listed in re-audit §8 "Hardcoded UI data" (`DashboardPage.tsx:8-34,84-109`, `CommandPalette.tsx:11-17`, `TopBar.tsx:39-42`, `PillarCard.tsx:16`, `_PillarOverviewBase.tsx:83-88`).

**Acceptance:** ACC-DASH-1 with a fixture of 3 subscriptions (STARTER monthly, PRO annual, ENTERPRISE with a 10% override) MRR equals the hand-computed value; ACC-DASH-2 a user without `revenue.analytics.read` gets no money fields; ACC-DASH-3 `no-fake-data` gate passes over `apps/super-admin/src/{shell,pillars,components}`.

## WP-3.2 Revenue analytics → analytics live

Endpoints (all `revenue.analytics.read`), computed from `SubscriptionEvent` (P2) with monthly buckets:
- `GET /api/internal/revenue/analytics/mrr-movement?from&to` → per month: `new, expansion, contraction, churn, reactivation, net`.
- `GET …/cohorts?by=signup_month` → retention matrix (logo and revenue).
- `GET …/by-plan` → MRR and tenant count per plan and billing cycle.
- `GET …/forecast?months=6` → run-rate projection from trailing 3-month net movement, labelled "projection" with the method shown.
- Every response carries `{ dataSince, reconstructedBefore }` from the 0047 backfill so the UI can mark reconstructed periods.
- `RevenueAnalyticsPage` / `RevenueCharts`: delete `sampleRows` and "chart placeholder" boxes; charts follow the `dataviz` conventions already used in the repo (or Recharts if present).

**Acceptance:** ACC-REV-1…4 (catalogue).

## WP-3.3 Health score inputs

`scheduled.worker.ts:44-69` (`customer.health-scoring`):
- inputs: shipment trend (30 d vs prior 30 d, real `Shipment` rows — now trustworthy after WP-2.0), active users (7 d logins), PLATFORM ticket load and age, NPS (latest `FeedbackItem` NPS per tenant, else factor excluded and weights renormalised — never a hardcoded 10), payment health (open dunning, failed payments), feature adoption (returns, customs, documents, AI agent runs, API usage), onboarding completeness.
- store `inputs` and `version` (migration 0055); weights in code (`health-score.config.ts`) and exposed read-only at `GET /api/internal/success/health-scoring`.
- no fallback score: tenants without enough data show "Not yet scored" (C360, CS console).

**Acceptance:** ACC-CS-1…3 (catalogue).

## WP-3.4 Badges

One endpoint `GET /api/internal/badges` (architecture §6.4). Initial keys: `tenant-count`, `suspended-count`, `dlq-depth`, `mrr`, `open-platform-tickets`, `open-escalations`, `pending-approvals`, `open-appeals`, `dsar-due-7d`, `failed-jobs-24h`, `integrations-degraded`, `p95-latency`, `error-rate`. Each service in the manifest maps to one key or none. `badges.ts:46-67` placeholder fallback deleted.

**Acceptance:** ACC-BADGE-1 every manifest `badgeKey` exists in the endpoint response for a ROOT user; ACC-BADGE-2 no service renders a badge without a key.

## WP-3.5 Activity consumers (D7 read side)

- Pillar dashboard activity feed (last 50, filter by pillar, severity).
- `_PillarOverviewBase` "Last activity" per service from `/activity/summary`.
- Console `useActivityStream()` hook (endpoint from WP-2.1) updates the feed and badges live.
- `platform.activity-prune` job.

**Acceptance:** ACC-ACT-5 prune deletes rows older than 180 d only; ACC-ACT-6 (e2e) a new activity appears in the dashboard feed without reload.

## WP-3.6 Queue operations → queues live

- `GET /api/internal/queues`: per queue `waiting, active, delayed, completed1h, failed1h, dlqDepth` (from the DLQ queue, fixing `QueuesListPage.tsx:39`), `throughputPerMin` (completed in last 5 min / 5), `lastProcessedAt` (newest completed job `finishedOn`), `paused`.
- `GET /api/internal/queues/:name/jobs?state=failed|waiting|delayed|completed&cursor` → real jobs (id, name, attemptsMade, failedReason, timestamps, data redacted with `platform-redaction.service`).
- `POST /api/internal/queues/:name/dlq/replay` (`platform.queues.replay`, dangerous): moves selected or all DLQ jobs back to the source queue with original data; records count.
- `POST /api/internal/queues/:name/clean` (`platform.queues.purge`, dangerous): clean `completed|failed` older than N hours.
- `POST /api/internal/queues/:name/pause|resume` (`platform.queues.replay`, dangerous).
- `QueueMessageViewer` uses the jobs endpoint; its 220 fake messages are deleted.

**Acceptance:** ACC-Q-1…5 (catalogue).

## WP-3.7 System health → health live

- `services/metrics/request-metrics.ts`: Fastify `onResponse` hook records duration and status per route group (first two path segments) into Redis minute buckets (HDR-style fixed buckets for percentiles); retention 24 h.
- Worker heartbeat: every worker sets `worker:<name>:heartbeat` (TTL 60 s) every 20 s.
- `GET /api/internal/health` → `{ db: {latencyMs}, redis: {latencyMs}, uptimeSeconds, version, http: { p50, p95, p99, errorRate5xx, rpm } (last 15 min), routes: top 10 by p95, workers: [{ name, alive, lastBeat }], queuesSummary }`.
- `SystemMetrics` cards (`:10,11,17`) and badges (`badges.ts:58-66`) use it.

**Acceptance:** ACC-HLTH-1…3 (catalogue).

## WP-3.8 Background jobs → jobs live

Migration 0054; `registerScheduledJob` wrapper writing `ScheduledJobRun`; endpoints list/history/trigger; page `/platform/jobs`. Contract in catalogue → platform.jobs.

**Acceptance:** ACC-JOB-1…4.

## WP-3.9 Remove the rest of the hardcoded data

Run `no-fake-data.test.ts` with the allowlist emptied; fix every hit. Includes `InternalOpsPage.tsx:92` banner logic (now driven by `DegradedBanner`), `RevenueOverview`, `PlatformOverview`, any `GBP` literal in console pages.

---

## Exit criteria

- [ ] All ACC IDs above green.
- [ ] `no-fake-data` gate passes with an empty allowlist for `apps/super-admin/src`.
- [ ] Manifest: queues, health, jobs, analytics `live`.
- [ ] e2e: dashboard numbers match a seeded fixture exactly; replaying a DLQ job moves it back and the DLQ badge drops.
