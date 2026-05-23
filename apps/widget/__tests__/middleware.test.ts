import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "@vercel/edge-config";
import { NextRequest } from "next/server";

import { config, middleware } from "../middleware";

vi.mock("@vercel/edge-config", () => ({
  get: vi.fn(),
}));

function requestFor(host: string, pathname = "/") {
  return new NextRequest(`https://widget.test${pathname}`, {
    headers: { host },
  });
}

describe("widget middleware", () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
  });

  it("lets platform hosts continue without a rewrite", async () => {
    const response = await middleware(requestFor("fauward.com", "/ship/acme"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("never rewrites portal-owned Fauward hosts", async () => {
    await expect(middleware(requestFor("app.fauward.com"))).resolves.toMatchObject({ status: 404 });
    await expect(middleware(requestFor("acme.fauward.com"))).resolves.toMatchObject({ status: 404 });
    expect(get).not.toHaveBeenCalled();
  });

  it("rewrites mapped tenant-owned domains", async () => {
    vi.mocked(get).mockResolvedValue({ "ship.acme.com": "acme" });

    const response = await middleware(requestFor("ship.acme.com", "/quote?mode=bulk"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/ship/acme/quote?mode=bulk");
  });

  it("returns 404 for unmapped tenant-owned domains", async () => {
    vi.mocked(get).mockResolvedValue({});

    const response = await middleware(requestFor("ship.unknown.com"));

    expect(response.status).toBe(404);
  });

  it("excludes api, _next, and file-extension paths", () => {
    expect(config.matcher[0]).toContain("api");
    expect(config.matcher[0]).toContain("_next");
    expect(config.matcher[0]).toContain(".*\\..*");
  });
});
