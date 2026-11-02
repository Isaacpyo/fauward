import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// platform.jobs (WP-3.8): registered jobs with next/last run, run history with errors, dangerous manual trigger.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const FAILED_RUN = {
  id: "00000000-0000-4000-8000-000000000002",
  jobName: "customer.support-sla-sweep",
  bullJobId: "repeat:abc",
  status: "FAILED",
  triggeredBy: "SCHEDULE",
  reason: null,
  startedAt: "2026-10-20T09:45:00.000Z",
  finishedAt: "2026-10-20T09:45:01.200Z",
  durationMs: 1200,
  error: "connect ECONNREFUSED 10.0.0.5:5432",
  result: null
};

const JOBS = [
  { name: "customer.support-sla-sweep", pattern: "*/15 * * * *", description: "Flags platform tickets breaching their SLA.", timeoutMs: 900000, scheduled: true, nextRunAt: "2026-10-20T10:00:00.000Z", lastRun: FAILED_RUN },
  { name: "platform.activity-prune", pattern: "40 3 * * *", description: "Deletes console activity older than 180 days.", timeoutMs: 900000, scheduled: true, nextRunAt: "2026-10-21T03:40:00.000Z", lastRun: null }
];

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-JOB-1 ACC-JOB-3 the list shows every registered job with its next run and the last run's error", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/jobs") return json(route, 200, { scheduleReadable: true, data: JOBS });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/jobs");
  await expect(page.getByTestId("job-row")).toHaveCount(2);
  const sla = page.getByTestId("job-row").filter({ hasText: "customer.support-sla-sweep" });
  await expect(sla).toContainText("*/15 * * * *");
  await expect(sla).toContainText("failed");
  await expect(sla).toContainText("connect ECONNREFUSED 10.0.0.5:5432");
  await expect(sla).toContainText("1.2 s");
  await expect(page.getByTestId("job-row").filter({ hasText: "platform.activity-prune" })).toContainText("Never run");
});

test("ACC-JOB-4 Run now is dangerous; the triggered run shows the actor and reason in the history", async ({ page }) => {
  const triggers: unknown[] = [];
  let runs = [FAILED_RUN];
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/jobs") return json(route, 200, { scheduleReadable: true, data: JOBS });
    if (path === "/jobs/customer.support-sla-sweep/runs") return json(route, 200, { data: runs, nextCursor: null });
    if (path === "/jobs/customer.support-sla-sweep/trigger") {
      triggers.push(route.request().postDataJSON());
      runs = [
        { ...FAILED_RUN, id: "00000000-0000-4000-8000-000000000003", status: "SUCCEEDED", triggeredBy: "staff_001", reason: "Re-run after the DB failover", error: null, durationMs: 340, result: { breached: 2 } },
        ...runs
      ];
      return json(route, 202, { jobName: "customer.support-sla-sweep", bullJobId: "manual-customer.support-sla-sweep-1", queued: true });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/jobs/customer.support-sla-sweep");
  await expect(page.getByTestId("job-run")).toHaveCount(1);
  await page.getByRole("button", { name: "Run now" }).click();
  await page.getByLabel(/Reason/).fill("Re-run after the DB failover");
  await page.getByRole("dialog").getByRole("button", { name: "Run now" }).click();
  await expect(page.getByRole("status")).toContainText("customer.support-sla-sweep queued");
  expect(triggers).toEqual([{ reason: "Re-run after the DB failover" }]);
  await expect(page.getByTestId("job-run")).toHaveCount(2);
  const manual = page.getByTestId("job-run").first();
  await expect(manual).toContainText("staff_001");
  await expect(manual).toContainText("Re-run after the DB failover");
  await manual.click();
  await expect(manual).toContainText("breached");
});

test("Run now is disabled without platform.jobs.trigger; an unknown job says so", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(["platform.jobs.read"]));
    if (path === "/jobs") return json(route, 200, { scheduleReadable: false, data: JOBS.map((job) => ({ ...job, scheduled: null, nextRunAt: null })) });
    return json(route, 200, { data: [], nextCursor: null });
  });
  await page.goto("/platform/jobs");
  await expect(page.getByText("The BullMQ schedule could not be read")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run now" }).first()).toBeDisabled();
  await page.goto("/platform/jobs/not.a.job");
  await expect(page.getByText("No scheduled job named")).toBeVisible();
});
