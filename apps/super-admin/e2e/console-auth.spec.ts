import { expect, test, type Route } from "@playwright/test";

import { meBody } from "./support/console-session";

// 1x1 transparent PNG — stands in for the QR code data URL returned by enroll/start.
const QR_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const permissions = ["trust.iam.read", "trust.iam.write", "platform.tenants.read", "trust.jit.request"];

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("ACC-AUTH-6 login → enrol MFA → dashboard; a dangerous action opens the step-up modal and succeeds after a code", async ({ context, page }) => {
  let stage: "anonymous" | "pending" | "verified" = "anonymous";
  let freshMfa = false;
  const resetCalls: Array<{ key: string | null; body: unknown }> = [];
  const verifyCalls: string[] = [];

  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    const method = request.method();

    if (path === "/auth/login" && method === "POST") {
      expect(request.postDataJSON()).toEqual({ email: "ops@fauward.com", password: "correct horse battery" });
      stage = "pending";
      await context.addCookies([{ name: "fw_platform_csrf", value: "test-csrf", domain: "127.0.0.1", path: "/" }]);
      return json(route, 200, { mfa: "ENROLL", user: { id: "staff_001", email: "ops@fauward.com" } });
    }
    if (path === "/auth/mfa/enroll/start" && method === "POST") {
      return json(route, 200, { otpauth: "otpauth://totp/Fauward:ops@fauward.com?secret=JBSWY3DPEHPK3PXP&issuer=Fauward", qrCode: QR_DATA_URL });
    }
    if (path === "/auth/mfa/enroll/confirm" && method === "POST") {
      expect(request.postDataJSON()).toEqual({ code: "123456" });
      stage = "verified";
      return json(route, 200, { success: true, mfaVerifiedAt: new Date().toISOString() });
    }
    if (path === "/auth/mfa/verify" && method === "POST") {
      verifyCalls.push((request.postDataJSON() as { code: string }).code);
      freshMfa = true;
      return json(route, 200, { success: true });
    }
    if (path === "/auth/me") {
      if (stage === "anonymous") return json(route, 401, { error: "Unauthorized" });
      return json(route, 200, meBody(permissions, { pending: stage === "pending", mfaEnabled: stage === "verified" }));
    }
    if (path === "/auth/refresh") return json(route, 401, { error: "Unauthorized" });
    if (path === "/iam/users/staff_002" && method === "GET") {
      return json(route, 200, {
        id: "staff_002",
        email: "lost-phone@fauward.com",
        name: "Lost Phone",
        ssoProvider: "totp",
        status: "ACTIVE",
        mfaEnabled: true,
        hardwareKeyId: null,
        createdAt: "2026-10-01T09:00:00.000Z",
        updatedAt: "2026-10-01T09:00:00.000Z",
        lastLoginAt: null,
        roleAssignments: [],
        sessions: []
      });
    }
    if (path === "/iam/users/staff_002/mfa/reset" && method === "POST") {
      resetCalls.push({ key: request.headers()["idempotency-key"] ?? null, body: request.postDataJSON() });
      if (!freshMfa) return json(route, 403, { error: "MFA_REQUIRED", stepUp: true, message: "Fresh MFA verification is required for this action." });
      return json(route, 200, { id: "staff_002", mfaEnabled: false, sessionsRevokedAt: new Date().toISOString() });
    }
    return json(route, 200, { data: [] });
  });
  // Dashboard widgets still on the legacy namespace in Phase 0.
  await page.route("**/api/v1/**", (route) => json(route, 200, {}));

  await page.goto("/login");
  await page.getByLabel("Email").fill("ops@fauward.com");
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Set up two-factor authentication" })).toBeVisible();
  await expect(page.getByAltText("Authenticator QR code")).toBeVisible();
  await expect(page.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();
  // Paste with a space: the input keeps digits only.
  await page.getByLabel("6-digit code").fill("123 456");
  await page.getByRole("button", { name: "Confirm and continue" }).click();

  await expect(page).toHaveURL(/127\.0\.0\.1:4174\/$/);
  await expect(page.getByRole("heading", { name: "Fauward Console" })).toBeVisible();

  // An authenticated user is sent away from /login.
  await page.goto("/login", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Fauward Console" })).toBeVisible();

  await page.goto("/trust/iam/users/staff_002");
  await page.getByRole("button", { name: "Reset MFA" }).click();
  await page.getByLabel("Reason").fill("Lost phone, confirmed on a video call");
  await page.getByRole("button", { name: "Reset MFA" }).last().click();

  const stepUp = page.getByRole("dialog", { name: "Confirm it’s you" });
  await expect(stepUp).toBeVisible();
  await stepUp.getByLabel("6-digit code").fill("654321");
  await stepUp.getByRole("button", { name: "Verify and continue" }).click();
  await expect(stepUp).toBeHidden();

  await expect.poll(() => resetCalls.length).toBe(2);
  expect(verifyCalls).toEqual(["654321"]);
  expect(resetCalls[0].key).toBeTruthy();
  expect(resetCalls[1].key).toBe(resetCalls[0].key);
  expect(resetCalls[1].body).toEqual({ reason: "Lost phone, confirmed on a video call" });
});
