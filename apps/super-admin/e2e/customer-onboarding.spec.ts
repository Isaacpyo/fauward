import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-ONB-3 ACC-ONB-4 funnel counts from the API; a stuck tenant can be nudged once", async ({ page }) => {
  let nudgedAt: string | null = null;
  const nudges: string[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/onboarding/funnel") {
      return json(route, 200, {
        cohort: null,
        accountsCreated: 3,
        completed: 1,
        steps: [
          { step: "BRANDING_SET", label: "Brand your workspace", required: true, count: 2, conversionFromPrevious: 2 / 3 },
          { step: "GATEWAY_VERIFIED", label: "Connect and verify a payment method", required: true, count: 1, conversionFromPrevious: 0.5 },
          { step: "FIRST_SHIPMENT", label: "Create your first shipment", required: true, count: 1, conversionFromPrevious: 1 },
          { step: "TEAMMATE_JOINED", label: "A teammate accepts an invite and signs in", required: true, count: 1, conversionFromPrevious: 1 },
          { step: "DOMAIN_VERIFIED", label: "Verify a custom domain", required: false, count: 0, conversionFromPrevious: 0 },
          { step: "FIRST_PAID_INVOICE", label: "Get your first invoice paid", required: false, count: 0, conversionFromPrevious: null }
        ]
      });
    }
    if (path === "/onboarding/tenants") {
      return json(route, 200, { data: [{ id: "t_branded", name: "Branded Co", slug: "branded", plan: "STARTER", signedUpAt: "2026-09-29T00:00:00.000Z", daysSinceSignup: 20, stepsDone: ["BRANDING_SET"], nextStep: "GATEWAY_VERIFIED", lastNudgedAt: nudgedAt, canNudge: nudgedAt === null }] });
    }
    if (path === "/onboarding/tenants/t_branded/nudge") {
      nudges.push(path);
      nudgedAt = "2026-10-19T09:00:00.000Z";
      return json(route, 200, { nudgedAt, step: "GATEWAY_VERIFIED" });
    }
    return json(route, 200, { data: [] });
  });

  await page.goto("/customer/onboarding");
  await expect(page.getByTestId("onboarding-funnel")).toContainText("3 account(s) created in the last 90 days · 1 finished onboarding");
  await expect(page.getByTestId("funnel-step").first()).toContainText("67%");
  await page.getByRole("link", { name: "Stuck tenants" }).click();
  const row = page.getByTestId("stuck-tenant");
  await expect(row).toContainText("Gateway verified");
  await row.getByRole("button", { name: "Nudge" }).click();
  await expect(row.getByRole("button", { name: "Nudge" })).toBeDisabled();
  await expect(row).toContainText("2026");
  expect(nudges).toHaveLength(1);
});
