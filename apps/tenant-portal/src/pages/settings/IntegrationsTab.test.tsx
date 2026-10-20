import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const patch = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args)
  }
}));

import { IntegrationsTab, type TenantGateway } from "./IntegrationsTab";

// L11 (WP-2.12): gateway keys go to the API only — never into browser storage (S12) — and are never shown again.

function gateway(provider: TenantGateway["provider"], extra: Partial<TenantGateway> = {}): TenantGateway {
  return {
    provider,
    configured: false,
    enabled: false,
    mode: null,
    publicKey: null,
    config: {},
    secretKeySet: false,
    webhookSecretSet: false,
    encryptionKeySet: false,
    testable: ["STRIPE", "PAYSTACK", "FLUTTERWAVE"].includes(provider),
    status: "UNVERIFIED",
    lastVerifiedAt: null,
    lastError: null,
    updatedAt: null,
    ...extra
  };
}

const list = (stripe: Partial<TenantGateway> = {}) => ({
  data: { activeProvider: null, gateways: [gateway("STRIPE", stripe), gateway("PAYSTACK"), gateway("FLUTTERWAVE"), gateway("BANK_TRANSFER"), gateway("COD")] }
});

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <IntegrationsTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

let setItem: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  get.mockReset();
  put.mockReset();
  post.mockReset();
  patch.mockReset();
  setItem = vi.spyOn(Storage.prototype, "setItem");
});
afterEach(() => setItem.mockRestore());

describe("payment integrations (WP-2.12)", () => {
  it("ACC-L11-1 saving keys calls the API and writes nothing gateway-related to browser storage", async () => {
    get.mockResolvedValueOnce(list());
    put.mockResolvedValue({ data: gateway("STRIPE", { configured: true, enabled: true, secretKeySet: true, mode: "TEST" }) });
    get.mockResolvedValueOnce(list({ configured: true, enabled: true, secretKeySet: true, mode: "TEST" }));
    renderTab();
    const card = await screen.findByTestId("gateway-STRIPE");
    fireEvent.change(screen.getByLabelText("Stripe Publishable key"), { target: { value: "pk_test_123" } });
    fireEvent.change(screen.getByLabelText("Stripe Secret key"), { target: { value: "sk_test_456" } });
    fireEvent.click(card.querySelector('button[role="switch"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Save Stripe" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/v1/tenant/payment-gateways/STRIPE", { enabled: true, config: {}, publicKey: "pk_test_123", secretKey: "sk_test_456" }));
    // After the save the key is reported as saved, never echoed.
    await waitFor(() => expect(screen.getByLabelText("Stripe Secret key")).toHaveAttribute("placeholder", "Secret key: saved (leave blank to keep)"));
    expect(screen.getByLabelText("Stripe Secret key")).toHaveValue("");
    const stored = setItem.mock.calls.map((call) => `${String(call[0])}=${String(call[1])}`).join("\n");
    expect(stored).not.toMatch(/sk_test_456|pk_test_123|payment|gateway|integration/i);
  });

  it("test connection shows the provider's error; the Test button needs a saved key", async () => {
    get.mockResolvedValueOnce(list({ configured: true, enabled: true, secretKeySet: true, mode: "LIVE" }));
    post.mockResolvedValue({ data: gateway("STRIPE", { configured: true, enabled: true, secretKeySet: true, status: "FAILED", lastError: "STRIPE returned 401: Invalid API Key provided" }) });
    get.mockResolvedValueOnce(list({ configured: true, enabled: true, secretKeySet: true, status: "FAILED", lastError: "STRIPE returned 401: Invalid API Key provided" }));
    renderTab();
    const card = await screen.findByTestId("gateway-STRIPE");
    expect(screen.getByTestId("gateway-PAYSTACK").querySelector("button[title='Save a secret key first']")).toBeDisabled();
    fireEvent.click(within(card).getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenant/payment-gateways/STRIPE/test"));
    expect(await screen.findByText("STRIPE returned 401: Invalid API Key provided")).toBeInTheDocument();
    expect(screen.getByTestId("gateway-STRIPE")).toHaveTextContent("Test failed");
  });

  it("shows an error state when the API fails", async () => {
    get.mockRejectedValue(new Error("boom"));
    renderTab();
    expect(await screen.findByText("Payment integrations could not be loaded")).toBeInTheDocument();
  });
});
