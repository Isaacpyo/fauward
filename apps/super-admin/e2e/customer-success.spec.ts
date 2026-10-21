import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// customer.success (WP-4.8): overview, at-risk reasons, expansion signals, scoring model + manual run, playbook
// create with steps and a trigger, manual run for a tenant, run history with per-step results.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TENANT = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("the overview, at-risk and expansion pages show real reasons and signals", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/success/overview") return json(route, 200, { scoredTenants: 12, distribution: { atRisk: 2, watch: 4, healthy: 6 }, movers: [{ tenant: TENANT, score: 41, previous: 63, change: -22, computedAt: "2026-10-21T01:30:00.000Z" }], lastScoringRun: { status: "SUCCEEDED", startedAt: "2026-10-21T01:30:00.000Z" } });
    if (path === "/success/at-risk") return json(route, 200, { data: [{ tenant: TENANT, score: 41, trend: "down", computedAt: "2026-10-21T01:30:00.000Z", reasons: ["score 41 < 45"], arr: "948.00", arrCurrency: "GBP" }], threshold: 45 });
    if (path === "/success/expansion") return json(route, 200, { data: [{ tenant: { ...TENANT, plan: "STARTER" }, signals: [{ limit: "shipments this month", used: 270, of: 300, ratio: 0.9 }] }], month: "2026-10", threshold: 0.8 });
    return json(route, 200, { data: [] });
  });
  await page.goto("/customer/success");
  await expect(page.getByTestId("cs-at-risk")).toContainText("2");
  await expect(page.getByTestId("cs-mover")).toContainText("63 → 41 (-22)");
  await page.getByRole("link", { name: "At risk" }).click();
  await expect(page.getByTestId("at-risk-row")).toContainText("score 41 < 45");
  await expect(page.getByTestId("at-risk-row")).toContainText("948.00 GBP");
  await page.getByRole("link", { name: "Expansion" }).click();
  await expect(page.getByTestId("expansion-row")).toContainText("shipments this month: 270 of 300 (90%)");
});

test("the scoring model lists weighted factors; Run scoring now queues the job", async ({ page }) => {
  const posts: string[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() === "POST") {
      posts.push(path);
      return json(route, 202, { queued: true, jobId: "job_1" });
    }
    if (path === "/success/health-scoring") return json(route, 200, { version: 2, minTenantAgeDays: 14, bands: { atRiskBelow: 45, healthyFrom: 80 }, factors: [{ key: "shipmentTrend", weight: 20, label: "Shipment trend", definition: "Last 30 days vs the 30 before." }] });
    return json(route, 200, { data: [] });
  });
  await page.goto("/customer/success/health-scoring");
  await expect(page.getByTestId("scoring-factor")).toContainText("weight 20");
  await page.getByRole("button", { name: "Run scoring now" }).click();
  await expect(page.getByRole("status")).toContainText("Scoring run queued");
  expect(posts).toEqual(["/success/health-scoring/run"]);
});

test("ACC-CS-4 a playbook is created with steps and a trigger, run for a tenant, and its run history shows each step", async ({ page }) => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const playbook = { id: "pb_1", name: "Low health rescue", description: null, trigger: "HEALTH_BELOW", triggerValue: 40, steps: [{ type: "EMAIL_TENANT_ADMINS", template: "platform_announcement", subject: "Checking in", body: "How can we help?" }, { type: "WAIT", days: 2 }], active: true, runs: 0, running: 0, updatedAt: "2026-10-21T09:00:00.000Z" };
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() !== "GET") calls.push({ method: request.method(), path, body: request.postDataJSON() });
    if (path === "/success/playbooks" && request.method() === "POST") return json(route, 201, playbook);
    if (path === "/success/playbooks") return json(route, 200, { data: [playbook], triggers: ["MANUAL", "HEALTH_BELOW", "TRIAL_ENDING", "PAYMENT_FAILED"], templates: ["platform_announcement", "onboarding_nudge"] });
    if (path === "/tenants") return json(route, 200, { data: [{ ...TENANT, status: "ACTIVE", plan: "PRO" }] });
    if (path === "/success/playbooks/pb_1/run") return json(route, 201, { id: "run_1", playbookId: "pb_1", tenant: TENANT, status: "WAITING", triggerSource: "MANUAL", startedBy: "staff_001", currentStep: 2, steps: [], nextActionAt: null, error: null, startedAt: null, completedAt: null });
    if (path === "/success/playbooks/pb_1/runs") {
      return json(route, 200, { data: [{ id: "run_1", playbookId: "pb_1", tenant: TENANT, status: "WAITING", triggerSource: "MANUAL", startedBy: "staff_001", currentStep: 2, steps: [{ ...playbook.steps[0], status: "DONE", result: { inApp: 1, emailsQueued: 1 } }, { ...playbook.steps[1], status: "WAITING" }], nextActionAt: "2026-10-23T09:00:00.000Z", error: null, startedAt: "2026-10-21T09:00:00.000Z", completedAt: null }] });
    }
    if (path === "/success/playbooks/pb_1") return json(route, 200, playbook);
    return json(route, 200, { data: [] });
  });

  await page.goto("/customer/success/playbooks/new");
  await page.getByLabel("Name", { exact: true }).fill("Low health rescue");
  await page.getByLabel("Trigger").selectOption("HEALTH_BELOW");
  await page.getByLabel("Trigger value").fill("40");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Step 1 subject").fill("Checking in");
  await page.getByLabel("Step 1 message").fill("How can we help?");
  await page.getByLabel("New step type").selectOption("WAIT");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Step 2 days").fill("2");
  await page.getByRole("button", { name: "Create playbook" }).click();
  await expect(page).toHaveURL(/\/customer\/success\/playbooks\/pb_1$/);
  expect(calls[0]).toEqual({ method: "POST", path: "/success/playbooks", body: { name: "Low health rescue", description: null, trigger: "HEALTH_BELOW", triggerValue: 40, steps: playbook.steps, active: true } });

  await page.getByRole("button", { name: "Run for a tenant" }).click();
  await page.getByLabel("Find a tenant").fill("north");
  await page.getByRole("button", { name: /Northwind Couriers/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start run" }).click();
  await expect(page.getByRole("status")).toContainText("Run started for Northwind Couriers: waiting.");
  expect(calls.at(-1)).toEqual({ method: "POST", path: "/success/playbooks/pb_1/run", body: { tenantId: "tenant_1" } });

  await page.getByRole("link", { name: "Runs" }).click();
  await expect(page.getByTestId("run-step").first()).toContainText("Email tenant admins: Checking in — done");
  await expect(page.getByTestId("run-step").nth(1)).toContainText("Wait 2 days — waiting");
});
