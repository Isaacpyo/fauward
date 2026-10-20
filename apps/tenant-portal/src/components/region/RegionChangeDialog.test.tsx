import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));
// The Radix select is replaced by a native one so the test can choose an option.
vi.mock("@/components/ui/Select", () => ({
  Select: ({ value, onValueChange, options }: { value: string; onValueChange: (value: string) => void; options: Array<{ label: string; value: string }> }) => (
    <select aria-label="Requested region" value={value} onChange={(event) => onValueChange(event.target.value)}>
      <option value="">Choose</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}));

import { RegionChangeDialog } from "./RegionChangeDialog";

const regions = [
  { key: "uk_europe", label: "UK & Europe", paymentProviders: ["Stripe"] },
  { key: "africa", label: "Africa", paymentProviders: ["Paystack"] }
];

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RegionChangeDialog open onOpenChange={() => undefined} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("RegionChangeDialog (L5 tenant touchpoint)", () => {
  it("ACC-L5-1 offers the API's regions except the current one and files the request", async () => {
    get.mockResolvedValue({ data: { current: "uk_europe", regions, latest: null } });
    post.mockResolvedValue({ data: { request: { id: "rcr_1", requestedRegion: "africa", status: "PENDING", decisionReason: null, decidedAt: null, createdAt: "2026-10-18T09:00:00.000Z" } } });
    renderDialog();
    expect(await screen.findByText("UK & Europe")).toBeInTheDocument();
    const select = screen.getByLabelText("Requested region");
    expect([...select.querySelectorAll("option")].map((option) => option.textContent)).toEqual(["Choose", "Africa"]);
    fireEvent.change(select, { target: { value: "africa" } });
    fireEvent.click(screen.getByRole("button", { name: "Request approval" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenant/region-change-requests", { requestedRegion: "africa" }));
  });

  it("shows a pending request, and a rejection with Fauward's reason", async () => {
    get.mockResolvedValueOnce({ data: { current: "uk_europe", regions, latest: { id: "rcr_1", requestedRegion: "africa", status: "PENDING", decisionReason: null, decidedAt: null, createdAt: "2026-10-18T09:00:00.000Z" } } });
    const first = renderDialog();
    expect(await screen.findByTestId("region-pending")).toHaveTextContent("move to Africa");
    first.unmount();
    get.mockResolvedValueOnce({ data: { current: "uk_europe", regions, latest: { id: "rcr_1", requestedRegion: "africa", status: "REJECTED", decisionReason: "No African carriers configured yet", decidedAt: "2026-10-18T10:00:00.000Z", createdAt: "2026-10-18T09:00:00.000Z" } } });
    renderDialog();
    expect(await screen.findByTestId("region-rejected")).toHaveTextContent("No African carriers configured yet");
  });
});
