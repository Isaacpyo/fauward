import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));
vi.mock("@/lib/auth", () => ({ getAccessToken: () => "token", hasDevTestSession: () => false }));

import { AnnouncementBanner } from "./AnnouncementBanner";

const announcement = { id: "ann_1", type: "MAINTENANCE", title: "Maintenance", body: "Saturday 02:00 UTC", cta: { label: "Details", url: "https://status.fauward.com" }, dismissible: true };

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementBanner />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  post.mockResolvedValue({ status: 204 });
});

describe("announcement banner receipts (L8, WP-2.14)", () => {
  it("ACC-L8-1 reports VIEWED once, CTA_CLICKED and DISMISSED to the API — nothing in localStorage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    get.mockResolvedValue({ data: { announcements: [announcement] } });
    renderBanner();
    expect(await screen.findByText("Maintenance")).toBeInTheDocument();
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/announcements/ann_1/receipt", { action: "VIEWED" }));
    fireEvent.click(screen.getByRole("link", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss announcement" }));
    await waitFor(() => expect(screen.queryByText("Maintenance")).toBeNull());
    expect(post.mock.calls.map(([, body]) => (body as { action: string }).action)).toEqual(["VIEWED", "CTA_CLICKED", "DISMISSED"]);
    expect(setItem.mock.calls.some(([key]) => String(key).includes("announcement"))).toBe(false);
    setItem.mockRestore();
  });

  it("a failed dismissal brings the banner back", async () => {
    get.mockResolvedValue({ data: { announcements: [announcement] } });
    post.mockImplementation(async (_url: string, body: { action: string }) => {
      if (body.action === "DISMISSED") throw new Error("offline");
      return { status: 204 };
    });
    renderBanner();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss announcement" }));
    expect(await screen.findByText("Maintenance")).toBeInTheDocument();
  });
});
