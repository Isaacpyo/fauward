import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));

import { ExceptionsPage, type TenantException } from "./ExceptionsPage";

const base: TenantException = {
  id: "exc_1",
  type: "STUCK",
  severity: "HIGH",
  status: "OPEN",
  notes: null,
  createdAt: "2026-10-19T08:00:00.000Z",
  resolvedAt: null,
  shipment: { id: "sh_1", trackingNumber: "NWD-1001" },
  escalation: { state: "NOT_ESCALATED", escalatedAt: null, reason: null, resolvedAt: null, replies: [] }
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExceptionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("tenant exceptions (L15, WP-2.11)", () => {
  it("ACC-L15-1 escalating sends the reason; Fauward's reply and status show on the page", async () => {
    get.mockResolvedValueOnce({ data: { data: [base] } });
    post.mockResolvedValue({ data: { ...base, escalation: { ...base.escalation, state: "OPEN" } } });
    get.mockResolvedValueOnce({
      data: {
        data: [
          {
            ...base,
            escalation: {
              state: "OPEN",
              escalatedAt: "2026-10-19T09:00:00.000Z",
              reason: "Carrier lost the pallet",
              resolvedAt: null,
              replies: [{ id: "r1", author: "Olu Ops (Fauward)", body: "We opened a trace with the carrier.", createdAt: "2026-10-19T09:10:00.000Z" }]
            }
          }
        ]
      }
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Escalate to Fauward" }));
    const reason = screen.getByLabelText("Reason");
    fireEvent.change(reason, { target: { value: "short" } });
    expect(screen.getByRole("button", { name: "Escalate" })).toBeDisabled();
    fireEvent.change(reason, { target: { value: "Carrier lost the pallet" } });
    fireEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenant/exceptions/exc_1/escalate", { reason: "Carrier lost the pallet" }));
    expect(await screen.findByTestId("exception-reply")).toHaveTextContent("Olu Ops (Fauward)");
    expect(screen.getByTestId("exception-row")).toHaveTextContent("Escalated to Fauward");
    expect(screen.queryByRole("button", { name: "Escalate to Fauward" })).toBeNull();
  });

  it("shows an error state when the API fails, never invented rows", async () => {
    get.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText("Exceptions could not be loaded")).toBeInTheDocument();
    expect(screen.queryByTestId("exception-row")).toBeNull();
  });
});
