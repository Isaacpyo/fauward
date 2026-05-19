# Tenant Portal ↔ Super Admin: Full Integration Spec

**Goal:** Every feature in the Tenant Portal (TP) has a corresponding SA view or action, and every SA action that affects a tenant is reflected in the TP. Nothing is orphaned. This spec covers what to build, what to fix, and what is missing on both sides.

---

## Integration Map Overview

| # | Integration | Direction | TP Surface | SA Surface | Status |
|---|---|---|---|---|---|
| 1 | Impersonation | SA → TP | ImpersonationBanner | Impersonation Center | Broken — fix |
| 2 | Tenant Suspension | SA → TP | SuspendedOverlay | Trust/Safety → Suspensions | Wired — verify |
| 3 | Plan Override | SA → TP | PlanGate / billing banners | Revenue → Subscriptions | Partial — fix |
| 4 | Feature Flag Override | SA → TP | PlanGate / feature-gated nav | Platform → Feature Flags | Missing SA UI |
| 5 | Service Announcements | SA → TP | NEW: AnnouncementBanner | GTM → Communications Hub | Missing both sides |
| 6 | Incident Notices | SA → TP | NEW: IncidentNoticeBanner | Platform → Incidents | Missing TP side |
| 7 | Billing Adjustments | SA → TP | BillingTab (invoices, refunds) | Revenue → Billing Console | Partial — verify |
| 8 | Dunning Actions | SA → TP | FailedPaymentBanner, SuspendedOverlay | Revenue → Dunning Manager | Missing TP polling |
| 9 | Support Tickets | TP → SA | Support Tickets page | Customer → Support Desk | Missing connection |
| 10 | Onboarding Tracking | TP → SA | OnboardingStepper | Customer → Onboarding Tracker | Missing connection |
| 11 | Domain Requests | TP → SA | Settings → Domain tab | Platform → Region/Domain review | Missing |
| 12 | Webhook Failures | TP → SA | Settings → Webhooks tab | Platform → Integration Health | Missing |
| 13 | API Key Usage | TP → SA | Developer page | Customer 360 → Usage tab | Missing |
| 14 | Audit Events | TP → SA | Audit page | Trust → Audit Log + C360 Audit tab | Partial |
| 15 | DSAR Request | TP → SA | NEW: Settings → Privacy tab | Trust → Compliance DSAR queue | Missing both |
| 16 | Suspension Appeal | TP → SA | NEW: on SuspendedOverlay | Trust → Safety Appeals queue | Missing both |
| 17 | Customer 360 | SA reads TP data | N/A | Customer → Customer 360 | Partial — verify all tabs |
| 18 | Health Score Display | SA → TP (advisory) | NEW: dashboard health indicator | Customer → CS Console | Missing TP side |

---

## 1. Impersonation (SA → TP) — FIX

### Problem
`ImpersonationBanner` detects impersonation via `user?.role === 'SUPER_ADMIN'`, but the backend impersonation JWT does NOT set role to `SUPER_ADMIN`. The exit endpoint calls `/superadmin/impersonate/exit` which does not exist. The entire impersonation handshake is broken end-to-end.

### Backend — `apps/backend/src/modules/platform/platform.routes.ts`

The `POST /api/v1/platform/tenants/:id/impersonation-sessions` endpoint already exists and returns a short-lived JWT. Verify the response includes:
```json
{
  "token": "<jwt>",
  "impersonationSessionId": "<uuid>",
  "expiresAt": "<iso8601>",
  "targetUser": { "id": "...", "email": "...", "role": "..." }
}
```

The impersonation JWT (issued as a tenant-side Bearer token) **must** include these extra claims:
```ts
{
  mode: 'IMPERSONATION',
  impersonationSessionId: string,
  impersonatorId: string,       // platform user id
  impersonatorEmail: string     // platform user email — shown in banner
}
```

Add a `DELETE /api/v1/platform/impersonation-sessions/:id` endpoint if not present (it is documented — confirm it exists and works).

Add a tenant-side exit endpoint that the TP can call without needing a platform session:
```
POST /api/v1/tenants/me/impersonation/exit
```
- Reads `impersonationSessionId` from the current JWT
- Calls `DELETE /api/v1/platform/impersonation-sessions/:id` internally
- Returns `{ redirectUrl: 'https://admin.fauward.com/platform/tenants/<id>' }`

### TP — `apps/tenant-portal/src/components/layout/ImpersonationBanner.tsx`

Rewrite entirely:
```tsx
import { useAuthStore } from '../../stores/auth.store';
import { api } from '../../lib/api';

export function ImpersonationBanner() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);

  const isImpersonating = user?.mode === 'IMPERSONATION';
  if (!isImpersonating) return null;

  const exit = async () => {
    const res = await api.post('/tenants/me/impersonation/exit');
    window.location.href = res.data.redirectUrl ?? 'https://admin.fauward.com/platform/tenants';
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[2000] flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <span>
        Viewing as <strong>{tenant?.name}</strong> ({tenant?.slug}) — impersonated by{' '}
        <strong>{user?.impersonatorEmail}</strong>
      </span>
      <button
        onClick={exit}
        className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
      >
        Exit
      </button>
    </div>
  );
}
```

Extend `req.user` / auth store type to include `mode`, `impersonationSessionId`, `impersonatorId`, `impersonatorEmail`.

### TP auth store — `apps/tenant-portal/src/stores/auth.store.ts`

When the TP receives an impersonation JWT (passed via URL param `?impersonation_token=<jwt>` from SA redirect), decode and store it. The SA Impersonation Center redirects to:
```
https://<tenant-slug>.fauward.com/auth/impersonate?token=<jwt>
```

Create `apps/tenant-portal/src/pages/auth/ImpersonateCallbackPage.tsx`:
- Reads `?token` from URL
- Stores JWT in auth store (not as the regular session — keep it scoped)
- Redirects to `/` with impersonation mode active

### SA — `apps/super-admin/src/` — Impersonation Center

The Impersonation Center page (`/platform/impersonation`) needs:
1. A tenant search + "Start Impersonation" button
2. On click: POST to `/api/v1/platform/tenants/:id/impersonation-sessions` with `reason` (required) + MFA re-verification prompt
3. On success: open `https://<tenant-slug>.fauward.com/auth/impersonate?token=<jwt>` in a new tab
4. Show active impersonation sessions list with actor, tenant, started-at, expires-at, and a "Revoke" button per row

Add an "Open in Portal" button to every SA surface that shows a specific tenant (Tenant Detail, Customer 360, Billing Console when filtered to a tenant). This button triggers the impersonation flow inline.

---

## 2. Tenant Suspension (SA → TP) — VERIFY & TIGHTEN

### Flow
SA calls `POST /api/v1/platform/tenants/:id/suspend` → backend sets `tenant.status = 'SUSPENDED'` and writes audit log → TP detects on next request.

### TP — `apps/tenant-portal/src/components/billing/SuspendedOverlay.tsx`

Ensure the overlay is shown whenever `tenant.status === 'SUSPENDED'`. The check belongs in `AppShell.tsx` — wrap the main content area:
```tsx
{tenant?.status === 'SUSPENDED' && <SuspendedOverlay />}
```

`SuspendedOverlay` must:
- Show the suspension reason (if the backend exposes it on `GET /api/v1/tenants/me`)
- Show a "Submit an Appeal" CTA (links to the new appeal flow — see Integration #16)
- Show contact email: support@fauward.com

### Backend — `GET /api/v1/tenants/me`
Ensure the response includes `status`, `suspendedAt`, and `suspensionReason` (nullable).

### SA — Trust/Safety → Suspensions (`/trust/safety`)
Already shows suspension records. Add:
- "Unsuspend" button per row → calls `POST /api/v1/platform/tenants/:id/unsuspend`
- Link to that tenant's Customer 360

---

## 3. Plan Override (SA → TP) — FIX

### Flow
SA calls `PATCH /api/v1/platform/tenants/:id/plan-override` → TP must pick up the new plan without requiring a full logout/login.

### Backend
After plan override, publish a Redis event `tenant:{id}:plan-changed` (or invalidate the tenant cache key). The tenant resolver middleware caches tenant data — ensure TTL is ≤ 60 seconds OR the override invalidates the cache immediately.

### TP — plan refresh
In `apps/tenant-portal/src/stores/auth.store.ts`, add a `refreshTenant()` action that calls `GET /api/v1/tenants/me` and updates the cached tenant object. Call it:
- On every app focus (`document.addEventListener('visibilitychange', ...)`)
- Every 5 minutes via interval

`PlanGate` and all billing banners (TrialBanner, LimitReachedBanner, UsageMeter) must read from the live tenant store, not a stale snapshot.

### SA — `apps/super-admin/src/` — Revenue → Subscriptions
The plan override form (in subscription overrides UI) must:
- Show current plan + current override (if any)
- Allow setting a new plan tier with optional expiry date
- Require a reason field
- Show who set the previous override and when (from audit trail)

---

## 4. Feature Flag Override (SA → TP) — CREATE SA UI

### Flow
SA calls `POST /api/internal/flags/:key/overrides` with `{ tenantId, value, reason }` → backend stores override in LaunchDarkly or local DB → TP evaluates flag on next request.

### TP — `apps/tenant-portal/src/router/guards/PlanGate.tsx`
Already gates by plan feature. The `useFeatureFlags()` hook (or equivalent) must also check tenant-level flag overrides. Flags are evaluated server-side — the tenant JWT or `GET /api/v1/tenants/me` response must include `featureFlags: Record<string, boolean>`. The TP reads these to show/hide gated nav items and features.

### SA — Platform → Feature Flags (`/platform/flags`)
On the Tenant Detail page (`/platform/tenants/:id`), add a "Feature Flags" section:
- Table of all flags with current value + per-tenant override indicator
- Toggle or text-field to set a tenant-level override
- Reason field (required)
- Calls `POST /api/internal/flags/:key/overrides` with the tenantId
- Shows who set last override + when

---

## 5. Service Announcements (SA → TP) — CREATE

### Backend — new endpoint
```
GET /api/v1/tenants/me/announcements
```
Returns active announcements targeted at this tenant (or all tenants):
```ts
type Announcement = {
  id: string;
  type: 'INFO' | 'WARNING' | 'MAINTENANCE';
  title: string;
  body: string;
  cta?: { label: string; url: string };
  expiresAt: string | null;
  dismissible: boolean;
};
```

Announcements are stored in a `PlatformAnnouncement` table (add to Prisma schema):
```prisma
model PlatformAnnouncement {
  id          String    @id @default(cuid())
  type        String    // INFO | WARNING | MAINTENANCE
  title       String
  body        String
  targetAll   Boolean   @default(true)
  tenantIds   String[]  @default([])
  planTiers   String[]  @default([])  // empty = all plans
  cta         Json?
  dismissible Boolean   @default(true)
  publishedAt DateTime  @default(now())
  expiresAt   DateTime?
  createdBy   String    // platform user id
  @@map("platform_announcements")
}
```

Add internal SA endpoints:
```
GET    /api/internal/announcements         — list (with filters: active, expired, all)
POST   /api/internal/announcements         — create
PATCH  /api/internal/announcements/:id     — update / expire
DELETE /api/internal/announcements/:id     — delete
```

### TP — new `AnnouncementBanner.tsx`

Create `apps/tenant-portal/src/components/layout/AnnouncementBanner.tsx`:
- Polls `GET /api/v1/tenants/me/announcements` every 5 minutes
- Renders a banner stack below the ImpersonationBanner (or TopBar)
- Supports dismiss (saved to `localStorage` by announcement ID if `dismissible`)
- Colours: INFO → blue, WARNING → amber, MAINTENANCE → orange

Add `<AnnouncementBanner />` to `apps/tenant-portal/src/layouts/AppShell.tsx`.

### SA — GTM → Communications Hub (`/customer/comms`)
Add "New Announcement" button:
- Type selector (INFO / WARNING / MAINTENANCE)
- Title + body fields (markdown supported)
- Target: All tenants | Specific plan tiers | Specific tenants (multi-select)
- Expiry date picker
- Dismissible toggle
- Preview panel
- Calls `POST /api/internal/announcements`

---

## 6. Incident Notices (SA → TP) — CREATE TP SIDE

### Flow
SA marks a tenant as impacted on an incident → TP shows a degraded-service notice.

### Backend
When SA calls `POST /api/internal/incidents/:id/impacts` with `{ tenantId }`, also write a record to `PlatformAnnouncement` (type: `WARNING`, non-dismissible, targeted at that tenant, auto-expiring when incident resolves).

Add incident status to `GET /api/v1/tenants/me/announcements` — the `AnnouncementBanner` handles display automatically via Integration #5.

### SA — Platform → Incidents (`/platform/incidents`)
On incident detail page, "Mark Tenant Impact" modal should:
- Multi-select affected tenants
- Optionally customise the message shown in TP
- Show list of currently impacted tenants with "Remove" button

---

## 7. Billing Adjustments (SA → TP) — VERIFY

### TP — `apps/tenant-portal/src/pages/settings/BillingTab.tsx`

The Billing tab `InvoiceHistoryTable` calls `GET /api/v1/payments/invoices`. Verify this endpoint returns:
- All invoices including manually-created ones from SA
- Credit notes linked to invoices
- Refunds with status (PENDING / COMPLETED / FAILED)
- SA-created invoice `notes` field displayed in detail view

If any of these are missing from the response schema, add them.

### SA — Revenue → Billing Console (`/revenue/billing`)
When creating a manual invoice or credit note, the `tenantId` field must auto-populate and the invoice immediately appears in the TP billing tab (no cache delay — invalidate if cached).

---

## 8. Dunning Actions (SA → TP) — FIX TP POLLING

### TP — billing banners

`FailedPaymentBanner` and `SuspendedOverlay` are already implemented. The TP must poll `GET /api/v1/tenants/me` or a dedicated `GET /api/v1/payments/billing-status` endpoint that returns:
```ts
{
  status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'TRIAL' | 'TRIAL_EXPIRED',
  overdueInvoiceCount: number,
  nextRetryAt: string | null,
  saveOffer?: { discount: number; validUntil: string; code: string }
}
```

Poll this every 60 seconds while the tenant has `status !== 'ACTIVE'`. Show:
- `status === 'PAST_DUE'` → `FailedPaymentBanner` with `nextRetryAt`
- `status === 'SUSPENDED'` → `SuspendedOverlay` (see Integration #2)
- `saveOffer` present → show a `SaveOfferBanner` with the discount code and expiry

Create `apps/tenant-portal/src/components/billing/SaveOfferBanner.tsx`:
```tsx
// Shows when SA has issued a dunning save offer to prevent churn
// Displays discount code + "Apply Now" CTA → opens plan/billing flow
```

### Backend — `GET /api/v1/payments/billing-status`
New endpoint (or add to `GET /api/v1/tenants/me`). Returns the fields above. Checks:
1. `tenant.status` from DB
2. Count of invoices with `status = 'OVERDUE'`
3. Most recent `WebhookDelivery.nextRetryAt` for payment retry (or billing service equivalent)
4. Active save offer for this tenant from dunning sequences

---

## 9. Support Tickets (TP → SA) — CREATE CONNECTION

### TP — `apps/tenant-portal/src/pages/support/TicketsListPage.tsx`

Currently exists. Tickets must call the backend, not a mock. Wire:
```
GET  /api/v1/support/tickets          — list tenant's tickets
POST /api/v1/support/tickets          — create ticket
GET  /api/v1/support/tickets/:id      — ticket detail with thread
POST /api/v1/support/tickets/:id/reply — add reply
```

Add `apps/backend/src/modules/support/support.routes.ts` if it doesn't exist. The backend proxies to Zendesk (or stores locally if Zendesk is not yet integrated — use a `SupportTicket` Prisma model as interim):

```prisma
model SupportTicket {
  id          String   @id @default(cuid())
  tenantId    String
  subject     String
  body        String
  status      String   @default("OPEN")  // OPEN | IN_PROGRESS | RESOLVED | CLOSED
  priority    String   @default("NORMAL") // LOW | NORMAL | HIGH | URGENT
  createdById String
  assignedTo  String?  // platform user id
  zenDeskId   String?
  messages    SupportMessage[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
}

model SupportMessage {
  id        String        @id @default(cuid())
  ticketId  String
  body      String
  fromSA    Boolean       @default(false)
  authorId  String
  createdAt DateTime      @default(now())
  ticket    SupportTicket @relation(fields: [ticketId], references: [id])
}
```

### SA — Customer → Support Desk (`/customer/support`)
Support desk must:
- List all tickets across tenants with filter by status, priority, tenant, assignee
- Show ticket detail with full thread (messages from TP + SA replies)
- "Reply" form — SA reply appears in TP ticket detail
- Assign ticket to SA staff member
- Change status / priority
- Link to Customer 360 for context

Backend SA endpoints (add to `apps/backend/src/modules/internal/console-phases.routes.ts` or new file):
```
GET  /api/internal/support/tickets        — all tickets (SA)
GET  /api/internal/support/tickets/:id    — ticket detail
PATCH /api/internal/support/tickets/:id   — update status/priority/assignee
POST /api/internal/support/tickets/:id/reply — SA reply (fromSA: true)
```

---

## 10. Onboarding Tracking (TP → SA) — CREATE CONNECTION

### TP — `apps/tenant-portal/src/components/onboarding/OnboardingStepper.tsx`

When each onboarding step completes, call:
```
POST /api/v1/tenants/me/onboarding/steps
Body: { step: 'BRANDING' | 'TEAM' | 'PAYMENT' | 'FIRST_SHIPMENT' | 'GO_LIVE' }
```

### Backend — new endpoint
```
POST /api/v1/tenants/me/onboarding/steps
GET  /api/v1/tenants/me/onboarding
```

Store in `TenantOnboarding` model (or as a JSON field on `Tenant`):
```prisma
// Add to Tenant model:
onboardingSteps Json @default("{}")  // { BRANDING: true, TEAM: false, ... }
onboardingCompletedAt DateTime?
```

### SA — Customer → Onboarding Tracker (`/customer/onboarding`)

New activation funnel page showing all tenants who signed up in last 90 days:

| Tenant | Signed Up | Branding | Team | Payment | First Shipment | Go Live | Days Active |
|---|---|---|---|---|---|---|---|
| Each row links to Customer 360 |

Backend SA endpoint:
```
GET /api/internal/onboarding/funnel
```
Returns onboarding step completion per tenant, days-since-signup, conversion rate metrics.

Also add an onboarding progress widget to the Customer 360 Overview tab (`OverviewTab.tsx`) showing the stepper state for that specific tenant.

---

## 11. Domain Requests (TP → SA) — CREATE

### TP — `apps/tenant-portal/src/pages/settings/DomainSettingsTab.tsx`

Already exists. When a tenant submits a custom domain, call:
```
POST /api/v1/tenants/me/domains
Body: { domain: 'logistics.acme.com' }
```

The domain request must create a platform review item. Return the pending status so TP can show:
```
Status: Pending verification → Under review by Fauward → Active
```

### Backend — `apps/backend/src/modules/tenants/domain.service.ts`

On domain creation, write a `RegionChangeRequest` (or new `DomainRequest` model) that surfaces in SA. Emit a notification to the platform ops channel.

### SA — Platform → Tenant Control Plane (`/platform/tenants/:id`)

On Tenant Detail, add a "Custom Domains" tab:
- Lists pending domain requests for this tenant
- Shows DNS verification records (TXT / CNAME) that the tenant must set
- "Verify" button → backend checks DNS → marks as VERIFIED
- "Approve" button → provisions SSL, activates domain
- "Reject" button with reason → tenant sees rejection reason in TP

---

## 12. Webhook Failures (TP → SA) — CREATE SA VISIBILITY

### TP — `apps/tenant-portal/src/components/settings/WebhookDeliveryLog.tsx`

Already shows delivery failures per endpoint. No TP changes needed.

### SA — Platform → Integration Health (`/platform/integrations`)

Add a "Tenant Webhooks" section:
```
GET /api/internal/integrations/webhook-health
```
Returns per-tenant webhook failure rates:
```ts
{
  tenantId: string;
  tenantSlug: string;
  totalDeliveries: number;
  failedDeliveries: number;
  deadLetteredCount: number;
  lastFailedAt: string | null;
}[]
```

Sort by `deadLetteredCount` descending. Clicking a row goes to that tenant's Customer 360 → Config tab.

---

## 13. API Key Usage (TP → SA) — ADD TO CUSTOMER 360

### TP — `apps/tenant-portal/src/pages/developer/DeveloperPage.tsx`

Already shows per-key usage via `GET /api/v1/api-keys` (which includes `monthlyRequestCount`, `lastUsedAt`). No TP changes needed.

### SA — Customer 360 → Usage tab (`UsageTab.tsx`)

Add an "API Usage" section that calls:
```
GET /api/internal/customer/360/:tenantId/api-usage
```

Returns:
```ts
{
  keys: {
    id: string;
    name: string;
    lastUsedAt: string | null;
    monthlyRequestCount: number;
    isSandbox: boolean;
    scopes: string[];
  }[];
  totalRequestsThisMonth: number;
  averagePerDay: number;
}
```

---

## 14. Audit Events (TP → SA) — VERIFY COMPLETENESS

### TP — `apps/tenant-portal/src/features/admin/audit/AuditLogPage.tsx`

Every tenant-side action (shipment create/update, user invite, API key generate, webhook create, settings change) must call `writeAudit()` on the backend. Audit log is already in the schema — verify all TP-initiated mutations write audit entries.

### SA — Trust → Audit Log (`/trust/audit`)

The SA audit log (`GET /api/internal/audit/entries`) must accept `tenantId` as a filter param. It already does — verify the Customer 360 Audit tab passes the tenantId filter.

Also verify `POST /api/internal/audit/export` works with tenantId scoping (for DSAR — see Integration #15).

---

## 15. DSAR Request (TP → SA) — CREATE BOTH SIDES

### TP — new Settings tab

Add a "Privacy" tab to `apps/tenant-portal/src/pages/settings/SettingsPage.tsx` (9th tab, after Branding).

Create `apps/tenant-portal/src/pages/settings/PrivacyTab.tsx`:
```tsx
// Allows tenant admins to request a Data Subject Access Request export
// Shows: DSAR history table + "New Request" button
// New request form: requester name, email, description, relation (CUSTOMER / EMPLOYEE / OTHER)
// On submit: POST /api/v1/tenants/me/dsar
// Status lifecycle: RECEIVED → GATHERING → READY → DELIVERED → CLOSED
// When status === 'READY': show download link
```

### Backend — new endpoint
```
GET  /api/v1/tenants/me/dsar         — list DSAR requests for this tenant
POST /api/v1/tenants/me/dsar         — submit a new DSAR request
GET  /api/v1/tenants/me/dsar/:id     — DSAR status + download URL when ready
```

These map to the existing `POST /api/internal/compliance/dsar` SA endpoints (the tenant-facing version creates a new DSAR with `tenantId` from context).

### SA — Trust → Compliance DSAR queue (`/trust/compliance`)

Already handles DSAR. Verify:
- New DSAR from TP appears in the queue immediately
- SA can click through to the relevant tenant's Customer 360
- When SA marks status as `READY` and delivers the bundle, the TP download link becomes active
- The DSAR detail shows the tenant name and the requesting user's info

---

## 16. Suspension Appeal (TP → SA) — CREATE BOTH SIDES

### TP — update `SuspendedOverlay.tsx`

Add "Submit an Appeal" button that opens a modal:
- Fields: reason for appeal (textarea, min 50 chars), contact email
- On submit: `POST /api/v1/tenants/me/suspension-appeal`
- After submission: show "Appeal submitted — we'll respond within 24 hours"
- Disable button after submission (one appeal at a time)

### Backend — new endpoint
```
POST /api/v1/tenants/me/suspension-appeal
Body: { reason: string; contactEmail: string }
```

Requires tenant to be in `SUSPENDED` status. Creates a record in `TrustSafetyAppeal` (add to schema):
```prisma
model TrustSafetyAppeal {
  id           String   @id @default(cuid())
  tenantId     String
  reason       String
  contactEmail String
  status       String   @default("PENDING")  // PENDING | APPROVED | REJECTED
  reviewedBy   String?  // platform user id
  reviewNote   String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
}
```

Sends a notification to the Slack channel / platform alert for the Trust team.

### SA — Trust → Safety Appeals queue (`/trust/safety`)

Add "Appeals" tab (after "Suspensions"):
- Lists all pending appeals sorted by createdAt
- Each row: tenant name, appeal reason, submitted at, contact email
- "Review" button opens detail panel:
  - Shows tenant history (link to Customer 360)
  - Shows suspension reason vs appeal reason
  - "Approve Appeal" button → calls `POST /api/v1/platform/tenants/:id/unsuspend` + marks appeal APPROVED + notifies tenant via email
  - "Reject Appeal" button → reason field required, marks appeal REJECTED + notifies tenant

Backend SA endpoint:
```
GET  /api/internal/safety/appeals           — list (already exists)
GET  /api/internal/safety/appeals/:id       — detail (add)
PATCH /api/internal/safety/appeals/:id      — update status with reviewNote (add)
```

---

## 17. Customer 360 (SA reads TP data) — VERIFY ALL TABS

The Customer 360 (`GET /api/internal/customer/360/:tenantId`) must populate all 12+ tabs. Audit each tab:

| Tab | Data Source | Status |
|---|---|---|
| Overview | tenant record + health score + onboarding steps | Add onboarding steps |
| Config | tenant settings, plan, feature flags | Add feature flag overrides |
| Health | health score breakdown | Verify scoring model |
| Usage | shipment counts, API calls, storage | Add API usage (Integration #13) |
| Billing | invoices, payments, refunds | Verify credit notes included |
| Pipeline | HubSpot deal data | External — verify mock/stub |
| People | tenant users list | Verify `req.user` data comes through |
| Incidents | incidents where tenant is impacted | Verify incident impact records |
| Tickets | support tickets for this tenant | Wire to Integration #9 data |
| Audit | last 20 audit entries for tenantId | Add tenantId filter (Integration #14) |
| Attribution | signup source, UTM params | External — verify stub |
| Notes | internal SA notes | Verify PATCH works |
| Dunning | dunning timeline | Verify timeline endpoint |

For the **Config tab**: add a "Feature Flags" section showing all flags and per-tenant overrides. "Edit" opens flag override flow (Integration #4).

---

## 18. Health Score (SA → TP Advisory) — CREATE TP SIDE

### TP — Dashboard page

Add a subtle health indicator to the TP dashboard header (not alarming, just informative for the tenant). Call `GET /api/v1/tenants/me/health` (new endpoint):
```ts
{
  score: number;      // 0-100
  tier: 'HEALTHY' | 'AT_RISK' | 'CRITICAL';
  tips: string[];     // 2-3 actionable suggestions (e.g. "Complete your branding setup")
}
```

Show only if `tier !== 'HEALTHY'` — for at-risk/critical, show a card:
> "Your account health score is 42/100. [View tips →]"

This gives the TP tenant visibility into their standing without exposing SA internals.

### Backend — new endpoint
```
GET /api/v1/tenants/me/health
```
Returns a simplified version of the internal health score (score + tier only, no internal breakdown visible to tenant). The score is computed by `POST /api/internal/success/health-scoring/run` on the SA side.

---

## Prisma Schema Additions

Add these models to `apps/backend/prisma/schema.prisma`:

```prisma
model PlatformAnnouncement {
  id          String    @id @default(cuid())
  type        String
  title       String
  body        String
  targetAll   Boolean   @default(true)
  tenantIds   String[]  @default([])
  planTiers   String[]  @default([])
  cta         Json?
  dismissible Boolean   @default(true)
  publishedAt DateTime  @default(now())
  expiresAt   DateTime?
  createdBy   String
  @@map("platform_announcements")
}

model SupportTicket {
  id          String           @id @default(cuid())
  tenantId    String
  subject     String
  body        String
  status      String           @default("OPEN")
  priority    String           @default("NORMAL")
  createdById String
  assignedTo  String?
  zenDeskId   String?
  messages    SupportMessage[]
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  tenant      Tenant           @relation(fields: [tenantId], references: [id])
  @@map("support_tickets")
}

model SupportMessage {
  id        String        @id @default(cuid())
  ticketId  String
  body      String
  fromSA    Boolean       @default(false)
  authorId  String
  createdAt DateTime      @default(now())
  ticket    SupportTicket @relation(fields: [ticketId], references: [id])
  @@map("support_messages")
}

model TrustSafetyAppeal {
  id           String   @id @default(cuid())
  tenantId     String
  reason       String
  contactEmail String
  status       String   @default("PENDING")
  reviewedBy   String?
  reviewNote   String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  @@map("trust_safety_appeals")
}
```

Add to `Tenant` model:
```prisma
suspensionReason      String?
suspendedAt           DateTime?
onboardingSteps       Json      @default("{}")
onboardingCompletedAt DateTime?
```

---

## New Backend Route Files to Create

| File | Purpose |
|---|---|
| `apps/backend/src/modules/support/support.routes.ts` | Tenant-facing support ticket CRUD |
| `apps/backend/src/modules/announcements/announcements.routes.ts` | Tenant-facing announcement polling |
| `apps/backend/src/modules/dsar/dsar.routes.ts` | Tenant-facing DSAR submission |
| `apps/backend/src/modules/appeals/appeals.routes.ts` | Tenant-facing suspension appeal |
| `apps/backend/src/modules/onboarding/onboarding.routes.ts` | Tenant onboarding step tracking |
| `apps/backend/src/modules/tenants/health.routes.ts` | Tenant health score (simplified) |

Register all in `apps/backend/src/app.ts`.

---

## New TP Pages / Components to Create

| File | Purpose |
|---|---|
| `apps/tenant-portal/src/pages/auth/ImpersonateCallbackPage.tsx` | Handle impersonation token from SA |
| `apps/tenant-portal/src/pages/settings/PrivacyTab.tsx` | DSAR request form + history |
| `apps/tenant-portal/src/components/layout/AnnouncementBanner.tsx` | SA announcements + incident notices |
| `apps/tenant-portal/src/components/billing/SaveOfferBanner.tsx` | Dunning save offer display |

---

## New SA Pages to Create or Extend

| Location | What to Add |
|---|---|
| `/platform/tenants/:id` | "Feature Flags" tab + "Open in Portal" button + "Custom Domains" tab |
| `/platform/impersonation` | Active sessions list + "Revoke" per row + tenant search with Start Impersonation |
| `/trust/safety` | "Appeals" tab |
| `/customer/onboarding` | Activation funnel table with per-step completion |
| `/customer/360/:id` — Overview | Onboarding stepper widget |
| `/customer/360/:id` — Config | Feature flag overrides section |
| `/customer/360/:id` — Usage | API key usage section |
| `/customer/360/:id` — Tickets | Linked to real SupportTicket data |
| `/customer/comms` | "New Announcement" form |

---

## Implementation Order (Suggested)

1. **Prisma schema additions** → `prisma migrate dev`
2. **Impersonation fix** (Integration #1) — highest impact, currently broken
3. **Support Tickets** (Integration #9) — needed for Customer 360 tickets tab
4. **Announcements** (Integration #5) — then Incident Notices (#6) reuse it
5. **Dunning polling** (Integration #8) — billing banners need live data
6. **DSAR** (Integration #15) — compliance requirement
7. **Suspension Appeal** (Integration #16) — trust requirement
8. **Onboarding tracking** (Integration #10) — customer success requirement
9. **Domain requests** (Integration #11) — platform ops requirement
10. Remaining integrations (#3, #4, #7, #11, #12, #13, #14, #17, #18)

---

## Auth & Session Notes

- All TP routes use `authenticate` middleware — the impersonation JWT must be accepted by the same middleware (it is a valid tenant-scoped JWT with extra claims)
- `authenticatePlatformSession` is for SA-only routes — never use it on tenant routes
- The impersonation session ID must be stored in Redis during the impersonation TTL window so it can be revoked in real-time
- All SA mutation routes that affect tenant state (suspend, plan override, flag override, dunning actions) must write to `PlatformAuditLog` with `actorId`, `targetTenantId`, `action`, `reason`, and the before/after state
