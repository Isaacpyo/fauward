import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
  assignee?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
};

async function fetchTickets(filters: Record<string, string>) {
  const query = new URLSearchParams(filters).toString();
  const response = await api.get<{ tickets: Ticket[] }>(`/v1/support/tickets?${query}`);
  return response.data.tickets;
}

export function TicketsListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
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

  const tickets = ticketsQuery.data ?? [];
  const display = useMemo(() => tickets, [tickets]);

  return (
    <PageShell title="Support Tickets" description="Ticket inbox for customer and operations support conversations.">
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

        <Table columns={["Ticket", "Subject", "Customer", "Category", "Priority", "Status", "Assigned", "Created"]}>
          {display.map((ticket) => (
            <TableRow key={ticket.id}>
              <TableCell>
                <Link to={`/support/${ticket.id}`} className="font-mono text-[var(--tenant-primary)] hover:underline">
                  {ticket.ticketNumber}
                </Link>
              </TableCell>
              <TableCell>{ticket.subject}</TableCell>
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
            </TableRow>
          ))}
        </Table>
      </div>
    </PageShell>
  );
}

