import { Outlet, useOutletContext } from "react-router-dom";

import { ActivityStreamProvider } from "@/lib/activity-stream";
import type { PlatformSessionUser } from "@/lib/platform-session";
import { useMe } from "@/lib/use-me";
import { PillarSidebar } from "@/shell/PillarSidebar";
import { TopBar } from "@/shell/TopBar";

export type ShellRouteContext = {
  user: PlatformSessionUser;
};

function formatExpiry(expiresAt: string | null) {
  if (!expiresAt) return "";
  return ` until ${new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function ShellLayout() {
  const { user } = useOutletContext<ShellRouteContext>();
  // Active JIT grants come from /auth/me (D2), the same source as the permissions themselves.
  const jit = useMe().data?.jit ?? [];

  // One live activity stream per tab (WP-3.5): feeds, badges and dashboard numbers update without a reload.
  return (
    <ActivityStreamProvider>
      <div className="flex min-h-screen flex-col bg-[var(--color-surface-50)] text-[var(--color-text-primary)]">
        <TopBar user={user} />
        {jit.length > 0 ? (
          <div data-testid="jit-banner" className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs font-medium text-amber-900">
            Elevated access active: {jit.map((grant) => `${grant.permission}${formatExpiry(grant.expiresAt)}`).join(", ")}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <PillarSidebar />
          <main className="min-w-0 flex-1 overflow-y-auto p-5">
            <Outlet />
          </main>
        </div>
      </div>
    </ActivityStreamProvider>
  );
}
