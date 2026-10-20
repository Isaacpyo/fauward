import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// customer.support — Fauward Support Desk (D5, WP-2.3). PLATFORM tickets only; tenants reply through the portal.

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type TicketCategory = "DELIVERY_ISSUE" | "PAYMENT_ISSUE" | "DAMAGED_GOODS" | "WRONG_ADDRESS" | "TRACKING_ISSUE" | "RETURN_REQUEST" | "BILLING_QUERY" | "OTHER";
export type AuthorType = "TENANT_USER" | "END_CUSTOMER" | "STAFF" | "SYSTEM";
export type Visibility = "PUBLIC" | "TENANT_INTERNAL" | "STAFF_INTERNAL";

export const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"];
export const PRIORITIES: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
export const CATEGORIES: TicketCategory[] = ["DELIVERY_ISSUE", "PAYMENT_ISSUE", "DAMAGED_GOODS", "WRONG_ADDRESS", "TRACKING_ISSUE", "RETURN_REQUEST", "BILLING_QUERY", "OTHER"];

export type SupportTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  tenant: { id: string; name: string; slug: string };
  assignee: { id: string; email: string; name: string | null } | null;
  lastMessageAt: string | null;
  lastMessageAuthorType: AuthorType | null;
  firstResponseAt: string | null;
  slaBreachedAt: string | null;
  slaBreach: "FIRST_RESPONSE" | "RESOLUTION" | null;
  linkedTicketId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type TicketMessage = { id: string; authorType: AuthorType; authorLabel: string; visibility: Visibility; body: string; createdAt: string };

export type TicketDetail = {
  ticket: SupportTicket;
  requester: { id: string; email: string; firstName: string | null; lastName: string | null; role: string } | null;
  messages: TicketMessage[];
  linkedTicket: { id: string; ticketNumber: string; subject: string; audience: "END_CUSTOMER" | "PLATFORM"; status: TicketStatus; messages: TicketMessage[] } | null;
};

export type TicketFilters = { status?: string; priority?: TicketPriority; assignee?: string; tenantId?: string; breached?: "true"; q?: string };

export type Macro = { id: string; title: string; body: string };
export type SlaView = {
  targets: Array<{ priority: TicketPriority; firstResponseMinutes: number; resolutionMinutes: number }>;
  openTickets: number;
  breaches: SupportTicket[];
};

export const SUPPORT_KEY = ["customer.support"] as const;

export function useTickets(filters: TicketFilters) {
  return useInfiniteQuery({
    queryKey: [...SUPPORT_KEY, "tickets", filters],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<{ data: SupportTicket[]; total: number; nextCursor: string | null }>("/support/tickets", { params: { ...filters, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: [...SUPPORT_KEY, "ticket", id],
    queryFn: async () => (await consoleApi.get<TicketDetail>(`/support/tickets/${encodeURIComponent(id)}`)).data,
    enabled: id.length > 0
  });
}

export function useMacros() {
  return useQuery({ queryKey: [...SUPPORT_KEY, "macros"], queryFn: async () => (await consoleApi.get<{ data: Macro[] }>("/support/macros")).data.data, staleTime: 5 * 60_000 });
}

export function useSla() {
  return useQuery({ queryKey: [...SUPPORT_KEY, "sla"], queryFn: async () => (await consoleApi.get<SlaView>("/support/sla")).data, refetchInterval: 60_000 });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SUPPORT_KEY });
}

export function useUpdateTicket(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (patch: { status?: TicketStatus; priority?: TicketPriority; category?: TicketCategory; assignedPlatformUserId?: string | null }) =>
      (await consoleApi.patch<{ ticket: SupportTicket }>(`/support/tickets/${encodeURIComponent(id)}`, patch)).data,
    onSuccess: invalidate
  });
}

export function useReply(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { body: string; visibility: "PUBLIC" | "STAFF_INTERNAL" }) =>
      (await consoleApi.post<{ message: TicketMessage; ticket: SupportTicket }>(`/support/tickets/${encodeURIComponent(id)}/messages`, input)).data,
    onSuccess: invalidate
  });
}

export function useCreateTicket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { tenantId: string; subject: string; category: TicketCategory; priority: TicketPriority; body: string }) =>
      (await consoleApi.post<{ ticket: SupportTicket }>("/support/tickets", input)).data,
    onSuccess: invalidate
  });
}

export function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}
