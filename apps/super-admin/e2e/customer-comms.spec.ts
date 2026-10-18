import { expect, test, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// customer.comms delivery log (WP-2.2): rows come from the notification worker; recipients need a reason + fresh MFA.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const row = (overrides: Record<string, unknown>) => ({
  id: "log_1",
  createdAt: "2026-10-18T09:00:00.000Z",
  updatedAt: "2026-10-18T09:00:01.000Z",
  sentAt: "2026-10-18T09:00:01.000Z",
  tenantId: "tenant_1",
  tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" },
  audience: "TENANT",
  userId: "u_1",
  platformUserId: null,
  channel: "EMAIL",
  event: "appeal_decided",
  template: "appeal_decided",
  status: "SENT",
  provider: "SMTP",
  attempts: 1,
  recipient: "a***@northwind.test",
  providerRef: null,
  error: null,
  ...overrides
});

async function mockLog(page: Page, options: { permissions?: string[] } = {}) {
  const requests: URL[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
    if (path === "/comms/delivery-log") {
      requests.push(url);
      const sensitive = url.searchParams.get("sensitive") === "true";
      return json(route, 200, {
        redacted: !sensitive,
        nextCursor: null,
        logs: [
          row({ recipient: sensitive ? "admin@northwind.test" : "a***@northwind.test" }),
          row({ id: "log_2", tenantId: null, tenant: null, audience: "STAFF", platformUserId: "pu_1", template: "staff_notification", status: "SKIPPED", provider: null, error: "EMAIL_PROVIDER_NOT_CONFIGURED", recipient: sensitive ? "safety@fauward.com" : "s***@fauward.com" })
        ]
      });
    }
    return json(route, 200, { data: [] });
  });
  return requests;
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("WP-2.2 the delivery log shows worker outcomes with tenant chips, redacted by default", async ({ page }) => {
  await mockLog(page);
  await page.goto("/customer/comms/delivery-log");
  const rows = page.getByTestId("delivery-log-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("SENT");
  await expect(rows.first()).toContainText("SMTP");
  await expect(rows.first()).toContainText("a***@northwind.test");
  await expect(rows.first().getByRole("link", { name: /Northwind Couriers/ })).toBeVisible();
  await expect(rows.nth(1)).toContainText("Fauward staff");
  await expect(rows.nth(1)).toContainText("EMAIL_PROVIDER_NOT_CONFIGURED");
});

test("WP-2.2 showing recipients asks for a reason and sends it with the sensitive request", async ({ page }) => {
  const requests = await mockLog(page);
  await page.goto("/customer/comms/delivery-log");
  await expect(page.getByTestId("delivery-log-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Show recipients" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/reason/i).fill("Tenant reports the appeal email never arrived");
  await dialog.getByRole("button", { name: "Show recipients" }).click();
  await expect(page.getByTestId("delivery-log-row").first()).toContainText("admin@northwind.test");
  const sensitive = requests.find((url) => url.searchParams.get("sensitive") === "true");
  expect(sensitive?.searchParams.get("reason")).toBe("Tenant reports the appeal email never arrived");
});

test("WP-2.2 staff without customer.comms.read see the access-denied state", async ({ page }) => {
  await mockLog(page, { permissions: ["customer.360.read"] });
  await page.goto("/customer/comms/delivery-log");
  await expect(page.getByText(/customer\.comms\.read/).first()).toBeVisible();
  await expect(page.getByTestId("delivery-log-row")).toHaveCount(0);
});
