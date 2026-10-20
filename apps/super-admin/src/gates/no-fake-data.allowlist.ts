/**
 * Legitimate or scheduled exceptions to the no-fake-data gate (architecture §11). Every entry names the file, the rule
 * it trips and why it is allowed. Entries that name a work package must be removed by that WP.
 */
export type FakeDataRule = "sampleRows" | "placeholder text" | "Math.random" | "simulated delay" | "currency literal";

// WP-3.9: empty. The gate runs over all of apps/super-admin/src with no exceptions; add an entry only with a reason.
export const NO_FAKE_DATA_ALLOWLIST: Array<{ file: string; rule: FakeDataRule; reason: string }> = [];
