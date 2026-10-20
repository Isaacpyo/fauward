import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...args: unknown[]) => post(...args), get: vi.fn() } }));

import { CreateShipmentWizard } from "./CreateShipmentWizard";

const QUOTE = { chargeableWeightKg: 4, breakdown: [{ label: "Base fee", amount: 7.5 }], subtotal: 7.5, taxRate: 20, taxAmount: 1.5, total: 9, currency: "NGN" };

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateShipmentWizard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function fillAddresses() {
  const fill = (placeholder: string, values: [string, string]) => {
    const inputs = screen.getAllByPlaceholderText(placeholder);
    fireEvent.change(inputs[0], { target: { value: values[0] } });
    fireEvent.change(inputs[1], { target: { value: values[1] } });
  };
  fill("Address line 1", ["1 Dock Road", "9 High Street"]);
  fill("City", ["Lagos", "Abuja"]);
  fill("Country", ["NG", "NG"]);
  fill("Contact name", ["Ada Sender", "Bola Receiver"]);
  fill("Contact phone", ["+2348000000001", "+2348000000002"]);
}

async function walkToReview() {
  fillAddresses();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByPlaceholderText("Weight (kg)"), { target: { value: "2" } });
  fireEvent.change(screen.getByPlaceholderText("Quantity"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByTestId("shipment-quote")).toHaveTextContent("Base fee");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("checkbox"));
}

beforeEach(() => {
  post.mockReset();
});

describe("CreateShipmentWizard (WP-2.0)", () => {
  it("ACC-TP-1 creates the shipment through POST /v1/shipments and shows the tracking number the API returned", async () => {
    post.mockImplementation(async (url: string) => {
      if (url === "/v1/pricing/calculate") return { data: QUOTE };
      return { data: { id: "ship_9", trackingNumber: "NWD-2026-000042" } };
    });
    renderWizard();
    await walkToReview();
    fireEvent.click(screen.getByRole("button", { name: "Create Shipment" }));

    expect(await screen.findByText("NWD-2026-000042")).toBeInTheDocument();
    const createCall = post.mock.calls.find(([url]) => url === "/v1/shipments");
    expect(createCall).toBeDefined();
    const [, body, config] = createCall as [string, Record<string, unknown>, { headers: Record<string, string> }];
    expect(body).toMatchObject({
      originAddress: { line1: "1 Dock Road", city: "Lagos", country: "NG", contactName: "Ada Sender" },
      destinationAddress: { line1: "9 High Street", city: "Abuja", country: "NG", contactPhone: "+2348000000002" },
      serviceTier: "STANDARD",
      items: [{ quantity: 2, weightKg: 4 }]
    });
    expect(config.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByRole("link", { name: "View Shipment" })).toHaveAttribute("href", "/shipments/ship_9");
  });

  it("ACC-TP-1 the price shown is the server quote in the server's currency, not a built-in price list", async () => {
    post.mockResolvedValue({ data: QUOTE });
    renderWizard();
    fillAddresses();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("Weight (kg)"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const quote = await screen.findByTestId("shipment-quote");
    expect(quote).toHaveTextContent("NGN");
    expect(quote).not.toHaveTextContent("£");
    expect(post).toHaveBeenCalledWith("/v1/pricing/calculate", expect.objectContaining({ serviceTier: "STANDARD", weightKg: 2 }));
  });

  it("a rejected booking keeps the form and shows the server's reason on the step it belongs to", async () => {
    post.mockImplementation(async (url: string) => {
      if (url === "/v1/pricing/calculate") return { data: QUOTE };
      throw Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status: 422, data: { error: "BOOKING_BLOCKED", reason: "No deliveries to this postcode" } } });
    });
    renderWizard();
    await walkToReview();
    fireEvent.click(screen.getByRole("button", { name: "Create Shipment" }));
    await waitFor(() => expect(screen.getByText(/Booking blocked by a shipping rule: No deliveries to this postcode/)).toBeInTheDocument());
    expect(screen.queryByText("Shipment Created Successfully")).not.toBeInTheDocument();
  });
});
