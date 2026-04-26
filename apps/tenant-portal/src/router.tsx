import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import type { ReactElement } from "react";

import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/layouts/AppShell";
import { PublicLayout } from "@/layouts/PublicLayout";
import {
  CrmDetailPage,
  CrmPage,
  DashboardPage,
  FinanceDetailPage,
  FinancePage,
  LoginPage,
  NotFoundPage,
  PublicBookingPage,
  RegisterPage,
  RoutesPage,
  SettingsPage,
  TeamPage as LegacyTeamPage
} from "@/pages/AppPages";
import { Skeleton } from "@/components/ui/Skeleton";
import { ShipmentsListPage } from "@/pages/shipments/ShipmentsListPage";
import { ShipmentDetailPage } from "@/pages/shipments/ShipmentDetailPage";
import { CreateShipmentPage } from "@/pages/shipments/CreateShipmentPage";
import { TrackingLookupPage } from "@/pages/tracking/TrackingLookupPage";
import { TrackingResultPage } from "@/pages/tracking/TrackingResultPage";
import { OnboardingPage } from "@/pages/onboarding/OnboardingPage";
import { useTenantStore } from "@/stores/useTenantStore";
import { TeamPage } from "@/pages/team/TeamPage";
import { ReturnsListPage } from "@/pages/returns/ReturnsListPage";
import { ReturnDetailPage } from "@/pages/returns/ReturnDetailPage";
import { TicketsListPage } from "@/pages/support/TicketsListPage";
import { TicketDetailPage } from "@/pages/support/TicketDetailPage";
import { ActivityTimelinePage } from "@/pages/activity/ActivityTimelinePage";
import { AnalyticsPage } from "@/pages/analytics/AnalyticsPage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { LiveMapPage } from "@/pages/operations/LiveMapPage";
import { FleetPage } from "@/pages/fleet/FleetPage";
import { PricingOverviewPage } from "@/pages/pricing/PricingOverviewPage";
import { ZonesPage } from "@/pages/pricing/ZonesPage";
import { RateCardsPage } from "@/pages/pricing/RateCardsPage";
import { ServiceTiersPage } from "@/pages/pricing/ServiceTiersPage";
import { SurchargesPage } from "@/pages/pricing/SurchargesPage";
import { InsurancePage } from "@/pages/pricing/InsurancePage";
import { WeightTiersPage } from "@/pages/pricing/WeightTiersPage";
import { PricingRulesPage } from "@/pages/pricing/PricingRulesPage";
import { PromoCodesPage } from "@/pages/pricing/PromoCodesPage";
import { TaxPage } from "@/pages/pricing/TaxPage";
import { CurrencyRatesPage } from "@/pages/pricing/CurrencyRatesPage";
import { PricingSettingsPage } from "@/pages/pricing/PricingSettingsPage";
import { PricingCalculatorPage } from "@/pages/pricing/PricingCalculatorPage";
import { DispatchPage } from "@/pages/dispatch/DispatchPage";
import { FauwardGoPage } from "@/pages/operations/FauwardGoPage";
import { MessagingPage } from "@/pages/messaging/MessagingPage";
import { AgentPage } from "@/pages/agent/AgentPage";
import { AuditLogPage } from "@/features/admin/audit/AuditLogPage";
import { Button } from "@/components/ui/Button";
import { formatPlanLabel, getFeatureMinimumPlan, hasFeatureAccess, type FeatureKey } from "@/lib/plan-features";
import { useAppStore } from "@/stores/useAppStore";

function AuthGuard() {
  const location = useLocation();
  const { isLoading, user } = useAuth();
  const tenant = useTenantStore((state) => state.tenant);

  if (isLoading && !user) {
    return (
      <div className="p-6">
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (tenant?.onboarding_complete === false && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

function GuestGuard() {
  const { user } = useAuth();
  if (user) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function PlanFeatureRoute({ feature, children }: { feature: FeatureKey; children: ReactElement }) {
  const user = useAppStore((state) => state.user);
  const minimumPlan = getFeatureMinimumPlan(feature);

  if (!hasFeatureAccess(user?.plan, feature)) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-6 py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
            {formatPlanLabel(minimumPlan)} feature
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-amber-950">Upgrade required</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
            This workspace is currently on the {formatPlanLabel(user?.plan ?? "starter")} plan. Upgrade to{" "}
            {formatPlanLabel(minimumPlan)} or higher to use this feature.
          </p>
          <Button asChild className="mt-5">
            <Link to="/settings?tab=billing">Upgrade plan</Link>
          </Button>
        </div>
      </div>
    );
  }

  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<GuestGuard />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<PublicLayout />}>
        <Route path="/track" element={<TrackingLookupPage />} />
        <Route path="/track/:number" element={<TrackingResultPage />} />
        <Route path="/book" element={<PublicBookingPage />} />
      </Route>

      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/shipments" element={<ShipmentsListPage />} />
          <Route path="/fauward-go" element={<FauwardGoPage />} />
          <Route path="/shipments/:id" element={<ShipmentDetailPage />} />
          <Route path="/shipments/create" element={<CreateShipmentPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/dispatch" element={<DispatchPage />} />
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/crm/:id" element={<CrmDetailPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/finance/:id" element={<FinanceDetailPage />} />
          <Route path="/analytics" element={<PlanFeatureRoute feature="analytics"><AnalyticsPage /></PlanFeatureRoute>} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team-legacy" element={<LegacyTeamPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<Navigate to="/settings?tab=profile" replace />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/returns" element={<ReturnsListPage />} />
          <Route path="/returns/:id" element={<ReturnDetailPage />} />
          <Route path="/support" element={<TicketsListPage />} />
          <Route path="/support/:id" element={<TicketDetailPage />} />
          <Route path="/activity" element={<ActivityTimelinePage />} />
          <Route path="/audit" element={<PlanFeatureRoute feature="auditLogs"><AuditLogPage /></PlanFeatureRoute>} />
          <Route path="/messaging" element={<PlanFeatureRoute feature="messaging"><MessagingPage /></PlanFeatureRoute>} />
          <Route path="/agent" element={<PlanFeatureRoute feature="agent"><AgentPage /></PlanFeatureRoute>} />
          <Route path="/reports" element={<PlanFeatureRoute feature="reports"><ReportsPage /></PlanFeatureRoute>} />
          <Route path="/operations/live-map" element={<LiveMapPage />} />
          <Route path="/fleet" element={<PlanFeatureRoute feature="fleet"><FleetPage /></PlanFeatureRoute>} />
          <Route path="/pricing" element={<PricingOverviewPage />} />
          <Route path="/pricing/zones" element={<ZonesPage />} />
          <Route path="/pricing/rate-cards" element={<RateCardsPage />} />
          <Route path="/pricing/service-tiers" element={<ServiceTiersPage />} />
          <Route path="/pricing/surcharges" element={<SurchargesPage />} />
          <Route path="/pricing/insurance" element={<InsurancePage />} />
          <Route path="/pricing/weight-tiers" element={<WeightTiersPage />} />
          <Route path="/pricing/rules" element={<PlanFeatureRoute feature="automation"><PricingRulesPage /></PlanFeatureRoute>} />
          <Route path="/pricing/promo-codes" element={<PlanFeatureRoute feature="advancedPricing"><PromoCodesPage /></PlanFeatureRoute>} />
          <Route path="/pricing/tax" element={<TaxPage />} />
          <Route path="/pricing/currencies" element={<PlanFeatureRoute feature="advancedPricing"><CurrencyRatesPage /></PlanFeatureRoute>} />
          <Route path="/pricing/settings" element={<PlanFeatureRoute feature="advancedPricing"><PricingSettingsPage /></PlanFeatureRoute>} />
          <Route path="/pricing/calculator" element={<PricingCalculatorPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
