import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const tenant = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind", status: "ACTIVE", plan: "PRO" };
const users = [
  { id: "user_admin", email: "owner@northwind.test", firstName: "Ada", lastName: null, role: "TENANT_ADMIN", isActive: true, mfaEnabled: true, lastLogin: null, createdAt: "2026-09-01T00:00:00.000Z" },
  { id: "user_ops", email: "ops@northwind.test", firstName: null, lastName: null, role: "TENANT_STAFF", isActive: true, mfaEnabled: false, lastLogin: null, createdAt: "2026-09-02T00:00:00.000Z" }
];
const endedSession = {
  id: "imp_9",
  platformUserId: "staff_001",
  targetTenantId: "tenant_1",
  targetUserId: "user_ops",
  scopes: ["read", "write"],
  reason: "Fixing a broken rate card on behalf of tenant",
  createdAt: "2026-10-17T09:00:00.000Z",
  expiresAt: "2026-10-17T09:15:00.000Z",
  exchangedAt: "2026-10-17T09:00:20.000Z",
  endedAt: "2026-10-17T09:10:00.000Z",
  revokedAt: "2026-10-17T09:10:00.000Z",
  endedReason: "REVOKED",
  targetTenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" },
  platformUser: { id: "staff_001", email: "staff@fauward.com", name: "Staff User" }
};
const tenantDetail = { identity: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" } };

async function mockConsole(context: BrowserContext, page: Page, state: { fresh: boolean; starts: unknown[] }) {
  // The tenant portal is not running in this test; answer the new tab with a blank page.
  await context.route("http://localhost:3000/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>tenant portal</body></html>" }));
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/auth/mfa/verify") {
      state.fresh = true;
      return json(route, 200, { success: true });
    }
    if (path === "/tenants") return json(route, 200, { data: [tenant], total: 1, nextCursor: null });
    if (path === "/tenants/tenant_1") return json(route, 200, tenantDetail);
    if (path === "/tenants/tenant_1/users") return json(route, 200, { data: users });
    if (path === "/impersonation/sessions" && request.method() === "GET") {
      return json(route, 200, url.searchParams.get("status") === "ended" ? { sessions: [endedSession], nextCursor: null } : { sessions: [] });
    }
    if (path === "/impersonation/sessions/imp_9") {
      return json(route, 200, {
        session: endedSession,
        auditRows: [{ id: "audit_1", actorType: "IMPERSONATOR", actorId: "user_ops", action: "RATE_CARD_UPDATED", resourceType: "RATE_CARD", resourceId: "rc_1", timestamp: "2026-10-17T09:05:00.000Z", metadata: { impersonationSessionId: "imp_9", platformUserId: "staff_001" } }]
      });
    }
    if (path === "/impersonation/sessions" && request.method() === "POST") {
      state.starts.push(request.postDataJSON());
      if (!state.fresh) return json(route, 403, { error: "MFA_REQUIRED", stepUp: true, message: "Fresh MFA verification is required for this action." });
      return json(route, 200, {
        exchangeCode: "Q2xhdWRlLWV4Y2hhbmdlLWNvZGUtZm9yLXRlc3RzLTEyMzQ1",
        portalUrl: "http://localhost:3000/auth/impersonate#code=Q2xhdWRlLWV4Y2hhbmdlLWNvZGUtZm9yLXRlc3RzLTEyMzQ1",
        impersonationSessionId: "imp_1",
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        targetUser: { id: "user_ops", email: "ops@northwind.test", role: "TENANT_STAFF" },
        tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" }
      });
    }
    return json(route, 200, { data: [] });
  });
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-IMP-7 the start button stays disabled until a tenant, an active user and a long enough reason are chosen", async ({ context, page }) => {
  await mockConsole(context, page, { fresh: true, starts: [] });
  await page.goto("/platform/impersonation");
  const startButton = page.getByRole("button", { name: "Start Impersonation" });
  await expect(startButton).toBeDisabled();
  await page.getByLabel(/Reason \(shown to the tenant/).fill("Investigating a failed label print");
  await expect(startButton).toBeDisabled();
  await page.getByLabel("Tenant", { exact: true }).fill("north");
  await page.getByRole("button", { name: /Northwind Couriers/ }).click();
  await expect(startButton).toBeDisabled();
  await page.getByLabel(/Sign in as/).selectOption("user_ops");
  await expect(startButton).toBeEnabled();
  await page.getByLabel(/Reason \(shown to the tenant/).fill("short");
  await expect(startButton).toBeDisabled();
});

test("ACC-IMP-6 start impersonation with a reason, pass the MFA step-up, and the new tab gets #code= and no token", async ({ context, page }) => {
  const state = { fresh: false, starts: [] as unknown[] };
  await mockConsole(context, page, state);
  await page.goto("/platform/impersonation?tenantId=tenant_1");
  await expect(page.getByText("Tenant:")).toBeVisible();
  await page.getByLabel(/Sign in as/).selectOption("user_ops");
  await page.getByLabel("Duration").selectOption("15");
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
  const expected = { tenantId: "tenant_1", targetUserId: "user_ops", scopes: ["read"], expiresInMinutes: 15, reason: "Investigating a failed label print" };
  expect(state.starts).toEqual([expected, expected]);
  await expect(page.getByRole("status")).toContainText("Session started for Northwind Couriers as ops@northwind.test");
});

test("ACC-IMP-9 history links to the session's audit trail, which lists the tenant rows written as IMPERSONATOR", async ({ context, page }) => {
  await mockConsole(context, page, { fresh: true, starts: [] });
  await page.goto("/platform/impersonation");
  const row = page.getByTestId("impersonation-session-row").filter({ hasText: "Fixing a broken rate card" });
  await expect(row).toContainText("Read and write");
  await expect(row).toContainText("revoked");
  await row.getByRole("link", { name: "Audit trail" }).click();
  await expect(page).toHaveURL(/\/platform\/impersonation\/sessions\/imp_9$/);
  const auditRow = page.getByTestId("session-audit-row");
  await expect(auditRow).toHaveCount(1);
  await expect(auditRow).toContainText("RATE_CARD_UPDATED");
  await expect(auditRow).toContainText("IMPERSONATOR");
});
