import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// gtm.attribution (WP-4.16): sources with totals, the funnel stages, and the date range sent to the API.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const META = { from: "2026-07-23T00:00:00.000Z", to: "2026-10-21T00:00:00.000Z", activationThreshold: 50 };

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-ATT-2 sources show signups, activated and paying with the untracked count", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/attribution/summary") {
      return json(route, 200, { ...META, totals: { signups: 5, activated: 3, paid: 2 }, untracked: 1, data: [{ source: "google", medium: "cpc", signups: 2, activated: 2, paid: 1 }, { source: "unknown", medium: "none", signups: 1, activated: 0, paid: 0 }] });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/attribution");
  await expect(page.getByTestId("attribution-totals")).toContainText("5 signups · 2 paying · 1 without a recorded first touch");
  await expect(page.getByTestId("attribution-row").first()).toContainText("google / cpc");
  await expect(page.getByTestId("attribution-row").first()).toContainText("50%");
  await expect(page.getByTestId("attribution-range")).toContainText("activated = score ≥ 50 or paying");
});

test("the funnel shows signup → activated → paying and the date range is sent to the API", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/attribution/funnel") {
      queries.push(url.search);
      return json(route, 200, { ...META, stages: [{ stage: "signup", count: 5 }, { stage: "activated", count: 3 }, { stage: "paid", count: 2 }], bySource: [{ source: "google", signups: 2, activated: 2, paid: 1 }] });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/attribution/funnel");
  await expect(page.getByTestId("funnel-stage")).toHaveCount(3);
  await expect(page.getByTestId("funnel-stage").nth(2)).toContainText("40% of signups");
  await page.getByLabel("From").fill("2026-09-01");
  await expect.poll(() => queries.some((query) => query.includes("from=2026-09-01"))).toBe(true);
});

test("ACC-ATT-3 campaigns list their signups", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/attribution/campaigns") return json(route, 200, { ...META, data: [{ campaign: "spring", signups: 2, activated: 2, paid: 1 }, { campaign: "launch", signups: 1, activated: 0, paid: 0 }] });
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/attribution/campaigns");
  await expect(page.getByTestId("attribution-row")).toHaveCount(2);
  await expect(page.getByTestId("attribution-row").nth(1)).toContainText("launch");
});
