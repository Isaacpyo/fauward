import { expect, test, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// customer.feedback (WP-2.8): board by status, detail status change with a message, NPS summary, permission, errors.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const tenant = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };
const request = { id: "fb_1", tenant, requester: { email: "sam@northwind.test", name: "Sam" }, type: "FEATURE_REQUEST", score: null, title: "API access on Starter", body: "One read-only integration.", featureKey: "apiAccess", source: "PLAN_GATE", status: "NEW", assignedPlatformUserId: null, createdAt: "2026-10-19T09:00:00.000Z", updatedAt: "2026-10-19T09:00:00.000Z" };
const nps = { overall: { responses: 2, promoters: 1, passives: 0, detractors: 1, nps: 0 }, byMonth: [{ month: "2026-10", responses: 2, promoters: 1, passives: 0, detractors: 1, nps: 0 }] };

async function mockFeedback(page: Page, options: { permissions?: string[]; listStatus?: number } = {}) {
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
    if (req.method() !== "GET") {
      writes.push({ method: req.method(), path, body: req.postDataJSON() });
      return json(route, 200, { item: { ...request, status: "PLANNED" } });
    }
    if (path === "/feedback") {
      if (options.listStatus) return json(route, options.listStatus, { error: "INTERNAL", message: "Feedback store unavailable" });
      const type = new URL(req.url()).searchParams.get("type");
      return json(route, 200, { data: type === "NPS" ? [{ ...request, id: "fb_n", type: "NPS", score: 3, title: null, body: "Too many clicks", status: "NEW" }] : [request], nps });
    }
    if (path === "/feedback/fb_1") return json(route, 200, { item: request, comments: [{ id: "c1", authorType: "STAFF", authorId: "pu_1", body: "Internal: check pricing impact", visibleToTenant: false, createdAt: "2026-10-19T10:00:00.000Z" }] });
    return json(route, 200, { data: [] });
  });
  return writes;
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-FB-1 ACC-FB-2 a PlanGate request sits under NEW and is moved to PLANNED with a message", async ({ page }) => {
  const writes = await mockFeedback(page);
  await page.goto("/customer/feedback");
  const column = page.getByRole("region", { name: "new" });
  await expect(column.getByTestId("feedback-card")).toContainText("API access on Starter");
  await expect(column.getByTestId("feedback-card")).toContainText("apiAccess");
  await column.getByTestId("feedback-card").click();
  await expect(page.getByTestId("feedback-meta")).toContainText("plan gate");
  await expect(page.getByTestId("feedback-comments")).toContainText("internal");
  await page.getByLabel("Move to status").selectOption("PLANNED");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Message to the requester (optional)").fill("Scheduled for the November release.");
  await dialog.getByRole("button", { name: "Move" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({ method: "PATCH", path: "/feedback/fb_1", body: { status: "PLANNED", message: "Scheduled for the November release." } });
});

test("ACC-FB-3 the NPS page shows the score, the split and each month", async ({ page }) => {
  await mockFeedback(page);
  await page.goto("/customer/feedback/nps");
  await expect(page.getByTestId("nps-overall")).toContainText("Detractors");
  await expect(page.getByTestId("nps-month")).toContainText("2026-10");
  await expect(page.getByTestId("nps-month")).toContainText("1 / 0 / 1");
  await expect(page.getByText("Too many clicks")).toBeVisible();
});

test("WP-2.8 read-only staff cannot comment; a failing board shows the API error", async ({ page }) => {
  await mockFeedback(page, { permissions: ["customer.feedback.read"] });
  await page.goto("/customer/feedback/fb_1");
  await page.getByLabel("Comment").fill("Thanks!");
  await expect(page.getByRole("button", { name: "Add comment" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add comment" })).toHaveAttribute("title", "Requires customer.feedback.write");
  await page.unrouteAll();
  await mockFeedback(page, { listStatus: 500 });
  await page.goto("/customer/feedback");
  await expect(page.getByRole("alert")).toContainText("Feedback store unavailable");
});
