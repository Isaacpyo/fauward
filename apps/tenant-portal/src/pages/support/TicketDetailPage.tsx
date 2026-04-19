import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { findTicketDetail, type TicketDetail } from "@/pages/support/supportData";

async function fetchTicket(id: string) {
  const response = await api.get<TicketDetail>(`/v1/support/tickets/${id}`);
  return response.data;
}

export function TicketDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState("false");
  const [status, setStatus] = useState("");

  const query = useQuery({
    queryKey: ["ticket-detail", id],
    queryFn: () => fetchTicket(id),
    retry: false
  });

  const messageMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/v1/support/tickets/${id}/messages`, {
        body,
        isInternal: internal === "true"
      });
    },
    onSuccess: async () => {
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/v1/support/tickets/${id}`, { status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
    }
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/v1/support/tickets/${id}/resolve`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
    }
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/v1/support/tickets/${id}/close`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
    }
  });

  const ticket = query.data ?? findTicketDetail(id);

  return (
    <PageShell
      title={`Ticket ${ticket?.ticketNumber ?? id}`}
      description={ticket?.subject ?? "Support conversation thread"}
      state={query.isLoading && !ticket ? "loading" : query.isError && !ticket ? "error" : "ready"}
      onRetry={() => query.refetch()}
    >
      {ticket ? (
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{ticket.status}</Badge>
              <Badge variant="warning">{ticket.priority}</Badge>
              <Badge variant="neutral">{ticket.category}</Badge>
            </div>
            <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3">
              {ticket.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-md border p-3 text-sm ${
                    message.isInternal ? "border-yellow-200 bg-yellow-50" : "border-gray-200 bg-white"
                  }`}
                >
                  <p className="font-medium text-gray-900">
                    {[message.author.firstName, message.author.lastName].filter(Boolean).join(" ") || message.author.email}
                  </p>
                  <p className="mt-1 text-gray-700">{message.body}</p>
                  <p className="mt-1 text-xs text-gray-500">{new Date(message.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>

            <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a reply..." rows={4} />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={internal}
                onValueChange={setInternal}
                options={[
                  { label: "Customer reply", value: "false" },
                  { label: "Internal note", value: "true" }
                ]}
                className="w-[200px]"
              />
              <Button disabled={!body.trim()} onClick={() => messageMutation.mutate()}>
                Send
              </Button>
            </div>
          </div>

          <aside className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Ticket controls</h3>
            <Select
              value={status}
              onValueChange={setStatus}
              options={[
                { label: "OPEN", value: "OPEN" },
                { label: "IN_PROGRESS", value: "IN_PROGRESS" },
                { label: "WAITING_CUSTOMER", value: "WAITING_CUSTOMER" },
                { label: "RESOLVED", value: "RESOLVED" },
                { label: "CLOSED", value: "CLOSED" }
              ]}
            />
            <Button variant="secondary" disabled={!status} onClick={() => updateMutation.mutate()}>
              Update status
            </Button>
            <Button variant="secondary" onClick={() => resolveMutation.mutate()}>
              Mark resolved
            </Button>
            <Button variant="secondary" onClick={() => closeMutation.mutate()}>
              Close ticket
            </Button>
          </aside>
        </div>
      ) : null}
    </PageShell>
  );
}
