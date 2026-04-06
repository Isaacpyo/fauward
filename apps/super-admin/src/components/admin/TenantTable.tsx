import { Link } from "react-router-dom";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type TenantRow = {
  id: string;
  name: string;
  domain: string;
  plan: "Starter" | "Pro" | "Enterprise";
  status: "Active" | "Suspended" | "Trial";
  shipments: number;
  staff: number;
  mrr: string;
  created: string;
};

type TenantTableProps = {
  rows: TenantRow[];
  onImpersonate: (id: string) => void;
  onSuspendToggle: (id: string) => void;
  onOverridePlan: (id: string) => void;
};

export function TenantTable({ rows, onImpersonate, onSuspendToggle, onOverridePlan }: TenantTableProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 8
  });

  const columns = ["Tenant Name", "Domain", "Plan", "Status", "Shipments", "Staff", "MRR", "Created", "Actions"];

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-white">
      <div className="grid min-w-[980px] grid-cols-[2fr,1.6fr,1fr,1fr,1fr,1fr,1fr,1fr,2.2fr] border-b border-[var(--color-border)] bg-[var(--color-surface-50)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)]">
        {columns.map((column) => (
          <div key={column}>{column}</div>
        ))}
      </div>

      <div ref={parentRef} className="max-h-[560px] overflow-auto">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", minWidth: "980px" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div
                key={row.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item.start}px)`
                }}
                className="grid grid-cols-[2fr,1.6fr,1fr,1fr,1fr,1fr,1fr,1fr,2.2fr] items-center border-b border-[var(--color-border)] px-3 py-2 text-xs"
              >
                <div className="font-medium text-[var(--color-text-primary)]">{row.name}</div>
                <div className="font-mono text-[11px] text-[var(--color-text-muted)]">{row.domain}</div>
                <div>{row.plan}</div>
                <div>{row.status}</div>
                <div>{row.shipments}</div>
                <div>{row.staff}</div>
                <div>{row.mrr}</div>
                <div className="font-mono text-[11px]">{row.created}</div>
                <div className="flex flex-wrap gap-1">
                  <Link className="rounded border border-[var(--color-border)] px-2 py-1" to={`/admin/tenants/${row.id}`}>
                    View
                  </Link>
                  <button type="button" className="rounded border border-[var(--color-border)] px-2 py-1" onClick={() => onImpersonate(row.id)}>
                    Impersonate
                  </button>
                  <button type="button" className="rounded border border-[var(--color-border)] px-2 py-1" onClick={() => onSuspendToggle(row.id)}>
                    Suspend/Unsuspend
                  </button>
                  <button type="button" className="rounded border border-[var(--color-border)] px-2 py-1" onClick={() => onOverridePlan(row.id)}>
                    Override Plan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export type { TenantRow };
