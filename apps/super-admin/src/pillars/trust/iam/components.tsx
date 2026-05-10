import { HealthPill } from "@fauward/internal-ui";
import type { StaffRoleAssignment, StaffSession, StaffUser } from "./api";

export function UserAvatar({ user }: { user: Pick<StaffUser, "name" | "email" | "status"> }) {
  const initials = user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-surface-50)] text-xs font-semibold text-[var(--color-text-muted)]">{initials}</span>
      <span>
        <span className="block font-medium text-[var(--color-text-primary)]">{user.name}</span>
        <span className="block text-xs text-[var(--color-text-muted)]">{user.email}</span>
      </span>
    </span>
  );
}

export function RoleBadge({ roleId, deprecated = false }: { roleId: string; deprecated?: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${deprecated ? "border-amber-200 bg-amber-50 text-amber-700" : "border-[var(--color-border)] bg-white text-[var(--color-text-primary)]"}`}>
      {roleId}
    </span>
  );
}

export function MfaStatusPill({ enabled }: { enabled: boolean }) {
  return <HealthPill status={enabled ? "green" : "amber"} label={enabled ? "MFA enabled" : "MFA pending"} />;
}

export function RoleAssignmentTable({ assignments }: { assignments: StaffRoleAssignment[] }) {
  if (assignments.length === 0) return <p className="text-sm text-[var(--color-text-muted)]">No role assignments.</p>;
  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-50)] text-left text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="p-3">Role</th>
            <th className="p-3">Granted</th>
            <th className="p-3">Expires</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr key={assignment.id} className="border-t border-[var(--color-border)]">
              <td className="p-3"><RoleBadge roleId={assignment.roleId} deprecated={assignment.role.deprecated} /></td>
              <td className="p-3 font-mono text-xs">{new Date(assignment.grantedAt).toLocaleString()}</td>
              <td className="p-3 font-mono text-xs">{assignment.expiresAt ? new Date(assignment.expiresAt).toLocaleString() : "Never"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SessionTable({ sessions = [] }: { sessions?: StaffSession[] }) {
  if (sessions.length === 0) return <p className="text-sm text-[var(--color-text-muted)]">No sessions found.</p>;
  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-50)] text-left text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="p-3">Started</th>
            <th className="p-3">Expires</th>
            <th className="p-3">IP</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id} className="border-t border-[var(--color-border)]">
              <td className="p-3 font-mono text-xs">{new Date(session.startedAt).toLocaleString()}</td>
              <td className="p-3 font-mono text-xs">{new Date(session.expiresAt).toLocaleString()}</td>
              <td className="p-3 font-mono text-xs">{session.ipAddress ?? "-"}</td>
              <td className="p-3">{session.revokedAt ? <HealthPill status="red" label="Revoked" /> : <HealthPill status="green" label="Active" />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
