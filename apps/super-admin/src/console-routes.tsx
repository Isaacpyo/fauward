import type { ReactElement, ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { type Permission } from "@fauward/internal-rbac";
import { JITGate } from "@fauward/internal-ui";

import { AccessDenied } from "@/components/service-kit/AccessDenied";
import { ComingSoonPage } from "@/components/service-kit/ComingSoonPage";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { findServiceByKey } from "@/pillars/_manifests";
import { CustomerOverview } from "@/pillars/customer/CustomerOverview";
import { Customer360IndexPage } from "@/pillars/customer/customer360/Customer360IndexPage";
import { Customer360Page } from "@/pillars/customer/customer360/Customer360Page";
import { DeliveryLogPage } from "@/pillars/customer/comms/DeliveryLogPage";
import { TicketQueuePage } from "@/pillars/customer/support/TicketQueuePage";
import { TicketDetailPage } from "@/pillars/customer/support/TicketDetailPage";
import { MacrosPage, SlaPage } from "@/pillars/customer/support/SlaPage";
import { GtmOverview } from "@/pillars/gtm/GtmOverview";
import { InternalOpsPage } from "@/pillars/InternalOpsPage";
import { WorkflowOpsPage, hasWorkflowSurface } from "@/pillars/WorkflowOpsPage";
import { SystemHealthPage } from "@/pillars/platform/health/SystemHealthPage";
import { ImpersonationCenterPage } from "@/pillars/platform/impersonation/ImpersonationCenterPage";
import { SessionDetailPage } from "@/pillars/platform/impersonation/SessionDetailPage";
import { PlatformOverview } from "@/pillars/platform/PlatformOverview";
import { QueuesListPage } from "@/pillars/platform/queues/QueuesListPage";
import { TenantDetailPage } from "@/pillars/platform/tenants/TenantDetailPage";
import { TenantsListPage } from "@/pillars/platform/tenants/TenantsListPage";
import { RegionRequestsPage } from "@/pillars/platform/tenants/RegionRequestsPage";
import { RevenueOverview } from "@/pillars/revenue/RevenueOverview";
import { RevenueAnalyticsPage } from "@/pillars/revenue/analytics/RevenueAnalyticsPage";
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
import { GroupsPage } from "@/pillars/trust/iam/GroupsPage";
import { JitActivePage } from "@/pillars/trust/jit/JitActivePage";
import { JitHistoryPage } from "@/pillars/trust/jit/JitHistoryPage";
import { JitPendingPage } from "@/pillars/trust/jit/JitPendingPage";
import { JitRequestPage } from "@/pillars/trust/jit/JitRequestPage";
import { PermissionsPage } from "@/pillars/trust/iam/PermissionsPage";
import { RoleDetailPage } from "@/pillars/trust/iam/RoleDetailPage";
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
export function OpsRoute({ permission, title, description, endpoint, related, primaryAction, notice }: { permission: Permission; title: string; description: string; endpoint: string; related?: Array<{ label: string; to: string }>; primaryAction?: string; notice?: ReactNode }) {
  const Page = hasWorkflowSurface(endpoint) ? WorkflowOpsPage : InternalOpsPage;
  return (
    <PermissionRoute permission={permission}>
      {notice ? <div className="mb-4">{notice}</div> : null}
      <Page title={title} description={description} endpoint={endpoint} related={related} primaryAction={primaryAction} />
    </PermissionRoute>
  );
}

const flagOverridesNotWired = (
  <DegradedBanner variant="not-wired" fixedBy="WP-4.1">
    Per-tenant feature overrides are native now and are set on each tenant's Plan &amp; entitlements tab. This page is rebuilt on them in WP-4.1; LaunchDarkly is not mirrored yet.
  </DegradedBanner>
);

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
  { path: "/platform/flags", element: <OpsRoute permission="platform.flags.read" title="Feature Flags" description="LaunchDarkly flags with Fauward per-tenant override audit." endpoint="/flags" related={[{ label: "Releases", to: "/platform/releases" }]} notice={flagOverridesNotWired} /> },
  { path: "/platform/flags/:key", element: <OpsRoute permission="platform.flags.read" title="Feature Flag Detail" description="Flag detail, tenant overrides and local audit entries." endpoint="/flags/:key" related={[{ label: "Audit", to: "audit" }]} notice={flagOverridesNotWired} /> },
  { path: "/platform/flags/:key/audit", element: <OpsRoute permission="platform.flags.read" title="Flag Audit" description="Local audit of per-tenant LaunchDarkly override changes." endpoint="/flags/:key/audit" /> },
  { path: "/platform/releases", element: <OpsRoute permission="platform.flags.read" title="Releases" description="Current deployed versions and release workflow links." endpoint="/releases" /> },
  { path: "/platform/incidents", element: <OpsRoute permission="platform.incidents.read" title="Incidents" description="PagerDuty incidents enriched with affected Fauward tenants." endpoint="/incidents" related={[{ label: "Runbooks", to: "/platform/incidents/runbooks" }]} /> },
  { path: "/platform/incidents/runbooks", element: <OpsRoute permission="platform.incidents.read" title="Incident Runbooks" description="Markdown runbook library for incident responders." endpoint="/incidents/runbooks" /> },
  { path: "/platform/incidents/:id", element: <OpsRoute permission="platform.incidents.read" title="Incident Detail" description="Incident timeline and tenant impact mapping." endpoint="/incidents/:id" /> },
  { path: "/platform/incidents/:id/postmortem", element: <OpsRoute permission="platform.incidents.read" title="Postmortem" description="Postmortem link and incident closure context." endpoint="/incidents/:id" /> },
  { path: "/platform/jobs", element: <ComingSoonRoute serviceKey="platform.jobs" /> },
  { path: "/platform/database", element: <ComingSoonRoute serviceKey="platform.database" /> },
  { path: "/platform/integrations", element: <OpsRoute permission="platform.integrations.read" title="Integration Health" description="Third-party provider status, credentials and webhook delivery health." endpoint="/integrations" related={[{ label: "Credentials", to: "/platform/integrations/credentials" }, { label: "Webhooks", to: "/platform/integrations/webhooks" }]} /> },
  { path: "/platform/integrations/credentials", element: <OpsRoute permission="platform.integrations.read" title="Integration Credentials" description="Credential metadata shared with the secret rotation tracker." endpoint="/integrations/credentials" /> },
  { path: "/platform/integrations/webhooks", element: <OpsRoute permission="platform.integrations.read" title="Webhook Health" description="Outbound webhook delivery attempts, retries and failures." endpoint="/integrations/webhooks" /> },
  { path: "/platform/integrations/:provider", element: <OpsRoute permission="platform.integrations.read" title="Provider Detail" description="Provider health detail and recent status." endpoint="/integrations/:provider" /> },
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
  { path: "/revenue/dunning", element: <OpsRoute permission="revenue.dunning.read" title="Dunning Manager" description="Failed payment recovery, retry limits and save-the-customer offers." endpoint="/dunning/failed-payments" related={[{ label: "Sequences", to: "/revenue/dunning/sequences" }, { label: "Save Offers", to: "/revenue/dunning/save-offers" }]} /> },
  { path: "/revenue/dunning/:tenantId", element: <OpsRoute permission="revenue.dunning.read" title="Dunning Timeline" description="Tenant-level failed payment and recovery timeline." endpoint="/dunning/timeline/:tenantId" /> },
  { path: "/revenue/dunning/sequences", element: <OpsRoute permission="revenue.dunning.read" title="Dunning Sequences" description="Email and action sequences for failed payment recovery." endpoint="/dunning/sequences" /> },
  { path: "/revenue/dunning/save-offers", element: <OpsRoute permission="revenue.dunning.read" title="Save Offers" description="Approved discounts and credits for save-the-customer workflows." endpoint="/dunning/save-offers" /> },
  { path: "/revenue/disputes", element: <ComingSoonRoute serviceKey="revenue.disputes" /> },
  { path: "/revenue/recognition", element: <ComingSoonRoute serviceKey="revenue.recognition" /> },
  { path: "/revenue/tax", element: <OpsRoute permission="revenue.tax.read" title="Tax & Compliance" description="Regional VAT/GST registrations, returns and exemption workflow." endpoint="/tax" related={[{ label: "Returns", to: "/revenue/tax/returns" }, { label: "Registrations", to: "/revenue/tax/registrations" }, { label: "Exemptions", to: "/revenue/tax/exemptions" }]} /> },
  { path: "/revenue/tax/returns", element: <OpsRoute permission="revenue.tax.read" title="Tax Returns" description="Per-region return periods and filing status." endpoint="/tax/returns" /> },
  { path: "/revenue/tax/registrations", element: <OpsRoute permission="revenue.tax.read" title="Tax Registrations" description="VAT and GST registrations across Fauward operating regions." endpoint="/tax/registrations" /> },
  { path: "/revenue/tax/exemptions", element: <OpsRoute permission="revenue.tax.read" title="Tax Exemptions" description="Tenant exemption certificates and approval state." endpoint="/tax/exemptions" /> },
  { path: "/revenue/subscriptions", element: <OpsRoute permission="revenue.subscriptions.read" title="Subscription Manager" description="Custom contracts, pricing overrides and subscription state." endpoint="/subscriptions" related={[{ label: "Contracts", to: "/revenue/subscriptions/contracts" }, { label: "Overrides", to: "/revenue/subscriptions/overrides" }]} /> },
  { path: "/revenue/subscriptions/:id", element: <OpsRoute permission="revenue.subscriptions.read" title="Subscription Detail" description="Subscription and custom contract context." endpoint="/subscriptions" /> },
  { path: "/revenue/subscriptions/contracts", element: <OpsRoute permission="revenue.subscriptions.read" title="Enterprise MSAs" description="Custom contracts and signed agreement metadata." endpoint="/subscriptions/contracts" /> },
  { path: "/revenue/subscriptions/overrides", element: <OpsRoute permission="revenue.subscriptions.read" title="Pricing Overrides" description="Non-standard pricing approvals and active override rules." endpoint="/subscriptions/overrides" /> },
  { path: "/revenue/commissions", element: <OpsRoute permission="revenue.commissions.read" title="Reseller Commissions" description="Partner commission ledger and payout controls." endpoint="/commissions" related={[{ label: "Payouts", to: "/revenue/commissions/payouts" }, { label: "Disputes", to: "/revenue/commissions/disputes" }]} /> },
  { path: "/revenue/commissions/payouts", element: <OpsRoute permission="revenue.commissions.read" title="Commission Payouts" description="Finance-approved payout queue with CFO threshold controls." endpoint="/commissions/payouts" /> },
  { path: "/revenue/commissions/disputes", element: <OpsRoute permission="revenue.commissions.read" title="Commission Disputes" description="Partner disputes over commission attribution or payout." endpoint="/commissions/disputes" /> },
  { path: "/revenue/commissions/:partnerId", element: <OpsRoute permission="revenue.commissions.read" title="Partner Commissions" description="Per-partner commission ledger and payout history." endpoint="/commissions" /> },
  { path: "/customer", element: <CustomerOverview /> },
  { path: "/customer/360", element: <PermissionRoute permission="customer.360.read">
                <Customer360IndexPage />
              </PermissionRoute> },
  { path: "/customer/feedback", element: <ComingSoonRoute serviceKey="customer.feedback" /> },
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
  { path: "/customer/success", element: <OpsRoute permission="customer.success.read" title="CS Console" description="CSM book of business and tenant health score rollups." endpoint="/success" related={[{ label: "At Risk", to: "/customer/success/at-risk" }, { label: "Expansion", to: "/customer/success/expansion" }, { label: "Playbooks", to: "/customer/success/playbooks" }, { label: "Health Scoring", to: "/customer/success/health-scoring" }]} /> },
  { path: "/customer/success/at-risk", element: <OpsRoute permission="customer.success.read" title="At-Risk Accounts" description="Low health score tenants queued for intervention." endpoint="/success/at-risk" /> },
  { path: "/customer/success/expansion", element: <OpsRoute permission="customer.success.read" title="Expansion Ready" description="High health score tenants ready for expansion motion." endpoint="/success/expansion" /> },
  { path: "/customer/success/playbooks", element: <OpsRoute permission="customer.success.read" title="CS Playbooks" description="Health-triggered customer success playbooks." endpoint="/success/playbooks" /> },
  { path: "/customer/success/playbooks/:id/runs", element: <OpsRoute permission="customer.success.read" title="Playbook Runs" description="Sequential playbook execution status for tenant workflows." endpoint="/success/playbooks/:id/runs" /> },
  { path: "/customer/success/health-scoring", element: <OpsRoute permission="customer.success.read" title="Health Scoring" description="Weighted model configuration for nightly health scoring." endpoint="/success/health-scoring" /> },
  { path: "/customer/comms", element: <OpsRoute permission="customer.comms.read" title="Communications Hub" description="Tenant-facing announcements and incident notices." endpoint="/announcements" primaryAction="New announcement" related={[{ label: "Delivery log", to: "/customer/comms/delivery-log" }]} /> },
  { path: "/customer/comms/delivery-log", element: <PermissionRoute permission="customer.comms.read">
                <DeliveryLogPage />
              </PermissionRoute> },
  { path: "/customer/onboarding", element: <OpsRoute permission="customer.onboarding.read" title="Onboarding Tracker" description="Activation funnel for recently created tenants." endpoint="/onboarding/funnel" /> },
  { path: "/customer/qbr", element: <OpsRoute permission="customer.qbr.read" title="QBR Center" description="Quarterly business review calendar and generated decks." endpoint="/qbr" related={[{ label: "Templates", to: "/customer/qbr/templates" }]} /> },
  { path: "/customer/qbr/templates", element: <OpsRoute permission="customer.qbr.read" title="QBR Templates" description="HTML/CSS deck templates by customer segment." endpoint="/qbr/templates" /> },
  { path: "/customer/qbr/:tenantId", element: <OpsRoute permission="customer.qbr.read" title="Tenant QBR" description="Generated QBR decks and export status for one tenant." endpoint="/qbr/:tenantId" /> },
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
  { path: "/trust/compliance/dsar", element: <OpsRoute permission="trust.compliance.dsar.read" title="DSAR Queue" description="GDPR data subject request workflow and SLA countdown." endpoint="/compliance/dsar" /> },
  { path: "/trust/compliance/dsar/:id", element: <OpsRoute permission="trust.compliance.dsar.read" title="DSAR Detail" description="DSAR transition history and export delivery status." endpoint="/compliance/dsar" /> },
  { path: "/trust/compliance/legal-hold", element: <OpsRoute permission="trust.compliance.legal-hold.read" title="Legal Holds" description="Active holds that block tenant data deletion and erasure completion." endpoint="/compliance/legal-hold" /> },
  { path: "/trust/compliance/legal-hold/:id", element: <OpsRoute permission="trust.compliance.legal-hold.read" title="Legal Hold Detail" description="Hold scope and affected data." endpoint="/compliance/legal-hold" /> },
  { path: "/trust/compliance/exports", element: <OpsRoute permission="trust.compliance.dsar.read" title="Compliance Exports" description="Bulk export jobs and signed delivery links." endpoint="/audit/entries?action=compliance" /> },
  { path: "/trust/compliance/dpa", element: <OpsRoute permission="trust.compliance.dsar.read" title="DPA Tracking" description="Data processing agreement tracking surface." endpoint="/compliance/dsar" /> },
  { path: "/trust/compliance/subpoenas", element: <OpsRoute permission="trust.compliance.dsar.read" title="Subpoenas" description="Subpoena response queue and audit trail." endpoint="/compliance/dsar" /> },
  { path: "/trust/safety", element: <Navigate to="/trust/safety/fraud" replace /> },
  { path: "/trust/safety/fraud", element: <OpsRoute permission="trust.safety.read" title="Fraud Queue" description="Manual, Stripe Radar and velocity fraud signals." endpoint="/safety/fraud" /> },
  { path: "/trust/safety/aup", element: <OpsRoute permission="trust.safety.read" title="AUP Violations" description="Acceptable use policy review queue." endpoint="/safety/aup" /> },
  { path: "/trust/safety/suspensions", element: <OpsRoute permission="trust.safety.read" title="Suspensions" description="Suspended tenants and enforcement state." endpoint="/safety/suspensions" /> },
  { path: "/trust/safety/appeals", element: <OpsRoute permission="trust.safety.read" title="Appeals" description="Tenant suspension appeals and resolution status." endpoint="/safety/appeals" /> },
  { path: "/trust/safety/rules", element: <OpsRoute permission="trust.safety.read" title="Safety Rules" description="Phase 4 placeholder for automated trust and safety rules." endpoint="/safety/rules" /> },
  { path: "/trust/secrets", element: <OpsRoute permission="trust.secrets.read" title="Secret Management" description="Doppler metadata inventory, expiry tracking and access audit." endpoint="/secrets" related={[{ label: "Expiring", to: "/trust/secrets/expiring" }, { label: "Audit", to: "/trust/secrets/audit" }]} /> },
  { path: "/trust/secrets/expiring", element: <OpsRoute permission="trust.secrets.read" title="Expiring Secrets" description="Credentials expiring within 30 days." endpoint="/secrets/expiring" /> },
  { path: "/trust/secrets/audit", element: <OpsRoute permission="trust.secrets.read" title="Secret Access Audit" description="Metadata-only secret access audit log." endpoint="/secrets/audit" /> },
  { path: "/trust/security", element: <Navigate to="/trust/security/anomalies" replace /> },
  { path: "/trust/security/anomalies", element: <OpsRoute permission="trust.security.read" title="Security Anomalies" description="Anomaly detection queue built on platform audit and login telemetry." endpoint="/security/anomalies" /> },
  { path: "/trust/security/logins", element: <OpsRoute permission="trust.security.read" title="Login Monitoring" description="Staff login successes, failures and lockout signals." endpoint="/security/logins" /> },
  { path: "/trust/security/ip-blocks", element: <OpsRoute permission="trust.security.read" title="IP Blocks" description="Blocked IP addresses from security monitoring." endpoint="/security/ip-blocks" /> },
  { path: "/trust/security/sessions", element: <OpsRoute permission="trust.security.read" title="Staff Sessions" description="Active staff sessions with revocation support." endpoint="/security/sessions" /> },
  { path: "/trust/kyc", element: <Navigate to="/trust/kyc/pending" replace /> },
  { path: "/trust/kyc/pending", element: <OpsRoute permission="trust.kyc.read" title="KYC Queue" description="Persona verification reviews and decision workflow." endpoint="/kyc/pending" /> },
  { path: "/trust/kyc/:id", element: <OpsRoute permission="trust.kyc.read" title="KYC Detail" description="Verification detail and review decision context." endpoint="/kyc/pending" /> },
  { path: "/trust/kyc/sanctions", element: <OpsRoute permission="trust.kyc.read" title="Sanctions Screening" description="ComplyAdvantage screening results and review queue." endpoint="/kyc/sanctions" /> },
  { path: "/trust/kyc/pep", element: <OpsRoute permission="trust.kyc.read" title="PEP Screening" description="Politically exposed person matches requiring senior approval." endpoint="/kyc/pep" /> },
  { path: "/gtm", element: <GtmOverview /> },
  { path: "/gtm/pipeline", element: <OpsRoute permission="gtm.pipeline.read" title="Sales Pipeline" description="HubSpot deal sync with Fauward tenant linking." endpoint="/pipeline" related={[{ label: "Forecasting", to: "/gtm/pipeline/forecasting" }]} /> },
  { path: "/gtm/pipeline/forecasting", element: <OpsRoute permission="gtm.pipeline.read" title="Forecasting" description="Quarterly forecast from synced HubSpot deal amount and probability." endpoint="/pipeline/forecasting" /> },
  { path: "/gtm/pipeline/:dealId", element: <OpsRoute permission="gtm.pipeline.read" title="Deal Detail" description="Deal detail and linked tenant context." endpoint="/pipeline/:dealId" /> },
  { path: "/gtm/trials", element: <OpsRoute permission="gtm.trials.read" title="Trial Management" description="Trial activation scoring and intervention queues." endpoint="/trials" related={[{ label: "Expiring", to: "/gtm/trials/expiring" }, { label: "Extensions", to: "/gtm/trials/extensions" }]} /> },
  { path: "/gtm/trials/expiring", element: <OpsRoute permission="gtm.trials.read" title="Expiring Trials" description="Trials expiring in the next seven days." endpoint="/trials/expiring" /> },
  { path: "/gtm/trials/extensions", element: <OpsRoute permission="gtm.trials.read" title="Trial Extensions" description="Extension requests and approval thresholds." endpoint="/trials/extensions" /> },
  { path: "/gtm/trials/:tenantId", element: <OpsRoute permission="gtm.trials.read" title="Trial Detail" description="Activation score and tenant-level intervention context." endpoint="/trials/:tenantId" /> },
  { path: "/gtm/demos", element: <OpsRoute permission="gtm.demos.read" title="Demo Environments" description="Demo tenant inventory and expiry lifecycle." endpoint="/demos" related={[{ label: "Templates", to: "/gtm/demos/templates" }]} /> },
  { path: "/gtm/demos/create", element: <OpsRoute permission="gtm.demos.write" title="Create Demo" description="Provision templated demo tenants for sales." endpoint="/demos/templates" primaryAction="Create demo" /> },
  { path: "/gtm/demos/templates", element: <OpsRoute permission="gtm.demos.read" title="Demo Templates" description="Template catalogue for demo tenant seeding." endpoint="/demos/templates" /> },
  { path: "/gtm/demos/:id", element: <OpsRoute permission="gtm.demos.read" title="Demo Detail" description="Demo refresh, sharing and destruction state." endpoint="/demos" /> },
  { path: "/gtm/handoff/won", element: <OpsRoute permission="gtm.handoff.read" title="Won Deals" description="Deals awaiting structured sales-to-CS handoff." endpoint="/handoff/won" /> },
  { path: "/gtm/handoff", element: <Navigate to="/gtm/handoff/won" replace /> },
  { path: "/gtm/handoff/onboarding-queue", element: <OpsRoute permission="gtm.handoff.read" title="Onboarding Queue" description="Handed-off accounts waiting for CSM acceptance." endpoint="/handoff/onboarding-queue" /> },
  { path: "/gtm/handoff/templates", element: <OpsRoute permission="gtm.handoff.read" title="Handoff Templates" description="Structured handoff document templates." endpoint="/handoff/templates" /> },
  { path: "/gtm/attribution", element: <OpsRoute permission="gtm.attribution.read" title="Marketing Attribution" description="PostHog-based multi-touch source and campaign attribution." endpoint="/attribution" related={[{ label: "Campaigns", to: "/gtm/attribution/campaigns" }, { label: "Funnel", to: "/gtm/attribution/funnel" }, { label: "Landing Pages", to: "/gtm/attribution/landing-pages" }]} /> },
  { path: "/gtm/attribution/campaigns", element: <OpsRoute permission="gtm.attribution.read" title="Campaign Performance" description="Campaign-level source and revenue attribution." endpoint="/attribution/campaigns" /> },
  { path: "/gtm/attribution/funnel", element: <OpsRoute permission="gtm.attribution.read" title="Attribution Funnel" description="Visit to signup to activation to paid conversion." endpoint="/attribution/funnel" /> },
  { path: "/gtm/attribution/landing-pages", element: <OpsRoute permission="gtm.attribution.read" title="Landing Pages" description="Landing page attribution and conversion performance." endpoint="/attribution/landing-pages" /> },
  { path: "/gtm/pricing/experiments", element: <OpsRoute permission="gtm.pricing.read" title="Pricing Experiments" description="Statsig/LaunchDarkly pricing tests with revenue impact." endpoint="/pricing/experiments" related={[{ label: "Plans", to: "/gtm/pricing/plans" }]} /> },
  { path: "/gtm/pricing", element: <Navigate to="/gtm/pricing/experiments" replace /> },
  { path: "/gtm/pricing/experiments/:id", element: <OpsRoute permission="gtm.pricing.read" title="Pricing Experiment Detail" description="Variant conversion, ARPU and revenue lift detail." endpoint="/pricing/experiments" /> },
  { path: "/gtm/pricing/plans", element: <OpsRoute permission="gtm.pricing.read" title="Plan Editor" description="Plan, price, feature and limit catalogue." endpoint="/pricing/plans" /> },
  { path: "/gtm/contracts/quotes", element: <OpsRoute permission="gtm.contracts.read" title="Quote Builder" description="CPQ quotes, discount approvals and DocuSign handoff." endpoint="/contracts/quotes" related={[{ label: "Discounts", to: "/gtm/contracts/discounts" }, { label: "MSAs", to: "/gtm/contracts/msas" }]} /> },
  { path: "/gtm/contracts", element: <Navigate to="/gtm/contracts/quotes" replace /> },
  { path: "/gtm/contracts/quotes/:id", element: <OpsRoute permission="gtm.contracts.read" title="Quote Detail" description="Quote approval and signature state." endpoint="/contracts/quotes/:id" /> },
  { path: "/gtm/contracts/discounts", element: <OpsRoute permission="gtm.contracts.read" title="Discount Approvals" description="Quotes waiting for manager or CFO discount approval." endpoint="/contracts/discounts" /> },
  { path: "/gtm/contracts/msas", element: <OpsRoute permission="gtm.contracts.read" title="MSA Repository" description="Signed master service agreements and renewal metadata." endpoint="/contracts/msas" /> },
  { path: "/gtm/partners", element: <OpsRoute permission="gtm.partners.read" title="Partner Directory" description="Referral, reseller and technology partner management." endpoint="/partners" related={[{ label: "Applications", to: "/gtm/partners/applications" }, { label: "Deal Registration", to: "/gtm/partners/deal-registration" }]} /> },
  { path: "/gtm/partners/applications", element: <OpsRoute permission="gtm.partners.read" title="Partner Applications" description="Partner application review and onboarding queue." endpoint="/partners/applications" /> },
  { path: "/gtm/partners/deal-registration", element: <OpsRoute permission="gtm.partners.read" title="Deal Registration" description="Partner registered deals and 90-day lead locks." endpoint="/partners/deal-registration" /> },
  { path: "/gtm/partners/:id", element: <OpsRoute permission="gtm.partners.read" title="Partner Detail" description="Partner deals, applications and commission context." endpoint="/partners" /> },
];
