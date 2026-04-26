import { RelayMessagingTab } from "@fauward/relay-ui";

import { PageShell } from "@/layouts/PageShell";
import { hasDevTestSession } from "@/lib/auth";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

export function MessagingPage() {
  const tenant = useTenantStore((state) => state.tenant);
  const user = useAppStore((state) => state.user);
  const relayTenantId = hasDevTestSession() ? "tenant_dev" : tenant?.tenant_id;

  return (
    <PageShell title="Messaging">
      <RelayMessagingTab mode="tenant" tenantId={relayTenantId} tenantName={tenant?.name} tenantEmail={user?.email} />
    </PageShell>
  );
}
