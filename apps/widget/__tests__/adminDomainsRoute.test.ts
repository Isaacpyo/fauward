import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const routeMocks = vi.hoisted(() => {
  class MockWidgetDomainConflictError extends Error {}

  return {
    authorizeWidgetDomainAdmin: vi.fn(),
    assertWidgetDomainAvailable: vi.fn(),
    createWidgetDomain: vi.fn(),
    getWidgetDomain: vi.fn(),
    markWidgetDomainVerified: vi.fn(),
    deleteWidgetDomain: vi.fn(),
    addDomainToProject: vi.fn(),
    getDomainStatus: vi.fn(),
    removeDomainFromProject: vi.fn(),
    mapDomainToTenant: vi.fn(),
    unmapDomain: vi.fn(),
    WidgetDomainConflictError: MockWidgetDomainConflictError,
  };
});

vi.mock("@/lib/adminAuth", () => ({
  authorizeWidgetDomainAdmin: routeMocks.authorizeWidgetDomainAdmin,
}));

vi.mock("@/lib/widgetDomainsDb", () => ({
  assertWidgetDomainAvailable: routeMocks.assertWidgetDomainAvailable,
  createWidgetDomain: routeMocks.createWidgetDomain,
  getWidgetDomain: routeMocks.getWidgetDomain,
  markWidgetDomainVerified: routeMocks.markWidgetDomainVerified,
  deleteWidgetDomain: routeMocks.deleteWidgetDomain,
  WidgetDomainConflictError: routeMocks.WidgetDomainConflictError,
}));

vi.mock("@/lib/vercelDomains", () => ({
  CNAME_TARGET: "cname.vercel-dns.com",
  addDomainToProject: routeMocks.addDomainToProject,
  getDomainStatus: routeMocks.getDomainStatus,
  removeDomainFromProject: routeMocks.removeDomainFromProject,
}));

vi.mock("@/lib/edgeConfigAdmin", () => ({
  mapDomainToTenant: routeMocks.mapDomainToTenant,
  unmapDomain: routeMocks.unmapDomain,
}));

import { DELETE, GET, POST } from "../app/api/admin/domains/route";

function postRequest(body: unknown) {
  return new NextRequest("https://widget.test/api/admin/domains", {
    method: "POST",
    headers: { authorization: "Bearer fw_key", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function queryRequest(method: "GET" | "DELETE", domain: string) {
  return new NextRequest(`https://widget.test/api/admin/domains?domain=${encodeURIComponent(domain)}`, {
    method,
    headers: { authorization: "Bearer fw_key" },
  });
}

async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("admin domains route", () => {
  beforeEach(() => {
    for (const mock of Object.values(routeMocks)) {
      if (typeof mock === "function" && "mockReset" in mock) {
        mock.mockReset();
      }
    }
    routeMocks.authorizeWidgetDomainAdmin.mockResolvedValue({ id: "tenant-a", slug: "acme" });
    routeMocks.createWidgetDomain.mockResolvedValue({ id: "domain-a", tenantId: "tenant-a", host: "ship.acme.com" });
    routeMocks.addDomainToProject.mockResolvedValue({ name: "ship.acme.com", verified: false, verification: [] });
    routeMocks.getWidgetDomain.mockResolvedValue({ id: "domain-a", tenantId: "tenant-a", host: "ship.acme.com" });
  });

  it("returns 401 when unauthorized", async () => {
    routeMocks.authorizeWidgetDomainAdmin.mockResolvedValueOnce(null);

    const response = await POST(postRequest({ domain: "ship.acme.com" }));

    expect(response.status).toBe(401);
  });

  it("writes the DB row before calling Vercel and returns CNAME details", async () => {
    const calls: string[] = [];
    routeMocks.createWidgetDomain.mockImplementation(async () => {
      calls.push("db");
      return { id: "domain-a", tenantId: "tenant-a", host: "ship.acme.com" };
    });
    routeMocks.addDomainToProject.mockImplementation(async () => {
      calls.push("vercel");
      return { name: "ship.acme.com", verified: false, verification: [] };
    });

    const response = await POST(postRequest({ domain: "Ship.Acme.com" }));
    const body = await responseJson(response);

    expect(response.status).toBe(200);
    expect(calls).toEqual(["db", "vercel"]);
    expect(body).toMatchObject({
      domain: "ship.acme.com",
      tenantSlug: "acme",
      cname: { type: "CNAME", name: "ship", value: "cname.vercel-dns.com" },
    });
  });

  it("rejects hosts already owned by another surface", async () => {
    routeMocks.assertWidgetDomainAvailable.mockRejectedValueOnce(
      new routeMocks.WidgetDomainConflictError("taken"),
    );

    const response = await POST(postRequest({ domain: "ship.acme.com" }));

    expect(response.status).toBe(409);
    expect(routeMocks.addDomainToProject).not.toHaveBeenCalled();
  });

  it("marks verified domains and refreshes Edge Config", async () => {
    routeMocks.getDomainStatus.mockResolvedValue({ verified: true, misconfigured: false, verification: [] });

    const response = await GET(queryRequest("GET", "ship.acme.com"));

    expect(response.status).toBe(200);
    expect(routeMocks.markWidgetDomainVerified).toHaveBeenCalledWith("ship.acme.com", "tenant-a");
    expect(routeMocks.mapDomainToTenant).toHaveBeenCalledWith("ship.acme.com", "acme");
  });

  it("deletes Vercel, Edge Config, and DB state", async () => {
    const response = await DELETE(queryRequest("DELETE", "ship.acme.com"));

    expect(response.status).toBe(200);
    expect(routeMocks.removeDomainFromProject).toHaveBeenCalledWith("ship.acme.com");
    expect(routeMocks.unmapDomain).toHaveBeenCalledWith("ship.acme.com");
    expect(routeMocks.deleteWidgetDomain).toHaveBeenCalledWith("ship.acme.com", "tenant-a");
  });
});
