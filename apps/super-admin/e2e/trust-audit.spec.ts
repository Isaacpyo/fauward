import { expect, test, type Page, type Route } from "@playwright/test";

import { addCsrfCookie, meBody } from "./support/console-session";

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const READER = ["trust.audit.read"];
const AUDITOR = ["trust.audit.read", "trust.audit.export"];

function entry(index: number) {
  return {
    id: `aud_${String(index).padStart(3, "0")}`,
    actorType: "PLATFORM_USER",
    actorId: "pu_support",
    actorEmail: "support@fauward.com",
    actorRole: "PLATFORM_SUPPORT",
    action: index === 0 ? "tenant.suspend" : "tenant.view",
    targetType: "tenant",
    targetId: "t_acme",
    targetTenantId: "t_acme",
    targetUserId: null,
    targetTenant: { id: "t_acme", name: "Acme Freight", slug: "acme" },
    reason: index === 0 ? "Chargeback fraud confirmed" : null,
    before: index === 0 ? { status: "ACTIVE" } : null,
    after: index === 0 ? { status: "SUSPENDED" } : null,
    metadata: {},
    hash: `hash_${index}`,
    previousHash: null,
    createdAt: new Date(Date.UTC(2026, 9, 18, 9, 0, 0) - index * 60_000).toISOString()
  };
}

const ALL = Array.from({ length: 120 }, (_, index) => entry(index));

const LAST_RUN = {
  id: "run_nightly",
  status: "SUCCEEDED",
  triggeredBy: "SCHEDULE",
  startedAt: "2026-10-21T03:45:00.000Z",
  finishedAt: "2026-10-21T03:45:02.000Z",
  durationMs: 2000,
  error: null,
  result: { ok: true, checked: 1840, legacy: 1200, lastSeq: 1840, cutoverSeq: 1200, firstBrokenSeq: null, firstBrokenId: null, reason: null }
};
const BROKEN_RUN = {
  ...LAST_RUN,
  id: "run_manual",
  triggeredBy: "pu_auditor",
  result: { ok: false, checked: 1306, legacy: 1200, lastSeq: 1306, cutoverSeq: 1200, firstBrokenSeq: 1307, firstBrokenId: "aud_007", reason: "HASH_MISMATCH" }
};

type Seen = { lists: URLSearchParams[]; posts: Array<{ path: string; body: unknown }> };

async function mockAudit(page: Page, permissions: string[]) {
  const seen: Seen = { lists: [], posts: [] };
  await page.route("**/api/internal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/internal", "");
    if (path === "/auth/me") return json(route, 200, meBody(permissions));
    if (path === "/audit/entries") {
      seen.lists.push(url.searchParams);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const cursor = url.searchParams.get("cursor");
      const start = cursor ? ALL.findIndex((row) => row.id === cursor) + 1 : 0;
      const data = ALL.slice(start, start + limit);
      const hasMore = start + limit < ALL.length;
      return json(route, 200, { data, total: ALL.length, nextCursor: hasMore ? data[data.length - 1].id : null });
    }
    if (path === "/audit/export" && request.method() === "POST") {
      seen.posts.push({ path, body: request.postDataJSON() });
      return json(route, 200, { url: "data:text/csv;base64,aWQ=", format: "csv", rows: 120, truncated: false, maxRows: 10000 });
    }
    if (path === "/audit/verification") return json(route, 200, { data: LAST_RUN, schedule: "45 3 * * *" });
    if (path === "/audit/verify" && request.method() === "POST") {
      seen.posts.push({ path, body: request.postDataJSON() });
      return json(route, 200, { data: BROKEN_RUN });
    }
    return json(route, 200, { data: [] });
  });
  return seen;
}

test.beforeEach(async ({ context }) => {
  await addCsrfCookie(context);
});

test("ACC-AUD-1 typing in the search sends at most one request per 300 ms, with the final text", async ({ page }) => {
  const seen = await mockAudit(page, READER);
  await page.goto("/trust/audit");
  await expect(page.getByTestId("audit-row")).toHaveCount(50);
  const before = seen.lists.length;
  await page.getByLabel("Free text").pressSequentially("chargeback", { delay: 40 });
  await expect.poll(() => seen.lists.length).toBe(before + 1);
  await page.waitForTimeout(500);
  expect(seen.lists.length).toBe(before + 1);
  expect(seen.lists[seen.lists.length - 1].get("q")).toBe("chargeback");
  await expect(page).toHaveURL(/q=chargeback/);
});

test("ACC-AUD-2 Load more pages past the first 50 entries with the server cursor", async ({ page }) => {
  const seen = await mockAudit(page, READER);
  await page.goto("/trust/audit");
  await expect(page.getByTestId("audit-row")).toHaveCount(50);
  await page.getByRole("button", { name: "Load more (50 of 120)" }).click();
  await expect(page.getByTestId("audit-row")).toHaveCount(100);
  expect(seen.lists[seen.lists.length - 1].get("cursor")).toBe("aud_049");
  await page.getByRole("button", { name: "Load more (100 of 120)" }).click();
  await expect(page.getByTestId("audit-row")).toHaveCount(120);
  await expect(page.getByRole("button", { name: /Load more/ })).toHaveCount(0);
});

test("ACC-AUD-3 actor, action, tenant and date filters are sent together and survive reload", async ({ page }) => {
  const seen = await mockAudit(page, READER);
  await page.goto("/trust/audit?tenantId=t_acme&from=2026-10-01T00:00:00.000Z");
  await expect(page.getByTestId("audit-row")).toHaveCount(50);
  await page.getByLabel("Actor").fill("support@");
  await page.getByLabel("Action").fill("suspend");
  await page.getByLabel("Target type").selectOption("tenant");
  await expect.poll(() => seen.lists[seen.lists.length - 1]?.get("action")).toBe("suspend");
  const last = seen.lists[seen.lists.length - 1];
  expect(last.get("actor")).toBe("support@");
  expect(last.get("targetType")).toBe("tenant");
  expect(last.get("tenantId")).toBe("t_acme");
  expect(last.get("from")).toBe("2026-10-01T00:00:00.000Z");
  await expect(page.getByTestId("audit-tenant-filter")).toHaveText("Acme Freight (acme)");
  await page.reload();
  await expect(page.getByLabel("Actor")).toHaveValue("support@");
  await expect(page.getByLabel("Action")).toHaveValue("suspend");

  // Selecting an entry shows its before/after diff.
  await page.getByTestId("audit-row").first().click();
  await expect(page.getByRole("complementary", { name: "Entry detail" })).toContainText("Chargeback fraud confirmed");
  await expect(page.getByRole("complementary", { name: "Entry detail" })).toContainText("SUSPENDED");
});

test("ACC-AUD-4 export sends the current filters with a reason and offers the download", async ({ page }) => {
  const seen = await mockAudit(page, AUDITOR);
  await page.goto("/trust/audit?tenantId=t_acme&action=suspend");
  await page.getByRole("button", { name: "Export filtered set" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("tenantId=t_acme");
  const confirm = dialog.getByRole("button", { name: "Export" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Reason/).fill("SOC 2 evidence for Q4");
  await confirm.click();
  await expect(page.getByRole("link", { name: "Download CSV (120 entries)" })).toBeVisible();
  expect(seen.posts).toEqual([{ path: "/audit/export", body: { action: "suspend", tenantId: "t_acme", format: "csv", reason: "SOC 2 evidence for Q4" } }]);
});

test("ACC-AUD-4 without trust.audit.export the export button is disabled with the permission named", async ({ page }) => {
  await mockAudit(page, READER);
  await page.goto("/trust/audit");
  const button = page.getByRole("button", { name: "Export filtered set" });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("title", "Requires trust.audit.export");
});

test("ACC-AUD-8 integrity page shows the last nightly run; Verify now records a run and shows where the chain breaks", async ({ page }) => {
  const seen = await mockAudit(page, AUDITOR);
  await page.goto("/trust/audit/integrity");
  await expect(page.getByTestId("degraded-not-wired")).toHaveCount(0);
  await expect(page.getByTestId("audit-verify-result")).toContainText("Chain verified");
  await expect(page.getByTestId("audit-verify-result")).toContainText("nightly schedule");
  await expect(page.getByTestId("audit-verify-result")).toContainText("1840 entries checked");
  await page.getByRole("button", { name: "Verify now" }).click();
  await expect(page.getByTestId("audit-verify-result")).toContainText("Chain broken");
  await expect(page.getByTestId("audit-verify-result")).toContainText("seq 1307");
  await expect(page.getByTestId("audit-verify-result")).toContainText("aud_007");
  expect(seen.posts.filter((post) => post.path === "/audit/verify")).toHaveLength(1);
});
