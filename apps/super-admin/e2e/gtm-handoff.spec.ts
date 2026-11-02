import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// gtm.handoff (WP-4.17): the queue, then one handoff through sales notes → pass to CS → assign → accept → checklist →
// complete, with the PATCH bodies the backend receives.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TEMPLATE = {
  id: "default-v1",
  name: "Trial to paid handoff",
  fields: [
    { key: "stakeholders", label: "Stakeholders (names, roles, contact)", requiredForCs: true },
    { key: "successCriteria", label: "What success looks like for them", requiredForCs: true }
  ],
  checklist: [
    { key: "kickoff_booked", label: "Kick-off call booked" },
    { key: "admins_confirmed", label: "Tenant admins confirmed" }
  ]
};

type Status = "PENDING_SALES" | "PENDING_CS" | "ACCEPTED" | "COMPLETED";

function handoff(status: Status, overrides: { fields?: Record<string, string>; done?: string[]; csm?: boolean } = {}) {
  const done = overrides.done ?? [];
  return {
    id: "ho_1",
    tenant: { id: "tenant_a", name: "Acme Freight", slug: "acme", plan: "PRO" },
    status,
    csm: overrides.csm ? { id: "csm_1", name: "Casey CSM", email: "casey@fauward.test" } : null,
    deal: { id: "deal_1", name: "Acme annual", amount: "1200.00", ownerEmail: "ae@fauward.test", closeDate: null },
    checklistDone: done.length,
    checklistTotal: 2,
    document: {
      template: "default-v1",
      fields: { stakeholders: "", successCriteria: "", ...(overrides.fields ?? {}) },
      checklist: TEMPLATE.checklist.map((item) => ({ ...item, done: done.includes(item.key), doneAt: done.includes(item.key) ? "2026-10-21T10:00:00.000Z" : null, doneBy: null }))
    },
    assignedAt: null,
    acceptedAt: status === "ACCEPTED" || status === "COMPLETED" ? "2026-10-21T10:00:00.000Z" : null,
    completedAt: status === "COMPLETED" ? "2026-10-21T11:00:00.000Z" : null,
    createdAt: "2026-10-20T09:00:00.000Z"
  };
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-HO-1 the queue lists open handoffs with the stage filter sent to the API", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/handoff/queue") {
      queries.push(url.search);
      return json(route, 200, { data: [handoff("PENDING_SALES")] });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/handoff");
  await expect(page.getByTestId("handoff-row")).toHaveCount(1);
  await expect(page.getByTestId("handoff-row")).toContainText("Waiting for sales");
  await expect(page.getByTestId("handoff-row")).toContainText("Acme annual");
  await page.getByLabel("Stage").selectOption("CS");
  await expect.poll(() => queries.some((query) => query.includes("stage=CS"))).toBe(true);
});

test("ACC-HO-2 / ACC-HO-3 notes, pass to CS, assign, accept, checklist and complete", async ({ page }) => {
  let state = handoff("PENDING_SALES");
  const bodies: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/handoff/templates") return json(route, 200, { data: [TEMPLATE] });
    if (path === "/handoff/assignees") return json(route, 200, { data: [{ id: "csm_1", name: "Casey CSM", email: "casey@fauward.test" }], permission: "customer.success.write" });
    if (path === "/handoff/ho_1" && request.method() === "PATCH") {
      const body = request.postDataJSON() as { fields?: Record<string, string>; status?: Status; assignCsmId?: string; checklist?: Array<{ key: string; done: boolean }> };
      bodies.push(body);
      const done = state.document.checklist.filter((item) => item.done).map((item) => item.key);
      if (body.fields) state = handoff(state.status, { fields: body.fields, csm: Boolean(state.csm) });
      if (body.assignCsmId) state = handoff(state.status, { fields: state.document.fields, csm: true });
      if (body.status) state = handoff(body.status, { fields: state.document.fields, csm: Boolean(state.csm), done });
      if (body.checklist) state = handoff(state.status, { fields: state.document.fields, csm: true, done: [...done, ...body.checklist.filter((item) => item.done).map((item) => item.key)] });
      return json(route, 200, state);
    }
    if (path === "/handoff/ho_1") return json(route, 200, state);
    return json(route, 200, { data: [] });
  });

  await page.goto("/gtm/handoff/ho_1");
  await expect(page.getByText("Acme annual · 1200.00")).toBeVisible();
  await page.getByLabel("Stakeholders (names, roles, contact)").fill("Dana (Ops lead)");
  await page.getByLabel("What success looks like for them").fill("500 shipments a month");
  await expect(page.getByRole("button", { name: "Pass to CS" })).toBeDisabled();
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByRole("status")).toHaveText("Notes saved.");

  await page.getByRole("button", { name: "Pass to CS" }).click();
  await expect(page.getByRole("status")).toHaveText("Waiting for CS.");
  await page.getByLabel("CSM to assign").selectOption("csm_1");
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("CSM assigned and notified.");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("status")).toHaveText("Accepted by CS.");

  await page.getByLabel("Kick-off call booked").click();
  await expect(page.getByText("CS checklist (1/2)")).toBeVisible();
  await page.getByLabel("Tenant admins confirmed").click();
  await expect(page.getByText("CS checklist (2/2)")).toBeVisible();
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("status")).toHaveText("Completed.");

  expect(bodies).toEqual([
    { fields: { stakeholders: "Dana (Ops lead)", successCriteria: "500 shipments a month" } },
    { status: "PENDING_CS" },
    { assignCsmId: "csm_1" },
    { status: "ACCEPTED" },
    { checklist: [{ key: "kickoff_booked", done: true }] },
    { checklist: [{ key: "admins_confirmed", done: true }] },
    { status: "COMPLETED" }
  ]);
});

test("an API refusal is shown, not a success message", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/handoff/templates") return json(route, 200, { data: [TEMPLATE] });
    if (path === "/handoff/ho_1" && request.method() === "PATCH") return json(route, 400, { error: "FIELDS_REQUIRED", message: "Fill in before passing to CS: Stakeholders (names, roles, contact)." });
    if (path === "/handoff/ho_1") return json(route, 200, handoff("PENDING_SALES"));
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/handoff/ho_1");
  await page.getByRole("button", { name: "Pass to CS" }).click();
  await expect(page.getByRole("alert")).toContainText("Fill in before passing to CS");
  await expect(page.getByRole("status")).toHaveCount(0);
});
