import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ACC-TP-3 (WP-2.0): every page that used to fall back to invented data renders an error state when its API fails,
// and shows none of the old sample values.

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args), patch: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: () => "test-token", hasDevTestSession: () => false };
});
vi.mock("socket.io-client", () => ({ io: () => ({ on: vi.fn(), send: vi.fn(), disconnect: vi.fn() }) }));

import { TenantDashboardPage } from "@/pages/dashboard/TenantDashboardPage";
import { TenantFinancePage } from "@/pages/finance/TenantFinancePage";
import { AnalyticsPage } from "@/pages/analytics/AnalyticsPage";
import { LiveMapPage } from "@/pages/operations/LiveMapPage";
import { TrackingResultPage } from "@/pages/tracking/TrackingResultPage";
import { BillingTab } from "@/pages/settings/BillingTab";
import { TicketsListPage } from "@/pages/support/TicketsListPage";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { useAppStore } from "@/stores/useAppStore";

/** Pages whose queries retry once (react-query waits about a second before the retry). */
const SLOW = { timeout: 5000 };

function httpError(status: number, error = "Internal Server Error") {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { error } }
  });
}

function renderAt(node: ReactNode, path = "/", routePath = "*") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={node} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockRejectedValue(httpError(500, "ANALYTICS_UNAVAILABLE"));
  useAppStore.setState({ user: { id: "u_1", full_name: "Ada Admin", email: "ada@northwind.test", role: "TENANT_ADMIN", plan: "enterprise" } });
});

describe("fallback pages render error states (ACC-TP-3)", () => {
  it("ACC-TP-3 dashboard: failed widgets show errors and no sample numbers", async () => {
    renderAt(<TenantDashboardPage />);
    expect((await screen.findAllByText(/could not be loaded/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Amina Yusuf")).not.toBeInTheDocument();
    expect(screen.queryByText("124")).not.toBeInTheDocument();
    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
  });

  it("ACC-TP-3 finance: a failed load renders the error, not the sample invoices", async () => {
    renderAt(<TenantFinancePage />);
    expect(await screen.findByText("Finance could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("FWD-INV-2026-0001")).not.toBeInTheDocument();
    expect(screen.queryByText("Acme Retail")).not.toBeInTheDocument();
  });

  it("ACC-TP-3 analytics: failed sections are named and no generated routes appear", async () => {
    renderAt(<AnalyticsPage />);
    expect(await screen.findByText("Some analytics could not be loaded", {}, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(/Lagos/)).not.toBeInTheDocument();
  });

  it("ACC-TP-3 live map: a failed load renders the error, not the sample field operators", async () => {
    renderAt(<LiveMapPage />);
    expect(await screen.findByText("Live locations could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("Amina Yusuf")).not.toBeInTheDocument();
  });

  it("ACC-TP-3 public tracking: an unknown number says not found instead of inventing a result", async () => {
    get.mockRejectedValue(httpError(404, "Shipment not found"));
    renderAt(<TrackingResultPage />, "/track/NOPE-123", "/track/:number");
    expect(await screen.findByText("Tracking number not found", {}, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(/out for delivery/i)).not.toBeInTheDocument();
  });

  it("ACC-TP-3 public tracking: a server error renders the unavailable state", async () => {
    renderAt(<TrackingResultPage />, "/track/FWD-1", "/track/:number");
    expect(await screen.findByText("Tracking is unavailable", {}, SLOW)).toBeInTheDocument();
  });

  it("ACC-TP-3 billing: a failed summary renders the error, not an invented plan or card", async () => {
    renderAt(<BillingTab />);
    expect(await screen.findByText("Billing could not be loaded", {}, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(/4242/)).not.toBeInTheDocument();
  });

  it("ACC-TP-3 support: a failed create shows the error, keeps the form and stores no fake ticket", async () => {
    get.mockResolvedValue({ data: { tickets: [] } });
    post.mockRejectedValue(httpError(503, "SUPPORT_UNAVAILABLE"));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderAt(<TicketsListPage />);
    (await screen.findByRole("button", { name: "Create Support Ticket" })).click();
    const subject = await screen.findByLabelText("Subject");
    const message = screen.getByLabelText("Initial message");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(subject, { target: { value: "Label printer offline" } });
    fireEvent.change(message, { target: { value: "Every label fails to print since this morning." } });
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("SUPPORT_UNAVAILABLE");
    expect(screen.getByLabelText("Subject")).toHaveValue("Label printer offline");
    expect(setItem).not.toHaveBeenCalledWith("fw_support_ticket_drafts", expect.anything());
    expect(screen.queryByText(/SUP-\d+/)).not.toBeInTheDocument();
    setItem.mockRestore();
  });

  it("ACC-TP-3 command palette: search calls /v1/search and shows the error instead of canned results", async () => {
    useAppStore.setState({ commandPaletteOpen: true });
    renderAt(<CommandPalette />);
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(await screen.findByPlaceholderText("Search shipments, customers, invoices..."), { target: { value: "acme" } });
    expect(await screen.findByRole("alert", {}, SLOW)).toHaveTextContent("ANALYTICS_UNAVAILABLE");
    expect(get).toHaveBeenCalledWith("/v1/search", { params: { q: "acme" } });
    expect(screen.queryByText("Acme Wholesale")).not.toBeInTheDocument();
  });
});
