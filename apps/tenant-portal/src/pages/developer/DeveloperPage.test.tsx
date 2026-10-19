import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { DeveloperPage } from "./DeveloperPage";

describe("developer page API keys (L9, WP-2.13)", () => {
  it("a key Fauward revoked shows the reason and no Revoke button", async () => {
    get.mockImplementation(async (url: string) => {
      if (url === "/v1/tenant/api-keys") {
        return {
          data: [
            { id: "key_1", name: "ERP", keyPrefix: "fw_test_abc", scopes: ["shipments:read"], isActive: false, isSandbox: false, lastUsedAt: null, monthlyRequestCount: 4, revokedAt: "2026-10-19T09:00:00.000Z", revokedBy: "FAUWARD", revokedReason: "Key leaked in a public repo" },
            { id: "key_2", name: "Website", keyPrefix: "fw_test_def", scopes: ["rates:read"], isActive: true, isSandbox: true, lastUsedAt: null, monthlyRequestCount: 0, revokedAt: null, revokedBy: null, revokedReason: null }
          ]
        };
      }
      return { data: [] };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/developer?tab=keys"]}>
          <DeveloperPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByTestId("api-key-revoked")).toHaveTextContent("Revoked by Fauward: Key leaked in a public repo");
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
  });
});
