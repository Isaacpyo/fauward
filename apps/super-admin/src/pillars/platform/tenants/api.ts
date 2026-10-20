import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";
import { ME_QUERY_KEY } from "@/lib/use-me";

// platform.tenants (WP-1.2): typed hooks over /api/internal/tenants. Query keys are [service, resource, params].

export type TenantPlan = "STARTER" | "PRO" | "ENTERPRISE" | "TRIALING";
export type TenantStatus = "TRIALING" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "DEMO";
export type Money = { amount: string; currency: string; source?: string; note?: string };

export type TenantListRow = {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  plan: TenantPlan;
  effectivePlan: TenantPlan;
  status: TenantStatus;
  region: string;
  createdAt: string;
  closedAt: string | null;
  mrrContribution: Money;
  shipmentsThisMonth: number;
  staffCount: number;
  healthScore: number | null;
};

export type TenantListResponse = { data: TenantListRow[]; total: number; nextCursor: string | null };

export type TenantListFilters = {
  search?: string;
  plan?: TenantPlan;
  effectivePlan?: TenantPlan;
  status?: TenantStatus;
  region?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: "createdAt" | "name";
  order?: "asc" | "desc";
};

export type SuspensionRecord = {
  id: string;
  tenantId: string;
  reason: string;
  publicReason: string | null;
  source: string;
  category: string;
  sourceRef: string | null;
  suspendedBy: string;
  liftedBy: string | null;
  liftedVia: string | null;
  liftReason: string | null;
  status: "ACTIVE" | "LIFTED";
  createdAt: string;
  liftedAt: string | null;
};

export type FeatureOverride = {
  id: string;
  featureKey: string;
  enabled: boolean;
  reason: string;
  expiresAt: string | null;
  createdByPlatformUserId: string;
  revokedAt: string | null;
  createdAt: string;
};

export type TenantDetail = {
  identity: {
    id: string;
    name: string;
    slug: string;
    customDomain: string | null;
    customDomainStatus: string;
    region: string;
    status: TenantStatus;
    kycStatus: string;
    createdAt: string;
    suspendedAt: string | null;
    suspensionReason: string | null;
    closedAt: string | null;
    closedReason: string | null;
    purgeAfter: string | null;
    internalNotes: string | null;
    defaultCurrency: string;
    timezone: string;
  };
  branding: { logoUrl: string | null; primaryColor: string; accentColor: string; brandName: string | null };
  plan: { billingPlan: TenantPlan; effectivePlan: TenantPlan; planOverride: { id: string; plan: TenantPlan; reason: string; expiresAt: string | null } | null };
  entitlements: {
    features: Record<string, { enabled: boolean; source: "plan" | "override"; overrideId?: string; expiresAt?: string | null }>;
    limits: { maxStaff: number; maxShipmentsPm: number; maxOrganisations: number; apiRateLimit: number };
    limitsSource: "plan" | "tenant";
  };
  limitColumns: { maxStaff: number; maxShipmentsPm: number; maxOrganisations: number; limitsOverriddenAt: string | null };
  featureOverrides: FeatureOverride[];
  suspensions: { active: SuspensionRecord[]; history: SuspensionRecord[] };
  region: { current: string; pendingRequest: { id: string; requestedRegion: string; requestedBy: string; createdAt: string } | null };
  usage: Array<{ month: string; shipments: number; apiCalls: number; smsSent: number; emailsSent: number }>;
  staff: { count: number; admins: Array<{ id: string; email: string; name: string | null; lastLoginAt: string | null }>; lastLoginAt: string | null };
  subscription: { plan: string; billingCycle: string; status: string; currentPeriodEnd: string | null; trialEnd: string | null; cancelAtPeriodEnd: boolean; stripeLinked: boolean } | null;
  mrrContribution: Money;
  healthScore: { score: number; trend: string; computedAt: string } | null;
  impersonationSessions: Array<{
    id: string;
    staff: { id: string; email: string; name: string | null };
    scopes: string[];
    reason: string;
    createdAt: string;
    expiresAt: string;
    endedAt: string | null;
    endedReason: string | null;
  }>;
};

export type TenantUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLogin: string | null;
  createdAt: string;
};

export const TENANTS_KEY = ["platform.tenants"] as const;
const PAGE_SIZE = 25;

function cleanFilters(filters: TenantListFilters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ""));
}

/** Server-paginated directory (cursor, "Load more"). */
export function useTenantList(filters: TenantListFilters) {
  const params = cleanFilters(filters);
  return useInfiniteQuery({
    queryKey: [...TENANTS_KEY, "list", params],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<TenantListResponse>("/tenants", { params: { ...params, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData
  });
}

export function useTenantDetail(id: string) {
  return useQuery({
    queryKey: [...TENANTS_KEY, "detail", id],
    queryFn: async () => (await consoleApi.get<TenantDetail>(`/tenants/${encodeURIComponent(id)}`)).data,
    enabled: id.length > 0
  });
}

export function useTenantUsers(id: string, options: { activeOnly?: boolean; search?: string; enabled?: boolean } = {}) {
  const params = { ...(options.activeOnly ? { active: "true" } : {}), ...(options.search ? { search: options.search } : {}) };
  return useQuery({
    queryKey: [...TENANTS_KEY, "users", id, params],
    queryFn: async () => (await consoleApi.get<{ data: TenantUser[] }>(`/tenants/${encodeURIComponent(id)}/users`, { params })).data.data,
    enabled: (options.enabled ?? true) && id.length > 0
  });
}

export function useRegionRequests() {
  return useQuery({
    queryKey: [...TENANTS_KEY, "region-requests"],
    queryFn: async () => (await consoleApi.get<RegionRequestsResponse>("/tenants/region-requests")).data
  });
}

export type RegionRequest = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  currentRegion: string;
  requestedRegion: string;
  requestedBy: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  decisionReason?: string;
};
export type RegionRequestsResponse = { requests: RegionRequest[]; regions: Array<{ key: string; label: string; paymentProviders: string[] }> };

/** Invalidates everything the tenant pages show, plus /auth/me (some actions change what the caller sees). */
function useInvalidateTenant() {
  const queryClient = useQueryClient();
  return async (tenantId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...TENANTS_KEY, "list"] }),
      tenantId ? queryClient.invalidateQueries({ queryKey: [...TENANTS_KEY, "detail", tenantId] }) : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    ]);
  };
}

export type SuspendInput = { tenantId: string; category: string; reason: string; publicReason?: string };
export type SuspendResult = { suspension: SuspensionRecord; tenant: { id: string; status: TenantStatus; suspendedAt: string | null; suspensionReason: string | null } };

export function useSuspendTenant() {
  const invalidate = useInvalidateTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, ...body }: SuspendInput) => (await consoleApi.post<SuspendResult>(`/tenants/${encodeURIComponent(tenantId)}/suspend`, body, { idempotent: true })).data,
    onSuccess: async (result) => {
      // The row shows SUSPENDED at once (ACC-TEN-4), then the list refetches.
      queryClient.setQueriesData<{ pages: TenantListResponse[]; pageParams: unknown[] }>({ queryKey: [...TENANTS_KEY, "list"] }, (current) =>
        current
          ? { ...current, pages: current.pages.map((page) => ({ ...page, data: page.data.map((row) => (row.id === result.tenant.id ? { ...row, status: result.tenant.status } : row)) })) }
          : current
      );
      await invalidate(result.tenant.id);
    }
  });
}

export function useUnsuspendTenant() {
  const invalidate = useInvalidateTenant();
  return useMutation({
    mutationFn: async ({ tenantId, ...body }: { tenantId: string; suspensionId?: string; all?: boolean; reason: string }) =>
      (await consoleApi.post<{ lifted: SuspensionRecord[]; remaining: SuspensionRecord[]; tenant: { id: string; status: TenantStatus } }>(`/tenants/${encodeURIComponent(tenantId)}/unsuspend`, body, { idempotent: true })).data,
    onSuccess: async (result) => invalidate(result.tenant.id)
  });
}

export function useCreatePlanOverride() {
  const invalidate = useInvalidateTenant();
  return useMutation({
    mutationFn: async ({ tenantId, ...body }: { tenantId: string; plan: TenantPlan; reason: string; expiresAt?: string | null }) =>
      (await consoleApi.post<{ override: { id: string; plan: TenantPlan; expiresAt: string | null } }>(`/tenants/${encodeURIComponent(tenantId)}/plan-overrides`, body, { idempotent: true })).data,
    onSuccess: async (_result, variables) => invalidate(variables.tenantId)
  });
}

export function useRevokePlanOverride() {
  const invalidate = useInvalidateTenant();
  return useMutation({
    mutationFn: async ({ tenantId, overrideId, reason }: { tenantId: string; overrideId: string; reason: string }) =>
      (await consoleApi.delete(`/tenants/${encodeURIComponent(tenantId)}/plan-overrides/${encodeURIComponent(overrideId)}`, { data: { reason } })).data,
    onSuccess: async (_result, variables) => invalidate(variables.tenantId)
  });
}

export function useCreateFeatureOverride() {
  const invalidate = useInvalidateTenant();
  return useMutation({
    mutationFn: async ({ tenantId, ...body }: { tenantId: string; featureKey: string; enabled: boolean; reason: string; expiresAt?: string | null }) =>
      (await consoleApi.post<{ override: FeatureOverride }>(`/tenants/${encodeURIComponent(tenantId)}/feature-overrides`, body, { idempotent: true })).data,
    onSuccess: async (_result, variables) => invalidate(variables.tenantId)
  });
}

export function useRevokeFeatureOverride() {
  const invalidate = useInvalidateTenant();
  return useMutation({
    mutationFn: async ({ tenantId, overrideId, reason }: { tenantId: string; overrideId: string; reason: string }) =>
      (await consoleApi.delete(`/tenants/${encodeURIComponent(tenantId)}/feature-overrides/${encodeURIComponent(overrideId)}`, { data: { reason } })).data,
    onSuccess: async (_result, variables) => invalidate(variables.tenantId)
  });
}

export function useUpdateLimits() {
  const invalidate = useInvalidateTenant();
  return useMutation({
    mutationFn: async ({ tenantId, ...body }: { tenantId: string; maxStaff?: number; maxShipmentsPm?: number; maxOrganisations?: number; resetToPlan?: boolean; reason: string }) =>
      (await consoleApi.patch(`/tenants/${encodeURIComponent(tenantId)}/limits`, body, { idempotent: true })).data,
    onSuccess: async (_result, variables) => invalidate(variables.tenantId)
  });
}

export function useUpdateInternalNotes() {
  const invalidate = useInvalidateTenant();
  return useMutation({
    mutationFn: async ({ tenantId, internalNotes }: { tenantId: string; internalNotes: string }) =>
      (await consoleApi.patch<{ internalNotes: string }>(`/tenants/${encodeURIComponent(tenantId)}/internal-notes`, { internalNotes })).data,
    onSuccess: async (_result, variables) => invalidate(variables.tenantId)
  });
}

export type CloseResult = {
  tenant: { id: string; status: TenantStatus; closedAt: string; purgeAfter: string };
  stripe: { status: "CANCEL_AT_PERIOD_END" | "NOT_CONFIGURED" | "NO_SUBSCRIPTION" | "FAILED"; message?: string; subscriptionId?: string };
};

export function useCloseTenant() {
  const invalidate = useInvalidateTenant();
  return useMutation({
    mutationFn: async ({ tenantId, ...body }: { tenantId: string; reason: string; confirmSlug: string }) =>
      (await consoleApi.post<CloseResult>(`/tenants/${encodeURIComponent(tenantId)}/close`, body, { idempotent: true })).data,
    onSuccess: async (result) => invalidate(result.tenant.id)
  });
}

export function useDecideRegionRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: "APPROVED" | "REJECTED"; reason: string }) =>
      (await consoleApi.post<{ request: RegionRequest }>(`/tenants/region-requests/${encodeURIComponent(id)}/decision`, { status, reason }, { idempotent: true })).data,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: [...TENANTS_KEY, "region-requests"] })
  });
}
