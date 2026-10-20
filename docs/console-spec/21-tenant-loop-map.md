# 21 — Tenant → Console Loop Map

The 20 interactions from re-audit §5, each with its target round-trip. "Activity" lists the `PlatformActivity.type` values the flow must emit (service in brackets). "Notify" uses `PlatformNotifier` (D6): **T** = tenant admins/requester (in-app + email), **S** = staff holding the named permission (`StaffNotification`).

Status at re-audit: 4 connected · 10 half · 6 missing. Target: 20 round-trip.

| # | Interaction | Re-audit | WP | Phase |
|---|---|---|---|---|
| L1 | Support tickets | Half | 2.3 | 2 |
| L2 | Relay messaging | Half | 4.R | 4 |
| L3 | Suspension appeal | Connected (broken lift) | 1.3, 2.4 | 1–2 |
| L4 | DSAR / export / deletion | Half | 2.5 | 2 |
| L5 | Region change | Half | 2.6 | 2 |
| L6 | Plan change / billing | **Missing** | 2.7 | 2 |
| L7 | Onboarding | Connected (fake) | 2.0, 2.17 | 2 |
| L8 | Announcements | Connected | 2.14 | 2 |
| L9 | API keys | Connected, read-only | 2.13 | 2 |
| L10 | Webhooks | Connected, read-only | 2.13 | 2 |
| L11 | Tenant payment gateway config | **Missing** | 2.12 | 2 |
| L12 | Plan gates / overrides / flags + feature requests | Half | 1.4, 2.8 | 1–2 |
| L13 | Tenant staff management | Half | 2.15 | 2 |
| L14 | Notifications | Half | 2.2 | 2 |
| L15 | Exceptions / escalations | **Missing** | 2.11 | 2 |
| L16 | AI agent usage / limits | **Missing** | 2.10 | 2 |
| L17 | Tenant audit log | Half | 2.16 | 2 |
| L18 | Impersonation (tenant visibility) | Operator-only | 0.5, 2.9 | 0–2 |
| L19 | Usage / health inputs | Half | 2.18, 3.3 | 2–3 |
| L20 | Relay AI drafts | Half | 4.R | 4 |

---

### L1 Support tickets
Tenant creates a PLATFORM ticket (Help → Contact Fauward) or escalates an end-customer ticket → `SupportTicket{audience PLATFORM}` → console queue → staff assigns, replies PUBLIC or STAFF_INTERNAL, changes status → tenant sees the thread as "Fauward Support".
**Activity:** `ticket.created`, `ticket.escalated`, `ticket.replied.tenant`, `ticket.replied.staff`, `ticket.status_changed`, `ticket.sla_breached` (customer.support). **Notify:** S `customer.support.write` on create/tenant reply; T on staff PUBLIC reply and RESOLVED.
- ACC-L1-1 round-trip create → staff reply → tenant sees reply + email (Mailpit).
- ACC-L1-2 STAFF_INTERNAL never reaches tenant routes.

### L2 Relay messaging (Phase 4)
Pro tenant messages Fauward in Relay → console Relay page (console auth) → staff reply or "convert to ticket" → tenant sees reply in Relay. Starter tenants: the `mailto:` link is replaced by Help → Contact Fauward (L1).
**Activity:** `relay.message.received`, `relay.message.sent`, `relay.converted_to_ticket` (customer.support). **Notify:** S on inbound.
- ACC-L2-1 console reads and replies through `/api/internal/relay/*` with the cookie session (no localStorage token).
- ACC-L2-2 relay-api rejects unverifiable JWTs outside development.

### L3 Suspension appeal
Suspended tenant sees `SuspendedOverlay` (reason, appealable) → submits appeal (server links the active `suspensionId`) → console appeal queue → APPROVE / REJECT / REQUEST_INFO → tenant overlay shows the outcome; APPROVE lifts the suspension.
**Activity:** `tenant.suspended`, `tenant.unsuspended` (platform.tenants), `appeal.submitted`, `appeal.decided`, `appeal.info_requested`, `appeal.replied` (trust.safety). **Notify:** S `trust.safety.read` on submit/reply; T on decision/info request.
- ACC-L3-1 platform suspend → appeal → approve → tenant ACTIVE and notified.
- ACC-L3-2 reject → overlay shows the resolution text.

### L4 DSAR
Tenant admin requests ACCESS/ERASURE/PORTABILITY/RECTIFICATION for a subject → console queue with due date → verify identity → gather (job) → review → deliver (token) or erase (job) → tenant downloads or sees erasure completed.
**Activity:** `dsar.requested`, `dsar.gathered`, `dsar.delivered`, `dsar.downloaded`, `dsar.erased`, `dsar.overdue` (trust.compliance). **Notify:** S `trust.compliance.dsar.read` on request/overdue; T on ready/erased.
- ACC-L4-1 ACCESS round-trip ends in an authenticated download of a bundle containing only that subject's data.
- ACC-L4-2 ERASURE round-trip anonymises the registry fields; blocked under legal hold.

### L5 Region change
Tenant admin requests a region (`TopBar`) → `RegionChangeRequest` → console decision → APPROVE applies `tenant.region` (and region-dependent payment providers list) → tenant notified; REJECT shows the reason.
**Activity:** `region.requested`, `region.decided`, `region.applied` (platform.tenants). **Notify:** S `platform.tenants.write`; T on decision.
- ACC-L5-1 request survives a backend restart; approval changes `tenant.region`.
- ACC-L5-2 the `/dev` region endpoint is unreachable outside development.

### L6 Plan change / billing
Tenant chooses a plan in `BillingTab` → Stripe Checkout/subscription update (configured) or `PlanChangeRequest` (not configured) → console subscriptions queue or Stripe webhook → `Subscription` + `SubscriptionEvent` + entitlements → tenant sees the new plan. "Manage billing" opens a real Stripe portal session or files a BILLING_QUERY ticket. Payment failures reach dunning; save offers are redeemable.
**Activity:** `plan.change_requested`, `plan.changed`, `plan.change_rejected`, `payment.failed`, `payment.succeeded`, `save_offer.redeemed` (revenue.subscriptions / revenue.dunning). **Notify:** S `revenue.subscriptions.write` on request; T on decision/plan change/payment failure.
- ACC-L6-1 no-Stripe round-trip: request → approve → tenant PRO-only feature works.
- ACC-L6-2 signed Stripe `invoice.payment_failed` fixtures create `DunningEvent`s and, on attempt 2, a DUNNING suspension; `invoice.paid` lifts it. (From WP-4.5 the trigger becomes the dunning sequence; the test is updated then.)

### L7 Onboarding
Tenant completes real actions (gateway verified, first shipment, invite accepted, branding, domain) → events stamp `onboardingSteps` → console funnel and stuck list → staff nudge → tenant gets the nudge.
**Activity:** `onboarding.step_completed`, `onboarding.completed`, `onboarding.nudged` (customer.onboarding). **Notify:** T on nudge.
- ACC-L7-1 clicking through the wizard without doing anything completes nothing.
- ACC-L7-2 the first real shipment completes its step and moves the funnel.

### L8 Announcements
Staff publish a targeted announcement → tenant banner → tenant views/dismisses/clicks → receipts in the console; edit/archive propagate.
**Activity:** `announcement.published`, `announcement.archived` (customer.comms). **Notify:** T only when `alsoEmail`.
- ACC-L8-1 receipts recorded per user/action and summarised in the console.

### L9 API keys
Tenant creates/revokes keys in `DeveloperPage` (real) → console C360 Config lists prefix/created/last used → staff can revoke a compromised key (dangerous) → tenant notified with the reason.
**Activity:** `api_key.created`, `api_key.revoked` (actor TENANT_USER or STAFF) (customer.360). **Notify:** T on staff revoke.
- ACC-L9-1 staff revoke makes the key fail with 401 immediately and notifies admins.

### L10 Webhooks
Tenant webhook deliveries fail → console Integration Health failures list (console auth) → staff replay → delivery re-sent; tenant sees the delivery log update.
**Activity:** `webhook.delivery_failed` (deduped per endpoint per hour), `webhook.replayed` (platform.integrations). **Notify:** T when an endpoint is auto-disabled (if that behaviour exists).
- ACC-L10-1 replay re-sends the stored payload with a fresh signature.

### L11 Tenant payment gateway config
Tenant saves gateway keys in `IntegrationsTab` → `TenantPaymentGateway` (encrypted; no localStorage) → "Test connection" verifies → console sees provider/mode/status/last error (never secrets) → verification failures notify the tenant.
**Activity:** `gateway.configured`, `gateway.verified`, `gateway.failed` (platform.integrations). **Notify:** T on failure.
- ACC-L11-1 nothing gateway-related is written to `localStorage` (component test spies `Storage.prototype.setItem`).
- ACC-L11-2 the console response contains no secret fields.

### L12 Plan gates, overrides, flags, feature requests
Console override/feature override → `resolveTenantEntitlements` → backend `requireFeature` and tenant `PlanGate` both honour it. Tenant hitting a gate can "Request this feature" → `FeedbackItem` → console triage → status back to the tenant.
**Activity:** `tenant.plan_overridden`, `tenant.plan_override_revoked` (platform.tenants), `tenant.feature_overridden`, `tenant.feature_override_revoked` (platform.flags) (C79 renamed the spec's entitlement override events), `feedback.created`, `feedback.status_changed` (customer.feedback). **Notify:** T on override (plan) and feedback status; S `customer.feedback.read` on feature requests.
- ACC-L12-1 override → tenant backend and UI agree within 5 s.
- ACC-L12-2 gate request → console → PLANNED → tenant sees status.

### L13 Tenant staff management
Tenant invites/changes roles/suspends users → activity → C360 People shows invites, roles, status, MFA, last login → staff can lock a user in a security incident (dangerous) → tenant admins notified.
**Activity:** `user.invited`, `user.joined`, `user.role_changed`, `user.suspended`, `user.locked_by_fauward`, `user.unlocked_by_fauward` (customer.360). **Notify:** T on lock/unlock.
- ACC-L13-1 a locked user gets 401 `USER_LOCKED`; unlock restores access.

### L14 Notifications
Every platform-originated notification goes through `PlatformNotifier` → queue → worker → SENT/SKIPPED/FAILED → console delivery log shows real status.
**Activity:** none per notification (volume); failures surface as `notifications.failure_spike` (customer.comms) when > 5% fail in 1 h.
- ACC-L14-1 no `NotificationLog` row stays `QUEUED` longer than the worker's processing time in tests (every row comes from the worker).

### L15 Exceptions / escalations
Tenant escalates an exception (tenant exceptions page, reason) → `ExceptionCase.escalatedAt` → CRITICAL activity + staff notification → console Escalations page (console auth; replaces `escalations:all` WS) → staff assign/reply/resolve → tenant sees the reply and status.
**Activity:** `exception.escalated`, `exception.escalation_replied`, `exception.escalation_resolved` (platform.incidents). **Notify:** S `platform.incidents.write` on escalate; T on reply/resolve.
- ACC-L15-1 escalate → SSE event reaches a console client with permission → reply → tenant sees it.
- ACC-L15-2 control-tower and platform tracking routes reject legacy SUPER_ADMIN tenant JWTs and accept console sessions.

### L16 AI agent usage / limits
Tenant AI usage (metered by `llm-gateway`) → console C360 AI tab + tenants list column → staff set `TenantAiLimit` (dangerous) → gateway enforces → tenant notified and sees the limit in `AgentUsagePage`.
**Activity:** `ai.limit_changed` (customer.360), `ai.limit_reached` (deduped per tenant per day). **Notify:** T on limit change/limit reached; S `customer.success.read` on limit reached.
- ACC-L16-1 setting a monthly budget below current spend makes the next agent run return the gateway's limit error.

### L17 Tenant audit log
Tenant `AuditLogPage` works (`/v1/audit-log`) → console cross-tenant search over tenant `AuditLog` (tenant filter required without export permission) → C360 Audit tab.
**Activity:** none.
- ACC-L17-1 tenant audit page loads (no 404); console search filters by tenant/action/date.

### L18 Impersonation visibility
Staff start a session (read by default; write with extra permission) → tenant admins notified + banner while active → tenant staff-access log lists sessions with reason and in-session actions → session end recorded.
**Activity:** `impersonation.started`, `impersonation.ended` (platform.impersonation). **Notify:** T on start (email can be disabled per tenant; in-app cannot).
- ACC-L18-1 tenant admin sees the banner during the session and the log entry after.
- ACC-L18-2 in-session tenant audit rows show actor "Fauward staff (via impersonation)".

### L19 Usage and health inputs
Worker/upload/agent paths increment `UsageRecord` (`emailsSent`, `smsSent`, `storageMb`) → health score inputs include returns, customs, documents, AI, API usage → CS console and C360 Health show the inputs.
**Activity:** `health.score_changed` when a tenant crosses a band (customer.success).
- ACC-L19-1 a SENT email increments `emailsSent` exactly once (retries don't double count).

### L20 Relay AI drafts (Phase 4)
Relay AI drafts a reply → console Relay page shows the draft → staff edit + approve-and-send (`relay.routes.ts:213`) → tenant receives it.
**Activity:** `relay.draft_approved` (customer.support).
- ACC-L20-1 approve-and-send has a console caller and records the approving staff member.
