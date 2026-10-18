import { expect, test, type Page, type Route } from "@playwright/test";

import { addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const REQUESTER = ["trust.jit.request", "customer.360.read"];
const APPROVER = ["trust.jit.request", "trust.jit.approve"];
const REASON = "Investigating a disputed invoice for a tenant escalation";

function jitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "jit_1",
    permission: "revenue.invoices.read",
    reason: REASON,
    durationMinutes: 60,
    status: "PENDING",
    state: "PENDING",
    rootRequest: false,
    approvalsRequired: 1,
    expiresAt: null,
    revokedAt: null,
    deniedReason: null,
    createdAt: "2026-10-18T09:00:00.000Z",
    updatedAt: "2026-10-18T09:00:00.000Z",
    ownRequest: false,
    requester: { id: "pu_csm", email: "csm@fauward.com", name: "Casey CSM" },
    approvals: [],
    ...overrides
  };
}

type Calls = Array<{ method: string; path: string; body: unknown }>;

async function mockJit(page: Page, options: { permissions: string[]; my?: unknown[]; pending?: unknown[]; active?: unknown[]; createStatus?: number; grantAfterApprove?: boolean }) {
  const calls: Calls = [];
  let approved = false;
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    const method = request.method();
    if (method !== "GET") calls.push({ method, path, body: request.postDataJSON() });
    if (path === "/auth/me") {
      const body = meBody(options.permissions);
      return json(route, 200, approved && options.grantAfterApprove ? { ...body, jit: [{ permission: "revenue.invoices.read", expiresAt: "2026-10-18T10:00:00.000Z" }] } : body);
    }
    if (path === "/jit/requests" && method === "POST") {
      if ((options.createStatus ?? 201) !== 201) return json(route, options.createStatus ?? 409, { error: "ALREADY_PENDING", message: "You already have a pending request for revenue.invoices.read." });
      return json(route, 201, jitRow({ ownRequest: true }));
    }
    if (path === "/jit/sessions/my") return json(route, 200, { data: options.my ?? [] });
    if (path === "/jit/requests/pending") return json(route, 200, { data: approved ? [] : (options.pending ?? []) });
    if (path === "/jit/sessions/active") return json(route, 200, { data: options.active ?? [] });
    if (path === "/jit/requests/jit_1/approve") {
      approved = true;
      return json(route, 200, { approvals: 1, required: 1, request: jitRow({ status: "APPROVED", state: "ACTIVE", expiresAt: "2026-10-18T10:00:00.000Z" }) });
    }
    if (path === "/jit/requests/jit_1/deny") return json(route, 200, jitRow({ status: "DENIED", state: "DENIED", deniedReason: "Use the finance export" }));
    if (path === "/jit/sessions/jit_1/revoke") return json(route, 200, jitRow({ status: "REVOKED", state: "REVOKED", revokedAt: "2026-10-18T09:30:00.000Z" }));
    return json(route, 200, { data: [] });
  });
  return calls;
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-JIT-1 a requester picks a permission, gives a reason and sends the request", async ({ page }) => {
  const calls = await mockJit(page, { permissions: REQUESTER });
  await page.goto("/trust/jit/request?permission=revenue.invoices.read");
  await expect(page.getByRole("heading", { name: "Request access" })).toBeVisible();
  await expect(page.getByLabel("Permission")).toHaveValue("revenue.invoices.read");
  const send = page.getByRole("button", { name: "Send request" });
  await page.getByLabel(/Reason/).fill("too short");
  await expect(send).toBeDisabled();
  await page.getByLabel(/Reason/).fill(REASON);
  await send.click();
  await expect(page.getByRole("status")).toContainText("Approvers have been notified");
  expect(calls).toEqual([{ method: "POST", path: "/jit/requests", body: { permission: "revenue.invoices.read", reason: REASON, durationMinutes: 60 } }]);
});

test("ACC-JIT-6 a rejected request shows the API error on the request page", async ({ page }) => {
  await mockJit(page, { permissions: REQUESTER, createStatus: 409 });
  await page.goto("/trust/jit/request?permission=revenue.invoices.read");
  await page.getByLabel(/Reason/).fill(REASON);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("alert")).toContainText("You already have a pending request for revenue.invoices.read.");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("ACC-JIT-5 the requester sees the deny reason in their requests", async ({ page }) => {
  await mockJit(page, { permissions: REQUESTER, my: [jitRow({ ownRequest: true, status: "DENIED", state: "DENIED", deniedReason: "Use the read-only finance export instead" })] });
  await page.goto("/trust/jit/request");
  await expect(page.getByTestId("jit-outcome")).toHaveText("Denied: Use the read-only finance export instead");
});

test("ACC-JIT-2 an approver cannot approve or deny their own request", async ({ page }) => {
  await mockJit(page, { permissions: APPROVER, pending: [jitRow({ ownRequest: true })] });
  await page.goto("/trust/jit/pending");
  const row = page.getByTestId("jit-row");
  await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();
  await expect(row.getByRole("button", { name: "Approve" })).toHaveAttribute("title", "You cannot approve or deny your own request");
  await expect(row.getByRole("button", { name: "Deny" })).toBeDisabled();
});

test("ACC-JIT-3 approving sends the reason and refreshes the session; the grant shows in the elevated-access banner", async ({ page }) => {
  const calls = await mockJit(page, { permissions: APPROVER, pending: [jitRow()], grantAfterApprove: true });
  await page.goto("/trust/jit/pending");
  await expect(page.getByTestId("jit-banner")).toHaveCount(0);
  await page.getByTestId("jit-row").getByRole("button", { name: "Approve" }).click();
  await page.getByLabel(/Reason/).fill("Escalation confirmed with the CS lead");
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("No requests are waiting.")).toBeVisible();
  // /auth/me is refetched straight after the mutation, not at the next 60 s poll.
  await expect(page.getByTestId("jit-banner")).toContainText("revenue.invoices.read");
  expect(calls).toContainEqual({ method: "POST", path: "/jit/requests/jit_1/approve", body: { reason: "Escalation confirmed with the CS lead" } });
});

test("ACC-JIT-5 denying requires a reason that is sent to the requester", async ({ page }) => {
  const calls = await mockJit(page, { permissions: APPROVER, pending: [jitRow()] });
  await page.goto("/trust/jit/pending");
  await page.getByTestId("jit-row").getByRole("button", { name: "Deny" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("The requester sees your reason.");
  await expect(dialog.getByRole("button", { name: "Deny" })).toBeDisabled();
  await page.getByLabel(/Reason/).fill("Use the finance export");
  await dialog.getByRole("button", { name: "Deny" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls).toContainEqual({ method: "POST", path: "/jit/requests/jit_1/deny", body: { reason: "Use the finance export" } });
});

test("ACC-JIT-4 an approver ends an active grant with a reason", async ({ page }) => {
  const calls = await mockJit(page, { permissions: APPROVER, active: [jitRow({ status: "APPROVED", state: "ACTIVE", expiresAt: "2026-10-18T10:00:00.000Z" })] });
  await page.goto("/trust/jit/active");
  await page.getByTestId("jit-row").getByRole("button", { name: "End grant" }).click();
  await page.getByLabel(/Reason/).fill("Escalation closed early");
  await page.getByRole("dialog").getByRole("button", { name: "End grant" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls).toContainEqual({ method: "POST", path: "/jit/sessions/jit_1/revoke", body: { reason: "Escalation closed early" } });
});

test("ACC-JIT-1 a requester without approve sees access denied on the queue, with Request access", async ({ page }) => {
  await mockJit(page, { permissions: REQUESTER });
  await page.goto("/trust/jit/pending");
  await expect(page.getByTestId("access-denied")).toContainText("Requires trust.jit.approve");
  await expect(page.getByTestId("access-denied").getByRole("button", { name: "Request access" })).toBeVisible();
});
