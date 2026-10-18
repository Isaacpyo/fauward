import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { NO_FAKE_DATA_ALLOWLIST, type FakeDataRule } from "./no-fake-data.allowlist";

// ACC-TP-2 gate (architecture §11): console service pages (pillars) never present invented data — no sample rows,
// "placeholder" copy, Math.random(), setTimeout used to fake work, or literal currency amounts. Input `placeholder=`
// attributes and Tailwind `placeholder:` variants are fine; only rendered strings are checked.

const ROOT = path.resolve(__dirname, "..");
const SCANNED = ["pillars"];
const STRING_OR_JSX_TEXT = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|>[^<>{}\n]+</g;

export function findFakeData(source: string): FakeDataRule[] {
  const found = new Set<FakeDataRule>();
  for (const line of source.split("\n")) {
    if (/\bsampleRows\b/.test(line)) found.add("sampleRows");
    if (/Math\.random\(/.test(line)) found.add("Math.random");
    if (/Promise\(\s*\(?\s*\w+\s*\)?\s*=>\s*(?:window\.)?setTimeout/.test(line)) found.add("simulated delay");
    for (const literal of line.match(STRING_OR_JSX_TEXT) ?? []) {
      if (/\bplaceholder\b/i.test(literal.replace(/placeholder:[^\s"'`]+/gi, ""))) found.add("placeholder text");
      if (/[£€₦]\s?\d|\$\d/.test(literal)) found.add("currency literal");
    }
  }
  return [...found];
}

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("no fake data in console pillars (ACC-TP-2)", () => {
  it("ACC-TP-2 pillars contain no sample rows, placeholder copy, random or simulated work, or currency literals", () => {
    const offenders = SCANNED.flatMap((dir) => files(path.join(ROOT, dir))).flatMap((file) => {
      const relative = path.relative(ROOT, file).replaceAll("\\", "/");
      return findFakeData(fs.readFileSync(file, "utf8"))
        .filter((rule) => !NO_FAKE_DATA_ALLOWLIST.some((entry) => entry.file === relative && entry.rule === rule))
        .map((rule) => `${relative}: ${rule}`);
    });
    expect(offenders).toEqual([]);
  });

  it("ACC-TP-2 every allowlist entry still matches a file that trips its rule (no stale exceptions)", () => {
    const stale = NO_FAKE_DATA_ALLOWLIST.filter((entry) => {
      const full = path.join(ROOT, entry.file);
      return !fs.existsSync(full) || !findFakeData(fs.readFileSync(full, "utf8")).includes(entry.rule);
    }).map((entry) => `${entry.file}: ${entry.rule}`);
    expect(stale).toEqual([]);
  });

  it("ACC-TP-2 self-test: the removed fakes are caught and legitimate code is not", () => {
    expect(findFakeData('const tracking = `FWD-${Math.floor(Math.random() * 90000)}`;')).toEqual(["Math.random"]);
    expect(findFakeData("await new Promise((resolve) => window.setTimeout(resolve, 900));")).toEqual(["simulated delay"]);
    expect(findFakeData('<p className="mt-3 text-lg font-semibold">£{option.price.toFixed(2)}</p>')).toEqual([]);
    expect(findFakeData('<p className="text-xs">Add shipment insurance for £4.50</p>')).toEqual(["currency literal"]);
    expect(findFakeData('description: "Up to £1,000"')).toEqual(["currency literal"]);
    expect(findFakeData("<p>Placeholder data until the API is wired</p>")).toEqual(["placeholder text"]);
    expect(findFakeData('<Input placeholder="Search shipments" className="placeholder:text-gray-400" />')).toEqual([]);
    expect(findFakeData("const sampleRows = [];")).toEqual(["sampleRows"]);
  });
});
