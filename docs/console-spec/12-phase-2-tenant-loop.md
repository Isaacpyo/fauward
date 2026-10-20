# Phase 2 — Close the Tenant Loop

**Outcome:** everything a tenant does that needs a human at Fauward shows up in the console, staff can act on it, and the answer goes back to the tenant (in-app + email). The tenant portal stops faking writes, so console data is true.
**Branch:** `console/p2-tenant-loop` · **Prereq:** Phase 1 exit criteria green.
**Services going live:** support, safety, compliance, subscriptions, feedback, comms, onboarding.
**Flows:** each interaction's round-trip is specified in `21-tenant-loop-map.md` as L1–L20. This file orders the work.
**Order:** 2.0 → 2.1 → 2.2 first (foundations). After that, any order; the suggested order follows tenant impact.

---

## Foundations

### WP-2.0 Stop the fiction (re-audit §7)
Tenant-portal fakes poison every console metric. Remove them before wiring anything else.

| Fake | Fix |
|---|---|
| `CreateShipmentWizard.tsx:78-93` invents `FWD-…` | Call `POST /api/v1/shipments` (`shipments.routes.ts:266`) with the wizard payload mapped to its schema; show the real tracking number; surface validation errors per step |
| `BillingTab.tsx:22-25` plan change toast; "Manage billing" hardcoded URL | Replaced by WP-2.7 |
| `ApiKeysTab.tsx:17-80` browser-generated keys | Delete the tab; Settings links to the real `DeveloperPage` keys section |
| `WebhooksTab.tsx` mock endpoints and random test results | Delete the tab; link to the real `DeveloperPage` webhooks section |
| `ShipmentsListPage.tsx:250-269,389-397` bulk actions | Wire assign/status/export/print to existing routes; remove any action with no backend (list each removal in the PR) |
| `ShipmentDetailPage.tsx:94,276,310` contact/upload/notes no-ops | Wire to existing documents/notes routes or remove the controls |
| `StepFirstShipment`, `StepPayments`, `StepInviteTeam` simulated; `OnboardingPage.tsx:49-56` marks steps on click | WP-2.17 |
| `TicketsListPage.tsx:52-90` saves fake `SUP-#####` to localStorage on failure | Show the error and keep the form state; no fake ticket |
| Fabricated fallbacks: `TenantDashboardPage.tsx:141-293`, `TenantFinancePage.tsx:286-400`, `AnalyticsPage.tsx:541-579`, `LiveMapPage.tsx:30-60`, `TrackingResultPage.tsx:20,151`, `hooks/useBilling.ts:7-33,103-117`, `hooks/useTenant.ts:12-30,170-184` | Replace with loading/error/empty states. Public tracking shows "Tracking number not found" instead of inventing a result |
| `CommandPalette.tsx:18-33` calls missing `/api/search` | Implement `GET /api/v1/search?q=` (shipments by tracking number/reference, customers, invoices — tenant-scoped) or remove the palette search |
| `pages/AppPages.tsx` static CRM/finance detail, `/book` submit, links to `/crm/new`, `/team/invite` | Route to the real CRM/finance/team pages if they exist; otherwise remove the routes |
| `OperationsOverviewPage.tsx:35-50` "Coming soon" cards | Remove the cards (or link to real pages) |
| `router/index.tsx` dead legacy router stranding `features/driver/*`, `features/admin/*` | Delete the router; move any still-needed page into the live router; delete the rest |
| No-handler buttons: `PageShell.tsx:97`, `ListPageTemplate.tsx:119,122`, `LabelsPage.tsx:80`, `PricingCalculatorPage.tsx:97`, `ReportsPage.tsx:132` | Wire or remove |
| `ProfileTab.tsx:266` MFA button permanently disabled | Out of console scope; leave disabled with tooltip "Coming soon" and log it in `docs/implementation-status.md` |

Gate test `no-fake-data.test.ts` (architecture §11) runs over the tenant portal from this WP on.
**Acceptance:** ACC-TP-1 creating a shipment in the wizard creates a DB row and a `PlatformActivity`/usage increment (after 2.1); ACC-TP-2 gate test green; ACC-TP-3 each fallback page renders an error state when its API fails (component tests).

### WP-2.1 Platform activity: projection and read side (D7)
Builds on WP-1.0 (table + `recordActivity`). Adds the outbox projection for existing `shipment.*`/`tenant.*` events (their producers now fill `OutboxEvent.tenantId`), and the read endpoints `GET /api/internal/activity`, `GET /api/internal/activity/summary` and `GET /api/internal/activity/stream` (SSE: cookie session, events filtered by the caller's permissions via event `service` → manifest `requiredPermission`, heartbeat every 25 s, closes on session expiry). Customer 360 gains its Activity tab. Dashboards consume these in Phase 3.
**Acceptance:** ACC-ACT-1 a ticket creation writes exactly one activity row (dedupeKey) even if the handler retries; ACC-ACT-2 `/activity?tenantId=` returns only that tenant's rows; ACC-ACT-3 summary returns the latest `occurredAt` per service; ACC-ACT-4 an SSE client without `customer.support.read` never receives `customer.support` events.

### WP-2.2 Notifier + staff notifications (D6, C1)
Builds on WP-1.0's `PlatformNotifier` and bell. Adds: worker SMTP transport (`SMTP_URL`, Mailpit on the VM) and `SKIPPED` behaviour; the new email templates; migration of every C1 call site (tenant-side ones too: finance, driver, crm, auth, payments); gate test `no-direct-notification-log.test.ts`. Notification delivery log page `/customer/comms/delivery-log` (replaces legacy `LogsPage`, `customer.comms.read`; sensitive view = dangerous).
**Acceptance:** ACC-NOT-1 an appeal decision enqueues an email job and creates an in-app notification for every TENANT_ADMIN; ACC-NOT-2 without `SENDGRID_API_KEY` and `SMTP_URL` the log is `SKIPPED`, no throw; with `SMTP_URL` the email arrives in Mailpit; ACC-NOT-3 gate test green; ACC-NOT-4 staff with `trust.safety.read` get a `StaffNotification` when an appeal is filed.

---

## Interactions

| WP | Interaction (loop map) | Service going live | Key deliverables |
|---|---|---|---|
| 2.3 | L1 Support tickets | customer.support | D5 model; tenant "Contact Fauward" (PLATFORM tickets); console desk with assignment, SLA timers, macros (existing route), staff/internal notes, reply → tenant in-app + email; escalate end-customer ticket → linked PLATFORM ticket |
| 2.4 | L3 Suspension appeal | trust.safety | Appeal → staff notification → decision → `liftSuspension` → tenant notified; tenant sees appeal status; fraud signals queue page; AUP = fraud signals with `category AUP`; rules page lists code-defined auto-rules read-only |
| 2.5 | L4 DSAR | trust.compliance | Request types incl. ERASURE; `trust.dsar-gather` job; storage adapter; authenticated download; erasure executor; legal hold list/create/**release**; `/dpa` and `/subpoenas` routes removed from the manifest (fold into compliance as document records later or not at all) |
| 2.6 | L5 Region change | (tenants) | `RegionChangeRequest` model; approve applies `tenant.region` (+ dependent settings via `regionService` if one exists; else only `tenant.region`); tenant notified; `/dev` endpoint deleted or behind `NODE_ENV=development` + auth |
| 2.7 | L6 Plan change / billing | revenue.subscriptions | Plan-change endpoint: Stripe Checkout/subscription update when configured, else `PlanChangeRequest` for staff approval; Stripe billing portal session endpoint; webhooks (`customer.subscription.*`, `invoice.*`) update `Subscription`, write `SubscriptionEvent`, `PLATFORM` invoices, `DunningEvent`; save offers end to end: create + approve (`POST /dunning/save-offers`, `…/:id/approve` generates the code) and tenant redeem; console subscription list/detail fixed (`:id` honoured), contracts/overrides applied to MRR |
| 2.8 | Feature requests + NPS (new channel) | customer.feedback | `FeedbackItem`; tenant "Send feedback / Request feature" (help menu + PlanGate "Request access"); NPS prompt (in-app, 90-day cadence per user, `customer.nps-survey-dispatch` job decides eligibility); console triage board; status changes notify the requester |
| 2.9 | L18 Impersonation visibility | (impersonation) | D8 tenant side: staff-access tab, active banner, notification on start |
| 2.10 | L16 AI usage / limits | (customer.360, tenants) | Console reads `TenantAiUsage`, `AiAgentRun`, `AgentAction`; set `TenantAiLimit` (`PUT /tenants/:id/ai-limit`, dangerous); tenant notified; usage in C360 AI tab; `llm-gateway` enforces the limit (verify; add if missing) |
| 2.11 | L15 Exceptions / escalations | (platform.incidents) | Tenant exceptions page (list + escalate with reason); escalation → `PlatformActivity CRITICAL` + staff notification; control-tower + `/api/v1/platform/tracking/*` moved to console auth under `/api/internal/operations/*` (`platform.incidents.read/write`); console page `/platform/incidents/escalations` (assign, resolve, reply to tenant); WS room `escalations:all` replaced by the activity SSE stream |
| 2.12 | L11 Tenant gateway config | (platform.integrations) | `TenantPaymentGateway` (encrypted); tenant `IntegrationsTab` saves through the API (no localStorage, S12); "Test connection" verifies with the provider; console sees provider/mode/status/last error (never secrets) in C360 Config and Integration Health |
| 2.13 | L9, L10 API keys, webhooks | (customer.360, platform.integrations) | Console: revoke tenant API key (`POST /tenants/:id/api-keys/:keyId/revoke`, dangerous, tenant notified); webhook failures + replay on console auth (`/api/internal/integrations/webhooks/failures`, `/api/internal/integrations/webhooks/deliveries/:id/replay`) |
| 2.14 | L8 Announcements | customer.comms | Edit/archive/delete UI; targeting preview (count of tenants/users); `AnnouncementReceipt` writes from the tenant banner; receipts summary per announcement; "New announcement" is a real dialog |
| 2.15 | L13 Tenant team | (customer.360) | Users/invites/role changes/suspensions emit activity; C360 People tab: role, status, invited/accepted, last login, MFA, locked; console "Lock user" / "Unlock user" (`POST /tenants/:id/users/:userId/lock` · `/unlock`, dangerous; `User.lockedAt`), tenant admins notified |
| 2.16 | L17 Tenant audit log | trust.audit | Fix `AuditLogPage.tsx:12` path (`/v1/audit-log`); console cross-tenant search over `AuditLog` (`GET /api/internal/audit/tenant-events`, `trust.audit.read`, tenant filter required unless `trust.audit.export`) |
| 2.17 | L7 Onboarding | customer.onboarding | Server-side checklist (`usage.service.ts:81`) is the only truth; `Tenant.onboardingSteps` written by events (first shipment, payment gateway verified, teammate accepted invite, branding set, domain verified), not by clicks; tenant steps call real endpoints; console funnel + stuck-tenant list + "nudge" action (email template) |
| 2.18 | L19 Usage inputs | (customer.success) | Worker increments `UsageRecord.emailsSent/smsSent` on SENT; document/POD upload increments `storageMb`; returns/customs/documents/AI usage exposed to health scoring (consumed in WP-3.3) |

Relay (L2, L20) is in Phase 4 (WP-4.R) per re-audit phasing.

Each WP's acceptance tests are the `ACC-` IDs on the matching service in `20-service-catalogue.md` plus the `ACC-L<n>-*` IDs in `21-tenant-loop-map.md`.

---

## Exit criteria

- [ ] All `ACC-L1…L19` round-trip tests green (L2/L20 are Phase 4).
- [ ] Gate tests green: `no-fake-data` (both apps), `no-direct-notification-log`, `single-suspension-path`, `ledger-kind`.
- [ ] Manifest: support, safety, compliance, subscriptions, feedback, comms, onboarding set `live`.
- [ ] e2e golden path (tenant + console, two browsers): tenant files a PLATFORM ticket → staff bell shows it → staff replies → tenant gets in-app + email (Mailpit on the VM) → tenant requests a plan change (no Stripe) → staff approves → tenant entitlements change → tenant raises a feature request → staff marks PLANNED → tenant sees status.
- [ ] Every `PlatformActivity` type listed in `21-tenant-loop-map.md` for L1–L19 is emitted (test enumerates them).
