import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// revenue.tax (WP-4.7): overview counts and vendor banner, registration add, exemption approve/revoke with a reason
// and the Stripe mirror outcome.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TENANT = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind", taxExempt: false };
function exemption(overrides: Record<string, unknown> = {}) {
  return { id: "tx_1", tenant: TENANT, status: "PENDING", fileName: "vat-exempt.pdf", contentType: "application/pdf", byteSize: 2048, certificateUrl: "/tax/exemptions/tx_1/certificate", submittedAt: "2026-10-21T09:00:00.000Z", decidedAt: null, decisionReason: null, revokedAt: null, ...overrides };
}
const OFF = (vendor: string, missing: string[]) => ({ vendor, configured: false, missing });

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("the overview counts registrations, certificates to review and exempt tenants; no rate vendor is explained", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/tax/overview") return json(route, 200, { registrations: [{ id: "r1", region: "GB", taxId: "GB1", filingFrequency: "QUARTERLY", status: "ACTIVE", updatedAt: "2026-10-01T00:00:00.000Z" }], pendingExemptions: [exemption()], exemptTenants: 3, vendors: { stripeTax: OFF("stripe-tax", ["STRIPE_SECRET_KEY"]), anrok: OFF("anrok", ["ANROK_API_KEY"]), stripe: OFF("stripe", ["STRIPE_SECRET_KEY"]) } });
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/tax");
  await expect(page.getByTestId("tax-registrations-count")).toContainText("1");
  await expect(page.getByTestId("tax-pending-count")).toContainText("1");
  await expect(page.getByTestId("tax-exempt-count")).toContainText("3");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("ANROK_API_KEY");
  await expect(page.getByRole("link", { name: "Review 1 certificate" })).toBeVisible();
});

test("ACC-TAX-3 adding a registration posts region, tax id and frequency", async ({ page }) => {
  let rows: unknown[] = [];
  const posts: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/tax/registrations" && request.method() === "POST") {
      posts.push(request.postDataJSON());
      rows = [{ id: "r1", region: "GB", taxId: "GB123456789", filingFrequency: "MONTHLY", status: "ACTIVE", updatedAt: "2026-10-21T00:00:00.000Z" }];
      return json(route, 201, rows[0]);
    }
    if (path === "/tax/registrations") return json(route, 200, { data: rows });
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/tax/registrations");
  await expect(page.getByText("No tax registrations recorded.")).toBeVisible();
  await page.getByRole("button", { name: "Add registration" }).click();
  await page.getByLabel("Region").fill("GB");
  await page.getByLabel("Tax id").fill("GB123456789");
  await page.getByLabel("Filing frequency").selectOption("MONTHLY");
  await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("registration-row")).toContainText("GB123456789");
  expect(posts).toEqual([{ region: "GB", taxId: "GB123456789", filingFrequency: "MONTHLY" }]);
});

test("ACC-TAX-1 ACC-TAX-2 approving and revoking send the decision with a reason and report the Stripe mirror", async ({ page }) => {
  let row = exemption();
  const posts: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/tax/exemptions/tx_1/decision") {
      const body = request.postDataJSON() as { decision: string };
      posts.push(body);
      row = exemption({ status: body.decision === "APPROVE" ? "APPROVED" : "REVOKED" });
      return json(route, 200, { exemption: { id: "tx_1", status: row.status }, stripeMirror: body.decision === "APPROVE" ? { status: "MIRRORED", error: null } : { status: "FAILED", error: "stripe answered 500" } });
    }
    if (path === "/tax/exemptions") {
      const status = url.searchParams.get("status");
      return json(route, 200, { data: status === "ALL" || status === row.status ? [row] : [] });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/tax/exemptions");
  await expect(page.getByTestId("exemption-row")).toContainText("vat-exempt.pdf");
  await expect(page.getByRole("link", { name: "vat-exempt.pdf" })).toHaveAttribute("href", "/api/internal/tax/exemptions/tx_1/certificate");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByLabel(/Reason/).fill("Valid charity certificate");
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toContainText("exemption approved. Stripe updated.");

  await page.getByLabel("Exemption status").selectOption("APPROVED");
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByLabel(/Reason/).fill("Certificate expired last month");
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("status")).toContainText("Stripe could not be updated (stripe answered 500)");
  expect(posts).toEqual([
    { decision: "APPROVE", reason: "Valid charity certificate" },
    { decision: "REVOKE", reason: "Certificate expired last month" }
  ]);
});
