import { expect, test, type Route } from "@playwright/test";

import { ROOT_PERMISSIONS, addCsrfCookie, meBody } from "./support/console-session";

// gtm.contracts (WP-4.19): creating a quote, submitting it into approval, approving it with a reason, sending without
// DocuSign, accepting with the signed PDF upload, the MSA list and the discounts view by status.

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const TENANT = { id: "tenant_a", name: "Acme Freight", slug: "acme", plan: "PRO", kycStatus: "NOT_STARTED" };

function quote(overrides: Record<string, unknown> = {}) {
  return {
    id: "q_1",
    quoteNumber: "Q-202610-ABC123",
    tenant: TENANT,
    plan: "PRO",
    billingCycle: "MONTHLY",
    termMonths: 12,
    discountPercent: "25.00",
    listMonthly: "79.00",
    netMonthly: "59.25",
    currency: "GBP",
    startDate: null,
    customFeatures: [],
    notes: null,
    signerName: "Dana Ops",
    signerEmail: "dana@acme.test",
    status: "DRAFT",
    contractId: null,
    docusignEnvelopeId: null,
    needsApproval: ["Discount above 20%"],
    pdfUrl: "/contracts/quotes/q_1/pdf",
    submittedAt: null,
    sentAt: null,
    acceptedAt: null,
    createdAt: "2026-10-21T09:00:00.000Z",
    approvals: [],
    msa: null,
    approvalThresholdPercent: 20,
    docusign: { configured: false, missing: ["DOCUSIGN_ACCESS_TOKEN", "DOCUSIGN_ACCOUNT_ID"] },
    ...overrides
  };
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-CPQ-1 a 25% quote goes to approval and an approver decides it with a reason", async ({ page }) => {
  let state = quote();
  const calls: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (request.method() !== "GET") calls.push({ path, body: request.postDataJSON() });
    if (path === "/contracts/quotes/q_1/submit") {
      state = quote({ status: "PENDING_APPROVAL", approvals: [{ id: "ap_1", status: "PENDING", reasons: ["Discount above 20%"], requestedBy: "staff_a", approverId: null, conditions: null, decidedAt: null, createdAt: "2026-10-21T09:05:00.000Z" }] });
      return json(route, 200, state);
    }
    if (path === "/contracts/quotes/q_1") return json(route, 200, state);
    if (path === "/contracts/approvals" && request.method() === "GET") {
      return json(route, 200, { data: state.status === "PENDING_APPROVAL" ? [{ ...state.approvals[0], quote: state }] : [] });
    }
    if (path === "/contracts/approvals/ap_1/decision") {
      state = quote({ status: "APPROVED", needsApproval: ["Discount above 20%"] });
      return json(route, 200, state);
    }
    return json(route, 200, { data: [] });
  });

  await page.goto("/gtm/contracts/quotes/q_1");
  await expect(page.getByTestId("needs-approval")).toContainText("Discount above 20%");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toHaveText("Sent for approval.");

  await page.goto("/gtm/contracts/approvals");
  await expect(page.getByTestId("approval-row")).toContainText("25.00% off");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByLabel("Conditions").fill("Annual prepay");
  await page.getByLabel(/Reason/).fill("Strategic logo for Q4");
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toHaveText("Q-202610-ABC123 approved.");
  expect(calls).toEqual([
    { path: "/contracts/quotes/q_1/submit", body: {} },
    { path: "/contracts/approvals/ap_1/decision", body: { decision: "APPROVED", reason: "Strategic logo for Q4", conditions: "Annual prepay" } }
  ]);
});

test("ACC-CPQ-2 an approved quote is sent as a PDF without DocuSign and accepted with the signed PDF", async ({ page }) => {
  let state = quote({ status: "APPROVED" });
  let acceptBody: Record<string, unknown> | null = null;
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/contracts/quotes/q_1/send") {
      state = quote({ status: "SENT", sentAt: "2026-10-21T10:00:00.000Z" });
      return json(route, 200, { quote: state, delivery: "MANUAL" });
    }
    if (path === "/contracts/quotes/q_1/accept") {
      acceptBody = request.postDataJSON() as Record<string, unknown>;
      state = quote({ status: "ACCEPTED", msa: { id: "msa_1", tenantId: "tenant_a", quoteId: "q_1", contractId: "cc_1", signedVia: "MANUAL", signatureDate: "2026-10-21T11:00:00.000Z", expiryDate: "2027-10-21T11:00:00.000Z", governingLaw: null, fileName: "signed.pdf", documentUrl: "/contracts/msas/msa_1/document" } });
      return json(route, 200, { quote: state, contractId: "cc_1", msaId: "msa_1", overrideId: "po_1" });
    }
    if (path === "/contracts/quotes/q_1") return json(route, 200, state);
    return json(route, 200, { data: [] });
  });

  await page.goto("/gtm/contracts/quotes/q_1");
  await expect(page.getByText("DocuSign is not connected: Send marks the quote as sent.")).toBeVisible();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toHaveText("Marked as sent: download the PDF and send it to the signer.");
  await expect(page.getByRole("link", { name: "Download quote PDF" })).toHaveAttribute("href", "/api/internal/contracts/quotes/q_1/pdf");

  await page.getByRole("button", { name: "Upload signed PDF" }).click();
  await page.getByLabel("Signed PDF").setInputFiles({ name: "signed.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  await page.getByLabel(/Reason/).fill("Signed copy received from Dana");
  await page.getByRole("dialog").getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("status")).toHaveText("Quote accepted: contract active.");
  await expect(page.getByRole("region", { name: "Agreement" })).toContainText("via upload");
  expect(acceptBody).toMatchObject({ fileName: "signed.pdf", contentType: "application/pdf", reason: "Signed copy received from Dana" });
  expect(Buffer.from(String(acceptBody!.dataBase64), "base64").toString("latin1")).toContain("%PDF-");
});

test("creating a quote posts the form and opens it", async ({ page }) => {
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/tenants") return json(route, 200, { data: [{ ...TENANT, status: "ACTIVE" }], total: 1, nextCursor: null });
    if (path === "/contracts/quotes" && request.method() === "POST") {
      posted = request.postDataJSON() as Record<string, unknown>;
      return json(route, 201, quote({ discountPercent: "10.00", netMonthly: "71.10", needsApproval: [] }));
    }
    if (path === "/contracts/quotes/q_1") return json(route, 200, quote({ discountPercent: "10.00", netMonthly: "71.10", needsApproval: [] }));
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/contracts/quotes/new");
  await page.getByRole("button", { name: "Choose a tenant" }).click();
  await page.getByLabel("Find the tenant").fill("acme");
  await page.getByRole("button", { name: /Acme Freight/ }).click();
  await page.getByLabel("Discount %").fill("10");
  await page.getByRole("button", { name: "Create quote" }).click();
  await expect(page).toHaveURL(/\/gtm\/contracts\/quotes\/q_1$/);
  await expect(page.getByTestId("quote-summary")).toContainText("10.00% off");
  expect(posted).toMatchObject({ tenantId: "tenant_a", plan: "PRO", billingCycle: "MONTHLY", termMonths: 12, discountPercent: 10 });
});

test("ACC-CPQ-4 the discounts view groups quotes by real status; MSAs list renewals", async ({ page }) => {
  await page.route("**/api/internal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(ROOT_PERMISSIONS));
    if (path === "/contracts/discounts") {
      return json(route, 200, {
        approvalThresholdPercent: 20,
        groups: [
          { status: "PENDING_APPROVAL", count: 1, averageDiscountPercent: "30.00", quotes: [quote({ status: "PENDING_APPROVAL", discountPercent: "30.00" })] },
          { status: "ACCEPTED", count: 1, averageDiscountPercent: "10.00", quotes: [quote({ id: "q_2", quoteNumber: "Q-2", status: "ACCEPTED", discountPercent: "10.00" })] }
        ]
      });
    }
    if (path === "/contracts/msas") {
      return json(route, 200, { data: [{ id: "msa_1", tenantId: "tenant_a", quoteId: "q_2", contractId: "cc_1", signedVia: "DOCUSIGN", signatureDate: "2026-01-10T00:00:00.000Z", expiryDate: "2026-12-01T00:00:00.000Z", governingLaw: "England and Wales", fileName: "signed.pdf", documentUrl: "/contracts/msas/msa_1/document", tenant: { id: "tenant_a", name: "Acme Freight", slug: "acme" }, daysToRenewal: 41 }] });
    }
    return json(route, 200, { data: [] });
  });
  await page.goto("/gtm/contracts/discounts");
  await expect(page.getByTestId("discount-group-PENDING_APPROVAL")).toContainText("Waiting for approval · 1 · average 30.00%");
  await expect(page.getByTestId("discount-group-ACCEPTED")).toContainText("Q-2");
  await expect(page.getByTestId("discount-group-DRAFT")).toHaveCount(0);

  await page.goto("/gtm/contracts/msas");
  await expect(page.getByTestId("msa-row")).toContainText("via DocuSign");
  await expect(page.getByTestId("msa-row")).toContainText("(41 days)");
});
