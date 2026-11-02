import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

// Business verification (trust.kyc, WP-4.10): when Fauward opens a review it asks for documents here; the admin
// uploads them to that review. Enterprise plans need an approved verification.

type Verification = {
  kycStatus: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  review: { id: string; status: string; requestNote: string | null; documents: Array<{ id: string; fileName: string; at: string }>; decisionReason: string | null } | null;
};

export const VERIFICATION_KEY = ["tenant", "me", "verification"] as const;
const ACCEPTED = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024;

const STATUS_COPY: Record<Verification["kycStatus"], string> = {
  PENDING: "Not verified yet. Fauward asks for documents when your plan needs it (Enterprise).",
  IN_REVIEW: "Fauward is reviewing your business. Upload the documents requested below.",
  APPROVED: "Verified.",
  REJECTED: "Verification was not approved."
};

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"));
    reader.readAsDataURL(file);
  });
}

export function VerificationTab() {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({ queryKey: VERIFICATION_KEY, queryFn: async () => (await api.get<Verification>("/v1/tenants/me/verification")).data });
  const upload = useMutation({
    mutationFn: async (file: File) => (await api.post<Verification>("/v1/tenants/me/verification/documents", { fileName: file.name, contentType: file.type, dataBase64: await toBase64(file) })).data,
    onSuccess: (data) => queryClient.setQueryData(VERIFICATION_KEY, data)
  });

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setError("Upload a PDF, PNG or JPEG.");
    if (file.size > MAX_BYTES) return setError("Files must be 10 MB or smaller.");
    try {
      await upload.mutateAsync(file);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The document could not be uploaded."));
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  if (status.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (status.isError) {
    return <p className="text-sm text-red-700">{isAxiosError(status.error) && status.error.response?.status === 403 ? "Only workspace admins can manage business verification." : "Verification status could not be loaded."}</p>;
  }
  const data = status.data;
  if (!data) return null;
  const review = data.review;
  const open = review?.status === "OPEN";
  return (
    <section className="space-y-3" data-testid="verification-tab">
      <h3 className="text-base font-semibold text-gray-900">Business verification</h3>
      <p className="text-sm text-gray-800" data-testid="verification-status">
        {STATUS_COPY[data.kycStatus]}
        {data.kycStatus === "REJECTED" && review?.decisionReason ? ` Reason: ${review.decisionReason}` : ""}
      </p>
      {open && review?.requestNote ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Fauward asked: {review.requestNote}</p> : null}
      {review && review.documents.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-gray-700">
          {review.documents.map((doc) => (
            <li key={doc.id}>
              {doc.fileName} <span className="text-gray-500">({new Date(doc.at).toLocaleDateString()})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50">
          {upload.isPending ? "Uploading…" : "Upload a document"}
          <input ref={input} type="file" accept={ACCEPTED.join(",")} className="sr-only" aria-label="Verification document" disabled={upload.isPending} onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
