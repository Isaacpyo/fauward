import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// platform.flags (WP-4.1): catalogue, per-tenant override round trip, LD mirror status, audit, releases fallback.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const LD_OFF = { vendor: "launchdarkly", configured: false, missing: ["LAUNCHDARKLY_API_TOKEN"] };
const FLAGS = [
  { key: "apiAccess", kind: "plan-feature", description: null, owner: null, plans: ["PRO", "ENTERPRISE"], activeOverrides: 2, enabledOverrides: 1, disabledOverrides: 1 },
  { key: "sso", kind: "plan-feature", description: null, owner: null, plans: ["ENTERPRISE"], activeOverrides: 0, enabledOverrides: 0, disabledOverrides: 0 }
];
const TENANT = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };
const OVERRIDE = {
  id: "tfo_1",
  tenant: TENANT,
  enabled: true,
  reason: "Pilot for one tenant",
  expiresAt: null,
  createdAt: "2026-10-20T09:00:00.000Z",
  createdBy: { id: "staff_001", email: "staff@fauward.com", name: "Staff User" },
  revokedAt: null,
  revokedBy: null,
  active: true,
  mirror: null
};

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("the catalogue lists plan features with plans and override counts; LaunchDarkly unconfigured shows a banner", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/flags") return json(route, 200, { data: FLAGS, launchDarkly: LD_OFF });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/flags");
  await expect(page.getByTestId("flag-row")).toHaveCount(2);
  await expect(page.getByTestId("flag-row").filter({ hasText: "apiAccess" })).toContainText("PRO, ENTERPRISE");
  await expect(page.getByTestId("flag-row").filter({ hasText: "apiAccess" })).toContainText("2 (1 on, 1 off)");
  await expect(page.getByTestId("flag-row").filter({ hasText: "sso" })).toContainText("None");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("LAUNCHDARKLY_API_TOKEN");
});

test("ACC-FLG-1 adding an override sends tenant, value, expiry and reason, then lists it", async ({ page }) => {
  const posts: unknown[] = [];
  let overrides: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/tenants") return json(route, 200, { data: [{ ...TENANT, status: "ACTIVE", plan: "STARTER" }] });
    if (path === "/flags/apiAccess/overrides" && route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      overrides = [OVERRIDE];
      return json(route, 201, { override: { id: "tfo_1" }, mirror: { vendor: "launchdarkly", status: "NOT_CONFIGURED", error: null, at: null } });
    }
    if (path === "/flags/apiAccess") return json(route, 200, { flag: FLAGS[0], launchDarkly: LD_OFF, overrides });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/flags/apiAccess");
  await expect(page.getByText("No tenant has an override for this flag")).toBeVisible();
  await page.getByRole("button", { name: "Add override" }).click();
  await page.getByLabel("Find a tenant").fill("north");
  await page.getByRole("button", { name: /Northwind Couriers/ }).click();
  await page.getByLabel("Expires on (optional, UTC)").fill("2026-12-31");
  await page.getByLabel(/Reason/).fill("Pilot for one tenant");
  await page.getByRole("dialog").getByRole("button", { name: "Save override" }).click();
  await expect(page.getByRole("status")).toContainText("apiAccess enabled for Northwind Couriers");
  expect(posts).toEqual([{ tenantId: "tenant_1", enabled: true, expiresAt: "2026-12-31T23:59:59.000Z", reason: "Pilot for one tenant" }]);
  await expect(page.getByTestId("override-row")).toHaveCount(1);
  await expect(page.getByTestId("override-row")).toContainText("Native only");
});

test("ACC-FLG-3 a failed LaunchDarkly mirror is shown on the row and in a vendor-error banner", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/flags/apiAccess")
      return json(route, 200, {
        flag: FLAGS[0],
        launchDarkly: { vendor: "launchdarkly", configured: true, missing: [] },
        overrides: [{ ...OVERRIDE, mirror: { vendor: "launchdarkly", status: "FAILED", error: "launchdarkly answered 503", at: "2026-10-20T09:00:01.000Z" } }]
      });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/flags/apiAccess");
  await expect(page.getByTestId("override-row")).toContainText("LaunchDarkly mirror failed");
  await expect(page.getByTestId("override-row")).toContainText("launchdarkly answered 503");
  await expect(page.getByTestId("degraded-vendor-error")).toContainText("could not be mirrored");
});

test("revoke is dangerous and permission-gated; read-only staff cannot add or revoke", async ({ page }) => {
  const deletes: unknown[] = [];
  let permissions = ["platform.flags.read"];
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(permissions));
    if (path === "/flags/apiAccess/overrides/tfo_1") {
      deletes.push(route.request().postDataJSON());
      return json(route, 200, { override: { id: "tfo_1" }, mirror: { vendor: "launchdarkly", status: "NOT_CONFIGURED", error: null, at: null } });
    }
    if (path === "/flags/apiAccess") return json(route, 200, { flag: FLAGS[0], launchDarkly: LD_OFF, overrides: [OVERRIDE] });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/flags/apiAccess");
  await expect(page.getByRole("button", { name: "Add override" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Revoke" })).toBeDisabled();
  permissions = ROOT_PERMISSIONS;
  await page.reload();
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByLabel(/Reason/).fill("Pilot finished");
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("status")).toContainText("Override for Northwind Couriers revoked");
  expect(deletes).toEqual([{ reason: "Pilot finished" }]);
});

test("an API failure shows the error panel; the audit trail lists override events", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/flags") return json(route, 500, { error: "INTERNAL", message: "database unavailable" });
    if (path === "/flags/apiAccess/audit")
      return json(route, 200, {
        data: [{ id: "aud_1", action: "TENANT_FEATURE_OVERRIDE", actorEmail: "staff@fauward.com", actorId: "staff_001", tenant: TENANT, reason: "Pilot for one tenant", metadata: { featureKey: "apiAccess", enabled: true }, createdAt: "2026-10-20T09:00:00.000Z" }],
        nextCursor: null
      });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/flags");
  await expect(page.getByText("Unable to load flags")).toBeVisible();
  await page.goto("/platform/flags/apiAccess/audit");
  await expect(page.getByTestId("flag-audit-row")).toHaveCount(1);
  await expect(page.getByTestId("flag-audit-row")).toContainText("Override set");
  await expect(page.getByTestId("flag-audit-row")).toContainText("Northwind Couriers");
});

test("ACC-FLG-4 releases without GitHub show the backend and console versions", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/releases") return json(route, 200, { source: "local", backend: { version: "2026.10.20", commit: "abc1234" }, releases: [], github: { vendor: "github", configured: false, missing: ["GITHUB_TOKEN", "GITHUB_REPOSITORY"] } });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/releases");
  await expect(page.getByTestId("backend-version")).toContainText("2026.10.20");
  await expect(page.getByTestId("backend-version")).toContainText("abc1234");
  await expect(page.getByTestId("console-version")).toContainText("Built:");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("GITHUB_TOKEN, GITHUB_REPOSITORY");
});
