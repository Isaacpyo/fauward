import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

import { AuditLogPage } from "./AuditLogPage";

describe("tenant audit log (D8)", () => {
  it("ACC-L18-2 rows written during a staff session read 'Fauward staff (via impersonation)'", async () => {
    get.mockResolvedValue({
      data: {
        total: 2,
        totalPages: 1,
        events: [
          { id: "a2", timestamp: "2026-10-19T10:05:00.000Z", action: "RATE_CARD_UPDATED", actorType: "IMPERSONATOR", actorIp: null, resourceType: "rate_card", resourceId: "rc_123456789", actor: { email: "admin@northwind.test" }, metadata: { impersonationSessionId: "imp_2" } },
          { id: "a1", timestamp: "2026-10-19T09:00:00.000Z", action: "SHIPMENT_CREATED", actorType: "USER", actorIp: "203.0.113.4", resourceType: "shipment", resourceId: "sh_1", actor: { email: "admin@northwind.test" }, metadata: null }
        ]
      }
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuditLogPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const rows = await screen.findAllByTestId("audit-row");
    expect(rows[0]).toHaveTextContent("Fauward staff (via impersonation)");
    expect(rows[0]).not.toHaveTextContent("admin@northwind.test");
    expect(rows[1]).toHaveTextContent("admin@northwind.test");
    expect(get).toHaveBeenCalledWith("/v1/audit-log", { params: { page: 1, limit: 50 } });
  });
});

describe("tenant audit log path (WP-2.16)", () => {
  it("ACC-L17-1 the page reads the registered /v1/audit-log route and shows an error state, not a blank page, on failure", async () => {
    get.mockReset();
    get.mockRejectedValue(new Error("Request failed with status code 500"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuditLogPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith("/v1/audit-log", { params: { page: 1, limit: 50 } }));
    expect(await screen.findByRole("button", { name: /retry|try again/i })).toBeInTheDocument();
  });
});
