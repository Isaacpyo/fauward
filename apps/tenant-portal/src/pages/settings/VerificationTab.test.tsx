import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));

import { VerificationTab } from "./VerificationTab";

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VerificationTab />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("business verification (trust.kyc, WP-4.10)", () => {
  it("ACC-KYC-4 (tenant side) an open review shows Fauward's request and the upload attaches the document", async () => {
    get.mockResolvedValue({ data: { kycStatus: "IN_REVIEW", review: { id: "kyc_1", status: "OPEN", requestNote: "Certificate of incorporation, please", documents: [], decisionReason: null } } });
    post.mockResolvedValue({ data: { kycStatus: "IN_REVIEW", review: { id: "kyc_1", status: "OPEN", requestNote: "Certificate of incorporation, please", documents: [{ id: "ev_1", fileName: "incorporation.pdf", at: "2026-10-21T09:00:00.000Z" }], decisionReason: null } } });
    renderTab();
    expect(await screen.findByText("Fauward asked: Certificate of incorporation, please")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Verification document"), { target: { files: [new File(["%PDF"], "incorporation.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/verification/documents", { fileName: "incorporation.pdf", contentType: "application/pdf", dataBase64: btoa("%PDF") }));
    expect(await screen.findByText("incorporation.pdf")).toBeInTheDocument();
  });

  it("approved verification offers no upload; a rejection shows the reason", async () => {
    get.mockResolvedValue({ data: { kycStatus: "REJECTED", review: { id: "kyc_1", status: "REJECTED", requestNote: null, documents: [], decisionReason: "The document was unreadable" } } });
    renderTab();
    expect(await screen.findByTestId("verification-status")).toHaveTextContent("Reason: The document was unreadable");
    expect(screen.queryByLabelText("Verification document")).toBeNull();
  });
});
