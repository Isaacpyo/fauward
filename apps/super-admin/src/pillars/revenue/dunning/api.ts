import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// revenue.dunning (WP-4.5): overview, tenant timeline, enrolment actions, sequence editor, save offers.

export type VendorStatus = { vendor: string; configured: boolean; missing: string[] } | null;
export type TenantRef = { id: string; name: string; slug: string | null; status?: string | null };

export type Enrollment = {
  id: string;
  tenant: TenantRef;
  invoiceId: string;
  source: "STRIPE" | "PLATFORM";
  sequence: { id: string; name: string };
  status: "ACTIVE" | "PAUSED" | "RECOVERED" | "EXHAUSTED" | "CANCELLED";
  stepsDone: number;
  stepsTotal: number;
  nextStep: { action: string; dayOffset: number; dueAt: string } | null;
  pausedAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  createdAt: string;
};

export type Overview = {
  stripe: VendorStatus;
  failedPayments: Array<{ id: string; source: string; tenant: TenantRef; invoiceRef: string | null; attempt: number | null; amount: string | null; currency: string | null; at: string }>;
  overdueInvoices: Array<{ id: string; tenant: TenantRef; invoiceNumber: string; total: string; currency: string; dueDate: string | null; stripeInvoiceId: string | null }>;
  enrollments: Enrollment[];
};

export type Timeline = {
  tenant: TenantRef;
  enrollments: Array<Enrollment & { steps: Array<{ id: string; dayOffset: number; action: string; template: string; dueAt: string; done: boolean }> }>;
  events: Array<{ id: string; eventType: string; invoiceId: string | null; attempt: number; actorId: string | null; metadata: Record<string, unknown> | null; createdAt: string }>;
  saveOffers: Array<{ id: string; discount: string; status: string; code: string | null; expiresAt: string; redeemedAt: string | null }>;
};

export type Step = { id: string; dayOffset: number; action: string; template: string };
export type Sequence = { id: string; name: string; active: boolean; isDefault: boolean; activeEnrollments: number; steps: Step[]; updatedAt: string };

export type SaveOffer = { id: string; tenantId: string; tenant: TenantRef; discount: string; status: string; code: string | null; reason: string | null; expiresAt: string; redeemedAt: string | null; approvedBy: string | null; createdAt: string };

const KEY = ["revenue.dunning"] as const;

export function useDunningOverview() {
  return useQuery({
    queryKey: [...KEY, "overview"],
    queryFn: async () => {
      const data = (await consoleApi.get<Partial<Overview>>("/dunning/overview")).data;
      // Every list is rendered, empty or not.
      return { stripe: data.stripe ?? null, failedPayments: data.failedPayments ?? [], overdueInvoices: data.overdueInvoices ?? [], enrollments: data.enrollments ?? [] } satisfies Overview;
    }
  });
}

export function useTenantTimeline(tenantId: string) {
  return useQuery({ queryKey: [...KEY, "timeline", tenantId], queryFn: async () => (await consoleApi.get<Timeline>(`/dunning/tenants/${encodeURIComponent(tenantId)}/timeline`)).data, enabled: Boolean(tenantId) });
}

export function useSequences() {
  return useQuery({ queryKey: [...KEY, "sequences"], queryFn: async () => (await consoleApi.get<{ data: Sequence[]; actions: string[]; templates: string[] }>("/dunning/sequences")).data });
}

export function useSequence(id: string) {
  return useQuery({ queryKey: [...KEY, "sequence", id], queryFn: async () => (await consoleApi.get<Sequence>(`/dunning/sequences/${encodeURIComponent(id)}`)).data, enabled: Boolean(id) });
}

export function useSaveOffers() {
  return useQuery({ queryKey: [...KEY, "save-offers"], queryFn: async () => (await consoleApi.get<{ data: SaveOffer[] }>("/dunning/save-offers")).data.data });
}

function useInvalidating<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export type EnrollmentAction = "retry" | "pause" | "resume" | "cancel";

export function useEnrollmentAction() {
  return useInvalidating(
    async ({ id, action, reason }: { id: string; action: EnrollmentAction; reason: string }) =>
      (await consoleApi.post<{ channel?: "stripe" | "email"; status?: string }>(`/dunning/enrollments/${encodeURIComponent(id)}/${action}`, { reason }, { idempotent: true })).data
  );
}

export function useCreateSequence() {
  return useInvalidating(async (body: { name: string; isDefault?: boolean }) => (await consoleApi.post<Sequence>("/dunning/sequences", body, { idempotent: true })).data);
}

export function usePatchSequence(id: string) {
  return useInvalidating(async (body: Partial<{ name: string; isDefault: boolean; active: boolean }>) => (await consoleApi.patch<Sequence>(`/dunning/sequences/${encodeURIComponent(id)}`, body)).data);
}

export function useDeleteSequence() {
  return useInvalidating(async (id: string) => (await consoleApi.delete<{ id: string }>(`/dunning/sequences/${encodeURIComponent(id)}`)).data);
}

export function useAddStep(sequenceId: string) {
  return useInvalidating(async (body: { dayOffset: number; action: string; template?: string }) => (await consoleApi.post<Sequence>(`/dunning/sequences/${encodeURIComponent(sequenceId)}/steps`, body, { idempotent: true })).data);
}

export function usePatchStep(sequenceId: string) {
  return useInvalidating(
    async ({ stepId, ...body }: { stepId: string; dayOffset?: number; action?: string; template?: string }) =>
      (await consoleApi.patch<Sequence>(`/dunning/sequences/${encodeURIComponent(sequenceId)}/steps/${encodeURIComponent(stepId)}`, body)).data
  );
}

export function useDeleteStep(sequenceId: string) {
  return useInvalidating(async (stepId: string) => (await consoleApi.delete<Sequence>(`/dunning/sequences/${encodeURIComponent(sequenceId)}/steps/${encodeURIComponent(stepId)}`)).data);
}

export function useCreateSaveOffer() {
  return useInvalidating(async (body: { tenantId: string; discount: string; expiresAt?: string; reason: string }) => (await consoleApi.post<SaveOffer>("/dunning/save-offers", body, { idempotent: true })).data);
}

export function useApproveSaveOffer() {
  return useInvalidating(async ({ id, reason }: { id: string; reason: string }) => (await consoleApi.post<{ offer: SaveOffer }>(`/dunning/save-offers/${encodeURIComponent(id)}/approve`, { reason }, { idempotent: true })).data.offer);
}

export const ACTION_LABEL: Record<string, string> = { EMAIL: "Email", EMAIL_IN_APP: "Email + in-app", RETRY_PAYMENT: "Retry payment", SUSPEND: "Suspend (D3)" };
