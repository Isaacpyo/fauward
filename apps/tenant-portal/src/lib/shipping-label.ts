import { api } from "@/lib/api";

type LabelResponse = {
  document_id: string;
  job_id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  signed_url: string | null;
  error?: string;
};

const POLL_INTERVAL_MS = 1_500;
const POLL_TIMEOUT_MS = 20_000;

export class LabelTimeoutError extends Error {
  constructor(public jobId: string) {
    super("Label generation is taking longer than expected.");
  }
}

export class LabelGenerationError extends Error {
  constructor(message: string, public jobId: string) {
    super(message);
  }
}

async function pollUntilReady(shipmentId: string, jobId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await api.get<LabelResponse>(`/v1/shipments/${shipmentId}/label/${jobId}`);
    if (response.data.status === "COMPLETED" && response.data.signed_url) {
      return response.data.signed_url;
    }
    if (response.data.status === "FAILED") {
      throw new LabelGenerationError(response.data.error ?? "Label generation failed", jobId);
    }
  }
  throw new LabelTimeoutError(jobId);
}

async function openLabelPdf(downloadUrl: string, tab: Window | null): Promise<void> {
  // The download endpoint requires our bearer token, so we fetch the PDF via
  // axios (interceptor adds Authorization) and navigate the pre-opened tab to
  // the resulting blob URL. A fresh `window.open` here would lose the user-
  // gesture context after the await and trip the popup blocker.
  const response = await api.get(downloadUrl, { responseType: "blob" });
  const blobUrl = URL.createObjectURL(response.data as Blob);

  if (tab && !tab.closed) {
    tab.location.href = blobUrl;
  } else {
    // Either popups are hard-blocked (tab was null when opened) or the user
    // closed the placeholder tab while we were generating. Fall back to a
    // programmatic <a> click triggered from the still-live document.
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export async function printShippingLabel(
  shipmentId: string,
  options: { regenerate?: boolean; tab?: Window | null } = {}
): Promise<void> {
  const tab = options.tab ?? null;
  const search = options.regenerate ? "?regenerate=true" : "";
  const response = await api.post<LabelResponse>(
    `/v1/shipments/${shipmentId}/label${search}`
  );

  // Both cached and queued paths route through the same pre-opened-tab
  // mechanism — the cached path just skips the poll.
  const downloadUrl = response.data.signed_url
    ?? (await pollUntilReady(shipmentId, response.data.job_id));
  await openLabelPdf(downloadUrl, tab);
}
