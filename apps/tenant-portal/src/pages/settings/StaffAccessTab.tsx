import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { api } from "@/lib/api";
import { useAppStore } from "@/stores/useAppStore";
import { StaffAccessEmailSetting } from "@/components/staff-access/StaffAccess";

export type StaffAccessSession = {
  id: string;
  staffName: string;
  staffEmail: string;
  reason: string;
  scopes: string[];
  startedAt: string;
  openedAt: string | null;
  expiresAt: string;
  endedAt: string | null;
  endedReason: string | null;
  active: boolean;
  auditRows: number;
};

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

/** Every time Fauward staff opened this workspace (D8): who, why, read or write, when, and what they changed. */
export function StaffAccessTab() {
  const user = useAppStore((state) => state.user);
  const isAdmin = user?.role === "TENANT_ADMIN";
  const log = useQuery({
    queryKey: ["tenant", "me", "staff-access"],
    queryFn: async () => (await api.get<{ data: StaffAccessSession[]; nextCursor: string | null }>("/v1/tenants/me/staff-access")).data,
    enabled: isAdmin
  });

  if (!isAdmin) return <p className="text-sm text-gray-600">Only workspace admins can see when Fauward staff accessed this workspace.</p>;
  if (log.isLoading) return <p className="text-sm text-gray-500">Loading staff access…</p>;
  if (log.isError) {
    const message = isAxiosError(log.error) ? ((log.error.response?.data as { error?: string } | undefined)?.error ?? log.error.message) : "Unable to load staff access.";
    return <p className="text-sm text-red-700">{message}</p>;
  }

  const rows = log.data?.data ?? [];
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Staff access</h2>
        <p className="text-sm text-gray-600">Fauward support opens your workspace only with a recorded reason. Read-only sessions cannot change anything.</p>
      </div>
      <StaffAccessEmailSetting />
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">Fauward staff have not accessed this workspace.</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="py-1">Staff</th>
              <th className="py-1">Reason</th>
              <th className="py-1">Access</th>
              <th className="py-1">Started</th>
              <th className="py-1">Ended</th>
              <th className="py-1 text-right">Changes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((session) => (
              <tr key={session.id} data-testid="staff-access-row">
                <td className="py-2">
                  {session.staffName}
                  <span className="block text-xs text-gray-500">{session.staffEmail}</span>
                </td>
                <td className="py-2">{session.reason}</td>
                <td className="py-2">{session.scopes.includes("write") ? "Read and write" : "Read-only"}</td>
                <td className="py-2 text-xs">{when(session.startedAt)}</td>
                <td className="py-2 text-xs">{session.active ? <span className="font-semibold text-amber-700">Active now</span> : `${when(session.endedAt ?? session.expiresAt)}${session.endedReason ? ` (${session.endedReason.toLowerCase()})` : ""}`}</td>
                <td className="py-2 text-right tabular-nums">{session.auditRows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
