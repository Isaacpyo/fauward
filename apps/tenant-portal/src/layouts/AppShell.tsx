import { X } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";

import { FailedPaymentBanner } from "@/components/billing/FailedPaymentBanner";
import { LimitReachedBanner } from "@/components/billing/LimitReachedBanner";
import { SaveOfferBanner } from "@/components/billing/SaveOfferBanner";
import { SuspendedOverlay } from "@/components/billing/SuspendedOverlay";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { UsageWarningBanner } from "@/components/billing/UsageWarningBanner";
import { AnnouncementBanner } from "@/components/layout/AnnouncementBanner";
import { ImpersonationBanner } from "@/components/layout/ImpersonationBanner";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { ToastStack } from "@/components/shared/ToastStack";
import { useBilling } from "@/hooks/useBilling";
import { MobileNav } from "@/layouts/MobileNav";
import { Sidebar } from "@/layouts/Sidebar";
import { TopBar } from "@/layouts/TopBar";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

export function AppShell() {
  const location = useLocation();
  const mobileSidebarOpen = useAppStore((state) => state.mobileSidebarOpen);
  const setMobileSidebarOpen = useAppStore((state) => state.setMobileSidebarOpen);
  const tenant = useTenantStore((state) => state.tenant);
  const { summary } = useBilling();

  const suspended = summary.paymentStatus === "suspended" || tenant?.status === "SUSPENDED";
  const onBillingSettings = location.pathname.startsWith("/settings") && location.search.includes("tab=billing");
  const showSuspendedOverlay = suspended && !onBillingSettings;

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      <Sidebar />

      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/40" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative h-full w-[86vw] max-w-xs bg-white">
            <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
              <p className="text-sm font-semibold text-gray-900">{tenant?.name ?? "Tenant"}</p>
              <button className="rounded-md p-2 hover:bg-gray-100" onClick={() => setMobileSidebarOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="h-[calc(100%-64px)] overflow-y-auto">
              <Sidebar mobile />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TrialBanner days={summary.trialDaysRemaining ?? 0} />
        <UsageWarningBanner used={summary.usage.shipments.used} limit={summary.usage.shipments.limit} />
        <LimitReachedBanner used={summary.usage.shipments.used} limit={summary.usage.shipments.limit} />
        <FailedPaymentBanner visible={summary.paymentStatus === "failed"} nextRetryAt={summary.nextRetryAt} />
        <SaveOfferBanner offer={summary.saveOffer} />
        <ImpersonationBanner />
        <AnnouncementBanner />

        <TopBar />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav />
      <CommandPalette />
      <ToastStack />
      <SuspendedOverlay active={showSuspendedOverlay} reason={tenant?.suspensionReason} />
    </div>
  );
}
