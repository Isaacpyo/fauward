import { expect, test, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const summary = {
  identity: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind", customDomain: null, region: "uk_europe", createdAt: "2026-01-01T00:00:00.000Z" },
  status: "ACTIVE",
  closedAt: null,
  plan: { billingPlan: "PRO", effectivePlan: "PRO", planOverride: null },
  activeSuspensions: [],
  mrr: { amount: "79.00", currency: "GBP", source: "plan" },
  subscription: { plan: "PRO", billingCycle: "MONTHLY", status: "ACTIVE", currentPeriodEnd: null },
  lastLoginAt: "2026-10-18T07:30:00.000Z",
  health: null,
  kycStatus: "APPROVED",
  activeStaff: 6,
  openTickets: 2
};
const billing = {
  subscription: { plan: "PRO", billingCycle: "MONTHLY", status: "ACTIVE", currentPeriodEnd: null, cancelAtPeriodEnd: false, stripeLinked: false },
  invoices: [{ id: "inv_1", invoiceNumber: "FW-202610-ABC", status: "SENT", total: "79.00", currency: "GBP", dueDate: null, createdAt: "2026-10-01T00:00:00.000Z" }],
  invoiceCount: 1,
  payments: [],
  dunning: [],
  saveOffers: []
};
const config = {
  general: { timezone: "Europe/London", defaultCurrency: "GBP" },
  branding: { brandName: null },
  domains: { slug: "northwind", customDomain: null },
  notifications: null,
  payments: { activeProvider: "STRIPE", currency: "GBP", gateways: [{ provider: "STRIPE", mode: "LIVE", enabled: true, status: "FAILED", secretConfigured: true, lastVerifiedAt: null, lastError: "STRIPE returned 401: Invalid API Key", updatedAt: "2026-10-18T09:00:00.000Z" }] },
  apiKeys: [{ id: "key_1", name: "ERP", keyPrefix: "fw_live_ab12", scopes: [], isActive: true, isSandbox: false, createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null, expiresAt: null }],
  webhooks: [],
  legacyWebhook: null
};

const activity = {
  data: [
    { id: "act_2", occurredAt: "2026-10-18T09:00:00.000Z", tenantId: "tenant_1", tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" }, service: "customer.360", type: "shipment.attention", actorType: "TENANT_USER", actorId: null, actorLabel: "Field operator", subjectType: "shipment", subjectId: "ship_1", summary: "Shipment NWD-1 moved to exception", severity: "ATTENTION", consoleLink: null, metadata: {} },
    { id: "act_1", occurredAt: "2026-10-17T09:00:00.000Z", tenantId: "tenant_1", tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" }, service: "platform.tenants", type: "tenant.unsuspended", actorType: "STAFF", actorId: "staff_001", actorLabel: "Staff User", subjectType: "tenant", subjectId: "tenant_1", summary: "Suspension lifted", severity: "INFO", consoleLink: "/platform/tenants/tenant_1", metadata: {} }
  ],
  nextCursor: null
};

async function mock360(page: Page, options: { permissions?: string[]; failing?: string[] } = {}) {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
    const tab = path.match(/^\/customer360\/tenant_1\/(\w+)$/)?.[1];
    if (tab && options.failing?.includes(tab)) return json(route, 500, { error: "INTERNAL", message: `The ${tab} service is down` });
    if (tab === "summary") return json(route, 200, summary);
    if (tab === "billing") return json(route, 200, billing);
    if (tab === "health") return json(route, 200, { latest: null, history: [] });
    if (tab === "config") return json(route, 200, config);
    if (tab === "activity") return json(route, 200, activity);
    return json(route, 200, { data: [] });
  });
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-C360-3 ACC-C360-4 the header shows the real MRR and last sign-in; no score reads 'Not yet scored'", async ({ page }) => {
  await mock360(page);
  await page.goto("/customer/360/tenant_1");
  const header = page.getByTestId("c360-header");
  await expect(header).toContainText("£79.00");
  await expect(header).toContainText("last sign-in");
  await expect(page.getByText("Not yet scored")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/placeholder/i);
  await page.getByRole("tab", { name: "Health" }).click();
  await expect(page.getByTestId("health-not-scored")).toHaveText("Not yet scored.");
});

test("ACC-C360-1 a failing tab API only breaks that tab; the header and other tabs keep working", async ({ page }) => {
  await mock360(page, { failing: ["usage"] });
  await page.goto("/customer/360/tenant_1?tab=usage");
  await expect(page.getByRole("alert")).toContainText("The usage service is down");
  await expect(page.getByTestId("c360-header")).toContainText("£79.00");
  await page.getByRole("tab", { name: "Billing" }).click();
  await expect(page.getByText("FW-202610-ABC")).toBeVisible();
});

test("ACC-C360-2 a tab without its permission shows the access-denied state with Request access", async ({ page }) => {
  await mock360(page, { permissions: ["customer.360.read", "trust.jit.request"] });
  await page.goto("/customer/360/tenant_1?tab=billing");
  const denied = page.getByTestId("access-denied");
  await expect(denied).toContainText("Requires revenue.invoices.read");
  await expect(denied.getByRole("button", { name: "Request access" })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByText("Active staff")).toBeVisible();
});

test("ACC-C360-6 config is structured and shows secrets only as configured or not", async ({ page }) => {
  await mock360(page);
  await page.goto("/customer/360/tenant_1?tab=config");
  const configView = page.getByTestId("c360-config");
  await expect(configView).toContainText("configured (hidden)");
  // ACC-L11-2: gateway state and the last error, never keys.
  await expect(page.getByTestId("c360-gateways")).toContainText("STRIPE · live · FAILED");
  await expect(page.getByTestId("c360-gateways")).toContainText("Invalid API Key");
  await expect(configView).toContainText("fw_live_ab12");
  await expect(configView).not.toContainText("{");
});

test("WP-2.1 the Activity tab lists the tenant's platform activity from the activity API", async ({ page }) => {
  await mock360(page);
  const request = page.waitForRequest((req) => new URL(req.url()).pathname === "/api/internal/customer360/tenant_1/activity");
  await page.goto("/customer/360/tenant_1?tab=activity");
  await request;
  const rows = page.getByTestId("c360-activity-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Shipment NWD-1 moved to exception");
  await expect(rows.first()).toContainText("ATTENTION");
  await expect(page.getByRole("link", { name: "Suspension lifted" })).toHaveAttribute("href", "/platform/tenants/tenant_1");
});

test("ACC-L16-1 the AI tab shows this month's spend and sets the AI limit with a reason (PUT /tenants/:id/ai-limit)", async ({ page }) => {
  await mock360(page);
  let limit: Record<string, unknown> | null = null;
  const puts: unknown[] = [];
  await page.route("**/api/internal/customer360/tenant_1/ai", (route) =>
    json(route, 200, {
      usage: [{ id: "u1", month: "2026-10", model: "deepseek-v4-flash", feature: "agent_ask", requestCount: 7, tokenCount: 900, costUsd: 4.2 }],
      runs: [],
      runCount: 0,
      limit,
      currentMonth: { month: "2026-10", costUsd: "4.20", requests: 7 },
      featureKeys: ["agent_ask", "agent_sweep"]
    })
  );
  await page.route("**/api/internal/tenants/tenant_1/ai-limit", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    puts.push(body);
    limit = { monthlyBudgetUsd: body.monthlyBudgetUsd, flashRequestLimit: body.flashRequestLimit, proRequestLimit: body.proRequestLimit, featuresEnabled: body.featuresEnabled, updatedAt: "2026-10-19T08:00:00.000Z", updatedByPlatformUserId: "staff_001", reason: body.reason };
    return json(route, 200, { limit });
  });
  await page.goto("/customer/360/tenant_1?tab=ai");
  const panel = page.getByTestId("c360-ai-limit");
  await expect(panel).toContainText("4.20 USD · 7 requests");
  await expect(panel).toContainText("No AI limit set for this tenant.");
  await panel.getByRole("button", { name: "Set AI limit" }).click();
  await page.getByLabel("Monthly budget (USD)").fill("4.00");
  await page.getByLabel(/Reason/).fill("Budget agreed with the customer");
  await page.getByRole("button", { name: "Save AI limit" }).click();
  await expect(panel).toContainText("4.00 USD");
  await expect(panel).toContainText("Budget agreed with the customer");
  expect(puts).toEqual([{ monthlyBudgetUsd: "4.00", flashRequestLimit: null, proRequestLimit: null, featuresEnabled: [], reason: "Budget agreed with the customer" }]);
});

test("ACC-L9-1 staff revoke a tenant API key from Config with a reason (dangerous)", async ({ page }) => {
  await mock360(page);
  const revokes: unknown[] = [];
  let revoked = false;
  await page.route("**/api/internal/customer360/tenant_1/config", (route) =>
    json(route, 200, { ...config, apiKeys: [{ ...config.apiKeys[0], isActive: !revoked, revokedAt: revoked ? "2026-10-19T09:00:00.000Z" : null, revokedByType: revoked ? "STAFF" : null, revokedReason: revoked ? "Key leaked in a public repo" : null }] })
  );
  await page.route("**/api/internal/tenants/tenant_1/api-keys/key_1/revoke", async (route) => {
    revokes.push(route.request().postDataJSON());
    revoked = true;
    return json(route, 200, { key: { id: "key_1", isActive: false } });
  });
  await page.goto("/customer/360/tenant_1?tab=config");
  const key = page.getByTestId("c360-api-key");
  await key.getByRole("button", { name: "Revoke" }).click();
  await page.getByLabel(/Reason/).fill("Key leaked in a public repo");
  await page.getByRole("button", { name: "Revoke key" }).click();
  await expect(key).toContainText("revoked by Fauward: Key leaked in a public repo");
  await expect(key.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  expect(revokes).toEqual([{ reason: "Key leaked in a public repo" }]);
});

test("ACC-L13-1 People shows status, invite state, MFA and last sign-in; staff lock a user with a reason", async ({ page }) => {
  await mock360(page);
  let locked = false;
  const locks: unknown[] = [];
  await page.route("**/api/internal/customer360/tenant_1/people", (route) =>
    json(route, 200, {
      total: 1,
      users: [{ id: "u_ops", email: "ops@northwind.test", firstName: "Olu", lastName: "Ops", role: "TENANT_STAFF", isActive: true, mfaEnabled: false, lastLogin: "2026-10-18T07:30:00.000Z", invitedBy: "u_admin", createdAt: "2026-09-01T00:00:00.000Z", lockedAt: locked ? "2026-10-19T09:00:00.000Z" : null, lockedReason: locked ? "Credentials in a phishing kit" : null, status: locked ? "LOCKED" : "ACTIVE", invited: true, joined: true }]
    })
  );
  await page.route("**/api/internal/tenants/tenant_1/users/u_ops/lock", async (route) => {
    locks.push(route.request().postDataJSON());
    locked = true;
    return json(route, 200, { user: { id: "u_ops" } });
  });
  await page.goto("/customer/360/tenant_1?tab=people");
  const person = page.getByTestId("c360-person");
  await expect(person).toContainText("Invited · joined");
  await person.getByRole("button", { name: "Lock" }).click();
  await page.getByLabel(/Reason/).fill("Credentials in a phishing kit");
  await page.getByRole("button", { name: "Lock user" }).click();
  await expect(person).toContainText("Locked");
  await expect(person).toContainText("Credentials in a phishing kit");
  await expect(person.getByRole("button", { name: "Unlock" })).toBeVisible();
  expect(locks).toEqual([{ reason: "Credentials in a phishing kit" }]);
});
