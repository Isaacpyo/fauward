import { expect, test, type Page, type Route } from "@playwright/test";

import { addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

// A CSM: customer read permissions, tenant read, JIT request — no platform.health.read / platform.queues.read.
const CSM_PERMISSIONS = ["platform.tenants.read", "customer.360.read", "customer.success.read", "customer.success.write", "trust.jit.request"];

async function mockConsole(page: Page, jitStatus: number, calls: Array<{ path: string; body: unknown }>) {
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(CSM_PERMISSIONS, { role: "PLATFORM_READONLY" }));
    if (path === "/jit/requests" && request.method() === "POST") {
      calls.push({ path, body: request.postDataJSON() });
      return jitStatus === 201 ? json(route, 201, { id: "jit_1", status: "PENDING" }) : json(route, jitStatus, { error: "Forbidden", permission: "trust.jit.request", message: "Requests are paused for this account." });
    }
    if (path === "/health" || path === "/queues") return json(route, 403, { error: "Forbidden", permission: path === "/health" ? "platform.health.read" : "platform.queues.read" });
    return json(route, 200, { data: [] });
  });
}

for (const [path, permission] of [
  ["/platform/health", "platform.health.read"],
  ["/platform/queues", "platform.queues.read"]
] as const) {
  test(`ACC-RBAC-1 ${path} without ${permission} shows access denied with "Request access", not an empty table`, async ({ context, page }) => {
    await addCsrfCookie(context);
    const calls: Array<{ path: string; body: unknown }> = [];
    await mockConsole(page, 201, calls);
    await page.goto(path);

    const denied = page.getByTestId("access-denied");
    await expect(denied).toBeVisible();
    await expect(denied).toContainText(`Requires ${permission}`);
    await expect(page.locator("table")).toHaveCount(0);

    await denied.getByRole("button", { name: "Request access" }).click();
    const submit = page.getByRole("button", { name: "Send request" });
    await page.getByLabel(/Reason/).fill("Short reason");
    await expect(submit).toBeDisabled();
    await page.getByLabel(/Reason/).fill("Investigating the notification backlog for a tenant");
    await submit.click();
    await expect(denied).toContainText("Request sent");
    expect(calls).toEqual([{ path: "/jit/requests", body: { permission, reason: "Investigating the notification backlog for a tenant", durationMinutes: 60 } }]);
  });
}

test("ACC-JIT-6 a failed access request shows the API error in the dialog", async ({ context, page }) => {
  await addCsrfCookie(context);
  await mockConsole(page, 403, []);
  await page.goto("/platform/health");
  await page.getByTestId("access-denied").getByRole("button", { name: "Request access" }).click();
  await page.getByLabel(/Reason/).fill("Investigating the notification backlog for a tenant");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("dialog")).toContainText("Requires trust.jit.request");
});
