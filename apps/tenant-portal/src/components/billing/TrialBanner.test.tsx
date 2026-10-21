import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));

import { useAppStore } from "@/stores/useAppStore";
import type { TenantRole } from "@/types/domain";
import { TrialBanner } from "./TrialBanner";

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function status(overrides: Record<string, unknown> = {}) {
  return { trialing: true, trialEnd: new Date(NOW + 3 * DAY).toISOString(), daysRemaining: 3, canRequest: true, maxDays: 14, latestRequest: null, ...overrides };
}

function renderBanner(days = 3, role: TenantRole = "TENANT_ADMIN") {
  useAppStore.setState({ user: { id: "u_1", full_name: "Ada Owner", email: "owner@northwind.test", role, plan: "starter" } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TrialBanner days={days} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("trial banner (gtm.trials, WP-4.14)", () => {
  it("ACC-TRL-1 (tenant side) an admin asks for more time and sees the request pending", async () => {
    get.mockResolvedValue({ data: status() });
    post.mockResolvedValue({ data: status({ canRequest: false, latestRequest: { id: "tr_1", status: "PENDING", requestedDays: 10, createdAt: new Date(NOW).toISOString(), decidedAt: null, decisionReason: null, newTrialEnd: null } }) });
    renderBanner();
    fireEvent.click(await screen.findByRole("button", { name: "Request more time" }));
    fireEvent.change(screen.getByLabelText(/Extra days/), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Why do you need more time?"), { target: { value: "Our warehouse goes live next week." } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/trial-extension-request", { days: 10, reason: "Our warehouse goes live next week." }));
    expect(await screen.findByTestId("trial-extension-status")).toHaveTextContent("You asked for 10 more days");
    expect(screen.queryByRole("button", { name: "Request more time" })).toBeNull();
  });

  it("ACC-TRL-1 (tenant side) after approval the banner shows the server's new end date and days left", async () => {
    const newEnd = new Date(NOW + 17 * DAY).toISOString();
    get.mockResolvedValue({ data: status({ trialEnd: newEnd, daysRemaining: 17, latestRequest: { id: "tr_1", status: "APPROVED", requestedDays: 14, createdAt: new Date(NOW - DAY).toISOString(), decidedAt: new Date(NOW).toISOString(), decisionReason: null, newTrialEnd: newEnd } }) });
    renderBanner(3);
    expect(await screen.findByTestId("trial-extension-status")).toHaveTextContent("Fauward extended your trial by 14 days");
    expect(screen.getByTestId("trial-banner")).toHaveTextContent("Your trial expires in 17 days");
  });

  it("checks the day limit before sending and shows a declined request's reason", async () => {
    get.mockResolvedValue({ data: status({ latestRequest: { id: "tr_0", status: "DENIED", requestedDays: 14, createdAt: new Date(NOW - 2 * DAY).toISOString(), decidedAt: new Date(NOW - DAY).toISOString(), decisionReason: "No shipments yet", newTrialEnd: null } }) });
    renderBanner();
    expect(await screen.findByTestId("trial-extension-status")).toHaveTextContent("declined: No shipments yet");
    fireEvent.click(screen.getByRole("button", { name: "Request more time" }));
    fireEvent.change(screen.getByLabelText(/Extra days/), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Why do you need more time?"), { target: { value: "We need longer than that." } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose between 1 and 14 days.");
    expect(post).not.toHaveBeenCalled();
  });

  it("non-admins see the trial notice without the request button; long trials show nothing", async () => {
    get.mockResolvedValue({ data: status() });
    renderBanner(3, "TENANT_STAFF");
    expect(await screen.findByTestId("trial-banner")).toHaveTextContent("Your trial expires in 3 days");
    expect(screen.queryByRole("button", { name: "Request more time" })).toBeNull();
  });
});
