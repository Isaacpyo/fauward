import { consoleApi as internalApi } from "@/lib/console-api";

export type StaffStatus = "ACTIVE" | "SUSPENDED" | "OFFBOARDED";

export type StaffRole = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  deprecated: boolean;
  _count?: { assignments: number };
};

export type StaffRoleAssignment = {
  id: string;
  staffId: string;
  roleId: string;
  grantedBy: string | null;
  grantedAt: string;
  expiresAt: string | null;
  role: StaffRole;
};

export type StaffSession = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  startedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type StaffUser = {
  id: string;
  email: string;
  name: string;
  ssoProvider: string;
  status: StaffStatus;
  mfaEnabled: boolean;
  hardwareKeyId: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  roleAssignments: StaffRoleAssignment[];
  sessions?: StaffSession[];
};

export async function fetchStaffUsers(params?: { search?: string; status?: StaffStatus }) {
  const response = await internalApi.get<{ data: StaffUser[] }>("/iam/users", { params });
  return response.data.data;
}

export async function fetchStaffUser(id: string) {
  const response = await internalApi.get<StaffUser>(`/iam/users/${id}`);
  return response.data;
}

export async function createStaffUser(input: { email: string; name: string; password: string; roleIds: string[]; reason: string }) {
  const response = await internalApi.post<StaffUser>("/iam/users", input);
  return response.data;
}

export async function updateStaffUser(id: string, input: Partial<Pick<StaffUser, "name" | "status">> & { reason?: string }) {
  const response = await internalApi.patch<StaffUser>(`/iam/users/${id}`, input);
  return response.data;
}

export async function offboardStaffUser(id: string, reason: string) {
  const response = await internalApi.delete<StaffUser>(`/iam/users/${id}`, { data: { reason } });
  return response.data;
}

export async function fetchStaffRoles() {
  const response = await internalApi.get<{ data: StaffRole[] }>("/iam/roles");
  return response.data.data;
}

export async function fetchStaffRole(id: string) {
  const response = await internalApi.get<StaffRole & { assignments: Array<StaffRoleAssignment & { staff: StaffUser }> }>(`/iam/roles/${id}`);
  return response.data;
}

export async function assignStaffRole(input: { staffId: string; roleId: string; expiresAt?: string; reason: string }) {
  const response = await internalApi.post<StaffRoleAssignment>("/iam/role-assignments", input);
  return response.data;
}

export async function revokeStaffRole(id: string, reason: string) {
  await internalApi.delete(`/iam/role-assignments/${id}`, { data: { reason } });
}

export async function fetchPermissionInventory() {
  const response = await internalApi.get<{ data: string[] }>("/iam/permissions");
  return response.data.data;
}

// Enrolment is self-service at login; admins can only reset another person's MFA (dangerous: fresh MFA + reason).
export async function resetStaffMfa(id: string, reason: string) {
  const response = await internalApi.post<{ id: string; mfaEnabled: false; sessionsRevokedAt: string }>(`/iam/users/${id}/mfa/reset`, { reason }, { idempotent: true });
  return response.data;
}
