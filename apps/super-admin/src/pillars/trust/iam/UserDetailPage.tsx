import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { ME_QUERY_KEY } from "@/lib/use-me";
import { assignStaffRole, changeStaffStatus, fetchStaffRoles, fetchStaffUser, resetStaffMfa, revokeStaffRole, type StaffLifecycleAction, type StaffRoleAssignment } from "./api";
import { MfaStatusPill, RoleAssignmentTable, SessionTable, UserAvatar } from "./components";

type Dialog =
  | { kind: "assign"; roleId: string }
  | { kind: "revoke"; assignment: StaffRoleAssignment }
  | { kind: "lifecycle"; action: StaffLifecycleAction }
  | { kind: "reset-mfa" }
  | null;

const LIFECYCLE_COPY: Record<StaffLifecycleAction, { title: string; confirm: string; description: string }> = {
  suspend: { title: "Suspend staff user", confirm: "Suspend", description: "Disables console sign-in and revokes every active session immediately." },
  reactivate: { title: "Reactivate staff user", confirm: "Reactivate", description: "Restores console sign-in. Their roles are unchanged." },
  offboard: { title: "Offboard staff user", confirm: "Offboard", description: "Permanent: disables the account and revokes every session. Offboarded accounts cannot be reactivated." }
};

export function UserDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const userQuery = useQuery({ queryKey: ["staff-user", id], queryFn: () => fetchStaffUser(id), enabled: Boolean(id) });
  const rolesQuery = useQuery({ queryKey: ["staff-roles"], queryFn: fetchStaffRoles });
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [hardwareKeyAssertion, setHardwareKeyAssertion] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(message: string) {
    setNotice(message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff-user", id] }),
      queryClient.invalidateQueries({ queryKey: ["staff-users"] }),
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    ]);
  }

  const user = userQuery.data;
  if (userQuery.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading staff user...</p>;
  if (userQuery.isError) return <ConsoleApiErrorPanel error={userQuery.error} onRetry={() => void userQuery.refetch()} />;
  if (!user) return <p className="text-sm text-[var(--color-text-muted)]">Staff user not found.</p>;

  const assignedRoleIds = new Set(user.roleAssignments.map((assignment) => assignment.roleId));
  const availableRoles = rolesQuery.data?.filter((role) => !assignedRoleIds.has(role.id) && !role.deprecated) ?? [];
  const lifecycleActions: StaffLifecycleAction[] = user.status === "ACTIVE" ? ["suspend", "offboard"] : user.status === "SUSPENDED" ? ["reactivate", "offboard"] : [];

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-[var(--color-border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <UserAvatar user={user} />
          <div className="flex flex-wrap items-center gap-2">
            <MfaStatusPill enabled={user.mfaEnabled} />
            <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs font-semibold">{user.status}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">SSO: {user.ssoProvider} | Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</p>
      </header>

      {notice ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Role assignments</h2>
          <div className="flex gap-2">
            <label htmlFor="iam-role-select" className="sr-only">
              Role to assign
            </label>
            <select id="iam-role-select" className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
              <option value="">Choose a role</option>
              {availableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.id}
                </option>
              ))}
            </select>
            <PermissionButton
              permission="trust.iam.write"
              disabled={!selectedRoleId || user.status !== "ACTIVE"}
              className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => {
                setExpiresAt("");
                setHardwareKeyAssertion("");
                setDialog({ kind: "assign", roleId: selectedRoleId });
              }}
            >
              Assign role
            </PermissionButton>
          </div>
        </div>
        <RoleAssignmentTable assignments={user.roleAssignments} />
        <div className="mt-3 flex flex-wrap gap-2">
          {user.roleAssignments.map((assignment) => (
            <PermissionButton key={assignment.id} permission="trust.iam.write" className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs disabled:opacity-50" onClick={() => setDialog({ kind: "revoke", assignment })}>
              Revoke {assignment.roleId}
            </PermissionButton>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">MFA</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Staff enrol their own authenticator app at sign-in. Reset clears it (for a lost device) and signs them out everywhere; they enrol again at next login.</p>
          <PermissionButton permission="trust.iam.write" disabled={!user.mfaEnabled} className="mt-3 rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50" onClick={() => setDialog({ kind: "reset-mfa" })}>
            Reset MFA
          </PermissionButton>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Account status</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Suspending or offboarding disables sign-in and revokes every active session at once.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {lifecycleActions.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">Offboarded accounts are final.</p> : null}
            {lifecycleActions.map((action) => (
              <PermissionButton
                key={action}
                permission="trust.iam.write"
                className={`rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${action === "reactivate" ? "border-[var(--color-border)]" : "border-red-300 text-red-700"}`}
                onClick={() => setDialog({ kind: "lifecycle", action })}
              >
                {LIFECYCLE_COPY[action].confirm}
              </PermissionButton>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Sessions</h2>
        <SessionTable sessions={user.sessions} />
      </section>

      <ActionDialog
        open={dialog?.kind === "assign"}
        title={dialog?.kind === "assign" ? `Assign ${dialog.roleId} to ${user.email}?` : ""}
        description="Grants every permission of the role. Recorded in the audit log."
        confirmLabel="Assign role"
        dangerous
        validate={() => (expiresAt && new Date(expiresAt) <= new Date() ? "The expiry must be in the future." : null)}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          if (dialog?.kind !== "assign") return;
          await assignStaffRole({
            staffId: user.id,
            roleId: dialog.roleId,
            reason,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
            hardwareKeyAssertion: dialog.roleId === "ROOT" ? hardwareKeyAssertion : undefined
          });
          setSelectedRoleId("");
          await refresh(`${dialog.roleId} assigned to ${user.email}.`);
        }}
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="iam-assign-expiry" className="block text-xs font-semibold text-[var(--color-text-muted)]">
              Expires (optional)
            </label>
            <input id="iam-assign-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
          </div>
          {dialog?.kind === "assign" && dialog.roleId === "ROOT" ? (
            <div>
              <label htmlFor="iam-assign-hardware" className="block text-xs font-semibold text-[var(--color-text-muted)]">
                Hardware key assertion (required for ROOT)
              </label>
              <input id="iam-assign-hardware" type="password" value={hardwareKeyAssertion} onChange={(event) => setHardwareKeyAssertion(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
            </div>
          ) : null}
        </div>
      </ActionDialog>

      <ActionDialog
        open={dialog?.kind === "revoke"}
        title={dialog?.kind === "revoke" ? `Revoke ${dialog.assignment.roleId} from ${user.email}?` : ""}
        description="Removes the role's permissions on their next request."
        confirmLabel="Revoke role"
        dangerous
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          if (dialog?.kind !== "revoke") return;
          await revokeStaffRole(dialog.assignment.id, reason);
          await refresh(`${dialog.assignment.roleId} revoked from ${user.email}.`);
        }}
      />

      <ActionDialog
        open={dialog?.kind === "lifecycle"}
        title={dialog?.kind === "lifecycle" ? `${LIFECYCLE_COPY[dialog.action].title}: ${user.email}` : ""}
        description={dialog?.kind === "lifecycle" ? LIFECYCLE_COPY[dialog.action].description : undefined}
        confirmLabel={dialog?.kind === "lifecycle" ? LIFECYCLE_COPY[dialog.action].confirm : ""}
        dangerous
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          if (dialog?.kind !== "lifecycle") return;
          const updated = await changeStaffStatus(user.id, dialog.action, reason);
          await refresh(`${user.email} is now ${updated.status}.`);
        }}
      />

      <ActionDialog
        open={dialog?.kind === "reset-mfa"}
        title={`Reset MFA for ${user.email}?`}
        description="Clears their authenticator and revokes all of their console sessions."
        confirmLabel="Reset MFA"
        dangerous
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          await resetStaffMfa(user.id, reason);
          await refresh(`MFA reset for ${user.email}; their sessions were revoked.`);
        }}
      />
    </div>
  );
}
