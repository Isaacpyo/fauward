import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

// L15 (WP-2.11): the workspace's exception cases. Staff can escalate one to Fauward with a reason; Fauward's replies
// and the escalation status show here (the escalating user and admins are also notified in-app and by email).

export type TenantException = {
  id: string;
  type: string;
  severity: string;
  status: string;
  notes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  shipment: { id: string; trackingNumber: string } | null;
  escalation: {
    state: "NOT_ESCALATED" | "OPEN" | "RESOLVED";
    escalatedAt: string | null;
    reason: string | null;
    resolvedAt: string | null;
    replies: Array<{ id: string; author: string; body: string; createdAt: string }>;
  };
};

const KEY = ["tenant", "exceptions"];
const MIN_REASON = 10;

const ESCALATION_LABEL: Record<TenantException["escalation"]["state"], string> = {
  NOT_ESCALATED: "Not escalated",
  OPEN: "Escalated to Fauward",
  RESOLVED: "Fauward resolved it"
};

function EscalateDialog({ exception, onClose }: { exception: TenantException | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const escalate = useMutation({
    mutationFn: async (input: { id: string; reason: string }) => (await api.post<TenantException>(`/v1/tenant/exceptions/${encodeURIComponent(input.id)}/escalate`, { reason: input.reason })).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KEY });
      setReason("");
      onClose();
    }
  });
  const close = (open: boolean) => {
    if (open) return;
    escalate.reset();
    setReason("");
    onClose();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (exception && reason.trim().length >= MIN_REASON) escalate.mutate({ id: exception.id, reason: reason.trim() });
  };
  return (
    <Dialog open={exception !== null} onOpenChange={close} title="Escalate to Fauward" description="Fauward operations staff see this at once. Their replies appear on this page and are emailed to you.">
      <form className="space-y-3" onSubmit={submit}>
        <Textarea aria-label="Reason" placeholder="What is wrong and what do you need from Fauward?" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
        <p className="text-xs text-gray-500">At least {MIN_REASON} characters.</p>
        {escalate.isError ? <p className="text-sm text-red-700">{apiErrorMessage(escalate.error, "The escalation could not be sent.")}</p> : null}
        <Button type="submit" loading={escalate.isPending} disabled={escalate.isPending || reason.trim().length < MIN_REASON}>
          Escalate
        </Button>
      </form>
    </Dialog>
  );
}

export function ExceptionsPage() {
  const [params] = useSearchParams();
  const highlighted = params.get("id");
  const exceptions = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ data: TenantException[] }>("/v1/tenant/exceptions")).data.data });
  const [escalating, setEscalating] = useState<TenantException | null>(null);
  const rows = exceptions.data ?? [];

  return (
    <PageShell title="Exceptions" description="Shipment exceptions in your workspace. Escalate one to Fauward when you need help.">
      {exceptions.isError ? <ErrorState title="Exceptions could not be loaded" description={apiErrorMessage(exceptions.error, "The exceptions service returned an error.")} onRetry={() => void exceptions.refetch()} /> : null}
      {exceptions.isLoading ? <p className="text-sm text-gray-500">Loading exceptions…</p> : null}
      {exceptions.isSuccess && rows.length === 0 ? <p className="text-sm text-gray-500">No exceptions. Stuck or failed shipments appear here.</p> : null}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} data-testid="exception-row" className={`rounded-lg border bg-white p-4 text-sm ${row.id === highlighted ? "border-amber-400" : "border-gray-200"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-gray-900">
                {row.type}
                {row.shipment ? ` · ${row.shipment.trackingNumber}` : ""}
              </p>
              <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">{ESCALATION_LABEL[row.escalation.state]}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {row.severity} · {row.status} · opened {new Date(row.createdAt).toLocaleString()}
            </p>
            {row.escalation.reason ? <p className="mt-2 text-gray-700">Your escalation: {row.escalation.reason}</p> : null}
            {row.escalation.replies.length > 0 ? (
              <ul className="mt-3 space-y-2 border-t border-gray-100 pt-2">
                {row.escalation.replies.map((reply) => (
                  <li key={reply.id} data-testid="exception-reply" className="rounded-md bg-gray-50 p-2">
                    <p className="text-xs font-semibold text-gray-600">
                      {reply.author} · {new Date(reply.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{reply.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {row.escalation.state !== "OPEN" ? (
              <Button variant="secondary" className="mt-3" onClick={() => setEscalating(row)}>
                {row.escalation.state === "RESOLVED" ? "Escalate again" : "Escalate to Fauward"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <EscalateDialog exception={escalating} onClose={() => setEscalating(null)} />
    </PageShell>
  );
}
