import { expect, test, type Page, type Route } from "@playwright/test";

import { addCsrfCookie, meBody } from "./support/console-session";

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
    if (path === "/auth/me") return json(route, 200, meBody([]));
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
