import { useState } from "react";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker } from "@/components/service-kit/TenantPicker";
import { type DeliveryLogFilters, type DeliveryStatus, useDeliveryLog } from "./api";

const STATUSES: DeliveryStatus[] = ["SENT", "SKIPPED", "FAILED", "QUOTA_EXCEEDED", "QUEUED"];

const statusTone: Record<DeliveryStatus, string> = {
  SENT: "border-green-200 bg-green-50 text-green-700",
  SKIPPED: "border-[var(--color-border)] bg-[var(--color-surface-50)] text-[var(--color-text-muted)]",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  QUOTA_EXCEEDED: "border-amber-200 bg-amber-50 text-amber-800",
  QUEUED: "border-blue-200 bg-blue-50 text-blue-700"
};

const field = "rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm";

/** Notification delivery log (customer.comms, WP-2.2): what the notification worker actually did with each message. */
export function DeliveryLogPage() {
  const [filters, setFilters] = useState<DeliveryLogFilters>({});
  const [tenantLabel, setTenantLabel] = useState<string | null>(null);
  const [sensitiveReason, setSensitiveReason] = useState<string | null>(null);
  const [askingReason, setAskingReason] = useState(false);
  const log = useDeliveryLog(filters, sensitiveReason);
  const rows = log.data?.pages.flatMap((page) => page.logs) ?? [];
  const redacted = log.data?.pages[0]?.redacted ?? true;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Delivery log</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Every email and SMS the platform tried to send, with the transport and the outcome.</p>
        </div>
        {redacted ? (
          <button type="button" onClick={() => setAskingReason(true)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold">
            Show recipients
          </button>
        ) : (
          <button type="button" onClick={() => setSensitiveReason(null)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold">
            Hide recipients
          </button>
        )}
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-white p-3">
        <div className="w-72">
          {filters.tenantId ? (
            <p className="text-sm">
              Tenant: <span className="font-semibold">{tenantLabel}</span>{" "}
              <button
                type="button"
                className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline"
                onClick={() => {
                  setFilters(({ tenantId: _removed, ...rest }) => rest);
                  setTenantLabel(null);
                }}
              >
                Clear
              </button>
            </p>
          ) : (
            <TenantPicker
              label="Filter by tenant"
              onSelect={(tenant) => {
                setFilters((current) => ({ ...current, tenantId: tenant.id }));
                setTenantLabel(`${tenant.name} (${tenant.slug})`);
              }}
            />
          )}
        </div>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-[var(--color-text-muted)]">Status</span>
          <select aria-label="Status" className={field} value={filters.status ?? ""} onChange={(event) => setFilters((current) => ({ ...current, status: (event.target.value || undefined) as DeliveryStatus | undefined }))}>
            <option value="">All</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-[var(--color-text-muted)]">Channel</span>
          <select aria-label="Channel" className={field} value={filters.channel ?? ""} onChange={(event) => setFilters((current) => ({ ...current, channel: (event.target.value || undefined) as "EMAIL" | "SMS" | undefined }))}>
            <option value="">All</option>
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
          </select>
        </label>
      </section>

      {log.isError ? <ConsoleApiErrorPanel error={log.error} onRetry={() => void log.refetch()} title="Unable to load the delivery log" /> : null}

      {!log.isError ? (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Transport</th>
                <th className="px-3 py-2">Recipient</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="delivery-log-row">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : <span className="text-xs text-[var(--color-text-muted)]">Fauward staff</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.template ?? row.event}</td>
                  <td className="px-3 py-2 text-xs">{row.channel}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone[row.status]}`}>{row.status}</span>
                    {row.attempts > 1 ? <span className="ml-1 text-xs text-[var(--color-text-muted)]">×{row.attempts}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.provider ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.recipient ?? "—"}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs" title={row.error ?? row.providerRef ?? undefined}>
                    {row.error ?? row.providerRef ?? "—"}
                  </td>
                </tr>
              ))}
              {!log.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    {Object.keys(filters).length > 0 ? "No delivery matches these filters." : "Nothing has been sent yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {log.isLoading ? <p className="p-3 text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
          {log.hasNextPage ? (
            <div className="border-t border-[var(--color-border)] p-2 text-center">
              <button type="button" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                {log.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <ActionDialog
        open={askingReason}
        title="Show recipients"
        description="Recipients and provider references are personal data. Viewing them needs a fresh MFA check and a reason, and is recorded in the audit log."
        confirmLabel="Show recipients"
        dangerous
        onSubmit={async (reason) => {
          setSensitiveReason(reason);
        }}
        onClose={() => setAskingReason(false)}
      />
    </div>
  );
}
