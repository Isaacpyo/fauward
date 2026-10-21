import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// customer.qbr (WP-4.9): tenants due and recent decks, generate a quarter, deck sections with empty ones labelled,
// notes → ready → share.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TENANT = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };
function deck(overrides: Record<string, unknown> = {}) {
  return { id: "deck_1", tenant: TENANT, period: "2026-Q3", periodStart: "2026-07-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z", status: "DRAFT", notes: null, generatedAt: "2026-10-21T09:00:00.000Z", error: null, sharedAt: null, updatedAt: "2026-10-21T09:00:00.000Z", ...overrides };
}
const SECTIONS = [
  { key: "shipments", title: "Shipments & SLA", empty: false, emptyText: null, items: [{ label: "Shipments created", value: "312" }, { label: "Delivered on time (against the estimate)", value: "280 of 300 (93%)" }], notes: [] },
  { key: "ai", title: "AI usage", empty: true, emptyText: "No data for this period", items: [], notes: [] }
];

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("the QBR list shows tenants due for the last quarter and recent decks", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/qbr") return json(route, 200, { decks: [deck()], due: { period: "2026-Q3", tenants: [{ id: "tenant_2", name: "Harbour Freight", slug: "harbour" }] } });
    return json(route, 200, { data: [] });
  });
  await page.goto("/customer/qbr");
  await expect(page.getByText("Due for 2026-Q3 (1)")).toBeVisible();
  await expect(page.getByTestId("qbr-due")).toContainText("Harbour Freight");
  await expect(page.getByTestId("qbr-deck-row")).toContainText("2026-Q3");
});

test("ACC-QBR-3 generating a quarter posts the period and says when it is already generating", async ({ page }) => {
  const posts: unknown[] = [];
  let queued = true;
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/qbr/tenants/tenant_1/generate") {
      posts.push(request.postDataJSON());
      const body = { deckId: "deck_1", status: "GENERATING", period: "2026-Q3", queued };
      queued = false;
      return json(route, 202, body);
    }
    if (path === "/qbr/tenants/tenant_1") return json(route, 200, { tenant: TENANT, decks: [], nextPeriod: "2026-Q3" });
    return json(route, 200, { data: [] });
  });
  await page.goto("/customer/qbr/tenants/tenant_1");
  await expect(page.getByLabel("Quarter")).toHaveValue("2026-Q3");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByRole("status")).toContainText("Generating 2026-Q3");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByRole("status")).toContainText("2026-Q3 is already being generated.");
  expect(posts).toEqual([{ period: "2026-Q3" }, { period: "2026-Q3" }]);
});

test("ACC-QBR-2 ACC-QBR-4 the deck shows sections (empty ones labelled); notes, ready and share", async ({ page }) => {
  let current: Record<string, unknown> = { ...deck(), sections: SECTIONS, hasHtml: true };
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() !== "GET") calls.push({ method: request.method(), path, body: request.postDataJSON() });
    if (path === "/qbr/decks/deck_1" && request.method() === "PATCH") {
      current = { ...current, ...(request.postDataJSON() as Record<string, unknown>) };
      return json(route, 200, current);
    }
    if (path === "/qbr/decks/deck_1/share") {
      current = { ...current, status: "SHARED", sharedAt: "2026-10-21T10:00:00.000Z" };
      return json(route, 200, { deck: current, notified: { inApp: 2, emailsQueued: 0 } });
    }
    if (path === "/qbr/decks/deck_1") return json(route, 200, current);
    return json(route, 200, { data: [] });
  });
  await page.goto("/customer/qbr/decks/deck_1");
  await expect(page.getByTestId("qbr-section").first()).toContainText("280 of 300 (93%)");
  await expect(page.getByTestId("qbr-section").nth(1)).toContainText("No data for this period");
  await expect(page.getByRole("link", { name: "Download HTML" })).toHaveAttribute("href", "/api/internal/qbr/decks/deck_1/download");
  await page.getByLabel("Deck notes").fill("On-time delivery improved all quarter.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByRole("status")).toContainText("Notes saved.");
  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByRole("status")).toContainText("Marked ready.");
  await page.getByRole("button", { name: "Share with the tenant" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("status")).toContainText("Shared; 2 admin(s) notified.");
  expect(calls).toEqual([
    { method: "PATCH", path: "/qbr/decks/deck_1", body: { notes: "On-time delivery improved all quarter." } },
    { method: "PATCH", path: "/qbr/decks/deck_1", body: { status: "READY" } },
    { method: "POST", path: "/qbr/decks/deck_1/share", body: {} }
  ]);
});
