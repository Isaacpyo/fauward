import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

import { QbrPage } from "./QbrPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/reports/qbr/deck_1"]}>
        <Routes>
          <Route path="/reports/qbr/:id" element={<QbrPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => get.mockReset());

describe("quarterly business review (customer.qbr, WP-4.9)", () => {
  it("ACC-QBR-4 (tenant side) a shared review shows every section; empty ones say so", async () => {
    get.mockResolvedValue({
      data: {
        id: "deck_1",
        period: "2026-Q2",
        periodStart: "2026-04-01T00:00:00.000Z",
        periodEnd: "2026-07-01T00:00:00.000Z",
        notes: "Great quarter for on-time delivery.",
        sharedAt: "2026-07-05T09:00:00.000Z",
        sections: [
          { key: "shipments", title: "Shipments & SLA", empty: false, emptyText: null, items: [{ label: "Shipments created", value: "3" }], notes: [] },
          { key: "ai", title: "AI usage", empty: true, emptyText: "No data for this period", items: [], notes: [] }
        ]
      }
    });
    renderPage();
    expect(await screen.findByText("Quarterly business review 2026-Q2")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/v1/tenants/me/qbr/deck_1");
    expect(screen.getAllByTestId("qbr-section")).toHaveLength(2);
    expect(screen.getByText("Shipments created")).toBeInTheDocument();
    expect(screen.getByText("No data for this period")).toBeInTheDocument();
    expect(screen.getByText("Great quarter for on-time delivery.")).toBeInTheDocument();
  });
});
