import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdmin, getSupabaseClient, getTenantDb } from "./client";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function setEnv() {
  process.env.SUPABASE_URL = env.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
}

function latestCreateClientOptions() {
  const calls = vi.mocked(createClient).mock.calls;
  const options = calls.at(-1)?.[2];
  if (!options) throw new Error("Expected Supabase client options");
  return options as {
    global?: { fetch?: typeof fetch };
    auth?: { autoRefreshToken?: boolean; persistSession?: boolean };
    db?: { schema?: string };
  };
}

describe("Supabase client factories", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(createClient).mockClear();
    setEnv();
  });

  it("disables Next data caching for public tenant reads", async () => {
    getSupabaseClient();
    const options = latestCreateClientOptions();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    await options.global?.fetch?.("https://example.supabase.co/rest/v1/tenants", {
      next: { tags: ["tenant"] },
    } as RequestInit & { next: { tags: string[] } });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/tenants",
      expect.objectContaining({
        cache: "no-store",
        next: expect.objectContaining({
          revalidate: 0,
          tags: ["tenant"],
        }),
      }),
    );
  });

  it("disables Next data caching for service-role tenant reads", () => {
    getSupabaseAdmin();
    const options = latestCreateClientOptions();

    expect(options.auth).toEqual({ autoRefreshToken: false, persistSession: false });
    expect(options.global?.fetch).toEqual(expect.any(Function));
  });

  it("disables Next data caching for tenant schema clients", () => {
    getTenantDb("demo-slug");
    const options = latestCreateClientOptions();

    expect(options.db).toEqual({ schema: "tenant_demo_slug" });
    expect(options.global?.fetch).toEqual(expect.any(Function));
  });
});
