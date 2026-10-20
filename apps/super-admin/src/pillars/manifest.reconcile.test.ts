import fs from "node:fs";
import path from "node:path";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ComingSoonRoute, OpsRoute, consoleRoutes } from "@/console-routes";
import { PILLARS, SERVICES, findServiceForPath, navigableServices } from "./_manifests";

// D1 reconciliation gate. Check (d) — deferred services have no backend route — lands with route-index.ts in WP-1.1.

const PILLAR_PREFIXES = ["/platform", "/revenue", "/customer", "/trust", "/gtm"];
const routeObjects = [...consoleRoutes.map((route) => ({ path: route.path })), { path: "*" }];

function concrete(pattern: string) {
  return pattern.replace(/:[A-Za-z]+/g, "sample-id");
}

function resolve(pathname: string) {
  const matches = matchRoutes(routeObjects, concrete(pathname));
  return matches?.[matches.length - 1]?.route.path ?? null;
}

const routeByPath = new Map(consoleRoutes.map((route) => [route.path, route]));

describe("manifest reconciliation (D1)", () => {
  it("ACC-MAN-1 every manifest route and routes[] entry resolves to a registered, non-catch-all route", () => {
    const unresolved: string[] = [];
    for (const service of SERVICES) {
      for (const pathname of [service.route, ...service.routes]) {
        const matched = resolve(pathname);
        if (!matched || matched === "*") unresolved.push(`${service.key} ${pathname}`);
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("every registered pillar route belongs to exactly one manifest service", () => {
    const orphans: string[] = [];
    const duplicates: string[] = [];
    for (const route of consoleRoutes) {
      if (!PILLAR_PREFIXES.some((prefix) => route.path.startsWith(`${prefix}/`))) continue;
      const owners = SERVICES.filter((service) => service.routes.includes(route.path));
      if (owners.length === 0) orphans.push(route.path);
      if (owners.length > 1) duplicates.push(`${route.path}: ${owners.map((owner) => owner.key).join(", ")}`);
    }
    expect(orphans).toEqual([]);
    expect(duplicates).toEqual([]);
  });

  it("every live service has its own folder and no generic Ops page", () => {
    const pillarsDir = path.resolve(__dirname);
    for (const service of SERVICES.filter((item) => item.status === "live")) {
      expect(fs.existsSync(path.join(pillarsDir, service.pillar.id, service.id)), `${service.key} folder`).toBe(true);
      for (const pattern of service.routes) {
        const route = routeByPath.get(pattern);
        expect(route, `${service.key} ${pattern} registered`).toBeDefined();
        expect(route!.element.type, `${service.key} ${pattern} uses OpsRoute`).not.toBe(OpsRoute);
      }
    }
  });

  it("manifest statuses match the ADR 0002 Phase-0 snapshot", () => {
    expect(SERVICES).toHaveLength(41);
    expect(SERVICES.filter((service) => service.status === "live").map((service) => service.key)).toEqual(["trust.iam"]);
    expect(SERVICES.filter((service) => service.status === "deferred").map((service) => service.key).sort()).toEqual(["customer.kb", "revenue.recognition"]);
    for (const service of SERVICES.filter((item) => item.status === "preview")) {
      expect(service.note, `${service.key} names what is not wired`).toBeTruthy();
    }
    expect(SERVICES.find((service) => service.key === "trust.jit")?.requiredPermission).toBe("trust.jit.request");
  });

  it("ACC-MAN-4 deferred services render ComingSoonPage and are absent from navigation", () => {
    for (const service of SERVICES.filter((item) => item.status === "deferred")) {
      expect(service.livePhase).toBeNull();
      expect(routeByPath.get(service.route)?.element.type).toBe(ComingSoonRoute);
      expect(navigableServices(service.pillar).map((item) => item.id)).not.toContain(service.id);
    }
  });

  it("ACC-MAN-4 planned services without a page show ComingSoonPage with their phase and keep a preview entry", () => {
    const planned = ["platform.jobs", "platform.database", "revenue.disputes", "customer.feedback"];
    for (const key of planned) {
      const service = SERVICES.find((item) => item.key === key)!;
      expect(service.status).toBe("preview");
      expect(service.livePhase).not.toBeNull();
      expect(routeByPath.get(service.route)?.element.type).toBe(ComingSoonRoute);
      expect(navigableServices(service.pillar).map((item) => item.id)).toContain(service.id);
    }
  });

  it("findServiceForPath maps concrete paths to their owning service", () => {
    expect(findServiceForPath("/customer/360/tenant_123")?.key).toBe("customer.360");
    expect(findServiceForPath("/revenue/billing/invoices/inv_1")?.key).toBe("revenue.billing");
    expect(findServiceForPath("/platform/releases")?.key).toBe("platform.flags");
    expect(PILLARS.map((pillar) => navigableServices(pillar).length).reduce((a, b) => a + b, 0)).toBe(39);
  });
});
