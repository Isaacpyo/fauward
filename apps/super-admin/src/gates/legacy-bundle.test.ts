import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ACC-LEG-3 gate (WP-1.6): the module graph reachable from src/main.tsx — i.e. what Vite bundles — contains none of the
// deleted legacy admin modules, and the relay pages stay unrouted until WP-4.R.

const SRC = path.resolve(__dirname, "..");
const EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

const DELETED = [
  "router/index",
  "components/admin/ImpersonationBanner",
  "components/admin/ActivityFeed",
  "components/admin/AlertCard",
  "components/admin/MRRChart",
  "components/admin/MetricCard",
  "components/admin/ShipmentsChart",
  "components/admin/QueueMessageViewer",
  "components/admin/RevenueCharts",
  "components/admin/RelayNotificationCenter",
  "pages/admin/DashboardPage",
  "pages/admin/RelayPage",
  "pages/admin/SupportAuditPage",
  "lib/api",
  "lib/internal-api"
];
const UNROUTED_UNTIL_WP_4_R = "pillars/customer/support/relay/";

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null; // package import
  if (/\.(css|svg|png|json)$/.test(base)) return null;
  for (const extension of ["", ...EXTENSIONS]) {
    const candidate = base + extension;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Unresolved import ${specifier} in ${path.relative(SRC, from)}`);
}

export function importSpecifiers(source: string) {
  const specifiers = new Set<string>();
  for (const match of source.matchAll(/(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']/g)) specifiers.add(match[1]);
  for (const match of source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) specifiers.add(match[1]);
  for (const match of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specifiers.add(match[1]);
  return [...specifiers];
}

function reachableFrom(entry: string) {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importSpecifiers(fs.readFileSync(file, "utf8"))) {
      const resolved = resolveImport(file, specifier);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return [...seen].map((file) => path.relative(SRC, file).replaceAll("\\", "/").replace(/\.tsx?$/, ""));
}

describe("legacy admin is not in the console bundle (ACC-LEG-3)", () => {
  const graph = reachableFrom(path.join(SRC, "main.tsx"));

  it("ACC-LEG-3 the import graph from main.tsx reaches the shell and services but no deleted legacy module", () => {
    expect(graph).toContain("router");
    expect(graph).toContain("shell/ShellLayout");
    expect(graph).toContain("pillars/trust/audit/AuditLogPage");
    expect(graph.filter((file) => DELETED.includes(file))).toEqual([]);
    for (const file of DELETED) expect(EXTENSIONS.some((extension) => fs.existsSync(path.join(SRC, file + extension)))).toBe(false);
  });

  it("ACC-LEG-3 relay pages are kept but unrouted until WP-4.R", () => {
    expect(fs.existsSync(path.join(SRC, UNROUTED_UNTIL_WP_4_R, "RelayPage.tsx"))).toBe(true);
    expect(graph.filter((file) => file.startsWith(UNROUTED_UNTIL_WP_4_R))).toEqual([]);
  });

  it("ACC-LEG-3 no reachable module defines the legacy AdminLayout", () => {
    const offenders = graph.filter((file) => {
      const full = EXTENSIONS.map((extension) => path.join(SRC, file + extension)).find((candidate) => fs.existsSync(candidate)) ?? path.join(SRC, `${file}.tsx`);
      return fs.existsSync(full) && /function AdminLayout\b/.test(fs.readFileSync(full, "utf8"));
    });
    expect(offenders).toEqual([]);
  });

  it("ACC-LEG-3 self-test: static, re-export, dynamic and side-effect imports are followed", () => {
    expect(importSpecifiers('import { a } from "@/x";\nexport * from "./y";\nconst z = import("./z");\nimport "./side.css";').sort()).toEqual(["./side.css", "./y", "./z", "@/x"]);
  });
});
