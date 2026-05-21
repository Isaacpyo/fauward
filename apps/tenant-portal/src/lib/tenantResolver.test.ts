import { describe, expect, it } from "vitest";

import { resolvePathTenantSlug } from "./tenantResolver";

describe("tenant route resolver", () => {
  it("extracts tenant slugs from /t/:tenantSlug paths", () => {
    expect(resolvePathTenantSlug("/t/acme/dashboard")).toBe("acme");
    expect(resolvePathTenantSlug("/t/Acme-Logistics/settings")).toBe("acme-logistics");
  });

  it("returns null outside tenant-scoped paths", () => {
    expect(resolvePathTenantSlug("/login")).toBeNull();
    expect(resolvePathTenantSlug("/shipments")).toBeNull();
  });
});
