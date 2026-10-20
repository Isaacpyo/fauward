import { useNavigate } from "react-router-dom";

import { TenantPicker } from "@/components/service-kit/TenantPicker";

export function Customer360IndexPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-xl space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Customer 360</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Pick a tenant to open its unified view.</p>
      </header>
      <TenantPicker onSelect={(tenant) => navigate(`/customer/360/${tenant.id}`)} />
    </div>
  );
}
