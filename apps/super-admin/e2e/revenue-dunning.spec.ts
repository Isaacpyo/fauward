import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// revenue.dunning (WP-4.5): overview (enrolments, failed payments, overdue invoices), enrolment actions with a reason,
// tenant timeline, sequence editor, save offers (create → approve with a code).

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TENANT = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind", status: "ACTIVE" };
const ENROLLMENT = {
  id: "enr_1",
  tenant: TENANT,
  invoiceId: "in_42",
  source: "STRIPE",
  sequence: { id: "dunning-default", name: "Default dunning" },
  status: "ACTIVE",
  stepsDone: 1,
  stepsTotal: 4,
  nextStep: { action: "EMAIL", dayOffset: 3, dueAt: "2026-10-24T09:00:00.000Z" },
  pausedAt: null,
  endedAt: null,
  endedReason: null,
  createdAt: "2026-10-21T09:00:00.000Z"
};
const STEPS = [
  { id: "st_0", dayOffset: 0, action: "EMAIL", template: "billing_payment_failed" },
  { id: "st_3", dayOffset: 3, action: "EMAIL", template: "billing_payment_failed" },
  { id: "st_7", dayOffset: 7, action: "EMAIL_IN_APP", template: "billing_final_warning" },
  { id: "st_14", dayOffset: 14, action: "SUSPEND", template: "tenant_suspended" }
];

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-DUN-1 the overview lists enrolments with progress and next step; Stripe unconfigured is explained", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/dunning/overview") {
      return json(route, 200, {
        stripe: { vendor: "stripe", configured: false, missing: ["STRIPE_SECRET_KEY"] },
        failedPayments: [{ id: "de_1", source: "STRIPE", tenant: TENANT, invoiceRef: "in_42", attempt: 1, amount: null, currency: null, at: "2026-10-21T09:00:00.000Z" }],
        overdueInvoices: [{ id: "inv_1", tenant: TENANT, invoiceNumber: "FW-202610-7", total: "79.00", currency: "GBP", dueDate: "2026-10-14T00:00:00.000Z", stripeInvoiceId: null }],
        enrollments: [ENROLLMENT]
      });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/dunning");
  await expect(page.getByTestId("enrollment-row")).toContainText("1/4 steps");
  await expect(page.getByTestId("enrollment-row")).toContainText("Day 3: Email");
  await expect(page.getByTestId("failed-payment-row")).toContainText("attempt 1");
  await expect(page.getByTestId("overdue-invoice-row")).toContainText("79.00 GBP");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("STRIPE_SECRET_KEY");
});

test("ACC-DUN-4 retry and pause are dangerous actions that send the reason", async ({ page }) => {
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() === "POST") {
      posts.push({ path, body: request.postDataJSON() });
      return json(route, 200, path.endsWith("/retry") ? { enrollmentId: "enr_1", channel: "stripe", idempotencyKey: "dunning-retry:x" } : { ...ENROLLMENT, status: "PAUSED" });
    }
    if (path === "/dunning/overview") return json(route, 200, { stripe: null, failedPayments: [], overdueInvoices: [], enrollments: [ENROLLMENT] });
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/dunning");
  await page.getByTestId("enrollment-row").getByRole("button", { name: "Retry" }).click();
  await page.getByLabel(/Reason/).fill("Customer updated their card");
  await page.getByRole("dialog").getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("status")).toContainText("Payment retried in Stripe.");
  await page.getByTestId("enrollment-row").getByRole("button", { name: "Pause" }).click();
  await page.getByLabel(/Reason/).fill("Customer promised payment Friday");
  await page.getByRole("dialog").getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("status")).toContainText("Dunning paused.");
  expect(posts).toEqual([
    { path: "/dunning/enrollments/enr_1/retry", body: { reason: "Customer updated their card" } },
    { path: "/dunning/enrollments/enr_1/pause", body: { reason: "Customer promised payment Friday" } }
  ]);
});

test("ACC-DUN-3 the tenant timeline shows done and due steps and the event log", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/dunning/tenants/tenant_1/timeline") {
      return json(route, 200, {
        tenant: TENANT,
        enrollments: [{ ...ENROLLMENT, status: "RECOVERED", stepsDone: 4, nextStep: null, endedReason: "Paid (Stripe invoice.paid)", steps: STEPS.map((step) => ({ ...step, dueAt: "2026-10-21T09:00:00.000Z", done: true })) }],
        events: [
          { id: "e3", eventType: "recovered", invoiceId: "in_42", attempt: 0, actorId: null, metadata: {}, createdAt: "2026-11-05T09:00:00.000Z" },
          { id: "e2", eventType: "step_executed", invoiceId: "in_42", attempt: 4, actorId: null, metadata: { action: "SUSPEND", outcome: "DONE" }, createdAt: "2026-11-04T09:00:00.000Z" }
        ],
        saveOffers: []
      });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/dunning/tenants/tenant_1");
  await expect(page.getByTestId("timeline-enrollment")).toContainText("Recovered");
  await expect(page.getByTestId("timeline-step")).toHaveCount(4);
  await expect(page.getByTestId("timeline-step").last()).toContainText("Day 14: Suspend (D3)");
  await expect(page.getByTestId("timeline-event").nth(1)).toContainText("SUSPEND done");
});

test("the sequence editor adds a step and makes the sequence the default", async ({ page }) => {
  let sequence = { id: "seq_2", name: "Gentle", active: true, isDefault: false, activeEnrollments: 0, steps: [] as typeof STEPS, updatedAt: "2026-10-21T09:00:00.000Z" };
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() !== "GET") calls.push({ method: request.method(), path, body: request.postDataJSON() });
    if (path === "/dunning/sequences/seq_2/steps") {
      sequence = { ...sequence, steps: [{ id: "st_new", dayOffset: 2, action: "EMAIL", template: "billing_final_warning" }] };
      return json(route, 201, sequence);
    }
    if (path === "/dunning/sequences/seq_2" && request.method() === "PATCH") {
      sequence = { ...sequence, isDefault: true };
      return json(route, 200, sequence);
    }
    if (path === "/dunning/sequences/seq_2") return json(route, 200, sequence);
    if (path === "/dunning/sequences") return json(route, 200, { data: [sequence], actions: ["EMAIL", "EMAIL_IN_APP", "RETRY_PAYMENT", "SUSPEND"], templates: ["billing_payment_failed", "billing_final_warning"] });
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/dunning/sequences/seq_2");
  await expect(page.getByText("No steps yet.")).toBeVisible();
  await page.getByLabel("Day", { exact: true }).fill("2");
  await page.getByLabel("New step email").selectOption("billing_final_warning");
  await page.getByRole("button", { name: "Add step" }).click();
  await expect(page.getByTestId("sequence-step")).toContainText("Day 2: Email");
  await page.getByRole("button", { name: "Make default" }).click();
  await expect(page.getByRole("status")).toContainText("This is now the default sequence.");
  expect(calls).toEqual([
    { method: "POST", path: "/dunning/sequences/seq_2/steps", body: { dayOffset: 2, action: "EMAIL", template: "billing_final_warning" } },
    { method: "PATCH", path: "/dunning/sequences/seq_2", body: { isDefault: true } }
  ]);
});

test("ACC-DUN-5 save offers: create PENDING, approve with a reason, the code is shown", async ({ page }) => {
  let offers: Array<Record<string, unknown>> = [];
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/tenants") return json(route, 200, { data: [{ ...TENANT, plan: "PRO" }] });
    if (path === "/dunning/save-offers" && request.method() === "POST") {
      posts.push({ path, body: request.postDataJSON() });
      offers = [{ id: "so_1", tenantId: TENANT.id, tenant: TENANT, discount: "25.00", status: "PENDING", code: null, reason: "Retention", expiresAt: "2026-11-04T00:00:00.000Z", redeemedAt: null, approvedBy: null, createdAt: "2026-10-21T09:00:00.000Z" }];
      return json(route, 201, offers[0]);
    }
    if (path === "/dunning/save-offers/so_1/approve") {
      posts.push({ path, body: request.postDataJSON() });
      offers = [{ ...offers[0], status: "APPROVED", code: "SAVE-ABCD2345" }];
      return json(route, 200, { offer: offers[0] });
    }
    if (path === "/dunning/save-offers") return json(route, 200, { data: offers });
    return json(route, 200, { data: [] });
  });
  await page.goto("/revenue/dunning/save-offers");
  await page.getByRole("button", { name: "New offer" }).click();
  await page.getByLabel("Find a tenant").fill("north");
  await page.getByRole("button", { name: /Northwind Couriers/ }).click();
  await page.getByLabel("Credit (GBP)").fill("25.00");
  await page.getByLabel("Why").fill("Retention");
  await page.getByRole("dialog").getByRole("button", { name: "Create offer" }).click();
  await expect(page.getByTestId("save-offer-row")).toContainText("Pending");
  await page.getByTestId("save-offer-row").getByRole("button", { name: "Approve" }).click();
  await page.getByLabel(/Reason/).fill("Approved by the finance lead");
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toContainText("SAVE-ABCD2345");
  expect(posts).toEqual([
    { path: "/dunning/save-offers", body: { tenantId: TENANT.id, discount: "25.00", reason: "Retention" } },
    { path: "/dunning/save-offers/so_1/approve", body: { reason: "Approved by the finance lead" } }
  ]);
});
