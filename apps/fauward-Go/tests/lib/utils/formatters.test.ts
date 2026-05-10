import { describe, expect, it } from "vitest";
import { formatTimestamp, pluralize } from "@/lib/utils/formatters";

describe("formatTimestamp", () => {
  it("returns a friendly fallback for missing values", () => {
    expect(formatTimestamp()).toBe("Not available");
    expect(formatTimestamp("")).toBe("Not available");
  });

  it("formats timestamps for the field UI", () => {
    expect(formatTimestamp("2026-01-02T12:04:00.000Z")).toContain("2 Jan");
  });
});

describe("pluralize", () => {
  it("uses the singular label for one item", () => {
    expect(pluralize(1, "stop")).toBe("1 stop");
  });

  it("uses default and custom plural labels", () => {
    expect(pluralize(3, "stop")).toBe("3 stops");
    expect(pluralize(2, "box", "boxes")).toBe("2 boxes");
  });
});
