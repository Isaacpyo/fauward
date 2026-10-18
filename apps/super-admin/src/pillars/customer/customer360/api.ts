import { useQuery } from "@tanstack/react-query";

import { consoleApi as internalApi } from "@/lib/console-api";

// customer.360 (WP-1.8): one query per tab, each against its own endpoint and permission (catalogue → customer.360).

type Money = { amount: string; currency: string; source?: string; note?: string };

export type C360Summary = {
  identity: { id: string; name: string; slug: string; customDomain: string | null; region: string; createdAt: string };
  status: string;
  closedAt: string | null;
  plan: { billingPlan: string; effectivePlan: string; planOverride: { id: string; plan: string; reason: string; expiresAt: string | null } | null };
  activeSuspensions: Array<{ id: string; source: string; category: string; publicReason: string | null; createdAt: string }>;
  mrr: Money;
  subscription: { plan: string; billingCycle: string; status: string; currentPeriodEnd: string | null } | null;
  lastLoginAt: string | null;
  health: { score: number; trend: string; computedAt: string } | null;
  kycStatus: string;
  activeStaff: number;
  openTickets: number;
};

export type C360Usage = {
  months: Array<{ month: string; shipments: number; apiCalls: number; smsSent: number; emailsSent: number }>;
  limits: { maxStaff: number; maxShipmentsPm: number; maxOrganisations: number; apiRateLimit: number };
  limitsSource: "plan" | "tenant";
  current: { shipmentsThisMonth: number; staff: number };
  shipmentsTotal: number;
  api: { keys: Array<{ id: string; name: string | null; keyPrefix: string; isActive: boolean; lastUsedAt: string | null; monthlyRequestCount: number }>; callsLast30Days: number; errorsLast30Days: number };
};

export type C360Billing = {
  subscription: { plan: string; billingCycle: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; stripeLinked: boolean } | null;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; total: string; currency: string; dueDate: string | null; createdAt: string }>;
  invoiceCount: number;
  payments: Array<{ id: string; amount: string; currency: string; status: string; method: string | null; createdAt: string; invoiceId: string | null }>;
  dunning: Array<{ id: string; eventType: string; attempt: number; createdAt: string; invoiceId: string | null }>;
  saveOffers: Array<{ id: string; discount: string; status: string; expiresAt: string; createdAt: string }>;
};

export type C360Tickets = {
  audience: "PLATFORM" | "END_CUSTOMER";
  tickets: Array<{ id: string; ticketNumber: string; subject: string; category: string; priority: string; status: string; audience: string; lastMessageAt: string | null; createdAt: string; updatedAt: string }>;
  total: number;
  byStatus: Record<string, number>;
  endCustomer: { total: number; open: number };
  audienceTracked: boolean;
};

export type C360Health = { latest: { score: number; trend: string; factors: unknown; computedAt: string } | null; history: Array<{ score: number; computedAt: string }> };

export type C360Ai = {
  usage: Array<{ id: string; month: string; model: string; feature: string; requestCount: number; tokenCount: number; costUsd: number }>;
  runs: Array<{ id: string; agentType: string; status: string; stage: string | null; scannedCount: number; flaggedCount: number; proposedCount: number; durationMs: number | null; createdAt: string }>;
  runCount: number;
  limit: { monthlyBudgetUsd: number | null; flashRequestLimit: number | null; proRequestLimit: number | null; featuresEnabled: string[] } | null;
};

export type C360Audit = {
  tenantAudit: Array<{ id: string; action: string; actorType: string; actorId: string | null; resourceType: string | null; resourceId: string | null; timestamp: string }>;
  nextCursor: string | null;
  platformAudit: Array<{ id: string; action: string; actorEmail: string | null; reason: string | null; createdAt: string }>;
};

export type C360People = {
  users: Array<{ id: string; email: string; firstName: string | null; lastName: string | null; role: string; isActive: boolean; mfaEnabled: boolean; lastLogin: string | null; invitedBy: string | null; createdAt: string }>;
  total: number;
};

export type C360Config = {
  general: Record<string, string | boolean | null>;
  branding: Record<string, string | null>;
  domains: Record<string, string | null>;
  notifications: Record<string, string | boolean | string[] | null> | null;
  payments: { gateway: string; gatewayKeyConfigured: boolean; currency: string } | null;
  apiKeys: Array<{ id: string; name: string | null; keyPrefix: string; scopes: string[]; isActive: boolean; isSandbox: boolean; createdAt: string; lastUsedAt: string | null; expiresAt: string | null }>;
  webhooks: Array<{ id: string; url: string; events: string[]; isActive: boolean; createdAt: string; failuresLast30Days: number }>;
  legacyWebhook: { url: string | null; secretConfigured: boolean } | null;
};

export type C360Notes = { internalNotes: string; editPath: string };

type TabData = {
  summary: C360Summary;
  usage: C360Usage;
  billing: C360Billing;
  tickets: C360Tickets;
  health: C360Health;
  ai: C360Ai;
  audit: C360Audit;
  people: C360People;
  config: C360Config;
  notes: C360Notes;
};

export const C360_KEY = ["customer.360"] as const;

export function useC360<K extends keyof TabData>(tenantId: string, resource: K, enabled = true) {
  return useQuery({
    queryKey: [...C360_KEY, resource, tenantId],
    queryFn: async () => (await internalApi.get<TabData[K]>(`/customer360/${encodeURIComponent(tenantId)}/${resource}`)).data,
    enabled: enabled && tenantId.length > 0
  });
}
