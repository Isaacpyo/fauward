import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// platform.incidents (WP-4.2): declare, tag a tenant, public update (→ tenant announcement), resolve, runbooks, TopBar
// active-incident pill, PagerDuty unconfigured banner.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const PD_OFF = { vendor: "pagerduty", configured: false, missing: ["PAGERDUTY_WEBHOOK_SECRET"] };
const TENANT = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };
const ME = { id: "staff_001", email: "staff@fauward.com", name: "Staff User" };

function incident(overrides: Record<string, unknown> = {}) {
  return {
    id: "inc_1",
    title: "Label printing failing",
    status: "INVESTIGATING",
    severity: "SEV2",
    vendor: "native",
    vendorId: null,
    services: ["labels"],
    commander: ME,
    createdBy: ME,
    publicSummary: null,
    postmortemUrl: null,
    announcementId: null,
    runbookIds: [],
    impactCount: 0,
    startedAt: "2026-10-21T08:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-10-21T08:00:00.000Z",
    updatedAt: "2026-10-21T08:00:00.000Z",
    impacts: [],
    updates: [],
    runbooks: { linked: [], suggested: [] },
    announcement: null,
    ...overrides
  };
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("the list shows active incidents first with the PagerDuty banner, and the TopBar pill links to the open incident", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/incidents") {
      const active = url.searchParams.get("status") === "ACTIVE";
      return json(route, 200, { data: active ? [incident({ impactCount: 3 })] : [incident({ impactCount: 3 }), incident({ id: "inc_0", title: "Old outage", status: "RESOLVED", severity: "SEV3", resolvedAt: "2026-10-20T10:00:00.000Z" })], total: active ? 1 : 2, pagerDuty: PD_OFF });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/incidents");
  await expect(page.getByTestId("incident-row")).toHaveCount(1);
  await expect(page.getByTestId("incident-row")).toContainText("Label printing failing");
  await expect(page.getByTestId("incident-row")).toContainText("SEV2");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("PAGERDUTY_WEBHOOK_SECRET");
  await page.getByLabel("Status filter").selectOption("ALL");
  await expect(page.getByTestId("incident-row")).toHaveCount(2);
  const pill = page.getByTestId("active-incident-pill");
  await expect(pill).toContainText("SEV2 · Label printing failing");
  await pill.click();
  await expect(page).toHaveURL(/\/platform\/incidents\/inc_1$/);
});

test("ACC-INC-1 declare → tag tenant → public update sends the right requests and shows the live announcement", async ({ page }) => {
  const posts: Array<{ path: string; body: unknown }> = [];
  let current = incident({ severity: "SEV3" });
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() === "POST") posts.push({ path, body: request.postDataJSON() });
    if (path === "/incidents" && request.method() === "POST") return json(route, 201, current);
    if (path === "/incidents") return json(route, 200, { data: [], total: 0, pagerDuty: PD_OFF });
    if (path === "/incidents/responders") return json(route, 200, { data: [ME] });
    if (path === "/tenants") return json(route, 200, { data: [{ ...TENANT, status: "ACTIVE", plan: "PRO" }] });
    if (path === "/incidents/inc_1/impacts") {
      current = { ...current, impacts: [{ id: "imp_1", tenant: TENANT, impactLevel: "DEGRADED", notes: null, createdAt: "2026-10-21T08:05:00.000Z" }], impactCount: 1 };
      return json(route, 201, { id: "imp_1", announcementExtended: false });
    }
    if (path === "/incidents/inc_1/updates") {
      const announcement = { id: "ann_1", type: "INCIDENT", title: "Service incident: Label printing failing", body: "Labels are delayed.", targetAll: false, tenantIds: [TENANT.id], dismissible: true, expiresAt: null, state: "ACTIVE" };
      current = { ...current, status: "IDENTIFIED", announcement, announcementId: "ann_1", updates: [{ id: "u1", status: "IDENTIFIED", body: "Labels are delayed.", isPublic: true, author: ME, createdAt: "2026-10-21T08:10:00.000Z" }] };
      return json(route, 201, { update: { id: "u1" }, announcement, notified: { tenants: 0, inApp: 0, emailsQueued: 0 } });
    }
    if (path === "/incidents/inc_1") return json(route, 200, current);
    return json(route, 200, { data: [] });
  });

  await page.goto("/platform/incidents");
  await expect(page.getByText("No incident is open.")).toBeVisible();
  await page.getByRole("button", { name: "Declare incident" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Label printing failing");
  await dialog.getByLabel("Severity").selectOption("SEV3");
  await dialog.getByLabel("Affected services (comma separated)").fill("labels, tracking");
  await dialog.getByLabel("Commander").selectOption(ME.id);
  await dialog.getByRole("button", { name: "Declare incident" }).click();
  await expect(page).toHaveURL(/\/platform\/incidents\/inc_1$/);
  expect(posts[0]).toEqual({ path: "/incidents", body: { title: "Label printing failing", severity: "SEV3", services: ["labels", "tracking"], commanderPlatformUserId: ME.id } });

  await page.getByRole("button", { name: "Tag tenant" }).click();
  await page.getByLabel("Find a tenant").fill("north");
  await page.getByRole("button", { name: /Northwind Couriers/ }).click();
  await page.getByRole("dialog").getByLabel("Impact").selectOption("DEGRADED");
  await page.getByRole("dialog").getByRole("button", { name: "Tag tenant" }).click();
  await expect(page.getByRole("status")).toContainText("Northwind Couriers tagged as degraded");
  await expect(page.getByTestId("incident-impacts").getByTestId("tenant-chip")).toHaveText("Northwind Couriers");

  await page.getByLabel("Update", { exact: true }).fill("Labels are delayed.");
  await page.getByLabel("New status (optional)").selectOption("IDENTIFIED");
  await page.getByLabel("Public (tenant banner)").check();
  await page.getByRole("button", { name: "Post public update" }).click();
  await expect(page.getByRole("status")).toContainText("Shown on 1 tenant(s)' banner");
  expect(posts.at(-1)).toEqual({ path: "/incidents/inc_1/updates", body: { body: "Labels are delayed.", isPublic: true, status: "IDENTIFIED", audience: "IMPACTED" } });
  await expect(page.getByTestId("incident-announcement")).toContainText("Live · 1 tenant(s)");
  await expect(page.getByTestId("incident-update")).toHaveCount(1);
});

test("ACC-INC-2 resolving sends the postmortem and final note; the announcement shows expired", async ({ page }) => {
  const announcement = { id: "ann_1", type: "INCIDENT", title: "Service incident", body: "Labels are delayed.", targetAll: false, tenantIds: [TENANT.id], dismissible: true, expiresAt: null, state: "ACTIVE" };
  let current = incident({ announcement, announcementId: "ann_1" });
  const posts: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/incidents/inc_1/resolve") {
      posts.push(request.postDataJSON());
      current = { ...current, status: "RESOLVED", resolvedAt: "2026-10-21T09:00:00.000Z", postmortemUrl: "https://docs.fauward.com/pm/1", announcement: { ...announcement, body: "All clear.", state: "EXPIRED" } };
      return json(route, 200, { incident: current, announcement: current.announcement });
    }
    if (path === "/incidents/inc_1") return json(route, 200, current);
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/incidents/inc_1");
  await page.getByRole("button", { name: "Resolve" }).click();
  await page.getByRole("dialog").getByLabel("Postmortem link (optional)").fill("https://docs.fauward.com/pm/1");
  await page.getByRole("dialog").getByLabel("Final public note (optional)").fill("All clear.");
  await page.getByRole("dialog").getByRole("button", { name: "Resolve incident" }).click();
  await expect(page.getByRole("status")).toContainText("The tenant announcement has expired");
  expect(posts).toEqual([{ postmortemUrl: "https://docs.fauward.com/pm/1", publicMessage: "All clear." }]);
  await expect(page.getByTestId("incident-announcement")).toContainText("Expired");
  await expect(page.getByRole("link", { name: "https://docs.fauward.com/pm/1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resolve" })).toHaveCount(0);
});

test("ACC-INC-4 runbooks: create, then link to an incident from its suggestions", async ({ page }) => {
  const runbook = { id: "rb_1", title: "Carrier API failover", slug: "carrier-api-failover", body: "1. Switch carrier", service: "labels", createdAt: "2026-10-21T08:00:00.000Z", updatedAt: "2026-10-21T08:00:00.000Z" };
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  let linked = false;
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() !== "GET") calls.push({ method: request.method(), path, body: request.postDataJSON() });
    if (path === "/incidents/runbooks" && request.method() === "POST") return json(route, 201, runbook);
    if (path === "/incidents/runbooks") return json(route, 200, { data: [runbook] });
    if (path === "/incidents/runbooks/rb_1") return json(route, 200, { ...runbook, linkedIncidents: [] });
    if (path === "/incidents/inc_1" && request.method() === "PATCH") {
      linked = true;
      return json(route, 200, incident({ runbookIds: ["rb_1"], runbooks: { linked: [runbook], suggested: [] } }));
    }
    if (path === "/incidents/inc_1") return json(route, 200, linked ? incident({ runbookIds: ["rb_1"], runbooks: { linked: [runbook], suggested: [] } }) : incident({ runbooks: { linked: [], suggested: [runbook] } }));
    return json(route, 200, { data: [] });
  });

  await page.goto("/platform/incidents/runbooks");
  await page.getByRole("link", { name: "New runbook" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Carrier API failover");
  await page.getByLabel("Service (optional)").fill("labels");
  await page.getByLabel("Steps (Markdown)").fill("1. Switch carrier");
  await page.getByRole("button", { name: "Create runbook" }).click();
  await expect(page).toHaveURL(/\/platform\/incidents\/runbooks\/rb_1$/);
  expect(calls[0]).toEqual({ method: "POST", path: "/incidents/runbooks", body: { title: "Carrier API failover", body: "1. Switch carrier", service: "labels" } });

  await page.goto("/platform/incidents/inc_1");
  await page.getByTestId("incident-runbooks").getByRole("button", { name: "Carrier API failover" }).click();
  await expect(page.getByRole("status")).toContainText("Linked Carrier API failover");
  expect(calls.at(-1)).toEqual({ method: "PATCH", path: "/incidents/inc_1", body: { runbookIds: ["rb_1"] } });
  await expect(page.getByTestId("incident-runbooks").getByRole("link", { name: "Carrier API failover" })).toBeVisible();
});

test("read-only staff see incidents but every write button is disabled with the permission named", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(["platform.incidents.read"]));
    if (path === "/incidents/inc_1") return json(route, 200, incident());
    return json(route, 200, { data: [], total: 0, pagerDuty: PD_OFF });
  });
  await page.goto("/platform/incidents/inc_1");
  await expect(page.getByRole("button", { name: "Resolve" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Resolve" })).toHaveAttribute("title", "Requires platform.incidents.write");
  await expect(page.getByRole("button", { name: "Tag tenant" })).toBeDisabled();
});
