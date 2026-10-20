import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

import { useAppStore } from "@/stores/useAppStore";
import type { User } from "@/types/domain";
import { PlanGate } from "./PlanGate";

function entitlements(effectivePlan: string, features: Record<string, boolean>) {
  return {
    tenantId: "t_1",
    billingPlan: "STARTER",
    effectivePlan,
    planOverride: null,
    features: Object.fromEntries(Object.entries(features).map(([key, enabled]) => [key, { enabled, source: "override" }])),
    limits: { maxStaff: 3, maxShipmentsPm: 300, maxOrganisations: 10, apiRateLimit: 0 },
    computedAt: "2026-10-18T12:00:00.000Z",
    changesAt: null
  };
}

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlanGate minimumPlan="pro" feature="apiAccess">
          <p>API KEYS</p>
        </PlanGate>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function signInAs(plan: User["plan"]) {
  const user: User = { id: "u_1", full_name: "Owner", email: "owner@northwind.test", role: "TENANT_ADMIN", plan };
  useAppStore.setState({ user });
}

beforeEach(() => {
  get.mockReset();
});

describe("PlanGate reads /tenants/me/entitlements (WP-1.4)", () => {
  it("ACC-ENT-4 a STARTER workspace with an apiAccess override sees the gated UI", async () => {
    signInAs("starter");
    get.mockResolvedValue({ data: entitlements("STARTER", { apiAccess: true }) });
    renderGate();
    expect(await screen.findByText("API KEYS")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/v1/tenants/me/entitlements");
  });

  it("ACC-ENT-4 a PRO workspace whose apiAccess is switched off by an override sees the upgrade prompt, not the static table's answer", async () => {
    signInAs("pro");
    get.mockResolvedValue({ data: entitlements("PRO", { apiAccess: false }) });
    renderGate();
    expect(await screen.findByTestId("plan-gate-locked")).toBeInTheDocument();
    expect(screen.queryByText("API KEYS")).toBeNull();
  });

  it("ACC-ENT-4 a plan override to PRO unlocks plan-gated UI before the user's own plan changes", async () => {
    signInAs("starter");
    get.mockResolvedValue({ data: entitlements("PRO", {}) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PlanGate minimumPlan="pro">
            <p>PRO AREA</p>
          </PlanGate>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText("PRO AREA")).toBeInTheDocument();
  });
});
