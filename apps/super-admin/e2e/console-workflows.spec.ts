import { expect, test } from "@playwright/test";

const permissions = [
  "platform.incidents.read",
  "platform.incidents.write",
  "customer.success.read",
  "customer.success.write",
  "trust.jit.request",
  "trust.jit.approve",
  "gtm.contracts.read",
  "gtm.contracts.write",
  "revenue.dunning.read",
  "revenue.dunning.write"
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

  await page.route("**/api/v1/platform/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "staff_001",
          email: "staff@fauward.com",
          name: "Staff User",
          role: "SUPER_ADMIN",
          permissions
        }
      })
    });
  });

  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/internal", "");

    if (request.method() === "GET") {
      const data =
        path === "/incidents"
          ? { data: [{ id: "inc_001", title: "Carrier API outage", status: "triggered" }] }
          : path === "/success/health-scoring"
            ? { weights: { login: 20, shipmentTrend: 25, featureBreadth: 15, paymentHealth: 15, ticketSentimentVolume: 15, nps: 10 } }
            : path === "/jit/sessions/active" || path === "/jit/sessions/my"
              ? { data: [] }
              : path === "/contracts/quotes"
                ? { data: [{ id: "quote_001", quoteNumber: "Q-001", status: "DRAFT" }] }
                : path === "/dunning/failed-payments"
                  ? { data: [{ id: "pay_001", status: "FAILED", invoiceId: "inv_001" }] }
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
});

test("navigates critical Phase 2-6 workflow pages", async ({ page }) => {
  const pages = [
    ["/platform/incidents", "Incidents"],
    ["/customer/success/health-scoring", "Health Scoring"],
    ["/trust/jit/request", "Request JIT Access"],
    ["/gtm/contracts/quotes", "Quote Builder"],
    ["/revenue/dunning", "Dunning Manager"]
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

  await page.goto("/platform/incidents");
  await page.getByLabel("Incident ID").fill("inc_001");
  await page.getByLabel("Tenant ID").fill("tenant_001");
  await page.getByRole("button", { name: "Tag Tenant Impact" }).click();

  await page.goto("/customer/success/health-scoring");
  await page.getByRole("button", { name: "Queue Health Scoring" }).click();

  await page.goto("/trust/jit/request");
  await page.getByLabel("Permission").fill("platform.incidents.write");
  await page.getByLabel("Reason").fill("Incident impact annotation");
  await page.getByRole("button", { name: "Request Elevated Access" }).click();

  await page.goto("/gtm/contracts/quotes");
  await page.getByRole("button", { name: "Create Quote" }).click();

  await page.goto("/revenue/dunning");
  await page.getByLabel("Invoice ID").fill("inv_001");
  await page.getByRole("button", { name: "Queue Manual Retry" }).click();

  await expect.poll(() => calls).toContain("POST /api/internal/incidents/inc_001/impacts");
  expect(calls).toContain("POST /api/internal/success/health-scoring/run");
  expect(calls).toContain("POST /api/internal/jit/requests");
  expect(calls).toContain("POST /api/internal/contracts/quotes");
  expect(calls).toContain("POST /api/internal/dunning/retry/inv_001");
});
