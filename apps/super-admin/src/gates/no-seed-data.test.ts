import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ACC-TEN-10 gate: console service pages show API data only — no generated tenant ids (t_1, t_2…), seed arrays or
// bulk-generated rows. Mock-only legacy components under components/admin are deleted in WP-1.6 and listed until then.

const ROOT = path.resolve(__dirname, "..");
const SCANNED = ["pillars", "shell", "components/service-kit"];
const LEGACY_UNTIL_WP_1_6 = new Set(["components/admin/QueueMessageViewer.tsx"]);
const PATTERNS: Array<[RegExp, string]> = [
  [/["'`]t_\d+/, "generated tenant id (t_N)"],
  [/\b\w*[sS]eeds?\b[^=\n]*=\s*(\[|Array\.from)/, "seed array"],
  [/Array\.from\(\{\s*length:\s*\d{2,}/, "bulk-generated rows"]
];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

export function findSeedData(source: string) {
  return PATTERNS.filter(([pattern]) => pattern.test(source)).map(([, label]) => label);
}

describe("no seed data in console pages (ACC-TEN-10)", () => {
  it("ACC-TEN-10 pillars, shell and the service kit contain no t_N ids, seed arrays or generated rows", () => {
    const offenders = SCANNED.flatMap((dir) => files(path.join(ROOT, dir)))
      .map((file) => [path.relative(ROOT, file).replaceAll("\\", "/"), findSeedData(fs.readFileSync(file, "utf8"))] as const)
      .filter(([file, found]) => found.length > 0 && !LEGACY_UNTIL_WP_1_6.has(file))
      .map(([file, found]) => `${file}: ${found.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("ACC-TEN-10 self-test: the old tenant list's seeds are caught", () => {
    expect(findSeedData('const tenantsSeed: TenantRow[] = Array.from({ length: 220 }).map(() => ({ id: "t_1" }));')).toEqual(["generated tenant id (t_N)", "seed array", "bulk-generated rows"]);
    expect(findSeedData('const rows = useTenantList(filters);')).toEqual([]);
  });
});
