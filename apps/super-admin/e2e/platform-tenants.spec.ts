import { expect, test, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const northwind = {
  id: "8f5c2a10-0000-4000-8000-000000000001",
  name: "Northwind Couriers",
  slug: "northwind",
  customDomain: "track.northwind.test",
  plan: "STARTER",
  effectivePlan: "PRO",
  status: "ACTIVE",
  region: "uk_europe",
  createdAt: "2026-09-01T09:00:00.000Z",
  closedAt: null,
  mrrContribution: { amount: "29.00", currency: "GBP", source: "plan" },
  shipmentsThisMonth: 412,
  staffCount: 6,
  aiSpendThisMonthUsd: "12.40",
  healthScore: null
};

const detail = {
  identity: {
    id: northwind.id,
    name: northwind.name,
    slug: northwind.slug,
    customDomain: northwind.customDomain,
    customDomainStatus: "ACTIVE",
    region: "uk_europe",
    status: "ACTIVE",
    kycStatus: "APPROVED",
    createdAt: northwind.createdAt,
    suspendedAt: null,
    suspensionReason: null,
    closedAt: null,
    closedReason: null,
    purgeAfter: null,
    internalNotes: null,
    defaultCurrency: "GBP",
    timezone: "Europe/London"
  },
  branding: { logoUrl: null, primaryColor: "#0D1F3C", accentColor: "#D97706", brandName: null },
  plan: { billingPlan: "STARTER", effectivePlan: "PRO", planOverride: { id: "tpo_1", plan: "PRO", reason: "Launch partner", expiresAt: null } },
  entitlements: {
    features: { apiAccess: { enabled: true, source: "plan" }, sso: { enabled: false, source: "plan" } },
    limits: { maxStaff: 15, maxShipmentsPm: 2000, maxOrganisations: -1, apiRateLimit: 500 },
    limitsSource: "plan"
  },
  limitColumns: { maxStaff: 3, maxShipmentsPm: 300, maxOrganisations: 10, limitsOverriddenAt: null },
  featureOverrides: [],
  suspensions: { active: [], history: [] },
  region: { current: "uk_europe", pendingRequest: null },
  usage: [{ month: "2026-10", shipments: 412, apiCalls: 1200, smsSent: 0, emailsSent: 380 }],
  staff: { count: 6, admins: [{ id: "u_1", email: "owner@northwind.test", name: "Ada Owner", lastLoginAt: "2026-10-18T08:00:00.000Z" }], lastLoginAt: "2026-10-18T08:00:00.000Z" },
  subscription: { plan: "STARTER", billingCycle: "MONTHLY", status: "ACTIVE", currentPeriodEnd: "2026-11-01T00:00:00.000Z", trialEnd: null, cancelAtPeriodEnd: false, stripeLinked: false },
  mrrContribution: { amount: "29.00", currency: "GBP", source: "plan" },
  healthScore: null,
  impersonationSessions: []
};

type Call = { method: string; path: string; search: string; body: unknown };

async function mockTenants(page: Page, options: { permissions?: string[]; list?: (search: URLSearchParams) => { status: number; body: unknown } } = {}) {
  const calls: Call[] = [];
  let status = "ACTIVE";
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/internal", "");
    calls.push({ method: request.method(), path, search: url.search, body: request.method() === "GET" ? null : request.postDataJSON() });
    if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
    if (path === "/tenants" && request.method() === "GET") {
      if (options.list) {
        const custom = options.list(url.searchParams);
        return json(route, custom.status, custom.body);
      }
      return json(route, 200, { data: [{ ...northwind, status }], total: 1, nextCursor: null });
    }
    if (path === `/tenants/${northwind.id}/suspend`) {
      status = "SUSPENDED";
      return json(route, 200, { suspension: { id: "susp_1", status: "ACTIVE" }, tenant: { id: northwind.id, status: "SUSPENDED", suspendedAt: new Date().toISOString(), suspensionReason: "x" } });
    }
    if (path === `/tenants/${northwind.id}/close`) {
      return json(route, 200, { tenant: { id: northwind.id, status: "CANCELLED", closedAt: new Date().toISOString(), purgeAfter: "2027-01-16T12:00:00.000Z" }, stripe: { status: "NOT_CONFIGURED", message: "Stripe is not configured: no Stripe subscription to cancel." } });
    }
    if (path === `/tenants/${northwind.id}`) return json(route, 200, { ...detail, identity: { ...detail.identity, status } });
    return json(route, 200, { data: [] });
  });
  return calls;
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-TEN-1 ACC-TEN-9 the list renders API tenants; the name is a TenantChip to Customer 360 and the row opens the detail", async ({ page }) => {
  const calls = await mockTenants(page);
  await page.goto("/platform/tenants");
  const row = page.getByTestId("tenant-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("track.northwind.test");
  await expect(row).toContainText("PRO");
  await expect(row).toContainText("billing STARTER");
  await expect(row).toContainText("Not yet scored");
  await expect(row).toContainText("12.40"); // ACC-L16: AI spend this month
  await expect(row.getByTestId("tenant-chip")).toHaveAttribute("href", `/customer/360/${northwind.id}`);

  await page.getByLabel("Search tenants").fill("northwind.test");
  await expect.poll(() => calls.some((call) => call.path === "/tenants" && call.search.includes("search=northwind.test"))).toBe(true);
  await expect(page).toHaveURL(/search=northwind.test/);

  await row.getByRole("cell").nth(2).click();
  await expect(page).toHaveURL(new RegExp(`/platform/tenants/${northwind.id}`));
  await expect(page.getByTestId("effective-plan").or(page.getByText("effective plan PRO"))).toBeVisible();
});

test("ACC-TEN-4 suspending from the list sends category + reasons and the row shows SUSPENDED without a reload", async ({ page }) => {
  const calls = await mockTenants(page);
  await page.goto("/platform/tenants");
  await page.getByTestId("tenant-row").getByRole("button", { name: "Suspend" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason category").selectOption("AUP");
  await dialog.getByLabel(/Message shown to the tenant/).fill("Your workspace sent bulk unsolicited messages.");
  await dialog.getByLabel(/Reason \(recorded/).fill("Carriers reported spam campaigns from this tenant");
  await dialog.getByRole("button", { name: "Suspend tenant" }).click();

  await expect(page.getByRole("status")).toContainText("Northwind Couriers is suspended");
  await expect(page.getByTestId("tenant-status")).toHaveText("SUSPENDED");
  const suspend = calls.find((call) => call.method === "POST" && call.path.endsWith("/suspend"));
  expect(suspend?.body).toEqual({ category: "AUP", reason: "Carriers reported spam campaigns from this tenant", publicReason: "Your workspace sent bulk unsolicited messages." });
});

test("ACC-TEN-7 closing needs the typed slug; the request carries it and the result names the Stripe outcome", async ({ page }) => {
  const calls = await mockTenants(page);
  await page.goto(`/platform/tenants/${northwind.id}`);
  await page.getByRole("button", { name: "Close tenant" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Reason \(recorded/).fill("Customer asked to close the workspace");
  await dialog.getByLabel(/Type the tenant slug/).fill("north");
  await dialog.getByRole("button", { name: "Close tenant" }).click();
  await expect(dialog).toContainText("Type northwind to confirm.");
  expect(calls.some((call) => call.path.endsWith("/close"))).toBe(false);

  await dialog.getByLabel(/Type the tenant slug/).fill("northwind");
  await dialog.getByRole("button", { name: "Close tenant" }).click();
  await expect(page.getByRole("status")).toContainText("no Stripe subscription to cancel");
  expect(calls.find((call) => call.path.endsWith("/close"))?.body).toEqual({ reason: "Customer asked to close the workspace", confirmSlug: "northwind" });
});

test("the detail tabs show plan override, limits from the plan and features with their source", async ({ page }) => {
  await mockTenants(page);
  await page.goto(`/platform/tenants/${northwind.id}?tab=plan`);
  await expect(page.getByTestId("effective-plan")).toHaveText("PRO");
  await expect(page.getByText("Override to PRO")).toBeVisible();
  await expect(page.getByText("From the effective plan.")).toBeVisible();
  await expect(page.getByTestId("feature-apiAccess")).toContainText("On");
});

test("without platform.tenants.read the list is an access-denied state, not an empty table", async ({ page }) => {
  await mockTenants(page, { permissions: ["customer.360.read", "trust.jit.request"] });
  await page.goto("/platform/tenants");
  await expect(page.getByTestId("access-denied")).toContainText("Requires platform.tenants.read");
  await expect(page.locator("table")).toHaveCount(0);
});

test("empty and error states name their cause", async ({ page }) => {
  let fail = false;
  await mockTenants(page, { list: () => (fail ? { status: 500, body: { error: "INTERNAL", message: "Database unavailable" } } : { status: 200, body: { data: [], total: 0, nextCursor: null } }) });
  await page.goto("/platform/tenants?status=DEMO");
  await expect(page.getByText("No tenant matches these filters.")).toBeVisible();
  fail = true;
  await page.goto("/platform/tenants?status=SUSPENDED");
  await expect(page.getByRole("alert")).toContainText("Database unavailable");
});

test("actions the user cannot perform are disabled with the permission named", async ({ page }) => {
  await mockTenants(page, { permissions: ["platform.tenants.read", "trust.jit.request"] });
  await page.goto("/platform/tenants");
  const suspend = page.getByTestId("tenant-row").getByRole("button", { name: "Suspend" });
  await expect(suspend).toBeDisabled();
  await expect(suspend).toHaveAttribute("title", "Requires platform.tenants.suspend");
});
