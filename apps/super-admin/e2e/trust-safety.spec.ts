import { expect, test, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// trust.safety (WP-2.4): appeals queue → detail → decision, signal decisions, suspensions, rules, permission and errors.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const tenant = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind", status: "SUSPENDED" };
const suspension = { id: "sus_1", source: "FRAUD", category: "FRAUD", status: "ACTIVE", reason: "Card testing on the booking API", publicReason: "Unusual payment activity is under review.", createdAt: "2026-10-17T09:00:00.000Z" };
const appeal = {
  id: "appeal_1",
  tenant,
  status: "PENDING",
  message: "The flagged payments were one customer retrying a declined card.",
  contactEmail: "admin@northwind.test",
  infoRequest: null,
  infoRequestedAt: null,
  tenantReply: null,
  tenantRepliedAt: null,
  resolution: null,
  decidedAt: null,
  createdAt: "2026-10-18T09:00:00.000Z",
  suspension
};
const signal = { id: "sig_1", tenant, source: "stripe_radar", signalType: "radar.early_fraud_warning.created", category: "FRAUD", severity: "HIGH", status: "OPEN", decision: null, decisionNote: null, decidedAt: null, summary: "radar early fraud warning created", createdAt: "2026-10-18T08:00:00.000Z" };

async function mockSafety(page: Page, options: { permissions?: string[]; appealsStatus?: number } = {}) {
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
    if (request.method() === "POST") {
      posts.push({ path, body: request.postDataJSON() });
      if (path.endsWith("/decision") && path.startsWith("/safety/appeals")) return json(route, 200, { appeal: { ...appeal, status: "APPROVED" }, tenantReactivated: true });
      if (path.endsWith("/decision")) return json(route, 200, { signal: { ...signal, status: "CLOSED", decision: "SUSPEND" }, suspensionId: "sus_2" });
      return json(route, 200, {});
    }
    if (path === "/safety/appeals") {
      if (options.appealsStatus) return json(route, options.appealsStatus, { error: "INTERNAL", message: "Appeals store unavailable" });
      return json(route, 200, { data: [appeal], nextCursor: null });
    }
    if (path === "/safety/appeals/appeal_1") return json(route, 200, { appeal, context: { activeSuspensions: [{ ...suspension }], previousAppeals: 0 } });
    if (path === "/safety/signals") return json(route, 200, { data: [signal], nextCursor: null });
    if (path === "/safety/suspensions") return json(route, 200, { data: [{ ...suspension, tenantId: "tenant_1", tenant, sourceRef: "sig_0", liftedVia: null, liftReason: null, liftedAt: null }], nextCursor: null });
    if (path === "/safety/rules") return json(route, 200, { data: [{ id: "dunning-suspend", name: "Dunning suspension", effect: "Second failed payment suspends.", parameters: { suspendOnAttempt: 2, cancelAfterDays: 30 } }] });
    return json(route, 200, { data: [] });
  });
  return posts;
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-SAF-2 an appeal is approved from its detail page with a reason; the request names the decision", async ({ page }) => {
  const posts = await mockSafety(page);
  await page.goto("/trust/safety");
  await expect(page).toHaveURL(/\/trust\/safety\/appeals$/);
  await expect(page.getByTestId("appeal-row")).toHaveCount(1);
  await expect(page.getByTestId("appeal-row").getByTestId("tenant-chip")).toHaveText("Northwind Couriers");
  await page.getByTestId("appeal-row").click();
  await expect(page.getByTestId("appeal-message")).toContainText("retrying a declined card");
  await expect(page.getByText("None — approving reactivates the tenant.")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Reason/).fill("Issuer confirmed the payments were legitimate");
  await dialog.getByRole("button", { name: "Approve and lift" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ path: "/safety/appeals/appeal_1/decision", body: { decision: "APPROVE", reason: "Issuer confirmed the payments were legitimate" } });
});

test("WP-2.4 rejecting needs the resolution text the tenant will see", async ({ page }) => {
  const posts = await mockSafety(page);
  await page.goto("/trust/safety/appeals/appeal_1");
  await page.getByRole("button", { name: "Reject" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Reason/).fill("Chargebacks tie back to the tenant's own accounts");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(dialog.getByRole("alert")).toContainText("at least 10 characters");
  await dialog.getByLabel("Resolution shown to the tenant").fill("The chargebacks came from accounts your team created.");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].body).toEqual({ decision: "REJECT", reason: "Chargebacks tie back to the tenant's own accounts", message: "The chargebacks came from accounts your team created." });
});

test("ACC-SAF-4 a signal is decided SUSPEND with a public reason", async ({ page }) => {
  const posts = await mockSafety(page);
  await page.goto("/trust/safety/signals");
  await expect(page.getByTestId("signal-row")).toContainText("stripe radar");
  await page.getByRole("button", { name: "Decide" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Suspend the tenant (FRAUD cause)").check();
  await dialog.getByLabel(/Reason shown in the tenant/).fill("Unusual payment activity is under review.");
  await dialog.getByLabel(/Reason \(recorded/).fill("Radar warning plus three disputes this week");
  await dialog.getByRole("button", { name: "Suspend tenant" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ path: "/safety/signals/sig_1/decision", body: { decision: "SUSPEND", reason: "Radar warning plus three disputes this week", tenantMessage: "Unusual payment activity is under review." } });
});

test("ACC-SAF-5 ACC-SAF-6 suspensions list every cause and rules come from the API", async ({ page }) => {
  await mockSafety(page);
  await page.goto("/trust/safety/suspensions");
  await expect(page.getByTestId("suspension-row")).toContainText("Card testing on the booking API");
  await expect(page.getByTestId("suspension-row")).toContainText("Unusual payment activity is under review.");
  await page.goto("/trust/safety/rules");
  await expect(page.getByTestId("safety-rule")).toContainText("suspendOnAttempt");
  await expect(page.getByTestId("safety-rule")).toContainText("30");
});

test("WP-2.4 read-only staff cannot decide; a failing API shows its error", async ({ page }) => {
  await mockSafety(page, { permissions: ["trust.safety.read"] });
  await page.goto("/trust/safety/appeals/appeal_1");
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveAttribute("title", "Requires trust.safety.suspend");
  await page.unrouteAll();
  await mockSafety(page, { appealsStatus: 500 });
  await page.goto("/trust/safety/appeals");
  await expect(page.getByRole("alert")).toContainText("Appeals store unavailable");
});
