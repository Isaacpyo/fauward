const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN: "Admin",
  TENANT_MANAGER: "Manager",
  TENANT_FINANCE: "Finance",
  TENANT_STAFF: "Staff",
  TENANT_DRIVER: "Field Operator"
};

export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return ROLE_LABELS[role] ?? role;
}
