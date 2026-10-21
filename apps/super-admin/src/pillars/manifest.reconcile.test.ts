import fs from "node:fs";
import path from "node:path";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SERVICE_READ_PERMISSIONS } from "@fauward/internal-rbac";

import { ComingSoonRoute, OpsRoute, consoleRoutes } from "@/console-routes";
import { PILLARS, SERVICES, findServiceForPath, navigableServices } from "./_manifests";

// D1 reconciliation gate. Check (d) reads the backend's registered console routes from route-index.ts (kept equal to
// the real registrations by the backend rbac-matrix test).

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

function backendConsoleRoutes() {
  const file = path.resolve(__dirname, "../../../backend/src/modules/internal/route-index.ts");
  return [...fs.readFileSync(file, "utf8").matchAll(/'(GET|POST|PUT|PATCH|DELETE) (\/api\/internal\/[^']*)'/g)].map((match) => match[2]);
}

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
    // Folder names follow 20-service-catalogue.md; only customer.360 differs from its id (an id cannot start a word).
    const FOLDER: Record<string, string> = { "customer.360": "customer360" };
    for (const service of SERVICES.filter((item) => item.status === "live")) {
      expect(fs.existsSync(path.join(pillarsDir, service.pillar.id, FOLDER[service.key] ?? service.id)), `${service.key} folder`).toBe(true);
      for (const pattern of service.routes) {
        const route = routeByPath.get(pattern);
        expect(route, `${service.key} ${pattern} registered`).toBeDefined();
        expect(route!.element.type, `${service.key} ${pattern} uses OpsRoute`).not.toBe(OpsRoute);
      }
    }
  });

  it("manifest statuses match the services that met the definition of done (Phases 1–3)", () => {
    expect(SERVICES).toHaveLength(41);
    expect(SERVICES.filter((service) => service.status === "live").map((service) => service.key).sort()).toEqual(
      ["customer.360", "customer.comms", "customer.feedback", "customer.onboarding", "customer.qbr", "customer.success", "customer.support", "gtm.demos", "gtm.trials", "platform.database", "platform.flags", "platform.health", "platform.impersonation", "platform.incidents", "platform.integrations", "platform.jobs", "platform.queues", "platform.tenants", "revenue.analytics", "revenue.billing", "revenue.disputes", "revenue.dunning", "revenue.subscriptions", "revenue.tax", "trust.audit", "trust.compliance", "trust.iam", "trust.jit", "trust.kyc", "trust.safety", "trust.secrets", "trust.security"]
    );
    expect(SERVICES.filter((service) => service.status === "deferred").map((service) => service.key).sort()).toEqual(["customer.kb", "gtm.partners", "gtm.pricing", "revenue.commissions", "revenue.recognition"]);
    for (const service of SERVICES.filter((item) => item.status === "preview")) {
      expect(service.note, `${service.key} names what is not wired`).toBeTruthy();
    }
    expect(SERVICES.find((service) => service.key === "trust.jit")?.requiredPermission).toBe("trust.jit.request");
  });

  it("ACC-MAN-1 (d) every deferred service has no backend route under /api/internal/<service>", () => {
    const backend = backendConsoleRoutes();
    expect(backend.length).toBeGreaterThan(100);
    for (const service of SERVICES.filter((item) => item.status === "deferred")) {
      const prefix = `/api/internal/${service.id}`;
      expect(backend.filter((url) => url === prefix || url.startsWith(`${prefix}/`)), `${service.key} backend routes`).toEqual([]);
    }
  });

  it("ACC-MAN-4 deferred services render ComingSoonPage and are absent from navigation", () => {
    for (const service of SERVICES.filter((item) => item.status === "deferred")) {
      expect(service.livePhase).toBeNull();
      expect(routeByPath.get(service.route)?.element.type).toBe(ComingSoonRoute);
      expect(navigableServices(service.pillar).map((item) => item.id)).not.toContain(service.id);
    }
  });

  it("ACC-MAN-4 only deferred services use ComingSoonPage (every planned service has its page since WP-4.6)", () => {
    for (const route of consoleRoutes.filter((item) => item.element.type === ComingSoonRoute)) {
      const service = findServiceForPath(route.path);
      expect(service?.status, route.path).toBe("deferred");
    }
  });

  it("every service's requiredPermission matches the backend's activity visibility map (WP-2.1)", () => {
    const manifest = Object.fromEntries(SERVICES.map((service) => [service.key, service.requiredPermission]));
    expect(manifest).toEqual(SERVICE_READ_PERMISSIONS);
  });

  it("findServiceForPath maps concrete paths to their owning service", () => {
    expect(findServiceForPath("/customer/360/tenant_123")?.key).toBe("customer.360");
    expect(findServiceForPath("/revenue/billing/invoices/inv_1")?.key).toBe("revenue.billing");
    expect(findServiceForPath("/platform/releases")?.key).toBe("platform.flags");
    expect(PILLARS.map((pillar) => navigableServices(pillar).length).reduce((a, b) => a + b, 0)).toBe(36);
  });
});
