import type { ReactElement, ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { type Permission } from "@fauward/internal-rbac";
import { JITGate } from "@fauward/internal-ui";

import { AccessDenied } from "@/components/service-kit/AccessDenied";
import { ComingSoonPage } from "@/components/service-kit/ComingSoonPage";
import { findServiceByKey } from "@/pillars/_manifests";
import { CustomerOverview } from "@/pillars/customer/CustomerOverview";
import { Customer360IndexPage } from "@/pillars/customer/customer360/Customer360IndexPage";
import { Customer360Page } from "@/pillars/customer/customer360/Customer360Page";
import { DeliveryLogPage } from "@/pillars/customer/comms/DeliveryLogPage";
import { AnnouncementsPage } from "@/pillars/customer/comms/AnnouncementsPage";
import { OnboardingFunnelPage, StuckTenantsPage } from "@/pillars/customer/onboarding/OnboardingPages";
import { TicketQueuePage } from "@/pillars/customer/support/TicketQueuePage";
import { TicketDetailPage } from "@/pillars/customer/support/TicketDetailPage";
import { MacrosPage, SlaPage } from "@/pillars/customer/support/SlaPage";
import { SignalsPage } from "@/pillars/trust/safety/SignalsPage";
import { RulesPage, SuspensionsPage } from "@/pillars/trust/safety/SuspensionsPage";
import { AppealDetailPage, AppealsPage } from "@/pillars/trust/safety/AppealsPage";
import { DsarDetailPage, DsarQueuePage } from "@/pillars/trust/compliance/DsarPages";
import { FeedbackBoardPage, FeedbackDetailPage, NpsPage } from "@/pillars/customer/feedback/FeedbackPages";
import { EscalationsPage } from "@/pillars/platform/incidents/EscalationsPage";
import { IncidentDetailPage, IncidentsListPage, RunbookEditorPage, RunbooksPage } from "@/pillars/platform/incidents/IncidentsPages";
import { WebhookFailuresPage } from "@/pillars/platform/integrations/WebhookFailuresPage";
import { DatabasePage } from "@/pillars/platform/database/DatabasePage";
import { CredentialsPage, IntegrationsListPage, ProviderDetailPage, TenantGatewaysPage } from "@/pillars/platform/integrations/IntegrationsPages";
import { PlanChangeRequestsPage, SubscriptionDetailPage, SubscriptionsListPage } from "@/pillars/revenue/subscriptions/SubscriptionsPages";
import { ContractsPage, OverridesPage } from "@/pillars/revenue/subscriptions/PricingPages";
import { ExportsPage, LegalHoldsPage } from "@/pillars/trust/compliance/LegalHoldsPage";
import { GtmOverview } from "@/pillars/gtm/GtmOverview";
import { InternalOpsPage } from "@/pillars/InternalOpsPage";
import { WorkflowOpsPage, hasWorkflowSurface } from "@/pillars/WorkflowOpsPage";
import { SystemHealthPage } from "@/pillars/platform/health/SystemHealthPage";
import { ImpersonationCenterPage } from "@/pillars/platform/impersonation/ImpersonationCenterPage";
import { SessionDetailPage } from "@/pillars/platform/impersonation/SessionDetailPage";
import { PlatformOverview } from "@/pillars/platform/PlatformOverview";
import { JobRunsPage, JobsListPage } from "@/pillars/platform/jobs/JobsPages";
import { FlagAuditPage, FlagDetailPage, FlagsListPage, ReleasesPage } from "@/pillars/platform/flags/FlagsPages";
import { QueueDetailPage } from "@/pillars/platform/queues/QueueDetailPage";
import { QueuesListPage } from "@/pillars/platform/queues/QueuesListPage";
import { TenantDetailPage } from "@/pillars/platform/tenants/TenantDetailPage";
import { QbrDeckPage, QbrListPage, QbrTenantPage } from "@/pillars/customer/qbr/QbrPages";
import { AtRiskPage, CsOverviewPage, ExpansionPage, PlaybookEditorPage, PlaybookRunsPage, PlaybooksPage, ScoringModelPage } from "@/pillars/customer/success/SuccessPages";
import { TenantsListPage } from "@/pillars/platform/tenants/TenantsListPage";
import { RegionRequestsPage } from "@/pillars/platform/tenants/RegionRequestsPage";
import { RevenueOverview } from "@/pillars/revenue/RevenueOverview";
import { RevenueAnalyticsPage } from "@/pillars/revenue/analytics/RevenueAnalyticsPage";
import { DisputeDetailPage, DisputesListPage } from "@/pillars/revenue/disputes/DisputesPages";
import { ExemptionsPage, RegistrationsPage, TaxOverviewPage } from "@/pillars/revenue/tax/TaxPages";
import { DunningOverviewPage, SaveOffersPage, SequenceEditorPage, SequencesPage, TenantDunningPage } from "@/pillars/revenue/dunning/DunningPages";
import { CreditNotesPage } from "@/pillars/revenue/billing/CreditNotesPage";
import { InvoiceCreatePage } from "@/pillars/revenue/billing/InvoiceCreatePage";
import { InvoiceDetailPage } from "@/pillars/revenue/billing/InvoiceDetailPage";
import { InvoicesListPage } from "@/pillars/revenue/billing/InvoicesListPage";
import { PaymentsPage } from "@/pillars/revenue/billing/PaymentsPage";
import { RefundsPage } from "@/pillars/revenue/billing/RefundsPage";
import { TrustOverview } from "@/pillars/trust/TrustOverview";
import { AuditExportPage } from "@/pillars/trust/audit/AuditExportPage";
import { AuditIntegrityPage } from "@/pillars/trust/audit/AuditIntegrityPage";
import { AuditLogPage } from "@/pillars/trust/audit/AuditLogPage";
import { AuditTimelinePage } from "@/pillars/trust/audit/AuditTimelinePage";
import { TenantAuditEventsPage } from "@/pillars/trust/audit/TenantAuditEventsPage";
import { GroupsPage } from "@/pillars/trust/iam/GroupsPage";
import { KycQueuePage, KycReviewPage, ScreeningsPage } from "@/pillars/trust/kyc/KycPages";
import { AnomaliesPage, IpBlocksPage, LoginsPage, SessionsPage } from "@/pillars/trust/security/SecurityPages";
import { ExpiringPage, SecretDetailPage, SecretsInventoryPage } from "@/pillars/trust/secrets/SecretsPages";
import { JitActivePage } from "@/pillars/trust/jit/JitActivePage";
import { JitHistoryPage } from "@/pillars/trust/jit/JitHistoryPage";
import { JitPendingPage } from "@/pillars/trust/jit/JitPendingPage";
import { JitRequestPage } from "@/pillars/trust/jit/JitRequestPage";
import { PermissionsPage } from "@/pillars/trust/iam/PermissionsPage";
import { RoleDetailPage } from "@/pillars/trust/iam/RoleDetailPage";
import { AttributionPage } from "@/pillars/gtm/attribution/AttributionPage";
import { CreateDemoPage, DemoDetailPage, DemoTemplatesPage, DemosPage } from "@/pillars/gtm/demos/DemosPages";
import { ApprovalsPage, DiscountsPage, MsasPage, QuoteEditorPage, QuotesPage } from "@/pillars/gtm/contracts/ContractsPages";
import { DealDetailPage, ForecastPage, PipelineBoardPage } from "@/pillars/gtm/pipeline/PipelinePages";
import { HandoffDetailPage, HandoffQueuePage, HandoffTemplatePage, WonPage } from "@/pillars/gtm/handoff/HandoffPages";
import { ExtensionsPage, TrialDetailPage, TrialsExpiringPage, TrialsPage } from "@/pillars/gtm/trials/TrialsPages";
import { RolesPage } from "@/pillars/trust/iam/RolesPage";
import { UserDetailPage } from "@/pillars/trust/iam/UserDetailPage";
import { UsersListPage } from "@/pillars/trust/iam/UsersListPage";
import { PillarDashboard } from "@/shell/PillarDashboard";

// Console routes rendered inside ShellLayout. The manifest reconciliation test (D1) reads this table.

export type ConsoleRoute = { path: string; element: ReactElement };

/**
 * Without the read permission a page renders the access-denied state with "Request access" (ACC-RBAC-1); the request
 * goes through JitRequestDialog, which shows API errors (ACC-JIT-6).
 */
export function PermissionRoute({ permission, children }: { permission: Permission; children: ReactNode }) {
  return (
    <JITGate permission={permission} fallback={<AccessDenied permission={permission} />}>
      {children}
    </JITGate>
  );
}

/** Generic Phase-0 page for preview services; deleted in Phase 4 (D1). */
export function OpsRoute({ permission, title, description, endpoint, related, notice }: { permission: Permission; title: string; description: string; endpoint: string; related?: Array<{ label: string; to: string }>; notice?: ReactNode }) {
  const Page = hasWorkflowSurface(endpoint) ? WorkflowOpsPage : InternalOpsPage;
  return (
    <PermissionRoute permission={permission}>
      {notice ? <div className="mb-4">{notice}</div> : null}
      <Page title={title} description={description} endpoint={endpoint} related={related} />
    </PermissionRoute>
  );
}

export function ComingSoonRoute({ serviceKey }: { serviceKey: string }) {
  const service = findServiceByKey(serviceKey);
  if (!service) return <Navigate to="/" replace />;
  return <ComingSoonPage service={service} />;
}

export const consoleRoutes: ConsoleRoute[] = [
  { path: "/", element: <PillarDashboard /> },
  { path: "/platform", element: <PlatformOverview /> },
  { path: "/platform/health", element: <PermissionRoute permission="platform.health.read">
                <SystemHealthPage />
              </PermissionRoute> },
  { path: "/platform/queues", element: <PermissionRoute permission="platform.queues.read">
                <QueuesListPage />
              </PermissionRoute> },
  { path: "/platform/queues/:name", element: <PermissionRoute permission="platform.queues.read">
                <QueueDetailPage />
              </PermissionRoute> },
  { path: "/platform/flags", element: <PermissionRoute permission="platform.flags.read"><FlagsListPage /></PermissionRoute> },
  { path: "/platform/flags/:key", element: <PermissionRoute permission="platform.flags.read"><FlagDetailPage /></PermissionRoute> },
  { path: "/platform/flags/:key/audit", element: <PermissionRoute permission="platform.flags.read"><FlagAuditPage /></PermissionRoute> },
  { path: "/platform/releases", element: <PermissionRoute permission="platform.flags.read"><ReleasesPage /></PermissionRoute> },
  { path: "/platform/incidents", element: <PermissionRoute permission="platform.incidents.read"><IncidentsListPage /></PermissionRoute> },
  { path: "/platform/incidents/escalations", element: <PermissionRoute permission="platform.incidents.read">
                <EscalationsPage />
              </PermissionRoute> },
  { path: "/platform/incidents/runbooks", element: <PermissionRoute permission="platform.incidents.read"><RunbooksPage /></PermissionRoute> },
  { path: "/platform/incidents/runbooks/:id", element: <PermissionRoute permission="platform.incidents.read"><RunbookEditorPage /></PermissionRoute> },
  { path: "/platform/incidents/:id", element: <PermissionRoute permission="platform.incidents.read"><IncidentDetailPage /></PermissionRoute> },
  { path: "/platform/jobs", element: <PermissionRoute permission="platform.jobs.read">
                <JobsListPage />
              </PermissionRoute> },
  { path: "/platform/jobs/:name", element: <PermissionRoute permission="platform.jobs.read">
                <JobRunsPage />
              </PermissionRoute> },
  { path: "/platform/database", element: <PermissionRoute permission="platform.database.read"><DatabasePage /></PermissionRoute> },
  { path: "/platform/integrations", element: <PermissionRoute permission="platform.integrations.read"><IntegrationsListPage /></PermissionRoute> },
  { path: "/platform/integrations/tenant-gateways", element: <PermissionRoute permission="platform.integrations.read"><TenantGatewaysPage /></PermissionRoute> },
  { path: "/platform/integrations/credentials", element: <PermissionRoute permission="platform.integrations.read"><CredentialsPage /></PermissionRoute> },
  { path: "/platform/integrations/webhooks", element: <PermissionRoute permission="platform.integrations.read">
                <WebhookFailuresPage />
              </PermissionRoute> },
  { path: "/platform/integrations/:provider", element: <PermissionRoute permission="platform.integrations.read"><ProviderDetailPage /></PermissionRoute> },
  { path: "/platform/impersonation", element: <PermissionRoute permission="platform.impersonation.start">
                <ImpersonationCenterPage />
              </PermissionRoute> },
  { path: "/platform/impersonation/sessions/:id", element: <PermissionRoute permission="platform.impersonation.start">
                <SessionDetailPage />
              </PermissionRoute> },
  { path: "/platform/tenants", element: <PermissionRoute permission="platform.tenants.read">
                <TenantsListPage />
              </PermissionRoute> },
  { path: "/platform/tenants/region-requests", element: <PermissionRoute permission="platform.tenants.read">
                <RegionRequestsPage />
              </PermissionRoute> },
  { path: "/platform/tenants/:id", element: <PermissionRoute permission="platform.tenants.read">
                <TenantDetailPage />
              </PermissionRoute> },
  { path: "/revenue", element: <RevenueOverview /> },
  { path: "/revenue/billing", element: <Navigate to="/revenue/billing/invoices" replace /> },
  { path: "/revenue/billing/invoices", element: <PermissionRoute permission="revenue.invoices.read">
                <InvoicesListPage />
              </PermissionRoute> },
  { path: "/revenue/billing/invoices/create", element: <PermissionRoute permission="revenue.invoices.write">
                <InvoiceCreatePage />
              </PermissionRoute> },
  { path: "/revenue/billing/invoices/:id", element: <PermissionRoute permission="revenue.invoices.read">
                <InvoiceDetailPage />
              </PermissionRoute> },
  { path: "/revenue/billing/credit-notes", element: <PermissionRoute permission="revenue.invoices.read">
                <CreditNotesPage />
              </PermissionRoute> },
  { path: "/revenue/billing/refunds", element: <PermissionRoute permission="revenue.invoices.refund">
                <RefundsPage />
              </PermissionRoute> },
  { path: "/revenue/billing/payments", element: <PermissionRoute permission="revenue.invoices.read">
                <PaymentsPage />
              </PermissionRoute> },
  { path: "/revenue/analytics", element: <PermissionRoute permission="revenue.analytics.read">
                <RevenueAnalyticsPage />
              </PermissionRoute> },
  { path: "/revenue/dunning", element: <PermissionRoute permission="revenue.dunning.read"><DunningOverviewPage /></PermissionRoute> },
  { path: "/revenue/dunning/tenants/:tenantId", element: <PermissionRoute permission="revenue.dunning.read"><TenantDunningPage /></PermissionRoute> },
  { path: "/revenue/dunning/sequences", element: <PermissionRoute permission="revenue.dunning.read"><SequencesPage /></PermissionRoute> },
  { path: "/revenue/dunning/sequences/:id", element: <PermissionRoute permission="revenue.dunning.read"><SequenceEditorPage /></PermissionRoute> },
  { path: "/revenue/dunning/save-offers", element: <PermissionRoute permission="revenue.dunning.read"><SaveOffersPage /></PermissionRoute> },
  { path: "/revenue/disputes", element: <PermissionRoute permission="revenue.disputes.read"><DisputesListPage /></PermissionRoute> },
  { path: "/revenue/disputes/:id", element: <PermissionRoute permission="revenue.disputes.read"><DisputeDetailPage /></PermissionRoute> },
  { path: "/revenue/recognition", element: <ComingSoonRoute serviceKey="revenue.recognition" /> },
  { path: "/revenue/tax", element: <PermissionRoute permission="revenue.tax.read"><TaxOverviewPage /></PermissionRoute> },
  { path: "/revenue/tax/registrations", element: <PermissionRoute permission="revenue.tax.read"><RegistrationsPage /></PermissionRoute> },
  { path: "/revenue/tax/exemptions", element: <PermissionRoute permission="revenue.tax.read"><ExemptionsPage /></PermissionRoute> },
  { path: "/revenue/subscriptions", element: <PermissionRoute permission="revenue.subscriptions.read">
                <SubscriptionsListPage />
              </PermissionRoute> },
  { path: "/revenue/subscriptions/plan-change-requests", element: <PermissionRoute permission="revenue.subscriptions.read">
                <PlanChangeRequestsPage />
              </PermissionRoute> },
  { path: "/revenue/subscriptions/contracts", element: <PermissionRoute permission="revenue.subscriptions.read">
                <ContractsPage />
              </PermissionRoute> },
  { path: "/revenue/subscriptions/overrides", element: <PermissionRoute permission="revenue.subscriptions.read">
                <OverridesPage />
              </PermissionRoute> },
  { path: "/revenue/subscriptions/:id", element: <PermissionRoute permission="revenue.subscriptions.read">
                <SubscriptionDetailPage />
              </PermissionRoute> },
  { path: "/revenue/commissions", element: <ComingSoonRoute serviceKey="revenue.commissions" /> },
  { path: "/customer", element: <CustomerOverview /> },
  { path: "/customer/360", element: <PermissionRoute permission="customer.360.read">
                <Customer360IndexPage />
              </PermissionRoute> },
  { path: "/customer/feedback", element: <PermissionRoute permission="customer.feedback.read">
                <FeedbackBoardPage />
              </PermissionRoute> },
  { path: "/customer/feedback/nps", element: <PermissionRoute permission="customer.feedback.read">
                <NpsPage />
              </PermissionRoute> },
  { path: "/customer/feedback/:id", element: <PermissionRoute permission="customer.feedback.read">
                <FeedbackDetailPage />
              </PermissionRoute> },
  { path: "/customer/kb", element: <ComingSoonRoute serviceKey="customer.kb" /> },
  { path: "/customer/360/:tenantId", element: <PermissionRoute permission="customer.360.read">
                <Customer360Page />
              </PermissionRoute> },
  { path: "/customer/support", element: <PermissionRoute permission="customer.support.read">
                <TicketQueuePage />
              </PermissionRoute> },
  { path: "/customer/support/tickets/:id", element: <PermissionRoute permission="customer.support.read">
                <TicketDetailPage />
              </PermissionRoute> },
  { path: "/customer/support/sla", element: <PermissionRoute permission="customer.support.read">
                <SlaPage />
              </PermissionRoute> },
  { path: "/customer/support/macros", element: <PermissionRoute permission="customer.support.read">
                <MacrosPage />
              </PermissionRoute> },
  { path: "/customer/success", element: <PermissionRoute permission="customer.success.read"><CsOverviewPage /></PermissionRoute> },
  { path: "/customer/success/at-risk", element: <PermissionRoute permission="customer.success.read"><AtRiskPage /></PermissionRoute> },
  { path: "/customer/success/expansion", element: <PermissionRoute permission="customer.success.read"><ExpansionPage /></PermissionRoute> },
  { path: "/customer/success/playbooks", element: <PermissionRoute permission="customer.success.read"><PlaybooksPage /></PermissionRoute> },
  { path: "/customer/success/playbooks/:id", element: <PermissionRoute permission="customer.success.read"><PlaybookEditorPage /></PermissionRoute> },
  { path: "/customer/success/playbooks/:id/runs", element: <PermissionRoute permission="customer.success.read"><PlaybookRunsPage /></PermissionRoute> },
  { path: "/customer/success/health-scoring", element: <PermissionRoute permission="customer.success.read"><ScoringModelPage /></PermissionRoute> },
  { path: "/customer/comms", element: <PermissionRoute permission="customer.comms.read">
                <AnnouncementsPage />
              </PermissionRoute> },
  { path: "/customer/comms/delivery-log", element: <PermissionRoute permission="customer.comms.read">
                <DeliveryLogPage />
              </PermissionRoute> },
  { path: "/customer/onboarding", element: <PermissionRoute permission="customer.onboarding.read">
                <OnboardingFunnelPage />
              </PermissionRoute> },
  { path: "/customer/onboarding/stuck", element: <PermissionRoute permission="customer.onboarding.read">
                <StuckTenantsPage />
              </PermissionRoute> },
  { path: "/customer/qbr", element: <PermissionRoute permission="customer.qbr.read"><QbrListPage /></PermissionRoute> },
  { path: "/customer/qbr/decks/:id", element: <PermissionRoute permission="customer.qbr.read"><QbrDeckPage /></PermissionRoute> },
  { path: "/customer/qbr/tenants/:tenantId", element: <PermissionRoute permission="customer.qbr.read"><QbrTenantPage /></PermissionRoute> },
  { path: "/trust", element: <TrustOverview /> },
  { path: "/trust/iam", element: <Navigate to="/trust/iam/users" replace /> },
  { path: "/trust/iam/users", element: <PermissionRoute permission="trust.iam.read">
                <UsersListPage />
              </PermissionRoute> },
  { path: "/trust/iam/users/:id", element: <PermissionRoute permission="trust.iam.read">
                <UserDetailPage />
              </PermissionRoute> },
  { path: "/trust/iam/roles", element: <PermissionRoute permission="trust.iam.read">
                <RolesPage />
              </PermissionRoute> },
  { path: "/trust/iam/roles/:id", element: <PermissionRoute permission="trust.iam.read">
                <RoleDetailPage />
              </PermissionRoute> },
  { path: "/trust/iam/permissions", element: <PermissionRoute permission="trust.iam.read">
                <PermissionsPage />
              </PermissionRoute> },
  { path: "/trust/iam/groups", element: <PermissionRoute permission="trust.iam.read">
                <GroupsPage />
              </PermissionRoute> },
  { path: "/trust/audit", element: <PermissionRoute permission="trust.audit.read">
                <AuditLogPage />
              </PermissionRoute> },
  { path: "/trust/audit/tenant-events", element: <PermissionRoute permission="trust.audit.read">
                <TenantAuditEventsPage />
              </PermissionRoute> },
  { path: "/trust/audit/timeline", element: <PermissionRoute permission="trust.audit.read">
                <AuditTimelinePage />
              </PermissionRoute> },
  { path: "/trust/audit/export", element: <PermissionRoute permission="trust.audit.export">
                <AuditExportPage />
              </PermissionRoute> },
  { path: "/trust/audit/integrity", element: <PermissionRoute permission="trust.audit.read">
                <AuditIntegrityPage />
              </PermissionRoute> },
  { path: "/trust/jit", element: <Navigate to="/trust/jit/request" replace /> },
  { path: "/trust/jit/request", element: <PermissionRoute permission="trust.jit.request">
                <JitRequestPage />
              </PermissionRoute> },
  { path: "/trust/jit/pending", element: <PermissionRoute permission="trust.jit.approve">
                <JitPendingPage />
              </PermissionRoute> },
  { path: "/trust/jit/active", element: <PermissionRoute permission="trust.jit.approve">
                <JitActivePage />
              </PermissionRoute> },
  { path: "/trust/jit/audit", element: <PermissionRoute permission="trust.jit.approve">
                <JitHistoryPage />
              </PermissionRoute> },
  { path: "/trust/compliance", element: <Navigate to="/trust/compliance/dsar" replace /> },
  { path: "/trust/compliance/dsar", element: <PermissionRoute permission="trust.compliance.dsar.read">
                <DsarQueuePage />
              </PermissionRoute> },
  { path: "/trust/compliance/dsar/:id", element: <PermissionRoute permission="trust.compliance.dsar.read">
                <DsarDetailPage />
              </PermissionRoute> },
  { path: "/trust/compliance/legal-hold", element: <PermissionRoute permission="trust.compliance.legal-hold.read">
                <LegalHoldsPage />
              </PermissionRoute> },
  { path: "/trust/compliance/exports", element: <PermissionRoute permission="trust.compliance.dsar.read">
                <ExportsPage />
              </PermissionRoute> },
  { path: "/trust/safety", element: <Navigate to="/trust/safety/appeals" replace /> },
  { path: "/trust/safety/fraud", element: <Navigate to="/trust/safety/signals?category=FRAUD" replace /> },
  { path: "/trust/safety/aup", element: <Navigate to="/trust/safety/signals?category=AUP" replace /> },
  { path: "/trust/safety/signals", element: <PermissionRoute permission="trust.safety.read">
                <SignalsPage />
              </PermissionRoute> },
  { path: "/trust/safety/suspensions", element: <PermissionRoute permission="trust.safety.read">
                <SuspensionsPage />
              </PermissionRoute> },
  { path: "/trust/safety/appeals", element: <PermissionRoute permission="trust.safety.read">
                <AppealsPage />
              </PermissionRoute> },
  { path: "/trust/safety/appeals/:id", element: <PermissionRoute permission="trust.safety.read">
                <AppealDetailPage />
              </PermissionRoute> },
  { path: "/trust/safety/rules", element: <PermissionRoute permission="trust.safety.read">
                <RulesPage />
              </PermissionRoute> },
  { path: "/trust/secrets", element: <PermissionRoute permission="trust.secrets.read"><SecretsInventoryPage /></PermissionRoute> },
  { path: "/trust/secrets/expiring", element: <PermissionRoute permission="trust.secrets.read"><ExpiringPage /></PermissionRoute> },
  { path: "/trust/secrets/:id", element: <PermissionRoute permission="trust.secrets.read"><SecretDetailPage /></PermissionRoute> },
  { path: "/trust/security", element: <PermissionRoute permission="trust.security.read"><AnomaliesPage /></PermissionRoute> },
  { path: "/trust/security/anomalies", element: <PermissionRoute permission="trust.security.read"><AnomaliesPage /></PermissionRoute> },
  { path: "/trust/security/logins", element: <PermissionRoute permission="trust.security.read"><LoginsPage /></PermissionRoute> },
  { path: "/trust/security/ip-blocks", element: <PermissionRoute permission="trust.security.read"><IpBlocksPage /></PermissionRoute> },
  { path: "/trust/security/sessions", element: <PermissionRoute permission="trust.security.read"><SessionsPage /></PermissionRoute> },
  { path: "/trust/kyc", element: <PermissionRoute permission="trust.kyc.read"><KycQueuePage /></PermissionRoute> },
  { path: "/trust/kyc/:id", element: <PermissionRoute permission="trust.kyc.read"><KycReviewPage /></PermissionRoute> },
  { path: "/trust/kyc/sanctions", element: <PermissionRoute permission="trust.kyc.read"><ScreeningsPage /></PermissionRoute> },
  { path: "/gtm", element: <GtmOverview /> },
  { path: "/gtm/pipeline", element: <PermissionRoute permission="gtm.pipeline.read"><PipelineBoardPage /></PermissionRoute> },
  { path: "/gtm/pipeline/forecasting", element: <PermissionRoute permission="gtm.pipeline.read"><ForecastPage /></PermissionRoute> },
  { path: "/gtm/pipeline/:dealId", element: <PermissionRoute permission="gtm.pipeline.read"><DealDetailPage /></PermissionRoute> },
  { path: "/gtm/attribution", element: <PermissionRoute permission="gtm.attribution.read"><AttributionPage tab="sources" /></PermissionRoute> },
  { path: "/gtm/attribution/campaigns", element: <PermissionRoute permission="gtm.attribution.read"><AttributionPage tab="campaigns" /></PermissionRoute> },
  { path: "/gtm/attribution/funnel", element: <PermissionRoute permission="gtm.attribution.read"><AttributionPage tab="funnel" /></PermissionRoute> },
  { path: "/gtm/attribution/landing-pages", element: <PermissionRoute permission="gtm.attribution.read"><AttributionPage tab="landing-pages" /></PermissionRoute> },
  { path: "/gtm/demos", element: <PermissionRoute permission="gtm.demos.read"><DemosPage /></PermissionRoute> },
  { path: "/gtm/demos/create", element: <PermissionRoute permission="gtm.demos.write"><CreateDemoPage /></PermissionRoute> },
  { path: "/gtm/demos/templates", element: <PermissionRoute permission="gtm.demos.read"><DemoTemplatesPage /></PermissionRoute> },
  { path: "/gtm/demos/:id", element: <PermissionRoute permission="gtm.demos.read"><DemoDetailPage /></PermissionRoute> },
  { path: "/gtm/trials", element: <PermissionRoute permission="gtm.trials.read"><TrialsPage /></PermissionRoute> },
  { path: "/gtm/trials/expiring", element: <PermissionRoute permission="gtm.trials.read"><TrialsExpiringPage /></PermissionRoute> },
  { path: "/gtm/trials/extensions", element: <PermissionRoute permission="gtm.trials.read"><ExtensionsPage /></PermissionRoute> },
  { path: "/gtm/trials/:tenantId", element: <PermissionRoute permission="gtm.trials.read"><TrialDetailPage /></PermissionRoute> },
  { path: "/gtm/handoff", element: <PermissionRoute permission="gtm.handoff.read"><HandoffQueuePage /></PermissionRoute> },
  { path: "/gtm/handoff/won", element: <PermissionRoute permission="gtm.handoff.read"><WonPage /></PermissionRoute> },
  { path: "/gtm/handoff/onboarding-queue", element: <Navigate to="/gtm/handoff?stage=CS" replace /> },
  { path: "/gtm/handoff/templates", element: <PermissionRoute permission="gtm.handoff.read"><HandoffTemplatePage /></PermissionRoute> },
  { path: "/gtm/handoff/:id", element: <PermissionRoute permission="gtm.handoff.read"><HandoffDetailPage /></PermissionRoute> },
  { path: "/gtm/pricing", element: <ComingSoonRoute serviceKey="gtm.pricing" /> },
  { path: "/gtm/contracts/quotes", element: <PermissionRoute permission="gtm.contracts.read"><QuotesPage /></PermissionRoute> },
  { path: "/gtm/contracts/quotes/new", element: <PermissionRoute permission="gtm.contracts.write"><QuoteEditorPage /></PermissionRoute> },
  { path: "/gtm/contracts", element: <Navigate to="/gtm/contracts/quotes" replace /> },
  { path: "/gtm/contracts/quotes/:id", element: <PermissionRoute permission="gtm.contracts.read"><QuoteEditorPage /></PermissionRoute> },
  { path: "/gtm/contracts/approvals", element: <PermissionRoute permission="gtm.contracts.read"><ApprovalsPage /></PermissionRoute> },
  { path: "/gtm/contracts/discounts", element: <PermissionRoute permission="gtm.contracts.read"><DiscountsPage /></PermissionRoute> },
  { path: "/gtm/contracts/msas", element: <PermissionRoute permission="gtm.contracts.read"><MsasPage /></PermissionRoute> },
  { path: "/gtm/partners", element: <ComingSoonRoute serviceKey="gtm.partners" /> },
];
