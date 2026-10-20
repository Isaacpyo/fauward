import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// D7 read side (WP-3.5): dashboard feed with pillar/severity filters, live rows from the SSE stream, "Last activity".

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    occurredAt: "2026-10-20T09:00:00.000Z",
    tenantId: "tenant_1",
    tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" },
    service: "customer.support",
    type: "ticket.created",
    actorType: "TENANT_USER",
    actorId: "user_1",
    actorLabel: "Ada Admin",
    subjectType: "ticket",
    subjectId: "ticket_1",
    summary: "Ticket FW-1001 opened: Labels not printing",
    severity: "INFO",
    consoleLink: "/customer/support/tickets/ticket_1",
    metadata: {},
    ...overrides
  };
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-ACT-6 a new activity appears in the dashboard feed without a reload and the numbers refresh", async ({ page }) => {
  let streamRequests = 0;
  let overviewRequests = 0;
  const listQueries: string[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/activity") {
      listQueries.push(url.search);
      return json(route, 200, { data: [row("00000000-0000-4000-8000-000000000001")], nextCursor: null });
    }
    if (path === "/activity/stream") {
      streamRequests += 1;
      // First connection: ready, then the server ends it; the browser reconnects after `retry` and gets the new row.
      const body =
        streamRequests === 1
          ? `retry: 2500\nevent: ready\ndata: {}\n\n`
          : `retry: 60000\nevent: ready\ndata: {}\n\nid: 2\nevent: activity\ndata: ${JSON.stringify(
              row("00000000-0000-4000-8000-000000000002", { service: "platform.queues", type: "queue.paused", summary: "notification queue paused: SendGrid incident", severity: "ATTENTION", tenantId: null, tenant: null, consoleLink: "/platform/queues/notification", actorType: "STAFF", actorLabel: "Ops" })
            )}\n\n`;
      return route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }, body });
    }
    if (path === "/metrics/overview") {
      overviewRequests += 1;
      return json(route, 200, { asOf: "2026-10-20T10:00:00.000Z", activeTenants: 10, pendingApprovals: {} });
    }
    if (path === "/activity/summary") return json(route, 200, { services: [] });
    return json(route, 200, { data: [] });
  });

  await page.goto("/");
  await expect(page.getByTestId("dashboard-activity-row")).toHaveCount(1);
  await expect(page.getByTestId("dashboard-activity-row").first()).toContainText("Labels not printing");
  const overviewBefore = overviewRequests;

  await expect(page.getByTestId("dashboard-activity-row")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByTestId("dashboard-activity-row").first()).toContainText("notification queue paused: SendGrid incident");
  await expect.poll(() => overviewRequests, { timeout: 10_000 }).toBeGreaterThan(overviewBefore);

  // Filters go to the API as query parameters.
  await page.getByLabel("Pillar").selectOption("customer");
  await page.getByLabel("Severity").selectOption("ATTENTION");
  await expect.poll(() => listQueries.some((query) => query.includes("pillar=customer") && query.includes("severity=ATTENTION"))).toBe(true);
});

test("pillar overview shows each service's last activity from the summary", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/activity/summary") return json(route, 200, { services: [{ service: "platform.queues", lastOccurredAt: "2026-10-20T09:30:00.000Z", count: 3, alerts24h: 1 }] });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform");
  await expect(page.getByTestId("last-activity-platform.queues")).toHaveAttribute("datetime", "2026-10-20T09:30:00.000Z");
  await expect(page.getByText("No activity recorded").first()).toBeVisible();
});
