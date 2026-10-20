import { expect, test, type Route } from "@playwright/test";

import { addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("ACC-IMP-6 start impersonation with a reason, pass the MFA step-up, and the new tab gets #code= and no token", async ({ context, page }) => {
  await addCsrfCookie(context);
  let fresh = false;
  const starts: unknown[] = [];

  // The tenant portal is not running in this test; answer the new tab with a blank page.
  await context.route("http://localhost:3000/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>tenant portal</body></html>" }));
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody([]));
    if (path === "/auth/mfa/verify") {
      fresh = true;
      return json(route, 200, { success: true });
    }
    return json(route, 200, { data: [] });
  });
  await page.route("**/api/v1/platform/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/platform/tenants") {
      return json(route, 200, { data: [{ id: "tenant_1", name: "Northwind Couriers", slug: "northwind", status: "ACTIVE", plan: "PRO" }] });
    }
    if (url.pathname === "/api/v1/platform/impersonation-sessions/active") return json(route, 200, { sessions: [] });
    if (url.pathname === "/api/v1/platform/tenants/tenant_1/impersonation-sessions" && request.method() === "POST") {
      starts.push(request.postDataJSON());
      if (!fresh) return json(route, 403, { error: "MFA_REQUIRED", stepUp: true, message: "Fresh MFA verification is required for this action." });
      return json(route, 200, {
        exchangeCode: "Q2xhdWRlLWV4Y2hhbmdlLWNvZGUtZm9yLXRlc3RzLTEyMzQ1",
        portalUrl: "http://localhost:3000/auth/impersonate#code=Q2xhdWRlLWV4Y2hhbmdlLWNvZGUtZm9yLXRlc3RzLTEyMzQ1",
        impersonationSessionId: "imp_1",
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" }
      });
    }
    return json(route, 200, {});
  });

  await page.goto("/platform/impersonation");
  await page.getByLabel("Tenant", { exact: true }).fill("north");
  await page.getByRole("button", { name: /Northwind Couriers/ }).click();
  await page.getByLabel(/Reason \(shown to the tenant/).fill("Investigating a failed label print");

  const newTab = context.waitForEvent("page");
  await page.getByRole("button", { name: "Start Impersonation" }).click();

  const stepUp = page.getByRole("dialog", { name: "Confirm it’s you" });
  await expect(stepUp).toBeVisible();
  await stepUp.getByLabel("6-digit code").fill("123456");
  await stepUp.getByRole("button", { name: "Verify and continue" }).click();

  const tab = await newTab;
  await tab.waitForLoadState("domcontentloaded");
  expect(tab.url()).toContain("#code=");
  expect(tab.url()).not.toContain("token=");
  expect(starts).toEqual([
    { reason: "Investigating a failed label print", scopes: ["read"] },
    { reason: "Investigating a failed label print", scopes: ["read"] }
  ]);
  await expect(page.getByRole("status")).toContainText("Session started for Northwind Couriers");
});
