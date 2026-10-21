import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// trust.kyc (WP-4.10): open a manual review, evidence list, approve with a reason, sanctions MATCH → LEGAL signal.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TENANT = { id: "tenant_1", name: "Northwind Couriers", slug: "northwind", kycStatus: "IN_REVIEW" };
const PERSONA_OFF = { vendor: "persona", configured: false, missing: ["PERSONA_API_KEY", "PERSONA_INQUIRY_TEMPLATE_ID"] };

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "kyc_1",
    tenant: TENANT,
    provider: "manual",
    inquiryId: null,
    status: "OPEN",
    requestNote: "Certificate of incorporation",
    evidence: [{ id: "ev_1", source: "TENANT", fileName: "incorporation.pdf", contentType: "application/pdf", byteSize: 2048, note: null, by: "u_1", at: "2026-10-21T09:00:00.000Z" }],
    decisionReason: null,
    decidedAt: null,
    reviewedBy: null,
    createdAt: "2026-10-20T09:00:00.000Z",
    screenings: [],
    ...overrides
  };
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-KYC-1 opening a manual review sends tenant, provider and request; the review page lists evidence and approves with a reason", async ({ page }) => {
  let current = review();
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() === "POST") posts.push({ path, body: request.postDataJSON() });
    if (path === "/kyc/reviews" && request.method() === "POST") return json(route, 201, current);
    if (path === "/kyc/reviews") return json(route, 200, { data: [], persona: PERSONA_OFF });
    if (path === "/tenants") return json(route, 200, { data: [{ ...TENANT, status: "ACTIVE", plan: "PRO" }] });
    if (path === "/kyc/reviews/kyc_1/decision") {
      current = { ...current, status: "APPROVED", decisionReason: "Documents match Companies House", tenant: { ...TENANT, kycStatus: "APPROVED" } };
      return json(route, 200, current);
    }
    if (path === "/kyc/reviews/kyc_1") return json(route, 200, current);
    return json(route, 200, { data: [] });
  });
  await page.goto("/trust/kyc");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("PERSONA_API_KEY");
  await page.getByRole("button", { name: "Open review" }).click();
  await page.getByLabel("Find a tenant").fill("north");
  await page.getByRole("button", { name: /Northwind Couriers/ }).click();
  await page.getByLabel("What to ask the tenant for (optional)").fill("Certificate of incorporation");
  await page.getByRole("dialog").getByRole("button", { name: "Open review" }).click();
  await expect(page).toHaveURL(/\/trust\/kyc\/kyc_1$/);
  expect(posts[0]).toEqual({ path: "/kyc/reviews", body: { tenantId: "tenant_1", provider: "manual", note: "Certificate of incorporation" } });
  await expect(page.getByTestId("kyc-evidence")).toContainText("from the tenant");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByLabel(/Reason/).fill("Documents match Companies House");
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toContainText("KYC approved.");
  expect(posts.at(-1)).toEqual({ path: "/kyc/reviews/kyc_1/decision", body: { decision: "APPROVED", reason: "Documents match Companies House" } });
});

test("ACC-KYC-3 a screening MATCH sends the type and reason and points to Trust & Safety", async ({ page }) => {
  const posts: unknown[] = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/kyc/screenings/scr_1/decision") {
      posts.push(request.postDataJSON());
      return json(route, 200, { screening: { id: "scr_1", status: "MATCH" }, signalId: "sig_1" });
    }
    if (path === "/kyc/screenings") return json(route, 200, { data: [{ id: "scr_1", tenant: TENANT, provider: "manual", source: "MONTHLY_RESCREEN", status: "PENDING", matchType: null, riskLevel: null, decisionReason: null, decidedAt: null, createdAt: "2026-10-01T03:00:00.000Z" }], complyAdvantage: { vendor: "complyadvantage", configured: false, missing: ["COMPLYADVANTAGE_API_KEY"] } });
    return json(route, 200, { data: [] });
  });
  await page.goto("/trust/kyc/sanctions");
  await expect(page.getByTestId("screening-row")).toContainText("monthly rescreen");
  await expect(page.getByTestId("degraded-vendor-unconfigured")).toContainText("COMPLYADVANTAGE_API_KEY");
  await page.getByRole("button", { name: "Match" }).click();
  await page.getByRole("dialog").getByLabel("Match type").selectOption("PEP");
  await page.getByLabel(/Reason/).fill("Director is a politically exposed person");
  await page.getByRole("dialog").getByRole("button", { name: "Record match" }).click();
  await expect(page.getByRole("status")).toContainText("a LEGAL signal is open in Trust & Safety");
  expect(posts).toEqual([{ decision: "MATCH", reason: "Director is a politically exposed person", matchType: "PEP" }]);
});
