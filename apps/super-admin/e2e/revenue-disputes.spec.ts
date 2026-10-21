import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// revenue.disputes (WP-4.6): queue with countdown, evidence submit (dangerous), notes, manual D3 suspension, Stripe
// unconfigured banner.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TENANT = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };
function dispute(overrides: Record<string, unknown> = {}) {
  return {
    id: "dsp_1",
    stripeDisputeId: "dp_123",
    stripeChargeId: "ch_123",
    tenant: TENANT,
    paymentId: "pay_1",
    paymentKind: "PLATFORM",
    amount: "49.00",
    currency: "GBP",
    reason: "fraudulent",
    status: "needs_response",
    needsResponse: true,
    evidenceDueBy: "2026-10-22T09:00:00.000Z",
    hoursLeft: 30,
    dueSoon: true,
    submittedAt: null,
    createdAt: "2026-10-20T09:00:00.000Z",
    ...overrides
  };
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-DSP-3 the queue shows the evidence countdown, due-soon first; Stripe unconfigured is explained", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/disputes") return json(route, 200, { data: [dispute(), dispute({ id: "dsp_2", stripeDisputeId: "dp_456", tenant: null, hoursLeft: 200, dueSoon: false })], nextCursor: null, stripe: { vendor: "stripe", configured: false, missing: ["STRIPE_SECRET_KEY"] } });
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/disputes");
  await expect(page.getByTestId("dispute-row")).toHaveCount(2);
  await expect(page.getByTestId("dispute-row").first()).toContainText("30 h left");
  await expect(page.getByTestId("dispute-row").nth(1)).toContainText("8 days left");
  await expect(page.getByTestId("dispute-row").nth(1)).toContainText("Unmatched charge");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("STRIPE_WEBHOOK_SECRET");
});

test("ACC-DSP-2 evidence is submitted with a reason; notes are added; suspension is a separate D3 decision", async ({ page }) => {
  let current: Record<string, unknown> = { ...dispute(), evidence: null, payment: { id: "pay_1", amount: "49.00", currency: "GBP", status: "COMPLETED", invoiceId: "inv_1", gatewayRef: "pi_1", createdAt: "2026-10-01T09:00:00.000Z" }, notes: [], stripe: null };
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() === "POST") posts.push({ path, body: request.postDataJSON() });
    if (path === "/disputes/dsp_1/evidence") {
      current = { ...current, status: "under_review", needsResponse: false, dueSoon: false, submittedAt: "2026-10-21T10:00:00.000Z", evidence: (request.postDataJSON() as { evidence: Record<string, string> }).evidence };
      return json(route, 200, { id: "dsp_1", status: "under_review" });
    }
    if (path === "/disputes/dsp_1/notes") {
      current = { ...current, notes: [{ id: "n1", body: "Asked the tenant for the POD", author: "Staff User", at: "2026-10-21T10:05:00.000Z" }] };
      return json(route, 201, { disputeId: "dsp_1" });
    }
    if (path === "/tenants/tenant_1/suspend") return json(route, 200, { suspension: { id: "sus_1" }, tenant: { id: "tenant_1", status: "SUSPENDED" } });
    if (path === "/disputes/dsp_1") return json(route, 200, current);
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/disputes/dsp_1");
  await expect(page.getByTestId("dispute-payment")).toContainText("Fauward billing");
  await page.getByLabel("What happened (summary for the bank)").fill("The customer signed for delivery on 3 Oct.");
  await page.getByRole("button", { name: "Submit evidence to Stripe" }).click();
  await page.getByLabel(/Reason/).fill("Signed POD on file");
  await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("the dispute is under review");
  await expect(page.getByText("The customer signed for delivery on 3 Oct.")).toBeVisible();

  await page.getByLabel("New note").fill("Asked the tenant for the POD");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByTestId("dispute-note")).toContainText("Asked the tenant for the POD");

  await page.getByRole("button", { name: "Suspend tenant…" }).click();
  await page.getByLabel(/Reason/).fill("Third chargeback this month");
  await page.getByRole("dialog").getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByRole("status")).toContainText("is suspended (BILLING)");

  expect(posts).toEqual([
    { path: "/disputes/dsp_1/evidence", body: { reason: "Signed POD on file", evidence: { uncategorized_text: "The customer signed for delivery on 3 Oct." } } },
    { path: "/disputes/dsp_1/notes", body: { body: "Asked the tenant for the POD" } },
    { path: "/tenants/tenant_1/suspend", body: { category: "BILLING", reason: "Dispute dp_123: Third chargeback this month" } }
  ]);
});

test("read-only staff cannot submit evidence, add notes or suspend", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(["revenue.disputes.read"]));
    if (path === "/disputes/dsp_1") return json(route, 200, { ...dispute(), evidence: null, payment: null, notes: [], stripe: null });
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/disputes/dsp_1");
  await expect(page.getByRole("button", { name: "Suspend tenant…" })).toHaveAttribute("title", "Requires platform.tenants.suspend");
  await expect(page.getByRole("button", { name: "Add note" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit evidence to Stripe" })).toBeDisabled();
});
