import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// customer.success (WP-4.8): overview, at-risk, expansion, scoring model, playbooks and their runs.

export type TenantRef = { id: string; name: string; slug: string | null; status?: string | null; plan?: string | null };

export type Overview = {
  scoredTenants: number;
  distribution: { atRisk: number; watch: number; healthy: number };
  movers: Array<{ tenant: TenantRef; score: number; previous: number; change: number; computedAt: string }>;
  lastScoringRun: { status: string; startedAt: string } | null;
};

export type AtRiskRow = { tenant: TenantRef; score: number; trend: string; computedAt: string; reasons: string[]; arr: string; arrCurrency: string | null };
export type ExpansionRow = { tenant: TenantRef; signals: Array<{ limit: string; used: number; of: number; ratio: number }> };
export type ScoringModel = { version: number; minTenantAgeDays: number; bands: { atRiskBelow: number; healthyFrom: number }; factors: Array<{ key: string; weight: number; label: string; definition: string }> };

export type Step =
  | { type: "EMAIL_TENANT_ADMINS"; template: string; subject: string; body: string }
  | { type: "CREATE_PLATFORM_TICKET"; subject: string; body: string }
  | { type: "NOTIFY_STAFF"; permission: string; text: string }
  | { type: "WAIT"; days: number };

export type Playbook = { id: string; name: string; description: string | null; trigger: string; triggerValue: number | null; steps: Step[]; active: boolean; runs: number | null; running: number | null; updatedAt: string };
export type PlaybookInput = { name: string; description?: string | null; trigger: string; triggerValue?: number | null; steps: Step[]; active: boolean };

export type Run = {
  id: string;
  playbookId: string | null;
  tenant: TenantRef;
  status: string;
  triggerSource: string | null;
  startedBy: string | null;
  currentStep: number;
  steps: Array<Step & { status: string; result?: Record<string, unknown>; at?: string }>;
  nextActionAt: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

const KEY = ["customer.success"] as const;

export function useOverview() {
  return useQuery({
    queryKey: [...KEY, "overview"],
    queryFn: async () => {
      const data = (await consoleApi.get<Partial<Overview>>("/success/overview")).data;
      return { scoredTenants: data.scoredTenants ?? 0, distribution: data.distribution ?? { atRisk: 0, watch: 0, healthy: 0 }, movers: data.movers ?? [], lastScoringRun: data.lastScoringRun ?? null } satisfies Overview;
    }
  });
}

export function useAtRisk() {
  return useQuery({ queryKey: [...KEY, "at-risk"], queryFn: async () => (await consoleApi.get<{ data: AtRiskRow[]; threshold: number }>("/success/at-risk")).data });
}

export function useExpansion() {
  return useQuery({ queryKey: [...KEY, "expansion"], queryFn: async () => (await consoleApi.get<{ data: ExpansionRow[]; month: string; threshold: number }>("/success/expansion")).data });
}

export function useScoringModel() {
  return useQuery({ queryKey: [...KEY, "model"], queryFn: async () => (await consoleApi.get<ScoringModel>("/success/health-scoring")).data });
}

export function usePlaybooks() {
  return useQuery({ queryKey: [...KEY, "playbooks"], queryFn: async () => (await consoleApi.get<{ data: Playbook[]; triggers: string[]; templates: string[] }>("/success/playbooks")).data });
}

export function usePlaybook(id: string) {
  return useQuery({ queryKey: [...KEY, "playbook", id], queryFn: async () => (await consoleApi.get<Playbook>(`/success/playbooks/${encodeURIComponent(id)}`)).data, enabled: Boolean(id) && id !== "new" });
}

export function useRuns(id: string) {
  return useQuery({ queryKey: [...KEY, "runs", id], queryFn: async () => (await consoleApi.get<{ data: Run[] }>(`/success/playbooks/${encodeURIComponent(id)}/runs`)).data.data, enabled: Boolean(id) });
}

function useInvalidating<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export function useSavePlaybook(id: string | null) {
  return useInvalidating(async (body: PlaybookInput) =>
    id ? (await consoleApi.patch<Playbook>(`/success/playbooks/${encodeURIComponent(id)}`, body)).data : (await consoleApi.post<Playbook>("/success/playbooks", body, { idempotent: true })).data
  );
}

export function useTogglePlaybook() {
  return useInvalidating(async ({ id, active }: { id: string; active: boolean }) => (await consoleApi.patch<Playbook>(`/success/playbooks/${encodeURIComponent(id)}`, { active })).data);
}

export function useDeletePlaybook() {
  return useInvalidating(async (id: string) => (await consoleApi.delete<{ id: string }>(`/success/playbooks/${encodeURIComponent(id)}`)).data);
}

export function useRunPlaybook(id: string) {
  return useInvalidating(async (tenantId: string) => (await consoleApi.post<Run>(`/success/playbooks/${encodeURIComponent(id)}/run`, { tenantId }, { idempotent: true })).data);
}

export function useQueueScoring() {
  return useInvalidating(async (_input: void) => (await consoleApi.post<{ queued: boolean; jobId: string }>("/success/health-scoring/run", {}, { idempotent: true })).data);
}

export function triggerLabel(trigger: string, value: number | null) {
  if (trigger === "HEALTH_BELOW") return `Health score below ${value ?? "?"}`;
  if (trigger === "TRIAL_ENDING") return `Trial ends within ${value ?? "?"} days`;
  if (trigger === "PAYMENT_FAILED") return "Fauward payment failed (in dunning)";
  return "Manual";
}

export function stepLabel(step: Step) {
  switch (step.type) {
    case "EMAIL_TENANT_ADMINS":
      return `Email tenant admins: ${step.subject}`;
    case "CREATE_PLATFORM_TICKET":
      return `Open a Fauward ticket: ${step.subject}`;
    case "NOTIFY_STAFF":
      return `Notify staff with ${step.permission}: ${step.text}`;
    case "WAIT":
      return `Wait ${step.days} day${step.days === 1 ? "" : "s"}`;
  }
}
