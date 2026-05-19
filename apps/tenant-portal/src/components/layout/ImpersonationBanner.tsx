import { api } from "@/lib/api";
import { clearTokens } from "@/lib/auth";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

export function ImpersonationBanner() {
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const tenant = useTenantStore((state) => state.tenant);

  const isImpersonating = user?.mode === "IMPERSONATION" || user?.impersonated === true;
  if (!isImpersonating) return null;

  const exit = async () => {
    const res = await api.post<{ redirectUrl?: string }>("/v1/tenants/me/impersonation/exit");
    clearTokens();
    setUser(null);
    window.location.href = res.data.redirectUrl ?? "https://admin.fauward.com/platform/tenants";
  };

  return (
    <div className="sticky top-0 z-[2000] flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <span>
        Viewing as <strong>{tenant?.name}</strong> ({tenant?.slug ?? tenant?.domain}) by{" "}
        <strong>{user?.impersonatorEmail ?? "Fauward"}</strong>
      </span>
      <button
        onClick={exit}
        className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold transition-colors hover:bg-white/30"
      >
        Exit
      </button>
    </div>
  );
}
