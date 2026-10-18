import { expect, test, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// trust.compliance (WP-2.5): DSAR queue → detail → state-machine actions, legal hold block/release, exports, errors.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const tenant = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };
const now = Date.now();
function dsar(overrides: Record<string, unknown> = {}) {
  return {
    id: "dsar_1",
    tenant,
    requestType: "ACCESS",
    subjectEmail: "alice@example.com",
    subjectUserId: "u_alice",
    status: "APPROVED",
    notes: null,
    details: { description: "Alice asked for a copy of everything we hold." },
    receivedAt: new Date(now - 10 * 86400000).toISOString(),
    dueAt: new Date(now + 20 * 86400000).toISOString(),
    overdue: false,
    identityVerifiedAt: new Date(now - 9 * 86400000).toISOString(),
    erasureCompletedAt: null,
    closedAt: null,
    createdAt: new Date(now - 10 * 86400000).toISOString(),
    ...overrides
  };
}
const exportRow = { id: "exp_1", tenant, dsarId: "dsar_1", exportType: "DSAR_BUNDLE", status: "READY", storageProvider: "POSTGRES", byteSize: 2048, sha256: "ab".repeat(32), tokenIssued: false, tokenExpiresAt: null, downloadedAt: null, error: null, requestedBy: "pu_1", createdAt: new Date(now - 86400000).toISOString() };
const hold = { id: "hold_1", tenant, scope: {}, reason: "Litigation 2026-17 preservation notice", status: "ACTIVE", createdBy: "pu_1", createdAt: new Date(now - 86400000).toISOString(), releasedBy: null, releasedAt: null, releaseReason: null };

async function mockCompliance(page: Page, options: { permissions?: string[]; detail?: Record<string, unknown>; legalHold?: boolean; listStatus?: number } = {}) {
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
    if (request.method() === "POST") {
      posts.push({ path, body: request.postDataJSON() });
      if (path.endsWith("/erase") && options.legalHold) return json(route, 409, { error: "LEGAL_HOLD_ACTIVE", message: `An active legal hold blocks erasure: ${hold.reason}`, holdId: hold.id });
      if (path.includes("/legal-holds/")) return json(route, 200, { hold: { ...hold, status: "RELEASED" } });
      return json(route, 200, { dsar: dsar({ status: "DELIVERED" }) });
    }
    if (path === "/compliance/dsar") {
      if (options.listStatus) return json(route, options.listStatus, { error: "INTERNAL", message: "DSAR store unavailable" });
      return json(route, 200, { data: [dsar({ status: "RECEIVED", overdue: true, dueAt: new Date(now - 2 * 86400000).toISOString() })], nextCursor: null });
    }
    if (path === "/compliance/dsar/dsar_1") {
      return json(route, 200, {
        dsar: dsar(options.detail),
        transitions: [{ id: "t1", fromStatus: null, toStatus: "RECEIVED", actorId: "u_admin", notes: "Tenant portal submission", createdAt: new Date(now - 10 * 86400000).toISOString() }],
        exports: [exportRow],
        legalHold: options.legalHold ? { id: hold.id, reason: hold.reason } : null,
        subjectAccount: { id: "u_alice", role: "CUSTOMER", name: "Alice Ng", createdAt: new Date(now - 400 * 86400000).toISOString() }
      });
    }
    if (path === "/compliance/legal-holds") return json(route, 200, { data: [hold] });
    if (path === "/compliance/exports") return json(route, 200, { data: [exportRow] });
    return json(route, 200, { data: [] });
  });
  return posts;
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-DSAR-5 the queue shows overdue requests; ACC-L4-1 an approved ACCESS request is delivered with a reason", async ({ page }) => {
  const posts = await mockCompliance(page);
  await page.goto("/trust/compliance");
  await expect(page).toHaveURL(/\/trust\/compliance\/dsar$/);
  await expect(page.getByTestId("dsar-row")).toContainText("Overdue by 2 day(s)");
  await expect(page.getByTestId("dsar-row").getByTestId("tenant-chip")).toHaveText("Northwind Couriers");
  await page.getByTestId("dsar-row").click();
  await expect(page.getByTestId("dsar-status")).toContainText("approved");
  await expect(page.getByTestId("dsar-export")).toContainText("2.0 KB");
  await page.getByRole("button", { name: "Deliver" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Reason/).fill("Bundle reviewed, identity verified by phone");
  await dialog.getByRole("button", { name: "Deliver" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ path: "/compliance/dsar/dsar_1/deliver", body: { reason: "Bundle reviewed, identity verified by phone" } });
});

test("ACC-DSAR-4 erasure under an active hold shows the banner and the API's 409 in the dialog", async ({ page }) => {
  await mockCompliance(page, { detail: { requestType: "ERASURE", status: "DATA_GATHERED" }, legalHold: true });
  await page.goto("/trust/compliance/dsar/dsar_1");
  await expect(page.getByRole("alert")).toContainText("An active legal hold blocks erasure");
  await page.getByRole("button", { name: "Erase" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Reason/).fill("Subject confirmed the request in writing");
  await dialog.getByRole("button", { name: "Erase" }).click();
  await expect(dialog.getByRole("alert")).toContainText("An active legal hold blocks erasure");
});

test("ACC-DSAR-6 a legal hold is released with a reason", async ({ page }) => {
  const posts = await mockCompliance(page);
  await page.goto("/trust/compliance/legal-hold");
  await expect(page.getByTestId("legal-hold")).toContainText("Litigation 2026-17 preservation notice");
  await page.getByRole("button", { name: "Release" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Reason/).fill("Case settled, preservation lifted");
  await dialog.getByRole("button", { name: "Release" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ path: "/compliance/legal-holds/hold_1/release", body: { reason: "Case settled, preservation lifted" } });
  await page.goto("/trust/compliance/exports");
  await expect(page.getByTestId("export-row")).toContainText("2048 B");
});

test("WP-2.5 read-only staff cannot act; a failing queue shows the API error", async ({ page }) => {
  await mockCompliance(page, { permissions: ["trust.compliance.dsar.read"] });
  await page.goto("/trust/compliance/dsar/dsar_1");
  await expect(page.getByRole("button", { name: "Deliver" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Deliver" })).toHaveAttribute("title", "Requires trust.compliance.dsar.deliver");
  await page.unrouteAll();
  await mockCompliance(page, { listStatus: 500 });
  await page.goto("/trust/compliance/dsar");
  await expect(page.getByRole("alert")).toContainText("DSAR store unavailable");
});
