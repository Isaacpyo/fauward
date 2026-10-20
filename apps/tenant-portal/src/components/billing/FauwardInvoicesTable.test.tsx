import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

import { FauwardInvoicesTable } from "./FauwardInvoicesTable";

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FauwardInvoicesTable />
    </QueryClientProvider>
  );
}

beforeEach(() => get.mockReset());

describe("Invoices from Fauward (D4)", () => {
  it("ACC-BIL-7 ACC-BIL-10 lists the PLATFORM invoices Fauward sent, each in its own currency", async () => {
    get.mockResolvedValue({
      data: {
        refunds: [],
        invoices: [
          { id: "inv_1", invoiceNumber: "FW-202610-ABC", status: "SENT", currency: "NGN", total: "48375.54", paid: "0.00", credited: "0.00", outstanding: "48375.54", dueDate: null, sentAt: "2026-10-18T09:00:00.000Z", createdAt: "2026-10-18T09:00:00.000Z" },
          { id: "inv_2", invoiceNumber: "FW-202609-XYZ", status: "PARTIALLY_PAID", currency: "GBP", total: "79.00", paid: "50.00", credited: "0.00", outstanding: "29.00", dueDate: null, sentAt: null, createdAt: "2026-09-18T09:00:00.000Z" }
        ]
      }
    });
    renderTable();
    expect(await screen.findByText("FW-202610-ABC")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/v1/tenants/me/billing/invoices");
    expect(screen.getAllByText(/48,375\.54/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/NGN|₦/).length).toBeGreaterThan(0);
    expect(screen.getByText("£29.00")).toBeInTheDocument();
    expect(screen.getByText("PARTIALLY PAID")).toBeInTheDocument();
  });

  it("says plainly when Fauward has not invoiced the workspace", async () => {
    get.mockResolvedValue({ data: { invoices: [], refunds: [] } });
    renderTable();
    expect(await screen.findByText("Fauward has not invoiced this workspace yet.")).toBeInTheDocument();
  });
});
