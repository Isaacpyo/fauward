import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { PageShell } from "@/layouts/PageShell";
import { apiErrorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import { useFauwardTicket, useReplyToFauward } from "./api";

/** One request to Fauward: the thread (Fauward replies read as "Fauward Support") and the reply box. */
export function HelpTicketDetailPage() {
  const { id = "" } = useParams();
  const tenant = useTenantStore((state) => state.tenant);
  const detail = useFauwardTicket(id);
  const reply = useReplyToFauward(id);
  const [body, setBody] = useState("");

  if (detail.isError) {
    return (
      <PageShell title="Request">
        <ErrorState title="This request could not be loaded" description={apiErrorMessage(detail.error, "The support service returned an error.")} onRetry={() => void detail.refetch()} />
      </PageShell>
    );
  }
  if (!detail.data) {
    return (
      <PageShell title="Request">
        <Skeleton className="h-64 w-full" />
      </PageShell>
    );
  }

  const { ticket, messages } = detail.data;
  const closed = ticket.status === "CLOSED";
  return (
    <PageShell title={ticket.subject} description={`${ticket.ticketNumber} · ${ticket.status.replace(/_/g, " ").toLowerCase()}`} actions={<Link to="/help/tickets" className="text-sm font-semibold text-[var(--tenant-primary)] hover:underline">All requests</Link>}>
      <div className="space-y-4">
        {ticket.linkedTicket ? (
          <p className="text-sm text-gray-600">
            Escalated from your customer ticket{" "}
            <Link to={`/support/${ticket.linkedTicket.id}`} className="font-mono text-[var(--tenant-primary)] hover:underline">
              {ticket.linkedTicket.ticketNumber}
            </Link>
          </p>
        ) : null}
        <ol className="space-y-3">
          {messages.map((message) => (
            <li key={message.id} data-testid="fauward-ticket-message" className={`rounded-lg border p-4 text-sm ${message.authorType === "STAFF" ? "border-blue-100 bg-blue-50" : "border-gray-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                <span className="font-semibold text-gray-900">{message.authorLabel}</span>
                <span>
                  {message.visibility === "TENANT_INTERNAL" ? <Badge variant="warning" className="mr-2">Internal note</Badge> : null}
                  {formatDateTime(message.createdAt, tenant)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-gray-800">{message.body}</p>
            </li>
          ))}
        </ol>
        {closed ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">This request is closed. Open a new request if you need more help.</p>
        ) : (
          <section className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
            <label className="block text-sm font-medium text-gray-700">
              Reply to Fauward Support
              <Textarea className="mt-1" rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
            </label>
            {ticket.status === "RESOLVED" ? <p className="text-xs text-gray-500">Replying reopens this request.</p> : null}
            {reply.isError ? (
              <p className="text-sm text-red-700" role="alert">
                {apiErrorMessage(reply.error, "The reply was not sent.")}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={() => reply.mutate(body.trim(), { onSuccess: () => setBody("") })} loading={reply.isPending} disabled={!body.trim() || reply.isPending}>
                Send reply
              </Button>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
