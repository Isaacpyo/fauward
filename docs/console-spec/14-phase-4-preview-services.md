# Phase 4 — Preview Services: Live or Gone

**Outcome:** every remaining service either has a producer, a dedicated page and real effects, or is `deferred` with its dead models, routes and jobs removed. `InternalOpsPage`, `WorkflowOpsPage` and `console-phases.routes.ts` are deleted.
**Branch:** `console/p4-services` (split into `p4a-platform-revenue`, `p4b-customer-trust`, `p4c-gtm` if PRs get large) · **Prereq:** Phase 3 exit criteria green.
**Services going live:** flags, incidents, integrations, database, dunning, disputes, tax, success, qbr, kyc, secrets, security, pipeline, trials, demos, contracts, attribution, handoff.
**Deferred and removed:** recognition, commissions, kb, partners, pricing.

Each service WP follows the same recipe:
1. Move its backend routes out of `console-phases.routes.ts` into `modules/internal/<pillar>/<service>.routes.ts`, typed Prisma, zod, services in `services/`.
2. Add the producer(s), job(s) and vendor-free default from its catalogue entry.
3. Build `pillars/<pillar>/<service>/` with the service kit; delete its `OpsRoute` registrations.
4. Tenant touchpoint (if any).
5. `ACC-<SVC>-*` tests + e2e spec; manifest → `live`.

---

## WP-4.0 Cross-cutting first

- **WP-4.0a Vendor adapters (D9, S16):** `services/vendors/{launchdarkly,github,pagerduty,stripe,stripe-tax,anrok,persona,complyadvantage,doppler,hubspot,docusign}.adapter.ts`; `VendorError` → 502 `{ error: 'VENDOR_ERROR', vendor, degraded: true }`; replace `vendorJson`/`vendorUnavailable`. Test: each adapter's `isConfigured()` false → service uses native path; adapter throws → handled 502.
- **WP-4.0b Deferred services:** recognition, commissions, kb, partners, pricing → manifest `deferred`; delete their routes (`/api/internal/commissions*`, `/partners*`, `/pricing*`), the `revenue.commission-aggregation` job, and UI registrations.
- **WP-4.0c Drop dead models (D10):** migration 0062 with pre-check. Production run waits for owner approval.

## Platform

| WP | Service | Summary (contract in catalogue) |
|---|---|---|
| 4.1 | platform.flags | Native `TenantFeatureOverride` UI (list per flag/per tenant, set, revoke, expiry); flag catalogue = `planService` feature keys + registered runtime flags (`config/flags.ts`); LaunchDarkly mirror with per-tenant targeting (`addTargets`/`removeTargets` on context kind `tenant`) when configured; releases from GitHub when configured, else backend `/version` + console build info |
| 4.2 | platform.incidents | Native incidents (migration 0056): create/update/resolve, severity, commander, tenant impacts, public updates → `PlatformAnnouncement` (type `INCIDENT`) to impacted tenants (or all), postmortem; runbook CRUD; escalations page (from WP-2.11) folded in; PagerDuty inbound kept as optional producer; TopBar on-call/active-incident pill |
| 4.3 | platform.integrations | `platform.integration-health-poll` job (cheap authenticated call per configured provider: Stripe `balance.retrieve`, SendGrid `scopes`, Twilio account fetch, carrier APIs if configured); error rate from webhook/notification failures (24 h); tenant gateway status from WP-2.12; webhook failures + replay from WP-2.13; credentials view = `SecretCredential` inventory (WP-4.12) |
| 4.4 | platform.database | Read-only: `_prisma_migrations` list (applied/failed/pending vs repo), table sizes and row estimates (`pg_class`/`pg_stat_user_tables`), slow queries from `pg_stat_statements` when the extension is enabled (else `DegradedBanner` naming the extension), connection count. Raw SQL is justified (Prisma cannot express these); every query read-only, parameterised, `platform.database.read` |

## Revenue

| WP | Service | Summary |
|---|---|---|
| 4.5 | revenue.dunning | Migration 0058; default sequence seeded (day 0 email, day 3 email, day 7 email + in-app, day 14 suspend via D3); `DunningEnrollment` created by `invoice.payment_failed`; `revenue.dunning-advance` job executes steps; retry = Stripe `invoices.pay` when configured else "update card" email; sequence editor (DunningStep CRUD); timeline per tenant from `DunningEvent`; `invoice.paid` → enrolment `RECOVERED` + lift; removes the attempt-2 suspend from `handleDunningEvent` (the sequence's suspend step becomes the only billing suspension trigger; update ACC-SUS-2); save-offers page on top of the WP-2.7 backend |
| 4.6 | revenue.disputes | Migration 0057; Stripe `charge.dispute.created/updated/closed` webhooks → `PaymentDispute`; queue with evidence-due countdown; submit evidence (Stripe `disputes.update`) when configured; tenant suspension is **not** automatic (manual decision through D3, `category BILLING`) |
| 4.7 | revenue.tax | `TaxRegistration` CRUD; `TaxExemption` tenant upload (BillingTab: certificate file via storage adapter) → console approve/reject → `Tenant.taxExempt` read by `PLATFORM` invoice creation (tax 0, note on invoice) and by Stripe customer `tax_exempt` when configured; Anrok/Stripe Tax adapters optional (rate lookup) |

## Customer

| WP | Service | Summary |
|---|---|---|
| 4.8 | customer.success | CS console page: health table (WP-3.3 inputs), at-risk list (score < 50 or trend down 2 weeks), expansion candidates (usage > 80% of plan limits), playbooks CRUD; playbook executor job runs steps (`EMAIL_TENANT_ADMINS`, `CREATE_PLATFORM_TICKET`, `NOTIFY_STAFF`, `WAIT(days)`) on trigger (`HEALTH_BELOW`, `TRIAL_ENDING`, `PAYMENT_FAILED`) or manual run; run history |
| 4.9 | customer.qbr | Queue `console-jobs` job `customer.qbr-generate` (P3-2): sections usage, shipments, SLA/exceptions, support, billing/MRR, health, AI usage, risks/opportunities; empty sections say "no data"; HTML stored, PDF export via the existing PDF tooling if present (else HTML download); templates are code-defined |

## Trust

| WP | Service | Summary |
|---|---|---|
| 4.10 | trust.kyc | Manual review queue (migration 0060): staff open a review for a tenant, attach evidence (files via storage adapter), decide APPROVED/REJECTED with reason → `Tenant.kycStatus`; **consumer:** moving a tenant to ENTERPRISE (override or plan change) requires `kycStatus = APPROVED` (409 `KYC_REQUIRED`), and C360 shows it; Persona inquiry when configured; sanctions: `trust.kyc-rescreen-monthly` creates PENDING screenings; ComplyAdvantage when configured, else manual clear/match |
| 4.11 | trust.security | Migration 0065 (`IpBlock.scope`); pages for anomalies (acknowledge/resolve), staff logins, IP blocks (create with expiry/scope, remove), staff sessions (revoke); tenant-user login anomalies included when the anomaly scan covers them (extend the scan to `RefreshToken`/login audit if data exists). Enforcement middleware lands in WP-5.4 |
| 4.12 | trust.secrets | `config/secret-registry.ts` (name, envName, owner, rotateEveryDays, used by); `trust.secret-inventory` job (boot + daily): configured, fingerprint, first/last seen, rotation detected on fingerprint change → `lastRotatedAt` + activity; "expiring" = `lastRotatedAt + rotateEveryDays` within 14 d; console: set owner/policy, mark rotated (dangerous, records who/why); Doppler adapter optional. Values are never read into the API response or logs |
| 4.13 | trust.jit, trust.compliance polish | Move remaining routes to their modules; DPA/subpoena routes removed (not in scope) |

## GTM

| WP | Service | Summary |
|---|---|---|
| 4.14 | gtm.trials | Trial list with activation score (worker, exists), expiring list; tenant trial banner "Request more time" → `TrialExtensionRequest` → console approve (updates `Subscription.trialEnd`, Stripe `trial_end` when configured, `SubscriptionEvent TRIAL_EXTENDED`) / deny → tenant notified |
| 4.15 | gtm.demos | Create demo tenant from code-defined template (seeds admin user with one-time password shown once, sample data generated by a seed function and **flagged as demo**, `status DEMO`, `demoExpiresAt`); share link = `/demo/<token>` on the tenant portal → `POST /api/v1/auth/demo/exchange` → read-only impersonation-style session for the demo admin; expiry job (exists) tears down |
| 4.16 | gtm.attribution | Marketing site (`apps/frontend`) middleware sets first-touch cookie `fw_attr` (utm_*, referrer, landing page, first seen); signup form forwards it to `POST /api/v1/auth/register` → `MarketingAttribution` row (migration 0061); console: by source/campaign/landing page, funnel (visit→signup is out of scope without analytics; funnel starts at signup → activated → paid using tenant/trial/subscription data) |
| 4.17 | gtm.handoff | On `SubscriptionEvent` trial→paid: create `SalesHandoff` with a code-defined checklist document; onboarding queue for CSMs (assign, accept, complete); won-deals view joins `SalesDeal` (if any) |
| 4.18 | gtm.pipeline | `SalesDeal` CRUD (stage, amount, probability, close date, owner, linked tenant); forecasting = Σ amount × probability by month; HubSpot import when configured (`P3-4`, nightly, platform is source of truth for linked tenants) |
| 4.19 | gtm.contracts | `SalesQuote` create/edit; discount > `config.cpq.discountApprovalPercent` (default 20) or term > 24 months → `CustomContract` + `ContractApproval` needing `gtm.contracts.discount.large`; accept → `MsaAgreement` (manual signed-PDF upload or DocuSign envelope **with the generated quote PDF and signer recipients** when configured; DocuSign completed webhook marks signed); signed contract creates `PricingOverride` (ACTIVE) consumed by MRR and the tenant's subscription price |

## WP-4.R Relay on console auth (B6, S13, L2, L20)

- Console calls Relay through the backend: `/api/internal/relay/*` proxies to `packages/relay-api` with a service token, or `relay-ui`'s client accepts an injected fetcher so the console uses its cookie session. Pick whichever needs fewer changes to `relay-api`; document the choice in `00-decisions.md` corrections.
- `relay-api` (`packages/relay-api/src/index.ts:135`): refuses to start without `JWT_ACCESS_SECRET` outside development; never decodes without verification; dev tenant-id bypass (`relay.routes.ts:90,98`) only when `NODE_ENV=development`.
- AI draft approve-and-send (`relay.routes.ts:213`) gets a caller in the console Relay page.
- Relay conversations can be "converted to ticket" (creates a PLATFORM `SupportTicket` linked by `relayConversationId` in ticket metadata).
- Remove the `/api/v1/platform/relay` stub (already gone in WP-1.1).

## WP-4.Z Delete the generic pages

When every service above is live or deferred: delete `InternalOpsPage.tsx`, `WorkflowOpsPage.tsx`, `pillars/_preview-routes.tsx`, `OpsRoute`, and `console-phases.routes.ts`. Reconciliation test asserts zero usages.

---

## Exit criteria

- [ ] Manifest: 36 `live`, 5 `deferred`, 0 `preview`.
- [ ] `grep -rn "OpsRoute\|InternalOpsPage\|WorkflowOpsPage" apps/super-admin/src` returns nothing; `console-phases.routes.ts` deleted.
- [ ] Every catalogue `ACC-` test for these services green; every service has an e2e spec.
- [ ] ACC-L2-1, ACC-L2-2 and ACC-L20-1 green (WP-4.R; closes S13).
- [ ] Each service passes its vendor-free test with all vendor env vars unset.
- [ ] Migration 0062 pre-check output attached; production run listed under "Needs approval" until approved.
