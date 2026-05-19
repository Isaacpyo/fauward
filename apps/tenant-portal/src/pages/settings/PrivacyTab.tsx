import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

type DsarRequest = {
  id: string;
  requesterEmail: string;
  status: string;
  exportUrl?: string | null;
  createdAt: string;
  dueAt: string;
};

export function PrivacyTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ requesterName: "", requesterEmail: "", relation: "CUSTOMER", description: "" });
  const query = useQuery({
    queryKey: ["tenant-dsar"],
    queryFn: async () => (await api.get<{ requests: DsarRequest[] }>("/v1/tenants/me/dsar")).data.requests
  });
  const mutation = useMutation({
    mutationFn: async () => api.post("/v1/tenants/me/dsar", form),
    onSuccess: () => {
      setForm({ requesterName: "", requesterEmail: "", relation: "CUSTOMER", description: "" });
      void queryClient.invalidateQueries({ queryKey: ["tenant-dsar"] });
    }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="space-y-5">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
        <Input
          required
          placeholder="Requester name"
          value={form.requesterName}
          onChange={(event) => setForm((current) => ({ ...current, requesterName: event.target.value }))}
        />
        <Input
          required
          type="email"
          placeholder="Requester email"
          value={form.requesterEmail}
          onChange={(event) => setForm((current) => ({ ...current, requesterEmail: event.target.value }))}
        />
        <select
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
          value={form.relation}
          onChange={(event) => setForm((current) => ({ ...current, relation: event.target.value }))}
        >
          <option value="CUSTOMER">Customer</option>
          <option value="EMPLOYEE">Employee</option>
          <option value="OTHER">Other</option>
        </select>
        <div />
        <Textarea
          required
          className="md:col-span-2"
          placeholder="Describe the data subject access request"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
        />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Submitting..." : "New request"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Requester</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Export</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(query.data ?? []).map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">{item.requesterEmail}</td>
                <td className="px-3 py-2">{item.status}</td>
                <td className="px-3 py-2">{new Date(item.dueAt).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  {item.exportUrl ? <a className="font-semibold text-[var(--tenant-primary)] underline" href={item.exportUrl}>Download</a> : "-"}
                </td>
              </tr>
            ))}
            {!query.isLoading && (query.data ?? []).length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={4}>No privacy requests yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
