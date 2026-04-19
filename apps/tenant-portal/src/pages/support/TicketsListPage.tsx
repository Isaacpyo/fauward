import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { useAppStore } from "@/stores/useAppStore";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { fallbackTickets, listDraftTickets, saveDraftTicket, type Ticket, type TicketDetail } from "@/pages/support/supportData";

async function fetchTickets(filters: Record<string, string>) {
  const query = new URLSearchParams(filters).toString();
  const response = await api.get<{ tickets: Ticket[] }>(`/v1/support/tickets?${query}`);
  return response.data.tickets;
}

export function TicketsListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addToast = useAppStore((state) => state.addToast);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [draftTickets, setDraftTickets] = useState<Ticket[]>(() => listDraftTickets());
  const [createOpen, setCreateOpen] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("DELIVERY_ISSUE");
  const [priorityDraft, setPriorityDraft] = useState("NORMAL");
  const [messageDraft, setMessageDraft] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const ticketsQuery = useQuery({
    queryKey: ["support-tickets", debouncedSearch, status, priority, category],
    queryFn: () =>
      fetchTickets({
        search: debouncedSearch,
        status,
        priority,
        category
      }),
    refetchInterval: 60_000
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const fallbackTicket: TicketDetail = {
        id: `draft-${crypto.randomUUID()}`,
        ticketNumber: `SUP-${Math.floor(10000 + Math.random() * 89999)}`,
        subject: subjectDraft.trim(),
        category: categoryDraft,
        priority: priorityDraft,
        status: "OPEN",
        messages: [
          {
            id: `msg-${crypto.randomUUID()}`,
            body: messageDraft.trim(),
            isInternal: false,
            createdAt: new Date().toISOString(),
            author: {
              email: "admin@fauward.com",
              role: "TENANT_ADMIN"
            }
          }
        ]
      };

      try {
        const response = await api.post<TicketDetail | { ticket: TicketDetail }>("/v1/support/tickets", {
          subject: subjectDraft.trim(),
          category: categoryDraft,
          priority: priorityDraft,
          body: messageDraft.trim()
        });

        const ticket = "ticket" in response.data ? response.data.ticket : response.data;
        return { ticket, localOnly: false };
      } catch {
        saveDraftTicket(fallbackTicket);
        return { ticket: fallbackTicket, localOnly: true };
      }
    },
    onSuccess: async ({ ticket, localOnly }) => {
      setCreateOpen(false);
      setSubjectDraft("");
      setCategoryDraft("DELIVERY_ISSUE");
      setPriorityDraft("NORMAL");
      setMessageDraft("");

      if (localOnly) {
        setDraftTickets(listDraftTickets());
        addToast({
          title: "Support ticket created",
          description: "Saved locally for this demo session.",
          variant: "success"
        });
      } else {
        await queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      }

      navigate(`/support/${ticket.id}`);
    }
  });

  const tickets = ticketsQuery.data ?? fallbackTickets;
  const display = useMemo(() => {
    const merged = [...draftTickets, ...tickets];
    const matches = merged.filter((ticket) => {
      const searchable = [
        ticket.ticketNumber,
        ticket.subject,
        ticket.customer?.email,
        ticket.customer?.firstName,
        ticket.customer?.lastName
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const searchMatch = !debouncedSearch || searchable.includes(debouncedSearch.toLowerCase());
      const statusMatch = !status || ticket.status === status;
      const priorityMatch = !priority || ticket.priority === priority;
      const categoryMatch = !category || ticket.category === category;
      return searchMatch && statusMatch && priorityMatch && categoryMatch;
    });

    return matches;
  }, [category, debouncedSearch, draftTickets, priority, status, tickets]);

  return (
    <PageShell
      title="Support Tickets"
      description="Ticket inbox for customer and operations support conversations."
      actions={
        <Button onClick={() => setCreateOpen(true)}>
          Create Support Ticket
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ticket, subject, customer..."
          />
          <Select
            value={status}
            onValueChange={setStatus}
            options={[
              { label: "All statuses", value: "" },
              { label: "Open", value: "OPEN" },
              { label: "In progress", value: "IN_PROGRESS" },
              { label: "Waiting customer", value: "WAITING_CUSTOMER" },
              { label: "Resolved", value: "RESOLVED" },
              { label: "Closed", value: "CLOSED" }
            ]}
          />
          <Select
            value={priority}
            onValueChange={setPriority}
            options={[
              { label: "All priorities", value: "" },
              { label: "Low", value: "LOW" },
              { label: "Normal", value: "NORMAL" },
              { label: "High", value: "HIGH" },
              { label: "Urgent", value: "URGENT" }
            ]}
          />
          <Select
            value={category}
            onValueChange={setCategory}
            options={[
              { label: "All categories", value: "" },
              { label: "Delivery issue", value: "DELIVERY_ISSUE" },
              { label: "Payment issue", value: "PAYMENT_ISSUE" },
              { label: "Tracking issue", value: "TRACKING_ISSUE" },
              { label: "Return request", value: "RETURN_REQUEST" },
              { label: "Other", value: "OTHER" }
            ]}
          />
        </div>

        <Table columns={["Ticket", "Subject", "Customer", "Category", "Priority", "Status", "Assigned", "Created", "More info"]}>
          {display.map((ticket) => (
            <TableRow key={ticket.id} onClick={() => navigate(`/support/${ticket.id}`)}>
              <TableCell>
                <Link
                  to={`/support/${ticket.id}`}
                  className="font-mono text-[var(--tenant-primary)] hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {ticket.ticketNumber}
                </Link>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <p className="font-medium text-gray-900">{ticket.subject}</p>
                  <Link
                    to={`/support/${ticket.id}`}
                    className="text-xs font-semibold text-[var(--tenant-primary)] hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    View full conversation
                  </Link>
                </div>
              </TableCell>
              <TableCell>
                {[ticket.customer?.firstName, ticket.customer?.lastName].filter(Boolean).join(" ") ||
                  ticket.customer?.email ||
                  "N/A"}
              </TableCell>
              <TableCell>{ticket.category}</TableCell>
              <TableCell>
                <Badge variant="warning">{ticket.priority}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="neutral">{ticket.status}</Badge>
              </TableCell>
              <TableCell>
                {[ticket.assignee?.firstName, ticket.assignee?.lastName].filter(Boolean).join(" ") ||
                  ticket.assignee?.email ||
                  "Unassigned"}
              </TableCell>
              <TableCell>{new Date(ticket.createdAt).toLocaleString()}</TableCell>
              <TableCell>
                <Link
                  to={`/support/${ticket.id}`}
                  className="text-sm font-semibold text-[var(--tenant-primary)] hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  More info
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Support Ticket"
        description="Open a new customer or operations support thread."
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Subject
            <Input
              value={subjectDraft}
              onChange={(event) => setSubjectDraft(event.target.value)}
              placeholder="Short summary of the issue"
              className="mt-2"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Category
              <Select
                value={categoryDraft}
                onValueChange={setCategoryDraft}
                options={[
                  { label: "Delivery issue", value: "DELIVERY_ISSUE" },
                  { label: "Payment issue", value: "PAYMENT_ISSUE" },
                  { label: "Tracking issue", value: "TRACKING_ISSUE" },
                  { label: "Return request", value: "RETURN_REQUEST" },
                  { label: "Other", value: "OTHER" }
                ]}
                className="mt-2"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Priority
              <Select
                value={priorityDraft}
                onValueChange={setPriorityDraft}
                options={[
                  { label: "Low", value: "LOW" },
                  { label: "Normal", value: "NORMAL" },
                  { label: "High", value: "HIGH" },
                  { label: "Urgent", value: "URGENT" }
                ]}
                className="mt-2"
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Initial message
            <Textarea
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder="Describe the issue, shipment, customer impact, and any next step needed."
              rows={5}
              className="mt-2"
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTicket.mutate()}
              disabled={!subjectDraft.trim() || !messageDraft.trim()}
              loading={createTicket.isPending}
            >
              Create ticket
            </Button>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}
