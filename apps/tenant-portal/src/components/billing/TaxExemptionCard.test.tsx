import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));

import { TaxExemptionCard } from "./TaxExemptionCard";

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TaxExemptionCard />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("tax exemption (revenue.tax, WP-4.7)", () => {
  it("ACC-TAX-1 (tenant side) uploads a PDF as base64 and shows it pending", async () => {
    get.mockResolvedValue({ data: { taxExempt: false, exemption: null } });
    post.mockResolvedValue({ data: { taxExempt: false, exemption: { id: "tx_1", status: "PENDING", fileName: "vat.pdf", submittedAt: "2026-10-21T09:00:00.000Z", decidedAt: null, decisionReason: null } } });
    renderCard();
    const input = await screen.findByLabelText("Tax exemption certificate");
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.4"], "vat.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/tax-exemption", { fileName: "vat.pdf", contentType: "application/pdf", dataBase64: btoa("%PDF-1.4") }));
    expect(await screen.findByTestId("tax-exemption-status")).toHaveTextContent("Waiting for Fauward to review");
    expect(screen.queryByLabelText("Tax exemption certificate")).toBeNull();
  });

  it("refuses other file types before uploading", async () => {
    get.mockResolvedValue({ data: { taxExempt: false, exemption: null } });
    renderCard();
    fireEvent.change(await screen.findByLabelText("Tax exemption certificate"), { target: { files: [new File(["x"], "cert.docx", { type: "application/msword" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload a PDF, PNG or JPEG.");
    expect(post).not.toHaveBeenCalled();
  });

  it("ACC-TAX-2 (tenant side) a revoked exemption shows the reason and allows a new upload", async () => {
    get.mockResolvedValue({ data: { taxExempt: false, exemption: { id: "tx_1", status: "REVOKED", fileName: "vat.pdf", submittedAt: "2026-10-01T09:00:00.000Z", decidedAt: "2026-10-02T09:00:00.000Z", decisionReason: "Certificate expired" } } });
    renderCard();
    expect(await screen.findByTestId("tax-exemption-status")).toHaveTextContent("include tax again");
    expect(screen.getByTestId("tax-exemption-status")).toHaveTextContent("Reason: Certificate expired");
    expect(screen.getByText("Upload a new certificate")).toBeInTheDocument();
  });
});
