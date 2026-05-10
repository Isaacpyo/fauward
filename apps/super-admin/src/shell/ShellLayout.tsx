import { Outlet, useOutletContext } from "react-router-dom";

import type { PlatformSessionUser } from "@/lib/platform-session";
import { PillarSidebar } from "@/shell/PillarSidebar";
import { TopBar } from "@/shell/TopBar";

export type ShellRouteContext = {
  user: PlatformSessionUser;
};

export function ShellLayout() {
  const { user } = useOutletContext<ShellRouteContext>();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface-50)] text-[var(--color-text-primary)]">
      <TopBar user={user} />
      <div className="flex min-h-0 flex-1">
        <PillarSidebar />
        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
