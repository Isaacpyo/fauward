import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// L2 / L20 (WP-4.R): the console Relay inbox and conversation go through /api/internal/relay/* with the cookie session
// (no Authorization header, nothing in localStorage); a staff reply sends; an AI draft is edited, approved and sent;
// a tenant conversation converts to a ticket.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const CONVERSATION = {
  id: "c0ffee00-0000-4000-8000-000000000001",
  source: "tenant_portal",
  tenant: { id: "tenant_a", name: "Acme Freight", slug: "acme" },
  customerName: "Dana Ops",
  customerEmail: "dana@acme.test",
  subject: "Invoice question",
  status: "open",
  aiStatus: "human_needed",
  assignedTo: null,
  lastMessageAt: "2026-10-21T09:00:00.000Z",
  createdAt: "2026-10-21T08:55:00.000Z"
};

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-L2-1 the inbox and a conversation load through /api/internal/relay with the cookie session; a reply sends", async ({ page }) => {
  const relayRequests: Array<{ path: string; authorization: string | undefined; body: unknown }> = [];
  const messages = [{ id: "m1", senderType: "customer", senderId: null, body: "Why was I charged twice?", isDraft: false, approvedBy: null, approvedAt: null, createdAt: "2026-10-21T09:00:00.000Z" }];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/internal/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path.startsWith("/api/v1/relay") || path.startsWith("/api/relay")) return json(route, 500, { error: "the console must not call the tenant Relay API" });
    if (path.startsWith("/api/internal/relay")) relayRequests.push({ path, authorization: request.headers().authorization, body: request.method() === "GET" ? null : request.postDataJSON() });
    if (path === "/api/internal/relay/conversations") return json(route, 200, { data: [{ ...CONVERSATION, pendingDrafts: true }] });
    if (path === `/api/internal/relay/conversations/${CONVERSATION.id}/messages`) {
      messages.push({ id: "m2", senderType: "admin", senderId: "staff", body: "We refunded the duplicate.", isDraft: false, approvedBy: "staff", approvedAt: "2026-10-21T09:05:00.000Z", createdAt: "2026-10-21T09:05:00.000Z" });
      return json(route, 201, messages[1]);
    }
    if (path === `/api/internal/relay/conversations/${CONVERSATION.id}`) return json(route, 200, { ...CONVERSATION, messages, ticket: null });
    return json(route, 200, { data: [] });
  });

  await page.goto("/customer/support/relay");
  await expect(page.getByTestId("relay-conversation")).toContainText("Invoice question");
  await expect(page.getByTestId("relay-conversation")).toContainText("Draft to approve");
  await page.getByRole("link", { name: "Invoice question" }).click();
  await expect(page.getByTestId("relay-message")).toContainText("Why was I charged twice?");
  await page.getByLabel("Reply text").fill("We refunded the duplicate.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByRole("status")).toHaveText("Reply sent.");
  await expect(page.getByTestId("relay-message")).toHaveCount(2);

  expect(relayRequests.length).toBeGreaterThan(2);
  expect(relayRequests.every((item) => item.authorization === undefined)).toBe(true);
  expect(relayRequests.find((item) => item.path.endsWith("/messages"))?.body).toEqual({ body: "We refunded the duplicate." });
  expect(await page.evaluate(() => window.localStorage.getItem("fw_access_token"))).toBeNull();
});

test("ACC-L20-1 an AI draft is edited, approved and sent from the console; convert to ticket links the ticket", async ({ page }) => {
  let approved = false;
  let converted = false;
  let approveBody: unknown = null;
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/relay/messages/d1/approve-and-send") {
      approveBody = request.postDataJSON();
      approved = true;
      return json(route, 200, { id: "d1", senderType: "admin", isDraft: false });
    }
    if (path === `/relay/conversations/${CONVERSATION.id}/convert-to-ticket`) {
      converted = true;
      return json(route, 201, { ticket: { id: "t1", ticketNumber: "ACME-FWD-202610-0001", status: "OPEN" } });
    }
    if (path === `/relay/conversations/${CONVERSATION.id}`) {
      const draft = { id: "d1", senderType: "admin", senderId: null, body: "AI draft: sorry about that", isDraft: !approved, approvedBy: approved ? "staff" : null, approvedAt: null, createdAt: "2026-10-21T09:01:00.000Z" };
      return json(route, 200, { ...CONVERSATION, messages: [draft], ticket: converted ? { id: "t1", ticketNumber: "ACME-FWD-202610-0001", status: "OPEN" } : null });
    }
    return json(route, 200, { data: [] });
  });

  await page.goto(`/customer/support/relay/${CONVERSATION.id}`);
  await expect(page.getByTestId("relay-draft")).toContainText("not visible to the customer until approved");
  await page.getByLabel("Draft reply").fill("Sorry about that: the duplicate charge is refunded.");
  await page.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.getByRole("status")).toHaveText("Draft approved and sent.");
  await expect(page.getByTestId("relay-draft")).toHaveCount(0);
  expect(approveBody).toEqual({ body: "Sorry about that: the duplicate charge is refunded." });

  await page.getByRole("button", { name: "Convert to ticket" }).click();
  await expect(page.getByRole("status")).toHaveText("Converted to a support ticket.");
  await expect(page.getByRole("link", { name: "Ticket ACME-FWD-202610-0001" })).toBeVisible();
});
