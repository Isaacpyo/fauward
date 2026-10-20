import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { useAppStore } from "@/stores/useAppStore";

// D8 tenant side (WP-2.9): a banner for workspace admins while Fauward staff are in the workspace, and the
// staff-access email setting (Enterprise can turn the email off; the in-app notice always stays).

type ActiveSession = { id: string; staffName: string; reason: string; scopes: string[]; expiresAt: string };
type StaffAccessSettings = { notifyOnStaffAccess: boolean; canDisableEmail: boolean };

const ACTIVE_POLL_MS = 60_000;
const SETTINGS_KEY = ["tenant", "me", "staff-access", "settings"];

export function StaffAccessActiveBanner() {
  const user = useAppStore((state) => state.user);
  const isImpersonating = user?.mode === "IMPERSONATION" || user?.impersonated === true;
  const enabled = user?.role === "TENANT_ADMIN" && !isImpersonating;
  const active = useQuery({
    queryKey: ["tenant", "me", "staff-access", "active"],
    queryFn: async () => (await api.get<{ data: ActiveSession[] }>("/v1/tenants/me/staff-access/active")).data.data,
    enabled,
    refetchInterval: ACTIVE_POLL_MS,
    retry: false
  });
  const sessions = active.data ?? [];
  if (!enabled || sessions.length === 0) return null;
  return (
    <div role="status" data-testid="staff-access-active" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      {sessions.map((session) => (
        <p key={session.id}>
          <span className="font-semibold">{session.staffName}</span> from Fauward is in your workspace ({session.scopes.includes("write") ? "read and write" : "read-only"}) until{" "}
          {new Date(session.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}: {session.reason}.{" "}
          <Link to="/settings?tab=staff-access" className="font-semibold underline">
            Staff access log
          </Link>
        </p>
      ))}
    </div>
  );
}

export function StaffAccessEmailSetting() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: async () => (await api.get<StaffAccessSettings>("/v1/tenants/me/staff-access/settings")).data });
  const save = useMutation({
    mutationFn: async (notifyOnStaffAccess: boolean) => (await api.patch<StaffAccessSettings>("/v1/tenants/me/staff-access/settings", { notifyOnStaffAccess })).data,
    onSuccess: (data) => queryClient.setQueryData(SETTINGS_KEY, data)
  });
  if (!settings.data || typeof settings.data.notifyOnStaffAccess !== "boolean") return null;
  return (
    <div className="rounded-md border border-gray-200 p-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.data.notifyOnStaffAccess}
          disabled={!settings.data.canDisableEmail || save.isPending}
          onChange={(event) => save.mutate(event.target.checked)}
        />
        Email workspace admins when Fauward staff open the workspace
      </label>
      <p className="mt-1 text-xs text-gray-500">
        {settings.data.canDisableEmail ? "The in-app notice is always shown." : "Always on. Enterprise workspaces can turn the email off; the in-app notice is always shown."}
      </p>
      {save.isError ? <p className="mt-1 text-xs text-red-700">{apiErrorMessage(save.error, "The setting could not be saved.")}</p> : null}
    </div>
  );
}
