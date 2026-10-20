import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

type RequestType = "ACCESS" | "ERASURE" | "PORTABILITY" | "RECTIFICATION";

type DsarRequest = {
  id: string;
  requestType: RequestType;
  subjectEmail: string;
  status: string;
  statusLabel: string;
  dueAt: string;
  createdAt: string;
  erasureCompletedAt: string | null;
  download: { available: boolean; expiresAt: string | null; downloadedAt: string | null } | null;
};

const REQUEST_TYPES: Array<{ value: RequestType; label: string; hint: string }> = [
  { value: "ACCESS", label: "Access", hint: "A copy of the personal data you hold about the person." },
  { value: "PORTABILITY", label: "Portability", hint: "The same data in a machine-readable file they can take elsewhere." },
  { value: "RECTIFICATION", label: "Rectification", hint: "Correct inaccurate data. Fauward contacts you to agree the changes." },
  { value: "ERASURE", label: "Erasure", hint: "Erase the person’s data. Financial records you must keep are retained without their details." }
];

const EMPTY_FORM = { requestType: "ACCESS" as RequestType, subjectName: "", subjectEmail: "", relation: "CUSTOMER", description: "" };
const QUERY_KEY = ["tenant-dsar"];

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PrivacyTab() {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const linkDsarId = params.get("dsar");
  const linkToken = params.get("token");
  const [form, setForm] = useState(EMPTY_FORM);
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await api.get<{ requests: DsarRequest[] }>("/v1/tenants/me/dsar")).data.requests
  });
  const create = useMutation({
    mutationFn: async () => api.post("/v1/tenants/me/dsar", form),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }
  });
  const download = useMutation({
    mutationFn: async (input: { id: string; token: string }) =>
      (await api.get<Blob>(`/v1/tenants/me/dsar/${encodeURIComponent(input.id)}/download`, { params: { token: input.token }, responseType: "blob" })).data,
    onSuccess: (blob, input) => {
      saveBlob(blob, `dsar-${input.id}.json`);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate();
  }

  const selectedType = REQUEST_TYPES.find((type) => type.value === form.requestType)!;

  return (
    <div className="space-y-5">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
        <label className="text-sm font-medium text-gray-700">
          Request type
          <select
            aria-label="Request type"
            className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            value={form.requestType}
            onChange={(event) => setForm((current) => ({ ...current, requestType: event.target.value as RequestType }))}
          >
            {REQUEST_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-gray-500">{selectedType.hint}</span>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Relationship
          <select
            className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            value={form.relation}
            onChange={(event) => setForm((current) => ({ ...current, relation: event.target.value }))}
          >
            <option value="CUSTOMER">Customer</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <Input
          placeholder="Data subject name"
          aria-label="Data subject name"
          value={form.subjectName}
          onChange={(event) => setForm((current) => ({ ...current, subjectName: event.target.value }))}
        />
        <Input
          required
          type="email"
          placeholder="Data subject email"
          aria-label="Data subject email"
          value={form.subjectEmail}
          onChange={(event) => setForm((current) => ({ ...current, subjectEmail: event.target.value }))}
        />
        <Textarea
          required
          className="md:col-span-2"
          placeholder="Describe the request and how the person contacted you"
          aria-label="Request details"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
        />
        <div className="md:col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Submitting..." : "Submit request"}
          </Button>
          {create.isError ? <p className="text-sm text-red-700">{apiErrorMessage(create.error, "The request could not be submitted.")}</p> : null}
        </div>
      </form>

      {download.isError ? <p role="alert" className="text-sm text-red-700">{apiErrorMessage(download.error, "The download failed.")}</p> : null}
      {query.isError ? <p role="alert" className="text-sm text-red-700">{apiErrorMessage(query.error, "Your privacy requests could not be loaded.")}</p> : null}

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Data subject</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(query.data ?? []).map((item) => {
              const token = linkDsarId === item.id ? linkToken : null;
              return (
                <tr key={item.id} data-testid="dsar-row">
                  <td className="px-3 py-2">{REQUEST_TYPES.find((type) => type.value === item.requestType)?.label ?? item.requestType}</td>
                  <td className="px-3 py-2">{item.subjectEmail}</td>
                  <td className="px-3 py-2">{item.statusLabel}</td>
                  <td className="px-3 py-2">{new Date(item.dueAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    {item.erasureCompletedAt ? (
                      `Erased ${new Date(item.erasureCompletedAt).toLocaleDateString()}`
                    ) : item.download?.downloadedAt ? (
                      `Downloaded ${new Date(item.download.downloadedAt).toLocaleDateString()}`
                    ) : item.download?.available && token ? (
                      <Button type="button" onClick={() => download.mutate({ id: item.id, token })} disabled={download.isPending}>
                        {download.isPending ? "Downloading..." : "Download"}
                      </Button>
                    ) : item.download?.available ? (
                      "Open the download link Fauward sent you"
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
            {!query.isLoading && !query.isError && (query.data ?? []).length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={5}>
                  No privacy requests yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
