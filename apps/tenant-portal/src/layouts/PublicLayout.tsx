import { Outlet } from "react-router-dom";

import { useTenantStore } from "@/stores/useTenantStore";

export function PublicLayout() {
  const tenant = useTenantStore((state) => state.tenant);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-center px-4 sm:px-6">
          <div className="flex items-center gap-2">
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="h-9 w-auto object-contain" />
            ) : (
              <div className="rounded-md bg-[var(--tenant-primary)] px-3 py-1 text-sm font-semibold text-white">F</div>
            )}
            <p className="text-sm font-semibold text-gray-900">{tenant?.name ?? "Tenant Portal"}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
