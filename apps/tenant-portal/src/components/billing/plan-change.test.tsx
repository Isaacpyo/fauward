import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));

import type { BillingSummary } from "@/types/billing";
import { ChangePlanModal } from "./ChangePlanModal";
import { ManageBillingCard } from "./ManageBillingCard";

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

function axiosError(status: number, data: Record<string, unknown>) {
  return Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } });
}

const plans = {
  currentPlan: "STARTER",
  billingCycle: "MONTHLY",
  request: null,
  plans: [
    { plan: "STARTER", price: { currency: "GBP", monthly: "29.00", annual: "288.00" }, features: { maxShipmentsPm: 300, maxStaff: 3 }, selfServe: false },
    { plan: "PRO", price: { currency: "GBP", monthly: "79.00", annual: "780.00" }, features: { maxShipmentsPm: 2000, maxStaff: 15 }, selfServe: false },
    { plan: "ENTERPRISE", price: null, features: { maxStaff: 100 }, selfServe: false }
  ]
};

const summary: BillingSummary = {
  plan: "starter",
  effectivePlan: "starter",
  cycle: "monthly",
  price: { amount: "29.00", currency: "GBP" },
  renewalDate: null,
  subscriptionStatus: "ACTIVE",
  managedByStripe: false,
  paymentStatus: "active",
  usage: { shipments: { used: 10, limit: 300 }, staff: { used: 1, limit: 3 } }
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("plan change and billing (WP-2.7 tenant touchpoint)", () => {
  it("ACC-L6-1 shows the API's plans and prices and files a request for staff approval", async () => {
    get.mockResolvedValue({ data: plans });
    post.mockResolvedValue({ data: { kind: "REQUESTED", request: { id: "pcr_1", fromPlan: "STARTER", toPlan: "PRO", billingCycle: "MONTHLY", status: "PENDING", channel: "MANUAL_APPROVAL", decisionReason: null, decidedAt: null, createdAt: "2026-10-19T09:00:00.000Z" } } });
    renderWithClient(<ChangePlanModal open onOpenChange={() => undefined} />);
    expect(await screen.findByText("79.00 GBP / month")).toBeInTheDocument();
    expect(screen.getByText("Custom pricing")).toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId("plan-option")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Request Pro" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/plan-change", { plan: "PRO", billingCycle: "MONTHLY" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Fauward will review it");
  });

  it("goes to Stripe Checkout when the API returns a checkout URL", async () => {
    get.mockResolvedValue({ data: { ...plans, plans: plans.plans.map((plan) => (plan.plan === "PRO" ? { ...plan, selfServe: true } : plan)) } });
    post.mockResolvedValue({ data: { kind: "CHECKOUT", redirectUrl: "https://checkout.stripe.test/c/pay_1", request: { id: "pcr_2", fromPlan: "STARTER", toPlan: "PRO", billingCycle: "MONTHLY", status: "CHECKOUT_PENDING", channel: "STRIPE_CHECKOUT", decisionReason: null, decidedAt: null, createdAt: "2026-10-19T09:00:00.000Z" } } });
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true });
    renderWithClient(<ChangePlanModal open onOpenChange={() => undefined} />);
    fireEvent.click((await screen.findAllByTestId("plan-option"))[1]);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Pro" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/c/pay_1"));
  });

  it("ACC-SUB-5 without a billing portal the tenant writes to Fauward billing as a BILLING_QUERY ticket", async () => {
    post.mockImplementation(async (url: string) => {
      if (url === "/v1/tenants/me/billing/portal-session") throw axiosError(409, { error: "BILLING_PORTAL_UNAVAILABLE", message: "Online billing management is not available for this workspace." });
      return { data: { ticket: { id: "tkt_9", ticketNumber: "NORTHWIND-FWD-202610-0001" } } };
    });
    renderWithClient(<ManageBillingCard summary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));
    const form = await screen.findByRole("form", { name: "Contact Fauward billing" });
    expect(form).toHaveTextContent("Online billing management is not available");
    fireEvent.change(screen.getByLabelText("Message to Fauward billing"), { target: { value: "Please move us to annual invoicing from next month." } });
    fireEvent.click(screen.getByRole("button", { name: "Send to billing" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/fauward-tickets", { subject: "Billing question", body: "Please move us to annual invoicing from next month.", category: "BILLING_QUERY" }));
    expect(await screen.findByRole("status")).toHaveTextContent("NORTHWIND-FWD-202610-0001");
  });

  it("ACC-DUN-5 redeems an approved save offer once and shows what it did", async () => {
    post.mockResolvedValue({ data: { via: "CREDIT_NOTE", creditNoteId: "cn_1", invoiceNumber: "FW-202610-1", amount: "20.00" } });
    renderWithClient(<ManageBillingCard summary={{ ...summary, saveOffer: { code: "SAVE-ABCDEFGH", discount: 20, validUntil: "2026-11-01T00:00:00.000Z" } }} />);
    expect(screen.getByTestId("save-offer")).toHaveTextContent("SAVE-ABCDEFGH");
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/save-offers/SAVE-ABCDEFGH/redeem", {}));
    expect(await screen.findByRole("status")).toHaveTextContent("Credit of 20.00 applied to invoice FW-202610-1");
  });
});
