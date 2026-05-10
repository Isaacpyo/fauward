import { DenseTable, EmptyState } from "@fauward/internal-ui";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { fetchStaffRole, type StaffRoleAssignment } from "./api";
import { RoleBadge, UserAvatar } from "./components";

export function RoleDetailPage() {
  const { id = "" } = useParams();
  const query = useQuery({ queryKey: ["staff-role", id], queryFn: () => fetchStaffRole(id), enabled: Boolean(id) });
  const role = query.data;

  if (query.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading role...</p>;
  if (!role) return <p className="text-sm text-[var(--color-text-muted)]">Role not found.</p>;

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-[var(--color-border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <RoleBadge roleId={role.id} deprecated={role.deprecated} />
            <h1 className="mt-3 text-xl font-bold text-[var(--color-text-primary)]">{role.name}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{role.description}</p>
          </div>
          <div className="text-right text-sm text-[var(--color-text-muted)]">
            <p>{role.permissions.length} permissions</p>
            <p>{role.assignments.length} assignments</p>
          </div>
        </div>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Permission matrix</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {role.permissions.map((permission) => (
            <span key={permission} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-50)] px-2 py-1 font-mono text-xs">
              {permission}
            </span>
          ))}
        </div>
      </section>

      <DenseTable<StaffRoleAssignment & { staff: Parameters<typeof UserAvatar>[0]["user"] }>
        data={role.assignments}
        getRowId={(row) => row.id}
        emptyState={<EmptyState title="No assignments" message="No staff users currently hold this role." />}
        columns={[
          { id: "staff", header: "Staff user", width: 320, cell: (row) => <UserAvatar user={row.staff} /> },
          { id: "granted", header: "Granted", cell: (row) => new Date(row.grantedAt).toLocaleString() },
          { id: "expires", header: "Expires", cell: (row) => row.expiresAt ? new Date(row.expiresAt).toLocaleString() : "Never" }
        ]}
      />
    </div>
  );
}
