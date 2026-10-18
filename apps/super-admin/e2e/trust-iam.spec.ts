import { expect, test, type Page, type Route } from "@playwright/test";

import { addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const staffUser = {
  id: "staff_002",
  email: "ops@fauward.com",
  name: "Ops Person",
  ssoProvider: "totp",
  status: "ACTIVE",
  mfaEnabled: true,
  hardwareKeyId: null,
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
  lastLoginAt: null,
  roleAssignments: [],
  sessions: []
};
const roles = [
  { id: "SUPPORT_LEAD", name: "SUPPORT LEAD", description: "", permissions: [], isSystem: true, deprecated: false },
  { id: "SUPER_ADMIN", name: "SUPER ADMIN", description: "", permissions: [], isSystem: true, deprecated: true }
];

async function mockIam(page: Page, permissions: string[], role: string | null, calls: Array<{ method: string; path: string; body: unknown; key: string | null }>) {
  await page.route("**/api/v1/**", (route) => json(route, 200, {}));
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (request.method() !== "GET") calls.push({ method: request.method(), path, body: request.postDataJSON(), key: request.headers()["idempotency-key"] ?? null });
    if (path === "/auth/me") return json(route, 200, meBody(permissions, { role }));
    if (path === "/iam/users/staff_002") return json(route, 200, staffUser);
    if (path === "/iam/roles") return json(route, 200, { data: roles });
    if (path === "/iam/users" && request.method() === "GET") return json(route, 200, { data: [staffUser] });
    if (path === "/iam/role-assignments" && request.method() === "POST") {
      return json(route, 201, { id: "assignment_001", staffId: "staff_002", roleId: "SUPPORT_LEAD", grantedBy: "pu", grantedAt: new Date().toISOString(), expiresAt: null, role: roles[0] });
    }
    return json(route, 200, { data: [] });
  });
}

test("ACC-IAM-6 role assignment needs confirm + reason; choosing a role never assigns on its own", async ({ context, page }) => {
  await addCsrfCookie(context);
  const calls: Array<{ method: string; path: string; body: unknown; key: string | null }> = [];
  await mockIam(page, [], "SUPER_ADMIN", calls);

  await page.goto("/trust/iam/users/staff_002");
  await expect(page.getByRole("heading", { name: "Role assignments" })).toBeVisible();
  // Deprecated roles are not offered.
  await expect(page.getByLabel("Role to assign").locator("option")).toHaveText(["Choose a role", "SUPPORT_LEAD"]);
  await page.getByLabel("Role to assign").selectOption("SUPPORT_LEAD");
  expect(calls).toEqual([]);

  await page.getByRole("button", { name: "Assign role" }).click();
  const dialog = page.getByRole("dialog", { name: /Assign SUPPORT_LEAD/ });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Assign role" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Reason/).fill("short");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Reason/).fill("Covering the support rota this week");
  await confirm.click();

  await expect(page.getByRole("status")).toContainText("SUPPORT_LEAD assigned to ops@fauward.com");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ method: "POST", path: "/iam/role-assignments", body: { staffId: "staff_002", roleId: "SUPPORT_LEAD", reason: "Covering the support rota this week" } });
  expect(calls[0].key).toBeTruthy();
});

test("the create form and actions are disabled with 'Requires trust.iam.write' for read-only staff", async ({ context, page }) => {
  await addCsrfCookie(context);
  const calls: Array<{ method: string; path: string; body: unknown; key: string | null }> = [];
  await mockIam(page, ["trust.iam.read"], null, calls);

  await page.goto("/trust/iam/users");
  const add = page.getByRole("button", { name: "Add staff user" });
  await expect(add).toBeDisabled();
  await expect(add).toHaveAttribute("title", "Requires trust.iam.write");

  await page.goto("/trust/iam/users/staff_002");
  await expect(page.getByRole("button", { name: "Suspend" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset MFA" })).toHaveAttribute("title", "Requires trust.iam.write");
  expect(calls).toEqual([]);
});
