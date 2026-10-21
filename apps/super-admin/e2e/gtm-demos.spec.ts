import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// gtm.demos (WP-4.15): create from a template (password and share link shown once), replace the share link, tear down
// with a reason.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TEMPLATES = {
  data: [
    { id: "courier", name: "Courier", description: "Same-day and next-day parcels around UK cities.", plan: "PRO", organisations: 5, shipments: 40 },
    { id: "freight-forwarder", name: "Freight forwarder", description: "Palletised and international freight.", plan: "ENTERPRISE", organisations: 4, shipments: 30 }
  ],
  limits: { maxDays: 30, defaultDays: 14, sessionHours: 8 }
};
function demo(overrides: Record<string, unknown> = {}) {
  return {
    id: "demo_1",
    tenant: { id: "tenant_d1", name: "Northwind Couriers (demo)", slug: "demo-northwind-couriers-a1b2c3", status: "DEMO", closed: false },
    template: { id: "courier", name: "Courier" },
    prospectName: "Northwind Couriers",
    status: "ACTIVE",
    expiresAt: "2026-11-04T09:00:00.000Z",
    adminEmail: "admin@demo-northwind-couriers-a1b2c3.demo.invalid",
    shareLinkActive: true,
    shareRotatedAt: null,
    seedSummary: { organisations: 5, shipments: 40, events: 180 },
    createdAt: "2026-10-21T09:00:00.000Z",
    endedAt: null,
    endReason: null,
    ...overrides
  };
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-DEMO-1 creating a demo sends template, prospect and days and shows the password and share link once", async ({ page }) => {
  const posts: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/demos/templates") return json(route, 200, TEMPLATES);
    if (path === "/demos" && request.method() === "POST") {
      posts.push(request.postDataJSON());
      return json(route, 201, { demo: demo(), credentials: { email: "admin@demo-northwind-couriers-a1b2c3.demo.invalid", password: "Xq3v9-one-time-pw" }, shareUrl: "https://app.fauward.com/demo/share-token-abc" });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/demos/create");
  await page.getByLabel("Template").selectOption("freight-forwarder");
  await page.getByLabel("Prospect name").fill("Northwind Couriers");
  await page.getByLabel("Runs for (days)").fill("10");
  await page.getByRole("button", { name: "Create demo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("demo-password")).toHaveText("Xq3v9-one-time-pw");
  await expect(page.getByTestId("demo-share-url")).toHaveText("https://app.fauward.com/demo/share-token-abc");
  expect(posts).toEqual([{ template: "freight-forwarder", prospectName: "Northwind Couriers", expiresInDays: 10 }]);
});

test("ACC-DEMO-2 replacing the share link shows the new link once", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/demos/templates") return json(route, 200, TEMPLATES);
    if (path === "/demos/demo_1/share-link") return json(route, 200, { demo: demo({ shareRotatedAt: "2026-10-21T10:00:00.000Z" }), shareUrl: "https://app.fauward.com/demo/new-token-xyz" });
    if (path === "/demos/demo_1") return json(route, 200, demo());
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/demos/demo_1");
  await expect(page.getByTestId("demo-seed")).toContainText("5 customers · 40 shipments");
  await page.getByRole("button", { name: "Replace share link" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Replace link" }).click();
  await expect(page.getByTestId("demo-share-url")).toHaveText("https://app.fauward.com/demo/new-token-xyz");
  await expect(page.getByRole("status")).toContainText("Share link replaced.");
});

test("ACC-DEMO-3 tearing down sends the reason and reports the deactivated users", async ({ page }) => {
  const deletes: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/demos/templates") return json(route, 200, TEMPLATES);
    if (path === "/demos/demo_1" && request.method() === "DELETE") {
      deletes.push({ path, body: request.postDataJSON() });
      return json(route, 200, { demo: demo({ status: "TORN_DOWN", shareLinkActive: false, endedAt: "2026-10-21T11:00:00.000Z", endReason: "Prospect chose another vendor" }), usersDeactivated: 1 });
    }
    if (path === "/demos/demo_1") return json(route, 200, demo());
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/demos/demo_1");
  await page.getByRole("button", { name: "Tear down" }).click();
  await page.getByLabel(/Reason/).fill("Prospect chose another vendor");
  await page.getByRole("dialog").getByRole("button", { name: "Tear down" }).click();
  await expect(page.getByRole("status")).toContainText("Demo torn down; 1 user deactivated.");
  expect(deletes).toEqual([{ path: "/demos/demo_1", body: { reason: "Prospect chose another vendor" } }]);
});

test("the templates page lists the code-defined templates", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/demos/templates") return json(route, 200, TEMPLATES);
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/demos/templates");
  await expect(page.getByTestId("template-card")).toHaveCount(2);
  await expect(page.getByTestId("template-card").first()).toContainText("PRO plan · 5 customers · 40 shipments");
});
