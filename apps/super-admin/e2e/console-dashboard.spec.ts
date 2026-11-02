import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// Console dashboard (WP-3.1): every tile shows the /metrics/overview fixture exactly, tiles the caller may not read are
// absent, pillar alert counts come from /activity/summary, and there is no static On-call pill.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const OVERVIEW = {
  asOf: "2026-10-20T10:00:00.000Z",
  mrr: { amount: "1087.50", currency: "GBP", asOf: "2026-10-20T10:00:00.000Z", converted: 1, unconverted: 0, subscriptions: 3 },
  activeTenants: 120,
  trialingTenants: 18,
  suspendedTenants: 3,
  signups7d: 4,
  shipmentsToday: 310,
  shipments30d: 9400,
  dlqDepth: 7,
  error5xxRate1h: { rate: 0.0125, requests: 4800 },
  failedPayments30d: 2,
  openPlatformTickets: 11,
  openEscalations: 5,
  pendingApprovals: { refunds: 1, jit: 2, planChanges: 3, regionRequests: 1, appeals: 4, dsar: 6 }
};

const SUMMARY = {
  services: [
    { service: "platform.queues", lastOccurredAt: "2026-10-20T09:00:00.000Z", count: 12, alerts24h: 2 },
    { service: "platform.jobs", lastOccurredAt: "2026-10-20T08:00:00.000Z", count: 4, alerts24h: 1 },
    { service: "customer.support", lastOccurredAt: "2026-10-20T07:00:00.000Z", count: 30, alerts24h: 0 }
  ]
};

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-DASH-1 ACC-BADGE-2 dashboard tiles match the overview fixture exactly and pillar alerts come from activity", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/metrics/overview") return json(route, 200, OVERVIEW);
    if (path === "/activity/summary") return json(route, 200, SUMMARY);
    if (path === "/badges") {
      return json(route, 200, {
        "dlq-depth": { value: 7, tone: "red", asOf: OVERVIEW.asOf },
        mrr: { value: { amount: "1087.50", currency: "GBP" }, tone: "neutral", asOf: OVERVIEW.asOf },
        "p95-latency": { value: 200, unit: "ms", tone: "green", asOf: OVERVIEW.asOf }
      });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/");
  // ACC-BADGE-2: badges come from GET /badges; services whose key is absent show none.
  await expect(page.getByTestId("badge-dlq-depth")).toHaveText("7");
  await expect(page.getByTestId("badge-p95-latency")).toHaveText("200 ms");
  await expect(page.getByTestId("badge-mrr")).toHaveText("£1,087.50");
  await expect(page.getByTestId("badge-tenant-count")).toHaveCount(0);
  await expect(page.getByTestId("kpi-mrr")).toContainText("£1,087.50");
  await expect(page.getByTestId("kpi-mrr")).toContainText("3 billing subscriptions · 1 converted at stored FX rates");
  await expect(page.getByTestId("kpi-tenants")).toContainText("120");
  await expect(page.getByTestId("kpi-tenants")).toContainText("18 trialing · 3 suspended");
  await expect(page.getByTestId("kpi-signups")).toContainText("4");
  await expect(page.getByTestId("kpi-shipments")).toContainText("310");
  await expect(page.getByTestId("kpi-shipments")).toContainText("9,400 in the last 30 days");
  await expect(page.getByTestId("kpi-dlq")).toContainText("7");
  await expect(page.getByTestId("kpi-errors")).toContainText("1.25%");
  await expect(page.getByTestId("kpi-failed-payments")).toContainText("2");
  await expect(page.getByTestId("kpi-tickets")).toContainText("11");
  await expect(page.getByTestId("kpi-escalations")).toContainText("5");
  await expect(page.getByTestId("kpi-approvals")).toContainText("17");
  await expect(page.getByTestId("kpi-approvals")).toContainText("1 refunds · 2 access requests · 3 plan changes · 1 region requests · 4 appeals · 6 DSARs");
  await expect(page.getByTestId("pillar-alerts-platform")).toHaveText("3 alerts in 24 h");
  await expect(page.getByTestId("pillar-alerts-customer")).toHaveText("0 alerts in 24 h");
  await expect(page.getByText("On-call")).toHaveCount(0);
  await page.getByTestId("kpi-dlq").click();
  await expect(page).toHaveURL(/\/platform\/queues$/);
});

test("ACC-DASH-2 a caller without revenue.analytics.read sees no MRR tile; an overview error is shown, not zeros", async ({ page }) => {
  let fail = false;
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(["customer.support.read", "platform.tenants.read"]));
    if (path === "/metrics/overview") {
      if (fail) return json(route, 503, { error: "UNAVAILABLE", message: "Database unreachable" });
      return json(route, 200, { asOf: OVERVIEW.asOf, activeTenants: 120, trialingTenants: 18, suspendedTenants: 3, openPlatformTickets: 11, pendingApprovals: { regionRequests: 1 } });
    }
    if (path === "/activity/summary") return json(route, 200, { services: [] });
    return json(route, 200, { data: [] });
  });
  await page.goto("/");
  await expect(page.getByTestId("kpi-tenants")).toContainText("120");
  await expect(page.getByTestId("kpi-mrr")).toHaveCount(0);
  await expect(page.getByTestId("kpi-dlq")).toHaveCount(0);
  await expect(page.getByTestId("kpi-approvals")).toContainText("1 region requests");
  fail = true;
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Unable to load platform metrics");
});
