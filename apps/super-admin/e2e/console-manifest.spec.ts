import { expect, test, type Page } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

const PILLAR_ROUTES = ["/platform", "/revenue", "/customer", "/trust", "/gtm"];

async function mockBackend(page: Page) {
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/internal/tenants") {
      const search = url.searchParams.get("search") ?? "";
      const row = (id: string, name: string, slug: string, status: string, plan: string) => ({
        id, name, slug, status, plan, effectivePlan: plan, customDomain: null, region: "uk_europe", createdAt: "2026-09-01T09:00:00.000Z", closedAt: null,
        mrrContribution: { amount: "0.00", currency: "GBP" }, shipmentsThisMonth: 0, staffCount: 1, healthScore: null
      });
      const tenants = [row("tenant_northwind", "Northwind Couriers", "northwind", "ACTIVE", "PRO"), row("tenant_harbour", "Harbour Freight", "harbour", "TRIALING", "STARTER")].filter((tenant) =>
        tenant.name.toLowerCase().includes(search.toLowerCase())
      );
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: tenants, total: tenants.length, nextCursor: null }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });
  await page.route("**/api/internal/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(meBody(ROOT_PERMISSIONS)) }));
}

test.beforeEach(async ({ context, page }) => {
  await addCsrfCookie(context);
  await mockBackend(page);
});

test("ACC-MAN-2 every sidebar entry opens its service page and never lands on /login", async ({ page }) => {
  test.setTimeout(240_000);
  const visited: string[] = [];
  for (const pillarRoute of PILLAR_ROUTES) {
    await page.goto(pillarRoute);
    const links = page.locator("aside nav a");
    await expect(links.first()).toBeVisible({ timeout: 30_000 });
    const hrefs = await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
    for (const href of hrefs) {
      await page.goto(pillarRoute);
      await page.locator(`aside nav a[href="${href}"]`).click();
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main")).not.toBeEmpty();
      visited.push(href);
    }
  }
  expect(visited).toHaveLength(39);
});

test("ACC-MAN-2 every pillar overview row opens its service page", async ({ page }) => {
  test.setTimeout(240_000);
  const rowLocator = "main div.flex.cursor-pointer.border-b";
  let rows = 0;
  for (const pillarRoute of PILLAR_ROUTES) {
    await page.goto(pillarRoute);
    await expect(page.locator(rowLocator).first()).toBeVisible({ timeout: 30_000 });
    const count = await page.locator(rowLocator).count();
    for (let index = 0; index < count; index += 1) {
      await page.goto(pillarRoute);
      await page.locator(rowLocator).nth(index).click();
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).not.toHaveURL(new RegExp(`${pillarRoute}$`));
      rows += 1;
    }
  }
  expect(rows).toBe(39);
});

test("ACC-MAN-3 /customer/360 shows the tenant picker and choosing a tenant opens its 360 page", async ({ page }) => {
  await page.goto("/customer/360");
  await expect(page.getByRole("heading", { name: "Customer 360" })).toBeVisible();
  await page.getByLabel("Find a tenant").fill("north");
  await page.getByRole("button", { name: /Northwind Couriers/ }).click();
  await expect(page).toHaveURL(/\/customer\/360\/tenant_northwind$/);
});

test("ACC-MAN-4 deferred services show ComingSoonPage and are absent from the sidebar and palette", async ({ page }) => {
  await page.goto("/customer/kb");
  await expect(page.getByTestId("coming-soon")).toContainText("Not planned");
  await expect(page.locator("aside nav")).not.toContainText("Knowledge Base");

  await page.goto("/revenue/recognition");
  await expect(page.getByTestId("coming-soon")).toContainText("Not planned");
  await expect(page.locator("aside nav")).not.toContainText("Revenue Recognition");

  await page.keyboard.press("Control+k");
  const palette = page.getByPlaceholder(/Go to a service/);
  await expect(palette).toBeVisible();
  await palette.fill("Recognition");
  await expect(page.getByText("Nothing matches.")).toBeVisible();
  await palette.fill("Knowledge");
  await expect(page.getByText("Nothing matches.")).toBeVisible();
});

test("ACC-MAN-4 planned services without a page show their target phase and keep a Preview sidebar entry", async ({ page }) => {
  await page.goto("/platform/jobs");
  await expect(page.getByTestId("coming-soon")).toContainText("Coming in Phase 3");
  const entry = page.locator('aside nav a[href="/platform/jobs"]');
  await expect(entry).toContainText("Background Jobs");
  await expect(entry).toContainText("Preview");

  await page.goto("/revenue/disputes");
  await expect(page.getByTestId("coming-soon")).toContainText("Coming in Phase 4");
});

test("preview service pages carry the PreviewBanner; the live IAM service does not", async ({ page }) => {
  await page.goto("/revenue/dunning");
  await expect(page.getByTestId("preview-banner")).toContainText("retry only records an event");
  await page.goto("/trust/iam/users");
  await expect(page.getByTestId("preview-banner")).toHaveCount(0);
});
