import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ReasonModal } from "@fauward/internal-ui";
import { assignStaffRole, fetchStaffRoles, fetchStaffUser, offboardStaffUser, resetStaffMfa, revokeStaffRole } from "./api";
import { MfaStatusPill, RoleAssignmentTable, SessionTable, UserAvatar } from "./components";

export function UserDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const userQuery = useQuery({ queryKey: ["staff-user", id], queryFn: () => fetchStaffUser(id), enabled: Boolean(id) });
  const rolesQuery = useQuery({ queryKey: ["staff-roles"], queryFn: fetchStaffRoles });
  const assignMutation = useMutation({ mutationFn: assignStaffRole, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["staff-user", id] }) });
  const revokeMutation = useMutation({ mutationFn: ({ assignmentId }: { assignmentId: string }) => revokeStaffRole(assignmentId, "Role revoked from staff profile"), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["staff-user", id] }) });
  const offboardMutation = useMutation({ mutationFn: () => offboardStaffUser(id, "Staff offboarded from IAM detail page"), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["staff-user", id] }) });
  const [resetMfaOpen, setResetMfaOpen] = useState(false);
  const resetMfaMutation = useMutation({
    mutationFn: (reason: string) => resetStaffMfa(id, reason),
    onSuccess: () => {
      setResetMfaOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["staff-user", id] });
    }
  });

  const user = userQuery.data;
  if (userQuery.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading staff user...</p>;
  if (!user) return <p className="text-sm text-[var(--color-text-muted)]">Staff user not found.</p>;

  const assignedRoleIds = new Set(user.roleAssignments.map((assignment) => assignment.roleId));
  const availableRoles = rolesQuery.data?.filter((role) => !assignedRoleIds.has(role.id) && !role.deprecated) ?? [];

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

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Role assignments</h2>
          <div className="flex gap-2">
            <select className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" onChange={(event) => event.target.value && assignMutation.mutate({ staffId: user.id, roleId: event.target.value, reason: "Role assigned from staff profile" })} defaultValue="">
              <option value="">Assign role</option>
              {availableRoles.map((role) => <option key={role.id} value={role.id}>{role.id}</option>)}
            </select>
          </div>
        </div>
        <RoleAssignmentTable assignments={user.roleAssignments} />
        <div className="mt-3 flex flex-wrap gap-2">
          {user.roleAssignments.map((assignment) => (
            <button key={assignment.id} type="button" className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs" onClick={() => revokeMutation.mutate({ assignmentId: assignment.id })}>
              Revoke {assignment.roleId}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">MFA</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Staff enrol their own authenticator app at sign-in. Reset clears it (for a lost device) and signs them out everywhere; they enrol again at next login.</p>
          <button type="button" disabled={!user.mfaEnabled || resetMfaMutation.isPending} className="mt-3 rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50" onClick={() => setResetMfaOpen(true)}>
            Reset MFA
          </button>
          {resetMfaMutation.isError ? <p role="alert" className="mt-2 text-sm text-red-700">MFA reset failed. Check you have trust.iam.write and recent MFA, and are not resetting yourself.</p> : null}
          <ReasonModal
            open={resetMfaOpen}
            title={`Reset MFA for ${user.email}?`}
            description="Clears their authenticator and revokes all of their console sessions."
            confirmLabel={resetMfaMutation.isPending ? "Resetting…" : "Reset MFA"}
            onCancel={() => setResetMfaOpen(false)}
            onConfirm={(reason) => {
              if (!resetMfaMutation.isPending) resetMfaMutation.mutate(reason);
            }}
          />
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Offboarding</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Soft deletes set status to OFFBOARDED and revoke active sessions.</p>
          <button type="button" className="mt-3 rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" onClick={() => offboardMutation.mutate()}>
            Offboard staff user
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Sessions</h2>
        <SessionTable sessions={user.sessions} />
      </section>
    </div>
  );
}
