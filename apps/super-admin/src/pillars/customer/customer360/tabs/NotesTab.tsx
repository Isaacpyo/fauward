import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { updateCustomerNotes, type Customer360 } from "../api";
export default function NotesTab({ data }: { data: Customer360 }) {
  const [notes, setNotes] = useState(data.tenant.internalNotes ?? "");
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: () => updateCustomerNotes(data.tenant.id, notes), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customer-360", data.tenant.id] }) });
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Internal CS notes</h2><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-3 min-h-56 w-full rounded-md border border-[var(--color-border)] p-3 text-sm" /><button type="button" className="mt-3 rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white" onClick={() => mutation.mutate()}>Save notes</button></section>;
}
