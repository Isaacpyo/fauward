import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-L10-1 staff replay a dead-lettered tenant webhook from Webhook failures (dangerous)", async ({ page }) => {
  const replays: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/integrations/webhooks/failures") {
      return json(route, 200, {
        failures: [{ id: "del_1", eventType: "shipment.updated", status: "FAILED", responseCode: 503, attemptCount: 5, deadLetteredAt: "2026-10-19T03:00:00.000Z", createdAt: "2026-10-19T02:00:00.000Z", endpoint: { id: "ep_1", url: "https://erp.northwind.test/hooks", tenantId: "tenant_1" }, tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" } }]
      });
    }
    if (path === "/integrations/webhooks/deliveries/del_1/replay") {
      replays.push(route.request().postDataJSON());
      return json(route, 200, { replayQueued: true, deliveryId: "del_1", replayDeliveryId: "del_2" });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/platform/integrations/webhooks");
  const row = page.getByTestId("webhook-failure");
  await expect(row).toContainText("https://erp.northwind.test/hooks");
  await expect(row).toContainText("503 · 5 attempts");
  await row.getByRole("button", { name: "Replay" }).click();
  await page.getByLabel(/Reason/).fill("Customer ERP was down overnight");
  await page.getByRole("dialog").getByRole("button", { name: "Replay" }).click();
  await expect(row).toContainText("Replay queued");
  expect(replays).toEqual([{ reason: "Customer ERP was down overnight" }]);
});
