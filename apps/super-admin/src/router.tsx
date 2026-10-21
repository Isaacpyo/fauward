import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { LoginPage } from "@/auth/LoginPage";
import { SuperAdminGuard } from "@/auth/SuperAdminGuard";
import { ServiceChrome } from "@/components/service-kit/ServiceChrome";
import { ComingSoonRoute, consoleRoutes } from "@/console-routes";
import { StatusPage } from "@/pages/StatusPage";
import { ShellLayout } from "@/shell/ShellLayout";

/**
 * Bookmarks into the deleted legacy admin console (WP-1.6) land on the service that replaced each page
 * (e2e/legacy-redirects.spec.ts). Relay and its feedback (the old support audit) live under the support desk since WP-4.R.
 */
export const LEGACY_ADMIN_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: "/admin", to: "/" },
  { from: "/admin/tenants", to: "/platform/tenants" },
  { from: "/admin/regions", to: "/platform/tenants/region-requests" },
  { from: "/admin/revenue", to: "/revenue/analytics" },
  { from: "/admin/system", to: "/platform/health" },
  { from: "/admin/queues", to: "/platform/queues" },
  { from: "/admin/relay", to: "/customer/support/relay" },
  { from: "/admin/support-audit", to: "/customer/support/relay/feedback" },
  { from: "/admin/logs", to: "/trust/audit" },
  { from: "/admin/impersonation", to: "/platform/impersonation" }
];

function NavigateToPlatformTenant() {
  const { id } = useParams();
  return <Navigate to={`/platform/tenants/${encodeURIComponent(id ?? "")}`} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SuperAdminGuard />}>
        <Route element={<ShellLayout />}>
          {consoleRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={<ServiceChrome path={route.path} comingSoon={route.element.type === ComingSoonRoute}>{route.element}</ServiceChrome>} />
          ))}
        </Route>
        {LEGACY_ADMIN_REDIRECTS.map((redirect) => (
          <Route key={redirect.from} path={redirect.from} element={<Navigate to={redirect.to} replace />} />
        ))}
        <Route path="/admin/tenants/:id" element={<NavigateToPlatformTenant />} />
        <Route path="/admin/*" element={<Navigate to="/" replace />} />
        <Route path="/status" element={<StatusPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
