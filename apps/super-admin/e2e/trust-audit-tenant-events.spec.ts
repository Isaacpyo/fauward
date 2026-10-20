import { expect, test, type Route } from "@playwright/test";

import { addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-L17-1 tenant audit events: pick a tenant, filter by action, load more", async ({ page }) => {
  const calls: URLSearchParams[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(["trust.audit.read", "platform.tenants.read", "customer.360.read"]));
    if (path === "/tenants") return json(route, 200, { data: [{ id: "tenant_1", name: "Northwind Couriers", slug: "northwind", status: "ACTIVE", plan: "PRO" }] });
    if (path === "/audit/tenant-events") {
      calls.push(url.searchParams);
      const tenant = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };
      const row = (id: string, action: string, actorLabel: string) => ({ id, tenantId: "tenant_1", tenant, actorType: "USER", actorLabel, action, resourceType: "shipment", resourceId: "sh_1", timestamp: "2026-10-19T09:00:00.000Z" });
      if (url.searchParams.get("cursor") === "e1") return json(route, 200, { data: [row("e2", "SHIPMENT_UPDATED", "ops@northwind.test")], nextCursor: null });
      return json(route, 200, { data: [row("e1", "SHIPMENT_CREATED", "Fauward staff (via impersonation)")], nextCursor: "e1" });
    }
    return json(route, 200, { data: [] });
  });

  await page.goto("/trust/audit/tenant-events");
  await expect(page.getByText("Choose a tenant to search its audit trail.")).toBeVisible();
  await page.getByLabel("Tenant (required)").fill("north");
  await page.getByRole("button", { name: /Northwind Couriers/ }).click();
  await page.getByLabel("Action").fill("SHIPMENT");
  const rows = page.getByTestId("tenant-event");
  await expect(rows.first()).toContainText("Fauward staff (via impersonation)");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(rows).toHaveCount(2);
  const last = calls[calls.length - 1];
  expect(last.get("tenantId")).toBe("tenant_1");
  expect(last.get("action")).toBe("SHIPMENT");
  expect(last.get("cursor")).toBe("e1");
});
