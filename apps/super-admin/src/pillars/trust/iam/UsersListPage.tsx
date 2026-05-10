import { DenseTable, EmptyState } from "@fauward/internal-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createStaffUser, fetchStaffRoles, fetchStaffUsers, type StaffUser } from "./api";
import { MfaStatusPill, RoleBadge, UserAvatar } from "./components";

export function UsersListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", roleId: "EXECUTIVE", reason: "Phase 1 staff onboarding" });
  const usersQuery = useQuery({ queryKey: ["staff-users", search], queryFn: () => fetchStaffUsers({ search: search || undefined }) });
  const rolesQuery = useQuery({ queryKey: ["staff-roles"], queryFn: fetchStaffRoles });
  const createMutation = useMutation({
    mutationFn: createStaffUser,
    onSuccess: () => {
      setForm({ name: "", email: "", password: "", roleId: "EXECUTIVE", reason: "Phase 1 staff onboarding" });
      void queryClient.invalidateQueries({ queryKey: ["staff-users"] });
    }
  });

  const roles = useMemo(() => rolesQuery.data?.filter((role) => !role.deprecated) ?? [], [rolesQuery.data]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Staff users</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Directory, session posture and role assignments for Fauward staff.</p>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr,1fr,1fr,180px]">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Name" />
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Email" />
          <input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Temporary password" type="password" />
          <select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
            {roles.map((role) => <option key={role.id} value={role.id}>{role.id}</option>)}
          </select>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Audit reason" />
          <button type="button" className="rounded-md bg-[var(--fauward-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={createMutation.isPending} onClick={() => createMutation.mutate({ name: form.name, email: form.email, password: form.password, roleIds: [form.roleId], reason: form.reason })}>
            Add staff user
          </button>
        </div>
      </section>

      <div className="flex justify-end">
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full max-w-sm rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Search staff" />
      </div>

      <DenseTable<StaffUser>
        data={usersQuery.data ?? []}
        loading={usersQuery.isLoading}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/trust/iam/users/${row.id}`)}
        emptyState={<EmptyState title="No staff users" message="Add a staff user to start assigning roles." />}
        columns={[
          { id: "user", header: "User", sortable: true, width: 260, cell: (row) => <UserAvatar user={row} /> },
          { id: "roles", header: "Roles", width: 300, cell: (row) => <div className="flex flex-wrap gap-1">{row.roleAssignments.map((assignment) => <RoleBadge key={assignment.id} roleId={assignment.roleId} deprecated={assignment.role.deprecated} />)}</div> },
          { id: "mfa", header: "MFA", cell: (row) => <MfaStatusPill enabled={row.mfaEnabled} /> },
          { id: "sessions", header: "Sessions", align: "right", cell: (row) => row.sessions?.length ?? 0 },
          { id: "status", header: "Status", cell: (row) => row.status }
        ]}
      />
    </div>
  );
}
