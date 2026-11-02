import { expect, test } from "@playwright/test";

import { addCsrfCookie, meBody } from "./support/console-session";

test("ACC-CLIENT-5 with the access cookie expired, /revenue/dunning refreshes once and shows data", async ({ context, page }) => {
  await addCsrfCookie(context);
  let refreshed = false;
  let refreshCalls = 0;

  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/refresh") {
      refreshCalls += 1;
      refreshed = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }
    if (!refreshed) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    if (path === "/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(meBody(["revenue.dunning.read"])) });
    if (path === "/dunning/overview") {
      const tenant = { id: "tenant_1", name: "Northwind", slug: "northwind" };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ stripe: null, failedPayments: [{ id: "pay_001", source: "PLATFORM", tenant, invoiceRef: "inv_001", attempt: null, amount: "79.00", currency: "GBP", at: "2026-10-21T09:00:00.000Z" }], overdueInvoices: [], enrollments: [] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  await page.goto("/revenue/dunning");
  await expect(page.getByRole("heading", { name: "Dunning", exact: true })).toBeVisible();
  await expect(page.getByText("inv_001")).toBeVisible();
  await expect(page.getByText("No records")).toHaveCount(0);
  expect(refreshCalls).toBe(1);
});

test("a failing ops endpoint shows the API error (status, code, permission) instead of an empty table", async ({ context, page }) => {
  await addCsrfCookie(context);
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(meBody(["revenue.dunning.read"])) });
    if (path === "/dunning/overview") {
      return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden", permission: "revenue.dunning.write" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  await page.goto("/revenue/dunning");
  await expect(page.getByTestId("console-error-status")).toHaveText("403");
  await expect(page.getByTestId("console-error-permission")).toHaveText("revenue.dunning.write");
  await expect(page.getByText("No records")).toHaveCount(0);
});
