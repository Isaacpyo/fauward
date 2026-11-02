import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

// Fauward tax exemption (revenue.tax, WP-4.7): upload a certificate; Fauward reviews it. While approved, invoices from
// Fauward carry no tax.

type ExemptionStatus = {
  taxExempt: boolean;
  exemption: { id: string; status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED"; fileName: string | null; submittedAt: string; decidedAt: string | null; decisionReason: string | null } | null;
};

export const TAX_EXEMPTION_KEY = ["tenant", "me", "tax-exemption"] as const;
const ACCEPTED = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 5 * 1024 * 1024;

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"));
    reader.readAsDataURL(file);
  });
}

const STATUS_COPY: Record<string, string> = {
  PENDING: "Waiting for Fauward to review your certificate.",
  APPROVED: "Approved: invoices from Fauward carry no tax.",
  REJECTED: "Not accepted.",
  REVOKED: "Ended: invoices from Fauward include tax again."
};

export function TaxExemptionCard() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({ queryKey: TAX_EXEMPTION_KEY, queryFn: async () => (await api.get<ExemptionStatus>("/v1/tenants/me/tax-exemption")).data });
  const upload = useMutation({
    mutationFn: async (file: File) => (await api.post<ExemptionStatus>("/v1/tenants/me/tax-exemption", { fileName: file.name, contentType: file.type, dataBase64: await toBase64(file) })).data,
    onSuccess: (data) => queryClient.setQueryData(TAX_EXEMPTION_KEY, data)
  });

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setError("Upload a PDF, PNG or JPEG.");
    if (file.size > MAX_BYTES) return setError("The certificate must be 5 MB or smaller.");
    try {
      await upload.mutateAsync(file);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The certificate could not be uploaded."));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const data = status.data;
  const exemption = data?.exemption ?? null;
  const canUpload = !exemption || exemption.status === "REJECTED" || exemption.status === "REVOKED";
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4" data-testid="tax-exemption-card">
      <h3 className="text-base font-semibold text-gray-900">Tax exemption</h3>
      <p className="mb-3 text-sm text-gray-600">If your organisation is exempt from tax, upload the certificate. Fauward reviews it; once approved, invoices from Fauward carry no tax.</p>
      {status.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {status.isError ? (
        <p className="text-sm text-red-700">{isAxiosError(status.error) && status.error.response?.status === 403 ? "Only workspace admins and finance users can manage the tax exemption." : "The tax exemption could not be loaded."}</p>
      ) : null}
      {exemption ? (
        <p className="text-sm text-gray-800" data-testid="tax-exemption-status">
          {exemption.fileName ? <span className="font-medium">{exemption.fileName}</span> : null} — {STATUS_COPY[exemption.status]}
          {exemption.decisionReason ? <span className="block text-gray-600">Reason: {exemption.decisionReason}</span> : null}
        </p>
      ) : null}
      {data && canUpload ? (
        <label className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50">
          {upload.isPending ? "Uploading…" : exemption ? "Upload a new certificate" : "Upload certificate"}
          <input ref={fileInput} type="file" accept={ACCEPTED.join(",")} className="sr-only" aria-label="Tax exemption certificate" disabled={upload.isPending} onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
