import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// gtm.pipeline (WP-4.18): the board by stage with filters, creating a deal, editing its stage, the forecast table, the
// HubSpot banner/import button, and the deals panel on the C360 Overview.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const STAGES = ["PROSPECTING", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

function deal(overrides: Record<string, unknown> = {}) {
  return {
    id: "deal_1",
    name: "Acme annual",
    stage: "NEGOTIATION",
    amount: "12000.00",
    probability: 75,
    weighted: "9000.00",
    closeDate: "2026-12-15",
    ownerEmail: "ae@fauward.test",
    tenant: { id: "tenant_a", name: "Acme Freight", slug: "acme" },
    notes: null,
    source: "CONSOLE",
    hubspotDealId: null,
    hubspotSyncedAt: null,
    wonAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides
  };
}

function board(hubspotConfigured: boolean, deals = [deal()]) {
  return {
    data: deals,
    truncated: false,
    stages: STAGES.map((stage) => ({ stage, count: deals.filter((row) => row.stage === stage).length, amount: stage === "NEGOTIATION" ? "12000.00" : "0.00" })),
    owners: ["ae@fauward.test"],
    hubspot: hubspotConfigured ? { vendor: "hubspot", configured: true } : { vendor: "hubspot", configured: false, missing: ["HUBSPOT_ACCESS_TOKEN"] }
  };
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-PIPE-3 HubSpot unconfigured: banner, no import button; filters reach the API", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/pipeline") {
      queries.push(url.search);
      return json(route, 200, board(false));
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/pipeline");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("HUBSPOT_ACCESS_TOKEN");
  await expect(page.getByRole("button", { name: "Import from HubSpot" })).toHaveCount(0);
  await expect(page.getByTestId("stage-NEGOTIATION").getByTestId("deal-card")).toContainText("Acme annual");
  await expect(page.getByTestId("stage-NEGOTIATION")).toContainText("Negotiation · 1 · 12000.00");
  await page.getByLabel("Owner").selectOption("ae@fauward.test");
  await expect.poll(() => queries.some((query) => query.includes("owner=ae%40fauward.test"))).toBe(true);
});

test("HubSpot configured: import shows the result counts", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/pipeline") return json(route, 200, board(true));
    if (path === "/pipeline/import/hubspot") return json(route, 200, { created: 2, updated: 1, skippedLinked: 1, total: 4 });
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/pipeline");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toHaveCount(0);
  await page.getByRole("button", { name: "Import from HubSpot" }).click();
  await expect(page.getByRole("status")).toHaveText("HubSpot import: 2 new, 1 updated, 1 linked deals kept as they are.");
});

test("ACC-PIPE-1 create a deal, then move it to won", async ({ page }) => {
  const bodies: unknown[] = [];
  let current = deal({ id: "deal_new", name: "Globex pilot", stage: "PROPOSAL", amount: "500.00", probability: 50, weighted: "250.00", tenant: null, ownerEmail: null, closeDate: null });
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/pipeline" && request.method() === "POST") {
      bodies.push(request.postDataJSON());
      return json(route, 201, current);
    }
    if (path === "/pipeline") return json(route, 200, board(false, []));
    if (path === "/pipeline/deal_new" && request.method() === "PATCH") {
      bodies.push(request.postDataJSON());
      current = { ...current, stage: "WON", probability: 100, weighted: "500.00", wonAt: "2026-10-21T10:00:00.000Z" };
      return json(route, 200, current);
    }
    if (path === "/pipeline/deal_new") return json(route, 200, current);
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/pipeline");
  await expect(page.getByText("No deal matches.")).toBeVisible();
  await page.getByRole("button", { name: "New deal" }).click();
  await page.getByLabel("Deal name").fill("Globex pilot");
  await page.getByLabel("Stage").selectOption("PROPOSAL");
  await page.getByLabel("Amount").fill("500.00");
  await page.getByRole("button", { name: "Create deal" }).click();
  await expect(page).toHaveURL(/\/gtm\/pipeline\/deal_new$/);
  await expect(page.getByRole("heading", { name: "Globex pilot" })).toBeVisible();

  await page.getByLabel("Stage").selectOption("WON");
  await page.getByRole("button", { name: "Save deal" }).click();
  await expect(page.getByRole("status")).toHaveText("Deal marked won.");
  expect(bodies).toEqual([
    { name: "Globex pilot", stage: "PROPOSAL", amount: "500.00", closeDate: null, ownerEmail: null, notes: null, tenantId: null },
    { stage: "WON" }
  ]);
});

test("ACC-PIPE-2 the forecast table shows weighted amounts by month", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/pipeline/forecasting") {
      return json(route, 200, {
        months: [
          { month: "2026-10", deals: 2, pipeline: "1333.33", weighted: "600.00", won: "0.00" },
          { month: "2026-11", deals: 1, pipeline: "2000.00", weighted: "1500.00", won: "5000.00" }
        ],
        totalWeighted: "2100.00",
        overdue: { deals: 1, amount: "700.00" },
        unscheduled: { deals: 1, amount: "250.00" }
      });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/pipeline/forecasting");
  await expect(page.getByTestId("forecast-row")).toHaveCount(2);
  await expect(page.getByTestId("forecast-row").nth(1)).toContainText("1500.00");
  await expect(page.getByTestId("forecast-total")).toContainText("2100.00");
  await expect(page.getByText("1 open deal past their close date (700.00)")).toBeVisible();
});

test("ACC-PIPE-4 a won deal linked to the tenant shows on the C360 Overview", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/customer360/tenant_a/deals") return json(route, 200, { data: [deal({ stage: "WON", probability: 100, wonAt: "2026-10-20T09:00:00.000Z" })] });
    if (path === "/customer360/tenant_a/summary") {
      return json(route, 200, {
        identity: { id: "tenant_a", name: "Acme Freight", slug: "acme", customDomain: null, region: "uk", createdAt: "2026-01-01T00:00:00.000Z" },
        status: "ACTIVE",
        closedAt: null,
        plan: { billingPlan: "PRO", effectivePlan: "PRO", planOverride: null },
        activeSuspensions: [],
        mrr: { amount: "99.00", currency: "GBP" },
        subscription: { plan: "PRO", billingCycle: "MONTHLY", status: "ACTIVE", currentPeriodEnd: null },
        lastLoginAt: null,
        health: null,
        kycStatus: "NOT_STARTED",
        activeStaff: 3,
        openTickets: 0
      });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/customer/360/tenant_a");
  await expect(page.getByTestId("c360-deal")).toContainText("Acme annual");
  await expect(page.getByTestId("c360-deal")).toContainText("won");
  await expect(page.getByTestId("c360-deal")).toContainText("12000.00");
});
