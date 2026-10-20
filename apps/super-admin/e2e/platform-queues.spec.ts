import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// platform.queues (WP-3.6): list with the real DLQ column, detail with redacted jobs, dangerous replay that drops the DLQ.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function queue(name: string, overrides: Record<string, unknown> = {}) {
  return { name, waiting: 4, active: 1, delayed: 0, completed1h: 120, failed1h: 2, dlqDepth: null, throughputPerMin: 2.4, lastProcessedAt: "2026-10-20T09:58:00.000Z", paused: false, ...overrides };
}

const DLQ_JOBS = [
  { id: "d1", name: "email", state: "dlq", attemptsMade: 3, failedReason: "SendGrid 500", createdAt: "2026-10-20T08:00:00.000Z", processedAt: null, finishedAt: null, data: { event: "shipment.delivered", to: "us***@northwind.test", apiKey: "****" } },
  { id: "d2", name: "email", state: "dlq", attemptsMade: 3, failedReason: "SendGrid 500", createdAt: "2026-10-20T08:01:00.000Z", processedAt: null, finishedAt: null, data: { event: "invoice.sent" } }
];

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-Q-1 ACC-Q-3 the list shows the DLQ column; replaying the selected job moves it back and the DLQ drops", async ({ page }) => {
  let dlq = [...DLQ_JOBS];
  const replays: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/queues") return json(route, 200, { asOf: "2026-10-20T10:00:00.000Z", queues: [queue("notification", { dlqDepth: dlq.length, failed1h: 7 }), queue("analytics")] });
    if (path === "/queues/notification/jobs") {
      const state = url.searchParams.get("state");
      return json(route, 200, { data: state === "dlq" ? dlq : [], nextCursor: null });
    }
    if (path === "/queues/notification/dlq/replay") {
      const body = route.request().postDataJSON() as { jobIds: string[] };
      replays.push(body);
      dlq = dlq.filter((job) => !body.jobIds.includes(job.id));
      return json(route, 200, { requested: 1, replayed: 1, missing: [] });
    }
    return json(route, 200, { data: [] });
  });

  await page.goto("/platform/queues");
  await expect(page.getByTestId("dlq-notification")).toHaveText("2");
  await expect(page.getByTestId("dlq-analytics")).toHaveText("no DLQ");
  await page.getByRole("link", { name: "notification" }).click();

  await page.getByRole("button", { name: "Dead-letter", exact: true }).click();
  await expect(page.getByTestId("queue-job")).toHaveCount(2);
  await page.getByTestId("queue-job").first().getByText("d1").click();
  await expect(page.getByRole("dialog", { name: "Job d1" })).toContainText("us***@northwind.test");
  await page.getByRole("dialog", { name: "Job d1" }).getByRole("button", { name: "Close" }).click();

  await page.getByLabel("Select d1").check();
  await page.getByRole("button", { name: "Replay 1 selected" }).click();
  await page.getByLabel(/Reason/).fill("SendGrid outage resolved");
  await page.getByRole("dialog").getByRole("button", { name: "Replay" }).click();
  await expect(page.getByRole("status")).toHaveText("1 of 1 job(s) replayed to notification.");
  expect(replays).toEqual([{ reason: "SendGrid outage resolved", jobIds: ["d1"] }]);
  await expect(page.getByTestId("queue-job")).toHaveCount(1);
  await expect(page.getByText("1 dead-lettered")).toBeVisible();
});

test("ACC-Q-5 pause is a dangerous action and the header reflects the paused state", async ({ page }) => {
  let paused = false;
  const bodies: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/queues") return json(route, 200, { asOf: "2026-10-20T10:00:00.000Z", queues: [queue("webhook", { paused, dlqDepth: 0 })] });
    if (path === "/queues/webhook/pause") {
      bodies.push(route.request().postDataJSON());
      paused = true;
      return json(route, 200, { name: "webhook", paused: true });
    }
    return json(route, 200, { data: [], nextCursor: null });
  });
  await page.goto("/platform/queues/webhook");
  await expect(page.getByText("No failed jobs are kept for this queue.")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByLabel(/Reason/).fill("Tenant endpoint storm");
  await page.getByRole("dialog").getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("status")).toHaveText("webhook is paused.");
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  expect(bodies).toEqual([{ reason: "Tenant endpoint storm" }]);
});

test("queue actions are disabled without the permission and API errors are shown", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(["platform.queues.read"]));
    if (path === "/queues") return json(route, 200, { asOf: "2026-10-20T10:00:00.000Z", queues: [queue("notification", { dlqDepth: 3 })] });
    if (path === "/queues/notification/jobs") return json(route, 500, { error: "INTERNAL", message: "Redis unavailable" });
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/queues/notification");
  await expect(page.getByRole("button", { name: "Replay all dead-lettered" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Clean old jobs" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pause" })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Unable to load jobs");
});
