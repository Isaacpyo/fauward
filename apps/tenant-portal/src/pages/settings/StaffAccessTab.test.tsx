import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

import { useAppStore } from "@/stores/useAppStore";
import type { User } from "@/types/domain";
import { StaffAccessTab } from "./StaffAccessTab";

function renderTab(role: User["role"]) {
  const user: User = { id: "u_1", full_name: "Ada Owner", email: "owner@northwind.test", role, plan: "pro" };
  useAppStore.setState({ user });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StaffAccessTab />
    </QueryClientProvider>
  );
}

beforeEach(() => get.mockReset());

describe("StaffAccessTab (D8)", () => {
  it("ACC-IMP-10 the tenant admin sees each staff session with reason, scope and times", async () => {
    get.mockResolvedValue({
      data: {
        nextCursor: null,
        data: [
          { id: "imp_2", staffName: "Sam Support", staffEmail: "sam@fauward.com", reason: "Fixing a broken rate card on behalf of tenant", scopes: ["read", "write"], startedAt: "2026-10-18T10:00:00.000Z", openedAt: null, expiresAt: "2026-10-18T10:15:00.000Z", endedAt: null, endedReason: null, active: true, auditRows: 3 },
          { id: "imp_1", staffName: "Fauward staff", staffEmail: "ops@fauward.com", reason: "Investigating a failed label print", scopes: ["read"], startedAt: "2026-10-17T09:00:00.000Z", openedAt: null, expiresAt: "2026-10-17T09:30:00.000Z", endedAt: "2026-10-17T09:20:00.000Z", endedReason: "REVOKED", active: false, auditRows: 0 }
        ]
      }
    });
    renderTab("TENANT_ADMIN");
    const rows = await screen.findAllByTestId("staff-access-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Sam Support");
    expect(rows[0]).toHaveTextContent("Fixing a broken rate card on behalf of tenant");
    expect(rows[0]).toHaveTextContent("Read and write");
    expect(rows[0]).toHaveTextContent("Active now");
    expect(rows[1]).toHaveTextContent("Read-only");
    expect(rows[1]).toHaveTextContent("(revoked)");
    expect(get).toHaveBeenCalledWith("/v1/tenants/me/staff-access");
  });

  it("other roles are told only admins can see it and nothing is requested", () => {
    renderTab("TENANT_STAFF");
    expect(screen.getByText(/Only workspace admins/)).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});
