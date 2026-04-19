import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/layouts/AppShell";
import { PublicLayout } from "@/layouts/PublicLayout";
import {
  AnalyticsPage,
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
          <Route path="/analytics" element={<AnalyticsPage />} />
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
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/operations/live-map" element={<LiveMapPage />} />
          <Route path="/fleet" element={<FleetPage />} />
          <Route path="/pricing" element={<PricingOverviewPage />} />
          <Route path="/pricing/zones" element={<ZonesPage />} />
          <Route path="/pricing/rate-cards" element={<RateCardsPage />} />
          <Route path="/pricing/service-tiers" element={<ServiceTiersPage />} />
          <Route path="/pricing/surcharges" element={<SurchargesPage />} />
          <Route path="/pricing/insurance" element={<InsurancePage />} />
          <Route path="/pricing/weight-tiers" element={<WeightTiersPage />} />
          <Route path="/pricing/rules" element={<PricingRulesPage />} />
          <Route path="/pricing/promo-codes" element={<PromoCodesPage />} />
          <Route path="/pricing/tax" element={<TaxPage />} />
          <Route path="/pricing/currencies" element={<CurrencyRatesPage />} />
          <Route path="/pricing/settings" element={<PricingSettingsPage />} />
          <Route path="/pricing/calculator" element={<PricingCalculatorPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
