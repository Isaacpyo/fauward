import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { get } from "@vercel/edge-config";

import { normalizeHost, resolveTenantByHost } from "../lib/resolveTenantByHost";

vi.mock("@vercel/edge-config", () => ({
  get: vi.fn(),
}));

describe("resolveTenantByHost", () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
  });

  it("normalizes host casing and ports", () => {
    expect(normalizeHost(" Ship.Acme.com:443 ")).toBe("ship.acme.com");
    expect(normalizeHost("[::1]:3002")).toBe("[::1]");
  });

  it("returns a mapped tenant slug", async () => {
    vi.mocked(get).mockResolvedValue({ "ship.acme.com": "acme" });

    await expect(resolveTenantByHost("Ship.Acme.com:443")).resolves.toBe("acme");
    expect(get).toHaveBeenCalledWith("domains");
  });

  it("returns null for misses and Edge Config errors", async () => {
    vi.mocked(get).mockResolvedValueOnce({ "ship.acme.com": "acme" });
    await expect(resolveTenantByHost("missing.example.com")).resolves.toBeNull();

    vi.mocked(get).mockRejectedValueOnce(new Error("edge config unavailable"));
    await expect(resolveTenantByHost("ship.acme.com")).resolves.toBeNull();
  });

  it("does not import Node database libraries", () => {
    const source = readFileSync(path.join(__dirname, "../lib/resolveTenantByHost.ts"), "utf8");
    expect(source).not.toContain("@fauward/tenant-db");
    expect(source).not.toContain("prisma");
    expect(source).not.toContain("node:");
  });
});
