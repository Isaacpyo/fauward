# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\customer-360.spec.ts >> ACC-C360-2 a tab without its permission shows the access-denied state with Request access
- Location: e2e\customer-360.spec.ts:90:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/customer/360/tenant_1?tab=billing", waiting until "load"

```

# Test source

```ts
  1   | import { expect, test, type Page, type Route } from "@playwright/test";
  2   | 
  3   | import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";
  4   | 
  5   | function json(route: Route, status: number, body: unknown) {
  6   |   return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  7   | }
  8   | 
  9   | const summary = {
  10  |   identity: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind", customDomain: null, region: "uk_europe", createdAt: "2026-01-01T00:00:00.000Z" },
  11  |   status: "ACTIVE",
  12  |   closedAt: null,
  13  |   plan: { billingPlan: "PRO", effectivePlan: "PRO", planOverride: null },
  14  |   activeSuspensions: [],
  15  |   mrr: { amount: "79.00", currency: "GBP", source: "plan" },
  16  |   subscription: { plan: "PRO", billingCycle: "MONTHLY", status: "ACTIVE", currentPeriodEnd: null },
  17  |   lastLoginAt: "2026-10-18T07:30:00.000Z",
  18  |   health: null,
  19  |   kycStatus: "APPROVED",
  20  |   activeStaff: 6,
  21  |   openTickets: 2
  22  | };
  23  | const billing = {
  24  |   subscription: { plan: "PRO", billingCycle: "MONTHLY", status: "ACTIVE", currentPeriodEnd: null, cancelAtPeriodEnd: false, stripeLinked: false },
  25  |   invoices: [{ id: "inv_1", invoiceNumber: "FW-202610-ABC", status: "SENT", total: "79.00", currency: "GBP", dueDate: null, createdAt: "2026-10-01T00:00:00.000Z" }],
  26  |   invoiceCount: 1,
  27  |   payments: [],
  28  |   dunning: [],
  29  |   saveOffers: []
  30  | };
  31  | const config = {
  32  |   general: { timezone: "Europe/London", defaultCurrency: "GBP" },
  33  |   branding: { brandName: null },
  34  |   domains: { slug: "northwind", customDomain: null },
  35  |   notifications: null,
  36  |   payments: { gateway: "STRIPE", gatewayKeyConfigured: true, currency: "GBP" },
  37  |   apiKeys: [{ id: "key_1", name: "ERP", keyPrefix: "fw_live_ab12", scopes: [], isActive: true, isSandbox: false, createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null, expiresAt: null }],
  38  |   webhooks: [],
  39  |   legacyWebhook: null
  40  | };
  41  | 
  42  | const activity = {
  43  |   data: [
  44  |     { id: "act_2", occurredAt: "2026-10-18T09:00:00.000Z", tenantId: "tenant_1", tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" }, service: "customer.360", type: "shipment.attention", actorType: "TENANT_USER", actorId: null, actorLabel: "Field operator", subjectType: "shipment", subjectId: "ship_1", summary: "Shipment NWD-1 moved to exception", severity: "ATTENTION", consoleLink: null, metadata: {} },
  45  |     { id: "act_1", occurredAt: "2026-10-17T09:00:00.000Z", tenantId: "tenant_1", tenant: { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" }, service: "platform.tenants", type: "tenant.unsuspended", actorType: "STAFF", actorId: "staff_001", actorLabel: "Staff User", subjectType: "tenant", subjectId: "tenant_1", summary: "Suspension lifted", severity: "INFO", consoleLink: "/platform/tenants/tenant_1", metadata: {} }
  46  |   ],
  47  |   nextCursor: null
  48  | };
  49  | 
  50  | async function mock360(page: Page, options: { permissions?: string[]; failing?: string[] } = {}) {
  51  |   await page.route("**/api/internal/**", async (route) => {
  52  |     const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
  53  |     if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
  54  |     const tab = path.match(/^\/customer360\/tenant_1\/(\w+)$/)?.[1];
  55  |     if (tab && options.failing?.includes(tab)) return json(route, 500, { error: "INTERNAL", message: `The ${tab} service is down` });
  56  |     if (tab === "summary") return json(route, 200, summary);
  57  |     if (tab === "billing") return json(route, 200, billing);
  58  |     if (tab === "health") return json(route, 200, { latest: null, history: [] });
  59  |     if (tab === "config") return json(route, 200, config);
  60  |     if (tab === "activity") return json(route, 200, activity);
  61  |     return json(route, 200, { data: [] });
  62  |   });
  63  | }
  64  | 
  65  | test.beforeEach(async ({ context }) => {
  66  |   await addCsrfCookie(context);
  67  | });
  68  | 
  69  | test("ACC-C360-3 ACC-C360-4 the header shows the real MRR and last sign-in; no score reads 'Not yet scored'", async ({ page }) => {
  70  |   await mock360(page);
  71  |   await page.goto("/customer/360/tenant_1");
  72  |   const header = page.getByTestId("c360-header");
  73  |   await expect(header).toContainText("£79.00");
  74  |   await expect(header).toContainText("last sign-in");
  75  |   await expect(page.getByText("Not yet scored")).toBeVisible();
  76  |   await expect(page.locator("main")).not.toContainText(/placeholder/i);
  77  |   await page.getByRole("tab", { name: "Health" }).click();
  78  |   await expect(page.getByTestId("health-not-scored")).toHaveText("Not yet scored.");
  79  | });
  80  | 
  81  | test("ACC-C360-1 a failing tab API only breaks that tab; the header and other tabs keep working", async ({ page }) => {
  82  |   await mock360(page, { failing: ["usage"] });
  83  |   await page.goto("/customer/360/tenant_1?tab=usage");
  84  |   await expect(page.getByRole("alert")).toContainText("The usage service is down");
  85  |   await expect(page.getByTestId("c360-header")).toContainText("£79.00");
  86  |   await page.getByRole("tab", { name: "Billing" }).click();
  87  |   await expect(page.getByText("FW-202610-ABC")).toBeVisible();
  88  | });
  89  | 
  90  | test("ACC-C360-2 a tab without its permission shows the access-denied state with Request access", async ({ page }) => {
  91  |   await mock360(page, { permissions: ["customer.360.read", "trust.jit.request"] });
> 92  |   await page.goto("/customer/360/tenant_1?tab=billing");
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  93  |   const denied = page.getByTestId("access-denied");
  94  |   await expect(denied).toContainText("Requires revenue.invoices.read");
  95  |   await expect(denied.getByRole("button", { name: "Request access" })).toBeVisible();
  96  |   await page.getByRole("tab", { name: "Overview" }).click();
  97  |   await expect(page.getByText("Active staff")).toBeVisible();
  98  | });
  99  | 
  100 | test("ACC-C360-6 config is structured and shows secrets only as configured or not", async ({ page }) => {
  101 |   await mock360(page);
  102 |   await page.goto("/customer/360/tenant_1?tab=config");
  103 |   const configView = page.getByTestId("c360-config");
  104 |   await expect(configView).toContainText("configured (hidden)");
  105 |   await expect(configView).toContainText("fw_live_ab12");
  106 |   await expect(configView).not.toContainText("{");
  107 | });
  108 | 
  109 | test("WP-2.1 the Activity tab lists the tenant's platform activity from the activity API", async ({ page }) => {
  110 |   await mock360(page);
  111 |   const request = page.waitForRequest((req) => new URL(req.url()).pathname === "/api/internal/customer360/tenant_1/activity");
  112 |   await page.goto("/customer/360/tenant_1?tab=activity");
  113 |   await request;
  114 |   const rows = page.getByTestId("c360-activity-row");
  115 |   await expect(rows).toHaveCount(2);
  116 |   await expect(rows.first()).toContainText("Shipment NWD-1 moved to exception");
  117 |   await expect(rows.first()).toContainText("ATTENTION");
  118 |   await expect(page.getByRole("link", { name: "Suspension lifted" })).toHaveAttribute("href", "/platform/tenants/tenant_1");
  119 | });
  120 | 
  121 | test("ACC-L16-1 the AI tab shows this month's spend and sets the AI limit with a reason (PUT /tenants/:id/ai-limit)", async ({ page }) => {
  122 |   await mock360(page);
  123 |   let limit: Record<string, unknown> | null = null;
  124 |   const puts: unknown[] = [];
  125 |   await page.route("**/api/internal/customer360/tenant_1/ai", (route) =>
  126 |     json(route, 200, {
  127 |       usage: [{ id: "u1", month: "2026-10", model: "deepseek-v4-flash", feature: "agent_ask", requestCount: 7, tokenCount: 900, costUsd: 4.2 }],
  128 |       runs: [],
  129 |       runCount: 0,
  130 |       limit,
  131 |       currentMonth: { month: "2026-10", costUsd: "4.20", requests: 7 },
  132 |       featureKeys: ["agent_ask", "agent_sweep"]
  133 |     })
  134 |   );
  135 |   await page.route("**/api/internal/tenants/tenant_1/ai-limit", async (route) => {
  136 |     const body = route.request().postDataJSON() as Record<string, unknown>;
  137 |     puts.push(body);
  138 |     limit = { monthlyBudgetUsd: body.monthlyBudgetUsd, flashRequestLimit: body.flashRequestLimit, proRequestLimit: body.proRequestLimit, featuresEnabled: body.featuresEnabled, updatedAt: "2026-10-19T08:00:00.000Z", updatedByPlatformUserId: "staff_001", reason: body.reason };
  139 |     return json(route, 200, { limit });
  140 |   });
  141 |   await page.goto("/customer/360/tenant_1?tab=ai");
  142 |   const panel = page.getByTestId("c360-ai-limit");
  143 |   await expect(panel).toContainText("4.20 USD · 7 requests");
  144 |   await expect(panel).toContainText("No AI limit set for this tenant.");
  145 |   await panel.getByRole("button", { name: "Set AI limit" }).click();
  146 |   await page.getByLabel("Monthly budget (USD)").fill("4.00");
  147 |   await page.getByLabel(/Reason/).fill("Budget agreed with the customer");
  148 |   await page.getByRole("button", { name: "Save AI limit" }).click();
  149 |   await expect(panel).toContainText("4.00 USD");
  150 |   await expect(panel).toContainText("Budget agreed with the customer");
  151 |   expect(puts).toEqual([{ monthlyBudgetUsd: "4.00", flashRequestLimit: null, proRequestLimit: null, featuresEnabled: [], reason: "Budget agreed with the customer" }]);
  152 | });
  153 | 
```