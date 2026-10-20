import type { BrowserContext, Page } from "@playwright/test";
import { PERMISSIONS } from "@fauward/internal-rbac";

/** Every console permission (a ROOT staff member). The console never derives permissions from a role (D2). */
export const ROOT_PERMISSIONS: string[] = [...PERMISSIONS];

export function meBody(permissions: string[], options: { pending?: boolean; mfaEnabled?: boolean; role?: string | null } = {}) {
  const pending = options.pending ?? false;
  const mfaEnabled = options.mfaEnabled ?? !pending;
  const verifiedAt = pending ? null : new Date().toISOString();
  return {
    user: { id: "staff_001", email: "staff@fauward.com", name: "Staff User", role: options.role === undefined ? "SUPER_ADMIN" : options.role, permissions, mfaEnabled, mfaVerifiedAt: verifiedAt },
    mfa: { enabled: mfaEnabled, verifiedAt, pending },
    roles: ["ROOT"],
    permissions,
    jit: []
  };
}

export async function addCsrfCookie(context: BrowserContext) {
  await context.addCookies([{ name: "fw_platform_csrf", value: "test-csrf", domain: "127.0.0.1", path: "/" }]);
}

/** Register after any broader `**\/api/internal/**` route: Playwright runs the most recently registered match first. */
export async function mockConsoleSession(page: Page, permissions: string[]) {
  await page.route("**/api/internal/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(meBody(permissions)) });
  });
}
