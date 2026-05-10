import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiRequest,
  clearStoredTenantSlug,
  getStoredTenantSlug,
  setStoredTenantSlug,
  unwrapData,
} from "@/lib/api/http";

const createLocalStorage = () => {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
};

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds JSON requests with auth and tenant headers", async () => {
    const localStorage = createLocalStorage();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
      }),
    );

    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("fetch", fetchMock);

    setStoredTenantSlug("northline");
    const result = await apiRequest<{ ok: boolean }>("/api/v1/field/jobs", {
      method: "POST",
      token: "token-123",
      body: { ready: true },
      headers: {
        "X-Custom": "custom-value",
      },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8080/api/v1/field/jobs", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer token-123",
        "X-Tenant-Slug": "northline",
        "X-Custom": "custom-value",
      },
      body: JSON.stringify({ ready: true }),
    });
  });

  it("returns undefined for no-content responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(apiRequest("/api/v1/auth/logout")).resolves.toBeUndefined();
  });

  it("raises ApiError with backend error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Tenant is inactive" }), {
          status: 403,
        }),
      ),
    );

    await expect(apiRequest("/api/v1/field/jobs")).rejects.toEqual(
      new ApiError("Tenant is inactive", 403, { detail: "Tenant is inactive" }),
    );
  });
});

describe("tenant slug storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-ops outside a browser window", () => {
    expect(getStoredTenantSlug()).toBeUndefined();

    expect(() => {
      setStoredTenantSlug("northline");
      clearStoredTenantSlug();
    }).not.toThrow();
  });

  it("reads, writes, and clears the browser tenant slug", () => {
    const localStorage = createLocalStorage();

    vi.stubGlobal("window", { localStorage });

    expect(getStoredTenantSlug()).toBeUndefined();

    setStoredTenantSlug("northline");
    expect(getStoredTenantSlug()).toBe("northline");

    clearStoredTenantSlug();
    expect(getStoredTenantSlug()).toBeUndefined();
  });
});

describe("unwrapData", () => {
  it("unwraps API envelopes and leaves plain payloads unchanged", () => {
    expect(unwrapData({ data: [{ id: "job-1" }] })).toEqual([{ id: "job-1" }]);
    expect(unwrapData({ id: "job-1" })).toEqual({ id: "job-1" });
    expect(unwrapData("plain text")).toBe("plain text");
  });
});
