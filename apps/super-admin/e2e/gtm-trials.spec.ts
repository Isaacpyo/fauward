import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// gtm.trials (WP-4.14): trial list with activation and days left, extension approve with a reason (trial end moves,
// Stripe outcome shown), proactive extension from the detail page.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TENANT = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind", status: "TRIALING" };
const THRESHOLDS = { managerOver: 7, directorOver: 30, consoleMax: 90, tenantMax: 14 };
function trial(overrides: Record<string, unknown> = {}) {
  return {
    tenant: TENANT,
    plan: "STARTER",
    subscriptionStatus: "TRIALING",
    trialEnd: "2026-10-24T09:00:00.000Z",
    daysLeft: 3,
    activation: { score: 35, firstShipmentCreated: true, teamInvited: false, paymentMethodConnected: false, webhookConfigured: false, customDomainSet: false, interventionStatus: "CSM_INTERVENTION", scoredAt: "2026-10-21T01:45:00.000Z" },
    pendingRequest: { id: "tr_1", requestedDays: 14, createdAt: "2026-10-21T08:00:00.000Z" },
    ...overrides
  };
}
function request(overrides: Record<string, unknown> = {}) {
  return { id: "tr_1", tenantId: TENANT.id, requestedDays: 14, status: "PENDING", source: "TENANT", reason: "Warehouse goes live next week", decidedAt: null, decisionReason: null, previousTrialEnd: null, newTrialEnd: null, stripeSync: null, createdAt: "2026-10-21T08:00:00.000Z", ...overrides };
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("the trial list shows activation, the pending request and days left", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/trials") return json(route, 200, { data: [trial(), trial({ tenant: { ...TENANT, id: "tenant_2", name: "Acme Freight", slug: "acme" }, activation: null, pendingRequest: null, daysLeft: 20, trialEnd: "2026-11-10T09:00:00.000Z" })], truncated: false });
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/trials");
  await expect(page.getByTestId("trial-row").first()).toContainText("Activation 35/100 · needs CSM");
  await expect(page.getByTestId("trial-row").first()).toContainText("Asked for 14 days");
  await expect(page.getByTestId("trial-row").first()).toContainText("3 days left");
  await expect(page.getByTestId("trial-row").nth(1)).toContainText("Not scored yet");
});

test("ACC-TRL-1 approving a request sends the decision and reason and shows the new trial end", async ({ page }) => {
  const posts: Array<{ path: string; body: unknown }> = [];
  let rows = [{ ...request(), tenant: { id: TENANT.id, name: TENANT.name, slug: TENANT.slug }, currentTrialEnd: "2026-10-24T09:00:00.000Z", currentDaysLeft: 3, subscriptionStatus: "TRIALING" }];
  await page.route("**/api/internal/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (req.method() === "POST") {
      posts.push({ path, body: req.postDataJSON() });
      rows = [];
      return json(route, 200, { request: request({ status: "APPROVED", newTrialEnd: "2026-11-07T09:00:00.000Z", stripeSync: "MIRRORED" }), stripeSync: "MIRRORED" });
    }
    if (path === "/trials/extensions") return json(route, 200, { data: rows, thresholds: THRESHOLDS });
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/trials/extensions");
  await expect(page.getByText("Over 7 days needs a sales manager")).toBeVisible();
  await expect(page.getByTestId("extension-row")).toContainText("+14 days");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByLabel(/Reason/).fill("Warehouse onboarding is booked.");
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toContainText("trial now ends Nov 7, 2026");
  await expect(page.getByRole("status")).toContainText("Stripe trial end updated");
  expect(posts).toEqual([{ path: "/trials/extensions/tr_1/decision", body: { decision: "APPROVE", reason: "Warehouse onboarding is booked." } }]);
});

test("a proactive extension from the detail page sends days and reason", async ({ page }) => {
  const posts: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === `/trials/${TENANT.id}/extend`) {
      posts.push(req.postDataJSON());
      return json(route, 200, { request: request({ status: "APPROVED", source: "CONSOLE", requestedDays: 5, newTrialEnd: "2026-10-29T09:00:00.000Z", stripeSync: "NOT_CONFIGURED" }), stripeSync: "NOT_CONFIGURED" });
    }
    if (path === `/trials/${TENANT.id}`) return json(route, 200, { ...trial({ pendingRequest: null }), managedByStripe: false, thresholds: THRESHOLDS, requests: [], events: [] });
    return json(route, 200, { data: [] });
  });
  await page.goto(`/gtm/trials/${TENANT.id}`);
  await expect(page.getByTestId("activation-score")).toContainText("35/100");
  await page.getByRole("button", { name: "Extend trial" }).click();
  await page.getByRole("dialog").getByLabel("Extra days").fill("5");
  await page.getByLabel(/Reason/).fill("Goodwill after the outage.");
  await page.getByRole("dialog").getByRole("button", { name: "Extend" }).click();
  await expect(page.getByRole("status")).toContainText("Trial now ends Oct 29, 2026.");
  expect(posts).toEqual([{ days: 5, reason: "Goodwill after the outage." }]);
});
