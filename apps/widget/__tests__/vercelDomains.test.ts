import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addDomainToProject, getDomainStatus, removeDomainFromProject } from "../lib/vercelDomains";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("vercelDomains", () => {
  beforeEach(() => {
    process.env.VERCEL_TOKEN = "token";
    process.env.VERCEL_PROJECT_ID = "prj_widget";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
  });

  it("treats add-domain 409 as ok when the domain is already on the project", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: "exists" } }, { status: 409 }))
      .mockResolvedValueOnce(jsonResponse({ name: "ship.acme.com", verified: false, verification: [] }));

    await expect(addDomainToProject("ship.acme.com")).resolves.toMatchObject({
      name: "ship.acme.com",
      verified: false,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.vercel.com/v10/projects/prj_widget/domains");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("teamId");
  });

  it("merges project-domain and domain-config status", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        name: "ship.acme.com",
        verified: true,
        verification: [{ type: "TXT", domain: "_vercel.ship.acme.com", value: "abc" }],
      }))
      .mockResolvedValueOnce(jsonResponse({ misconfigured: false }));

    await expect(getDomainStatus("ship.acme.com")).resolves.toEqual({
      verified: true,
      misconfigured: false,
      verification: [{ type: "TXT", domain: "_vercel.ship.acme.com", value: "abc" }],
    });
  });

  it("treats delete 404 as ok", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "missing" } }, { status: 404 }));

    await expect(removeDomainFromProject("ship.acme.com")).resolves.toBeUndefined();
  });
});
