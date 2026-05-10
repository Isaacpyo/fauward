import { internalApi } from "@/lib/internal-api";

export type AuditEntry = {
  id: string;
  actorId: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetTenantId: string | null;
  reason: string | null;
  before: unknown | null;
  after: unknown | null;
  hash: string;
  previousHash: string | null;
  createdAt: string;
};

export type AuditFilters = {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export async function fetchAuditEntries(filters: AuditFilters) {
  const response = await internalApi.get<{ data: AuditEntry[]; meta: { total: number; page: number; limit: number; totalPages: number } }>("/audit/entries", { params: filters });
  return response.data;
}

export async function fetchAuditEntry(id: string) {
  const response = await internalApi.get<AuditEntry>(`/audit/entries/${id}`);
  return response.data;
}

export async function exportAudit(input: { from?: string; to?: string; format: "csv" | "json"; reason: string }) {
  const response = await internalApi.post<{ url: string; format: string; rows: number }>("/audit/export", input);
  return response.data;
}

export async function verifyAuditChain() {
  const response = await internalApi.post<{ ok: boolean; checked?: number; failedAt?: string; verifiedAt: string }>("/audit/verify", {});
  return response.data;
}
