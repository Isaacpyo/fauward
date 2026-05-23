import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mapDomainToTenant, unmapDomain } from "../lib/edgeConfigAdmin";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("edgeConfigAdmin", () => {
  beforeEach(() => {
    process.env.VERCEL_TOKEN = "token";
    process.env.EDGE_CONFIG_ID = "ecfg_widget";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VERCEL_TOKEN;
    delete process.env.EDGE_CONFIG_ID;
  });

  it("merges domain mappings without clobbering existing hosts", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([{ key: "domains", value: { "ship.old.com": "old" } }]))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    await mapDomainToTenant("ship.acme.com", "acme");

    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body)) as {
      items: Array<{ value: Record<string, string> }>;
    };
    expect(body.items[0]?.value).toEqual({
      "ship.old.com": "old",
      "ship.acme.com": "acme",
    });
  });

  it("removes only the requested host", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([{ key: "domains", value: { "ship.old.com": "old", "ship.acme.com": "acme" } }]))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    await unmapDomain("ship.acme.com");

    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body)) as {
      items: Array<{ value: Record<string, string> }>;
    };
    expect(body.items[0]?.value).toEqual({ "ship.old.com": "old" });
  });
});
