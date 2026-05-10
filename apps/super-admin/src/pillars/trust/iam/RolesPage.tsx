import { DenseTable, EmptyState } from "@fauward/internal-ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchStaffRoles, type StaffRole } from "./api";
import { RoleBadge } from "./components";

export function RolesPage() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["staff-roles"], queryFn: fetchStaffRoles });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Staff roles</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">System role catalogue, permission grants and assignment counts.</p>
      </header>

      <DenseTable<StaffRole>
        data={query.data ?? []}
        loading={query.isLoading}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/trust/iam/roles/${row.id}`)}
        emptyState={<EmptyState title="No roles" message="Run the staff role seed to create system roles." />}
        columns={[
          { id: "role", header: "Role", sortable: true, width: 240, cell: (row) => <RoleBadge roleId={row.id} deprecated={row.deprecated} /> },
          { id: "description", header: "Description", width: 420, cell: (row) => row.description },
          { id: "permissions", header: "Permissions", align: "right", cell: (row) => row.permissions.length },
          { id: "assignments", header: "Assignments", align: "right", cell: (row) => row._count?.assignments ?? 0 },
          { id: "status", header: "Status", cell: (row) => row.deprecated ? "Deprecated" : row.isSystem ? "System" : "Custom" }
        ]}
      />
    </div>
  );
}
