import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// trust.security (WP-4.11): anomaly acknowledge/resolve, staff logins (tenant sign-ins not recorded), IP block with
// scope and expiry (enforcement in WP-5.4), session revoke with a reason.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-SECM-1 an anomaly is acknowledged and resolved with a note", async ({ page }) => {
  let status = "OPEN";
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() === "POST") {
      posts.push({ path, body: request.postDataJSON() });
      status = path.endsWith("/acknowledge") ? "ACKNOWLEDGED" : "RESOLVED";
      return json(route, 200, { id: "an_1", status });
    }
    if (path === "/security/anomalies") return json(route, 200, { data: [{ id: "an_1", type: "failed_login_spike", severity: "HIGH", status, details: { staffEmail: "x@fauward.com", count: 12 }, acknowledgedAt: null, resolvedAt: null, resolutionNote: null, createdAt: "2026-10-21T08:15:00.000Z" }], nextCursor: null });
    return json(route, 200, { data: [], nextCursor: null });
  });
  await page.goto("/trust/security");
  await expect(page.getByTestId("anomaly-row")).toContainText("failed login spike");
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByRole("status")).toContainText("Acknowledged.");
  await page.getByRole("button", { name: "Resolve" }).click();
  await page.getByLabel("Resolution note").fill("Password reset; the spike was a script.");
  await page.getByRole("dialog").getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByRole("status")).toContainText("Resolved.");
  expect(posts).toEqual([
    { path: "/security/anomalies/an_1/acknowledge", body: {} },
    { path: "/security/anomalies/an_1/resolve", body: { note: "Password reset; the spike was a script." } }
  ]);
});

test("staff logins list attempts and say tenant sign-ins are not recorded", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/security/logins") return json(route, 200, { data: [{ id: "l1", email: "ops@fauward.com", success: false, ipAddress: "203.0.113.4", country: "GB", userAgent: null, failureReason: "BAD_PASSWORD", createdAt: "2026-10-21T08:00:00.000Z" }], nextCursor: null, tenantLogins: { available: false, reason: "Tenant users’ failed sign-ins are not recorded; only staff (console) sign-ins appear here." } });
    return json(route, 200, { data: [], nextCursor: null });
  });
  await page.goto("/trust/security/logins");
  await expect(page.getByTestId("login-row")).toContainText("Failed (BAD_PASSWORD)");
  await expect(page.getByTestId("degraded-not-wired")).toContainText("not recorded");
});

test("ACC-SECM-2 blocking an IP sends address, scope, expiry and reason; enforcement is named as WP-5.4", async ({ page }) => {
  const posts: unknown[] = [];
  let rows: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/security/ip-blocks" && request.method() === "POST") {
      posts.push(request.postDataJSON());
      rows = [{ id: "ip_1", ipAddress: "203.0.113.9", scope: "CONSOLE", reason: "Credential stuffing source", expiresAt: "2026-12-31T23:59:59.000Z", active: true, hitCount: 0, createdAt: "2026-10-21T09:00:00.000Z" }];
      return json(route, 201, rows[0]);
    }
    if (path === "/security/ip-blocks") return json(route, 200, { data: rows, nextCursor: null, enforcement: { enforced: false, reason: "Blocks are recorded now; the request middleware that enforces them ships in WP-5.4." } });
    return json(route, 200, { data: [], nextCursor: null });
  });
  await page.goto("/trust/security/ip-blocks");
  await expect(page.getByTestId("degraded-not-wired")).toContainText("WP-5.4");
  await page.getByRole("button", { name: "Block an IP" }).click();
  await page.getByRole("dialog").getByLabel("IP address").fill("203.0.113.9");
  await page.getByRole("dialog").getByLabel("Scope").selectOption("CONSOLE");
  await page.getByLabel("Expires on (optional, UTC)").fill("2026-12-31");
  await page.getByLabel(/Reason/).fill("Credential stuffing source");
  await page.getByRole("dialog").getByRole("button", { name: "Block" }).click();
  await expect(page.getByTestId("ip-block-row")).toContainText("console");
  expect(posts).toEqual([{ ipAddress: "203.0.113.9", scope: "CONSOLE", expiresAt: "2026-12-31T23:59:59.000Z", reason: "Credential stuffing source" }]);
});

test("ACC-SECM-3 revoking another staff member's session sends the reason; your own session cannot be revoked here", async ({ page }) => {
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() === "POST") {
      posts.push({ path, body: request.postDataJSON() });
      return json(route, 200, { id: "ps_2", revokedAt: "2026-10-21T09:00:00.000Z" });
    }
    if (path === "/security/sessions") {
      return json(route, 200, {
        data: [
          { id: "ps_1", user: { id: "staff_001", email: "staff@fauward.com", name: "Staff User" }, ipAddress: "198.51.100.1", userAgent: null, mfaVerified: true, startedAt: "2026-10-21T08:00:00.000Z", expiresAt: "2026-10-21T20:00:00.000Z", current: true },
          { id: "ps_2", user: { id: "staff_002", email: "ops@fauward.com", name: "Ops Person" }, ipAddress: "198.51.100.7", userAgent: null, mfaVerified: true, startedAt: "2026-10-21T07:00:00.000Z", expiresAt: "2026-10-21T19:00:00.000Z", current: false }
        ],
        nextCursor: null
      });
    }
    return json(route, 200, { data: [], nextCursor: null });
  });
  await page.goto("/trust/security/sessions");
  await expect(page.getByTestId("session-row").first()).toContainText("this session");
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(1);
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByLabel(/Reason/).fill("Laptop reported stolen");
  await page.getByRole("dialog").getByRole("button", { name: "Revoke session" }).click();
  await expect(page.getByRole("status")).toContainText("Session revoked.");
  expect(posts).toEqual([{ path: "/security/sessions/ps_2/revoke", body: { reason: "Laptop reported stolen" } }]);
});
