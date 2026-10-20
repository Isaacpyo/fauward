import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

// "Contact Fauward support" (L1, WP-2.3): the workspace's tickets with Fauward (PLATFORM audience).

export type FauwardTicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";

export type FauwardTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: FauwardTicketStatus;
  lastMessageAt: string | null;
  lastMessageAuthorType: string | null;
  awaitingYou: boolean;
  linkedTicketId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type FauwardTicketMessage = { id: string; authorType: string; authorLabel: string; visibility: string; body: string; createdAt: string };

export const CATEGORY_OPTIONS = [
  { label: "Billing question", value: "BILLING_QUERY" },
  { label: "Delivery or tracking problem", value: "TRACKING_ISSUE" },
  { label: "Payments", value: "PAYMENT_ISSUE" },
  { label: "Something else", value: "OTHER" }
];

export const PRIORITY_OPTIONS = [
  { label: "Low", value: "LOW" },
  { label: "Normal", value: "NORMAL" },
  { label: "High", value: "HIGH" },
  { label: "Urgent — operations are blocked", value: "URGENT" }
];

const KEY = ["fauward-tickets"] as const;

export function useFauwardTickets() {
  return useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ tickets: FauwardTicket[] }>("/v1/tenants/me/fauward-tickets")).data.tickets });
}

export function useFauwardTicket(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async () =>
      (await api.get<{ ticket: FauwardTicket & { linkedTicket: { id: string; ticketNumber: string; subject: string } | null }; messages: FauwardTicketMessage[] }>(`/v1/tenants/me/fauward-tickets/${id}`)).data,
    enabled: id.length > 0,
    refetchInterval: 60_000
  });
}

export function useCreateFauwardTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { subject: string; category: string; priority: string; body: string }) =>
      (await api.post<{ ticket: FauwardTicket }>("/v1/tenants/me/fauward-tickets", input)).data.ticket,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
}

export function useReplyToFauward(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => (await api.post(`/v1/tenants/me/fauward-tickets/${id}/messages`, { body })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
}
