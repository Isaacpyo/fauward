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

test("ACC-COM-5 ACC-L8-1 New announcement opens a working dialog with an audience preview; the list shows receipts", async ({ page }) => {
  const posts: unknown[] = [];
  const rows: Array<Record<string, unknown>> = [
    { id: "ann_1", type: "MAINTENANCE", title: "Saturday maintenance", body: "02:00 UTC", targetAll: true, tenantIds: [], planTiers: [], cta: null, dismissible: true, publishedAt: "2026-10-18T09:00:00.000Z", expiresAt: null, archivedAt: null, alsoEmail: false, state: "ACTIVE", receipts: { viewed: 12, dismissed: 4, ctaClicked: 0 } }
  ];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    const method = route.request().method();
    if (path === "/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(meBody(ROOT_PERMISSIONS)) });
    if (path === "/announcements/audience-preview") {
      const plans = url.searchParams.get("planTiers");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(plans === "PRO" ? { tenants: 3, users: 41 } : { tenants: 10, users: 120 }) });
    }
    if (path === "/announcements" && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      posts.push(body);
      rows.unshift({ ...body, id: "ann_2", publishedAt: "2026-10-19T09:00:00.000Z", archivedAt: null, state: "ACTIVE", receipts: { viewed: 0, dismissed: 0, ctaClicked: 0 } });
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(rows[0]) });
    }
    if (path === "/announcements") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: rows }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  await page.goto("/customer/comms");
  await expect(page.getByTestId("announcement-receipts").first()).toHaveText("12 viewed · 4 dismissed · 0 clicked");
  await page.getByRole("button", { name: "New announcement" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Pro webinar");
  await dialog.getByLabel("Message").fill("Join us on Thursday");
  await dialog.getByLabel("Audience").selectOption("plans");
  await dialog.getByLabel("PRO").check();
  await expect(dialog.getByTestId("audience-preview")).toHaveText("Reaches 3 tenant(s), 41 user(s).");
  await dialog.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("announcement-row").first()).toContainText("Pro webinar");
  expect(posts).toEqual([{ type: "INFO", title: "Pro webinar", body: "Join us on Thursday", targetAll: false, tenantIds: [], planTiers: ["PRO"], cta: null, dismissible: true, expiresAt: null, alsoEmail: false }]);
});
