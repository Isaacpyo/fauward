import { expect, test, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const pendingRefund = {
  id: "refund_1",
  tenantId: "tenant_1",
  paymentId: "pay_001",
  amount: "25.00",
  currency: "EUR",
  reason: "Refund by bank transfer",
  status: "PENDING_APPROVAL",
  gatewayRef: null,
  failureReason: null,
  initiatedBy: "pu_other",
  createdAt: "2026-10-18T09:00:00.000Z",
  tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" },
  approvals: [{ id: "approval_1", requestedBy: "pu_other", approvedBy: null, status: "PENDING", reason: "Refund by bank transfer", decidedAt: null }]
};

async function mockBilling(page: Page, onPost: (path: string, body: unknown, key: string | null) => { status: number; body: unknown }) {
  await page.route("**/api/v1/**", (route) => json(route, 200, {}));
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/billing/refunds" && request.method() === "GET") return json(route, 200, { data: [pendingRefund] });
    if (request.method() === "POST") {
      const result = onPost(path, request.postDataJSON(), request.headers()["idempotency-key"] ?? null);
      return json(route, result.status, result.body);
    }
    return json(route, 200, { data: [] });
  });
}

test("ACC-BIL-5 a Stripe failure is shown in the refund dialog, not swallowed", async ({ context, page }) => {
  await addCsrfCookie(context);
  const posts: Array<{ path: string; body: unknown; key: string | null }> = [];
  await mockBilling(page, (path, body, key) => {
    posts.push({ path, body, key });
    return { status: 502, body: { error: "VENDOR_ERROR", vendor: "stripe", degraded: true, message: "Stripe did not accept the refund: charge_already_refunded" } };
  });

  await page.goto("/revenue/billing/refunds");
  await page.getByRole("button", { name: "New refund" }).click();
  const dialog = page.getByRole("dialog", { name: "New refund" });
  await dialog.getByLabel("Payment ID").fill("pay_001");
  await dialog.getByLabel("Amount").fill("12.34");
  await dialog.getByLabel(/Reason/).fill("Duplicate charge on the invoice");
  await dialog.getByRole("button", { name: "Request refund" }).click();

  await expect(dialog.getByRole("alert")).toContainText("charge_already_refunded");
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ path: "/billing/refunds", body: { paymentId: "pay_001", amount: "12.34", reason: "Duplicate charge on the invoice" } });
  expect(posts[0].key).toBeTruthy();
});

test("ACC-BIL-3 the approval queue shows the real currency and approving sends a reason", async ({ context, page }) => {
  await addCsrfCookie(context);
  const posts: Array<{ path: string; body: unknown }> = [];
  await mockBilling(page, (path, body) => {
    posts.push({ path, body });
    return { status: 200, body: { refund: { ...pendingRefund, status: "RECORDED_MANUAL" } } };
  });

  await page.goto("/revenue/billing/refunds");
  const queue = page.getByRole("region", { name: "Approval queue" });
  await expect(queue).toContainText("€25.00");
  await expect(queue).not.toContainText("£");
  await queue.getByRole("button", { name: "Approve" }).click();
  const dialog = page.getByRole("dialog", { name: /Approve refund of/ });
  await dialog.getByLabel(/Reason/).fill("Checked the bank statement");
  await dialog.getByRole("button", { name: "Approve refund" }).click();

  await expect(page.getByRole("status")).toContainText("RECORDED_MANUAL");
  expect(posts).toEqual([{ path: "/billing/refunds/refund_1/approve", body: { reason: "Checked the bank statement" } }]);
});

const platformInvoice = {
  id: "inv_1",
  tenantId: "tenant_1",
  tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" },
  kind: "PLATFORM",
  invoiceNumber: "FW-202610-ABC",
  lineItems: [{ description: "Pro plan, October", quantity: 1, unitAmount: "79.00" }],
  subtotal: "79.00",
  taxRate: "0",
  taxAmount: "0.00",
  total: "79.00",
  currency: "EUR",
  status: "PARTIALLY_PAID",
  dueDate: "2026-11-01T00:00:00.000Z",
  sentAt: "2026-10-18T09:00:00.000Z",
  paidAt: null,
  voidedAt: null,
  notes: null,
  createdAt: "2026-10-18T09:00:00.000Z",
  paid: "50.00",
  credited: "0.00",
  outstanding: "29.00"
};

async function mockInvoices(page: Page, calls: Array<{ method: string; path: string; search: string; body: unknown }>) {
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/internal", "");
    calls.push({ method: request.method(), path, search: url.search, body: request.method() === "GET" ? null : request.postDataJSON() });
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/billing/invoices") {
      const kind = url.searchParams.get("kind") ?? "PLATFORM";
      return json(route, 200, { kind, readOnly: kind !== "PLATFORM", nextCursor: null, data: kind === "PLATFORM" ? [platformInvoice] : [] });
    }
    if (path === "/billing/invoices/inv_1") {
      return json(route, 200, { ...platformInvoice, readOnly: false, payments: [{ id: "pay_1", tenantId: "tenant_1", kind: "PLATFORM", invoiceId: "inv_1", amount: "50.00", currency: "EUR", method: "BANK_TRANSFER", status: "COMPLETED", gatewayRef: null, refundedAmount: "0.00", createdAt: "2026-10-18T10:00:00.000Z", refunds: [] }], creditNotes: [] });
    }
    if (path === "/billing/credit-notes" && request.method() === "POST") {
      return json(route, 409, { error: "CREDIT_EXCEEDS_BALANCE", message: "A credit of 30.00 EUR is more than the outstanding 29.00 EUR.", outstanding: "29.00", currency: "EUR" });
    }
    if (path === "/billing/invoices/inv_1/void") {
      return json(route, 409, { error: "PAYMENTS_EXIST", message: "This invoice has payments; refund or credit it instead of voiding." });
    }
    return json(route, 200, { data: [] });
  });
}

test("ACC-BIL-6 ACC-BIL-10 invoices default to the Fauward ledger in each row's currency; the tenant-customer view is labelled read-only", async ({ context, page }) => {
  await addCsrfCookie(context);
  const calls: Array<{ method: string; path: string; search: string; body: unknown }> = [];
  await mockInvoices(page, calls);
  await page.goto("/revenue/billing/invoices");
  const row = page.getByTestId("invoice-row");
  await expect(row).toContainText("FW-202610-ABC");
  await expect(row).toContainText("€79.00");
  await expect(row).toContainText("€29.00");
  expect(calls.find((call) => call.path === "/billing/invoices")?.search).not.toContain("TENANT_CUSTOMER");

  await page.getByRole("button", { name: /Tenants → their customers/ }).click();
  await expect(page.getByTestId("ledger-readonly")).toBeVisible();
  await expect(page.getByText("No tenant customer invoices match these filters.")).toBeVisible();
  await expect.poll(() => calls.some((call) => call.path === "/billing/invoices" && call.search.includes("kind=TENANT_CUSTOMER"))).toBe(true);
});

test("ACC-BIL-8 ACC-BIL-9 the invoice page shows payments and the API refusals for an over-balance credit and a void with payments", async ({ context, page }) => {
  await addCsrfCookie(context);
  const calls: Array<{ method: string; path: string; search: string; body: unknown }> = [];
  await mockInvoices(page, calls);
  await page.goto("/revenue/billing/invoices/inv_1");
  await expect(page.getByTestId("invoice-payment")).toContainText("€50.00");
  await expect(page.getByTestId("invoice-outstanding")).toContainText("€29.00");

  await page.getByRole("button", { name: "Issue credit note" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Amount \(EUR\)/).fill("30.00");
  await dialog.getByLabel(/Reason \(recorded/).fill("Goodwill credit for the delay");
  await dialog.getByRole("button", { name: "Issue credit note" }).click();
  await expect(dialog).toContainText("more than the outstanding 29.00 EUR");
  expect(calls.find((call) => call.method === "POST" && call.path === "/billing/credit-notes")?.body).toEqual({ invoiceId: "inv_1", amount: "30.00", reason: "Goodwill credit for the delay" });
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Void" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Reason \(recorded/).fill("Issued to the wrong tenant");
  await dialog.getByRole("button", { name: "Void invoice" }).click();
  await expect(dialog).toContainText("This invoice has payments");
});
