import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// platform.database (WP-4.4): read-only tabs; a db-push database and a missing pg_stat_statements are named, not hidden.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mock(page: import("@playwright/test").Page, overrides: Record<string, unknown> = {}) {
  const bodies: Record<string, unknown> = {
    "/database/migrations": {
      tracked: true,
      repoAvailable: true,
      degraded: null,
      summary: { applied: 1, failed: 1, pending: 1, rolledBack: 0, notInRepo: 0 },
      data: [
        { name: "0062_health_score_inputs", status: "APPLIED", inRepo: true, startedAt: "2026-10-01T00:00:00.000Z", finishedAt: "2026-10-01T00:00:01.000Z", logs: null },
        { name: "0063_incidents_native", status: "FAILED", inRepo: true, startedAt: "2026-10-21T00:00:00.000Z", finishedAt: null, logs: "ERROR: column already exists" },
        { name: "0064_secret_inventory", status: "PENDING", inRepo: true, startedAt: null, finishedAt: null, logs: null }
      ]
    },
    "/database/tables": { data: [{ name: "shipments", rowEstimate: 120000, totalBytes: 52428800, tableBytes: 41943040, indexBytes: 10485760, deadTuples: 12, lastVacuumAt: "2026-10-20T03:00:00.000Z", lastAnalyzeAt: null }], totalBytes: 52428800 },
    "/database/slow-queries": { available: false, extension: "pg_stat_statements", reason: "The pg_stat_statements extension is not enabled on this database, so query timings are not recorded.", data: [] },
    "/database/connections": { data: [{ state: "idle", count: 7 }, { state: "active", count: 2 }], total: 9, maxConnections: 100 },
    ...overrides
  };
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path in bodies) return json(route, 200, bodies[path]);
    return json(route, 200, { data: [] });
  });
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-DB-1 migrations show applied, failed (with its log) and pending", async ({ page }) => {
  await mock(page);
  await page.goto("/platform/database");
  await expect(page.getByTestId("migration-summary")).toContainText("1 applied · 1 failed · 1 pending");
  await expect(page.getByTestId("migration-row").filter({ hasText: "0063_incidents_native" })).toContainText("column already exists");
  await expect(page.getByTestId("migration-row").filter({ hasText: "0064_secret_inventory" })).toContainText("pending");
});

test("a database without migration history says so", async ({ page }) => {
  await mock(page, { "/database/migrations": { tracked: false, repoAvailable: true, degraded: "This database has no _prisma_migrations table: its schema was created with `prisma db push`, so no migration history exists.", summary: { applied: 0, failed: 0, pending: null, rolledBack: 0, notInRepo: 0 }, data: [{ name: "0001_init", status: null, inRepo: true, startedAt: null, finishedAt: null, logs: null }] } });
  await page.goto("/platform/database");
  await expect(page.getByTestId("degraded-not-wired")).toContainText("prisma db push");
  await expect(page.getByTestId("migration-row")).toContainText("untracked");
});

test("ACC-DB-2 slow queries name the missing extension; tables and connections render", async ({ page }) => {
  await mock(page);
  await page.goto("/platform/database?tab=slow-queries");
  await expect(page.getByTestId("degraded-not-wired")).toContainText("pg_stat_statements");
  await page.getByRole("tab", { name: "Tables" }).click();
  await expect(page.getByTestId("table-row")).toContainText("50.0 MB");
  await page.getByRole("tab", { name: "Connections" }).click();
  await expect(page.getByTestId("connection-total")).toContainText("9 connections to this database (server limit 100)");
});
