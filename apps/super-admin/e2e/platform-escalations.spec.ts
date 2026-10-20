import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-L15-1 staff assign, reply and resolve a tenant escalation from the console", async ({ page }) => {
  const me = meBody(ROOT_PERMISSIONS);
  const escalation = {
    id: "exc_1",
    tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" },
    shipment: { id: "sh_1", trackingNumber: "NWD-1001", status: "IN_TRANSIT" },
    type: "STUCK",
    severity: "HIGH",
    status: "OPEN",
    state: "OPEN" as "OPEN" | "RESOLVED",
    escalatedAt: "2026-10-19T09:00:00.000Z",
    reason: "Carrier lost the pallet, customer is chasing us",
    platformAssigneeId: null as string | null,
    platformResolvedAt: null as string | null,
    replies: [] as Array<{ id: string; platformUserId: string; authorName: string; body: string; createdAt: string }>
  };
  const patches: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, me);
    if (path === "/operations/escalations" && route.request().method() === "GET") {
      const status = url.searchParams.get("status");
      const rows = status === "ALL" || status === escalation.state ? [escalation] : [];
      return json(route, 200, { data: rows, total: rows.length, nextCursor: null });
    }
    if (path === "/operations/escalations/exc_1" && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { platformAssigneeId?: string; reply?: string; resolve?: boolean };
      patches.push(body);
      if (body.platformAssigneeId !== undefined) escalation.platformAssigneeId = body.platformAssigneeId;
      if (body.reply) escalation.replies.push({ id: `r${escalation.replies.length + 1}`, platformUserId: me.user.id, authorName: "Staff User", body: body.reply, createdAt: "2026-10-19T09:10:00.000Z" });
      if (body.resolve) {
        escalation.state = "RESOLVED";
        escalation.platformResolvedAt = "2026-10-19T09:20:00.000Z";
      }
      return json(route, 200, escalation);
    }
    return json(route, 200, { data: [] });
  });

  await page.goto("/platform/incidents/escalations");
  const row = page.getByTestId("escalation-row");
  await expect(row).toContainText("Northwind Couriers");
  await expect(row).toContainText("unassigned");
  await row.getByRole("button").click();
  const detail = page.getByTestId("escalation-detail");
  await expect(detail).toContainText("Carrier lost the pallet");
  await detail.getByRole("button", { name: "Assign to me" }).click();
  await expect(detail).toContainText("Assignee: you");
  await detail.getByLabel(/Reply to the tenant/).fill("We opened a trace with the carrier.");
  await detail.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByTestId("escalation-reply")).toContainText("We opened a trace with the carrier.");
  await detail.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("No open escalations.")).toBeVisible();
  expect(patches).toEqual([{ platformAssigneeId: me.user.id }, { reply: "We opened a trace with the carrier." }, { resolve: true }]);
});
