import type { ReactNode } from "react";

import type { JitRequest, JitState } from "../api";

const STATE_STYLE: Record<JitState, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-900",
  ACTIVE: "border-green-200 bg-green-50 text-green-800",
  EXPIRED: "border-[var(--color-border)] bg-neutral-50 text-[var(--color-text-muted)]",
  DENIED: "border-red-200 bg-red-50 text-red-800",
  REVOKED: "border-red-200 bg-red-50 text-red-800"
};

export function JitStateBadge({ state }: { state: JitState }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[state]}`}>{state.toLowerCase()}</span>;
}

export function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function staff(label: JitRequest["requester"]) {
  return label.name ?? label.email ?? label.id;
}

type Column = "requester" | "approvals" | "expires" | "outcome";

/** One table for every JIT list; `actions` renders the row's buttons (approve/deny/end). */
export function JitTable({ rows, columns, actions, empty, testId }: { rows: JitRequest[]; columns: Column[]; actions?: (row: JitRequest) => ReactNode; empty: string; testId: string }) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-[var(--color-text-muted)]">{empty}</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-sm" data-testid={testId}>
        <thead className="text-left text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="py-1 pr-3">Permission</th>
            {columns.includes("requester") ? <th className="py-1 pr-3">Requester</th> : null}
            <th className="py-1 pr-3">Reason</th>
            <th className="py-1 pr-3">Duration</th>
            <th className="py-1 pr-3">State</th>
            {columns.includes("approvals") ? <th className="py-1 pr-3">Approvals</th> : null}
            {columns.includes("expires") ? <th className="py-1 pr-3">Expires</th> : null}
            {columns.includes("outcome") ? <th className="py-1 pr-3">Outcome</th> : null}
            <th className="py-1 pr-3">Requested</th>
            {actions ? <th className="py-1" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <tr key={row.id} data-testid="jit-row">
              <td className="py-2 pr-3 font-mono text-xs">
                {row.permission}
                {row.rootRequest ? <span className="ml-2 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-800">ROOT</span> : null}
              </td>
              {columns.includes("requester") ? <td className="py-2 pr-3 text-xs">{staff(row.requester)}</td> : null}
              <td className="max-w-xs py-2 pr-3 text-xs">{row.reason}</td>
              <td className="py-2 pr-3 text-xs">{row.durationMinutes} min</td>
              <td className="py-2 pr-3">
                <JitStateBadge state={row.state} />
              </td>
              {columns.includes("approvals") ? (
                <td className="py-2 pr-3 text-xs">
                  {row.approvals.filter((approval) => approval.decision === "APPROVED").length} of {row.approvalsRequired}
                  {row.approvals.length > 0 ? <span className="block text-[var(--color-text-muted)]">{row.approvals.map((approval) => staff(approval.approver)).join(", ")}</span> : null}
                </td>
              ) : null}
              {columns.includes("expires") ? <td className="py-2 pr-3 text-xs">{when(row.expiresAt)}</td> : null}
              {columns.includes("outcome") ? (
                <td className="max-w-xs py-2 pr-3 text-xs" data-testid="jit-outcome">
                  {row.state === "DENIED" ? `Denied: ${row.deniedReason ?? "no reason recorded"}` : row.state === "REVOKED" ? `Ended ${when(row.revokedAt)}` : row.state === "ACTIVE" || row.state === "EXPIRED" ? `Until ${when(row.expiresAt)}` : "Waiting for an approver"}
                </td>
              ) : null}
              <td className="py-2 pr-3 text-xs">{when(row.createdAt)}</td>
              {actions ? <td className="py-2 text-right">{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
