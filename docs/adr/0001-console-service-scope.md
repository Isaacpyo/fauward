# ADR 0001: Console Service Scope For Re-Audit

**Date:** 2026-05-18
**Status:** Accepted for re-audit baseline
**Drivers:** P2-1, P2-2, P2-4 from `docs/CONSOLE_REMEDIATION_TRACKER.md`

## Context

The internal operations architecture describes 5 pillars and 41 services. The final audit found a mismatch between that service manifest and the physically implemented super-admin surfaces:

| Pillar | Manifest services | Dedicated implementation folders |
|---|---:|---:|
| platform | 9 | 4 |
| revenue | 8 | 2 |
| customer | 8 | 1 |
| trust | 8 | 2 |
| gtm | 8 | 0 |

Many routes are registered through shared generic `OpsRoute` surfaces. That is useful for internal navigation, but it is not the same as a finished service implementation.

## Decision

For the next re-audit, "live service" means a service has a dedicated frontend implementation under `apps/super-admin/src/pillars/<pillar>/<service>/` or an explicitly named page set at the same pillar boundary, and its UI is backed by real API data or a clearly labelled degraded vendor-unconfigured state.

The v1 live scope is:

| Pillar | Live services |
|---|---|
| platform | tenants, impersonation, queues, health |
| revenue | billing, analytics |
| customer | customer360 |
| trust | iam, audit |
| gtm | none |

All other manifest services are preview or deferred until they receive dedicated implementation or are removed from the manifest.

## Service Disposition

| Pillar | Service | Re-audit status |
|---|---|---|
| platform | tenants | live |
| platform | impersonation | live |
| platform | flags | preview |
| platform | queues | live |
| platform | incidents | preview |
| platform | health | live |
| platform | jobs | preview |
| platform | integrations | preview |
| platform | database | deferred |
| revenue | billing | live |
| revenue | dunning | preview |
| revenue | subscriptions | preview |
| revenue | disputes | preview |
| revenue | tax | preview |
| revenue | recognition | deferred |
| revenue | commissions | preview |
| revenue | analytics | live |
| customer | support | preview |
| customer | 360 | live |
| customer | success | preview |
| customer | feedback | preview |
| customer | kb | deferred |
| customer | comms | deferred |
| customer | qbr | preview |
| customer | onboarding | preview |
| trust | iam | live |
| trust | jit | preview |
| trust | audit | live |
| trust | compliance | preview |
| trust | safety | preview |
| trust | kyc | preview |
| trust | secrets | preview |
| trust | security | preview |
| gtm | pipeline | preview |
| gtm | trials | preview |
| gtm | demos | preview |
| gtm | contracts | preview |
| gtm | partners | preview |
| gtm | attribution | preview |
| gtm | pricing | preview |
| gtm | handoff | preview |

## Route Policy

Routes for live services must remain registered and permission gated.

Routes for preview services may remain registered only when the page clearly discloses degraded, sample, or vendor-unconfigured data. Preview routes must not present static data as operational truth.

Routes for deferred services should be removed from prominent navigation or display an explicit "Coming soon" state until the service is implemented.

The follow-up implementation should add a reconciliation check that compares the architecture route map, `PILLARS` manifest, and router registrations. That check is tracked by P2-2.

## Customer 360 Tab Scope

The architecture's canonical Customer 360 tabs remain:

Overview, Usage, Billing, Tickets, Health, Audit, People, Config, Notes.

The extra Dunning, Incidents, Pipeline, and Attribution views are valid contextual panels but are not canonical top-level tabs for v1 until the Customer 360 isolation work is complete. P2-4 remains open until each canonical tab has independent data fetching, an isolated failure boundary, and a permission gate.

## Consequences

The next re-audit should report 9 live services unless additional services are promoted from preview to live before the re-audit.

The 41-service count may still be tracked as the long-term architecture target, but operational readiness should not claim 41 live services until the manifest and implementation agree.

Product and engineering must explicitly supersede this ADR before any preview or deferred service is presented as live in release notes, SOC 2 evidence, or operator training.
