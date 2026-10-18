import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { PageShell } from "@/layouts/PageShell";
import { apiErrorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS, useCreateFauwardTicket, useFauwardTickets } from "./api";

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}

/** Help → Contact Fauward support: this workspace's tickets with Fauward (L1). */
export function HelpTicketsPage() {
  const navigate = useNavigate();
  const tenant = useTenantStore((state) => state.tenant);
  const tickets = useFauwardTickets();
  const create = useCreateFauwardTicket();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [priority, setPriority] = useState("NORMAL");
  const [body, setBody] = useState("");

  const submit = () =>
    create.mutate(
      { subject: subject.trim(), category, priority, body: body.trim() },
      {
        onSuccess: (ticket) => {
          setOpen(false);
          setSubject("");
          setBody("");
          navigate(`/help/tickets/${ticket.id}`);
        }
      }
    );

  return (
    <PageShell
      title="Contact Fauward support"
      description="Questions about your workspace, billing or the platform. Fauward Support replies here and by email."
      actions={<Button onClick={() => setOpen(true)}>New request</Button>}
    >
      {tickets.isError ? (
        <ErrorState title="Your requests could not be loaded" description={apiErrorMessage(tickets.error, "The support service returned an error.")} onRetry={() => void tickets.refetch()} />
      ) : !tickets.data ? (
        <Skeleton className="h-40 w-full" />
      ) : tickets.data.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No requests yet" description="Open a request and Fauward Support will reply here." ctaLabel="New request" onCtaClick={() => setOpen(true)} />
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {tickets.data.map((ticket) => (
            <li key={ticket.id} data-testid="fauward-ticket-row">
              <Link to={`/help/tickets/${ticket.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-900">{ticket.subject}</span>
                  <span className="block font-mono text-xs text-gray-500">{ticket.ticketNumber}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  {ticket.awaitingYou ? <Badge variant="warning">Fauward replied</Badge> : null}
                  <Badge variant="neutral">{statusLabel(ticket.status)}</Badge>
                  {ticket.lastMessageAt ? formatDateTime(ticket.lastMessageAt, tenant) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen} title="New request to Fauward" description="Describe what you need. Include tracking or invoice numbers if they are involved.">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Subject
            <Input className="mt-1" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Topic
              <Select className="mt-1" value={category} onValueChange={setCategory} options={CATEGORY_OPTIONS} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Priority
              <Select className="mt-1" value={priority} onValueChange={setPriority} options={PRIORITY_OPTIONS} />
            </label>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            Details
            <Textarea className="mt-1" rows={6} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          {create.isError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {apiErrorMessage(create.error, "The request was not sent.")} Your text is kept so you can try again.
            </p>
          ) : null}
          <Button className="w-full" onClick={submit} loading={create.isPending} disabled={create.isPending || subject.trim().length < 3 || body.trim().length < 10}>
            Send to Fauward
          </Button>
        </div>
      </Dialog>
    </PageShell>
  );
}
