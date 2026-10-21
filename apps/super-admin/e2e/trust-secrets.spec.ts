import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// trust.secrets (WP-4.12): inventory with status/fingerprint (never values), Doppler unconfigured banner, expiring list,
// policy edit, mark rotated with a reason, read-only staff.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const DOPPLER_OFF = { vendor: "doppler", configured: false, missing: ["DOPPLER_API_TOKEN", "DOPPLER_PROJECT", "DOPPLER_CONFIG"] };
const RUN = { status: "SUCCEEDED", startedAt: "2026-10-21T04:50:00.000Z", finishedAt: "2026-10-21T04:50:02.000Z", error: null };

function secret(overrides: Record<string, unknown> = {}) {
  return {
    id: "sec_jwt",
    name: "Tenant access-token signing key",
    envName: "JWT_ACCESS_SECRET",
    source: "ENV",
    configured: true,
    fingerprint: "a1b2c3d4e5f6",
    owner: null,
    ownerTeam: "Platform",
    usedBy: ["Tenant portal and API sign-in"],
    integration: null,
    inRegistry: true,
    rotateEveryDays: 180,
    rotationNotes: null,
    firstSeenAt: "2026-05-01T00:00:00.000Z",
    lastSeenAt: "2026-10-21T04:50:00.000Z",
    lastRotatedAt: null,
    rotationDueAt: "2026-10-28T00:00:00.000Z",
    status: "DUE_SOON",
    updatedAt: "2026-10-21T04:50:00.000Z",
    ...overrides
  };
}

const STRIPE = secret({ id: "sec_stripe", name: "Stripe secret key", envName: "STRIPE_SECRET_KEY", configured: false, fingerprint: null, ownerTeam: "Finance", integration: "stripe", firstSeenAt: null, lastSeenAt: null, rotationDueAt: null, status: "NOT_CONFIGURED" });

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-SECR-1 the inventory lists set and unset secrets with fingerprints, the last run and the Doppler banner", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/secrets") return json(route, 200, { data: [secret(), STRIPE], total: 2, doppler: DOPPLER_OFF, lastInventoryRun: RUN });
    return json(route, 200, { data: [] });
  });
  await page.goto("/trust/secrets");
  await expect(page.getByTestId("secret-row")).toHaveCount(2);
  await expect(page.getByTestId("secret-row").filter({ hasText: "JWT_ACCESS_SECRET" })).toContainText("a1b2c3d4e5f6");
  await expect(page.getByTestId("secret-row").filter({ hasText: "JWT_ACCESS_SECRET" })).toContainText("Due soon");
  await expect(page.getByTestId("secret-row").filter({ hasText: "STRIPE_SECRET_KEY" })).toContainText("Not set");
  await expect(page.getByTestId("inventory-run")).toContainText("1 of 2 set");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("DOPPLER_API_TOKEN");
});

test("ACC-SECR-4 the expiring page lists due secrets; empty says nothing is due", async ({ page }) => {
  let rows = [secret(), secret({ id: "sec_mon", name: "Monitoring API key", envName: "MONITORING_API_KEY", status: "OVERDUE", rotationDueAt: "2026-10-01T00:00:00.000Z" })];
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/secrets/expiring") return json(route, 200, { data: rows, total: rows.length, windowDays: 14 });
    return json(route, 200, { data: [] });
  });
  await page.goto("/trust/secrets/expiring");
  await expect(page.getByTestId("expiring-row")).toHaveCount(2);
  await expect(page.getByTestId("expiring-row").filter({ hasText: "MONITORING_API_KEY" })).toContainText("Overdue");
  rows = [];
  await page.reload();
  await expect(page.getByText("Nothing is due for rotation in the next 14 days.")).toBeVisible();
});

test("the detail page saves the policy and records a manual rotation with a reason", async ({ page }) => {
  let current = secret();
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() !== "GET") calls.push({ method: request.method(), path, body: request.postDataJSON() });
    if (path === "/secrets/sec_jwt" && request.method() === "PATCH") {
      current = { ...current, ...(request.postDataJSON() as Record<string, unknown>) };
      return json(route, 200, current);
    }
    if (path === "/secrets/sec_jwt/mark-rotated") {
      current = { ...current, lastRotatedAt: "2026-10-21T10:00:00.000Z", status: "OK", rotationDueAt: "2027-04-19T10:00:00.000Z" };
      return json(route, 200, current);
    }
    if (path === "/secrets/sec_jwt") return json(route, 200, current);
    if (path === "/secrets/sec_jwt/audit") return json(route, 200, { data: [{ id: "a1", action: "SECRET_ROTATION_DETECTED", actorType: "SYSTEM", actorId: "trust.secret-inventory", actorEmail: null, reason: null, metadata: {}, createdAt: "2026-10-01T04:50:00.000Z" }], nextCursor: null });
    return json(route, 200, { data: [] });
  });
  await page.goto("/trust/secrets/sec_jwt");
  await expect(page.getByTestId("secret-facts")).toContainText("a1b2c3d4e5f6");
  await expect(page.getByTestId("secret-audit-row")).toContainText("Secret inventory");

  await page.getByLabel("Rotate every (days, empty = no policy)").fill("90");
  await page.getByLabel("Rotation notes").fill("Rotate with the release");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByRole("status")).toContainText("Policy saved.");
  expect(calls[0]).toEqual({ method: "PATCH", path: "/secrets/sec_jwt", body: { rotateEveryDays: 90, rotationNotes: "Rotate with the release" } });

  await page.getByRole("button", { name: "Take ownership" }).click();
  await expect(page.getByRole("status")).toContainText("You now own this secret.");
  expect(calls[1]).toEqual({ method: "PATCH", path: "/secrets/sec_jwt", body: { ownerId: "staff_001" } });

  await page.getByRole("button", { name: "Mark rotated" }).click();
  await page.getByLabel(/Reason/).fill("Rotated in the hosting dashboard");
  await page.getByRole("dialog").getByRole("button", { name: "Mark rotated" }).click();
  await expect(page.getByRole("status")).toContainText("Rotation recorded.");
  expect(calls[2]).toEqual({ method: "POST", path: "/secrets/sec_jwt/mark-rotated", body: { reason: "Rotated in the hosting dashboard" } });
});

test("ACC-SECR-5 read-only staff cannot change policy or mark rotated", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(["trust.secrets.read"]));
    if (path === "/secrets/sec_jwt") return json(route, 200, secret());
    return json(route, 200, { data: [], nextCursor: null });
  });
  await page.goto("/trust/secrets/sec_jwt");
  await expect(page.getByRole("button", { name: "Mark rotated" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mark rotated" })).toHaveAttribute("title", "Requires trust.secrets.write");
  await expect(page.getByRole("button", { name: "Take ownership" })).toBeDisabled();
});
