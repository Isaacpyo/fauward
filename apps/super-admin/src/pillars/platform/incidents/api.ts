import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// platform.incidents (WP-4.2): native incidents (declare, status/severity/commander, updates, tenant impacts, public
// updates → INCIDENT announcement, resolve + postmortem), runbooks, PagerDuty as an optional producer.

export const SEVERITIES = ["SEV1", "SEV2", "SEV3", "SEV4"] as const;
export const OPEN_STATUSES = ["INVESTIGATING", "IDENTIFIED", "MONITORING"] as const;
export const IMPACT_LEVELS = ["AFFECTED", "DEGRADED", "OUTAGE"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type OpenStatus = (typeof OPEN_STATUSES)[number];
export type IncidentStatus = OpenStatus | "RESOLVED";
export type Person = { id: string; email: string | null; name: string | null };
export type VendorStatus = { vendor: string; configured: boolean; missing: string[] };

export type Incident = {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: Severity | null;
  vendor: string;
  vendorId: string | null;
  services: string[];
  commander: Person | null;
  createdBy: Person | null;
  publicSummary: string | null;
  postmortemUrl: string | null;
  announcementId: string | null;
  runbookIds: string[];
  impactCount: number | null;
  startedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Runbook = { id: string; title: string; slug: string; body: string; service: string | null; createdAt: string; updatedAt: string };

export type IncidentAnnouncement = { id: string; type: string; title: string; body: string; targetAll: boolean; tenantIds: string[]; dismissible: boolean; expiresAt: string | null; state: string };

export type IncidentDetail = Incident & {
  impacts: Array<{ id: string; tenant: { id: string; name: string; slug: string | null }; impactLevel: string; notes: string | null; createdAt: string }>;
  updates: Array<{ id: string; status: string; body: string; isPublic: boolean; author: Person | null; createdAt: string }>;
  runbooks: { linked: Runbook[]; suggested: Runbook[] };
  announcement: IncidentAnnouncement | null;
};

export type IncidentList = { data: Incident[]; total: number; pagerDuty: VendorStatus };

const KEY = ["platform.incidents"] as const;

export function useIncidents(filter: { status: string; severity: string }) {
  return useQuery({
    queryKey: [...KEY, "list", filter],
    queryFn: async () => (await consoleApi.get<IncidentList>("/incidents", { params: { status: filter.status, ...(filter.severity ? { severity: filter.severity } : {}), limit: 100 } })).data
  });
}

/** Open incidents for the TopBar pill. */
export function useActiveIncidents(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "active-pill"],
    queryFn: async () => (await consoleApi.get<IncidentList>("/incidents", { params: { status: "ACTIVE", limit: 5 } })).data,
    enabled,
    refetchInterval: 60_000
  });
}

export function useIncident(id: string) {
  return useQuery({ queryKey: [...KEY, "detail", id], queryFn: async () => (await consoleApi.get<IncidentDetail>(`/incidents/${encodeURIComponent(id)}`)).data, enabled: Boolean(id) });
}

export function useResponders() {
  return useQuery({ queryKey: [...KEY, "responders"], queryFn: async () => (await consoleApi.get<{ data: Person[] }>("/incidents/responders")).data.data });
}

export function useRunbooks() {
  return useQuery({ queryKey: [...KEY, "runbooks"], queryFn: async () => (await consoleApi.get<{ data: Runbook[] }>("/incidents/runbooks")).data.data });
}

export function useRunbook(id: string) {
  return useQuery({
    queryKey: [...KEY, "runbook", id],
    queryFn: async () => (await consoleApi.get<Runbook & { linkedIncidents: Array<{ id: string; title: string; status: string; severity: string | null }> }>(`/incidents/runbooks/${encodeURIComponent(id)}`)).data,
    enabled: Boolean(id)
  });
}

function useInvalidating<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export type DeclareInput = { title: string; severity: Severity; services: string[]; commanderPlatformUserId: string | null; description?: string };

export function useDeclareIncident() {
  return useInvalidating(async (body: DeclareInput) => (await consoleApi.post<IncidentDetail>("/incidents", body, { idempotent: true })).data);
}

export type IncidentPatch = Partial<{ title: string; status: OpenStatus; severity: Severity; services: string[]; commanderPlatformUserId: string | null; runbookIds: string[]; postmortemUrl: string | null }>;

export function usePatchIncident(id: string) {
  return useInvalidating(async (body: IncidentPatch) => (await consoleApi.patch<IncidentDetail>(`/incidents/${encodeURIComponent(id)}`, body)).data);
}

export type UpdateInput = { body: string; isPublic: boolean; status?: OpenStatus; audience?: "IMPACTED" | "ALL" };

export function usePostUpdate(id: string) {
  return useInvalidating(
    async (body: UpdateInput) =>
      (await consoleApi.post<{ update: { id: string }; announcement: IncidentAnnouncement | null; notified: { tenants: number; inApp: number; emailsQueued: number } }>(`/incidents/${encodeURIComponent(id)}/updates`, body, { idempotent: true })).data
  );
}

export function useAddImpact(id: string) {
  return useInvalidating(
    async (body: { tenantId: string; impactLevel: string; notes?: string }) =>
      (await consoleApi.post<{ id: string; announcementExtended: boolean }>(`/incidents/${encodeURIComponent(id)}/impacts`, body, { idempotent: true })).data
  );
}

export function useResolveIncident(id: string) {
  return useInvalidating(
    async (body: { postmortemUrl?: string | null; publicMessage?: string }) =>
      (await consoleApi.post<{ incident: IncidentDetail; announcement: IncidentAnnouncement | null }>(`/incidents/${encodeURIComponent(id)}/resolve`, body, { idempotent: true })).data
  );
}

export type RunbookInput = { title: string; slug?: string; body: string; service: string | null };

export function useSaveRunbook(id: string | null) {
  return useInvalidating(async (body: RunbookInput) =>
    id ? (await consoleApi.patch<Runbook>(`/incidents/runbooks/${encodeURIComponent(id)}`, body)).data : (await consoleApi.post<Runbook>("/incidents/runbooks", body, { idempotent: true })).data
  );
}

export function useDeleteRunbook() {
  return useInvalidating(async (id: string) => (await consoleApi.delete<{ id: string; unlinkedIncidents: number }>(`/incidents/runbooks/${encodeURIComponent(id)}`, { idempotent: true })).data);
}

export function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function personLabel(person: Person | null) {
  if (!person) return "Unassigned";
  return person.name ?? person.email ?? person.id;
}
