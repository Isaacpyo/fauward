import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// platform.integrations (WP-4.3): provider list (configured first, NOT_CONFIGURED names its env vars), provider detail
// with history/errors and a manual check, tenant gateways (state only), credentials from the secret inventory.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function provider(overrides: Record<string, unknown>) {
  return { provider: "sendgrid", name: "SendGrid", check: "GET /v3/scopes", configured: true, missingEnv: [], status: "OK", polled: true, lastSuccessfulAt: "2026-10-21T10:00:00.000Z", checkedAt: "2026-10-21T10:00:00.000Z", errorRate24h: 0.02, errorRateSource: "NotificationLog (EMAIL)", lastError: null, ...overrides };
}

const PROVIDERS = [
  provider({}),
  provider({ provider: "github", name: "GitHub", check: "GET /repos/{repository}", status: "DOWN", errorRate24h: null, errorRateSource: null, lastError: { at: "2026-10-21T10:00:00.000Z", message: "github answered 503" } }),
  provider({ provider: "hubspot", name: "HubSpot", configured: false, missingEnv: ["HUBSPOT_ACCESS_TOKEN"], status: "NOT_CONFIGURED", polled: false, lastSuccessfulAt: null, checkedAt: null, errorRate24h: null, errorRateSource: null })
];

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-INT-1 the provider list shows polled status, error rates and what an unconfigured provider needs", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/integrations") return json(route, 200, { data: PROVIDERS, pollEveryMinutes: 5 });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/integrations");
  await expect(page.getByTestId("provider-row")).toHaveCount(3);
  await expect(page.getByTestId("provider-row").filter({ hasText: "SendGrid" })).toContainText("2.0%");
  await expect(page.getByTestId("provider-row").filter({ hasText: "GitHub" })).toContainText("Down");
  await expect(page.getByTestId("provider-row").filter({ hasText: "GitHub" })).toContainText("github answered 503");
  await expect(page.getByTestId("provider-row").filter({ hasText: "HubSpot" })).toContainText("Needs HUBSPOT_ACCESS_TOKEN");
  await expect(page.getByTestId("provider-row").filter({ hasText: "HubSpot" })).toContainText("Not configured");
});

test("ACC-INT-2 provider detail is one object with history and recent errors; Check now posts and shows the result", async ({ page }) => {
  const history = [
    { at: "2026-10-21T10:05:00.000Z", status: "OK", latencyMs: 120, error: null, errorRate24h: null },
    { at: "2026-10-21T10:00:00.000Z", status: "DOWN", latencyMs: 10000, error: "github answered 503", errorRate24h: null }
  ];
  let detail = { ...PROVIDERS[1], envNames: ["GITHUB_TOKEN", "GITHUB_REPOSITORY"], history: history.slice(1), recentErrors: history.slice(1), lastWebhookVerification: null };
  const posts: string[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/integrations/github/check") {
      posts.push(path);
      detail = { ...detail, status: "OK", history, lastError: null };
      return json(route, 200, detail);
    }
    if (path === "/integrations/github") return json(route, 200, detail);
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/integrations/github");
  await expect(page.getByTestId("provider-error")).toContainText("github answered 503");
  await expect(page.getByTestId("provider-history")).toHaveCount(1);
  await expect(page.getByTestId("provider-facts")).toContainText("Not measured for this provider");
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByRole("status")).toContainText("Checked: OK.");
  expect(posts).toEqual(["/integrations/github/check"]);
  await expect(page.getByTestId("provider-history")).toHaveCount(2);
});

test("an unconfigured provider says which variables enable it and offers no check", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/integrations/hubspot") return json(route, 200, { ...PROVIDERS[2], envNames: ["HUBSPOT_ACCESS_TOKEN"], history: [], recentErrors: [], lastWebhookVerification: null });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/integrations/hubspot");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("HUBSPOT_ACCESS_TOKEN");
  await expect(page.getByRole("button", { name: "Check now" })).toHaveCount(0);
  await expect(page.getByText("Never polled.")).toBeVisible();
});

test("ACC-INT-4 tenant gateways show state only, filter by status and link the tenant", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/integrations/tenant-gateways") {
      requested.push(url.search);
      return json(route, 200, { data: [{ id: "gw_1", tenant: { id: "t_1", name: "Northwind Couriers", slug: "northwind" }, provider: "PAYSTACK", mode: "TEST", enabled: true, status: "FAILED", secretConfigured: true, lastVerifiedAt: null, lastError: "PAYSTACK returned 401", updatedAt: "2026-10-21T09:00:00.000Z" }] });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/integrations/tenant-gateways");
  await expect(page.getByTestId("gateway-row")).toContainText("PAYSTACK returned 401");
  await expect(page.getByTestId("gateway-row").getByTestId("tenant-chip")).toHaveAttribute("href", "/customer/360/t_1");
  await page.getByLabel("Gateway status").selectOption("FAILED");
  await expect.poll(() => requested).toContain("?status=FAILED");
});

test("credentials come from the secret inventory and link to the secret", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/integrations/credentials") {
      return json(route, 200, {
        data: [{ id: "sec_stripe", name: "Stripe secret key", envName: "STRIPE_SECRET_KEY", integration: "stripe", configured: true, fingerprint: "0a1b2c3d4e5f", lastRotatedAt: null, status: "OK" }],
        total: 1,
        lastInventoryRun: { status: "SUCCEEDED", startedAt: "2026-10-21T04:50:00.000Z" }
      });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/integrations/credentials");
  await expect(page.getByTestId("credential-row")).toContainText("0a1b2c3d4e5f");
  await expect(page.getByRole("link", { name: "Stripe secret key" })).toHaveAttribute("href", "/trust/secrets/sec_stripe");
});
