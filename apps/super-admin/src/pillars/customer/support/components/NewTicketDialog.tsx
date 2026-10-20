import { useEffect, useState } from "react";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { CATEGORIES, PRIORITIES, type TicketCategory, type TicketPriority, label, useCreateTicket } from "../api";

const field = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";

/** Staff open a PLATFORM ticket for a tenant (proactive outreach); the tenant sees it under Help → Contact Fauward. */
export function NewTicketDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateTicket();
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("OTHER");
  const [priority, setPriority] = useState<TicketPriority>("NORMAL");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) {
      setTenant(null);
      setSubject("");
      setCategory("OTHER");
      setPriority("NORMAL");
      setBody("");
    }
  }, [open]);

  return (
    <ActionDialog
      open={open}
      title="New ticket"
      description="Opens a ticket with the tenant. Your first message is sent to its admins by in-app notification and email."
      confirmLabel="Open ticket"
      validate={() => {
        if (!tenant) return "Choose a tenant.";
        if (subject.trim().length < 3) return "Add a subject.";
        if (body.trim().length < 10) return "Write the first message (at least 10 characters).";
        return null;
      }}
      onSubmit={async () => {
        const result = await create.mutateAsync({ tenantId: tenant!.id, subject: subject.trim(), category, priority, body: body.trim() });
        onCreated(result.ticket.id);
      }}
      onClose={onClose}
    >
      {tenant ? (
        <p className="text-sm">
          Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />{" "}
          <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline" onClick={() => setTenant(null)}>
            Change
          </button>
        </p>
      ) : (
        <TenantPicker label="Tenant" onSelect={setTenant} />
      )}
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Subject
        <input value={subject} onChange={(event) => setSubject(event.target.value)} className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)} className={field}>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)} className={field}>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Message to the tenant
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} className={field} />
      </label>
    </ActionDialog>
  );
}
