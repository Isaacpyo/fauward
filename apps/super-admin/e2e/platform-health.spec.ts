import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// platform.health (WP-3.7): every card shows a measured value or the reason it is not measured.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const WORKERS = ["outbox", "notification", "webhook", "analytics", "scheduled", "history-writer", "ws-publisher", "escalation-sweeper", "agent"].map((name) => ({
  name,
  alive: name !== "agent",
  lastBeat: name === "agent" ? null : "2026-10-20T09:59:50.000Z"
}));

const REPORT = {
  asOf: "2026-10-20T10:00:00.000Z",
  windowMinutes: 15,
  db: { latencyMs: 4 },
  redis: { latencyMs: 1 },
  uptimeSeconds: 93_784,
  version: { version: "1.42.0", commit: "edbd053aa1" },
  http: { p50: 50, p95: 200, p99: 1000, count: 1200, errorRate5xx: 0.0125, rpm: 80 },
  routes: [
    { group: "/api/v1/shipments", p50: 50, p95: 300, p99: 1000, count: 600, errorRate5xx: 0.02, rpm: 40 },
    { group: "/health", p50: 5, p95: 5, p99: 5, count: 300, errorRate5xx: 0, rpm: 20 }
  ],
  workers: WORKERS,
  queuesSummary: { queues: 8, waiting: 12, active: 2, failed1h: 3, dlqDepth: 5, paused: 1 }
};

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-HLTH-1 ACC-HLTH-2 the page shows the measured percentiles, route groups and dead workers", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/health") return json(route, 200, REPORT);
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/health");
  await expect(page.getByTestId("health-db")).toContainText("4ms");
  await expect(page.getByTestId("health-uptime")).toContainText("1d 2h");
  await expect(page.getByTestId("health-version")).toContainText("1.42.0 · edbd053");
  await expect(page.getByTestId("health-latency")).toContainText("200ms");
  await expect(page.getByTestId("health-errors")).toContainText("1.3%");
  await expect(page.getByTestId("health-queues")).toContainText("5 dead-lettered · 1 paused");
  await expect(page.getByTestId("route-latency")).toHaveCount(2);
  await expect(page.getByTestId("route-latency").first()).toContainText("/api/v1/shipments");
  await expect(page.getByTestId("worker-agent")).toContainText("No heartbeat");
  await expect(page.getByTestId("worker-notification")).toContainText("Alive");
});

test("ACC-HLTH-3 unmeasured values show their reason, never a dash", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/health") {
      return json(route, 200, {
        ...REPORT,
        version: { unavailable: true, reason: "APP_VERSION and GIT_COMMIT are not set on this deployment" },
        http: { unavailable: true, reason: "No API requests recorded in the last 15 minutes" },
        routes: [],
        workers: { unavailable: true, reason: "Worker heartbeats could not be read from Redis" }
      });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/health");
  await expect(page.getByTestId("health-version")).toContainText("Not measured: APP_VERSION and GIT_COMMIT are not set on this deployment");
  await expect(page.getByTestId("health-latency")).toContainText("Not measured: No API requests recorded in the last 15 minutes");
  await expect(page.getByText("Not measured: Worker heartbeats could not be read from Redis")).toBeVisible();
  await expect(page.getByText("No route groups recorded in this window.")).toBeVisible();
});

test("platform.health shows the API error instead of empty cards", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/health") return json(route, 500, { error: "INTERNAL", message: "Database unreachable" });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/health");
  await expect(page.getByRole("alert")).toContainText("Unable to load system health");
});
