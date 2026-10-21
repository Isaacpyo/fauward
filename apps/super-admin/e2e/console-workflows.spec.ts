import { expect, test } from "@playwright/test";

import { mockConsoleSession } from "./support/console-session";

const permissions = [
  "customer.success.read",
  "customer.success.write",
  "gtm.contracts.read",
  "gtm.contracts.write",
];

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: "fw_platform_csrf",
      value: "test-csrf",
      domain: "127.0.0.1",
      path: "/"
    }
  ]);

  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/internal", "");

    if (request.method() === "GET") {
      const data =
        path === "/success/health-scoring"
            ? { weights: { login: 20, shipmentTrend: 25, featureBreadth: 15, paymentHealth: 15, ticketSentimentVolume: 15, nps: 10 } }
            : path === "/contracts/quotes"
              ? { data: [{ id: "quote_001", quoteNumber: "Q-001", status: "DRAFT" }] }
              : { data: [] };

      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, path, body: request.postDataJSON() })
    });
  });

  await mockConsoleSession(page, permissions);
});

test("navigates critical Phase 2-6 workflow pages", async ({ page }) => {
  const pages = [
    ["/customer/success/health-scoring", "Health Scoring"],
    ["/gtm/contracts/quotes", "Quote Builder"],
  ] as const;

  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText("Workflow Action")).toBeVisible();
  }
});

test("executes one mocked workflow per console pillar", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/internal/") && request.method() !== "GET") {
      calls.push(`${request.method()} ${url.pathname}`);
    }
  });

  await page.goto("/customer/success/health-scoring");
  await page.getByRole("button", { name: "Queue Health Scoring" }).click();

  await page.goto("/gtm/contracts/quotes");
  await page.getByRole("button", { name: "Create Quote" }).click();

  await expect.poll(() => calls).toContain("POST /api/internal/success/health-scoring/run");
  expect(calls).toContain("POST /api/internal/contracts/quotes");
});
