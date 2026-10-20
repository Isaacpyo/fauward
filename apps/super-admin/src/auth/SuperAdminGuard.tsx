import { useMemo } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PermissionProvider } from "@fauward/internal-rbac";

import { ConsoleErrorScreen } from "@/components/service-kit/ConsoleErrorScreen";
import { hasPlatformSessionHint } from "@/lib/auth";
import { toConsoleApiError } from "@/lib/console-api-error";
import { permissionContextFromMe, type PlatformSessionUser } from "@/lib/platform-session";
import { useMe } from "@/lib/use-me";
import { MfaStepUpModal } from "./MfaStepUpModal";

function loginPath(pathname: string, search: string) {
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
}

/** Mounts the MFA step-up modal once for every console layout.
 * 401 → login · MFA pending → login MFA step · anything else → error screen with Retry (never "denied"). */
export function SuperAdminGuard() {
  const location = useLocation();
  const hasSession = hasPlatformSessionHint();
  const me = useMe(hasSession);
  // Re-derived on every /auth/me refetch (focus, 60 s, after IAM/JIT mutations) so grants and expiries show up live.
  const permissionContext = useMemo(() => (me.data ? permissionContextFromMe(me.data) : null), [me.data]);

  if (!hasSession) return <Navigate to={loginPath(location.pathname, location.search)} replace />;

  if (me.error) {
    const error = toConsoleApiError(me.error);
    if (error.status === 401) return <Navigate to={loginPath(location.pathname, location.search)} replace />;
    if (!me.data) return <ConsoleErrorScreen error={error} onRetry={() => void me.refetch()} />;
  }

  if (!me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-[var(--color-surface-50)]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-[var(--fauward-navy)]" />
        <p className="text-sm text-[var(--color-text-muted)]">Verifying session…</p>
      </div>
    );
  }

  if (me.data.mfa.pending) return <Navigate to={loginPath(location.pathname, location.search)} replace />;

  const user: PlatformSessionUser = {
    id: me.data.user.id,
    email: me.data.user.email,
    name: me.data.user.name,
    role: me.data.user.role,
    permissions: me.data.permissions
  };

  return (
    <PermissionProvider roles={permissionContext?.roles ?? []} permissions={permissionContext?.permissions ?? []}>
      <Outlet context={{ user }} />
      <MfaStepUpModal />
    </PermissionProvider>
  );
}
