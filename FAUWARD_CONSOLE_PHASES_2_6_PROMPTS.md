# Fauward Console — Phase 2-6 Execution Prompts

> **Companion to:** `FAUWARD_INTERNAL_OPS_ARCHITECTURE.md`, `FAUWARD_CONSOLE_CODEX_PROMPTS.md`, `FAUWARD_CONSOLE_TESTING_GUIDE.md`
> **Format:** One self-contained prompt per phase. Paste into Codex with plan mode ON.
> **Prereq for Phase 2:** Phase 0 + Phase 1 verified (billing refund security fix landed).

---

## Phase trigger map

| Phase | Trigger | Services | Estimated effort |
|---|---|---|---|
| 2 | ~50 tenants OR support burning out | Support Desk, CS Console, Dunning Manager, Incident Management | 4-6 weeks |
| 3 | ~100 tenants OR pursuing first enterprise deal | JIT Access, Compliance Operations, Trust & Safety, Feature Flags | 4-6 weeks |
| 4 | Pre-SOC 2 audit | Secret Management, Security Monitoring, KYC & Sanctions, Integration Health, Tax & Compliance | 6-8 weeks |
| 5 | First enterprise deal signed | Subscription Manager (custom contracts), CPQ & Contracts, QBR Center | 4-5 weeks |
| 6 | Scale + GTM hires its own ops | Sales Pipeline, Partner Portal, Reseller Commissions, Marketing Attribution, remaining services | 6-10 weeks |

Don't start a phase until its trigger fires. Building Phase 6 at 30 tenants wastes time on tooling that won't get used.

---

# Phase 2 — Customer & Reliability

````markdown
# Phase 2: Customer Operations + Incident Management

## Goal
Build the four services that stop support and reliability from being run out of email + Slack:

  3.1 Support Desk         (/customer/support)
  3.3 CS Console           (/customer/success)
  2.2 Dunning Manager      (/revenue/dunning)
  1.5 Incident Management  (/platform/incidents)

## Reference
- docs/FAUWARD_INTERNAL_OPS_ARCHITECTURE.md
  → §6.2 Dunning Manager
  → §7.1 Support Desk
  → §7.3 CS Console + health scoring factors
  → §5.5 Incident Management
  → Appendix A: Buy decisions for this phase
- docs/FAUWARD_CONSOLE_TESTING_GUIDE.md (Phase 1 patterns apply identically)
- apps/super-admin/INVENTORY.md (read for current state)

## Buy vs build for this phase
- Support Desk:    BUY (Plain or Zendesk; pick one before this prompt runs).
                   BUILD: deep links from anywhere with a tenant context
                          into a ticket and the inverse — embed ticket
                          summary in Customer 360.
- CS Console:      BUILD entirely. Health scoring is domain-specific.
- Dunning Manager: BUILD. Stripe handles retries; you handle comms,
                   suspension, and save-the-customer flows.
- Incident Mgmt:   BUY (Incident.io or PagerDuty for paging + war-room).
                   BUILD: tenant-impact mapping layer.

If a vendor decision hasn't been made for Support Desk or Incident Mgmt,
STOP and ask before proceeding — these are foundational integrations.

## Sequence (separate commits, in this order)

### 2.1 — Dunning Manager (do this first; it's pure build)
Pages per architecture §6.2:
  /revenue/dunning                      (failed payment queue)
  /revenue/dunning/:tenantId            (timeline for one tenant)
  /revenue/dunning/sequences            (configure email/action sequences)
  /revenue/dunning/save-offers          (save-the-customer approval queue)

Backend (apps/backend, mounted at /api/internal/dunning):
  GET  /failed-payments
  GET  /timeline/:tenantId
  POST /retry/:invoiceId        (manual retry)
  POST /save-offers              (issue discount/credit)
  GET  /sequences
  PATCH /sequences/:id

Data: extend prisma/schema.prisma with:
  DunningSequence  (name, steps Json, active)
  DunningStep      (sequenceId, dayOffset, action, template)
  SaveOffer        (tenantId, discount, expiresAt, status, approvedBy)

Permissions:
  revenue.dunning.read, revenue.dunning.write

Tests: refund-style coverage. Boundary cases:
  - retry attempts > max → suspends tenant (writes audit)
  - save-offer issuance > £100 requires revenue.dunning.write
  - sequence change writes audit

Commit: feat(dunning): manager service with sequences and save offers

### 2.2 — Incident Management (Incident.io or PagerDuty integration)
Pages per architecture §5.5:
  /platform/incidents                   (active + recent)
  /platform/incidents/:id               (timeline + affected tenants)
  /platform/incidents/:id/postmortem    (link out)
  /platform/incidents/runbooks          (markdown library)

Vendor integration:
  - Webhook receiver at /api/internal/incidents/webhooks/<vendor>
  - Pulls incidents on demand for the list view (don't replicate vendor's UI)
  - Posts updates back to vendor when impact is annotated

The differentiating layer: tenant-impact mapping.
For each incident, staff can tag affected services AND affected tenants.
Maintain an IncidentTenantImpact join table. Customer 360 surfaces:
  "This tenant was affected by 2 incidents in the last 30 days" with links.

Permissions:
  platform.incidents.read, platform.incidents.write

Commit: feat(incidents): vendor integration with tenant-impact mapping

### 2.3 — Support Desk (Plain or Zendesk integration)
Pages per architecture §7.1:
  /customer/support                     (embedded ticket queue)
  /customer/support/sla                 (SLA breach risk dashboard)
  /customer/support/macros              (canned responses, surfaced from vendor)

Build the deep-link layer:
  - Every TenantChip in the console shows ticket count + most recent ticket
  - Customer 360 "Tickets" tab pulls from vendor API
  - Audit log entries for tickets created on a tenant's behalf are linked

Permissions:
  customer.support.read, customer.support.write

Commit: feat(support): vendor integration with Customer 360 deep linking

### 2.4 — CS Console + health scoring (the big one)
Pages per architecture §7.3:
  /customer/success                     (CSM book of business)
  /customer/success/at-risk             (churn risk queue)
  /customer/success/expansion           (expansion-ready accounts)
  /customer/success/playbooks
  /customer/success/playbooks/:id/runs
  /customer/success/health-scoring      (model configuration)

Health scoring computation (per architecture §7.3):
  Composite 0-100 from weighted factors:
    - Login recency × frequency           (weight: 20)
    - Shipment volume trend (30/60/90d)   (weight: 25)
    - Feature breadth adoption            (weight: 15)
    - Payment health                      (weight: 15)
    - Ticket sentiment & volume           (weight: 15)
    - NPS response                        (weight: 10)

Implement as a nightly job (BullMQ) that:
  1. Computes score per active tenant
  2. Writes TenantHealthScore row (table from §11)
  3. Compares to previous score → assigns trend (up/flat/down)
  4. Triggers playbook runs for crossing thresholds

Playbook system:
  - Playbooks defined as JSON in CSPlaybookRun.steps
  - Step types: send_email, create_ticket, notify_csm, suspend_warning
  - Steps execute sequentially with status tracking

Permissions:
  customer.success.read, customer.success.write

Commit: feat(cs-console): health scoring + playbooks

## Cross-cutting requirements
For every service:
1. PermissionGate on every route
2. requirePermission middleware on every backend mutation
3. Audit log entries for all mutations
4. RBAC matrix entries for all new routes
5. Customer 360 deep linking — Tickets tab, Health tab, Dunning state, Incident impact

## Verification (final commit of phase)
Run the Phase 0/1 verification prompt structure against Phase 2:

  npm run typecheck
  npm run lint --workspaces --if-present
  npm run build --workspaces --if-present
  npm run test --workspaces --if-present
  npx playwright test apps/super-admin/e2e/critical/

Add Phase 2 to the verification report with its own gate checklist:
  [ ] Dunning queue surfaces all failed payments from Stripe
  [ ] Save-offer approval thresholds enforced
  [ ] Incident impact mapping shows in Customer 360
  [ ] Support tickets visible in Customer 360 Tickets tab
  [ ] Health scoring runs nightly without errors
  [ ] At-risk queue sorted by ARR × churn probability
  [ ] Playbook executes end-to-end for a test tenant
  [ ] All Phase 2 routes have RBAC matrix entries
  [ ] No regressions in Phase 0/1 functionality

Commit: docs: phase 2 verification report

## Constraints
- Do NOT modify Phase 0/1 services beyond adding Customer 360 tabs
- Do NOT integrate two support vendors — pick one
- Do NOT compute health scores synchronously in API requests — async only
- Vendor API credentials go through @fauward/secret-management
  (which doesn't exist yet, so use AWS Secrets Manager directly for now
   and migrate when Phase 4 lands)
````

---

# Phase 3 — Trust & Compliance Foundation

````markdown
# Phase 3: Compliance + Trust & Safety + Feature Management

## Goal
Build the four services that unblock enterprise sales and SOC 2 prep:

  4.2 Just-in-Time Access     (/trust/jit)
  4.4 Compliance Operations   (/trust/compliance)
  4.5 Trust & Safety          (/trust/safety)
  1.3 Feature Flags & Releases (/platform/flags)

## Reference
- docs/FAUWARD_INTERNAL_OPS_ARCHITECTURE.md
  → §8.2 Just-in-Time Access
  → §8.4 Compliance Operations + DSAR workflow
  → §8.5 Trust & Safety
  → §5.3 Feature Flags & Releases
- Architecture §11: JitAccessRequest, DSARRequest, LegalHold, FraudSignal models

## Buy vs build for this phase
- JIT Access:        BUILD (tightly integrated with Phase 1 IAM)
- Compliance Ops:    BUILD (DSAR is domain-specific, audit-heavy)
- Trust & Safety:    BUILD core + integrate Persona (KYC) and ComplyAdvantage
                     (sanctions) in Phase 4. For now, manual review queue only.
- Feature Flags:     BUY (LaunchDarkly or Statsig). BUILD: per-tenant override UI

If LaunchDarkly/Statsig hasn't been chosen, STOP and ask.

## Sequence

### 3.1 — Just-in-Time Access (foundation for everything else)
Pages per architecture §8.2:
  /trust/jit/request                    (request elevated access)
  /trust/jit/pending                    (approval queue)
  /trust/jit/active                     (currently elevated sessions)
  /trust/jit/audit                      (historical elevations)

Critical workflow:
  1. Staff member requests permission X with reason + duration (max 4h)
  2. Approval required from a DIFFERENT staff member (no self-approval)
  3. ROOT requests need TWO approvers + hardware key
  4. On approval, JitAccessRequest.status = APPROVED, expiresAt set
  5. Auth middleware checks both standing permissions AND active JIT grants
  6. On expiry, automatic revocation
  7. All actions during elevated session double-tagged in AuditLog
     with jit_session_id

Backend:
  POST   /api/internal/jit/requests
  GET    /api/internal/jit/requests/pending
  POST   /api/internal/jit/requests/:id/approve
  POST   /api/internal/jit/requests/:id/deny
  GET    /api/internal/jit/sessions/active
  POST   /api/internal/jit/sessions/:id/revoke

Update existing requirePermission middleware:
  - Reads standing perms (from roles)
  - PLUS reads active JIT grants for this user
  - Logs which source granted the permission (standing vs JIT)

Frontend:
  - <JITGate> in @fauward/internal-ui (already scaffolded) — wire up
  - Anywhere a permission is missing, show "Request elevated access" prompt
  - Active elevation banner (similar to ImpersonationBanner)

Tests:
  - Self-approval rejected (403)
  - Cross-approval succeeds
  - ROOT requires two distinct approvers
  - Expired grants don't authorize
  - Concurrent JIT + standing perms work correctly
  - Revocation takes effect immediately (next request fails)

Commit: feat(jit): just-in-time elevation with cross-approval

### 3.2 — Compliance Operations (GDPR DSAR + legal hold)
Pages per architecture §8.4:
  /trust/compliance/dsar                (DSAR queue)
  /trust/compliance/dsar/:id            (DSAR detail + workflow)
  /trust/compliance/legal-hold          (active holds)
  /trust/compliance/legal-hold/:id      (hold scope + affected data)
  /trust/compliance/exports             (bulk export queue)
  /trust/compliance/dpa                 (DPA tracking)
  /trust/compliance/subpoenas           (subpoena response)

DSAR workflow state machine:
  RECEIVED → IDENTITY_VERIFIED → DATA_GATHERED → REVIEWED →
    RESPONSE_DRAFTED → APPROVED → DELIVERED → CLOSED

Each transition:
  - Requires permission trust.compliance.dsar.write
  - Captures actor + timestamp + notes
  - Writes audit entry
  - Updates SLA countdown (30 days from RECEIVED)

Backend:
  POST   /api/internal/compliance/dsar           (intake form)
  GET    /api/internal/compliance/dsar
  PATCH  /api/internal/compliance/dsar/:id      (state transition)
  POST   /api/internal/compliance/dsar/:id/gather (trigger data collection job)
  POST   /api/internal/compliance/dsar/:id/deliver (signed S3 URL)

Data gathering job (BullMQ):
  - For ACCESS request: pulls user data across all services into a JSON bundle
  - For ERASURE: identifies all references, presents them for review
  - For PORTABILITY: generates structured export (JSON-LD + CSV)
  - Writes to S3 with 30-day signed URL expiry

Legal hold:
  - When created, blocks deletion across all services for matching scope
  - Hooks into existing delete handlers (Tenant, User, Invoice, etc.)
  - Active legal holds prevent ERASURE DSARs from completing

Permissions:
  trust.compliance.dsar.read, trust.compliance.dsar.write
  trust.compliance.legal-hold.read, trust.compliance.legal-hold.write

Commit: feat(compliance): DSAR workflow + legal hold

### 3.3 — Trust & Safety (manual review only at this stage)
Pages per architecture §8.5:
  /trust/safety/fraud                   (fraud signal queue)
  /trust/safety/aup                     (AUP violation queue)
  /trust/safety/suspensions             (suspended tenants)
  /trust/safety/appeals                 (appeal queue)
  /trust/safety/rules                   (placeholder for Phase 4 — empty page)

For Phase 3, build the queue infrastructure. Signal sources:
  - Manual flagging from any staff member ("Flag this tenant" button)
  - Stripe Radar webhook (payment fraud) — wire the webhook receiver
  - Velocity rules (signups from same IP in short window) — simple Postgres query
  - Customer reports (form on public-facing help)

DON'T BUILD YET (Phase 4):
  - Persona KYC integration
  - ComplyAdvantage sanctions screening
  - Automated rule engine
  - The /trust/safety/rules configuration UI

Suspension flow:
  1. Staff member opens fraud signal
  2. Reviews evidence (linked tenant + signal payload)
  3. Decision: suspend / dismiss / escalate
  4. Suspension writes to Tenant.status + AuditLog + SuspensionRecord
  5. Tenant receives email; CS team notified via Slack webhook

Appeals:
  - Tenant submits via existing tenant portal (small change there to surface form)
  - Appeals appear in /trust/safety/appeals
  - Resolution: uphold / overturn → triggers status change

Permissions:
  trust.safety.read, trust.safety.suspend

Commit: feat(safety): fraud queue + suspension + appeals

### 3.4 — Feature Flags (LaunchDarkly integration)
Pages per architecture §5.3:
  /platform/flags                       (flag list)
  /platform/flags/:key                  (flag detail + per-tenant overrides)
  /platform/flags/:key/audit            (change history)
  /platform/releases                    (recent deploys, current version per service)

Pure integration — don't replicate LaunchDarkly's UI. Embed:
  - Flag list view via LD API
  - Per-tenant override UI (the differentiating layer)
  - Audit history pulled from LD's audit API

Per-tenant overrides:
  - Search tenant → select flag → set value (true/false/string/number)
  - Writes to LD via API + writes Fauward AuditLog entry
  - Override persistence is in LD, not Fauward DB

Releases page:
  - Pulls from existing CI/CD (GitHub Actions or whatever)
  - Shows current version per service across regions
  - Rollback button → triggers GitHub workflow

Permissions:
  platform.flags.read, platform.flags.write

Commit: feat(flags): LaunchDarkly integration with per-tenant override UI

## Cross-cutting requirements
- Every Phase 3 service writes audit entries with jit_session_id when applicable
- DSAR exports are themselves audited
- Legal hold blocks deletion in ALL existing delete handlers — find them all
- Fraud queue items deep-link from Customer 360

## Verification

  npm run test --workspaces --if-present
  npx playwright test e2e/critical/

Add Phase 3 gate checklist:
  [ ] JIT request requires reason + non-self approver
  [ ] Expired JIT grants don't authorize
  [ ] DSAR workflow advances through all 8 states with audit at each
  [ ] DSAR exports accessible via signed S3 URL only
  [ ] Legal hold prevents tenant deletion
  [ ] Fraud signals from Stripe Radar appear in queue
  [ ] Tenant suspension via T&S writes to AuditLog and notifies tenant
  [ ] Feature flag override persists in LaunchDarkly
  [ ] Per-tenant flag override audited in Fauward AuditLog
  [ ] All Phase 3 routes in RBAC matrix
  [ ] No regression in Phase 0/1/2

Commit: docs: phase 3 verification report

## Constraints
- ROOT JIT requires hardware key — DO NOT bypass even in dev
  (use a dev-mode hardware key emulator, not a feature flag to skip the check)
- DSAR data gathering must run in a job, not synchronously
- Persona/ComplyAdvantage are Phase 4, not now
- LaunchDarkly is the only source of truth for flag values — do not cache long
````

---

# Phase 4 — SOC 2 Readiness

````markdown
# Phase 4: Security Operations + KYC + Tax + Integration Health

## Goal
Build the five services required for a SOC 2 Type II audit and to operate
multi-region commerce safely:

  4.7 Secret Management        (/trust/secrets)
  4.8 Security Monitoring      (/trust/security)
  4.6 KYC & Sanctions          (/trust/kyc)
  1.8 Integration Health       (/platform/integrations)
  2.5 Tax & Compliance         (/revenue/tax)

## Reference
- docs/FAUWARD_INTERNAL_OPS_ARCHITECTURE.md
  → §8.7 Secret Management
  → §8.8 Security Monitoring
  → §8.6 KYC & Sanctions
  → §5.8 Integration Health
  → §6.5 Tax & Compliance
- SOC 2 control mapping: see Appendix F (add this if missing — propose what
  controls each service satisfies)

## Buy vs build for this phase
- Secret Management: BUY (Doppler or 1Password Secrets Automation).
                     BUILD: rotation tracker + expiry alerting layer.
- Security Monitoring: BUILD anomaly detection on top of existing audit log.
                     INTEGRATE with existing Sentry + Datadog.
- KYC: BUY (Persona). BUILD: review queue + decision workflow.
- Sanctions: BUY (ComplyAdvantage). BUILD: screening orchestration.
- Integration Health: BUILD (this is your operational view).
- Tax: BUY (Stripe Tax + Anrok for non-EU regions).
       BUILD: per-region return tracking + accountant export.

If Persona, ComplyAdvantage, Doppler, or Anrok haven't been procured,
STOP and ask before this prompt runs. Pre-procurement work is wasted.

## Sequence

### 4.1 — Secret Management (Doppler integration)
Pages per architecture §8.7:
  /trust/secrets                        (credential inventory)
  /trust/secrets/expiring               (expiring within 30 days)
  /trust/secrets/audit                  (secret access audit)

CRITICAL: secret VALUES are never displayed. Only metadata.

Doppler integration:
  - Pull secret metadata via Doppler API (no values fetched to backend)
  - Track expiry dates per secret (manually entered, not in Doppler)
  - Alert system: 30-day, 7-day, day-of expiry → Slack to ops channel

Schema additions (extend prisma):
  SecretCredential   (name, doppler_id, expires_at, owner_id, rotation_notes)
  SecretAccessLog    (secret_id, accessed_by, accessed_at, source, justification)

Permissions:
  trust.secrets.read

The secret inventory list MUST include:
  - Stripe live key
  - Stripe test key
  - Twilio auth token
  - SendGrid API key
  - All carrier API keys (per architecture, you have 7 regions × multiple carriers)
  - Database credentials
  - Redis credentials
  - LaunchDarkly SDK key
  - Persona API key (when added in 4.3)
  - ComplyAdvantage API key (when added in 4.3)

Commit: feat(secrets): doppler integration + rotation tracker

### 4.2 — Security Monitoring (anomaly detection + login audit)
Pages per architecture §8.8:
  /trust/security/anomalies             (anomaly queue)
  /trust/security/logins                (failed login monitoring)
  /trust/security/ip-blocks             (blocklist management)
  /trust/security/sessions              (active staff sessions, revoke)

Anomaly detection rules (initial set):
  - Login from new country for staff user
  - Mass data export by single actor (>10 exports / hour)
  - Bulk deletion (>50 records / minute)
  - Failed login spike (>20 failures / 5 min for one account)
  - Privileged action outside business hours (configurable per region)
  - Direct DB access bypass attempt (via DB session monitoring)

Each anomaly becomes a SecurityAnomaly row + Slack alert + queue item.

Login monitoring:
  - All staff login attempts logged (success + failure)
  - Failed attempts from single IP > 5 in 10 min → IP block
  - Geographic impossibility detection (login from UK, then NG within 1 hour)

Active session view:
  - List all StaffSession rows with status=active
  - Revoke button → deletes session, forces re-login
  - Filter by user, role, source IP

Permissions:
  trust.security.read, trust.security.write

Commit: feat(security): anomaly detection + session management

### 4.3 — KYC & Sanctions (Persona + ComplyAdvantage)
Pages per architecture §8.6:
  /trust/kyc/pending                    (verification queue)
  /trust/kyc/:id                        (verification detail)
  /trust/kyc/sanctions                  (sanctions screening)
  /trust/kyc/pep                        (PEP screening)

KYC workflow:
  Tenant signs up for ENTERPRISE plan →
    Persona inquiry created →
    Tenant completes verification on Persona-hosted flow →
    Persona webhook → SOC creates KYCReview record →
    Staff review → approve / reject / request more info →
    Approved → tenant.kyc_status = VERIFIED →
    Tenant unblocked for full feature set

Sanctions screening:
  - Run on every new tenant (not just enterprise) at signup
  - Screen against OFAC, UN, EU, HMT lists via ComplyAdvantage
  - On match: hold tenant in PENDING_REVIEW state until manually cleared
  - Re-screen quarterly for active enterprise tenants

PEP (Politically Exposed Persons):
  - Subset of sanctions screening
  - Higher-risk flag, requires senior approval to onboard

Backend:
  POST   /api/internal/kyc/inquiries
  POST   /api/internal/kyc/inquiries/:id/decision
  POST   /api/internal/kyc/screen          (manual re-screen)
  POST   /api/internal/kyc/webhooks/persona
  POST   /api/internal/kyc/webhooks/complyadvantage

Permissions:
  trust.kyc.read, trust.kyc.approve

Commit: feat(kyc): persona verification + complyadvantage screening

### 4.4 — Integration Health (build entirely)
Pages per architecture §5.8:
  /platform/integrations                (third-party status grid)
  /platform/integrations/:provider      (provider detail)
  /platform/integrations/credentials    (rotation tracker — share with §4.1)
  /platform/integrations/webhooks       (outbound webhook delivery health)

Status grid:
  Each integration tile shows:
    - Provider name + logo
    - Current status (operational/degraded/down) — pulled from vendor status pages
    - Last successful API call (from your access logs)
    - Error rate last 24h
    - Open incidents (from §5.5 Incident Mgmt)

Webhook delivery health:
  - For outbound webhooks (Fauward → tenant systems)
  - Track delivery attempts, retries, failures per tenant
  - Per-tenant dashboard: which webhooks are failing, since when

Backend:
  Webhook delivery already exists somewhere — extend to record metrics
  Status pulled from vendor status APIs (cached 5 min)

Permissions:
  platform.integrations.read, platform.integrations.write

Commit: feat(integrations): health grid + webhook delivery monitoring

### 4.5 — Tax & Compliance (Stripe Tax + Anrok)
Pages per architecture §6.5:
  /revenue/tax                          (per-region dashboard)
  /revenue/tax/returns                  (return periods + filing status)
  /revenue/tax/registrations            (VAT/GST numbers per region)
  /revenue/tax/exemptions               (tenants with exemption certificates)

Per architecture, Fauward operates in 7 regions:
  UK, NG, KE, ZA, GH, EG, AE

Each region has its own VAT/GST regime:
  - UK: 20% VAT, monthly or quarterly returns
  - NG: 7.5% VAT, monthly returns
  - KE: 16% VAT
  - ZA: 15% VAT
  - GH: 12.5% VAT
  - EG: 14% VAT
  - AE: 5% VAT

Stripe Tax handles UK + EU. Anrok handles non-EU (or whatever vendor mix
makes sense — confirm in plan mode).

Returns dashboard per region:
  - Period start / end
  - Tax collected (gross)
  - Tax paid out
  - Net due
  - Filing status: pending / submitted / accepted
  - Export button: CSV + PDF for accountant

Exemptions:
  - Tenant uploads certificate → /trust/compliance reviews → approves
  - On approval, Tenant.tax_exempt = true → no tax collected on invoices

Permissions:
  revenue.tax.read, revenue.tax.write

Commit: feat(tax): multi-region tax dashboard with stripe tax + anrok

## SOC 2 control mapping
Append to architecture spec or create docs/SOC2_CONTROL_MAPPING.md showing
which Phase 4 service satisfies which Trust Service Criteria:

  CC6.1 (logical access)         → Phase 1 IAM + Phase 3 JIT + Phase 4 Security Monitoring
  CC6.6 (encryption)              → Phase 4 Secret Management
  CC7.2 (anomaly detection)      → Phase 4 Security Monitoring
  CC7.3 (incident response)      → Phase 2 Incident Management + Phase 4 Security Monitoring
  CC8.1 (change management)      → Phase 3 Feature Flags + Phase 4 Audit Log
  P1.1 (privacy notice)          → existing (tenant-facing)
  P4.2 (data retention)          → Phase 3 Compliance Operations (legal hold + DSAR)
  P5.1 (data subject rights)     → Phase 3 Compliance Operations (DSAR workflow)

## Verification
  npm run test --workspaces --if-present
  npx playwright test e2e/critical/

Phase 4 gate checklist:
  [ ] All secrets in inventory have expiry tracked
  [ ] Expiring-secret alert fires 30 days before expiry
  [ ] Anomaly: login from new country fires alert + creates queue item
  [ ] Failed login lockout after 5 attempts works
  [ ] KYC verification completes end-to-end with Persona test mode
  [ ] Sanctions match holds tenant in PENDING_REVIEW
  [ ] PEP match requires senior approval to onboard
  [ ] Integration health grid surfaces real provider status
  [ ] Webhook delivery failures appear in per-tenant view
  [ ] Tax: invoice in each of 7 regions calculates correct VAT
  [ ] Tax exemption: exempt tenant pays no VAT on test invoice
  [ ] Tax export produces accountant-readable CSV + PDF
  [ ] SOC 2 control mapping document committed

Commit: docs: phase 4 verification report

## Constraints
- DO NOT store secret values in Fauward DB — Doppler only
- DO NOT skip sanctions screening for any tenant, even test tenants
  (use sandbox mode for test tenants)
- DO NOT cache tax rates beyond Stripe Tax / Anrok response TTL
- KYC documents go to S3 with restricted IAM, never to Fauward DB
- This phase is the LAST stop before SOC 2 readiness assessment.
  Engage SOC 2 auditor (Vanta, Drata, or similar) AFTER this phase lands
  but BEFORE Phase 5.
````

---

# Phase 5 — Enterprise Sales Enablement

````markdown
# Phase 5: Custom Contracts + CPQ + QBR

## Goal
Build the three services that close, retain, and expand enterprise deals:

  2.3 Subscription Manager (custom contracts)  (/revenue/subscriptions)
  5.4 CPQ & Contracts                          (/gtm/contracts)
  3.7 QBR Center                               (/customer/qbr)

## Reference
- docs/FAUWARD_INTERNAL_OPS_ARCHITECTURE.md
  → §6.3 Subscription Manager
  → §9.4 CPQ & Contracts
  → §7.7 QBR Center
- Trigger: first enterprise deal signed (or pipeline shows imminent close)

## Buy vs build for this phase
- Subscription Manager: BUILD. Custom-contract pricing logic is yours.
- CPQ:                  BUILD quote logic + BUY DocuSign for signature.
- QBR Center:           BUILD entirely. Auto-generated decks differentiate.

## Sequence

### 5.1 — Subscription Manager (custom contracts)
Pages per architecture §6.3:
  /revenue/subscriptions                (all subscriptions cross-tenant)
  /revenue/subscriptions/:id            (subscription detail)
  /revenue/subscriptions/contracts      (enterprise MSAs)
  /revenue/subscriptions/overrides      (non-standard pricing approvals)

Today, plans are fixed (PRO, BUSINESS, ENTERPRISE). Custom contracts mean:
  - Per-tenant negotiated pricing (lower per-shipment rate at volume)
  - Custom feature inclusion (some Phase 5 features free, others paid)
  - Custom payment terms (Net 30, Net 60, annual prepay)
  - Custom SLAs (99.9% vs default 99.5%)

Schema additions:
  CustomContract       (tenantId, msa_url, term_start, term_end, terms Json)
  PricingOverride      (tenantId, ruleType, ruleValue, validFrom, validTo)
  ContractApproval     (contractId, approverId, approvedAt, conditions)

Approval thresholds:
  - Discount < 10% → SALES_REP can approve
  - Discount 10-25% → SALES_MANAGER required
  - Discount > 25% → CFO required (new role: CFO with revenue.subscriptions.override.large)

Override application:
  When Stripe invoice is generated for a tenant with an active override,
  the line items reflect the override pricing. Implement as a hook in the
  invoice generation pipeline.

Permissions:
  revenue.subscriptions.read, revenue.subscriptions.write,
  revenue.subscriptions.override

Commit: feat(subscriptions): custom contracts + pricing overrides

### 5.2 — CPQ & Contracts (quote builder + DocuSign)
Pages per architecture §9.4:
  /gtm/contracts/quotes                 (quote builder)
  /gtm/contracts/quotes/:id             (quote detail + approvals)
  /gtm/contracts/discounts              (discount approval queue)
  /gtm/contracts/msas                   (MSA repository)

Quote builder flow:
  1. Sales rep creates quote linked to a deal in §9.1 pipeline (Phase 6 will
     wire pipeline; for now, freestanding deals)
  2. Configure: plan, term, discount, custom features
  3. Quote auto-routes for approval based on §5.1 thresholds
  4. On approval, "Send for signature" button → creates DocuSign envelope
  5. On signature webhook, quote → ACTIVE contract → triggers §5.1 contract creation

DocuSign integration:
  - OAuth setup once
  - Envelope creation via DocuSign eSignature API
  - Webhook receiver at /api/internal/contracts/webhooks/docusign
  - Signed PDF stored in S3, linked to CustomContract.msa_url

MSA repository:
  - Master agreements per tenant (separate from individual quote contracts)
  - Tracks: signature date, expiry, renewal terms, governing law

Permissions:
  gtm.contracts.read, gtm.contracts.write, gtm.contracts.discount.large

Commit: feat(cpq): quote builder + docusign integration

### 5.3 — QBR Center (auto-generated decks)
Pages per architecture §7.7:
  /customer/qbr                         (QBR calendar — who's due)
  /customer/qbr/:tenantId               (auto-generated deck for tenant)
  /customer/qbr/templates               (deck templates per segment)

Deck generation:
  For each enterprise tenant, on a 90-day cycle, generate a QBR deck
  with:
    - Cover slide (tenant logo, period covered)
    - Usage summary (shipments, % YoY, regional breakdown)
    - Health score trend
    - ROI calculation (estimated savings vs prior solution)
    - Top tickets and resolutions
    - Roadmap items relevant to this tenant
    - Renewal/expansion opportunities

Generation method:
  - Template stored as HTML+CSS in /templates/qbr/<segment>.html
  - Server-side render with tenant data → HTML page
  - "Export to PDF" button uses Puppeteer or similar (server-side)
  - "Export to PPTX" optional (uses pptxgenjs or python-pptx via job)

CSM workflow:
  1. CSM opens /customer/qbr → sees calendar
  2. Tenant due for QBR → click → auto-generated deck appears
  3. CSM reviews, edits free-text sections (notes, expansion talk track)
  4. CSM exports PDF → schedules QBR meeting
  5. Post-meeting, CSM logs outcome → next QBR scheduled

Permissions:
  customer.qbr.read, customer.qbr.write

Commit: feat(qbr): auto-generated decks per tenant on 90-day cycle

## Cross-cutting requirements
- New CFO role added to RBAC (only for large-discount approval)
- Contract data flows: pipeline (§5.2) → quote → approval → DocuSign →
  signed contract → §5.1 subscription override → Stripe invoicing
- QBR data pulls from health score (§7.3 Phase 2), tickets (§7.1 Phase 2),
  shipment volume — all existing in earlier phases
- Customer 360 gains a "Contracts" sub-tab under Billing showing active MSAs

## Verification
  npm run test --workspaces --if-present
  npx playwright test e2e/critical/

Phase 5 gate checklist:
  [ ] Quote with 5% discount → SALES_REP can approve
  [ ] Quote with 15% discount → blocked for SALES_REP, allowed for SALES_MANAGER
  [ ] Quote with 30% discount → requires CFO approval
  [ ] DocuSign envelope created and signature webhook received
  [ ] Signed contract triggers subscription override
  [ ] Custom-priced invoice reflects override pricing in Stripe
  [ ] QBR deck generates for test enterprise tenant
  [ ] PDF export works with all data populated
  [ ] CSM can edit free-text sections before export
  [ ] Phase 5 routes in RBAC matrix
  [ ] CFO role has minimal permissions (only override approval + read)
  [ ] No regression in Phase 0-4

Commit: docs: phase 5 verification report

## Constraints
- DO NOT bypass approval thresholds even in dev
- Quote → contract data flow is one-way; do not allow editing of signed contracts
  (require amendment quote instead)
- DocuSign envelope IDs are sensitive — store but don't expose in client UI
- QBR deck generation runs in a job, not synchronously
````

---

# Phase 6 — Go-to-Market Operations

````markdown
# Phase 6: Sales Pipeline + Partners + Attribution

## Goal
Complete the Go-to-Market pillar plus the remaining services that benefit from
GTM having its own ops person:

  5.1 Sales Pipeline           (/gtm/pipeline)
  5.2 Trial Management         (/gtm/trials)
  5.3 Demo Environment Manager (/gtm/demos)
  5.5 Partner Portal Mgmt      (/gtm/partners)
  5.6 Marketing Attribution    (/gtm/attribution)
  5.7 Pricing Experiments      (/gtm/pricing)
  5.8 Sales Handoff            (/gtm/handoff)
  2.7 Reseller Commissions     (/revenue/commissions)

## Reference
- docs/FAUWARD_INTERNAL_OPS_ARCHITECTURE.md
  → §9 entire Pillar 5
  → §6.7 Reseller Commissions
- Trigger: GTM has its own ops person who will USE these tools

## Buy vs build for this phase
- Sales Pipeline:    BUY (HubSpot or Salesforce). BUILD: trial-to-paid handoff.
- Trial Management:  BUILD (your data; your rules).
- Demo Environment:  BUILD (wraps your provisioning).
- Partner Portal:    BUILD (this is differentiating).
- Attribution:       BUY analytics base (Mixpanel, Amplitude, or PostHog).
                     BUILD attribution UI on top.
- Pricing Experiments: BUY (Statsig if same as Phase 3 flag vendor).
                     BUILD: revenue impact calculation.
- Sales Handoff:     BUILD (workflow, not data).
- Reseller Commissions: BUILD (depends on §9.5 Partner Portal data).

If HubSpot/Salesforce hasn't been chosen, STOP and ask.
If analytics platform isn't picked, STOP and ask.

## Sequence (this phase has 8 services — split into 2-3 weekly chunks)

### Chunk A — Sales-side (weeks 1-2)

### 6.1 — Sales Pipeline (HubSpot integration)
Pages per architecture §9.1:
  /gtm/pipeline                         (kanban: PROSPECT → WON/LOST)
  /gtm/pipeline/:dealId                 (deal detail + linked tenant)
  /gtm/pipeline/forecasting             (quarterly forecast)

HubSpot integration:
  - OAuth setup
  - Sync deals nightly via HubSpot API
  - Read-only embed for kanban
  - Click deal → deep link to HubSpot for editing
  - Forecasting: pull deals by close date + amount + probability

Differentiating layer: link deals to Fauward tenants
  - Once deal hits "WON", create or claim tenant
  - Customer 360 shows linked deals + close history

Permissions: gtm.pipeline.read, gtm.pipeline.write
Commit: feat(pipeline): hubspot integration with tenant linking

### 6.2 — Trial Management
Pages per architecture §9.2:
  /gtm/trials                           (active trials with activation score)
  /gtm/trials/:tenantId                 (trial detail + intervention queue)
  /gtm/trials/expiring                  (expiring next 7 days)
  /gtm/trials/extensions                (extension requests + approvals)

Activation score = composite of:
  - First shipment created (+30 points)
  - Team invited (+20)
  - Payment method connected (+25)
  - Webhook configured (+15)
  - Custom domain set (+10)

Score < 50 at day 7 → flag for CSM intervention
Score < 30 at day 14 → automatic 7-day extension offer

Extension requests:
  - Trial owner requests extension via in-app prompt
  - Auto-approved up to 7 days
  - 7-30 days requires SALES_MANAGER
  - >30 days requires SALES_DIRECTOR

Permissions: gtm.trials.read, gtm.trials.extend
Commit: feat(trials): activation scoring + extension workflow

### 6.3 — Demo Environment Manager
Pages per architecture §9.3:
  /gtm/demos                            (demo tenant inventory)
  /gtm/demos/create                     (provision new demo)
  /gtm/demos/:id                        (refresh data, share, destroy)
  /gtm/demos/templates                  (demo template catalogue)

Provisioning flow:
  1. Sales rep clicks "Create demo"
  2. Selects template (industry: logistics-3pl, retail, manufacturing)
  3. Specifies expiry (default 30 days)
  4. System provisions tenant + seeds with realistic data
  5. Returns shareable link with auth token (no login required)
  6. Auto-destroyed at expiry (or extend button)

Templates:
  - Stored as JSON in /templates/demo/<industry>.json
  - Specifies: tenant config, seed shipments, seed users, seed regions

Permissions: gtm.demos.read, gtm.demos.write
Commit: feat(demos): templated demo tenant provisioning

### 6.4 — Sales Handoff
Pages per architecture §9.8:
  /gtm/handoff/won                      (deals awaiting CS handoff)
  /gtm/handoff/onboarding-queue         (handed-off accounts in onboarding)
  /gtm/handoff/templates                (handoff document templates)

Handoff workflow:
  1. Deal hits WON in §6.1 pipeline
  2. Auto-creates handoff document from template
  3. Sales rep fills in: contact stakeholders, success criteria, gotchas
  4. Routes to CS team lead for assignment to a CSM
  5. CSM accepts → tenant moves into onboarding tracker (§7.8 Phase 7)

Permissions: gtm.handoff.read, gtm.handoff.write
Commit: feat(handoff): structured sales-to-cs handoff

### Chunk B — Marketing-side (weeks 3-4)

### 6.5 — Marketing Attribution (Mixpanel/Amplitude/PostHog integration)
Pages per architecture §9.6:
  /gtm/attribution                      (signup source dashboard)
  /gtm/attribution/campaigns            (campaign performance)
  /gtm/attribution/funnel               (visit → signup → activation → paid)
  /gtm/attribution/landing-pages        (landing page performance)

Attribution model:
  Multi-touch attribution: first touch (40%) + last touch (40%) +
  middle touches (20% split equally).
  Sources tracked: organic, paid (per platform), referral, partner, direct, email.

Implementation:
  - Sync events from analytics vendor
  - Map events → tenant signups (using session ID continuity)
  - Compute attribution per tenant per period
  - Aggregate by source, campaign, landing page

Permissions: gtm.attribution.read
Commit: feat(attribution): multi-touch attribution dashboard

### 6.6 — Pricing Experiments (Statsig integration)
Pages per architecture §9.7:
  /gtm/pricing/experiments              (active + historical tests)
  /gtm/pricing/experiments/:id          (experiment detail with revenue impact)
  /gtm/pricing/plans                    (plan editor)

Statsig (or whatever flag vendor was chosen in Phase 3) handles experiment
allocation. Build the revenue-impact calculation layer:
  - For each variant, compute: signups, conversion to paid, ARPU, total revenue
  - Statistical significance via standard A/B test stats
  - Lift % over control with confidence interval

Plan editor:
  - Defines plans, prices, features, limits
  - Plan changes trigger pricing experiment if flagged

Permissions: gtm.pricing.read, gtm.pricing.write
Commit: feat(pricing): experiment dashboard with revenue impact

### Chunk C — Partner-side (weeks 5-6)

### 6.7 — Partner Portal Management
Pages per architecture §9.5:
  /gtm/partners                         (partner directory)
  /gtm/partners/:id                     (partner detail + deals + commissions)
  /gtm/partners/applications            (application queue)
  /gtm/partners/deal-registration       (registered deals)

Partner types:
  - REFERRAL (commission on closed deal, no implementation)
  - RESELLER (sells under their own brand, full implementation responsibility)
  - TECHNOLOGY (integration partner, no commission)

Application workflow:
  Public form → Application queue → review → approve/reject → onboard

Deal registration:
  Partner registers a deal (lead) before working it.
  Registration locks the lead to that partner for 90 days.
  Conflict resolution: first-registered wins.

Permissions: gtm.partners.read, gtm.partners.write
Commit: feat(partners): directory + applications + deal registration

### 6.8 — Reseller Commissions
Pages per architecture §6.7:
  /revenue/commissions                  (commission ledger)
  /revenue/commissions/payouts          (pending payouts queue)
  /revenue/commissions/:partnerId       (per-partner detail)
  /revenue/commissions/disputes         (commission disputes)

Calculation rules:
  - Default: 20% of first-year revenue, 10% recurring
  - Tier-based: gold partners get 25%/15%, silver 20%/10%, bronze 15%/8%
  - Configurable per-partner via partner detail

Payout workflow:
  - Monthly aggregation: total earned per partner
  - Approval queue: FINANCE_ADMIN reviews + approves
  - Payout via Stripe Connect (or wire transfer for partners not on Connect)
  - 1099 generation at year-end (US partners)

Permissions: revenue.commissions.read, revenue.commissions.payout
Commit: feat(commissions): calculation + payout + 1099

## Cross-cutting requirements
- New roles in RBAC: SALES_DIRECTOR, CFO (if not added in Phase 5)
- Customer 360 gains: Pipeline tab, Attribution tab
- Existing dashboards (PillarDashboard, Phase 2 CS Console) gain Phase 6 widgets
- Partner deals flow into §6.1 pipeline

## Verification
  npm run test --workspaces --if-present
  npx playwright test e2e/critical/

Phase 6 gate checklist (split per chunk):
  Chunk A:
    [ ] HubSpot deals sync nightly
    [ ] Won deal triggers handoff document
    [ ] Trial activation score computes correctly
    [ ] Demo tenant provisions in <2 minutes
    [ ] Demo auto-destroys at expiry
  Chunk B:
    [ ] Attribution shows source breakdown for last quarter
    [ ] Multi-touch model produces consistent percentages summing to 100%
    [ ] Pricing experiment surfaces revenue impact + significance
    [ ] Plan editor changes apply to new signups
  Chunk C:
    [ ] Partner application: form → queue → approval flow works
    [ ] Deal registration locks lead to partner for 90 days
    [ ] Commission calculation matches tier rules
    [ ] Monthly payout aggregation is accurate
    [ ] Stripe Connect payout test succeeds
    [ ] 1099 generation produces valid PDF

Commit per chunk:
  docs: phase 6 chunk a verification
  docs: phase 6 chunk b verification
  docs: phase 6 chunk c verification

Final commit: docs: phase 6 verification report (consolidated)

## Constraints
- DO NOT recreate HubSpot's CRM features — link out for editing
- DO NOT compute attribution from raw analytics events synchronously — job only
- DO NOT auto-payout commissions — always require FINANCE_ADMIN approval
- DO NOT issue Stripe Connect transfers without 2-person approval (FINANCE_ADMIN
  + CFO) for amounts > £5,000
- Demo tenants are real tenants with status=DEMO — they must be excluded from
  MRR calculations everywhere
````

---

## Final notes

**Total scope across Phases 2-6:** 27 services, 5 phases, ~24-35 weeks of work depending on team size and how many phases overlap.

**Phases that depend on each other:**

- Phase 2 → Phase 3 (Customer 360 must surface Phase 3 data)
- Phase 1 IAM → Phase 3 JIT (JIT extends IAM)
- Phase 3 Compliance → Phase 4 KYC (legal hold blocks KYC erasure)
- Phase 4 Secret Management → all subsequent vendor integrations should migrate
- Phase 5 Custom Contracts → Phase 6 CPQ (contracts produced by CPQ)
- Phase 6 Pipeline → Phase 6 Handoff → Phase 6 Trials (workflow chain)

**When in doubt about phase ordering:** Phase 2 unblocks support burnout; Phase 3 unblocks first enterprise deal; Phase 4 unblocks SOC 2; Phase 5 unblocks deal close; Phase 6 unblocks GTM scale. Skip a phase only if its trigger genuinely hasn't fired.

**Each prompt assumes:**
- Phases 0-1 are GREEN (or knowingly RED with documented exceptions)
- Architecture, prompts, and testing guide docs are accessible to the agent
- npm workspaces syntax (corrected from earlier pnpm references)
- Plan mode is ON

**End of phase prompts.**
