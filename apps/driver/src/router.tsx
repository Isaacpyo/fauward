import { Menu } from "lucide-react";
import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { BottomTabBar } from "@/components/driver/BottomTabBar";
import { OfflineBanner } from "@/components/driver/OfflineBanner";
import { SyncIndicator } from "@/components/driver/SyncIndicator";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { CapturePODPage } from "@/pages/CapturePODPage";
import { FailedDeliveryPage } from "@/pages/FailedDeliveryPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { LoginPage } from "@/pages/LoginPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RoutePage } from "@/pages/RoutePage";
import { ShipmentDetailPage } from "@/pages/ShipmentDetailPage";
import { StopDetailPage } from "@/pages/StopDetailPage";
import { useDriverStore } from "@/stores/useDriverStore";

function ProtectedRoute() {
  const location = useLocation();
  const isAuthenticated = useDriverStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

function DriverShell() {
  const tenant = useDriverStore((state) => state.tenant);
  const online = useOnlineStatus();

  return (
    <div className="min-h-screen pb-20">
      {!online ? <OfflineBanner /> : null}
      <header className="sticky top-0 z-30 border-b border-[var(--border-color)] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-white p-2 lg:hidden">
              <Menu size={18} />
            </button>
            <Link to="/route" className="inline-flex items-center gap-2">
              {tenant.logoUrl ? <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="h-8 w-auto object-contain" /> : null}
              <span className="text-sm font-semibold text-[var(--tenant-primary)]">{tenant.name}</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <SyncIndicator />
            <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-500" : "bg-amber-500"}`} />
          </div>
        </div>
      </header>
      <main className="px-4 py-4">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}

export function DriverRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<DriverShell />}>
          <Route path="/" element={<Navigate to="/route" replace />} />
          <Route path="/route" element={<RoutePage />} />
          <Route path="/route/stop/:id" element={<StopDetailPage />} />
          <Route path="/route/stop/:stopId/shipment/:id" element={<ShipmentDetailPage />} />
          <Route path="/route/stop/:stopId/pod" element={<CapturePODPage />} />
          <Route path="/route/stop/:stopId/failed" element={<FailedDeliveryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/route" replace />} />
    </Routes>
  );
}

