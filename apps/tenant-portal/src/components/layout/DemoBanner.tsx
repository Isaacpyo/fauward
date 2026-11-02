import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useTenantStore } from "@/stores/useTenantStore";

// gtm.demos (WP-4.15): "Demo environment — expires …" on every page of a demo workspace; a share-link session is
// also told it is read-only.

type DemoStatus = { demo: false } | { demo: true; status: string; expiresAt: string; template: string; readOnly: boolean };

export function DemoBanner() {
  const tenant = useTenantStore((state) => state.tenant);
  const isDemoTenant = tenant?.status === "DEMO";
  const status = useQuery({
    queryKey: ["tenant", "me", "demo"],
    queryFn: async () => (await api.get<DemoStatus>("/v1/tenants/me/demo")).data,
    enabled: isDemoTenant,
    retry: false
  });
  const data = status.data;
  if (!isDemoTenant || !data || !data.demo) return null;
  const expires = new Date(data.expiresAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div role="status" data-testid="demo-banner" className="border-b border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-900">
      Demo environment ({data.template}) — {data.status === "ACTIVE" ? `expires ${expires}` : "this demo has ended"}.
      {data.readOnly ? " You are viewing a read-only demo link; changes are switched off." : ""}
    </div>
  );
}
