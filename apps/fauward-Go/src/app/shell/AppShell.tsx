import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BrandLogo } from "@/components/common/BrandLogo";
import { SyncBanner } from "@/components/sync/SyncBanner";
import { useAuthStore } from "@/store/useAuthStore";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { useSyncStore } from "@/store/useSyncStore";
import { formatRoleLabel } from "@/lib/utils/labels";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/jobs", label: "Jobs" },
  { to: "/settings", label: "Settings" },
];

export const AppShell = () => {
  const user = useAuthStore((state) => state.user);
  const syncPendingMutations = useFieldDataStore((state) => state.syncPendingMutations);
  const hasPendingMutations = useFieldDataStore((state) =>
    state.pendingMutations.some((m) => m.state === "pending"),
  );
  const isOnline = useSyncStore((state) => state.isOnline);
  const isSyncing = useSyncStore((state) => state.isSyncing);

  useEffect(() => {
    if (!hasPendingMutations || !isOnline || isSyncing) return;
    void syncPendingMutations();
  }, [hasPendingMutations, isOnline, isSyncing, syncPendingMutations]);

  const subtitleParts = [user?.tenantLabel, formatRoleLabel(user?.role)].filter(
    (part) => Boolean(part) && part !== "Assigned tenant"
  );

  return (
    <div className="flex h-screen justify-center overflow-hidden bg-stone-50">
      <div className="flex h-full w-full max-w-md flex-col px-3 pt-4 pb-4">
        <header className="panel shrink-0 overflow-hidden p-4">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/80 to-transparent" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <BrandLogo compact />
              {subtitleParts.length > 0 ? (
                <p className="mt-2 text-sm text-stone-600">{subtitleParts.join(" · ")}</p>
              ) : null}
            </div>
          </div>
        </header>

        <SyncBanner />

        <main className="flex-1 overflow-y-auto px-1 py-5">
          <Outlet />
        </main>

        <nav className="shrink-0 pt-3">
          <div className="panel grid grid-cols-3 gap-1 p-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `rounded-2xl px-2 py-3 text-center text-[0.68rem] font-semibold uppercase tracking-[0.18em] transition ${
                    isActive ? "bg-brand text-white" : "text-stone-500 hover:bg-stone-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
};
