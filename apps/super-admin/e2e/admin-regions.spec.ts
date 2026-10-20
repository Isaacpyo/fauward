import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("ACC-L5-1 approving a region change (legacy /admin/regions → /platform/tenants/region-requests) needs a reason, passes the MFA step-up and shows it applied", async ({ context, page }) => {
  await addCsrfCookie(context);
  // Registered first so the specific routes below take precedence (Playwright runs the latest match first).
  await page.route("**/api/relay/**", (route) => json(route, 200, {}));
  let fresh = false;
  let applied = false;
  const decisions: Array<{ body: unknown; key: string | null }> = [];

  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/auth/mfa/verify") {
      fresh = true;
      return json(route, 200, { success: true });
    }
    return json(route, 200, { data: [] });
  });
  await page.route("**/api/internal/tenants/region-requests**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return json(route, 200, {
        requests: [
          {
            id: "rcr_1",
            tenantId: "tenant_1",
            tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" },
            currentRegion: "africa",
            requestedRegion: "europe",
            requestedByUserId: "u_admin",
            status: applied ? "APPLIED" : "PENDING",
            decisionReason: applied ? "Tenant moved operations to the EU" : null,
            decidedByPlatformUserId: applied ? "pu_1" : null,
            decidedAt: applied ? "2026-10-18T10:00:00.000Z" : null,
            appliedAt: applied ? "2026-10-18T10:00:00.000Z" : null,
            createdAt: "2026-10-17T10:00:00.000Z"
          }
        ].filter((row) => !new URL(request.url()).searchParams.get("status") || row.status === new URL(request.url()).searchParams.get("status")),
        regions: [
          { key: "africa", label: "Africa", paymentProviders: ["Paystack"] },
          { key: "europe", label: "Europe", paymentProviders: ["Stripe"] }
        ]
      });
    }
    decisions.push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"] ?? null });
    if (!fresh) return json(route, 403, { error: "MFA_REQUIRED", stepUp: true, message: "Fresh MFA verification is required for this action." });
    applied = true;
    return json(route, 200, { request: { id: "rcr_1", status: "APPLIED" } });
  });

  await page.goto("/admin/regions");
  await expect(page).toHaveURL(/\/platform\/tenants\/region-requests$/);
  await expect(page.getByTestId("region-request")).toContainText("Africa → Europe");
  await page.getByRole("button", { name: "Approve" }).click();

  const dialog = page.getByRole("dialog", { name: /Approve the move to Europe for Northwind Couriers/ });
  await dialog.getByLabel(/Reason/).fill("Tenant moved operations to the EU");
  await dialog.getByRole("button", { name: "Approve and apply" }).click();

  const stepUp = page.getByRole("dialog", { name: "Confirm it’s you" });
  await expect(stepUp).toBeVisible();
  await stepUp.getByLabel("6-digit code").fill("123456");
  await stepUp.getByRole("button", { name: "Verify and continue" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("No region change requests here.")).toBeVisible();
  await page.getByRole("button", { name: "Applied" }).click();
  await expect(page.getByTestId("region-request")).toContainText("Tenant moved operations to the EU");
  expect(decisions).toHaveLength(2);
  expect(decisions[1].body).toEqual({ status: "APPROVED", reason: "Tenant moved operations to the EU" });
  expect(decisions[1].key).toBe(decisions[0].key);
});
