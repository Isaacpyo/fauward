import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseAdmin } from "../client";
import { getTenantBySlug, getTenantBySlugOrHistory } from "./tenants";

vi.mock("../client", () => ({
  getSupabaseAdmin: vi.fn(),
}));

type Row = Record<string, unknown>;
type Tables = {
  tenants: Row[];
  tenant_slug_history: Row[];
  tenant_members: Row[];
  tenant_settings?: Row[];
};
type Filter = { op: "eq" | "gt"; column: string; value: unknown };
type QueryCall = { table: string; filters: Filter[] };

type MockQuery = {
  select: (columns?: string, options?: { count?: "exact"; head?: boolean }) => MockQuery;
  eq: (column: string, value: unknown) => MockQuery;
  gt: (column: string, value: unknown) => MockQuery;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  single: () => Promise<{ data: Row | null; error: null }>;
  insert: (row: Row) => MockInsertResult;
};

type MockInsertResult = {
  select: () => { single: () => Promise<{ data: Row; error: null }> };
};

function tableRows(tables: Tables, table: string): Row[] {
  if (table === "tenants") return tables.tenants;
  if (table === "tenant_slug_history") return tables.tenant_slug_history;
  if (table === "tenant_members") return tables.tenant_members;
  if (table === "tenant_settings") return tables.tenant_settings ?? [];
  throw new Error(`Unexpected table ${table}`);
}

function matchesFilter(row: Row, filter: Filter) {
  const value = row[filter.column];
  if (filter.op === "eq") return value === filter.value;
  if (typeof value !== "string" || typeof filter.value !== "string") return false;
  return value > filter.value;
}

function createQuery(table: string, tables: Tables, calls: QueryCall[]): MockQuery {
  const filters: Filter[] = [];

  const query: MockQuery = {
    select: () => query,
    eq: (column, value) => {
      filters.push({ op: "eq", column, value });
      return query;
    },
    gt: (column, value) => {
      filters.push({ op: "gt", column, value });
      return query;
    },
    maybeSingle: async () => {
      calls.push({ table, filters: [...filters] });
      return { data: tableRows(tables, table).find((row) => filters.every((filter) => matchesFilter(row, filter))) ?? null, error: null };
    },
    single: async () => {
      calls.push({ table, filters: [...filters] });
      return { data: tableRows(tables, table).find((row) => filters.every((filter) => matchesFilter(row, filter))) ?? null, error: null };
    },
    insert: (row) => {
      const inserted = { id: row.id ?? "new-id", createdAt: row.createdAt ?? new Date().toISOString(), ...row };
      tableRows(tables, table).push(inserted);
      return {
        select: () => ({
          single: async () => ({ data: inserted, error: null }),
        }),
      };
    },
  };

  return query;
}

function mockSupabase(tables: Tables) {
  const calls: QueryCall[] = [];
  const admin = {
    from: (table: string) => createQuery(table, tables, calls),
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);
  return { calls };
}

describe("@fauward/tenant-db tenant accessors", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReset();
  });

  it("normalizes branding from canonical tenants columns", async () => {
    mockSupabase({
      tenants: [
        {
          id: "tenant-a",
          slug: "acme",
          name: "Acme Logistics",
          plan: "ACTIVE",
          status: "ACTIVE",
          createdAt: "2026-01-01T00:00:00.000Z",
          primaryColor: "#111111",
          accentColor: "#222222",
          logoUrl: "https://cdn.example/logo.png",
        },
      ],
      tenant_slug_history: [],
      tenant_members: [],
    });

    const tenant = await getTenantBySlug("Acme");

    expect(tenant?.displayName).toBe("Acme Logistics");
    expect(tenant?.branding).toEqual({
      primary: "#111111",
      accent: "#222222",
      radius: "8px",
      logoUrl: "https://cdn.example/logo.png",
    });
  });

  it("returns an active tenant for a current slug", async () => {
    mockSupabase({
      tenants: [{ id: "tenant-a", slug: "acme", name: "Acme", plan: "PRO", status: "ACTIVE" }],
      tenant_slug_history: [],
      tenant_members: [],
    });

    await expect(getTenantBySlugOrHistory("acme")).resolves.toMatchObject({
      tenant: { id: "tenant-a", slug: "acme" },
    });
  });

  it("returns redirect metadata for an unexpired old slug using the shared snake_case table", async () => {
    const { calls } = mockSupabase({
      tenants: [{ id: "tenant-a", slug: "new-acme", name: "Acme", plan: "PRO", status: "ACTIVE" }],
      tenant_slug_history: [
        {
          tenant_id: "tenant-a",
          old_slug: "old-acme",
          expires_at: "2999-01-01T00:00:00.000Z",
        },
      ],
      tenant_members: [],
    });

    await expect(getTenantBySlugOrHistory("old-acme")).resolves.toMatchObject({
      tenant: { id: "tenant-a", slug: "new-acme" },
      redirectToSlug: "new-acme",
    });

    expect(calls).toContainEqual({
      table: "tenant_slug_history",
      filters: expect.arrayContaining([{ op: "eq", column: "old_slug", value: "old-acme" }]),
    });
  });

  it("returns null for expired and unknown old slugs", async () => {
    mockSupabase({
      tenants: [{ id: "tenant-a", slug: "new-acme", name: "Acme", plan: "PRO", status: "ACTIVE" }],
      tenant_slug_history: [
        {
          tenant_id: "tenant-a",
          old_slug: "old-acme",
          expires_at: "2000-01-01T00:00:00.000Z",
        },
      ],
      tenant_members: [],
    });

    await expect(getTenantBySlugOrHistory("old-acme")).resolves.toBeNull();
    await expect(getTenantBySlugOrHistory("missing")).resolves.toBeNull();
  });
});
