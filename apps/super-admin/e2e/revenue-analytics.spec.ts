import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// revenue.analytics (WP-3.2): charts and tables show the API's figures; reconstructed months are flagged; the forecast
// says it is a projection and how it is computed.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const COVERAGE = { dataSince: "2026-05-15T12:00:00.000Z", reconstructedBefore: "2026-06-03T12:00:00.000Z", baseCurrency: "GBP", unconvertedEvents: 0 };
const MOVEMENT = [
  { month: "2026-05", new: "29.00", expansion: "0.00", contraction: "0.00", churn: "0.00", reactivation: "0.00", net: "29.00", reconstructed: true },
  { month: "2026-06", new: "79.00", expansion: "0.00", contraction: "0.00", churn: "0.00", reactivation: "0.00", net: "79.00", reconstructed: false },
  { month: "2026-07", new: "108.00", expansion: "0.00", contraction: "0.00", churn: "0.00", reactivation: "0.00", net: "108.00", reconstructed: false },
  { month: "2026-08", new: "0.00", expansion: "50.00", contraction: "0.00", churn: "-79.00", reactivation: "0.00", net: "-29.00", reconstructed: false },
  { month: "2026-09", new: "0.00", expansion: "0.00", contraction: "-50.00", churn: "0.00", reactivation: "79.00", net: "29.00", reconstructed: false }
];

async function mockAnalytics(page: import("@playwright/test").Page, options: { permissions?: string[]; empty?: boolean } = {}) {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
    const coverage = options.empty ? { ...COVERAGE, dataSince: null, reconstructedBefore: null } : COVERAGE;
    if (path === "/revenue/analytics/mrr-movement") return json(route, 200, { ...coverage, from: "2026-05", to: "2026-09", data: options.empty ? [] : MOVEMENT });
    if (path === "/revenue/analytics/cohorts") {
      return json(route, 200, {
        ...coverage,
        data: options.empty
          ? []
          : [
              {
                cohort: "2026-06",
                signups: 2,
                paying: 2,
                startingMrr: "108.00",
                months: [
                  { month: "2026-06", offset: 0, payingTenants: 1, logoRetention: 0.5, mrr: "79.00", revenueRetention: 0.731 },
                  { month: "2026-07", offset: 1, payingTenants: 2, logoRetention: 1, mrr: "108.00", revenueRetention: 1 }
                ]
              }
            ]
      });
    }
    if (path === "/revenue/analytics/by-plan") {
      return json(route, 200, { ...coverage, currency: "GBP", total: "216.00", asOf: "2026-10-20T10:00:00.000Z", rows: [{ plan: "PRO", billingCycle: "MONTHLY", tenants: 2, mrr: "158.00", unconverted: 0 }, { plan: "STARTER", billingCycle: "MONTHLY", tenants: 2, mrr: "58.00", unconverted: 0 }] });
    }
    if (path === "/revenue/analytics/forecast") {
      return json(route, 200, {
        ...coverage,
        currency: "GBP",
        label: "projection",
        method: "Run-rate projection: current MRR plus, for each future month, the average net MRR movement of the last 3 complete months. Not a forecast of pipeline, seasonality or churn risk.",
        basis: { months: [{ month: "2026-07", net: "108.00" }, { month: "2026-08", net: "-29.00" }, { month: "2026-09", net: "29.00" }], averageNet: "36.00", startingMrr: "216.00" },
        points: [{ month: "2026-11", mrr: "252.00" }, { month: "2026-12", mrr: "288.00" }]
      });
    }
    return json(route, 200, { data: [] });
  });
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-REV-1 ACC-REV-4 movement table matches the API and reconstructed months are flagged in chart and table", async ({ page }) => {
  await mockAnalytics(page);
  await page.goto("/revenue/analytics");
  await expect(page.getByTestId("mrr-movement-chart")).toBeVisible();
  const rows = page.getByTestId("movement-row");
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText("2026-05(reconstructed)");
  await expect(rows.nth(1)).not.toContainText("reconstructed");
  await expect(rows.nth(3)).toContainText("-£79.00");
  await expect(rows.nth(3)).toContainText("-£29.00");
  await expect(page.getByTestId("reconstructed-note")).toContainText("Months before 2026-06 are reconstructed");
  await expect(page.getByTestId("mrr-movement-chart")).toContainText("Reconstructed");
  await expect(page.getByTestId("by-plan-total")).toHaveText("£216.00");
  await expect(page.getByTestId("cohort-row")).toContainText("73.1%");
  await page.screenshot({ path: "test-results/revenue-analytics.png", fullPage: true });
});

test("ACC-REV-3 the forecast is labelled a projection and shows its method and basis", async ({ page }) => {
  await mockAnalytics(page);
  await page.goto("/revenue/analytics");
  await expect(page.getByTestId("forecast-label")).toHaveText("projection");
  await expect(page.getByTestId("forecast-method")).toContainText("Run-rate projection");
  await expect(page.getByTestId("forecast-method")).toContainText("average net £36.00 per month over 2026-07, 2026-08, 2026-09");
});

test("with no subscription events the page says so instead of drawing empty charts", async ({ page }) => {
  await mockAnalytics(page, { empty: true });
  await page.goto("/revenue/analytics");
  await expect(page.getByText("No subscription events are recorded yet.")).toBeVisible();
  await expect(page.getByText("No tenants with subscription history signed up in this window.")).toBeVisible();
});

test("without revenue.analytics.read the page shows access denied", async ({ page }) => {
  await mockAnalytics(page, { permissions: ["platform.tenants.read"] });
  await page.goto("/revenue/analytics");
  await expect(page.getByRole("button", { name: "Request access" })).toBeVisible();
});
