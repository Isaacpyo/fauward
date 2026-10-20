import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));

import { SuspendedOverlay } from "./SuspendedOverlay";

function renderOverlay() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SuspendedOverlay active />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const base = { suspended: true, closed: false, category: "AUP", publicReason: "Your workspace sent bulk unsolicited messages.", since: "2026-10-18T09:00:00.000Z", appealable: true, appeal: null };

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("SuspendedOverlay (D3 tenant touchpoint)", () => {
  it("ACC-SUS-1 shows the category and the public reason from /tenants/me/suspension", async () => {
    get.mockResolvedValue({ data: base });
    renderOverlay();
    expect(await screen.findByTestId("suspension-public-reason")).toHaveTextContent("Your workspace sent bulk unsolicited messages.");
    expect(screen.getByText("Acceptable use")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/v1/tenants/me/suspension");
  });

  it("submits an appeal, then shows its pending status instead of the form", async () => {
    get.mockResolvedValueOnce({ data: base }).mockResolvedValue({ data: { ...base, appealable: false, appeal: { id: "a1", status: "PENDING", createdAt: "2026-10-18T10:00:00.000Z", decidedAt: null, resolution: null } } });
    post.mockResolvedValue({ data: {} });
    renderOverlay();
    fireEvent.click(await screen.findByRole("button", { name: "Submit an appeal" }));
    fireEvent.change(screen.getByLabelText("Contact email"), { target: { value: "owner@northwind.test" } });
    fireEvent.change(screen.getByLabelText("Appeal"), { target: { value: "We had written consent from every recipient and can share the records for review." } });
    fireEvent.click(screen.getByRole("button", { name: "Send appeal" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/suspension-appeal", { reason: "We had written consent from every recipient and can share the records for review.", contactEmail: "owner@northwind.test" }));
    expect(await screen.findByTestId("suspension-appeal")).toHaveTextContent("Your appeal is with Fauward for review.");
    expect(screen.queryByRole("button", { name: "Submit an appeal" })).toBeNull();
  });

  it("shows a rejected appeal's resolution and offers no new appeal while one is decided for this suspension", async () => {
    get.mockResolvedValue({ data: { ...base, appealable: false, appeal: { id: "a1", status: "REJECTED", createdAt: "2026-10-18T10:00:00.000Z", decidedAt: "2026-10-18T11:00:00.000Z", resolution: "Evidence did not show consent" } } });
    renderOverlay();
    expect(await screen.findByTestId("suspension-appeal")).toHaveTextContent("Evidence did not show consent");
  });
});
