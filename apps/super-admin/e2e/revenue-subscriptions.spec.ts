import { expect, test, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// revenue.subscriptions (WP-2.7): list with MRR, tenant detail, plan change approval, pricing override, errors.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const tenant = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };
const request = { id: "pcr_1", tenantId: "tenant_1", tenant, fromPlan: "STARTER", toPlan: "PRO", billingCycle: "MONTHLY", status: "PENDING", channel: "MANUAL_APPROVAL", requestedByUserId: "u_admin", decisionReason: null, decidedAt: null, appliedAt: null, createdAt: "2026-10-19T09:00:00.000Z" };

async function mockSubscriptions(page: Page, options: { permissions?: string[]; listStatus?: number } = {}) {
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
    if (req.method() === "POST") {
      posts.push({ path, body: req.postDataJSON() });
      if (path.endsWith("/decision")) return json(route, 200, { request: { ...request, status: "APPLIED" } });
      return json(route, 201, { override: { id: "po_1", tenantId: "tenant_1", contractId: null, ruleType: "discount_percent", discountPercent: "20.00", validFrom: "2026-10-19T00:00:00.000Z", validTo: null, status: "ACTIVE", createdAt: "2026-10-19T09:00:00.000Z" } });
    }
    if (path === "/subscriptions") {
      if (options.listStatus) return json(route, options.listStatus, { error: "INTERNAL", message: "Subscription store unavailable" });
      return json(route, 200, { data: [{ id: "sub_1", tenant: { ...tenant, status: "ACTIVE" }, plan: "STARTER", billingCycle: "MONTHLY", status: "ACTIVE", managedByStripe: false, cancelAtPeriodEnd: false, currentPeriodEnd: null, mrr: { amount: "23.20", currency: "GBP", source: "plan" }, updatedAt: "2026-10-19T09:00:00.000Z" }], nextCursor: null });
    }
    if (path === "/subscriptions/plan-change-requests") return json(route, 200, { data: [request] });
    if (path === "/subscriptions/overrides") return json(route, 200, { data: [] });
    if (path === "/subscriptions/tenant_1") {
      return json(route, 200, {
        tenant: { ...tenant, status: "ACTIVE", plan: "STARTER" },
        subscription: { id: "sub_1", plan: "STARTER", billingCycle: "MONTHLY", status: "ACTIVE", managedByStripe: false, cancelAtPeriodEnd: false, currentPeriodStart: null, currentPeriodEnd: null, trialEnd: null, cancelledAt: null },
        mrr: { amount: "23.20", currency: "GBP", source: "plan", note: "20% pricing override" },
        events: [{ id: "sev_1", type: "PLAN_CHANGED", fromPlan: "TRIALING", toPlan: "STARTER", fromStatus: null, toStatus: null, mrrBefore: "0.00", mrrAfter: "29.00", currency: "GBP", source: "CONSOLE", occurredAt: "2026-10-01T09:00:00.000Z" }],
        overrides: [{ id: "po_1", tenantId: "tenant_1", contractId: null, ruleType: "discount_percent", discountPercent: "20.00", validFrom: "2026-10-01T00:00:00.000Z", validTo: null, status: "ACTIVE", createdAt: "2026-10-01T09:00:00.000Z" }],
        contracts: [],
        planChangeRequests: [request]
      });
    }
    return json(route, 200, { data: [] });
  });
  return posts;
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-SUB-3 ACC-SUB-4 the list shows MRR after overrides and the detail is that tenant only", async ({ page }) => {
  await mockSubscriptions(page);
  await page.goto("/revenue/subscriptions");
  await expect(page.getByTestId("subscription-row")).toContainText("23.20 GBP");
  await page.getByTestId("subscription-row").click();
  await expect(page).toHaveURL(/\/revenue\/subscriptions\/tenant_1$/);
  await expect(page.getByTestId("subscription-summary")).toContainText("MRR 23.20 GBP (20% pricing override)");
  await expect(page.getByTestId("subscription-events")).toContainText("MRR 0.00 → 29.00 GBP");
});

test("ACC-SUB-1 a plan change request is approved with a reason", async ({ page }) => {
  const posts = await mockSubscriptions(page);
  await page.goto("/revenue/subscriptions/plan-change-requests");
  await expect(page.getByTestId("plan-change-request")).toContainText("starter → pro");
  await page.getByRole("button", { name: "Approve" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Reason/).fill("Confirmed with the account owner");
  await dialog.getByRole("button", { name: "Approve and apply" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ path: "/subscriptions/plan-change-requests/pcr_1/decision", body: { decision: "APPROVE", reason: "Confirmed with the account owner" } });
});

test("WP-2.7 read-only staff cannot decide; a failing list shows the API error", async ({ page }) => {
  await mockSubscriptions(page, { permissions: ["revenue.subscriptions.read"] });
  await page.goto("/revenue/subscriptions/plan-change-requests");
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveAttribute("title", "Requires revenue.subscriptions.write");
  await page.unrouteAll();
  await mockSubscriptions(page, { listStatus: 500 });
  await page.goto("/revenue/subscriptions");
  await expect(page.getByRole("alert")).toContainText("Subscription store unavailable");
});
