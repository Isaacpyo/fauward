import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ACC-C360-7 / ACC-TEN-9 gate: inside pillars/**, a tenant's name is only ever rendered through <TenantChip>, which
// links to Customer 360. Plain-text renders such as {row.tenant?.name} or {request.tenantName} fail the build.
// Template strings (dialog titles, notices passed as text) are not rendered tenant references and are ignored.

const PILLARS = path.resolve(__dirname, "../pillars");
const NAME_EXPRESSION = /\b(?:tenant\??\.name|tenantName|targetTenant\??\.name)\b/;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [full] : [];
  });
}

/** JSX expressions `{…}` that render a tenant name as a child (not an attribute value, not inside a template string). */
export function findPlainTenantNames(source: string) {
  const offenders: string[] = [];
  const expression = /\{([^{}]*)\}/g;
  for (const match of source.matchAll(expression)) {
    const body = match[1];
    if (!NAME_EXPRESSION.test(body)) continue;
    if (/^\s*\w+\??\s*:/.test(body)) continue; // object literal or type literal, not a rendered child
    const start = match.index ?? 0;
    const before = source.slice(Math.max(0, start - 1), start);
    if (before === "$") continue; // template literal `${tenant.name}`
    if (/[A-Za-z]=\s*$/.test(source.slice(Math.max(0, start - 30), start))) continue; // attribute value, e.g. name={tenant.name}
    if (/=>\s*$/.test(source.slice(Math.max(0, start - 10), start))) continue; // arrow-function body handled by its own JSX
    if (/<TenantChip\b[^>]*$/.test(source.slice(Math.max(0, start - 200), start))) continue;
    const line = source.slice(0, start).split("\n").length;
    offenders.push(`line ${line}: {${body.trim()}}`);
  }
  // Table cell renderers that return the name directly, e.g. cell: (row) => row.tenant?.name
  for (const match of source.matchAll(/=>\s*[\w?.]*(?:tenant\??\.name|tenantName)\b/g)) {
    const line = source.slice(0, match.index ?? 0).split("\n").length;
    offenders.push(`line ${line}: ${match[0]}`);
  }
  return offenders;
}

describe("TenantChip everywhere (ACC-C360-7)", () => {
  it("ACC-C360-7 pillar pages render tenant names only through TenantChip", () => {
    const offenders = files(PILLARS)
      .map((file) => [path.relative(PILLARS, file).replaceAll("\\", "/"), findPlainTenantNames(fs.readFileSync(file, "utf8"))] as const)
      .filter(([, found]) => found.length > 0)
      .map(([file, found]) => `${file}: ${found.join("; ")}`);
    expect(offenders).toEqual([]);
  });

  it("ACC-C360-7 self-test: a plain render is caught; chips, attributes and template strings are not", () => {
    expect(findPlainTenantNames(`<td>{row.tenant?.name ?? row.tenantId}</td>`)).toHaveLength(1);
    expect(findPlainTenantNames(`<span>{request.tenantName}</span>`)).toHaveLength(1);
    expect(findPlainTenantNames(`<TenantChip tenantId={row.tenant.id} name={row.tenant.name} />`)).toEqual([]);
    expect(findPlainTenantNames("title={`Suspend ${tenant.name}?`}")).toEqual([]);
    expect(findPlainTenantNames(`setDecision({ id: request.id, tenant: request.tenantName })`)).toEqual([]);
    expect(findPlainTenantNames(`{ id: "tenant", header: "Tenant", cell: (row) => row.tenant?.name ?? row.tenantId }`)).toHaveLength(1);
  });
});
