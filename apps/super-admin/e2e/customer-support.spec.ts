import { expect, test, type Page, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// customer.support (WP-2.3): queue → detail → reply / internal note, new ticket dialog, permission, empty and error states.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const tenant = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind" };
const ticket = {
  id: "tkt_1",
  ticketNumber: "NORTHWIND-FWD-202610-0001",
  subject: "Labels print blank",
  category: "OTHER",
  priority: "URGENT",
  status: "OPEN",
  tenant,
  assignee: null,
  lastMessageAt: "2026-10-18T09:00:00.000Z",
  lastMessageAuthorType: "TENANT_USER",
  firstResponseAt: null,
  slaBreachedAt: "2026-10-18T10:00:00.000Z",
  slaBreach: "FIRST_RESPONSE",
  linkedTicketId: null,
  createdAt: "2026-10-18T08:00:00.000Z",
  updatedAt: "2026-10-18T09:00:00.000Z",
  resolvedAt: null
};

type Mock = { list?: unknown[]; listStatus?: number; posts: Array<{ url: string; body: unknown }>; patches: Array<{ url: string; body: unknown }> };

async function mockSupport(page: Page, options: { permissions?: string[]; list?: unknown[]; listStatus?: number } = {}) {
  const mock: Mock = { posts: [], patches: [] };
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(options.permissions ?? ROOT_PERMISSIONS));
    if (path === "/support/tickets" && request.method() === "GET") {
      if (options.listStatus) return json(route, options.listStatus, { error: "INTERNAL", message: "The support store is down" });
      const data = options.list ?? [ticket];
      return json(route, 200, { data, total: data.length, nextCursor: null });
    }
    if (path === "/support/tickets" && request.method() === "POST") {
      mock.posts.push({ url: path, body: request.postDataJSON() });
      return json(route, 201, { ticket: { ...ticket, id: "tkt_new", ticketNumber: "NORTHWIND-FWD-202610-0002" } });
    }
    if (path.startsWith("/support/tickets/") && path.endsWith("/messages")) {
      mock.posts.push({ url: path, body: request.postDataJSON() });
      return json(route, 201, { message: { id: "m_new", authorType: "STAFF", authorLabel: "Staff User", visibility: "PUBLIC", body: "x", createdAt: new Date().toISOString() }, ticket });
    }
    if (path.startsWith("/support/tickets/") && request.method() === "PATCH") {
      mock.patches.push({ url: path, body: request.postDataJSON() });
      return json(route, 200, { ticket: { ...ticket, ...(request.postDataJSON() as object) } });
    }
    if (path.startsWith("/support/tickets/")) {
      return json(route, 200, {
        ticket,
        requester: { id: "u_admin", email: "admin@northwind.test", firstName: "Ada", lastName: "Admin", role: "TENANT_ADMIN" },
        messages: [
          { id: "m1", authorType: "TENANT_USER", authorLabel: "Ada Admin", visibility: "PUBLIC", body: "Every label prints blank.", createdAt: "2026-10-18T08:00:00.000Z" },
          { id: "m2", authorType: "STAFF", authorLabel: "Sam Support", visibility: "STAFF_INTERNAL", body: "Legacy driver on their side.", createdAt: "2026-10-18T08:30:00.000Z" }
        ],
        linkedTicket: null
      });
    }
    if (path === "/support/macros") return json(route, 200, { data: [{ id: "acknowledge", title: "Acknowledge and investigating", body: "Thanks for getting in touch about {ticketNumber}." }] });
    if (path === "/tenants") return json(route, 200, { data: [{ ...tenant, status: "ACTIVE", plan: "PRO" }], total: 1, nextCursor: null });
    return json(route, 200, { data: [] });
  });
  return mock;
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-SUP-6 the queue shows PLATFORM tickets with tenant chip, waiting-on and SLA state", async ({ page }) => {
  await mockSupport(page);
  await page.goto("/customer/support");
  const row = page.getByTestId("ticket-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("NORTHWIND-FWD-202610-0001");
  await expect(row).toContainText("No first response");
  await expect(row).toContainText("Fauward");
  await expect(row.getByTestId("tenant-chip")).toHaveText("Northwind Couriers");
});

test("ACC-SUP-2 a reply and an internal note are sent with the right visibility; a macro fills the ticket number", async ({ page }) => {
  const mock = await mockSupport(page);
  await page.goto("/customer/support/tickets/tkt_1");
  await expect(page.getByTestId("ticket-message")).toHaveCount(2);
  await expect(page.locator('[data-visibility="STAFF_INTERNAL"]')).toContainText("Internal note — Fauward only");
  await page.getByLabel("Insert macro").selectOption("acknowledge");
  await expect(page.getByLabel("Message")).toHaveValue("Thanks for getting in touch about NORTHWIND-FWD-202610-0001.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(mock.posts[0]).toEqual({ url: "/support/tickets/tkt_1/messages", body: { body: "Thanks for getting in touch about NORTHWIND-FWD-202610-0001.", visibility: "PUBLIC" } });

  await page.getByRole("radio", { name: "Internal note" }).click();
  await page.getByLabel("Message").fill("Checked the driver version with the tenant.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect.poll(() => mock.posts.length).toBe(2);
  expect(mock.posts[1].body).toEqual({ body: "Checked the driver version with the tenant.", visibility: "STAFF_INTERNAL" });

  await page.getByLabel("Status").selectOption("RESOLVED");
  await expect.poll(() => mock.patches.length).toBe(1);
  expect(mock.patches[0]).toEqual({ url: "/support/tickets/tkt_1", body: { status: "RESOLVED" } });
});

test("WP-2.3 New ticket opens a real dialog and posts the tenant, subject and first message", async ({ page }) => {
  const mock = await mockSupport(page);
  await page.goto("/customer/support");
  await page.getByRole("button", { name: "New ticket" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tenant", { exact: true }).fill("north");
  await dialog.getByRole("button", { name: /Northwind Couriers/ }).click();
  await dialog.getByLabel("Subject").fill("Your API key expires next week");
  await dialog.getByLabel("Message to the tenant").fill("Rotate the key in Developer settings before Friday to avoid failed calls.");
  await dialog.getByRole("button", { name: "Open ticket" }).click();
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(mock.posts[0].body).toEqual({ tenantId: "tenant_1", subject: "Your API key expires next week", category: "OTHER", priority: "NORMAL", body: "Rotate the key in Developer settings before Friday to avoid failed calls." });
  await expect(page).toHaveURL(/\/customer\/support\/tickets\/tkt_new$/);
});

test("WP-2.3 empty view, error state and read-only staff", async ({ page }) => {
  await mockSupport(page, { list: [], permissions: ["customer.support.read"] });
  await page.goto("/customer/support?view=mine");
  await expect(page.getByText("No tickets in this view.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New ticket" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "New ticket" })).toHaveAttribute("title", "Requires customer.support.write");
});

test("WP-2.3 a failing queue API shows the error, and staff without customer.support.read see access denied", async ({ page }) => {
  await mockSupport(page, { listStatus: 500 });
  await page.goto("/customer/support");
  await expect(page.getByRole("alert")).toContainText("The support store is down");
  await page.unrouteAll();
  await mockSupport(page, { permissions: ["customer.360.read"] });
  await page.goto("/customer/support");
  await expect(page.getByText(/customer\.support\.read/).first()).toBeVisible();
  await expect(page.getByTestId("ticket-row")).toHaveCount(0);
});
