import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { useAppStore } from "@/stores/useAppStore";
import { TeamPage } from "./TeamPage";

describe("team page (L13, WP-2.15)", () => {
  it("a user Fauward locked shows 'Locked by Fauward' and the reason", async () => {
    useAppStore.setState({ user: { id: "u_admin", full_name: "Ada Admin", email: "admin@northwind.test", role: "TENANT_ADMIN", plan: "pro" } });
    get.mockResolvedValue({
      data: {
        users: [
          { id: "u_ops", email: "ops@northwind.test", role: "TENANT_STAFF", fullName: "Olu Ops", isActive: true, createdAt: "2026-09-01T00:00:00.000Z", lastLogin: null, lockedAt: "2026-10-19T09:00:00.000Z", lockedReason: "Credentials in a phishing kit" }
        ]
      }
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const badge = await screen.findByTestId("member-locked");
    expect(badge).toHaveTextContent("Locked by Fauward");
    expect(badge).toHaveTextContent("Credentials in a phishing kit");
  });
});
