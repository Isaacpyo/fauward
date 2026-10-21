import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));

import { DemoBanner } from "@/components/layout/DemoBanner";
import { getAccessToken, getTenantSlug } from "@/lib/auth";
import { useTenantStore } from "@/stores/useTenantStore";
import type { TenantConfig } from "@/types/domain";
import { DemoLinkPage } from "./DemoLinkPage";

function renderLink(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/demo/${token}`]}>
      <Routes>
        <Route path="/demo/:token" element={<DemoLinkPage />} />
        <Route path="/" element={<p>TENANT HOME</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  get.mockReset();
  post.mockReset();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("demo share link (gtm.demos, WP-4.15)", () => {
  it("ACC-DEMO-2 (tenant side) exchanges the token, keeps the read-only session in sessionStorage and opens the workspace", async () => {
    post.mockResolvedValue({ data: { token: "demo.jwt.token", expiresAt: "2026-10-21T18:00:00.000Z", demoExpiresAt: "2026-10-28T09:00:00.000Z", tenant: { id: "t1", slug: "demo-northwind-abc123", name: "Northwind (demo)" }, readOnly: true } });
    renderLink("share-token-1234567890");
    expect(await screen.findByText("TENANT HOME")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/v1/auth/demo/exchange", { token: "share-token-1234567890" });
    expect(getAccessToken()).toBe("demo.jwt.token");
    expect(getTenantSlug()).toBe("demo-northwind-abc123");
    expect(localStorage.getItem("fw_access_token")).toBeNull();
  });

  it("an expired or replaced link explains itself", async () => {
    post.mockRejectedValue(new Error("401"));
    renderLink("old-token-1234567890");
    expect(await screen.findByRole("alert")).toHaveTextContent("expired or was replaced");
    await waitFor(() => expect(getAccessToken()).toBeNull());
  });

  it("the banner shows the demo expiry and says a share-link session is read-only", async () => {
    const tenant: TenantConfig = { tenant_id: "t1", name: "Northwind (demo)", logo_url: "", domain: "demo-northwind.fauward.com", primary_color: "#0F3D91", accent_color: "#F59E0B", locale: "en-GB", rtl: false, currency: "GBP", timezone: "Europe/London", status: "DEMO" };
    useTenantStore.setState({ tenant });
    get.mockResolvedValue({ data: { demo: true, status: "ACTIVE", expiresAt: "2026-10-28T09:00:00.000Z", template: "Courier", readOnly: true } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DemoBanner />
      </QueryClientProvider>
    );
    expect(await screen.findByTestId("demo-banner")).toHaveTextContent("Demo environment (Courier) — expires");
    expect(screen.getByTestId("demo-banner")).toHaveTextContent("read-only demo link");
  });
});
