# 02 — Data Model Changes

All Prisma changes, in planning order. Numbering continues after `0035_agent_conversations`. The numbers below are **labels**, not guaranteed final numbers: assign the real number at creation (next free, in execution order) and update this index in the same PR. WPs and prompts cite the labels.

Conventions: `String` status fields stay strings where they already are (no enum churn); new closed sets use Prisma enums. All new tenant-owned models have `tenantId` + `@@index([tenantId, createdAt])`. Every destructive step (drop column/table, narrowing) is in its own migration, marked **⚠ destructive**, with a pre-check script and owner approval before production.

## Index

| Migration | Phase / WP | Summary |
|---|---|---|
| 0036_console_mfa (real: `0037_console_mfa`, C11) | P0 / WP-0.1 | `PlatformUser.mfaPendingSecretEncrypted`, `mfaEnrolledAt` |
| 0037_impersonation_hardening (real: `0038_…`, C11) | P0 / WP-0.5 | `PlatformImpersonationSession.endedAt/endedReason/exchangedAt`; `TenantSettings.notifyOnStaffAccess` |
| 0038_refund_integrity (real: `0039_…`, C11) | P0 / WP-0.6 | `Refund.currency`, `failureReason`; refund status set |
| 0039_suspension_unification (real: `0042_suspension_unification`, backfill `0042-suspension-records.ts`, C11) | P1 / WP-1.3 | `SuspensionRecord` source/category/publicReason/sourceRef/liftedVia/liftReason + backfill |
| 0040_ledger_kind (real: `0045_ledger_kind`, backfill `0045-ledger-kind.ts`, C11) | P1 / WP-1.5 | `enum LedgerKind`; `kind` on Invoice/Payment/Refund/CreditNote; `Invoice.stripeInvoiceId` |
| 0041_tenant_entitlements (real: `0043_tenant_entitlements`, C11) | P1 / WP-1.4 | `TenantFeatureOverride` |
| 0042_tenant_close (real: `0044_tenant_close`, C11) | P1 / WP-1.2 | `Tenant.closedAt`, `closedReason`, `purgeAfter`; `limitsOverriddenAt` (C42) |
| 0043_platform_activity (real: `0040_platform_activity`, C11) | P1 / WP-1.0 | `PlatformActivity`; `OutboxEvent.tenantId` |
| 0044_staff_notifications (real: `0041_staff_notifications`, C11) | P1 / WP-1.0 | `StaffNotification` |
| 0046_notification_delivery (real number; not in the original plan, C62) | P2 / WP-2.2 | `NotificationLog.tenantId` optional; `platformUserId`, `template`, `recipient`, `jobId @unique`, `attempts`, `provider`, `updatedAt` |
| 0045_support_audience (real: `0047_support_audience`, backfill `0047-ticket-messages.ts`, C11/C63; adds `slaBreachedAt`) | P2 / WP-2.3 | `TicketAudience`, `MessageAuthorType`, `MessageVisibility`; ticket/message columns; backfill |
| 0048_trust_safety_appeals (real number; not in the original plan, C64) | P2 / WP-2.4 | `FraudSignal.category/decisionNote/decidedAt`; `TenantAppeal.infoRequest/infoRequestedAt/tenantReply/tenantRepliedAt/decidedAt` |
| 0046_region_change_requests (real: `0050_region_change_requests`, C66; Tenant relation) | P2 / WP-2.6 | `RegionChangeRequest` |
| 0047_plan_change (real: `0051_plan_change`, backfill `0051-subscription-events.ts`, C67; adds `SubscriptionEvent.stripeEventId/planChangeRequestId`, `SaveOffer.redeemedCreditNoteId`) | P2 / WP-2.7 | `PlanChangeRequest`, `SubscriptionEvent`; `SaveOffer` redemption fields |
| 0048_feedback (real: `0052_feedback`, C68; Tenant/FeedbackItem relations) | P2 / WP-2.8 | `FeedbackItem`, `FeedbackComment`, `NpsPromptState` |
| 0049_announcement_receipts | P2 / WP-2.14 | `AnnouncementReceipt`; `PlatformAnnouncement.updatedAt/archivedAt` |
| 0050_dsar_exports (real: `0049_dsar_exports`, C65; adds `DSARRequest.overdueAt`, `ExportBlob.tenantId`) | P2 / WP-2.5 | `DSARRequest` fields; `ComplianceExport` fields; `ExportBlob`; `LegalHold.releaseReason` |
| 0051_tenant_payment_gateways | P2 / WP-2.12 | `TenantPaymentGateway` (encrypted); `TenantSettings.webhookSecret` encrypted in place |
| 0052_tenant_user_lock | P2 / WP-2.15 | `User.lockedAt/lockedReason/lockedByPlatformUserId` |
| 0053_ai_limits_and_escalations | P2 / WP-2.10, 2.11 | `TenantAiLimit` audit columns; `ExceptionCase` escalation columns |
| 0054_scheduled_job_runs | P3 / WP-3.8 | `ScheduledJobRun` |
| 0055_health_score_inputs | P3 / WP-3.3 | `TenantHealthScore.inputs`, `version` |
| 0056_incidents_native | P4 | `IncidentRecord.vendorId` optional + native fields |
| 0057_payment_disputes | P4 | `PaymentDispute` |
| 0058_dunning_runtime | P4 | `DunningSequence.isDefault`; `DunningEnrollment` |
| 0059_secret_inventory | P4 | `SecretCredential` inventory fields |
| 0060_kyc_manual | P4 | `KYCReview` / `SanctionsScreening` decision fields |
| 0061_gtm_producers | P4 | `MarketingAttribution` touch fields; `DemoEnvironment.adminUserId`; `TrialExtensionRequest.decidedAt`; `QBRDeck.sections/jobId` |
| 0062_drop_dead_models ⚠ | P4 | Drop 11 tables (D10), `TicketMessage.isInternal/fromSA`, `TenantSettings.paymentGatewayKey` |
| 0063_audit_chain | P5 | `PlatformAuditLog.seq`, `hashVersion` |
| 0064_legal_hold_global | P5 | `LegalHold.appliesToAllTenants` |
| 0065_ip_block_scope | P4 / WP-4.11 (enforced WP-5.4) | `IpBlock.scope/hitCount/lastHitAt` |

---

## Phase 0

### 0036_console_mfa
```prisma
model PlatformUser {
  // existing …
  mfaPendingSecretEncrypted String?   // enrolment in progress, AES-GCM (field-encryption)
  mfaEnrolledAt             DateTime?
}
```
Backfill script `0036-encrypt-totp-secrets.ts`: encrypt any `mfaSecretEncrypted` lacking the `v1:` prefix.

### 0037_impersonation_hardening
```prisma
model PlatformImpersonationSession {
  // existing …
  exchangedAt DateTime?   // one-time code redeemed
  endedAt     DateTime?   // revoked, expired (sweeper) or logged out
  endedReason String?     // REVOKED | EXPIRED | LOGOUT
  @@index([targetTenantId, createdAt])
}
model TenantSettings {
  // existing …
  notifyOnStaffAccess Boolean @default(true)
}
```

### 0038_refund_integrity
```prisma
model Refund {
  // existing …
  currency      String?
  failureReason String?
}
```
Refund `status` values become: `PENDING_APPROVAL | PROCESSING | SUCCEEDED | FAILED | RECORDED_MANUAL | REJECTED`. `RefundApproval` (exists) gets its first producer.

---

## Phase 1

Backfill script (no migration) `0039a-legacy-role-assignments.ts` — WP-1.1: creates `StaffRoleAssignment` rows from `PlatformUser.role` (`grantedBy: 'legacy-backfill'`), idempotent, `--dry-run`.

### 0039_suspension_unification
```prisma
model SuspensionRecord {
  id             String    @id @default(uuid())
  tenantId       String
  reason         String            // internal reason (staff-visible)
  publicReason   String?           // shown to the tenant
  source         String    @default("PLATFORM")  // PLATFORM|DUNNING|FRAUD|AUP|LEGAL|SYSTEM
  category       String    @default("OTHER")     // BILLING|FRAUD|AUP|SECURITY|LEGAL|OTHER
  sourceSignalId String?           // existing (fraud)
  sourceRef      String?           // invoiceId, fraudSignalId, etc.
  suspendedBy    String            // platformUserId or 'system'
  liftedBy       String?
  liftedVia      String?           // MANUAL|APPEAL|PAYMENT|EXPIRY
  liftReason     String?
  status         String    @default("ACTIVE")    // ACTIVE|LIFTED
  createdAt      DateTime  @default(now())
  liftedAt       DateTime?
  @@index([tenantId, status])
  @@map("suspension_records")
}
```
Backfill `0039-suspension-records.ts`: for each tenant with `status = SUSPENDED` and no ACTIVE record, create one (`source: SYSTEM`, `reason: tenant.suspensionReason ?? 'Backfilled from tenant status'`, `createdAt: tenant.suspendedAt ?? tenant.updatedAt`). Link open `TenantAppeal`s with `suspensionId = null` to that record.

### 0040_ledger_kind
```prisma
enum LedgerKind {
  PLATFORM
  TENANT_CUSTOMER
}
model Invoice    { kind LedgerKind @default(TENANT_CUSTOMER)  stripeInvoiceId String? @unique  @@index([kind, tenantId, createdAt]) }
model Payment    { kind LedgerKind @default(TENANT_CUSTOMER)  @@index([kind, tenantId, createdAt]) }
model Refund     { kind LedgerKind @default(TENANT_CUSTOMER) }
model CreditNote { kind LedgerKind @default(TENANT_CUSTOMER) }
```
Backfill `0040-ledger-kind.ts` per D4 (dry-run prints counts; owner approval before production run).

### 0041_tenant_entitlements
```prisma
model TenantFeatureOverride {
  id                      String    @id @default(uuid())
  tenantId                String
  featureKey              String            // planService feature key
  enabled                 Boolean
  reason                  String
  expiresAt               DateTime?
  createdByPlatformUserId String
  revokedAt               DateTime?
  revokedByPlatformUserId String?
  createdAt               DateTime  @default(now())
  @@index([tenantId, featureKey, revokedAt])
  @@map("tenant_feature_overrides")
}
```
Relation fields on `Tenant` as needed. `FeatureFlagOverrideAudit` is kept as the LaunchDarkly mirror log only.

### 0042_tenant_close
```prisma
model Tenant {
  // existing …
  closedAt     DateTime?
  closedReason String?
  purgeAfter   DateTime?   // closedAt + retention (config.tenants.closeRetentionDays, default 90)
}
```

---

## Phase 1 foundations (WP-1.0)

### 0043_platform_activity
```prisma
enum ActivitySeverity { INFO ATTENTION CRITICAL }
model PlatformActivity {
  id          String           @id @default(uuid())
  occurredAt  DateTime         @default(now())
  tenantId    String?
  service     String           // manifest id, e.g. "customer.support"
  type        String           // e.g. "ticket.created"
  actorType   String           // TENANT_USER|END_CUSTOMER|STAFF|SYSTEM|API_KEY|IMPERSONATOR
  actorId     String?
  actorLabel  String
  subjectType String
  subjectId   String
  summary     String
  severity    ActivitySeverity @default(INFO)
  consoleLink String?
  metadata    Json             @default("{}")
  dedupeKey   String           @unique
  @@index([tenantId, occurredAt])
  @@index([service, occurredAt])
  @@index([severity, occurredAt])
  @@map("platform_activity")
}
model OutboxEvent { tenantId String?  @@index([tenantId, createdAt]) }
```

### 0044_staff_notifications
```prisma
model StaffNotification {
  id             String           @id @default(uuid())
  platformUserId String
  event          String
  title          String
  body           String?
  link           String?
  severity       ActivitySeverity @default(INFO)
  tenantId       String?
  readAt         DateTime?
  createdAt      DateTime         @default(now())
  @@index([platformUserId, readAt, createdAt])
  @@map("staff_notifications")
}
```

## Phase 2

### 0045_support_audience
```prisma
enum TicketAudience     { END_CUSTOMER PLATFORM }
enum MessageAuthorType  { TENANT_USER END_CUSTOMER STAFF SYSTEM }
enum MessageVisibility  { PUBLIC TENANT_INTERNAL STAFF_INTERNAL }

model SupportTicket {
  // existing …
  audience              TicketAudience     @default(END_CUSTOMER)
  lastMessageAt         DateTime?
  lastMessageAuthorType MessageAuthorType?
  firstResponseAt       DateTime?
  linkedTicketId        String?
  assignedPlatformUserId String?           // Fauward assignee for PLATFORM tickets
  @@index([audience, status, lastMessageAt])
}
model TicketMessage {
  // existing …
  authorId   String?                       // was required
  authorType MessageAuthorType  @default(TENANT_USER)
  visibility MessageVisibility  @default(PUBLIC)
  // isInternal, fromSA kept until 0062
}
```
Backfill `0045-ticket-messages.ts`: `isInternal → TENANT_INTERNAL`; `fromSA → authorType STAFF` (keep `platformAuthorId`); tickets with any `fromSA` message or created through `/api/internal/support/tickets` → `audience PLATFORM`; set `lastMessageAt` from the newest message.

### 0046_region_change_requests
```prisma
model RegionChangeRequest {
  id                      String    @id @default(uuid())
  tenantId                String
  currentRegion           String
  requestedRegion         String
  requestedByUserId       String
  status                  String    @default("PENDING")  // PENDING|APPROVED|REJECTED|APPLIED|CANCELLED
  decisionReason          String?
  decidedByPlatformUserId String?
  decidedAt               DateTime?
  appliedAt               DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  @@index([status, createdAt])
  @@index([tenantId, createdAt])
  @@map("region_change_requests")
}
```

### 0047_plan_change
```prisma
model PlanChangeRequest {
  id                      String    @id @default(uuid())
  tenantId                String
  fromPlan                String
  toPlan                  String
  billingCycle            String    @default("MONTHLY")
  requestedByUserId       String
  status                  String    @default("PENDING")  // PENDING|APPROVED|REJECTED|APPLIED|CANCELLED|CHECKOUT_PENDING
  channel                 String                         // STRIPE_CHECKOUT|MANUAL_APPROVAL
  stripeCheckoutSessionId String?
  decisionReason          String?
  decidedByPlatformUserId String?
  decidedAt               DateTime?
  appliedAt               DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  @@index([status, createdAt])
  @@map("plan_change_requests")
}
model SubscriptionEvent {
  id          String   @id @default(uuid())
  tenantId    String
  type        String   // CREATED|PLAN_CHANGED|STATUS_CHANGED|CANCELLED|REACTIVATED|TRIAL_EXTENDED
  fromPlan    String?
  toPlan      String?
  fromStatus  String?
  toStatus    String?
  mrrBefore   Decimal? @db.Decimal(12, 2)
  mrrAfter    Decimal? @db.Decimal(12, 2)
  currency    String   @default("GBP")
  source      String   // STRIPE_WEBHOOK|CONSOLE|TENANT|SYSTEM|BACKFILL
  occurredAt  DateTime @default(now())
  @@index([tenantId, occurredAt])
  @@index([type, occurredAt])
  @@map("subscription_events")
}
model SaveOffer {
  // existing …
  code           String?   @unique
  redeemedAt     DateTime?
  stripeCouponId String?
}
```
Backfill `0047-subscription-events.ts`: one `CREATED` per `Subscription` (at `createdAt`), plus `CANCELLED` where `cancelledAt` is set, `source: BACKFILL`. Revenue analytics labels data before the backfill date as "reconstructed".

### 0048_feedback
```prisma
model FeedbackItem {
  id                     String    @id @default(uuid())
  tenantId               String
  userId                 String
  type                   String    // NPS|FEATURE_REQUEST|BUG|GENERAL
  score                  Int?      // NPS 0-10
  title                  String?
  body                   String?
  featureKey             String?   // set when raised from a PlanGate
  source                 String    // IN_APP_SURVEY|HELP_MENU|PLAN_GATE|SUPPORT
  status                 String    @default("NEW")  // NEW|UNDER_REVIEW|PLANNED|SHIPPED|DECLINED|CLOSED
  assignedPlatformUserId String?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
  @@index([type, status, createdAt])
  @@index([tenantId, createdAt])
  @@map("feedback_items")
}
model FeedbackComment {
  id               String   @id @default(uuid())
  feedbackId       String
  authorType       String   // STAFF|TENANT_USER
  authorId         String
  body             String
  visibleToTenant  Boolean  @default(true)
  createdAt        DateTime @default(now())
  @@index([feedbackId, createdAt])
  @@map("feedback_comments")
}
model NpsPromptState {
  userId          String    @id
  tenantId        String
  eligibleAt      DateTime?   // set by customer.nps-survey-dispatch
  lastPromptedAt  DateTime?
  dismissedAt     DateTime?
  lastRespondedAt DateTime?
  @@index([tenantId])
  @@map("nps_prompt_states")
}
```

### 0049_announcement_receipts
```prisma
model PlatformAnnouncement { /* existing … */ updatedAt DateTime @updatedAt  archivedAt DateTime? }
model AnnouncementReceipt {
  id             String    @id @default(uuid())
  announcementId String
  tenantId       String
  userId         String
  viewedAt       DateTime  @default(now())
  dismissedAt    DateTime?
  ctaClickedAt   DateTime?
  @@unique([announcementId, userId])
  @@index([announcementId])
  @@map("announcement_receipts")
}
```

### 0050_dsar_exports
```prisma
model DSARRequest {
  // existing …   requestType: ACCESS|ERASURE|RECTIFICATION|PORTABILITY (validated by zod)
  subjectUserId     String?
  identityVerifiedAt DateTime?
  erasureCompletedAt DateTime?
}
model ComplianceExport {
  // existing …
  storageProvider   String?   // SUPABASE|POSTGRES
  byteSize          Int?
  sha256            String?
  downloadTokenHash String?
  downloadedAt      DateTime?
  error             String?
}
model ExportBlob {
  id        String   @id @default(uuid())
  bytes     Bytes
  createdAt DateTime @default(now())
  @@map("export_blobs")
}
model LegalHold { /* existing: releasedBy, releasedAt */ releaseReason String? }
```

### 0051_tenant_payment_gateways
```prisma
model TenantPaymentGateway {
  id                    String    @id @default(uuid())
  tenantId              String
  provider              String    // STRIPE|PAYSTACK|FLUTTERWAVE
  mode                  String    // TEST|LIVE
  publicKey             String?
  secretKeyEncrypted    String?   // field-encryption
  webhookSecretEncrypted String?
  status                String    @default("UNVERIFIED") // UNVERIFIED|VERIFIED|FAILED|DISABLED
  lastVerifiedAt        DateTime?
  lastError             String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  @@unique([tenantId, provider, mode])
  @@map("tenant_payment_gateways")
}
```
Backfill: move `TenantSettings.paymentGatewayKey` (encrypted) into a row; column dropped in 0062. Encrypt `TenantSettings.webhookSecret` in place (`v1:` prefix) and update every reader (outgoing webhook signing) to decrypt.

### 0052_tenant_user_lock
```prisma
model User { lockedAt DateTime?  lockedReason String?  lockedByPlatformUserId String? }
```
`authenticate.ts` rejects locked users with 401 `USER_LOCKED`.

### 0053_ai_limits_and_escalations
```prisma
model TenantAiLimit { updatedAt DateTime @updatedAt  updatedByPlatformUserId String?  reason String? }
model ExceptionCase { escalatedAt DateTime?  escalatedByUserId String?  escalationReason String?  platformAssigneeId String?  platformResolvedAt DateTime? }
```

---

## Phase 3

### 0054_scheduled_job_runs
```prisma
model ScheduledJobRun {
  id          String    @id @default(uuid())
  jobName     String
  bullJobId   String?
  status      String    // RUNNING|SUCCEEDED|FAILED|TIMED_OUT
  triggeredBy String    // SCHEDULE|<platformUserId>
  reason      String?
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?
  durationMs  Int?
  error       String?
  result      Json?
  @@index([jobName, startedAt])
  @@map("scheduled_job_runs")
}
```

### 0055_health_score_inputs
```prisma
model TenantHealthScore { /* existing … */ inputs Json?  version Int @default(1) }
```

---

## Phase 4

### 0056_incidents_native
```prisma
model IncidentRecord {
  // existing …
  vendor                  String   @default("native")
  vendorId                String?  @unique          // was required
  commanderPlatformUserId String?
  publicSummary           String?
  announcementId          String?                   // PlatformAnnouncement shown to impacted tenants
  createdByPlatformUserId String?
}
model IncidentUpdate {
  id         String   @id @default(uuid())
  incidentId String
  status     String
  body       String
  isPublic   Boolean  @default(false)
  authorId   String
  createdAt  DateTime @default(now())
  @@index([incidentId, createdAt])
  @@map("incident_updates")
}
```

### 0057_payment_disputes
```prisma
model PaymentDispute {
  id              String   @id @default(uuid())
  tenantId        String
  paymentId       String?
  stripeDisputeId String   @unique
  amount          Decimal  @db.Decimal(12, 2)
  currency        String
  reason          String
  status          String   // warning_needs_response|needs_response|under_review|won|lost|…
  evidenceDueBy   DateTime?
  evidence        Json?
  submittedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([status, evidenceDueBy])
  @@map("payment_disputes")
}
```

### 0058_dunning_runtime
```prisma
model DunningSequence { /* existing … */ isDefault Boolean @default(false) }
model DunningEnrollment {
  id           String    @id @default(uuid())
  tenantId     String
  invoiceId    String
  sequenceId   String
  currentStep  Int       @default(0)
  nextActionAt DateTime
  status       String    @default("ACTIVE")  // ACTIVE|RECOVERED|EXHAUSTED|CANCELLED
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  @@unique([invoiceId])
  @@index([status, nextActionAt])
  @@map("dunning_enrollments")
}
```
`DunningSequence.steps Json` is superseded by `DunningStep` rows; dropped in a later cleanup.

### 0059_secret_inventory
```prisma
model SecretCredential {
  // existing …
  envName         String?   @unique
  source          String    @default("ENV")  // ENV|DOPPLER|MANUAL
  configured      Boolean   @default(false)
  fingerprint     String?   // first 12 hex of sha256(value); never the value
  firstSeenAt     DateTime?
  lastSeenAt      DateTime?
  lastRotatedAt   DateTime?
  rotateEveryDays Int?
}
```

### 0060_kyc_manual
```prisma
model KYCReview         { /* existing … */ evidence Json?  decisionReason String?  decidedAt DateTime? }
model SanctionsScreening { /* existing … */ decisionReason String?  decidedAt DateTime? }
```
`provider` default changes to `"manual"` for rows created without a vendor.

### 0061_gtm_producers
```prisma
model MarketingAttribution {
  // existing: source, campaign, landingPage, weight, revenue, payload; periodStart/periodEnd become optional
  touchType   String?   // FIRST_TOUCH
  utmSource   String?
  utmMedium   String?
  utmCampaign String?
  utmContent  String?
  utmTerm     String?
  referrer    String?
  firstSeenAt DateTime?
  signupAt    DateTime?
}
model DemoEnvironment      { adminUserId String? }
model TrialExtensionRequest { decidedAt DateTime?  decisionReason String? }
model QBRDeck              { sections Json?  jobId String?  generatedAt DateTime?  error String? }
```

### 0062_drop_dead_models ⚠ destructive
Drops: `SupportVendorTicket`, `SecretAccessLog`, `TaxReturn`, `QBRTemplate`, `PricingExperiment`, `Partner`, `PartnerApplication`, `PartnerDealRegistration`, `CommissionLedger`, `CommissionPayout`, `CommissionDispute`; columns `TicketMessage.isInternal`, `TicketMessage.fromSA`, `TenantSettings.paymentGatewayKey`. Pre-check script `0062-precheck.ts` prints row counts and non-null counts. Production run needs owner approval.

---

## Phase 5

### 0063_audit_chain
```prisma
model PlatformAuditLog {
  // existing …
  seq         BigInt  @unique @default(autoincrement())
  hashVersion Int     @default(1)
}
```
Writes take a Postgres advisory lock (`pg_advisory_xact_lock(<const>)`) inside the transaction, read the latest row by `seq`, compute the hash with the single scheme (`packages/internal-audit` `computeEntryHash`, `hashVersion 2`), insert. Verification walks by `seq` and accepts `hashVersion 1` rows only up to a recorded cut-over `seq`. The advisory lock is raw SQL (`$executeRaw`) because Prisma cannot express it.

### 0064_legal_hold_release
```prisma
model LegalHold { /* existing … */ appliesToAllTenants Boolean @default(false) }
```
A hold with `tenantId = null` blocks all tenants only when `appliesToAllTenants = true` (creating one needs `trust.compliance.legal-hold.write` + fresh MFA + reason + a second approver via JIT `ROOT`).

### 0065_ip_block_scope (ships in Phase 4, WP-4.11; enforced in WP-5.4)
```prisma
model IpBlock { /* existing … */ scope String @default("ALL")  hitCount Int @default(0)  lastHitAt DateTime? }
```
